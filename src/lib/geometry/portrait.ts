import { boxBounds, unionBounds, type Bounds } from "@/lib/geometry/bounds";
import { FULL_VIEWPORT } from "@/lib/geometry/viewport";
import { SCENE_HEIGHT, SCENE_WIDTH, type Portrait, type Viewport } from "@/types/scene";
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
  assetId: string,
  naturalWidth?: number,
  naturalHeight?: number,
): Portrait {
  const aspect =
    naturalWidth && naturalHeight ? naturalWidth / naturalHeight : FALLBACK_ASPECT;
  const width = INITIAL_HEIGHT * aspect * PLANE_ASPECT;

  return {
    id: crypto.randomUUID(),
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
