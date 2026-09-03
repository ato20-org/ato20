/**
 * Contrato central do projeto.
 *
 * Toda posição vive em "coordenadas de cena": um plano fixo de
 * SCENE_WIDTH x SCENE_HEIGHT. Cada visão (Operador, Assistir, Plateia) escala
 * esse plano para caber na tela dela. Sem isso, o que o mestre posiciona não
 * bate com o que aparece na TV.
 */
export const SCENE_WIDTH = 1920;
export const SCENE_HEIGHT = 1080;

export type AssetKind = "image" | "audio" | "pdf";

/** Metadados de um arquivo enviado pelo mestre. O binário fica em `AssetRecord`. */
export type AssetMeta = {
  id: string;
  kind: AssetKind;
  name: string;
  mimeType: string;
  size: number;
  createdAt: number;
  /** Dimensões naturais, medidas no upload. Só existem para `kind: "image"`. */
  naturalWidth?: number;
  naturalHeight?: number;
  /**
   * Quando o arquivo terminou de subir para o Storage. Ausente = ainda só
   * existe neste navegador, e nenhum celular consegue vê-lo.
   */
  remoteAt?: number;
};

/**
 * Tipos que precisam existir na nuvem.
 *
 * Áudio fica fora: quem toca som é só o Operador, na mesma máquina que
 * alimenta a TV. Subir trilhas gastaria a cota de Storage sem ninguém do
 * outro lado precisar delas.
 */
export const SYNCED_KINDS: readonly AssetKind[] = ["image", "pdf"];

/** Uma imagem posicionada sobre o fundo da cena. */
export type CanvasItem = {
  id: string;
  assetId: string;
  /** Canto superior esquerdo, em coordenadas de cena. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Graus, no sentido horário, em torno do centro do item. */
  rotation: number;
  /** Ordem de empilhamento. Maior fica na frente. */
  z: number;
  /** Item travado não é selecionável nem arrastável no Operador. */
  locked: boolean;
  /**
   * Espelhamento. Aplicado no referencial do próprio item, depois do giro:
   * espelhar um token é virar o desenho dele, não mover a caixa.
   *
   * Opcionais para não exigir migração dos itens já gravados.
   */
  flipX?: boolean;
  flipY?: boolean;
};

/**
 * Área escondida. Opaca na Plateia e no Assistir, semi-transparente no
 * Operador — o mestre vê o que tem embaixo, a mesa não.
 */
export type FogRegion = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Revelada deixa de esconder em todas as visões. */
  revealed: boolean;
};

/** O que o chamador informa ao desenhar uma área; `id` e `revealed` são do store. */
export type NewFogRegion = Pick<FogRegion, "x" | "y" | "width" | "height">;

/**
 * Recorte do plano de cena. Sempre na proporção do plano, para toda visão
 * caber o mesmo enquadramento sem cortar nada.
 *
 * Usado em dois lugares: o zoom local do Operador (não persistido, não viaja)
 * e a câmera compartilhada da cena, que é o que a mesa enxerga.
 */
export type Viewport = { x: number; y: number; width: number; height: number };

export type SceneAudio = {
  assetId: string;
  loop: boolean;
  /** 0 a 1. */
  volume: number;
};

/** O que o chamador informa ao criar um item; `id`, `z` e afins são do store. */
export type NewCanvasItem = Pick<CanvasItem, "assetId" | "x" | "y" | "width" | "height">;

/**
 * Item novo que pode trazer rotação e travamento próprios — é o que o
 * "colar" precisa para reproduzir a cópia fielmente.
 */
export type ItemDraft = NewCanvasItem &
  Partial<Pick<CanvasItem, "rotation" | "locked" | "flipX" | "flipY">>;

export type Scene = {
  id: string;
  name: string;
  backgroundAssetId?: string;
  items: CanvasItem[];
  fog: FogRegion[];
  /**
   * Enquadramento que a Plateia e o Assistir usam. Ausente = plano inteiro.
   * O zoom do Operador só chega aqui quando ele manda, pelo botão de enquadrar.
   */
  camera?: Viewport;
  audio?: SceneAudio;
  createdAt: number;
  updatedAt: number;
};

/** Documento inteiro persistido. Uma mesa = um board. */
export type Board = {
  scenes: Scene[];
  /**
   * Cena aberta no palco do Operador. É o que o mestre edita, e só ele vê.
   */
  editingSceneId: string | null;
  /**
   * Cena que a mesa está vendo. Separada da de edição de propósito: é o que
   * permite montar a próxima cena enquanto os jogadores seguem na atual.
   * `null` = nada no ar.
   */
  liveSceneId: string | null;
};

export function createScene(name: string): Scene {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    items: [],
    fog: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Cópia independente de uma cena.
 *
 * Gera id novo para a cena, para cada item e para cada área: com ids
 * compartilhados, mover um item na cópia moveria o original também, porque
 * toda mutação do store encontra o item por id.
 */
export function cloneScene(source: Scene, name: string): Scene {
  const now = Date.now();

  return {
    ...source,
    id: crypto.randomUUID(),
    name,
    items: source.items.map((item) => ({ ...item, id: crypto.randomUUID() })),
    fog: source.fog.map((region) => ({ ...region, id: crypto.randomUUID() })),
    createdAt: now,
    updatedAt: now,
  };
}

export function createEmptyBoard(): Board {
  const first = createScene("Cena 1");
  return { scenes: [first], editingSceneId: first.id, liveSceneId: first.id };
}
