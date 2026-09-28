import { sementeDaLuz } from "@/lib/geometry/luz";
import {
  EFEITOS_NA_FIGURA,
  type Condicao,
  type EfeitoNaFigura,
} from "@/types/character";

/**
 * As contas de uma condição, fora de qualquer componente.
 *
 * Aqui pela razão de `medidor.ts`: quatro telas leem a mesma condição — a
 * ficha, o palco do mestre, a TV e o celular —, e conta pura se confere sem
 * palco montado.
 */

/**
 * As condições que a mesa pode ver.
 *
 * A lista chega já filtrada do daemon e do publicador, que é onde a decisão
 * vale. Esta é a mesma regra dita do lado que desenha, para o palco do Mestre
 * pedir a lista inteira e ainda saber quais selos a TV enxerga.
 */
export function condicoesVisiveis(
  condicoes: ReadonlyArray<Condicao> | undefined,
): Condicao[] {
  return (condicoes ?? []).filter((condicao) => !condicao.escondido);
}

/** Um efeito na figura, com a cor de quem o pediu. */
export type EfeitoPedido = { efeito: EfeitoNaFigura; cor: string };

/**
 * O que a figura mostra, dadas as condições dela.
 *
 * UM de cada efeito: duas condições que tingem — veneno e gelo — não viram
 * um verde-azulado que ninguém escolheu. Vence a PRIMEIRA da lista, e a ordem
 * é a que o mestre arruma na ficha; é o mesmo gesto que ordena os selos.
 *
 * Os ESCONDIDOS ficam de fora sempre, inclusive no palco do Mestre. O selo
 * escondido aparece apagado para ele, mas o efeito não: uma figura tingida no
 * palco dele diria "a mesa está vendo isto", e ela não está.
 *
 * Efeito que esta versão não conhece — o quadro de uma versão futura — é
 * ignorado, e a condição continua valendo como selo.
 */
export function efeitosDaFigura(
  condicoes: ReadonlyArray<Condicao> | undefined,
): EfeitoPedido[] {
  const saida: EfeitoPedido[] = [];

  for (const condicao of condicoes ?? []) {
    const efeito = condicao.efeito;
    if (condicao.escondido || !efeito) continue;
    if (!EFEITOS_NA_FIGURA.includes(efeito)) continue;
    if (saida.some((pedido) => pedido.efeito === efeito)) continue;

    saida.push({ efeito, cor: condicao.cor });
  }

  return saida;
}

/** Os efeitos de um personagem, para as telas que não têm o índice. */
export type EfeitosDoPersonagem = {
  personagemId: string;
  efeitos: EfeitoPedido[];
};

/**
 * Os efeitos de quem tem token nesta cena.
 *
 * Um caminho SEPARADO de `fichasDaCena`, e é o ponto. Aquela lista sai vazia
 * com a informação dos tokens desligada, porque ela carrega o NOME, e o nome
 * de um PNJ que o mestre não apresentou não atravessa a rede. O efeito não
 * conta nada que a própria figura não mostre — o token tingido de verde é o
 * token, e a mesa já o vê —, então ele viaja sempre, e sem nome nenhum.
 *
 * Só quem tem algum efeito entra: a horda sem condição nenhuma não custa um
 * byte no quadro publicado dez vezes por segundo.
 */
export function efeitosDaCena(
  itens: ReadonlyArray<{ personagemId?: string }>,
  personagens: ReadonlyArray<{ id: string; condicoes?: Condicao[] }>,
): EfeitosDoPersonagem[] {
  const porId = new Map(personagens.map((personagem) => [personagem.id, personagem]));
  const vistos = new Set<string>();
  const saida: EfeitosDoPersonagem[] = [];

  for (const item of itens) {
    const personagemId = item.personagemId;
    if (!personagemId || vistos.has(personagemId)) continue;
    vistos.add(personagemId);

    const efeitos = efeitosDaFigura(porId.get(personagemId)?.condicoes);
    if (efeitos.length > 0) saida.push({ personagemId, efeitos });
  }

  return saida;
}

/**
 * O nome como ele é comparado: sem caixa e sem espaço nas pontas. A mesma
 * conta de `chave_do_nome`, no Rust -- divergir aqui faria o menu marcar uma
 * condição que o disco não reconhece.
 */
export function chaveDoNome(nome: string): string {
  return nome.trim().toLowerCase();
}

/**
 * O personagem tem esta condição? Pelo NOME, como o Rust decide.
 *
 * É a pergunta do menu do token: "Envenenado" do cardápio acha o
 * "envenenado" que a ficha já tinha. Ver `alternar_condicao`.
 */
export function temCondicao(
  condicoes: ReadonlyArray<Condicao> | undefined,
  nome: string,
): boolean {
  const chave = chaveDoNome(nome);
  return (condicoes ?? []).some((condicao) => chaveDoNome(condicao.nome) === chave);
}

/**
 * Quanto do ciclo a animação desta figura já andou, em segundos negativos.
 *
 * Vai para o `animation-delay`. Negativo e não positivo: o positivo esperaria
 * antes de começar, e a figura ficaria parada o primeiro segundo; o negativo
 * entra no meio do ciclo. Tirado do id pela conta da luz, e pela mesma razão
 * dela: cinco goblins envenenados respirando em uníssono leem como um
 * pisca-pisca, e não como cinco corpos.
 */
export function faseDaFigura(id: string, periodo: number): string {
  const fracao = sementeDaLuz(id) / 4_294_967_296;
  return `${(-fracao * periodo).toFixed(3)}s`;
}

/** Como o seletor chama cada efeito. */
export const NOME_DO_EFEITO: Record<EfeitoNaFigura, string> = {
  aura: "Aura",
  tingido: "Tingido",
  translucido: "Translúcido",
  tremendo: "Tremendo",
  apagado: "Apagado",
};

/** Uma linha para cada efeito, dizendo para que ele serve. */
export const DICA_DO_EFEITO: Record<EfeitoNaFigura, string> = {
  aura: "Um halo na cor da condição, atrás da figura.",
  tingido: "A figura ganha a cor da condição por cima.",
  translucido: "Meio transparente, tremulando.",
  tremendo: "A figura treme no lugar.",
  apagado: "Cinza e escura.",
};

/** O que uma sugestão cria. É uma condição sem id. */
export type SugestaoDeCondicao = Omit<Condicao, "id" | "escondido">;

/**
 * O cardápio de partida, para quem aperta "Usar sugestões".
 *
 * Um GESTO, e não o que a campanha nova traz de fábrica: inventar condições
 * que ninguém pediu seria escolher o sistema da mesa pelo mestre. Os nomes são
 * os que atravessam sistemas — todo jogo tem alguém caído e alguém envenenado
 * —, e cada um mostra um efeito, para o mestre ver os cinco na primeira sessão.
 */
export const SUGESTOES: SugestaoDeCondicao[] = [
  { nome: "Envenenado", cor: "#22c55e", icone: "frasco", efeito: "tingido" },
  { nome: "Em chamas", cor: "#f59e0b", icone: "chama", efeito: "aura" },
  { nome: "Congelado", cor: "#3b82f6", icone: "floco", efeito: "tingido" },
  { nome: "Invisível", cor: "#ffffff", icone: "fantasma", efeito: "translucido" },
  { nome: "Atordoado", cor: "#f59e0b", icone: "raio", efeito: "tremendo" },
  { nome: "Com medo", cor: "#a855f7", icone: "medo", efeito: "tremendo" },
  { nome: "Abençoado", cor: "#f59e0b", icone: "brilho", efeito: "aura" },
  { nome: "Caído", cor: "#ef4444", icone: "cama", efeito: "apagado" },
];
