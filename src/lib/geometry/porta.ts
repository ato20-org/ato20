import type { CaixaDaLuz } from "@/lib/geometry/luz";
import type { Segmento } from "@/lib/geometry/sombra";
import type { Vec } from "@/lib/geometry/transform";
import type { NewPorta, Parede, Porta } from "@/types/scene";

/**
 * A geometria da porta: a folha que gira em volta da dobradiça. Ver `Porta`.
 *
 * Tudo aqui é conta pura, e é por isso que a luz, o sol e o 2.5D não sabem
 * que porta existe: para eles ela é uma parede `linha` na posição em que está.
 */

/**
 * Menor porta que o traço deixa nascer, em unidades de cena.
 *
 * O mesmo piso da parede: um clique sem arrasto deixaria uma porta de zero que
 * ninguém consegue pegar de volta.
 */
export const PORTA_MINIMA = 8;

/**
 * A quantos graus da porta fechada ela fecha sozinha.
 *
 * Sem o ímã, fechar à mão deixava uma fresta de um ou dois graus -- e uma
 * fresta deixa passar um fio de luz que atravessa a sala inteira.
 */
export const IMA_DA_PORTA = 6;

/** O passo do Shift, no traço e na abertura: as portas de mapa correm no eixo ou na diagonal. */
export const PASSO_DA_PORTA = 45;

/** Para onde o botão abre a porta que nunca abriu: em ângulo reto. */
export const ABERTURA_PADRAO = 90;

type GeometriaDaPorta = Pick<
  Porta,
  "x" | "y" | "comprimento" | "angulo" | "abertura"
>;

/** Graus em (-180, 180]: o mesmo giro, contado pelo lado mais curto. */
export function normalizarGraus(graus: number): number {
  const volta = ((graus % 360) + 360) % 360;
  return volta > 180 ? volta - 360 : volta;
}

/** Para onde `ponto` está, visto de `origem`, em graus no sentido horário. */
export function anguloAte(origem: Vec, ponto: Vec): number {
  return (Math.atan2(ponto.y - origem.y, ponto.x - origem.x) * 180) / Math.PI;
}

function naDirecao(origem: Vec, graus: number, comprimento: number): Vec {
  const radianos = (graus * Math.PI) / 180;
  return {
    x: origem.x + Math.cos(radianos) * comprimento,
    y: origem.y + Math.sin(radianos) * comprimento,
  };
}

/** Centésimo de grau: o bastante para a ponta não andar, e um número que se lê no diff. */
function emCentesimos(graus: number): number {
  return Math.round(graus * 100) / 100;
}

/**
 * A ponta da folha. Onde ela está agora, ou onde fica com a porta `fechada`.
 */
export function pontaDaPorta(porta: GeometriaDaPorta, fechada = false): Vec {
  const giro = fechada ? 0 : (porta.abertura ?? 0);
  return naDirecao(porta, porta.angulo + giro, porta.comprimento);
}

/**
 * Esta porta é geometria de verdade? A mesma guarda de `paredeDeVerdade`: um
 * `NaN` aqui apagaria a sombra de todas as paredes da cena junto.
 */
export function portaDeVerdade(porta: GeometriaDaPorta): boolean {
  return (
    Number.isFinite(porta.x) &&
    Number.isFinite(porta.y) &&
    Number.isFinite(porta.comprimento) &&
    Number.isFinite(porta.angulo) &&
    (porta.abertura === undefined || Number.isFinite(porta.abertura)) &&
    porta.comprimento > 0
  );
}

/** A folha onde ela está: o pedaço reto que para a luz. */
export function segmentoDaPorta(porta: GeometriaDaPorta): Segmento {
  const ponta = pontaDaPorta(porta);
  return { x1: porta.x, y1: porta.y, x2: ponta.x, y2: ponta.y };
}

/** As folhas de todas as portas. Ver `segmentosDasParedes`. */
export function segmentosDasPortas(
  portas: ReadonlyArray<Porta> | undefined,
): Segmento[] {
  return (portas ?? []).filter(portaDeVerdade).map(segmentoDaPorta);
}

/**
 * A porta como a parede `linha` que ela é agora: a caixa entre a dobradiça e a
 * ponta, e a diagonal que vai de uma à outra.
 *
 * O id é o da porta. É por ele que a cor da face no 2.5D fica com ela -- ver
 * `useCoresDasParedes`.
 */
export function paredeDaPorta(porta: Porta): Parede {
  const ponta = pontaDaPorta(porta);
  const dx = ponta.x - porta.x;
  const dy = ponta.y - porta.y;

  return {
    id: porta.id,
    x: Math.min(porta.x, ponta.x),
    y: Math.min(porta.y, ponta.y),
    width: Math.abs(dx),
    height: Math.abs(dy),
    formato: "linha",
    // A linha da caixa desce da esquerda para a direita; a que sobe é a
    // secundária. Ver `Parede.diagonal`.
    ...(dx * dy < 0 ? { diagonal: "secundaria" as const } : {}),
    ...(porta.altura !== undefined ? { altura: porta.altura } : {}),
  };
}

/**
 * As paredes da cena com as portas junto, para quem só sabe de parede: o sol
 * e o 2.5D. Sem porta devolve a MESMA lista, e quem a memoiza não refaz nada.
 */
export function paredesComPortas(
  paredes: Parede[] | undefined,
  portas: ReadonlyArray<Porta> | undefined,
): Parede[] | undefined {
  const validas = (portas ?? []).filter(portaDeVerdade);
  if (validas.length === 0) return paredes;
  return [...(paredes ?? []), ...validas.map(paredeDaPorta)];
}

/**
 * A porta que um traço desenha, da dobradiça à ponta. Com `passo`, o ângulo
 * cai no múltiplo de 45 mais perto. `null` se o traço é curto demais.
 */
export function portaDoTraco(
  dobradica: Vec,
  ponta: Vec,
  passo = false,
): NewPorta | null {
  const comprimento = Math.hypot(ponta.x - dobradica.x, ponta.y - dobradica.y);
  if (comprimento < PORTA_MINIMA) return null;

  const bruto = anguloAte(dobradica, ponta);
  const angulo = passo
    ? Math.round(bruto / PASSO_DA_PORTA) * PASSO_DA_PORTA
    : bruto;

  return {
    x: Math.round(dobradica.x),
    y: Math.round(dobradica.y),
    comprimento: Math.round(comprimento),
    angulo: emCentesimos(normalizarGraus(angulo)),
  };
}

/**
 * Quanto a porta abre com a ponta da folha sob o ponteiro. `undefined` é
 * fechada: perto do zero o ímã fecha -- ver `IMA_DA_PORTA`.
 *
 * Pelo ângulo do ponteiro visto da dobradiça, e não pelo deslocamento: a alça
 * anda num círculo, e o arrasto pode passar por dentro dele.
 */
export function aberturaAte(
  porta: GeometriaDaPorta,
  ponteiro: Vec,
  passo = false,
): number | undefined {
  const bruta = normalizarGraus(anguloAte(porta, ponteiro) - porta.angulo);
  const graus = passo
    ? normalizarGraus(Math.round(bruta / PASSO_DA_PORTA) * PASSO_DA_PORTA)
    : bruta;

  if (Math.abs(graus) < IMA_DA_PORTA) return undefined;
  return Math.round(graus);
}

/**
 * Onde a mão pegou a alça de girar e esticar, em relação à porta FECHADA: a
 * distância que sobra além da ponta e o ângulo de desvio. Guardado no
 * pointerdown para a porta não pular quando o arrasto começa -- a alça mora
 * além da ponta, e não em cima dela. Ver `portaPelaAlca`.
 */
export type PegaDaAlca = { folga: number; desvio: number };

export function pegaDaAlca(porta: GeometriaDaPorta, ponteiro: Vec): PegaDaAlca {
  return {
    folga:
      Math.hypot(ponteiro.x - porta.x, ponteiro.y - porta.y) - porta.comprimento,
    desvio: normalizarGraus(anguloAte(porta, ponteiro) - porta.angulo),
  };
}

/**
 * A porta girada e esticada em volta da dobradiça, com a alça sob o ponteiro.
 * A dobradiça não sai do lugar, e a abertura continua a mesma, contada do
 * ângulo novo: a porta aberta gira junto com o batente.
 *
 * O comprimento para no piso, e não devolve `null` como o traço: com a alça na
 * mão, a porta curta demais continua respondendo ao arrasto de volta.
 */
export function portaPelaAlca(
  porta: GeometriaDaPorta,
  ponteiro: Vec,
  pega: PegaDaAlca,
  passo = false,
): Pick<Porta, "comprimento" | "angulo"> {
  const distancia = Math.hypot(ponteiro.x - porta.x, ponteiro.y - porta.y);
  const bruto = anguloAte(porta, ponteiro) - pega.desvio;
  const angulo = passo
    ? Math.round(bruto / PASSO_DA_PORTA) * PASSO_DA_PORTA
    : bruto;

  return {
    comprimento: Math.max(PORTA_MINIMA, Math.round(distancia - pega.folga)),
    angulo: emCentesimos(normalizarGraus(angulo)),
  };
}

/**
 * O botão de abrir e fechar: aberta, fecha e guarda a abertura; fechada, volta
 * à última abertura, ou ao ângulo reto se nunca abriu.
 */
export function alternarPorta(
  porta: Pick<Porta, "abertura" | "ultimaAbertura">,
): Pick<Porta, "abertura" | "ultimaAbertura"> {
  if (porta.abertura !== undefined) {
    return { abertura: undefined, ultimaAbertura: porta.abertura };
  }
  return { abertura: porta.ultimaAbertura ?? ABERTURA_PADRAO };
}

/**
 * O que um quadro do arrasto da ponta grava: a abertura, e -- quando o ímã
 * fecha -- a última abertura que a mão deixou, para o botão saber para onde
 * abrir de novo. `ultima` é a do quadro anterior; ver `PortaMarcadores`.
 */
export function patchDaAbertura(
  abertura: number | undefined,
  ultima: number | undefined,
): Pick<Porta, "abertura" | "ultimaAbertura"> {
  if (abertura !== undefined) return { abertura };
  return ultima !== undefined
    ? { abertura: undefined, ultimaAbertura: ultima }
    : { abertura: undefined };
}

/**
 * A caixa de tudo o que a porta ocupa: a dobradiça, a ponta fechada e a ponta
 * de agora. É o que a área do mapa conta -- ver `limitesDoConteudo`.
 */
export function caixaDaPorta(porta: GeometriaDaPorta): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const fechada = pontaDaPorta(porta, true);
  const agora = pontaDaPorta(porta);
  const xs = [porta.x, fechada.x, agora.x];
  const ys = [porta.y, fechada.y, agora.y];
  const x = Math.min(...xs);
  const y = Math.min(...ys);

  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}

/**
 * As folhas que caem na caixa de uma luz. Pela caixa do segmento, e não pelo
 * cruzamento exato: errar para mais só refaz uma luz que não precisava, e
 * errar para menos deixaria a sombra velha da porta no chão.
 */
export function folhasNaCaixa(
  caixa: CaixaDaLuz,
  folhas: ReadonlyArray<Segmento>,
): Segmento[] {
  return folhas.filter(
    (folha) =>
      Math.max(folha.x1, folha.x2) >= caixa.x &&
      Math.min(folha.x1, folha.x2) <= caixa.x + caixa.width &&
      Math.max(folha.y1, folha.y2) >= caixa.y &&
      Math.min(folha.y1, folha.y2) <= caixa.y + caixa.height,
  );
}
