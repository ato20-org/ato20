import { efeitoValido } from "@/lib/efeitos";
import { sementeDaLuz } from "@/lib/geometry/luz";
import {
  MAX_CONDICOES,
  type Condicao,
  type PatchCondicao,
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

/**
 * Um efeito na figura, com a cor de quem o pediu. O `efeito` é um id do
 * catálogo -- ver `definicaoDoEfeito`.
 */
export type EfeitoPedido = { efeito: string; cor: string };

/**
 * O que a figura mostra, dadas as condições dela.
 *
 * SÓ O ÚLTIMO efeito: duas condições que mexem na figura -- o veneno que tinge
 * e o fogo que arde -- empilhadas viram uma bagunça que ninguém lê de longe.
 * Vale a última condição da lista com efeito, que é a última adicionada: as
 * novas entram no fim. O mestre que quiser outra reordena a ficha, o mesmo
 * gesto que ordena os selos.
 *
 * Lista, e não um valor só, de propósito: voltar a compor efeitos é mudar
 * esta regra, e mais nada -- quem desenha já junta o que receber. Ver
 * `FiguraComEfeitos`.
 *
 * Os ESCONDIDOS ficam de fora sempre, inclusive no palco do Mestre. O selo
 * escondido aparece apagado para ele, mas o efeito não: uma figura tingida no
 * palco dele diria "a mesa está vendo isto", e ela não está. E um escondido
 * não tampa o efeito de quem veio antes dele, pela mesma razão.
 *
 * Não consulta o catálogo: o efeito de um plugin que esta tela não tem vence
 * do mesmo jeito, e ali desenha só o selo. Escolher outro conforme a tela
 * faria a TV e o Mestre mostrarem efeitos diferentes para a mesma ficha.
 */
export function efeitosDaFigura(
  condicoes: ReadonlyArray<Condicao> | undefined,
): EfeitoPedido[] {
  const lista = condicoes ?? [];

  for (let i = lista.length - 1; i >= 0; i--) {
    const condicao = lista[i]!;
    if (condicao.escondido || !condicao.efeito) continue;

    return [{ efeito: condicao.efeito, cor: condicao.cor }];
  }

  return [];
}

/**
 * Os efeitos de um OBJETO, pelas condições dele -- a mesma regra do token.
 *
 * Guardado pela lista: o `CanvasItemView` é `memo`, e um array novo a cada
 * render do palco redesenharia todo barril em chamas a cada quadro. A cena é
 * imutável, então a lista do item é a mesma até alguém mexer nela.
 */
const efeitosDosObjetos = new WeakMap<ReadonlyArray<Condicao>, EfeitoPedido[]>();

export function efeitosDoObjeto(
  condicoes: ReadonlyArray<Condicao> | undefined,
): EfeitoPedido[] | undefined {
  if (!condicoes?.length) return undefined;

  let efeitos = efeitosDosObjetos.get(condicoes);
  if (!efeitos) {
    efeitos = efeitosDaFigura(condicoes);
    efeitosDosObjetos.set(condicoes, efeitos);
  }

  return efeitos;
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

/** O que uma sugestão cria. É uma condição sem id. */
export type SugestaoDeCondicao = Omit<Condicao, "id" | "escondido">;

/**
 * O cardápio de partida, para quem aperta "Usar sugestões".
 *
 * Um GESTO, e não o que a campanha nova traz de fábrica: inventar condições
 * que ninguém pediu seria escolher o sistema da mesa pelo mestre. Só as que
 * têm efeito de FÁBRICA -- "Em chamas", "Congelado", "Envenenado",
 * "Sangrando", "Molhado": são o que o ATO20 traz, e é por elas que o mestre
 * descobre a engrenagem. As outras ele cria com o nome que o sistema dele
 * usa.
 */
export const SUGESTOES: SugestaoDeCondicao[] = [
  { nome: "Em chamas", cor: "#f59e0b", icone: "chama", efeito: "chamas" },
  { nome: "Congelado", cor: "#3b82f6", icone: "floco", efeito: "congelado" },
  { nome: "Envenenado", cor: "#22c55e", icone: "veneno", efeito: "envenenado" },
  { nome: "Sangrando", cor: "#dc2626", icone: "sangue", efeito: "sangrando" },
  { nome: "Molhado", cor: "#0ea5e9", icone: "gota", efeito: "molhado" },
];

/** O teto do nome. Espelha `MAX_NOME_CONDICAO`. */
export const MAX_NOME_CONDICAO = 24;

/** O teto do nome do ícone. Espelha `MAX_ICONE`. */
const MAX_ICONE = 32;

/** O ícone de quem chegou sem nenhum. Espelha `ICONE_PADRAO`. */
const ICONE_PADRAO = "circulo";

/**
 * A condição em forma: nome curto e nunca vazio, ícone curto e nunca vazio,
 * efeito sem forma de id vira só o selo.
 *
 * Espelho de `ajustar_condicao`, no Rust, para a condição de OBJETO: ela mora
 * na cena e não passa por ele. As duas contas divergindo fariam o mesmo
 * "Envenenado" do cardápio virar coisas diferentes no goblin e no barril.
 */
export function ajustarCondicao(condicao: Condicao): Condicao {
  const nome = [...condicao.nome.trim()].slice(0, MAX_NOME_CONDICAO).join("");
  const icone = [...condicao.icone.trim()].slice(0, MAX_ICONE).join("");
  const efeito = condicao.efeito?.trim();
  const ajustada: Condicao = {
    ...condicao,
    nome: nome || "Condição",
    icone: icone || ICONE_PADRAO,
  };

  if (efeito && efeitoValido(efeito)) ajustada.efeito = efeito;
  else delete ajustada.efeito;

  return ajustada;
}

/** O patch aplicado e posto em forma. Espelho de `PatchCondicao::aplicar`. */
export function aplicarPatch(condicao: Condicao, patch: PatchCondicao): Condicao {
  const nova: Condicao = { ...condicao };

  if (patch.nome !== undefined) nova.nome = patch.nome;
  if (patch.cor !== undefined) nova.cor = patch.cor;
  if (patch.icone !== undefined) nova.icone = patch.icone;
  if (patch.efeito === null) delete nova.efeito;
  else if (patch.efeito !== undefined) nova.efeito = patch.efeito;
  if (patch.escondido !== undefined) nova.escondido = patch.escondido;

  return ajustarCondicao(nova);
}

/**
 * Liga ou desliga uma condição do cardápio numa lista, pelo nome. Espelho de
 * `alternar_condicao`: ligar não duplica e não passa do teto, a cópia ganha
 * id próprio, desligar tira todas as linhas com aquele nome.
 *
 * `null` = nada mudou, para quem chama não gravar um passo de desfazer vazio.
 */
export function alternarNaLista(
  lista: ReadonlyArray<Condicao> | undefined,
  modelo: Condicao,
  ligar: boolean,
  novoId: () => string,
): Condicao[] | null {
  const atual = lista ?? [];
  const tem = temCondicao(atual, modelo.nome);

  if (ligar) {
    if (tem || atual.length >= MAX_CONDICOES) return null;

    return [...atual, ajustarCondicao({ ...modelo, id: novoId(), escondido: false })];
  }

  if (!tem) return null;

  const chave = chaveDoNome(modelo.nome);
  return atual.filter((condicao) => chaveDoNome(condicao.nome) !== chave);
}

/**
 * A lista na ordem pedida. Id que a ordem esquece fica no fim, na ordem de
 * antes, e id que não existe é ignorado -- o mesmo de `reordenar_condicoes`.
 */
export function reordenarLista(
  lista: ReadonlyArray<Condicao>,
  ordem: ReadonlyArray<string>,
): Condicao[] {
  const porId = new Map(lista.map((condicao) => [condicao.id, condicao]));
  const primeiro = ordem
    .map((id) => porId.get(id))
    .filter((condicao): condicao is Condicao => Boolean(condicao));
  const vistos = new Set(primeiro.map((condicao) => condicao.id));

  return [...primeiro, ...lista.filter((condicao) => !vistos.has(condicao.id))];
}
