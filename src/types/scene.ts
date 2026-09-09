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

/**
 * `pdf` saiu junto com o material de regras: era o unico caminho que criava
 * arquivo desse tipo. Registros antigos gravados como `pdf` continuam no
 * IndexedDB sem aparecer em lista nenhuma -- inofensivos, e apagaveis a mao.
 */
export type AssetKind = "image" | "audio";

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
  /**
   * Para QUAL sala ele subiu.
   *
   * O caminho no Storage é `{sala}/{asset}`, então "já subiu" sozinho não
   * basta: se a sala muda — outro navegador, dados limpos, sessão anônima
   * nova — o arquivo continua lá, mas num endereço que ninguém mais consulta,
   * e o acervo inteiro some das telas sem erro nenhum.
   */
  remoteRoomId?: string;
  /**
   * Pasta em que o mestre guardou o arquivo. Ausente = raiz.
   *
   * Guarda o id, não o nome: renomear a pasta não pode obrigar a reescrever
   * todos os arquivos dentro dela.
   */
  folderId?: string;
};

/**
 * Pasta do acervo.
 *
 * Só raiz, sem aninhamento: numa campanha o que se quer é separar mapas de
 * retratos e de fichas, e uma árvore profunda cobraria navegação em troca de
 * organização que ninguém pediu.
 */
export type AssetFolder = { id: string; name: string; createdAt: number };

/**
 * Tipos que precisam existir na nuvem.
 *
 * Áudio entrou porque a Plateia passou a tocar a trilha da cena, e o celular
 * do jogador não tem o IndexedDB do mestre — um arquivo que não subiu é
 * silêncio do outro lado.
 *
 * Custa cota: trilha é o tipo de arquivo mais pesado do acervo, e o plano
 * gratuito do Supabase aperta primeiro no Storage. A alternativa era a Plateia
 * nunca ter som.
 */
export const SYNCED_KINDS: readonly AssetKind[] = ["image", "audio"];

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

/**
 * Volume de partida da sessão.
 *
 * Vive junto dos tipos porque três lugares precisam do mesmo número: o store,
 * o disco (registro gravado antes de o volume sair da faixa) e o canal
 * (mensagem de uma versão anterior, que não traz o campo).
 */
export const DEFAULT_SESSION_VOLUME = 0.8;

/**
 * Trilha da sessão.
 *
 * Pertence ao sistema, não a uma cena: a música acompanha a mesa e não deve
 * ser cortada porque o mestre trocou de cena. Antes vivia dentro de `Scene`, e
 * era exatamente isso que acontecia.
 *
 * Continua viajando junto da cena no canal, porque a TV e os celulares
 * precisam saber o que tocar.
 *
 * Sem campo de volume: o ganho é da sessão, não da faixa. Guardado por faixa,
 * cada troca de música trocava o volume junto — a escolhida entrava com o
 * ganho de quando foi gravada, e o mestre reajustava o slider a cada troca.
 * O volume da sessão mora no `TrackStore`.
 */
export type SessionTrack = {
  assetId: string;
  loop: boolean;
  /** Pausado é diferente de ausente: a faixa continua escolhida. */
  playing: boolean;
  /**
   * Quando o play atual começou, em epoch ms.
   *
   * Serve para um espectador que chega no meio entrar mais ou menos na altura
   * certa, em vez de começar a faixa do zero enquanto a mesa está no refrão.
   */
  startedAt: number;
};

/**
 * Efeito disparado agora — porta rangendo, trovão, grito.
 *
 * Também mora na cena, pelo mesmo motivo da trilha. `firedAt` muda a cada
 * disparo, e é o que faz o espectador reconhecer que houve um novo: comparar
 * `assetId` não distinguiria dois disparos do mesmo som.
 */

/**
 * Retrato de personagem sobre a cena.
 *
 * Ancorado na **câmera**, não no plano: `x`, `y`, `width` e `height` são
 * frações de 0 a 1 do recorte que a mesa está vendo. É isso que faz o retrato
 * ficar parado quando o mestre aproxima o mapa, e ocupar a mesma parte da tela
 * na TV de 1920 e no celular de 390 — pixel de tela exigiria uma camada de
 * coordenadas própria em cada visão.
 *
 * Pertence à sessão, como a trilha: quem está na conversa não muda porque o
 * mestre trocou de mapa.
 */
export type Portrait = {
  id: string;
  assetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Fora do ar aparece fantasma só para o mestre, para ele posicionar antes. */
  visible: boolean;
  /** Virar o retrato para o lado da tela em que ele está. */
  flipX?: boolean;
  /** Moldura e sombra, para não parecer recorte colado no mapa. */
  framed?: boolean;
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
