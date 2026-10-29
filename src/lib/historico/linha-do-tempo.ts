import { normaliza } from "@/lib/search";
import type {
  Marco,
  MarcoApagado,
  MarcoEditado,
  RegistroDoHistorico,
} from "@/types/historico";
import type { LinhaDoFio } from "@/types/fio";

/**
 * A linha do tempo da campanha: o histórico e o fio, intercalados pela hora,
 * em sessões. Pura, para o teste -- quem desenha é `HistoricoBody`.
 */

/**
 * Quanto tempo SEM NADA separa uma sessão da outra.
 *
 * Pela pausa, e não pela abertura do aplicativo: abrir três vezes na mesma
 * noite -- ou reabrir depois de travar -- continua sendo uma sessão só, e a
 * mesa que passa da meia-noite não vira duas. Seis horas separam a noite de
 * sábado da tarde de domingo, e não separam o intervalo da pizza.
 */
export const PAUSA_ENTRE_SESSOES = 6 * 60 * 60 * 1000;

/** O marco como a tela o mostra: o texto da última edição. */
export type MarcoExibido = Marco & { editadoEm?: number };

/** O que aparece na linha do tempo: tudo menos as edições, que já foram aplicadas. */
export type Acontecimento =
  | Exclude<RegistroDoHistorico, Marco | MarcoEditado | MarcoApagado>
  | MarcoExibido;

export type Entrada =
  | { tipo: "registro"; id: string; quando: number; registro: Acontecimento }
  | { tipo: "fio"; id: string; quando: number; linha: LinhaDoFio };

/**
 * Os marcos com a última edição aplicada, e sem os apagados.
 *
 * O arquivo é só de acréscimo: editar é uma linha `editado` apontando para o
 * marco, apagar é uma `apagado`. O marco fica na hora em que foi escrito -- é
 * ALI que ele aconteceu --, só o texto muda.
 */
export function resolver(registros: readonly RegistroDoHistorico[]): Acontecimento[] {
  const edicoes = new Map<string, MarcoEditado>();
  const apagados = new Set<string>();

  for (const registro of registros) {
    if (registro.tipo === "editado") edicoes.set(registro.alvo, registro);
    else if (registro.tipo === "apagado") apagados.add(registro.alvo);
  }

  const saida: Acontecimento[] = [];
  for (const registro of registros) {
    if (registro.tipo === "editado" || registro.tipo === "apagado") continue;
    if (apagados.has(registro.id)) continue;

    if (registro.tipo !== "marco") {
      saida.push(registro);
      continue;
    }

    const edicao = edicoes.get(registro.id);
    saida.push(edicao ? { ...registro, texto: edicao.texto, editadoEm: edicao.quando } : registro);
  }

  return saida;
}

/**
 * O histórico e o fio numa lista só, pela hora.
 *
 * Cada um ordenado pela hora antes, e não pela ordem do arquivo: o escriba
 * grava a vida que caiu só depois de ela parar de mudar (ver `juntarMedidor`),
 * com a hora em que ela COMEÇOU a cair -- e no arquivo ela fica depois do que
 * aconteceu nesse meio tempo. A ordenação é estável: na mesma hora, vale a do
 * arquivo. Depois, mesclados, e na mesma hora o acontecimento vem antes da
 * fala -- o golpe e depois o "acertei!".
 */
export function linhaDoTempo(
  registros: readonly RegistroDoHistorico[],
  fio: readonly LinhaDoFio[],
): Entrada[] {
  const pelaHora = (a: { quando: number }, b: { quando: number }) => a.quando - b.quando;

  const deUm: Entrada[] = [...resolver(registros)].sort(pelaHora).map((registro) => ({
    tipo: "registro",
    id: registro.id,
    quando: registro.quando,
    registro,
  }));
  const deOutro: Entrada[] = [...fio].sort(pelaHora).map((linha) => ({
    tipo: "fio",
    id: linha.id,
    quando: linha.quando,
    linha,
  }));

  const saida: Entrada[] = [];
  let a = 0;
  let b = 0;
  while (a < deUm.length || b < deOutro.length) {
    const doHistorico = deUm[a];
    const doFio = deOutro[b];
    if (doHistorico && (!doFio || doHistorico.quando <= doFio.quando)) {
      saida.push(doHistorico);
      a++;
    } else {
      saida.push(doFio!);
      b++;
    }
  }

  return saida;
}

export type Sessao = {
  /** O id da primeira entrada: estável enquanto a sessão não ganha começo. */
  id: string;
  inicio: number;
  fim: number;
  entradas: Entrada[];
};

/** A linha do tempo cortada nas pausas. Ver `PAUSA_ENTRE_SESSOES`. */
export function emSessoes(
  entradas: readonly Entrada[],
  pausa: number = PAUSA_ENTRE_SESSOES,
): Sessao[] {
  const sessoes: Sessao[] = [];

  for (const entrada of entradas) {
    const atual = sessoes.at(-1);
    if (atual && entrada.quando - atual.fim < pausa) {
      atual.entradas.push(entrada);
      atual.fim = Math.max(atual.fim, entrada.quando);
    } else {
      sessoes.push({
        id: entrada.id,
        inicio: entrada.quando,
        fim: entrada.quando,
        entradas: [entrada],
      });
    }
  }

  return sessoes;
}

/** Os filtros da janela. Ver `categoriaDe`. */
export const CATEGORIAS = [
  "marcos",
  "cenas",
  "combate",
  "personagens",
  "itens",
  "mostrado",
  "chat",
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

export function categoriaDe(entrada: Entrada): Categoria {
  if (entrada.tipo === "fio") return "chat";

  switch (entrada.registro.tipo) {
    case "marco":
      return "marcos";
    case "cena":
      return "cenas";
    case "combate":
      return "combate";
    // O efeito disparado é golpe: mora com o combate em que costuma cair.
    case "disparo":
      return "combate";
    case "medidor":
    case "condicao":
      return "personagens";
    case "item":
      return "itens";
    case "mostrado":
      return "mostrado";
  }
}

/** A entrada fala deste personagem? Pelo id, que sobrevive à troca de nome. */
export function citaPersonagem(entrada: Entrada, personagemId: string): boolean {
  if (entrada.tipo === "fio") return false;

  const registro = entrada.registro;
  switch (registro.tipo) {
    case "medidor":
      return registro.personagemId === personagemId;
    case "condicao":
      return registro.alvo === "personagem" && registro.alvoId === personagemId;
    case "item":
      return (
        "personagemId" in registro &&
        (registro.personagemId === personagemId || registro.deId === personagemId)
      );
    case "disparo":
      return registro.deId === personagemId || registro.emId === personagemId;
    default:
      return false;
  }
}

export type Filtro = {
  /** As categorias à vista. Vazio = todas. */
  categorias: ReadonlySet<Categoria>;
  personagemId: string | null;
  busca: string;
};

/**
 * As entradas que passam no filtro. `texto` é a frase que a tela mostra -- é
 * nela que a busca procura, e não nos campos crus: quem digita "vida" quer
 * achar a linha que DIZ vida.
 */
export function filtrar(
  entradas: readonly Entrada[],
  filtro: Filtro,
  texto: (entrada: Entrada) => string,
): Entrada[] {
  const termo = normaliza(filtro.busca.trim());

  return entradas.filter(
    (entrada) =>
      (filtro.categorias.size === 0 || filtro.categorias.has(categoriaDe(entrada))) &&
      (!filtro.personagemId || citaPersonagem(entrada, filtro.personagemId)) &&
      (!termo || normaliza(texto(entrada)).includes(termo)),
  );
}
