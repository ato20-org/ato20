import {
  entraNaSoma,
  textoDoResultado,
  tipoDado,
  valorDaRolagem,
  type FacesDado,
} from "@/types/dado";
import { parseMencoes, type Token } from "@/lib/mencoes/texto";
import type {
  AutorDoFio,
  LinhaDoFio,
  RegistroDoFio,
  RolagemNoFio,
} from "@/types/fio";

/**
 * Quantas linhas uma tela guarda.
 *
 * O daemon reenvia as últimas duzentas a quem conecta (`FIO_REPLAY`), e a tela
 * não passa disso durante a sessão: a lista nunca renderiza a campanha
 * inteira. A memória inteira continua no `chat.jsonl`.
 */
export const LINHAS_NA_TELA = 200;

/** O teto do texto, igual ao do daemon (`fio::MAX_TEXTO`). */
export const MAX_TEXTO_DO_FIO = 2_000;

/**
 * Os marcadores do chat: só `@personagem`.
 *
 * O mesmo `@` do postit do Mestre e do caderno do jogador, e pela mesma regra
 * (`lib/mencoes/texto.ts`): por NOME, até o espaço, com aspas para nome
 * composto. Fica no texto como foi digitado, e o daemon não sabe que existe —
 * a linha do `chat.jsonl` continua sendo texto.
 *
 * Sem `/arquivo` e `#nota`: os arquivos e as notas são de cada um, e uma menção
 * que só resolve na tela de quem a escreveu é um link quebrado na de todos os
 * outros. O personagem é da mesa.
 */
export const SINAIS_DO_CHAT = { "@": "personagem" } as const;

export const SINAIS_DO_CHAT_EM_ORDEM = Object.keys(
  SINAIS_DO_CHAT,
) as (keyof typeof SINAIS_DO_CHAT)[];

/** O texto de uma linha, em pedaços: texto, negrito, quebra e `@personagem`. */
export function parseDoChat(texto: string): Array<Token<"personagem">> {
  return parseMencoes(texto, SINAIS_DO_CHAT);
}

/** O que uma tela sabe do fio. */
export type EstadoDoFio = {
  /** O que a tela mostra, na ordem do fio. */
  linhas: LinhaDoFio[];
  /**
   * O replay já acabou? Antes disso, o que chega é o que JÁ estava no fio; depois,
   * é o que acontece agora — e só isso anima dado e conta como não lido.
   */
  pronto: boolean;
  /**
   * O replay em andamento, que SUBSTITUI `linhas` quando o `pronto` chegar.
   * `null` fora do replay.
   *
   * Substitui, e não se junta. A reconexão traz as últimas linhas de novo, e o
   * replay é a verdade do daemon: a linha que o Mestre apagou enquanto o
   * celular estava fora do Wi-Fi não está nele, e juntar a deixaria na tela.
   * Até o `pronto`, a lista antiga fica de pé — limpar no `onerror` piscaria a
   * conversa inteira a cada soluço da rede.
   */
  chegando: LinhaDoFio[] | null;
};

export const FIO_VAZIO: EstadoDoFio = { linhas: [], pronto: false, chegando: [] };

/** O fluxo caiu e vai reconectar: o que vier até o `pronto` é replay. */
export function recomecarFio(estado: EstadoDoFio): EstadoDoFio {
  return { ...estado, pronto: false, chegando: [] };
}

/**
 * Monta a linha a partir do registro, em vez de guardar o registro: o `tipo` é
 * do envelope, e um campo novo que o daemon mande não entra na tela sem passar
 * aqui.
 */
function linhaDe(registro: Extract<RegistroDoFio, { tipo: "linha" }>): LinhaDoFio {
  return {
    id: registro.id,
    quando: registro.quando,
    autor: registro.autor,
    para: registro.para,
    texto: registro.texto,
    rolagem: registro.rolagem,
  };
}

function acrescenta(linhas: LinhaDoFio[], linha: LinhaDoFio): LinhaDoFio[] {
  // O id é a identidade, e vem do daemon: reentrega não vira duas linhas.
  if (linhas.some((atual) => atual.id === linha.id)) return linhas;

  return [...linhas, linha].slice(-LINHAS_NA_TELA);
}

/**
 * Aplica um evento do fluxo.
 *
 * Devolve o MESMO objeto quando nada muda, para quem assina não redesenhar.
 */
export function aplicarNoFio(
  estado: EstadoDoFio,
  registro: RegistroDoFio,
): EstadoDoFio {
  switch (registro.tipo) {
    case "pronto":
      if (estado.pronto) return estado;
      return {
        linhas: estado.chegando ?? estado.linhas,
        pronto: true,
        chegando: null,
      };

    case "apagada": {
      const fora = (linha: LinhaDoFio) => linha.id !== registro.alvo;
      const linhas = estado.linhas.filter(fora);
      const chegando = estado.chegando?.filter(fora) ?? null;

      const mudou =
        linhas.length !== estado.linhas.length ||
        (chegando?.length ?? 0) !== (estado.chegando?.length ?? 0);

      return mudou ? { ...estado, linhas, chegando } : estado;
    }

    case "linha": {
      const linha = linhaDe(registro);

      if (estado.chegando) {
        const chegando = acrescenta(estado.chegando, linha);
        return chegando === estado.chegando ? estado : { ...estado, chegando };
      }

      const linhas = acrescenta(estado.linhas, linha);
      return linhas === estado.linhas ? estado : { ...estado, linhas };
    }
  }
}

/**
 * A soma da rolagem: o que entra na soma, mais o modificador. `null` quando
 * nada soma — a moeda sozinha não é número.
 */
export function totalDaRolagem(rolagem: RolagemNoFio): number | null {
  const somam = rolagem.dados.filter((dado) => entraNaSoma(dado.faces));
  if (somam.length === 0) return null;

  return (
    somam.reduce((soma, dado) => soma + valorDaRolagem(dado.faces, dado.valor), 0) +
    (rolagem.modificador ?? 0)
  );
}

/**
 * A notação do que foi jogado: `2d6+1d4+3`. Os dados iguais se juntam, na ordem
 * em que apareceram.
 */
export function notacaoDaRolagem(rolagem: RolagemNoFio): string {
  const contagem = new Map<FacesDado, number>();
  for (const dado of rolagem.dados)
    contagem.set(dado.faces, (contagem.get(dado.faces) ?? 0) + 1);

  const partes = [...contagem].map(([faces, quantos]) => {
    const nome = tipoDado(faces).nome;
    // "d20", "Moeda": o nome do saquinho, com a quantidade na frente quando há
    // mais de um. A moeda não vira "1Moeda".
    if (faces === 2) return quantos === 1 ? nome : `${quantos} moedas`;
    return `${quantos}${nome}`;
  });

  const modificador = rolagem.modificador ?? 0;
  const sinal =
    modificador > 0 ? `+${modificador}` : modificador < 0 ? `${modificador}` : "";

  return partes.join("+") + sinal;
}

/**
 * A rolagem em pedaços, para a tela destacar o resultado: "Ataque", "1d20+3",
 * "17".
 *
 * O resultado de um dado só é o `textoDoResultado` dele — o d10 no zero lê
 * dez, a moeda lê "Cara" —, e não o número cru. Vários dados somam; vários sem
 * soma (só moedas) leem cada um.
 */
export function partesDaRolagem(rolagem: RolagemNoFio): {
  rotulo?: string;
  notacao: string;
  resultado: string;
} {
  const [unico] = rolagem.dados;
  const resultado =
    rolagem.dados.length === 1 && !rolagem.modificador
      ? textoDoResultado(unico.faces, unico.valor)
      : (totalDaRolagem(rolagem)?.toString() ??
        rolagem.dados
          .map((dado) => textoDoResultado(dado.faces, dado.valor))
          .join(", "));

  return {
    rotulo: rolagem.rotulo,
    notacao: notacaoDaRolagem(rolagem),
    resultado,
  };
}

/** A rolagem numa linha: "Ataque: 1d20+3 = 17". */
export function textoDaRolagem(rolagem: RolagemNoFio): string {
  const { rotulo, notacao, resultado } = partesDaRolagem(rolagem);

  return `${rotulo ? `${rotulo}: ` : ""}${notacao} = ${resultado}`;
}

/** Quem está lendo o fio. O sussurro se escreve diferente para cada um. */
export type LeitorDoFio = { tipo: "mestre" } | { tipo: "jogador"; id: string };

/**
 * O aviso do sussurro, do ponto de vista de quem lê. `null` = linha aberta.
 *
 * "Só o Mestre" serve aos dois lados: o jogador que mandou sabe que ninguém
 * mais vê, e o Mestre sabe que aquilo não está na mesa — que é o que ele
 * precisa saber antes de responder em voz alta.
 */
export function avisoDoSussurro(
  linha: LinhaDoFio,
  leitor: LeitorDoFio,
): string | null {
  const para = linha.para;
  if (!para) return null;
  if (para.tipo === "mestre") return "só o Mestre";
  if (leitor.tipo === "jogador" && leitor.id === para.id) return "só para você";

  return `para ${para.nome}`;
}

/**
 * Quanto tempo duas linhas seguidas da mesma pessoa contam como uma fala só, e
 * dividem o cabeçalho.
 */
const MESMA_FALA_MS = 3 * 60_000;

function chaveDoAutor(autor: AutorDoFio): string {
  return autor.tipo === "mestre" ? "mestre" : `${autor.tipo}:${autor.id}`;
}

/**
 * Esta linha continua a anterior? Mesma pessoa, mesmo destino, pouco tempo
 * entre as duas — e no mesmo dia, porque a troca de dia ganha divisória.
 */
export function continuaAnterior(
  linha: LinhaDoFio,
  anterior: LinhaDoFio | undefined,
): boolean {
  if (!anterior) return false;

  return (
    chaveDoAutor(linha.autor) === chaveDoAutor(anterior.autor) &&
    JSON.stringify(linha.para ?? null) === JSON.stringify(anterior.para ?? null) &&
    linha.quando - anterior.quando < MESMA_FALA_MS &&
    mesmoDia(linha.quando, anterior.quando)
  );
}

export function mesmoDia(a: number, b: number): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

/** Como o autor aparece na linha. */
export function nomeDoAutor(autor: AutorDoFio): string {
  return autor.tipo === "mestre" ? "Mestre" : autor.nome;
}

/**
 * O gravado de um valor de soma — o caminho inverso do `valorDaRolagem`.
 *
 * Existe para o plugin: `api.dados.rolar` devolve o que a mesa SOMA (o d10 no
 * zero vale dez), e o fio guarda o gravado, como toda rolagem da casa.
 */
export function gravadoDoValor(faces: FacesDado, valor: number): number {
  return faces === 10 && valor === 10 ? 0 : valor;
}

/**
 * A rolagem de jogador que ainda está caindo NESTA tela não mostra o número.
 *
 * O daemon grava a linha no instante em que sorteia, que é um ou dois segundos
 * antes de o dado pousar no celular de quem rolou. O fio que escrevesse o
 * resultado na chegada contaria o final antes da animação — o mesmo cuidado da
 * bandeja, com a mesma conta. Só a do JOGADOR: a do Mestre e a do plugin só
 * entram no fio depois de caírem.
 */
export function caiAoChegar(linha: LinhaDoFio): boolean {
  return linha.autor.tipo === "jogador" && linha.rolagem !== undefined;
}
