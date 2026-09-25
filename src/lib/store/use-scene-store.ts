"use client";

import { create } from "zustand";

import { novoId } from "@/lib/id";

import {
  canRedo,
  canUndo,
  emptyHistory,
  pushHistory,
  redoStep,
  undoStep,
  type History,
} from "@/lib/mestre/history";
import {
  appendScene,
  insertSceneAfter,
  moveSceneToIndex as moveSceneToIndexInBoard,
  removeScene as removeSceneFromBoard,
} from "@/lib/mestre/board-ops";
import {
  moveItemsBefore,
  moveItemToFrontFirstIndex,
  reorderByZ,
  type ZDirection,
} from "@/lib/mestre/z-order";
import {
  ancorada,
  dependeDe,
  mesmaPonta,
  pontaIgual,
  semReferencia,
  tracadoDe,
} from "@/lib/mestre/ligacoes";
import { useCharactersStore } from "@/lib/store/use-characters-store";
import { useTrackStore } from "@/lib/store/use-track-store";
import { loadBoard, saveBoard, saveBoardPatch } from "@/lib/vault/board";
import {
  criarDocumento,
  gravarDocumento,
  lerDocumento,
} from "@/lib/vault/documentos";
import {
  cloneScene,
  CORES_POSTIT,
  createEmptyBoard,
  createScene,
  NOME_DO_TIPO,
  POSTIT_ALTURA,
  POSTIT_LARGURA,
  type Board,
  type CameraSalva,
  type CanvasItem,
  type Forma,
  type FogRegion,
  type Grupo,
  type ItemDraft,
  type MapPin,
  type NewCanvasItem,
  type NewFogRegion,
  type NewForma,
  type NewPostit,
  type NewTraco,
  type Traco,
  type NewMapPin,
  type Postit,
  type Scene,
  type SceneGrid,
  type TipoDeCena,
  type Viewport,
  type Medidor,
  type NewDocumento,
  type Nota,
  type NewMedidor,
  type NewParede,
  type Parede,
  type Sol,
  type NewTexto,
  type Pasta,
  type PontaDeLigacao,
  type Texto,
  type Ligacao,
  type Documento,
  DOCUMENTO_ALTURA,
  DOCUMENTO_LARGURA,
  TEXTO_TAMANHO,
} from "@/types/scene";

type HydrationStatus = "idle" | "loading" | "ready" | "error";

/**
 * Janela de fusão do histórico.
 *
 * Mudanças mais próximas que isto entram no mesmo passo de desfazer. Um
 * arrasto emite dezenas de alterações por segundo e precisa voltar de uma vez.
 */
const COALESCE_MS = 400;

export type ItemPatch = { id: string; patch: Partial<CanvasItem> };

/** O mesmo para o texto solto: é o que o gesto de grupo entrega por quadro. */
export type TextoPatch = { id: string; patch: Partial<Omit<Texto, "id">> };

/** E para a forma do quadro, que anda no mesmo gesto e no mesmo gizmo. */
export type FormaPatch = { id: string; patch: Partial<Omit<Forma, "id">> };

/**
 * Os três que a área de seleção passou a laçar e que só ANDAM: papel, cartão
 * e risco.
 *
 * Cada um na própria lista, como o texto e a forma, porque cada um é uma lista
 * da cena. O que os junta é a limitação: nenhum deles escala nem gira pelo
 * gizmo -- o papel e o cartão medem o texto por dentro em unidades de cena, e
 * o risco é uma nuvem de pontos sem caixa própria. Por isso o gizmo de alças
 * sai do ar quando um deles está na mão. Ver `grupo-sem-alca`.
 */
export type PostitPatch = { id: string; patch: Partial<Omit<Postit, "id">> };
export type DocumentoPatch = {
  id: string;
  patch: Partial<Omit<Documento, "id" | "arquivo">>;
};
export type TracoPatch = { id: string; patch: Partial<Omit<Traco, "id">> };

export type { ZDirection };

type SceneStore = {
  board: Board | null;
  status: HydrationStatus;
  error: string | null;

  history: History<Board>;
  /** Momento da última alteração, para decidir a fusão do histórico. */
  lastCommitAt: number;
  undo: () => void;
  redo: () => void;

  /**
   * Qual campanha o board carregado pertence.
   *
   * Existe para a hidratação se guardar sozinha. A versão sem isto saía cedo
   * "se já carregou", e trocar de campanha mantinha o board da anterior na
   * tela — com o agravante de que a próxima gravação o escreveria dentro da
   * campanha nova.
   */
  campaignPath: string | null;

  /**
   * Carrega o board do vault.
   *
   * Com a nuvem foram embora a versão remota, a marca de pendente e o estado
   * de conflito — o disco é a verdade, e não há segunda ponta com quem
   * discordar.
   */
  hydrate: (campaignPath: string) => Promise<void>;
  /** Abre a cena no palco do Mestre. Não muda o que a mesa vê. */
  setEditingSceneId: (sceneId: string | null) => void;
  /** Coloca a cena no ar. `null` deixa a mesa sem nada -- ou mostra a capa. */
  setLiveSceneId: (sceneId: string | null) => void;
  /**
   * Marca a capa da campanha. `null` tira a que houver e não põe outra.
   *
   * Uma só: marcar desmarca a anterior no mesmo commit, para não haver o
   * instante em que duas cenas se dizem capa. Ver `Scene.capa`.
   */
  definirCapa: (sceneId: string | null) => void;
  /**
   * Cria e abre no palco. `tipo` ausente é mapa; `"quadro"` é a mesa de
   * trabalho do mestre. O nome de fábrica conta só as do mesmo tipo: "Quadro 1"
   * numa campanha de trinta mapas, e não "Quadro 31".
   */
  addScene: (name?: string, tipo?: TipoDeCena) => string;
  renameScene: (sceneId: string, name: string) => void;
  duplicateScene: (sceneId: string) => string | null;
  /** Posição na lista de cenas. É o que o arrasto da lista emite. */
  moveSceneToIndex: (sceneId: string, index: number) => void;
  removeScene: (sceneId: string) => void;

  /**
   * As pastas dos quadros. Espelham as do grupo de itens -- criar, renomear,
   * recolher, mover, desfazer -- mas moram no board, porque atravessam cenas.
   * Desfazer solta o que há dentro um nível acima; nunca apaga quadro.
   */
  criarPasta: (nome: string, parentId?: string) => string;
  atualizarPasta: (pastaId: string, patch: Partial<Omit<Pasta, "id">>) => void;
  /** Recusa ciclo: pasta dentro de descendente dela. */
  moverPasta: (pastaId: string, parentId: string | undefined) => void;
  removerPasta: (pastaId: string) => void;
  /** Leva um quadro para uma pasta. `undefined` é a raiz. */
  moverParaPasta: (sceneId: string, pastaId: string | undefined) => void;

  /**
   * As notas `.md`. O arquivo já existe quando a nota entra -- quem o cria é
   * `criarDocumento`, assíncrono. Apagar a nota tira também os cartões dela de
   * todos os quadros; o arquivo é do chamador.
   */
  addNota: (nota: Omit<Nota, "id">) => string;
  renomearNota: (notaId: string, titulo: string) => void;
  moverNotaParaPasta: (notaId: string, pastaId: string | undefined) => void;
  removerNota: (notaId: string) => void;
  /** Toca `atualizadoEm` nos cartões de um arquivo, em todos os quadros. Sem histórico. */
  tocarDocumentos: (arquivo: string) => void;
  /** Primitiva única de mutação de cena. Toda operação de item usa isto. */
  updateScene: (sceneId: string, updater: (scene: Scene) => Scene) => void;

  setBackground: (sceneId: string, assetId: string | undefined) => void;
  /** `undefined` devolve a mesa ao plano inteiro. */
  setSceneCamera: (sceneId: string, camera: Viewport | undefined) => void;
  /** Cria uma câmera. Devolve o id. */
  salvarCamera: (sceneId: string, camera: Omit<CameraSalva, "id">) => string;
  /**
   * Altera uma câmera. Se ela está no ar, o recorte novo vai junto para
   * `camera`, que é o que a mesa lê: transmitir é contínuo, não um retrato.
   */
  atualizarCamera: (
    sceneId: string,
    cameraId: string,
    patch: Partial<Omit<CameraSalva, "id">>,
  ) => void;
  /** Remove. Se era a que estava no ar, a mesa volta à cena inteira. */
  removerCamera: (sceneId: string, cameraId: string) => void;
  /** Põe uma câmera no ar, ou nenhuma: aí a mesa vê a cena inteira. */
  transmitirCamera: (sceneId: string, cameraId: string | undefined) => void;
  /**
   * Liga, ajusta ou desliga a grade da cena. `undefined` desliga.
   *
   * Passa pelo `updateScene`, e portanto pelo histórico: ligar a grade é uma
   * edição da cena como qualquer outra, e Ctrl+Z tem de desfazê-la.
   */
  setSceneGrid: (sceneId: string, grid: SceneGrid | undefined) => void;
  /** Devolve o id do item criado, para já deixá-lo selecionado. */
  addItem: (sceneId: string, item: NewCanvasItem) => string;
  /** Devolve os ids na mesma ordem dos rascunhos. */
  addItems: (sceneId: string, drafts: ItemDraft[]) => string[];
  updateItem: (
    sceneId: string,
    itemId: string,
    patch: Partial<CanvasItem>,
  ) => void;
  /** Um único update para N itens: arrastar em grupo não pode gravar N vezes por frame. */
  updateItems: (sceneId: string, patches: ItemPatch[]) => void;
  /**
   * Troca a imagem dos tokens de um personagem em TODAS as cenas.
   *
   * Todas, e não só a que está no ar: o personagem é um só, e o token dele no
   * mapa do porão não tem por que mostrar a cara de três sessões atrás. Uma
   * varredura no gesto da troca, e nada por quadro — resolver a imagem do token
   * ao vivo, como `retratosDaCena` faz com o retrato, custaria trabalho no
   * desenho do mapa para ganhar o que ninguém vê.
   *
   * FORA do histórico: desfazer restaura conteúdo de cena, e trocar de aparência
   * é estrutura. Desfazer uma troca é trocar de volta, pela lista.
   */
  aplicarAparencia: (personagemId: string, miniatura: string | undefined) => void;
  removeItems: (sceneId: string, itemIds: string[]) => void;
  moveItemsZ: (
    sceneId: string,
    itemIds: string[],
    direction: ZDirection,
  ) => void;
  /** Índice na lista frente-primeiro do painel de camadas. */
  moveItemToIndex: (
    sceneId: string,
    itemId: string,
    frontFirstIndex: number,
  ) => void;
  setItemsLocked: (sceneId: string, itemIds: string[], locked: boolean) => void;

  /**
   * Cria um grupo com estes itens dentro. Devolve o id. `parentId` presente =
   * nasce dentro de outro grupo.
   */
  criarGrupo: (
    sceneId: string,
    nome: string,
    itemIds: string[],
    parentId?: string,
  ) => string;
  atualizarGrupo: (
    sceneId: string,
    grupoId: string,
    patch: Partial<Omit<Grupo, "id">>,
  ) => void;
  /**
   * Desfaz o grupo. Itens e subgrupos sobem para o pai dele, ou para a raiz.
   * Nunca apaga item: desagrupar é organização, não remoção.
   */
  removerGrupo: (sceneId: string, grupoId: string) => void;
  /**
   * O que um arrasto na lista de camadas faz: põe os itens numa pasta E os
   * reposiciona, num commit só.
   *
   * Um só porque é um gesto só: em duas chamadas, o desfazer pedia dois
   * Ctrl+Z para voltar um arrasto. `antesDe` nulo manda para o fundo.
   */
  soltarItens: (
    sceneId: string,
    itemIds: string[],
    grupoId: string | undefined,
    antesDe: string | null,
  ) => void;
  /** Põe itens num grupo, ou tira deles (`undefined` = raiz). */
  moverParaGrupo: (
    sceneId: string,
    itemIds: string[],
    grupoId: string | undefined,
  ) => void;
  /**
   * Põe um grupo dentro de outro, ou na raiz. Recusa ciclo: um grupo não entra
   * em si mesmo nem num descendente seu.
   */
  moverGrupo: (
    sceneId: string,
    grupoId: string,
    parentId: string | undefined,
  ) => void;

  addFog: (sceneId: string, region: NewFogRegion) => string;
  /** Crava um risco. Passa pelo histórico: riscar é edição da cena. */
  addTraco: (sceneId: string, traco: NewTraco) => string;
  /**
   * Apaga vários riscos de uma vez.
   *
   * Vários e não um: a borracha atravessa três riscos numa passada, e apagar um
   * por um daria três entradas no desfazer para um gesto só.
   */
  removeTracos: (sceneId: string, tracoIds: string[]) => void;
  /**
   * Move riscos: o patch traz os pontos JÁ deslocados, e não um `dx/dy`.
   *
   * O risco não tem canto nem caixa gravada -- ele é a nuvem de pontos --,
   * então o store não teria como aplicar um deslocamento sem refazer a conta
   * que quem arrasta já fez. Ver `empurrarTracos`.
   */
  updateTracos: (sceneId: string, patches: TracoPatch[]) => void;
  /** Coloca um medidor. Passa pelo histórico: medir e deixar é edição da cena. */
  addMedidor: (sceneId: string, medidor: NewMedidor) => string;
  updateMedidor: (
    sceneId: string,
    medidorId: string,
    patch: Partial<Omit<Medidor, "id">>,
  ) => void;
  removeMedidores: (sceneId: string, medidorIds: string[]) => void;

  /**
   * Traça uma parede: o segmento em que a luz para. Ver `Parede`.
   *
   * Passa pelo histórico, como o risco e o medidor: parede é edição da cena, e
   * traçar dez seguidas e querer a última de volta é o gesto normal de quem
   * está contornando um mapa.
   */
  addParede: (sceneId: string, parede: NewParede) => string;
  updateParede: (
    sceneId: string,
    paredeId: string,
    patch: Partial<Omit<Parede, "id">>,
  ) => void;
  /** Apaga várias de uma vez, como a borracha faz com os riscos. */
  removeParedes: (sceneId: string, paredeIds: string[]) => void;
  /**
   * Liga, ajusta ou desliga o sol da cena. `undefined` desliga.
   *
   * Um só por cena, então não há id nem lista: é uma troca de valor, e não uma
   * coleção. Ver `Sol`.
   */
  setSol: (sceneId: string, sol: Sol | undefined) => void;
  updateFog: (
    sceneId: string,
    fogId: string,
    patch: Partial<FogRegion>,
  ) => void;
  removeFog: (sceneId: string, fogId: string) => void;

  /** Crava um ponto de anotação. Devolve o id, para já abrir a nota dele. */
  addPin: (sceneId: string, pin: NewMapPin) => string;
  updatePin: (sceneId: string, pinId: string, patch: Partial<MapPin>) => void;
  removePin: (sceneId: string, pinId: string) => void;
  /** Anexa arquivos do acervo ao ponto, sem repetir os que já estão nele. */
  attachToPin: (sceneId: string, pinId: string, assetIds: string[]) => void;
  detachFromPin: (sceneId: string, pinId: string, assetId: string) => void;

  /**
   * Guarda imagens do acervo no handout da cena. Repetidas não entram.
   * Ver `Scene.handout`.
   */
  guardarNoHandout: (sceneId: string, assetIds: string[]) => void;
  tirarDoHandout: (sceneId: string, assetId: string) => void;

  /** Cola um postit. Devolve o id, para já abrir o texto dele para digitar. */
  addPostit: (sceneId: string, postit: NewPostit) => string;
  updatePostit: (
    sceneId: string,
    postitId: string,
    patch: Partial<Postit>,
  ) => void;
  /** Vários de uma vez -- o grupo que a área laçou, num Ctrl+Z só. */
  updatePostits: (sceneId: string, patches: PostitPatch[]) => void;
  removePostit: (sceneId: string, postitId: string) => void;
  removePostits: (sceneId: string, postitIds: string[]) => void;

  /** Texto solto do quadro. Ver `Texto`. Devolve o id. */
  addTexto: (sceneId: string, texto: NewTexto) => string;
  /** Vários de uma vez, na ordem dada: um commit só para o Ctrl+V de um punhado. */
  addTextos: (sceneId: string, textos: NewTexto[]) => string[];
  updateTexto: (
    sceneId: string,
    textoId: string,
    patch: Partial<Omit<Texto, "id">>,
  ) => void;
  /** Vários de uma vez — o grupo arrastado, escalado ou girado. Um Ctrl+Z só. */
  updateTextos: (sceneId: string, patches: TextoPatch[]) => void;
  removeTexto: (sceneId: string, textoId: string) => void;
  removeTextos: (sceneId: string, textoIds: string[]) => void;

  /** Forma geométrica do quadro. Ver `Forma`. Devolve o id. */
  addForma: (sceneId: string, forma: NewForma) => string;
  addFormas: (sceneId: string, formas: NewForma[]) => string[];
  updateForma: (
    sceneId: string,
    formaId: string,
    patch: Partial<Omit<Forma, "id">>,
  ) => void;
  updateFormas: (sceneId: string, patches: FormaPatch[]) => void;
  removeFormas: (sceneId: string, formaIds: string[]) => void;

  /**
   * Cartão de documento. O arquivo já existe quando o cartão entra: quem cria
   * o arquivo é `criarDocumento`, assíncrono, e o cartão só nasce com o nome
   * dele na mão. Apagar o cartão NÃO apaga o arquivo aqui -- isso é do
   * chamador, que sabe se está desfazendo ou removendo de verdade.
   */
  addDocumento: (sceneId: string, documento: NewDocumento) => string;
  updateDocumento: (
    sceneId: string,
    documentoId: string,
    patch: Partial<Omit<Documento, "id" | "arquivo">>,
  ) => void;
  /** Vários de uma vez, como os postits. */
  updateDocumentos: (sceneId: string, patches: DocumentoPatch[]) => void;
  removeDocumento: (sceneId: string, documentoId: string) => void;
  removeDocumentos: (sceneId: string, documentoIds: string[]) => void;
  /**
   * Guarda a caixa medida de um texto. Sem histórico: medir não é edição, e
   * um Ctrl+Z que desfizesse uma medida seria um Ctrl+Z que não faz nada.
   * Ignora diferença abaixo de meia unidade, para o observador não gravar
   * o board a cada quadro por ruído de arredondamento.
   */
  medirTexto: (
    sceneId: string,
    textoId: string,
    caixa: { largura: number; altura: number },
  ) => void;

  /**
   * Seta no quadro, com cada ponta ancorada numa coisa ou livre num ponto.
   * Recusa as duas pontas na mesma coisa e seta repetida entre as mesmas
   * duas âncoras, no mesmo sentido. Devolve o id, ou `null` quando recusou.
   */
  addLigacao: (
    sceneId: string,
    de: PontaDeLigacao,
    para: PontaDeLigacao,
  ) => string | null;
  /**
   * Rótulo, dobra, ou uma ponta movida -- para outro ponto, ou para outra
   * âncora.
   */
  updateLigacao: (
    sceneId: string,
    ligacaoId: string,
    patch: Partial<Pick<Ligacao, "rotulo" | "de" | "para" | "curva">>,
  ) => void;
  removeLigacao: (sceneId: string, ligacaoId: string) => void;
};

/**
 * O que o desfazer pode tocar: o CONTEÚDO das cenas, e só.
 *
 * O histórico guarda o board inteiro por passo, e voltar um passo inteiro
 * desfazia também o que não é edição: criar um quadro, apagar uma nota, mover
 * uma cena de pasta. Um Ctrl+Z a mais depois de criar um quadro apagava o
 * quadro -- e a nota, que é arquivo em disco, sumia da lista sem o arquivo
 * voltar. Estrutura não é gesto; não volta por Ctrl+Z.
 *
 * Então o passo restaurado é montado assim: o conjunto, a ordem, o nome e a
 * pasta de cada cena são os de AGORA; o conteúdo de cada cena é o do passo,
 * quando ela existia lá. Cena que nasceu depois do passo fica como está.
 * Notas, pastas e o que está aberto ou no ar também ficam como estão.
 */
export function soConteudo(atual: Board, alvo: Board): Board {
  const doPasso = new Map(alvo.scenes.map((scene) => [scene.id, scene]));

  return {
    ...atual,
    scenes: atual.scenes.map((scene) => {
      const antiga = doPasso.get(scene.id);
      if (!antiga) return scene;
      const restaurada: Scene = { ...antiga, name: scene.name };
      if (scene.pastaId !== undefined) restaurada.pastaId = scene.pastaId;
      else delete restaurada.pastaId;
      // A capa acompanha o nome e a pasta: é escolha de CAMPANHA, e não
      // conteúdo da cena. Desfazer um token movido não pode tirar da TV o que
      // a mesa vê entre uma cena e outra. Ver `Scene.capa`.
      if (scene.capa) restaurada.capa = scene.capa;
      else delete restaurada.capa;
      return restaurada;
    }),
  };
}

/**
 * O board com a imagem dos tokens de um personagem trocada.
 *
 * Devolve a MESMA referência quando nada muda, e é o que deixa quem chama saber
 * que não há o que gravar — um board novo idêntico acordaria o `subscribe` e
 * escreveria o disco por nada.
 *
 * Miniatura vazia não apaga o token: uma aparência sem miniatura anexada deixa
 * a peça como estava, porque um item sem `assetId` não desenha nada e o mestre
 * veria o personagem sumir do mapa ao escolher uma linha ainda em branco.
 */
export function comAAparencia(
  board: Board,
  personagemId: string,
  miniatura: string | undefined,
): Board {
  if (!miniatura) return board;

  let mexeu = false;

  const scenes = board.scenes.map((scene) => {
    let daCena = false;

    const items = scene.items.map((item) => {
      if (item.personagemId !== personagemId || item.assetId === miniatura) {
        return item;
      }

      daCena = true;
      return { ...item, assetId: miniatura };
    });

    if (!daCena) return scene;

    mexeu = true;
    return { ...scene, items, updatedAt: Date.now() };
  });

  return mexeu ? { ...board, scenes } : board;
}

/**
 * O board com TODO token mostrando a aparência ativa do dono.
 *
 * Existe por causa do desfazer. A troca de aparência fica fora do histórico, mas
 * o histórico guarda cenas INTEIRAS: um Ctrl+Z de qualquer gesto anterior à
 * troca restauraria `scene.items` de um retrato em que o token ainda tinha a
 * imagem velha — a ficha diria "Ferido" e o mapa mostraria a cara de antes. Sem
 * este passo, "fora do histórico" valeria só até o primeiro desfazer.
 *
 * Só percorre item com `personagemId`, e só no gesto de desfazer. Nada por
 * quadro.
 */
export function comAsAparenciasAtivas(
  board: Board,
  personagens: ReadonlyArray<{ id: string; miniatura?: string }>,
): Board {
  return personagens.reduce(
    (atual, personagem) =>
      comAAparencia(atual, personagem.id, personagem.miniatura),
    board,
  );
}

/**
 * `comAsAparenciasAtivas` com os personagens que o store já leu.
 *
 * Lista ainda não lida (`null`) devolve o board como está: o Mestre acabou de
 * montar e ninguém trocou aparência nenhuma ainda, então não há o que
 * reconciliar.
 */
function aparenciasEmDia(board: Board): Board {
  const { personagens } = useCharactersStore.getState();
  return personagens ? comAsAparenciasAtivas(board, personagens) : board;
}

export const useSceneStore = create<SceneStore>((set, get) => {
  /**
   * Toda alteração de conteúdo passa por aqui, e é o único lugar que alimenta
   * o histórico. Navegação — qual cena está aberta, qual está no ar — usa
   * `set` direto: desfazer deve voltar edições, não passos de navegação.
   */
  function commit(next: Board) {
    const { board, history, lastCommitAt } = get();
    const now = Date.now();

    set({
      board: next,
      history: board
        ? pushHistory(history, board, now - lastCommitAt < COALESCE_MS)
        : history,
      lastCommitAt: now,
    });
  }

  return {
    board: null,
    status: "idle",
    error: null,
    campaignPath: null,

    history: emptyHistory<Board>(),
    lastCommitAt: 0,

    undo() {
      const { board, history } = get();
      if (!board) return;

      const step = undoStep(history, board);
      if (!step) return;

      // Zera o relógio de fusão: a próxima edição abre passo novo em vez de se
      // grudar no que existia antes do desfazer.
      set({
        board: aparenciasEmDia(soConteudo(board, step.value)),
        history: step.history,
        lastCommitAt: 0,
      });
    },

    redo() {
      const { board, history } = get();
      if (!board) return;

      const step = redoStep(history, board);
      if (!step) return;

      set({
        board: aparenciasEmDia(soConteudo(board, step.value)),
        history: step.history,
        lastCommitAt: 0,
      });
    },

    async hydrate(campaignPath) {
      // Sai fora se já carregou ESTA campanha: o Mestre remonta, e reler o
      // disco por cima do que está sendo editado perderia edição que o debounce
      // ainda não gravou. Campanha diferente sempre recarrega.
      if (get().campaignPath === campaignPath && get().status !== "idle")
        return;

      // Zera antes de ler: sem isto o board da campanha anterior ficaria na tela
      // durante a leitura, e o assinante de gravação o escreveria na campanha
      // nova.
      // Zera a base da diferença ANTES de ler: ela descreve o que o disco da
      // campanha ANTERIOR tinha, e usá-la para diferenciar o board de outra
      // campanha mandaria um patch medido contra o vault errado.
      salvo = null;

      set({
        board: null,
        status: "loading",
        campaignPath,
        history: emptyHistory<Board>(),
      });

      try {
        // Campanha sem board ainda devolve `null`, e quem cria o primeiro é
        // daqui: o formato de `Scene` é da tela, e o Rust trata cena como JSON
        // opaco justamente para o formato não ter duas fontes de verdade.
        const carregado = await loadBoard();
        const board = comNotasDosCartoes(carregado ?? createEmptyBoard());

        // Board que veio do disco JÁ está no disco: a primeira gravação depois de
        // abrir a campanha pode ser um patch. Board criado aqui — campanha sem
        // board ainda — não, e por isso a base fica nula: não existe arquivo
        // nenhum contra o que diferenciar.
        salvo = carregado;

        // Histórico nasce vazio: não faz sentido desfazer para antes de abrir.
        set({
          board,
          status: "ready",
          error: null,
          campaignPath,
          history: emptyHistory<Board>(),
          lastCommitAt: 0,
        });
      } catch (cause) {
        // Sem board não há tela: ao contrário da falha de rede de antes, que
        // deixava o Mestre editável e só avisava que não estava subindo, um
        // disco ilegível não tem versão local para cair.
        set({
          status: "error",
          error:
            cause instanceof Error ? cause.message : "Falha ao abrir o board",
        });
      }
    },

    setEditingSceneId(sceneId) {
      const { board } = get();
      if (!board) return;

      set({ board: { ...board, editingSceneId: sceneId } });
    },

    setLiveSceneId(sceneId) {
      const { board } = get();
      if (!board) return;

      set({ board: { ...board, liveSceneId: sceneId } });
    },

    definirCapa(sceneId) {
      const { board } = get();
      if (!board) return;

      // Uma passada só sobre a lista, marcando uma e desmarcando as outras.
      // Quem não muda devolve a MESMA cena: a gravação por diferença compara
      // identidade, e uma cópia por cena reescreveria a campanha inteira no
      // disco para mexer numa marca. Ver `persistir`.
      const scenes = board.scenes.map((scene) => {
        const deve = scene.id === sceneId || undefined;
        if (scene.capa === deve) return scene;

        const proxima = { ...scene, capa: deve };
        // `capa: undefined` gravaria a chave no JSON de toda cena que já foi
        // capa um dia. A ausência é o estado, e ela some do objeto.
        if (!deve) delete proxima.capa;

        return proxima;
      });

      commit({ ...board, scenes });
    },

    addScene(name, tipo) {
      const { board } = get();
      const iguais =
        board?.scenes.filter((scene) => scene.tipo === tipo).length ?? 0;
      const scene = createScene(
        name ?? `${NOME_DO_TIPO[tipo ?? "mapa"]} ${iguais + 1}`,
        tipo,
      );
      const base = board ?? {
        scenes: [],
        editingSceneId: null,
        liveSceneId: null,
      };

      commit(appendScene(base, scene));

      return scene.id;
    },

    renameScene(sceneId, name) {
      get().updateScene(sceneId, (scene) => ({ ...scene, name }));
    },

    duplicateScene(sceneId) {
      const { board } = get();
      const source = board?.scenes.find((scene) => scene.id === sceneId);
      if (!board || !source) return null;

      const copy = cloneScene(source, `${source.name} (cópia)`);
      commit(insertSceneAfter(board, sceneId, copy));

      // Que ambientes a cena acende mora FORA do board, no `TrackStore`, para
      // o histórico de desfazer não religar a chuva por causa de um Ctrl+Z num
      // token. O preço é esta linha: sem ela a cópia da taverna abriria sem a
      // lareira que a taverna tem.
      useTrackStore.getState().copiarCena(sceneId, copy.id);

      // Cada documento da cópia ganha o próprio arquivo, com o mesmo texto:
      // dois cartões no mesmo `.md` fariam escrever num aparecer no outro.
      // Assíncrono e depois do commit, porque criar arquivo passa pela ponte;
      // até chegar, a cópia lê o arquivo original, que é o texto certo.
      for (const documento of copy.documentos ?? []) {
        void (async () => {
          const texto = await lerDocumento(documento.arquivo);
          const arquivo = await criarDocumento(documento.titulo);
          await gravarDocumento(arquivo, texto);
          get().updateScene(copy.id, (scene) => ({
            ...scene,
            documentos: scene.documentos?.map((atual) =>
              atual.id === documento.id ? { ...atual, arquivo } : atual,
            ),
          }));
        })().catch((cause: unknown) => {
          console.error("falha ao copiar o documento", cause);
        });
      }

      return copy.id;
    },

    moveSceneToIndex(sceneId, index) {
      const { board } = get();
      if (!board) return;

      commit(moveSceneToIndexInBoard(board, sceneId, index));
    },

    removeScene(sceneId) {
      const { board } = get();
      if (!board) return;

      commit(removeSceneFromBoard(board, sceneId));
      // O outro lado da memória de ambiente viver fora do board: sem isto o
      // mapa guardaria a chuva de uma cena que não existe mais, para sempre.
      // Ver `copiarCena` acima.
      useTrackStore.getState().esquecerCena(sceneId);
    },

    criarPasta(nome, parentId) {
      const { board } = get();
      const id = novoId();
      if (!board) return id;

      commit({
        ...board,
        pastas: [...(board.pastas ?? []), { id, nome: nome.trim(), parentId }],
      });

      return id;
    },

    atualizarPasta(pastaId, patch) {
      const { board } = get();
      if (!board) return;

      commit({
        ...board,
        pastas: (board.pastas ?? []).map((pasta) =>
          pasta.id === pastaId ? { ...pasta, ...patch } : pasta,
        ),
      });
    },

    moverPasta(pastaId, parentId) {
      const { board } = get();
      if (!board) return;
      const pastas = board.pastas ?? [];

      // Sobe do destino até a raiz; se passar pela própria pasta, é ciclo.
      let cursor = parentId;
      while (cursor) {
        if (cursor === pastaId) return;
        cursor = pastas.find((pasta) => pasta.id === cursor)?.parentId;
      }

      commit({
        ...board,
        pastas: pastas.map((pasta) =>
          pasta.id === pastaId ? { ...pasta, parentId } : pasta,
        ),
      });
    },

    removerPasta(pastaId) {
      const { board } = get();
      const alvo = board?.pastas?.find((pasta) => pasta.id === pastaId);
      if (!board || !alvo) return;

      const pastas = (board.pastas ?? [])
        .filter((pasta) => pasta.id !== pastaId)
        .map((pasta) =>
          pasta.parentId === pastaId
            ? { ...pasta, parentId: alvo.parentId }
            : pasta,
        );

      commit({
        ...board,
        // Lista vazia sai do objeto, como `grupos` na cena.
        pastas: pastas.length > 0 ? pastas : undefined,
        scenes: board.scenes.map((scene) =>
          scene.pastaId === pastaId
            ? { ...scene, pastaId: alvo.parentId }
            : scene,
        ),
      });
    },

    addNota(nota) {
      const { board } = get();
      const id = novoId();
      if (!board) return id;
      commit({ ...board, notas: [...(board.notas ?? []), { ...nota, id }] });
      return id;
    },

    renomearNota(notaId, titulo) {
      const { board } = get();
      const nota = board?.notas?.find((atual) => atual.id === notaId);
      if (!board || !nota) return;
      const limpo = titulo.trim();
      if (!limpo || limpo === nota.titulo) return;

      commit({
        ...board,
        notas: board.notas?.map((atual) =>
          atual.id === notaId ? { ...atual, titulo: limpo } : atual,
        ),
        // A cópia nos cartões, para a mesa. Ver `Documento.titulo`.
        scenes: board.scenes.map((scene) =>
          scene.documentos?.some((documento) => documento.notaId === notaId)
            ? {
                ...scene,
                documentos: scene.documentos.map((documento) =>
                  documento.notaId === notaId
                    ? { ...documento, titulo: limpo }
                    : documento,
                ),
              }
            : scene,
        ),
      });
    },

    moverNotaParaPasta(notaId, pastaId) {
      const { board } = get();
      if (!board) return;
      commit({
        ...board,
        notas: board.notas?.map((nota) => {
          if (nota.id !== notaId) return nota;
          const proxima = { ...nota };
          if (pastaId) proxima.pastaId = pastaId;
          else delete proxima.pastaId;
          return proxima;
        }),
      });
    },

    removerNota(notaId) {
      const { board } = get();
      if (!board) return;
      const notas = (board.notas ?? []).filter((nota) => nota.id !== notaId);

      commit({
        ...board,
        notas: notas.length > 0 ? notas : undefined,
        scenes: board.scenes.map((scene) => {
          const mortos = (scene.documentos ?? [])
            .filter((documento) => documento.notaId === notaId)
            .map((documento) => documento.id);
          if (mortos.length === 0) return scene;
          const restantes = scene.documentos!.filter(
            (documento) => documento.notaId !== notaId,
          );
          return {
            ...scene,
            documentos: restantes.length > 0 ? restantes : undefined,
            ligacoes: semReferencia(scene.ligacoes, mortos),
          };
        }),
      });
    },

    tocarDocumentos(arquivo) {
      const { board } = get();
      if (!board) return;
      const agora = Date.now();
      let mudou = false;
      const scenes = board.scenes.map((scene) => {
        if (!scene.documentos?.some((documento) => documento.arquivo === arquivo))
          return scene;
        mudou = true;
        return {
          ...scene,
          documentos: scene.documentos.map((documento) =>
            documento.arquivo === arquivo
              ? { ...documento, atualizadoEm: agora }
              : documento,
          ),
        };
      });
      if (mudou) set({ board: { ...board, scenes } });
    },

    moverParaPasta(sceneId, pastaId) {
      get().updateScene(sceneId, (scene) => {
        if ((scene.pastaId ?? undefined) === pastaId) return scene;
        // Cópia e `delete`, como em `sceneForTable`: raiz é a AUSÊNCIA do
        // campo, e não `undefined` gravado no JSON.
        const proxima = { ...scene };
        if (pastaId) proxima.pastaId = pastaId;
        else delete proxima.pastaId;
        return proxima;
      });
    },

    updateScene(sceneId, updater) {
      const { board } = get();
      if (!board) return;

      commit({
        ...board,
        scenes: board.scenes.map((scene) =>
          scene.id === sceneId
            ? { ...updater(scene), updatedAt: Date.now() }
            : scene,
        ),
      });
    },

    setBackground(sceneId, assetId) {
      get().updateScene(sceneId, (scene) => ({
        ...scene,
        backgroundAssetId: assetId,
      }));
    },

    setSceneCamera(sceneId, camera) {
      get().updateScene(sceneId, (scene) => ({ ...scene, camera }));
    },

    salvarCamera(sceneId, camera) {
      const id = novoId();

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        cameras: [...(scene.cameras ?? []), { ...camera, id }],
      }));

      return id;
    },

    atualizarCamera(sceneId, cameraId, patch) {
      get().updateScene(sceneId, (scene) => {
        const noAr = scene.cameraNoArId === cameraId && patch.viewport;

        return {
          ...scene,
          cameras: (scene.cameras ?? []).map((camera) =>
            camera.id === cameraId ? { ...camera, ...patch } : camera,
          ),
          camera: noAr ? patch.viewport : scene.camera,
        };
      });
    },

    removerCamera(sceneId, cameraId) {
      get().updateScene(sceneId, (scene) => {
        const cameras = (scene.cameras ?? []).filter(
          (camera) => camera.id !== cameraId,
        );
        const eraNoAr = scene.cameraNoArId === cameraId;

        // Lista vazia sai do objeto, pela mesma razão de `grid` e `tracos`:
        // não engordar toda cena com um campo que não diz nada.
        return {
          ...scene,
          cameras: cameras.length > 0 ? cameras : undefined,
          cameraNoArId: eraNoAr ? undefined : scene.cameraNoArId,
          camera: eraNoAr ? undefined : scene.camera,
        };
      });
    },

    transmitirCamera(sceneId, cameraId) {
      get().updateScene(sceneId, (scene) => {
        const alvo = scene.cameras?.find((camera) => camera.id === cameraId);

        return {
          ...scene,
          cameraNoArId: alvo?.id,
          camera: alvo?.viewport,
        };
      });
    },

    setSceneGrid(sceneId, grid) {
      get().updateScene(sceneId, (scene) => ({ ...scene, grid }));
    },

    addItem(sceneId, item) {
      return get().addItems(sceneId, [item])[0];
    },

    addItems(sceneId, drafts) {
      const ids = drafts.map(() => novoId());

      get().updateScene(sceneId, (scene) => {
        // Nascem na frente de tudo: o mestre acabou de colocar, quer ver.
        const topZ = scene.items.reduce(
          (max, current) => Math.max(max, current.z),
          0,
        );

        const created: CanvasItem[] = drafts.map((draft, index) => ({
          rotation: 0,
          locked: false,
          ...draft,
          id: ids[index],
          z: topZ + index + 1,
        }));

        return { ...scene, items: [...scene.items, ...created] };
      });

      return ids;
    },

    updateItem(sceneId, itemId, patch) {
      get().updateItems(sceneId, [{ id: itemId, patch }]);
    },

    updateItems(sceneId, patches) {
      if (patches.length === 0) return;

      const byId = new Map(patches.map(({ id, patch }) => [id, patch]));

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        items: scene.items.map((item) => {
          const patch = byId.get(item.id);
          return patch ? { ...item, ...patch } : item;
        }),
      }));
    },

    aplicarAparencia(personagemId, miniatura) {
      const { board } = get();
      if (!board) return;

      const proximo = comAAparencia(board, personagemId, miniatura);
      // Referência igual = nenhum token daquele personagem no mapa. Gravar
      // assim mesmo acordaria o `subscribe` e escreveria o board inteiro no
      // disco por nada.
      if (proximo === board) return;

      // `set` e não `commit`: ver a declaração. O disco não se perde — quem
      // grava observa `board`, não o histórico.
      set({ board: proximo });
    },

    removeItems(sceneId, itemIds) {
      if (itemIds.length === 0) return;

      const doomed = new Set(itemIds);
      get().updateScene(sceneId, (scene) => ({
        ...scene,
        items: scene.items.filter((item) => !doomed.has(item.id)),
        // A seta amarrada a uma imagem apagada morre com ela.
        ligacoes: semReferencia(scene.ligacoes, doomed),
      }));
    },

    moveItemsZ(sceneId, itemIds, direction) {
      if (itemIds.length === 0) return;

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        items: reorderByZ(scene.items, itemIds, direction),
      }));
    },

    moveItemToIndex(sceneId, itemId, frontFirstIndex) {
      get().updateScene(sceneId, (scene) => ({
        ...scene,
        items: moveItemToFrontFirstIndex(scene.items, itemId, frontFirstIndex),
      }));
    },

    setItemsLocked(sceneId, itemIds, locked) {
      get().updateItems(
        sceneId,
        itemIds.map((id) => ({ id, patch: { locked } })),
      );
    },

    criarGrupo(sceneId, nome, itemIds, parentId) {
      const id = novoId();
      const dentro = new Set(itemIds);

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        grupos: [...(scene.grupos ?? []), { id, nome: nome.trim(), parentId }],
        items: scene.items.map((item) =>
          dentro.has(item.id) ? { ...item, grupoId: id } : item,
        ),
      }));

      return id;
    },

    atualizarGrupo(sceneId, grupoId, patch) {
      get().updateScene(sceneId, (scene) => ({
        ...scene,
        grupos: (scene.grupos ?? []).map((grupo) =>
          grupo.id === grupoId ? { ...grupo, ...patch } : grupo,
        ),
      }));
    },

    removerGrupo(sceneId, grupoId) {
      get().updateScene(sceneId, (scene) => {
        const alvo = scene.grupos?.find((grupo) => grupo.id === grupoId);
        if (!alvo) return scene;

        const grupos = (scene.grupos ?? [])
          .filter((grupo) => grupo.id !== grupoId)
          .map((grupo) =>
            grupo.parentId === grupoId
              ? { ...grupo, parentId: alvo.parentId }
              : grupo,
          );

        return {
          ...scene,
          // Lista vazia sai do objeto, como `grid` e `tracos`.
          grupos: grupos.length > 0 ? grupos : undefined,
          items: scene.items.map((item) =>
            item.grupoId === grupoId
              ? { ...item, grupoId: alvo.parentId }
              : item,
          ),
        };
      });
    },

    soltarItens(sceneId, itemIds, grupoId, antesDe) {
      if (itemIds.length === 0) return;

      const dentro = new Set(itemIds);

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        items: moveItemsBefore(
          scene.items.map((item) =>
            dentro.has(item.id) ? { ...item, grupoId } : item,
          ),
          itemIds,
          antesDe,
        ),
      }));
    },

    moverParaGrupo(sceneId, itemIds, grupoId) {
      const alvo = new Set(itemIds);

      get().updateItems(
        sceneId,
        get()
          .board?.scenes.find((scene) => scene.id === sceneId)
          ?.items.filter((item) => alvo.has(item.id) && item.grupoId !== grupoId)
          .map((item) => ({ id: item.id, patch: { grupoId } })) ?? [],
      );
    },

    moverGrupo(sceneId, grupoId, parentId) {
      get().updateScene(sceneId, (scene) => {
        const grupos = scene.grupos ?? [];

        // Sobe do destino até a raiz; se passar pelo próprio grupo, é ciclo.
        let cursor = parentId;
        while (cursor) {
          if (cursor === grupoId) return scene;
          cursor = grupos.find((grupo) => grupo.id === cursor)?.parentId;
        }

        return {
          ...scene,
          grupos: grupos.map((grupo) =>
            grupo.id === grupoId ? { ...grupo, parentId } : grupo,
          ),
        };
      });
    },

    addFog(sceneId, region) {
      const id = novoId();

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        fog: [...scene.fog, { ...region, id, revealed: false }],
      }));

      return id;
    },

    addTraco(sceneId, traco) {
      const id = novoId();

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        tracos: [...(scene.tracos ?? []), { ...traco, id }],
      }));

      return id;
    },

    removeTracos(sceneId, tracoIds) {
      if (tracoIds.length === 0) return;

      const apagar = new Set(tracoIds);

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        tracos: (scene.tracos ?? []).filter((traco) => !apagar.has(traco.id)),
      }));
    },

    updateTracos(sceneId, patches) {
      if (patches.length === 0) return;

      const porId = new Map(patches.map(({ id, patch }) => [id, patch]));

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        tracos: (scene.tracos ?? []).map((traco) => {
          const patch = porId.get(traco.id);
          return patch ? { ...traco, ...patch } : traco;
        }),
      }));
    },

    addMedidor(sceneId, medidor) {
      const id = novoId();

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        medidores: [...(scene.medidores ?? []), { ...medidor, id }],
      }));

      return id;
    },

    updateMedidor(sceneId, medidorId, patch) {
      get().updateScene(sceneId, (scene) => ({
        ...scene,
        medidores: (scene.medidores ?? []).map((medidor) =>
          medidor.id === medidorId ? { ...medidor, ...patch } : medidor,
        ),
      }));
    },

    removeMedidores(sceneId, medidorIds) {
      if (medidorIds.length === 0) return;

      const apagar = new Set(medidorIds);

      get().updateScene(sceneId, (scene) => {
        const restantes = (scene.medidores ?? []).filter(
          (medidor) => !apagar.has(medidor.id),
        );

        // `undefined` quando esvazia, como `removePostit`: é a AUSÊNCIA do
        // campo que mantém a cena sem nada do mestre na mesma referência.
        return {
          ...scene,
          medidores: restantes.length > 0 ? restantes : undefined,
        };
      });
    },

    addParede(sceneId, parede) {
      const id = novoId();

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        paredes: [...(scene.paredes ?? []), { ...parede, id }],
      }));

      return id;
    },

    updateParede(sceneId, paredeId, patch) {
      get().updateScene(sceneId, (scene) => ({
        ...scene,
        paredes: (scene.paredes ?? []).map((parede) =>
          parede.id === paredeId ? { ...parede, ...patch } : parede,
        ),
      }));
    },

    removeParedes(sceneId, paredeIds) {
      if (paredeIds.length === 0) return;

      const apagar = new Set(paredeIds);

      get().updateScene(sceneId, (scene) => {
        const restantes = (scene.paredes ?? []).filter(
          (parede) => !apagar.has(parede.id),
        );

        return {
          ...scene,
          paredes: restantes.length > 0 ? restantes : undefined,
        };
      });
    },

    setSol(sceneId, sol) {
      get().updateScene(sceneId, (scene) => ({ ...scene, sol }));
    },

    updateFog(sceneId, fogId, patch) {
      get().updateScene(sceneId, (scene) => ({
        ...scene,
        fog: scene.fog.map((region) =>
          region.id === fogId ? { ...region, ...patch } : region,
        ),
      }));
    },

    removeFog(sceneId, fogId) {
      get().updateScene(sceneId, (scene) => ({
        ...scene,
        fog: scene.fog.filter((region) => region.id !== fogId),
      }));
    },

    addPin(sceneId, pin) {
      const id = novoId();

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        pins: [
          ...(scene.pins ?? []),
          { title: "", note: "", ...pin, id, attachments: [] },
        ],
      }));

      return id;
    },

    updatePin(sceneId, pinId, patch) {
      get().updateScene(sceneId, (scene) => ({
        ...scene,
        pins: (scene.pins ?? []).map((pin) =>
          pin.id === pinId ? { ...pin, ...patch } : pin,
        ),
      }));
    },

    removePin(sceneId, pinId) {
      get().updateScene(sceneId, (scene) => {
        const restantes = (scene.pins ?? []).filter((pin) => pin.id !== pinId);

        // Volta a `undefined` quando esvazia, em vez de deixar `[]` no arquivo:
        // é o mesmo estado, e `sceneForTable` decide por identidade da
        // referência quando o campo está ausente.
        return {
          ...scene,
          pins: restantes.length > 0 ? restantes : undefined,
          ligacoes: semReferencia(scene.ligacoes, [pinId]),
        };
      });
    },

    attachToPin(sceneId, pinId, assetIds) {
      if (assetIds.length === 0) return;

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        pins: (scene.pins ?? []).map((pin) =>
          pin.id === pinId
            ? // `Set` para o mesmo arquivo anexado duas vezes não render duas
              // miniaturas iguais com o mesmo botão de transmitir.
              {
                ...pin,
                attachments: [...new Set([...pin.attachments, ...assetIds])],
              }
            : pin,
        ),
      }));
    },

    detachFromPin(sceneId, pinId, assetId) {
      get().updateScene(sceneId, (scene) => ({
        ...scene,
        pins: (scene.pins ?? []).map((pin) =>
          pin.id === pinId
            ? // Só desanexa: o arquivo continua no acervo. Apagar o asset aqui
              // levaria embora a imagem de quem a usa como fundo de outra cena.
              {
                ...pin,
                attachments: pin.attachments.filter((id) => id !== assetId),
              }
            : pin,
        ),
      }));
    },

    guardarNoHandout(sceneId, assetIds) {
      const atual = get().board?.scenes.find((scene) => scene.id === sceneId);
      if (!atual) return;

      const guardados = new Set(atual.handout ?? []);
      const novos = [...new Set(assetIds)].filter((id) => !guardados.has(id));

      // Nada novo, nada gravado: `updateScene` alimenta o histórico, e um
      // passo de desfazer que não muda nada confunde quem desfaz.
      if (novos.length === 0) return;

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        handout: [...(scene.handout ?? []), ...novos],
      }));
    },

    tirarDoHandout(sceneId, assetId) {
      get().updateScene(sceneId, (scene) => {
        const restantes = (scene.handout ?? []).filter((id) => id !== assetId);

        // `undefined` quando esvazia, como `removePin`: `sceneForTable`
        // decide por ausência do campo.
        return {
          ...scene,
          handout: restantes.length > 0 ? restantes : undefined,
        };
      });
    },

    addPostit(sceneId, postit) {
      const id = novoId();

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        postits: [
          ...(scene.postits ?? []),
          {
            largura: POSTIT_LARGURA,
            altura: POSTIT_ALTURA,
            texto: "",
            cor: CORES_POSTIT[0],
            ...postit,
            id,
          },
        ],
      }));

      return id;
    },

    updatePostit(sceneId, postitId, patch) {
      get().updatePostits(sceneId, [{ id: postitId, patch }]);
    },

    updatePostits(sceneId, patches) {
      if (patches.length === 0) return;

      const porId = new Map(patches.map(({ id, patch }) => [id, patch]));

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        postits: (scene.postits ?? []).map((postit) => {
          const patch = porId.get(postit.id);
          return patch ? { ...postit, ...patch } : postit;
        }),
      }));
    },

    removePostit(sceneId, postitId) {
      get().removePostits(sceneId, [postitId]);
    },

    removePostits(sceneId, postitIds) {
      if (postitIds.length === 0) return;

      const condenados = new Set(postitIds);
      get().updateScene(sceneId, (scene) => {
        const restantes = (scene.postits ?? []).filter(
          (postit) => !condenados.has(postit.id),
        );

        // Volta a `undefined` quando esvazia, como `removePin`: é o mesmo estado,
        // e é a AUSÊNCIA do campo que faz `sceneForTable` devolver a mesma
        // referência em vez de uma cópia por render.
        return {
          ...scene,
          postits: restantes.length > 0 ? restantes : undefined,
          ligacoes: semReferencia(scene.ligacoes, condenados),
        };
      });
    },

    addTexto(sceneId, texto) {
      return get().addTextos(sceneId, [texto])[0];
    },

    addTextos(sceneId, textos) {
      if (textos.length === 0) return [];

      const ids = textos.map(() => novoId());

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        textos: [
          ...(scene.textos ?? []),
          ...textos.map((texto, indice) => ({
            texto: "",
            tamanho: TEXTO_TAMANHO,
            ...texto,
            id: ids[indice],
          })),
        ],
      }));

      return ids;
    },

    updateTexto(sceneId, textoId, patch) {
      get().updateTextos(sceneId, [{ id: textoId, patch }]);
    },

    updateTextos(sceneId, patches) {
      if (patches.length === 0) return;

      const porId = new Map(patches.map(({ id, patch }) => [id, patch]));

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        textos: (scene.textos ?? []).map((texto) => {
          const patch = porId.get(texto.id);
          return patch ? { ...texto, ...patch } : texto;
        }),
      }));
    },

    removeTexto(sceneId, textoId) {
      get().removeTextos(sceneId, [textoId]);
    },

    removeTextos(sceneId, textoIds) {
      if (textoIds.length === 0) return;

      const condenados = new Set(textoIds);
      get().updateScene(sceneId, (scene) => {
        const restantes = (scene.textos ?? []).filter(
          (texto) => !condenados.has(texto.id),
        );

        return {
          ...scene,
          textos: restantes.length > 0 ? restantes : undefined,
          // A seta amarrada a um texto apagado morre com ele.
          ligacoes: semReferencia(scene.ligacoes, condenados),
        };
      });
    },

    addForma(sceneId, forma) {
      return get().addFormas(sceneId, [forma])[0];
    },

    addFormas(sceneId, formas) {
      if (formas.length === 0) return [];

      const ids = formas.map(() => novoId());

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        formas: [
          ...(scene.formas ?? []),
          ...formas.map((forma, indice) => ({ ...forma, id: ids[indice] })),
        ],
      }));

      return ids;
    },

    updateForma(sceneId, formaId, patch) {
      get().updateFormas(sceneId, [{ id: formaId, patch }]);
    },

    updateFormas(sceneId, patches) {
      if (patches.length === 0) return;

      const porId = new Map(patches.map(({ id, patch }) => [id, patch]));

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        formas: (scene.formas ?? []).map((forma) => {
          const patch = porId.get(forma.id);
          return patch ? { ...forma, ...patch } : forma;
        }),
      }));
    },

    removeFormas(sceneId, formaIds) {
      if (formaIds.length === 0) return;

      const condenadas = new Set(formaIds);
      get().updateScene(sceneId, (scene) => {
        const restantes = (scene.formas ?? []).filter(
          (forma) => !condenadas.has(forma.id),
        );

        return {
          ...scene,
          formas: restantes.length > 0 ? restantes : undefined,
          // Como o texto: a seta amarrada a uma forma apagada morre com ela.
          ligacoes: semReferencia(scene.ligacoes, condenadas),
        };
      });
    },

    medirTexto(sceneId, textoId, caixa) {
      const { board } = get();
      if (!board) return;

      const scene = board.scenes.find((atual) => atual.id === sceneId);
      const texto = scene?.textos?.find((atual) => atual.id === textoId);
      if (!scene || !texto) return;
      if (
        texto.largura !== undefined &&
        texto.altura !== undefined &&
        Math.abs(texto.largura - caixa.largura) < 0.5 &&
        Math.abs(texto.altura - caixa.altura) < 0.5
      )
        return;

      set({
        board: {
          ...board,
          scenes: board.scenes.map((atual) =>
            atual.id !== sceneId
              ? atual
              : {
                  ...atual,
                  textos: (atual.textos ?? []).map((candidato) =>
                    candidato.id === textoId
                      ? { ...candidato, ...caixa }
                      : candidato,
                  ),
                },
          ),
        },
      });
    },

    addDocumento(sceneId, documento) {
      const id = novoId();

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        documentos: [
          ...(scene.documentos ?? []),
          {
            largura: DOCUMENTO_LARGURA,
            altura: DOCUMENTO_ALTURA,
            ...documento,
            id,
          },
        ],
      }));

      return id;
    },

    updateDocumento(sceneId, documentoId, patch) {
      get().updateDocumentos(sceneId, [{ id: documentoId, patch }]);
    },

    updateDocumentos(sceneId, patches) {
      if (patches.length === 0) return;

      const porId = new Map(patches.map(({ id, patch }) => [id, patch]));

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        documentos: (scene.documentos ?? []).map((documento) => {
          const patch = porId.get(documento.id);
          return patch ? { ...documento, ...patch } : documento;
        }),
      }));
    },

    removeDocumento(sceneId, documentoId) {
      get().removeDocumentos(sceneId, [documentoId]);
    },

    removeDocumentos(sceneId, documentoIds) {
      if (documentoIds.length === 0) return;

      const condenados = new Set(documentoIds);
      get().updateScene(sceneId, (scene) => {
        const restantes = (scene.documentos ?? []).filter(
          (documento) => !condenados.has(documento.id),
        );

        return {
          ...scene,
          documentos: restantes.length > 0 ? restantes : undefined,
          ligacoes: semReferencia(scene.ligacoes, condenados),
        };
      });
    },

    addLigacao(sceneId, de, para) {
      if (mesmaPonta(de, para)) return null;

      const scene = get().board?.scenes.find((atual) => atual.id === sceneId);
      if (!scene) return null;
      // Seta repetida: mesmo par E mesmo ponto de encaixe. Com quatro pontos
      // por caixa, duas setas entre os mesmos dois postits deixaram de ser
      // engano -- sair por cima e sair pela direita são desenhos diferentes --,
      // e o que continua valendo a pena barrar é a seta idêntica, que é o
      // segundo clique sem querer.
      if (
        ancorada(de) &&
        ancorada(para) &&
        scene.ligacoes?.some(
          (ligacao) =>
            pontaIgual(ligacao.de, de) && pontaIgual(ligacao.para, para),
        )
      )
        return null;

      // Ponta que não resolve não vira seta: o postit sumiu enquanto ela
      // estava pendurada no cursor, ou a cena trocou debaixo do gesto. Ela
      // nasceria órfã, o desenho a ignoraria, e o que ficaria era uma linha
      // morta no arquivo.
      if (!tracadoDe(scene, de, para)) return null;

      const id = novoId();
      get().updateScene(sceneId, (atual) => ({
        ...atual,
        ligacoes: [...(atual.ligacoes ?? []), { id, de, para }],
      }));

      return id;
    },

    updateLigacao(sceneId, ligacaoId, patch) {
      get().updateScene(sceneId, (scene) => ({
        ...scene,
        ligacoes: (scene.ligacoes ?? []).map((ligacao) => {
          if (ligacao.id !== ligacaoId) return ligacao;
          const proxima = { ...ligacao, ...patch };
          // Rótulo vazio é ausência, como as listas vazias da cena.
          if (!proxima.rotulo?.trim()) delete proxima.rotulo;
          // Dobra zero é a curva de fábrica, e ausência é como ela se escreve:
          // uma seta nunca dobrada e uma desentortada ficam o mesmo arquivo.
          if (!proxima.curva) delete proxima.curva;
          // Ponta movida para cima da outra âncora: fica onde estava.
          if (mesmaPonta(proxima.de, proxima.para)) return ligacao;
          // Ponta pendurada numa seta que já depende desta: fica onde estava.
          // As duas ficariam esperando a outra dizer onde está, e o quadro
          // perderia as duas de uma vez. Ver `dependeDe`.
          if (
            dependeDe(scene, ligacaoId, proxima.de) ||
            dependeDe(scene, ligacaoId, proxima.para)
          )
            return ligacao;
          return proxima;
        }),
      }));
    },

    removeLigacao(sceneId, ligacaoId) {
      // Pelo mesmo caminho de quem apaga um postit: a seta bifurcada desta cai
      // junto, e a que estava presa nessa também. Ver `semReferencia`.
      get().updateScene(sceneId, (scene) => ({
        ...scene,
        ligacoes: semReferencia(
          (scene.ligacoes ?? []).filter((ligacao) => ligacao.id !== ligacaoId),
          [ligacaoId],
        ),
      }));
    },
  };
});

export function selectCanUndo(state: SceneStore): boolean {
  return canUndo(state.history);
}

export function selectCanRedo(state: SceneStore): boolean {
  return canRedo(state.history);
}

function findScene(
  state: SceneStore,
  sceneId: string | null | undefined,
): Scene | null {
  if (!sceneId) return null;

  return state.board?.scenes.find((scene) => scene.id === sceneId) ?? null;
}

/** A cena aberta no palco do Mestre. É sobre esta que todas as edições agem. */
export function selectEditingScene(state: SceneStore): Scene | null {
  return findScene(state, state.board?.editingSceneId);
}

/**
 * A cena que o MESTRE pôs no ar. É a que acende o ponto vermelho na lista.
 *
 * Não é necessariamente o que a mesa está vendo: sem nada no ar, a mesa vê a
 * capa. Ver `selectCenaParaMesa`.
 */
export function selectLiveScene(state: SceneStore): Scene | null {
  return findScene(state, state.board?.liveSceneId);
}

/** A capa da campanha, se alguma cena foi marcada. Ver `Scene.capa`. */
export function selectCapa(state: SceneStore): Scene | null {
  return state.board?.scenes.find((scene) => scene.capa) ?? null;
}

/**
 * O que a mesa VÊ: a cena no ar, ou a capa quando não há nenhuma.
 *
 * É esta que o canal publica, e é ela que acende o som e os retratos. A queda
 * para a capa mora aqui, e não no espectador, porque daqui ela vale para os
 * três de uma vez -- a TV, o celular e o daemon --, e porque a capa passa pelo
 * `sceneForTable` como qualquer outra cena.
 *
 * `liveSceneId` continua `null` enquanto a capa está na tela, e é o certo: o
 * mestre não pôs nada no ar, e nenhum chip da lista deve dizer que pôs.
 */
export function selectCenaParaMesa(state: SceneStore): Scene | null {
  return selectLiveScene(state) ?? selectCapa(state);
}

/**
 * Persiste fora do store: arrasto dispara dezenas de updates por segundo e
 * gravar todos derruba o frame rate.
 */
const PERSIST_DEBOUNCE_MS = 400;

let persistTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * O board que o disco JÁ TEM.
 *
 * Base da diferença, e é o que permite mandar só as cenas mudadas. Avança
 * apenas depois de a gravação voltar: se ela falhar e este ponteiro avançasse
 * junto, a gravação seguinte omitiria uma mudança que nunca chegou ao disco — e
 * a perda apareceria só na próxima abertura da campanha.
 *
 * Zerado na hidratação, por campanha. Ver `hydrate`.
 */
let salvo: Board | null = null;

/**
 * Manda ao disco o que mudou desde a última gravação.
 *
 * A comparação é por IDENTIDADE, e é de graça: cena é imutável aqui, e
 * `updateScene` troca só a cena editada — as outras vinte e nove chegam neste
 * ponto como a mesma referência que o disco já viu. Ver `saveBoardPatch`.
 *
 * Sem base — a primeira gravação de uma campanha recém-aberta cujo board nasceu
 * na tela, ou uma gravação anterior que falhou — vai o board inteiro. É o
 * caminho de antes, e ele continua sendo o certo quando não há do que
 * diferenciar.
 */
/**
 * Cartão gravado antes de existir `Nota` -- com arquivo próprio e sem
 * `notaId` -- ganha uma nota com o mesmo arquivo, para aparecer na árvore e
 * abrir no editor. Só a primeira campanha de teste tem isso, mas um cartão
 * sem nota seria um cartão que não abre.
 */
function comNotasDosCartoes(board: Board): Board {
  const orfaos = board.scenes.flatMap((scene) =>
    (scene.documentos ?? []).filter((documento) => !documento.notaId),
  );
  if (orfaos.length === 0) return board;

  const notas = [...(board.notas ?? [])];
  const notaDe = new Map<string, string>();
  for (const documento of orfaos) {
    let id = notaDe.get(documento.arquivo);
    if (!id) {
      id = novoId();
      notaDe.set(documento.arquivo, id);
      notas.push({ id, titulo: documento.titulo, arquivo: documento.arquivo });
    }
  }

  return {
    ...board,
    notas,
    scenes: board.scenes.map((scene) =>
      scene.documentos?.some((documento) => !documento.notaId)
        ? {
            ...scene,
            documentos: scene.documentos.map((documento) =>
              documento.notaId
                ? documento
                : { ...documento, notaId: notaDe.get(documento.arquivo) },
            ),
          }
        : scene,
    ),
  };
}

async function persistir(board: Board): Promise<void> {
  const base = salvo;

  if (base === null) {
    await saveBoard(board);
    salvo = board;

    return;
  }

  const noDisco = new Map(base.scenes.map((scene) => [scene.id, scene]));

  await saveBoardPatch({
    // Completa de propósito: é ela que decide o que existe, e cena que sai
    // dela tem o arquivo apagado. Mandar a lista parcial faria "não mudou" e
    // "foi apagada" virarem a mesma coisa.
    ordem: board.scenes.map((scene) => scene.id),
    scenes: board.scenes.filter((scene) => noDisco.get(scene.id) !== scene),
    editingSceneId: board.editingSceneId,
    liveSceneId: board.liveSceneId,
    pastas: board.pastas,
    notas: board.notas,
  });

  salvo = board;
}

useSceneStore.subscribe((state, previous) => {
  if (state.board === previous.board || !state.board) return;

  const { board } = state;

  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    // Era rejeição sem ninguém ouvindo: um erro de disco na gravação sumia no
    // console. A pasta apagada já é tratada em `call` -- ver `aoSumirCampanha`
    // --, então aqui é só não deixar os outros passarem calados.
    persistir(board).catch((cause: unknown) => {
      console.error("falha ao gravar o board", cause);
    });
  }, PERSIST_DEBOUNCE_MS);
});

/**
 * Grava agora o que estiver pendente.
 *
 * Chamado ANTES de trocar de campanha, e a ordem não é detalhe: `saveBoard`
 * grava na campanha que o processo nativo tem aberta. Um debounce de 400ms
 * ainda no ar no momento da troca escreveria o board da campanha ANTERIOR
 * dentro da nova — e ninguém associaria a perda ao clique de trocar.
 */
export async function flushBoard(): Promise<void> {
  clearTimeout(persistTimer);
  persistTimer = undefined;

  const { board } = useSceneStore.getState();
  if (!board) return;

  await persistir(board);
}

/**
 * Fechar a janela não pode custar os últimos 400ms de trabalho.
 *
 * Continua valendo sem a nuvem, e por um motivo diferente do de antes: o
 * atraso que sobrou é o do próprio disco, e é justamente o gesto de fechar que
 * cai dentro dele.
 */
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;

    const { board } = useSceneStore.getState();
    if (!board) return;

    clearTimeout(persistTimer);
    void persistir(board);
  });
}
