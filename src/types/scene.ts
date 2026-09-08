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
 * arquivo desse tipo.
 */
export type AssetKind = "image" | "audio";

/**
 * Metadados de um arquivo enviado pelo mestre. O binário fica em `assets/`.
 *
 * Este tipo atravessa o IPC: o espelho dele em Rust é `vault::assets::AssetMeta`,
 * e é o Rust que grava `assets.json`. Campo novo aqui precisa de campo novo lá.
 */
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
   * Pasta em que o mestre guardou o arquivo. Ausente = raiz.
   *
   * Guarda o id, não o nome: renomear a pasta não pode obrigar a reescrever
   * todos os arquivos dentro dela.
   */
  folderId?: string;
  /**
   * A forma da onda, um valor de 0 a 100 por barra. Só para `audio`.
   *
   * Medida uma vez pela tela, na primeira vez que a faixa aparece na barra da
   * trilha, e gravada no vault. Ausente = ainda não medida, e a barra desenha
   * uma linha lisa.
   */
  peaks?: number[];
};

/**
 * Pasta do acervo.
 *
 * Só raiz, sem aninhamento: numa campanha o que se quer é separar mapas de
 * retratos e de fichas, e uma árvore profunda cobraria navegação em troca de
 * organização que ninguém pediu.
 */
export type AssetFolder = { id: string; name: string; createdAt: number };

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

/**
 * Grade sobre o mapa.
 *
 * Mora na CENA, e não numa preferência da máquina, porque cada mapa tem a
 * própria escala: a grade que casa com uma taverna desenhada em 40px por
 * quadrado não casa com um mapa de região. E porque ela precisa viajar — a
 * mesa vê a mesma grade que o mestre, senão contar movimento em voz alta não
 * significa nada.
 *
 * Ausente em `Scene.grid` = sem grade. É o padrão: a maioria das cenas de
 * ambiente não quer uma.
 */
export type SceneGrid = {
  /**
   * Lado do quadrado, em unidades de cena.
   *
   * Unidade de cena e não pixel de tela, como todo o resto: assim a grade
   * acompanha o zoom e é a mesma no palco do mestre, na TV de 1920 e no celular
   * de 390.
   */
  size: number;
  /**
   * Deslocamento da origem.
   *
   * Existe porque mapas comprados já vêm com uma grade desenhada, e ela quase
   * nunca começa no canto exato da imagem. Sem isto, casar as duas exigiria
   * recortar o arquivo.
   */
  offsetX: number;
  offsetY: number;
  /** Opacidade da linha, de 0 a 1. */
  opacity: number;
  /**
   * Linha escura em vez de clara.
   *
   * Duas opções, e não um seletor de cor: o que decide é o mapa embaixo, e
   * mapa de RPG é claro (pergaminho, planta baixa) ou escuro (caverna, noite).
   * Um seletor cobriria casos que não existem e pediria uma decisão a mais em
   * cada cena.
   */
  dark?: boolean;
};

/**
 * Ponto de anotação: um alfinete no mapa com nota e anexos, só do mestre.
 *
 * Mora na CENA porque é colado num lugar dela — o alçapão atrás do balcão, a
 * marca na parede do terceiro corredor. Uma lista de notas fora da cena
 * perderia justamente a coordenada, que é a razão de existir.
 *
 * Morar na cena tem um custo que precisa de guarda: a cena viaja inteira para
 * a mesa. É por isso que `sceneForTable` existe e que a camada que desenha os
 * pontos vive no `OperatorStage`, e não no `SceneLayer` compartilhado — sem as
 * duas coisas, o jogador leria a preparação do mestre no inspetor do
 * navegador.
 */
export type MapPin = {
  id: string;
  /** Onde o alfinete crava, em coordenadas de cena. */
  x: number;
  y: number;
  /** Uma linha, para reconhecer o ponto sem abrir a nota. */
  title: string;
  /** O texto livre. Pode ser vazio: às vezes o anexo é a nota. */
  note: string;
  /**
   * Anexos, por id do acervo.
   *
   * Ids e não arquivos próprios: importar já copia para `assets/` da campanha,
   * e `/asset/{id}` já serve com token. Um segundo cofre de arquivos
   * duplicaria os dois lados para nada — e é justamente esse caminho que
   * "transmitir" usa para a imagem aparecer na TV.
   */
  attachments: string[];
};

/** O que o chamador informa ao cravar um ponto; o resto é do store. */
export type NewMapPin = Pick<MapPin, "x" | "y"> & Partial<Pick<MapPin, "title" | "note">>;

/**
 * A imagem em evidência: o que o mestre mandou a mesa olhar agora.
 *
 * Nível de sessão, como a trilha, e não da cena: transmitir um retrato de PNJ
 * não deve sumir porque o mestre trocou o mapa embaixo.
 *
 * Não é persistida de propósito, e aqui ela difere da trilha. Trilha é
 * ambiente e continua valendo de uma sessão para a outra; evidência é um gesto
 * — "olha isto" — e restaurá-la ao reabrir o aplicativo mandaria para a TV um
 * documento que a mesa já passou. Nada se perde: o ponto de anotação guarda o
 * anexo, e retransmitir é um clique.
 */
export type Spotlight = {
  assetId: string;
  /** O título do ponto de onde a imagem saiu, para a mesa saber o que é. */
  caption?: string;
  /**
   * Quando entrou no ar.
   *
   * Muda a cada transmissão, e é o que faz o espectador reconhecer uma imagem
   * nova: comparar `assetId` não distinguiria transmitir o mesmo arquivo duas
   * vezes, que é como se chama a atenção de novo para ele.
   */
  since: number;
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
 * Trilha da sessão.
 *
 * Pertence ao sistema, não a uma cena: a música acompanha a mesa e não deve
 * ser cortada porque o mestre trocou de cena. Antes vivia dentro de `Scene`, e
 * era exatamente isso que acontecia.
 *
 * Continua viajando junto da cena no canal, porque a TV e os celulares
 * precisam saber o que tocar.
 */
export type SessionTrack = {
  assetId: string;
  loop: boolean;
  /** 0 a 1. Único volume do som, e vale em todas as telas. */
  volume: number;
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
   * Pontos de anotação do mestre. Ausente = nenhum.
   *
   * NUNCA chega à mesa: `sceneForTable` remove este campo antes de publicar.
   */
  pins?: MapPin[];
  /**
   * Enquadramento que a Plateia e o Assistir usam. Ausente = plano inteiro.
   * O zoom do Operador só chega aqui quando ele manda, pelo botão de enquadrar.
   */
  camera?: Viewport;
  /** Grade sobre o mapa. Ausente = sem grade. */
  grid?: SceneGrid;
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

/**
 * Grade que uma cena ganha ao ser ligada pela primeira vez.
 *
 * 96 unidades num plano de 1920 dá 20 colunas por 11 linhas e meia — perto do
 * que um mapa de batalha costuma usar, e um número redondo de onde ajustar.
 */
export const DEFAULT_GRID: SceneGrid = { size: 96, offsetX: 0, offsetY: 0, opacity: 0.35 };

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
    // Os anexos continuam apontando para os MESMOS assets: o arquivo é do
    // acervo da campanha, não do ponto, e copiá-lo duplicaria um mapa de 8 MB
    // por duplicar a cena.
    pins: source.pins?.map((pin) => ({ ...pin, id: crypto.randomUUID() })),
    createdAt: now,
    updatedAt: now,
  };
}

export function createEmptyBoard(): Board {
  const first = createScene("Cena 1");
  return { scenes: [first], editingSceneId: first.id, liveSceneId: first.id };
}
