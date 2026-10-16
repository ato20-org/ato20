import { COR_DA_AREA, ladoDaCasa } from "@/lib/area-de-efeito";
import { EFEITOS_DE_FABRICA, especieDoEfeito } from "@/lib/efeitos";
import { olharDe } from "@/lib/geometry/peca-de-esguelha";
import type { Vec } from "@/lib/geometry/transform";
import type { DefinicaoDeEfeito, DisparoDoEfeito } from "@/types/efeito";
import type { EfeitoDisparado } from "@/types/efeito-disparado";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type AreaDeEfeito,
  type CanvasItem,
  type SceneGrid,
} from "@/types/scene";

/**
 * As contas do DISPARO de um efeito, sem React: o bloco do efeito com os
 * padrões, o tiro montado dentro do plano, o cone como polígono, o estouro no
 * fim da linha. Puras pela razão das partículas -- o Mestre monta o tiro, a TV
 * e o celular o desenham, e a conta se confere sem palco. Ver `EfeitoDisparado`.
 */

/**
 * O bloco `disparo` sem nenhum campo ausente nem fora do limite. Sem a imagem
 * do projétil, que se resolve por tela -- ver `projetilDoDisparo`.
 */
export type DisparoResolvido = Required<Omit<DisparoDoEfeito, "projetil">>;

/** Os padrões do disparo: a bola de fogo de casa inteira, a quinze casas por segundo. */
export const DISPARO_PADRAO: DisparoResolvido = {
  forma: "linha",
  abertura: 60,
  velocidade: 15,
  alcance: 6,
  tamanho: 1,
  impacto: 1,
  rastro: true,
  brilho: true,
};

/** Os limites de cada número, os mesmos que o Rust confere no plugin. */
export const LIMITES_DO_DISPARO = {
  abertura: [10, 160],
  velocidade: [3, 60],
  alcance: [1, 30],
  tamanho: [0.3, 3],
  impacto: [0, 4],
} as const satisfies Record<
  Exclude<keyof DisparoDoEfeito, "forma" | "projetil" | "rastro" | "brilho">,
  readonly [number, number]
>;

/**
 * Quanto o voo dura, no mínimo e no máximo, em milissegundos. Abaixo, o tiro
 * de uma casa piscaria sem ninguém ver; acima, o do outro lado do mapa ficaria
 * no ar por cinco segundos de combate parado.
 */
export const VOO_MIN_MS = 120;
export const VOO_MAX_MS = 2_500;

/** O estouro no fim da linha, em milissegundos. */
export const IMPACTO_MS = 800;
/** O projétil sem estouro, chegando: o tempo de apagar. */
export const CHEGADA_MS = 200;
/** O cone aberto, parado, antes de apagar. */
export const CONE_FICA_MS = 500;
/** O cone apagando. */
export const CONE_SOME_MS = 450;

/**
 * Quanto o arrasto precisa andar, em unidades de cena, para valer como "daqui
 * até ali" e não como o clique do ponto A. O mesmo da seta do quadro.
 */
export const ARRASTO_MINIMO_DO_DISPARO = 8;

/** O tiro mais curto que sai, em casas: dois cliques no mesmo lugar não disparam. */
const MENOR_DISPARO = 0.25;

/**
 * Quanto o tiro sai DA BORDA da figura, em vezes o menor lado dela: a bola de
 * fogo nasce na frente do mago, e não em cima do rosto dele.
 */
const AFASTAMENTO_DA_FIGURA = 0.3;

/** O passo do Shift, em graus: o da régua e o do giro. */
export const PASSO_DO_RUMO = 15;

function entre(valor: unknown, [min, max]: readonly [number, number], padrao: number): number {
  return typeof valor === "number" && Number.isFinite(valor)
    ? Math.min(max, Math.max(min, valor))
    : padrao;
}

/**
 * O disparo do efeito, com cada número preso e os padrões no que falta. O
 * efeito sem bloco -- que nem é disparo -- sai com os padrões, em linha: é o
 * que a prévia de um disparo novo mostra.
 */
export function disparoDoEfeito(definicao: DefinicaoDeEfeito | undefined): DisparoResolvido {
  const pedido = definicao?.disparo;
  const forma = pedido?.forma === "cone" ? "cone" : "linha";

  return {
    forma,
    abertura: entre(pedido?.abertura, LIMITES_DO_DISPARO.abertura, DISPARO_PADRAO.abertura),
    velocidade: entre(pedido?.velocidade, LIMITES_DO_DISPARO.velocidade, DISPARO_PADRAO.velocidade),
    alcance: entre(pedido?.alcance, LIMITES_DO_DISPARO.alcance, DISPARO_PADRAO.alcance),
    tamanho: entre(pedido?.tamanho, LIMITES_DO_DISPARO.tamanho, DISPARO_PADRAO.tamanho),
    impacto: entre(pedido?.impacto, LIMITES_DO_DISPARO.impacto, DISPARO_PADRAO.impacto),
    rastro: pedido?.rastro !== false,
    brilho: pedido?.brilho !== false,
  };
}

/**
 * O efeito dispara? Só o de DISPARO -- a espécie que declara o bloco. O de
 * área e o de personagem têm o lugar deles, e um não serve no do outro. Ver
 * `especieDoEfeito`.
 */
export function podeDisparar(definicao: Pick<DefinicaoDeEfeito, "area" | "disparo">): boolean {
  return especieDoEfeito(definicao) === "disparo";
}

/** Os disparos de FÁBRICA: os packs de `src/efeitos/` que declaram `disparo`. */
export const EFEITOS_DE_DISPARO: ReadonlyArray<DefinicaoDeEfeito> =
  EFEITOS_DE_FABRICA.filter(podeDisparar);

/**
 * Os disparos PRONTOS: os de fábrica e os dos plugins ligados. É de onde a
 * campanha parte -- "Usar sugestões" traz os de fábrica, "Partir de um disparo
 * pronto" oferece todos.
 */
export function disparosProntos(
  deFora: Readonly<Record<string, DefinicaoDeEfeito>> | undefined,
): DefinicaoDeEfeito[] {
  return [...EFEITOS_DE_DISPARO, ...efeitosDeDisparoDosPlugins(deFora)];
}

/** Os efeitos dos plugins ligados que disparam, na ordem dos manifestos. */
export function efeitosDeDisparoDosPlugins(
  deFora: Readonly<Record<string, DefinicaoDeEfeito>> | undefined,
): DefinicaoDeEfeito[] {
  return Object.values(deFora ?? {}).filter(
    (efeito) => podeDisparar(efeito) && efeito.origem && "plugin" in efeito.origem,
  );
}

/** A cor do tiro: a do efeito, como a da área que não escolheu a sua. */
export function corDoDisparo(definicao: DefinicaoDeEfeito | undefined): string {
  return definicao?.area?.cor ?? COR_DA_AREA;
}

/** O ponto preso ao plano, com uma margem de cada lado. */
function preso(ponto: Vec, margem = 0): Vec {
  const m = Math.min(margem, SCENE_WIDTH / 2, SCENE_HEIGHT / 2);
  return {
    x: Math.min(SCENE_WIDTH - m, Math.max(m, ponto.x)),
    y: Math.min(SCENE_HEIGHT - m, Math.max(m, ponto.y)),
  };
}

/**
 * O fim do tiro encurtado AO LONGO dele até caber no plano, e não preso eixo a
 * eixo: prender cada eixo mudaria a direção, e o tiro que mira o canto sairia
 * torto. `de` já está dentro.
 */
function ateOPlano(de: Vec, para: Vec, margem: number): Vec {
  const m = Math.min(margem, SCENE_WIDTH / 2, SCENE_HEIGHT / 2);
  const dx = para.x - de.x;
  const dy = para.y - de.y;
  let t = 1;

  for (const [inicio, passo, limite] of [
    [de.x, dx, SCENE_WIDTH],
    [de.y, dy, SCENE_HEIGHT],
  ] as const) {
    if (passo > 0) t = Math.min(t, (limite - m - inicio) / passo);
    if (passo < 0) t = Math.min(t, (m - inicio) / passo);
  }

  t = Math.max(0, t);
  return { x: de.x + dx * t, y: de.y + dy * t };
}

/** `para` girado em volta de `de` até o múltiplo de `passo` graus mais perto. O Shift. */
export function rumoTravado(de: Vec, para: Vec, passo = PASSO_DO_RUMO): Vec {
  const distancia = Math.hypot(para.x - de.x, para.y - de.y);
  const graus = Math.round((Math.atan2(para.y - de.y, para.x - de.x) * 180) / Math.PI / passo) * passo;
  const rad = (graus * Math.PI) / 180;
  return { x: de.x + Math.cos(rad) * distancia, y: de.y + Math.sin(rad) * distancia };
}

/**
 * O tiro, montado: a forma e os números do efeito em unidades de cena, os dois
 * pontos dentro do plano, e o tempo do voo pela velocidade. `null` quando o
 * tiro é curto demais para sair -- os dois cliques no mesmo lugar.
 *
 * O projétil da linha não chega à borda: o que passa da caixa do plano infla a
 * camada composta do WebKitGTK (a armadilha do palco), e a margem é a meia
 * diagonal dele. O cone se prende vértice a vértice, em `areaDoCone`.
 */
export function novoDisparo({
  id,
  cenaId,
  efeito,
  definicao,
  grid,
  de,
  para,
  quando,
}: {
  id: string;
  cenaId: string;
  efeito: string;
  definicao: DefinicaoDeEfeito | undefined;
  grid: SceneGrid | undefined;
  de: Vec;
  para: Vec;
  quando: number;
}): EfeitoDisparado | null {
  const disparo = disparoDoEfeito(definicao);
  const lado = ladoDaCasa(grid);
  const tamanho = disparo.tamanho * lado;
  const margem = disparo.forma === "linha" ? tamanho * 0.72 : 0;

  const inicio = preso(de, margem);
  const fim = ateOPlano(inicio, para, margem);
  const distancia = Math.hypot(fim.x - inicio.x, fim.y - inicio.y);
  if (!Number.isFinite(distancia) || distancia < lado * MENOR_DISPARO) return null;

  const voo = Math.round(
    Math.min(VOO_MAX_MS, Math.max(VOO_MIN_MS, (distancia / (disparo.velocidade * lado)) * 1000)),
  );

  return {
    id,
    cenaId,
    efeito,
    cor: corDoDisparo(definicao),
    forma: disparo.forma,
    de: inicio,
    para: fim,
    ...(disparo.forma === "cone" ? { abertura: disparo.abertura } : {}),
    tamanho,
    impacto: disparo.forma === "linha" ? disparo.impacto * 2 * lado : 0,
    voo,
    quando,
    ...(disparo.rastro ? {} : { semRastro: true as const }),
    ...(disparo.brilho ? {} : { semBrilho: true as const }),
  };
}

/** Quanto o tiro fica na tela, do começo do voo ao fim do estouro, em ms. */
export function vidaDoDisparo(disparo: Pick<EfeitoDisparado, "forma" | "voo" | "impacto">): number {
  if (disparo.forma === "cone") return disparo.voo + CONE_FICA_MS + CONE_SOME_MS;
  return disparo.voo + (disparo.impacto > 0 ? IMPACTO_MS : CHEGADA_MS);
}

/** O centro da caixa de um item, sem o giro: o giro é em volta dele. */
function centroDe(item: Pick<CanvasItem, "x" | "y" | "width" | "height">): Vec {
  return { x: item.x + item.width / 2, y: item.y + item.height / 2 };
}

/**
 * O tiro de um token para onde ele OLHA, até o alcance do efeito: o disparo do
 * botão direito, que não tem ponto B. O olhar é o facho da lanterna, ou o
 * padrão dele -- ver `olharDe`. Sai da borda da figura, e não do centro.
 */
export function disparoPeloOlhar(
  item: Pick<CanvasItem, "x" | "y" | "width" | "height" | "rotation" | "flipX" | "flipY" | "luz">,
  definicao: DefinicaoDeEfeito | undefined,
  grid: SceneGrid | undefined,
): { de: Vec; para: Vec } {
  const rad = (olharDe(item) * Math.PI) / 180;
  const direcao = { x: Math.cos(rad), y: Math.sin(rad) };
  const centro = centroDe(item);
  const afastamento = Math.min(item.width, item.height) * AFASTAMENTO_DA_FIGURA;
  const alcance = disparoDoEfeito(definicao).alcance * ladoDaCasa(grid);

  return {
    de: { x: centro.x + direcao.x * afastamento, y: centro.y + direcao.y * afastamento },
    para: {
      x: centro.x + direcao.x * (afastamento + alcance),
      y: centro.y + direcao.y * (afastamento + alcance),
    },
  };
}

/** O ponto cai na caixa do item, girada com ele? */
function dentroDoItem(
  item: Pick<CanvasItem, "x" | "y" | "width" | "height" | "rotation">,
  ponto: Vec,
): boolean {
  const centro = centroDe(item);
  const rad = (-(item.rotation ?? 0) * Math.PI) / 180;
  const dx = ponto.x - centro.x;
  const dy = ponto.y - centro.y;
  const x = dx * Math.cos(rad) - dy * Math.sin(rad);
  const y = dx * Math.sin(rad) + dy * Math.cos(rad);
  return Math.abs(x) <= item.width / 2 && Math.abs(y) <= item.height / 2;
}

/**
 * O PERSONAGEM sob o ponto, o de cima quando há dois: é nele que o tiro
 * encaixa. Só personagem, e não qualquer item -- a imagem do mapa posta como
 * item cobre o chão inteiro, e todo tiro sairia do meio dela.
 */
export function personagemSob(
  itens: ReadonlyArray<CanvasItem>,
  ponto: Vec,
): CanvasItem | undefined {
  for (let i = itens.length - 1; i >= 0; i--) {
    const item = itens[i]!;
    if (item.personagemId && dentroDoItem(item, ponto)) return item;
  }
  return undefined;
}

/**
 * Os dois pontos do tiro como o mestre os marcou, ENCAIXADOS nos personagens:
 * clicar no mago e no goblin é mirar de um no outro. O de saída vai para a
 * borda do mago, na direção do alvo; o de chegada fica no centro do goblin,
 * onde o estouro tem de cair. Ponto fora de personagem fica onde está.
 *
 * Com `travar` (o Shift), o rumo anda de quinze em quinze graus a partir do
 * centro de quem atira, e o alvo não encaixa: o mestre pediu o ângulo, e
 * puxá-lo para o goblin desfaria o pedido.
 */
export function pontosDoDisparo(
  itens: ReadonlyArray<CanvasItem>,
  de: Vec,
  para: Vec,
  travar = false,
): { de: Vec; para: Vec } {
  const origem = personagemSob(itens, de);
  const centro = origem ? centroDe(origem) : de;
  const alvo = travar ? undefined : personagemSob(itens, para);
  const fim = travar
    ? rumoTravado(centro, para)
    : alvo && alvo !== origem
      ? centroDe(alvo)
      : para;
  if (!origem) return { de, para: fim };

  const dx = fim.x - centro.x;
  const dy = fim.y - centro.y;
  const distancia = Math.hypot(dx, dy);
  if (distancia === 0) return { de: centro, para: fim };

  const afastamento = Math.min(origem.width, origem.height) * AFASTAMENTO_DA_FIGURA;
  return {
    de: {
      x: centro.x + (dx / distancia) * afastamento,
      y: centro.y + (dy / distancia) * afastamento,
    },
    para: fim,
  };
}

/**
 * O CONE do tiro, como uma área de efeito em polígono: o leque de `de` até a
 * distância de `para`, na direção dele. É o mesmo motor da área -- o chão, os
 * elementos e as partículas, assados numa folha só --, e o tiro só o abre a
 * partir da ponta. Cada vértice preso ao plano, pela regra do palco. `null`
 * quando o leque fino demais não tem caixa.
 */
export function areaDoCone(disparo: EfeitoDisparado): AreaDeEfeito | null {
  const raio = Math.hypot(disparo.para.x - disparo.de.x, disparo.para.y - disparo.de.y);
  const rumo = Math.atan2(disparo.para.y - disparo.de.y, disparo.para.x - disparo.de.x);
  const abertura = ((disparo.abertura ?? DISPARO_PADRAO.abertura) * Math.PI) / 180;
  // Um vértice a cada oito graus: o arco sai redondo, e o forno não paga por
  // um polígono de cem lados.
  const passos = Math.max(4, Math.ceil((abertura * 180) / Math.PI / 8));

  const vertices: Vec[] = [preso(disparo.de)];
  for (let i = 0; i <= passos; i++) {
    const angulo = rumo - abertura / 2 + (abertura * i) / passos;
    vertices.push(
      preso({
        x: disparo.de.x + Math.cos(angulo) * raio,
        y: disparo.de.y + Math.sin(angulo) * raio,
      }),
    );
  }

  const xs = vertices.map((vertice) => vertice.x);
  const ys = vertices.map((vertice) => vertice.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const width = Math.max(...xs) - x;
  const height = Math.max(...ys) - y;
  if (!(width >= 1 && height >= 1)) return null;

  return {
    id: `${disparo.id}:cone`,
    x,
    y,
    width,
    height,
    formato: "poligono",
    pontos: vertices.flatMap((vertice) => [(vertice.x - x) / width, (vertice.y - y) / height]),
    efeito: disparo.efeito,
    cor: disparo.cor,
    naMesa: true,
  };
}

/**
 * O ESTOURO no fim da linha: um círculo do diâmetro do impacto, em volta do
 * ponto de chegada, preso ao plano. `null` sem impacto -- a flecha que só
 * chega.
 */
export function areaDoImpacto(disparo: EfeitoDisparado): AreaDeEfeito | null {
  if (disparo.forma !== "linha" || !(disparo.impacto > 0)) return null;

  const lado = Math.min(disparo.impacto, SCENE_WIDTH, SCENE_HEIGHT);
  return {
    id: `${disparo.id}:impacto`,
    x: Math.min(SCENE_WIDTH - lado, Math.max(0, disparo.para.x - lado / 2)),
    y: Math.min(SCENE_HEIGHT - lado, Math.max(0, disparo.para.y - lado / 2)),
    width: lado,
    height: lado,
    formato: "elipse",
    efeito: disparo.efeito,
    cor: disparo.cor,
    naMesa: true,
  };
}

function ponto(valor: unknown): valor is Vec {
  if (!valor || typeof valor !== "object") return false;
  const { x, y } = valor as Record<string, unknown>;
  return typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y);
}

function numero(valor: unknown, max: number): valor is number {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= 0 && valor <= max;
}

/**
 * O tiro veio do quadro e é um que esta tela sabe desenhar: os campos todos,
 * cada número no tamanho de um mapa. O quadro passa pelo daemon como JSON
 * opaco, e o Mestre de outra versão pode mandar o que esta não conhece.
 */
export function disparoValido(valor: unknown): valor is EfeitoDisparado {
  if (!valor || typeof valor !== "object") return false;
  const disparo = valor as Record<string, unknown>;

  return (
    typeof disparo.id === "string" &&
    typeof disparo.cenaId === "string" &&
    typeof disparo.efeito === "string" &&
    typeof disparo.cor === "string" &&
    (disparo.forma === "linha" || disparo.forma === "cone") &&
    ponto(disparo.de) &&
    ponto(disparo.para) &&
    (disparo.abertura === undefined || numero(disparo.abertura, 360)) &&
    numero(disparo.tamanho, SCENE_WIDTH) &&
    numero(disparo.impacto, SCENE_WIDTH) &&
    numero(disparo.voo, VOO_MAX_MS)
  );
}
