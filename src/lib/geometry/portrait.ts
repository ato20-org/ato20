import { boxBounds, unionBounds, type Bounds } from "@/lib/geometry/bounds";
import { FULL_VIEWPORT } from "@/lib/geometry/viewport";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type AncoraRetrato,
  type Portrait,
  type Viewport,
} from "@/types/scene";
import type { ItemBox } from "@/lib/geometry/transform";

/** Proporção do plano. A câmera sempre a respeita, então vale para o recorte. */
const PLANE_ASPECT = SCENE_HEIGHT / SCENE_WIDTH;

/** Altura inicial do retrato, em fração da câmera. Cabe três lado a lado. */
const INITIAL_HEIGHT = 0.34;

/** Folga da borda, para o retrato não encostar no limite da tela. */
const MARGIN = 0.02;

/** Usado quando a medida do arquivo não veio — arquivo antigo ou corrompido. */
const FALLBACK_ASPECT = 3 / 4;

/**
 * Onde o retrato cai no plano de cena, dado o recorte atual da câmera.
 *
 * É a única ponte entre os dois espaços, e existe para as três visões
 * desenharem pelo mesmo caminho: no Assistir a câmera é a tela inteira, no
 * Operador ela é o retângulo da moldura, e a conta é a mesma.
 */
export function portraitBox(portrait: Portrait, camera: Viewport = FULL_VIEWPORT): ItemBox {
  return {
    x: camera.x + portrait.x * camera.width,
    y: camera.y + portrait.y * camera.height,
    width: portrait.width * camera.width,
    height: portrait.height * camera.height,
  };
}

/** Volta de coordenadas de cena para fração da câmera. */
export function portraitFraction(
  box: ItemBox,
  camera: Viewport = FULL_VIEWPORT,
): Pick<Portrait, "x" | "y" | "width" | "height"> {
  return {
    x: (box.x - camera.x) / camera.width,
    y: (box.y - camera.y) / camera.height,
    width: box.width / camera.width,
    height: box.height / camera.height,
  };
}

/**
 * Retrato novo, no canto inferior esquerdo e já no ar.
 *
 * A largura sai da proporção natural do arquivo: `width` e `height` são
 * frações de eixos diferentes, então a proporção do plano entra na conta —
 * sem ela, todo retrato nasceria achatado.
 */
export function createPortrait(
  personagemId: string,
  assetId: string,
  naturalWidth?: number,
  naturalHeight?: number,
): Portrait {
  const aspect =
    naturalWidth && naturalHeight ? naturalWidth / naturalHeight : FALLBACK_ASPECT;
  const width = INITIAL_HEIGHT * aspect * PLANE_ASPECT;

  return {
    // O id É o personagem. Um uuid próprio obrigaria a manter um mapa de
    // "qual retrato é do Edgar", e duas aberturas do mesmo personagem
    // criariam dois registros para a mesma figura.
    id: personagemId,
    personagemId,
    assetId,
    x: MARGIN,
    y: 1 - MARGIN - INITIAL_HEIGHT,
    width,
    height: INITIAL_HEIGHT,
    visible: true,
  };
}

/** Caixa que envolve os retratos, em coordenadas de cena. */
export function portraitsBounds(portraits: Portrait[], camera?: Viewport): Bounds | null {
  return unionBounds(portraits.map((portrait) => boxBounds(portraitBox(portrait, camera))));
}

/**
 * Escala vários retratos de uma vez, mantendo a proporção entre eles.
 *
 * Cada retrato guarda a posição relativa dentro do grupo: o que era um terço
 * da largura continua um terço depois de arrastar a alça. Um fator só, tirado
 * da largura, porque o gizmo do grupo trava a proporção — dois fatores
 * deformariam os retratos, que é o que ninguém quer num rosto.
 *
 * A conta acontece em coordenadas de cena e volta para fração no fim: é o
 * mesmo espaço em que o gizmo trabalha, e converter antes exigiria refazer a
 * geometria do gizmo em fração.
 */
export function scalePortraitGroup(
  portraits: Portrait[],
  from: Bounds,
  to: Bounds,
  camera?: Viewport,
): Array<{ id: string; patch: Pick<Portrait, "x" | "y" | "width" | "height"> }> {
  const width = from.maxX - from.minX;
  const height = from.maxY - from.minY;
  // Grupo sem área não define fator; devolver vazio é melhor que espalhar NaN.
  if (width <= 0 || height <= 0) return [];

  const factor = (to.maxX - to.minX) / width;

  return portraits.map((portrait) => {
    const box = portraitBox(portrait, camera);

    return {
      id: portrait.id,
      patch: portraitFraction(
        {
          x: to.minX + (box.x - from.minX) * factor,
          y: to.minY + (box.y - from.minY) * factor,
          width: box.width * factor,
          height: box.height * factor,
        },
        camera,
      ),
    };
  });
}

/**
 * Os retratos de uma cena: quem tem token nela, e tem Retrato na ficha.
 *
 * UM lugar que decide isso, porque tres consumidores fazem a mesma pergunta e
 * teriam de concordar: o painel lista, o palco desenha, e o publicador manda
 * para a mesa. Cada um com o seu filtro divergiria no primeiro caso de borda --
 * e o caso de borda aqui e a cena EM EDICAO nao ser a cena NO AR.
 *
 * A ordem sai dos tokens, e nao do registro guardado: e a ordem em que os
 * personagens entraram na cena, que e a que o mestre acabou de construir.
 *
 * `assetId` vem do campo Retrato do personagem, sobrescrevendo o que estiver
 * guardado -- ver `Portrait.assetId`.
 */
export function retratosDaCena(
  guardados: Portrait[],
  itens: ReadonlyArray<{ personagemId?: string }>,
  personagens: ReadonlyArray<{ id: string; retrato?: string }>,
): Portrait[] {
  const porId = new Map(guardados.map((retrato) => [retrato.personagemId, retrato]));
  const fichas = new Map(personagens.map((personagem) => [personagem.id, personagem]));

  const vistos = new Set<string>();
  const saida: Portrait[] = [];

  for (const item of itens) {
    const personagemId = item.personagemId;
    if (!personagemId || vistos.has(personagemId)) continue;

    vistos.add(personagemId);

    // Sem ficha, o token e de um personagem apagado. Sem Retrato, nao ha o que
    // desenhar -- o painel ainda mostra a linha, com o motivo, mas ela nao
    // gera retrato nenhum.
    const retratoAsset = fichas.get(personagemId)?.retrato;
    if (!retratoAsset) continue;

    const guardado = porId.get(personagemId);
    if (!guardado) continue;

    saida.push({ ...guardado, assetId: retratoAsset });
  }

  return saida;
}

/**
 * Folga entre a fila e a borda da câmera, em fração.
 *
 * Maior que a `MARGIN` de um retrato solto lá em cima, e com nome diferente de
 * propósito: as duas em inglês e português no mesmo arquivo eram um convite a
 * trocar uma pela outra.
 */
const MARGEM_FILA = 0.03;

/** Espaço entre dois retratos da fila. Encolhe quando não cabe. */
const FOLGA = 0.015;

/**
 * Onde cada área de encaixe fica, em fração da câmera.
 *
 * Tabela e não `if`: as seis são as combinações de dois eixos, e escrever a
 * tabela deixa óbvio que nenhuma combinação foi esquecida.
 */
const AREAS: Record<AncoraRetrato, { horizontal: "esquerda" | "centro" | "direita"; vertical: "cima" | "baixo" }> = {
  "cima-esquerda": { horizontal: "esquerda", vertical: "cima" },
  "cima-centro": { horizontal: "centro", vertical: "cima" },
  "cima-direita": { horizontal: "direita", vertical: "cima" },
  "baixo-esquerda": { horizontal: "esquerda", vertical: "baixo" },
  "baixo-centro": { horizontal: "centro", vertical: "baixo" },
  "baixo-direita": { horizontal: "direita", vertical: "baixo" },
};

/**
 * Onde cada retrato da fila deve estar, na ordem em que eles vêm.
 *
 * Em fração da câmera, como o resto do retrato. Devolve só `x` e `y`: o tamanho
 * é de cada um, e a fila não mexe nele — o mestre pode querer o chefe maior que
 * os capangas.
 *
 * Alinhados pela BASE nas áreas de baixo e pelo TOPO nas de cima: figuras de
 * alturas diferentes lado a lado precisam de uma linha comum, e no chão é onde
 * uma pessoa em pé encosta.
 *
 * Não cabendo, a folga encolhe até zero; ainda não cabendo, eles se sobrepõem o
 * necessário para a fila terminar dentro da margem. Fila sobreposta é feia; fila
 * fora da tela é inútil, e é a única tela em que o retrato aparece.
 */
export function filaDeRetratos(
  fila: ReadonlyArray<Pick<Portrait, "id" | "width" | "height">>,
  ancora: AncoraRetrato,
): Array<{ id: string; x: number; y: number }> {
  if (fila.length === 0) return [];

  const area = AREAS[ancora];
  const disponivel = 1 - 2 * MARGEM_FILA;

  const larguras = fila.reduce((soma, retrato) => soma + retrato.width, 0);
  const vaos = fila.length - 1;

  // A folga cede antes de qualquer coisa: ela é respiro, e respiro é o primeiro
  // a sair quando falta espaço.
  const folga = vaos > 0 ? Math.min(FOLGA, Math.max(0, (disponivel - larguras) / vaos)) : 0;
  const total = larguras + folga * vaos;

  /**
   * O passo entre os cantos esquerdos.
   *
   * Cabendo, é a largura de cada um mais a folga -- e aí o passo varia de item
   * para item. Não cabendo, os cantos se distribuem por igual no espaço que há,
   * o que produz a sobreposição mínima que faz o último terminar na margem.
   */
  const passoFixo =
    total > disponivel ? (disponivel - (fila[fila.length - 1]?.width ?? 0)) / Math.max(1, vaos) : null;

  const inicio =
    area.horizontal === "esquerda"
      ? MARGEM_FILA
      : area.horizontal === "direita"
        ? 1 - MARGEM_FILA - Math.min(total, disponivel)
        : (1 - Math.min(total, disponivel)) / 2;

  let x = inicio;

  return fila.map((retrato, indice) => {
    const posicao = {
      id: retrato.id,
      x,
      y: area.vertical === "cima" ? MARGEM_FILA : 1 - MARGEM_FILA - retrato.height,
    };

    x = passoFixo === null ? x + retrato.width + folga : inicio + passoFixo * (indice + 1);

    return posicao;
  });
}

/**
 * Os retângulos das seis áreas, em coordenadas de cena.
 *
 * Para acender durante o arrasto e para saber qual está sob o ponteiro. Um
 * terço da câmera em cada eixo, com a faixa do meio vertical de fora: arrastar
 * a fila para o meio da tela cobriria o mapa, que é o que a mesa está olhando.
 */
export function areasDeRetrato(
  camera: Viewport = FULL_VIEWPORT,
): Array<{ ancora: AncoraRetrato; box: ItemBox }> {
  const largura = camera.width / 3;
  const altura = camera.height / 3;

  const colunas = { esquerda: 0, centro: 1, direita: 2 } as const;

  return (Object.keys(AREAS) as AncoraRetrato[]).map((ancora) => {
    const area = AREAS[ancora];

    return {
      ancora,
      box: {
        x: camera.x + colunas[area.horizontal] * largura,
        y: camera.y + (area.vertical === "cima" ? 0 : camera.height - altura),
        width: largura,
        height: altura,
      },
    };
  });
}
