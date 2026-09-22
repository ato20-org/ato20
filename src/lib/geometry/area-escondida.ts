import { itemCenter, rotateVec, type Vec } from "@/lib/geometry/transform";
import type { FogRegion, NewFogRegion } from "@/types/scene";

/**
 * A caixa de uma área escondida, com o giro resolvido.
 *
 * Estrutural e não `FogRegion` inteira porque estas contas valem para a área
 * em curso -- a que ainda não tem `id` nem `revealed` -- tanto quanto para a
 * que já está na cena.
 */
export type CaixaDaArea = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};

/**
 * Lado mínimo de uma caixa de área, em unidades de cena.
 *
 * Não é o `MIN_ITEM_SIZE`: um polígono legítimo pode ser uma faixa de dois
 * pixels de altura -- uma fresta, um corredor visto de lado --, e o que
 * precisamos garantir aqui é só que a caixa nunca tenha lado ZERO, porque a
 * fração de um vértice é uma divisão por esse lado.
 */
const LADO_MINIMO = 1;

/**
 * Os vértices em coordenadas LOCAIS da caixa: de `0` a `width`, de `0` a
 * `height`, antes do giro.
 *
 * É o que o desenho usa, porque o SVG do polígono vive dentro do elemento que
 * já carrega o `translate` e o `rotate` da área -- ele enxerga a caixa como se
 * ela estivesse na origem e sem giro.
 */
export function pontosNaCaixa(
  caixa: CaixaDaArea,
  pontos: readonly number[],
): Vec[] {
  const locais: Vec[] = [];

  for (let i = 0; i + 1 < pontos.length; i += 2)
    locais.push({
      x: pontos[i] * caixa.width,
      y: pontos[i + 1] * caixa.height,
    });

  return locais;
}

/** Um ponto local da caixa, em coordenadas de cena. Resolve o giro. */
export function paraCena(caixa: CaixaDaArea, local: Vec): Vec {
  const centro = itemCenter(caixa);
  const girado = rotateVec(
    { x: local.x - caixa.width / 2, y: local.y - caixa.height / 2 },
    caixa.rotation ?? 0,
  );

  return { x: centro.x + girado.x, y: centro.y + girado.y };
}

/** O caminho inverso: um ponto de cena em coordenadas locais da caixa. */
export function paraCaixa(caixa: CaixaDaArea, cena: Vec): Vec {
  const centro = itemCenter(caixa);
  const desgirado = rotateVec(
    { x: cena.x - centro.x, y: cena.y - centro.y },
    -(caixa.rotation ?? 0),
  );

  return {
    x: desgirado.x + caixa.width / 2,
    y: desgirado.y + caixa.height / 2,
  };
}

/** Os vértices de um polígono em coordenadas de cena, já girados. */
export function poligonoEmCena(region: FogRegion): Vec[] {
  return pontosNaCaixa(region, region.pontos ?? []).map((local) =>
    paraCena(region, local),
  );
}

/**
 * A caixa e as frações de um polígono desenhado em coordenadas de CENA.
 *
 * É o que fecha o laço: o mestre crava vértice a vértice sobre o mapa, e o que
 * entra na cena é uma caixa como a de qualquer outra área, com os vértices
 * guardados em fração dela.
 */
export function areaDoPoligono(pontos: readonly Vec[]): NewFogRegion {
  const xs = pontos.map((ponto) => ponto.x);
  const ys = pontos.map((ponto) => ponto.y);

  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(LADO_MINIMO, Math.max(...xs) - minX);
  const height = Math.max(LADO_MINIMO, Math.max(...ys) - minY);

  return {
    x: minX,
    y: minY,
    width,
    height,
    formato: "poligono",
    pontos: pontos.flatMap((ponto) => [
      (ponto.x - minX) / width,
      (ponto.y - minY) / height,
    ]),
  };
}

/**
 * Reencaixa a caixa em volta de vértices LOCAIS que saíram dela.
 *
 * Arrastar um vértice para fora é o caso comum -- o polígono cresce para onde
 * a sala cresce --, e a fração não sabe dizer "1,4 da caixa": o que acontece é
 * que a caixa passa a ser outra. A conta que importa é a do centro: com giro,
 * mudar a origem da caixa move o desenho inteiro, então o centro novo compensa
 * exatamente o deslocamento da origem, GIRADO. Sem isso, arrastar um vértice
 * de uma área torta faria o resto dela pular para o lado.
 */
export function normalizarPoligono(
  caixa: CaixaDaArea,
  locais: readonly Vec[],
): Required<Pick<FogRegion, "x" | "y" | "width" | "height" | "pontos">> {
  const xs = locais.map((ponto) => ponto.x);
  const ys = locais.map((ponto) => ponto.y);

  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(LADO_MINIMO, Math.max(...xs) - minX);
  const height = Math.max(LADO_MINIMO, Math.max(...ys) - minY);

  const centro = itemCenter(caixa);
  const deslocamento = rotateVec(
    {
      x: minX + width / 2 - caixa.width / 2,
      y: minY + height / 2 - caixa.height / 2,
    },
    caixa.rotation ?? 0,
  );

  return {
    x: centro.x + deslocamento.x - width / 2,
    y: centro.y + deslocamento.y - height / 2,
    width,
    height,
    pontos: locais.flatMap((ponto) => [
      (ponto.x - minX) / width,
      (ponto.y - minY) / height,
    ]),
  };
}
