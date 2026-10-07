import {
  paraCaixa,
  paraCena,
  pontosNaCaixa,
  type CaixaDaArea,
} from "@/lib/geometry/area-escondida";
import { fontesDaCena, type FonteDeLuz } from "@/lib/geometry/luz";
import { proximoTamanhoDoPincel } from "@/lib/geometry/pincel";
import type { Vec } from "@/lib/geometry/transform";
import type { CanvasItem, FuroDaArea } from "@/types/scene";

/**
 * As lanternas que os tokens carregam, como fontes de luz.
 *
 * Só a `luz` do item, e não a das condições: o goblin em chamas clareia o
 * corredor, mas quem revela a névoa é a lanterna. A luz cravada também fica de
 * fora -- a tocha da parede ilumina a sala, e não a abre para a mesa.
 */
export function lanternasDosTokens(
  items: ReadonlyArray<CanvasItem>,
): FonteDeLuz[] {
  return fontesDaCena(undefined, items);
}

/**
 * A lanterna alcança esta área?
 *
 * Pelo círculo do alcance, mesmo quando ela é cone: errar para mais custa só
 * um rascunho que não abre nada, e errar para menos deixaria a névoa fechada
 * onde o facho chega. O centro vai para as coordenadas da caixa, onde o giro
 * some e a conta é a distância a um retângulo alinhado.
 */
export function alcancaArea(
  caixa: CaixaDaArea,
  fonte: Pick<FonteDeLuz, "x" | "y" | "raio">,
): boolean {
  const local = paraCaixa(caixa, fonte);
  const dx = Math.max(0, -local.x, local.x - caixa.width);
  const dy = Math.max(0, -local.y, local.y - caixa.height);

  return Math.hypot(dx, dy) < fonte.raio;
}

/** As lanternas que abrem buraco nesta área. */
export function lanternasDaArea(
  caixa: CaixaDaArea,
  fontes: ReadonlyArray<FonteDeLuz>,
): FonteDeLuz[] {
  return fontes.filter((fonte) => alcancaArea(caixa, fonte));
}

/**
 * O pincel com que a borracha nasce, em unidade de cena: o raio, não a
 * espessura. Um pouco mais que meia casa da grade comum -- o bastante para
 * abrir um corredor em duas passadas, e pouco para furar a sala inteira sem
 * querer.
 */
export const RAIO_DA_BORRACHA_PADRAO = 36;
export const RAIO_DA_BORRACHA_MINIMO = 6;
export const RAIO_DA_BORRACHA_MAXIMO = 300;

/** O próximo raio da borracha, um passo acima ou abaixo. Ver `proximoTamanhoDoPincel`. */
export function proximoRaioDaBorracha(raio: number, sentido: 1 | -1): number {
  return proximoTamanhoDoPincel(
    raio,
    sentido,
    RAIO_DA_BORRACHA_MINIMO,
    RAIO_DA_BORRACHA_MAXIMO,
  );
}

/**
 * Quantas casas decimais a fração guarda.
 *
 * Quatro dão um décimo de unidade de cena numa área do plano inteiro, e o
 * traço de três segundos não vira um parágrafo de dígitos no JSON da cena.
 */
const CASAS = 1e4;

function arredondar(valor: number): number {
  return Math.round(valor * CASAS) / CASAS;
}

/**
 * Uma passada da borracha, de cena para a caixa.
 *
 * `null` sem ponto nenhum, ou numa caixa sem largura -- a fração é uma divisão
 * por ela. Os pontos que caem fora da caixa ficam: o traço que entra pela
 * borda precisa do ponto de fora para o primeiro trecho existir, e o recorte é
 * do desenho, não do dado. Ver `FuroDaArea`.
 */
export function furoDoTraco(
  caixa: CaixaDaArea,
  pontos: ReadonlyArray<Vec>,
  raio: number,
): FuroDaArea | null {
  if (pontos.length === 0 || caixa.width <= 0 || caixa.height <= 0)
    return null;

  return {
    raio: arredondar(raio / caixa.width),
    pontos: pontos.flatMap((ponto) => {
      const local = paraCaixa(caixa, ponto);
      return [
        arredondar(local.x / caixa.width),
        arredondar(local.y / caixa.height),
      ];
    }),
  };
}

/**
 * Os furos de uma caixa reescritos para OUTRA, sem sair do lugar no mapa.
 *
 * É o caso do vértice do polígono arrastado para fora: a caixa passa a ser
 * outra (`normalizarPoligono`), e a fração guardada em relação à antiga
 * pularia junto com ela. Escalar pelo gizmo NÃO passa aqui -- ali o furo tem
 * de crescer com a área, e a fração já faz isso sozinha.
 */
export function furosNaCaixaNova(
  antes: CaixaDaArea,
  depois: CaixaDaArea,
  furos: ReadonlyArray<FuroDaArea>,
): FuroDaArea[] {
  if (depois.width <= 0 || depois.height <= 0) return [...furos];

  return furos.map((furo) => {
    const emCena = pontosNaCaixa(antes, furo.pontos).map((local) =>
      paraCena(antes, local),
    );

    return (
      furoDoTraco(depois, emCena, furo.raio * antes.width) ?? {
        ...furo,
        pontos: [],
      }
    );
  });
}

/**
 * O token sob o ponto, o de cima primeiro. `undefined` se nenhum.
 *
 * Token é quem tem personagem ou lanterna: é o que anda dentro da névoa
 * dinâmica, e o mestre precisa pegá-lo ali. A mobília e o mapa em pedaços
 * ficam de fora -- se contassem, a área inteira deixaria de ser clicável.
 */
export function tokenSobOPonto(
  items: ReadonlyArray<CanvasItem>,
  ponto: Vec,
): CanvasItem | undefined {
  let achado: CanvasItem | undefined;

  for (const item of items) {
    if (!item.personagemId && !item.luz) continue;
    if (achado && item.z < achado.z) continue;

    const local = paraCaixa(item, ponto);
    if (
      local.x >= 0 &&
      local.y >= 0 &&
      local.x <= item.width &&
      local.y <= item.height
    )
      achado = item;
  }

  return achado;
}

/**
 * A passada chegou a encostar na área?
 *
 * A borracha age só na área selecionada, mas o arrasto pode começar e acabar
 * do lado de fora -- o mestre errou a área, ou passou ao lado dela. Um furo
 * que não toca a caixa não abre nada, e gravá-lo seria um passo de desfazer
 * que não desfaz nada e um peso a mais no JSON da cena.
 */
export function passadaTocaAArea(
  caixa: CaixaDaArea,
  pontos: ReadonlyArray<Vec>,
  raio: number,
): boolean {
  return pontos.some((ponto) => {
    const local = paraCaixa(caixa, ponto);
    return (
      local.x > -raio &&
      local.y > -raio &&
      local.x < caixa.width + raio &&
      local.y < caixa.height + raio
    );
  });
}
