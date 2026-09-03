import { SCENE_HEIGHT, SCENE_WIDTH, type CanvasItem } from "@/types/scene";


export type Vec = { x: number; y: number };

export type ItemBox = Pick<CanvasItem, "x" | "y" | "width" | "height">;

/**
 * Qualquer coisa redimensionável no palco. `CanvasItem` satisfaz por estrutura;
 * a área escondida entra com `rotation: 0` e reusa as mesmas alças.
 */
export type TransformBox = ItemBox & { rotation: number };

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const RESIZE_HANDLES: readonly ResizeHandle[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

/**
 * Só os cantos. Para caixas de proporção fixa — a câmera da mesa —, uma alça
 * de aresta move um eixo só e a proporção travada teria que inventar o outro,
 * fazendo a caixa crescer sem o cursor pedir.
 */
export const CORNER_HANDLES: readonly ResizeHandle[] = ["nw", "ne", "se", "sw"];

/** Menor lado permitido, em unidades de cena. Abaixo disso a alça some sob o item. */
export const MIN_ITEM_SIZE = 24;

export const ROTATION_SNAP_DEGREES = 15;

/** Cursores por setor de 45 graus, começando no que aponta para a direita. */
const CURSOR_BY_SECTOR = [
  "ew-resize",
  "nwse-resize",
  "ns-resize",
  "nesw-resize",
  "ew-resize",
  "nwse-resize",
  "ns-resize",
  "nesw-resize",
] as const;

/**
 * Cursor da alça já compensando o giro do item.
 *
 * A seta tem de apontar para a direção em que a alça de fato empurra. Sem
 * compensar, a alça direita de um item girado 90 graus mostraria seta
 * horizontal enquanto o movimento acontece na vertical.
 */
export function handleCursor(handle: ResizeHandle, rotation: number): string {
  const direction = HANDLE_DIRECTION[handle];
  const world = rotateVec(direction, rotation);
  const degrees = normalizeAngle((Math.atan2(world.y, world.x) * 180) / Math.PI);

  return CURSOR_BY_SECTOR[Math.round(degrees / 45) % 8]!;
}

/** Direção de cada alça no referencial local do item: -1, 0 ou 1 por eixo. */
const HANDLE_DIRECTION: Record<ResizeHandle, Vec> = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
};

export function handleDirection(handle: ResizeHandle): Vec {
  return HANDLE_DIRECTION[handle];
}

export function rotateVec({ x, y }: Vec, degrees: number): Vec {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

export function itemCenter(item: ItemBox): Vec {
  return { x: item.x + item.width / 2, y: item.y + item.height / 2 };
}

/**
 * Redimensiona mantendo a alça oposta ancorada no lugar.
 *
 * `delta` vem em coordenadas de cena, acumulado desde o início do arrasto. O
 * item pode estar rotacionado, então o movimento é levado ao referencial local
 * antes de virar largura/altura, e o deslocamento do centro volta ao
 * referencial da cena depois. Sem esse vai-e-volta, arrastar a alça de um item
 * girado faz ele fugir na diagonal.
 */
export type ResizeOptions = {
  /** Deriva um eixo do outro pela proporção atual. Só vale em alça de canto. */
  keepAspect?: boolean;
  /**
   * Arredondar a saída para inteiro. Ligado para itens, onde unidade de cena
   * já é ~1px na TV e float longo só engorda o JSON.
   *
   * Desligado para caixas de proporção fixa como a câmera: quem consome
   * re-deriva a altura da largura, e o resíduo do arredondamento quebraria a
   * âncora sempre para o mesmo lado (`Math.round` empurra `.5` para cima),
   * fazendo a caixa derivar meia unidade por gesto.
   */
  round?: boolean;
};

export function resizeItem(
  item: TransformBox,
  handle: ResizeHandle,
  delta: Vec,
  { keepAspect = false, round = true }: ResizeOptions = {},
): ItemBox {
  const direction = HANDLE_DIRECTION[handle];
  const local = rotateVec(delta, -item.rotation);

  let deltaWidth = direction.x * local.x;
  let deltaHeight = direction.y * local.y;

  // Proporção travada só faz sentido nas alças de canto: as de aresta movem um
  // eixo só, e forçar o outro faria o item crescer sem o mouse pedir.
  if (keepAspect && direction.x !== 0 && direction.y !== 0) {
    const ratio = item.height / item.width;

    if (Math.abs(deltaWidth) > Math.abs(deltaHeight)) {
      deltaHeight = deltaWidth * ratio;
    } else {
      deltaWidth = deltaHeight / ratio;
    }
  }

  const width = Math.max(MIN_ITEM_SIZE, item.width + deltaWidth);
  const height = Math.max(MIN_ITEM_SIZE, item.height + deltaHeight);

  // O clamp pode ter engolido parte do delta pedido; o centro anda metade do
  // crescimento que de fato aconteceu, não do que foi solicitado.
  const appliedWidth = width - item.width;
  const appliedHeight = height - item.height;

  const center = itemCenter(item);
  const shift = rotateVec(
    { x: (direction.x * appliedWidth) / 2, y: (direction.y * appliedHeight) / 2 },
    item.rotation,
  );

  const box: ItemBox = {
    x: center.x + shift.x - width / 2,
    y: center.y + shift.y - height / 2,
    width,
    height,
  };

  if (!round) return box;

  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
}

/** Ângulo em graus do vetor centro → ponto. */
export function angleTo(center: Vec, point: Vec): number {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
}

export function normalizeAngle(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export function snapAngle(degrees: number, step = ROTATION_SNAP_DEGREES): number {
  return Math.round(degrees / step) * step;
}

/** Fração do plano de cena que uma imagem recém-adicionada pode ocupar. */
const INITIAL_MAX_RATIO = 0.4;

/** Tamanho inicial de uma imagem: cabe no plano e preserva a proporção real. */
export function fitInitialSize(naturalWidth: number, naturalHeight: number): Vec {
  const factor = Math.min(
    1,
    (SCENE_WIDTH * INITIAL_MAX_RATIO) / naturalWidth,
    (SCENE_HEIGHT * INITIAL_MAX_RATIO) / naturalHeight,
  );

  return {
    x: Math.round(naturalWidth * factor),
    y: Math.round(naturalHeight * factor),
  };
}

/**
 * Desloca uma cópia de forma que ela continue alcançável.
 *
 * Somar o deslocamento às cegas põe a cópia de um item encostado na borda
 * fora do plano: ela some da tela e não há como clicá-la para apagar. Aqui o
 * deslocamento vira para o lado que tem espaço, e o resultado ainda é preso
 * dentro do plano.
 */
export function offsetInsideScene(box: ItemBox, offset: number): ItemBox {
  const dx = box.x + offset + box.width <= SCENE_WIDTH ? offset : -offset;
  const dy = box.y + offset + box.height <= SCENE_HEIGHT ? offset : -offset;

  return clampBoxToScene({ ...box, x: box.x + dx, y: box.y + dy });
}

/**
 * Prende a caixa dentro do plano, preservando o tamanho.
 *
 * Caixa maior que o plano não cabe: nesse caso a faixa permitida é invertida,
 * o que a deixa cobrindo o plano em vez de ser empurrada para um canto.
 */
export function clampBoxToScene(box: ItemBox): ItemBox {
  const maxX = SCENE_WIDTH - box.width;
  const maxY = SCENE_HEIGHT - box.height;

  return {
    ...box,
    x: Math.min(Math.max(box.x, Math.min(0, maxX)), Math.max(0, maxX)),
    y: Math.min(Math.max(box.y, Math.min(0, maxY)), Math.max(0, maxY)),
  };
}

/** Caixa centralizada no plano de cena, para onde todo item novo nasce. */
export function centeredBox(width: number, height: number): ItemBox {
  return {
    x: Math.round((SCENE_WIDTH - width) / 2),
    y: Math.round((SCENE_HEIGHT - height) / 2),
    width,
    height,
  };
}
