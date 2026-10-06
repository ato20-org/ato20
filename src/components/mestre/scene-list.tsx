"use client";

import {
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  BookImage,
  CopyPlus,
  FolderPlus,
  GripVertical,
  Image as ImageIcon,
  ImageOff,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Radio,
  Trash2,
} from "lucide-react";

import { toast } from "sonner";

import {
  FimDaLista,
  ItensDeMover,
  LIMIAR_ARRASTO_PX,
  PastaRow,
  PREFIXO_PASTA,
  RECUO_PX,
} from "@/components/mestre/arvore-de-pastas";
import { CampoDeBusca } from "@/components/mestre/campo-de-busca";
import { NovoMapaDialog } from "@/components/mestre/novo-mapa-dialog";
import { ScenePreview } from "@/components/playground/scene-preview";
import { ConfirmarRemocao } from "@/components/mestre/confirmar-remocao";
import { PainelVazio } from "@/components/mestre/painel-vazio";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { KIT_CONTEXTO, KIT_TRES_PONTOS, type Kit } from "@/components/ui/menu-kit";
import { ItensDeExtensao } from "@/components/mestre/itens-de-extensao";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useListReorder } from "@/hooks/use-list-reorder";
import { useTokenDrag } from "@/hooks/use-token-drag";
import {
  aoApertarF2,
  useRenomearPeloMenu,
} from "@/hooks/use-renomear-pelo-menu";
import { t as textoDeArquivos } from "@/lib/i18n/arquivos";
import { t } from "@/lib/i18n/cenas";
import {
  achatarArvore,
  caminhoDaPasta,
  pastasDaLista,
} from "@/lib/mestre/arvore-de-pastas";
import {
  escolherFundoDaCena,
  useFundoEmVoo,
  tirarFundoDaCena,
} from "@/lib/mestre/scene-background";
import { useAssetsStore } from "@/lib/store/use-assets-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useTokenDragStore } from "@/lib/store/use-token-drag-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import { normaliza } from "@/lib/search";
import { cn } from "@/lib/utils";
import { useArquivoAbertoStore } from "@/lib/store/use-arquivo-aberto-store";
import {
  ehFundo,
  NOME_DO_TIPO,
  temCamera,
  temNevoa,
  type AssetMeta,
  type Pasta,
  type Scene,
  type TipoDeCena,
} from "@/types/scene";

export function SceneList({ ready }: { ready: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Duas abas, e as duas descrevem a CAMPANHA: a lista de mapas e a de
          fundos. Áreas era a terceira e saiu daqui -- ela descrevia a cena
          ABERTA, e revelar área é gesto de mesa, feito olhando o mapa. Agora
          mora no palco, ao lado do índice de pontos. Ver `AreasIndex`.

          Fundos ao lado de Mapas pela mesma razão que a trilha fica ao lado do
          ambiente no painel de sons: são duas naturezas da mesma coisa, e a
          mão procura as duas no mesmo lugar. Ver `ListaDeCenas`.

          `gap-0`: o `Tabs` separa lista e painel por padrão, e aqui a lista
          é um cabeçalho colado no conteúdo. */}
      <Tabs defaultValue="mapas" className="min-h-0 flex-1 gap-0">
        <TabsList
          variant="line"
          className="h-7 w-full shrink-0 justify-start gap-2 px-2"
        >
          <TabsTrigger value="mapas" className="flex-none text-xs">
            {t.sceneList.abaMapas}
          </TabsTrigger>
          <TabsTrigger value="fundos" className="flex-none text-xs">
            {t.sceneList.abaFundos}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mapas" className="flex min-h-0 flex-col border-t">
          <ListaDeCenas ready={ready} />
        </TabsContent>

        <TabsContent value="fundos" className="flex min-h-0 flex-col border-t">
          <ListaDeCenas ready={ready} tipo="fundo" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * A linha de baixo: o que a cena TEM, em dez pixels.
 *
 * Muda com o tipo porque as contagens do mapa não descrevem um fundo. "0
 * áreas" num fundo é um número que nunca sai de zero -- `temNevoa` é falso lá
 * --, e um dado que não varia ocupa a linha sem dizer nada.
 *
 * O que entra no lugar é a RESOLUÇÃO da imagem. O fundo não tem câmera: a
 * imagem é o enquadramento, e o tamanho dela é a única coisa sobre um fundo
 * que o mestre não descobre olhando a miniatura.
 *
 * `sem imagem` vem primeiro quando é o caso, porque um fundo sem imagem é um
 * retângulo preto -- é o que falta, não um detalhe.
 *
 * Sem medida gravada sobra a contagem de itens. Acontece com imagem importada
 * antes de `naturalWidth` existir, e enquanto o acervo ainda não foi lido do
 * disco: nos dois, inventar um número seria pior do que omiti-lo.
 */
function resumoDaCena(scene: Scene, imagem: AssetMeta | undefined): string {
  const itens = t.sceneList.contarItens(scene.items.length);

  if (!ehFundo(scene)) {
    return `${itens} · ${t.sceneList.contarAreas(scene.fog.length)}`;
  }
  if (!scene.backgroundAssetId) return `${t.sceneList.semImagem} · ${itens}`;

  const { naturalWidth, naturalHeight } = imagem ?? {};

  return naturalWidth && naturalHeight
    ? `${naturalWidth}×${naturalHeight} · ${itens}`
    : itens;
}

/**
 * A lista de um tipo de cena: os mapas, ou os fundos.
 *
 * À PARTE, e não uma lista só com etiqueta por linha. A lista de mapas é a fila
 * da sessão -- é dela que sai "a próxima cena", e é ela que o mestre reordena
 * arrastando --, e um fundo no meio entraria nessa fila sem ser parte dela. O
 * board continua sendo uma lista só (ver `Board.scenes`); o que cada aba mostra
 * é a ordem dele filtrada, e reordenar aqui move a cena lá dentro.
 *
 * Os quadros não têm aba aqui: eles moram em Arquivos. Mapas e fundos têm cada
 * um a sua árvore de pastas -- a mesma do Arquivos, ver `achatarArvore` --, e
 * a pasta é só organização: a fila continua sendo a ordem do board.
 */
function ListaDeCenas({
  ready,
  tipo,
}: {
  ready: boolean;
  /** Ausente = mapa, como em `Scene`. */
  tipo?: TipoDeCena;
}) {
  const todas = useSceneStore((state) => state.board?.scenes);
  const scenes = useMemo(
    () => todas?.filter((scene) => scene.tipo === tipo),
    [todas, tipo],
  );
  const fecharNota = useArquivoAbertoStore((state) => state.fechar);
  const editingSceneId = useSceneStore((state) => state.board?.editingSceneId);
  const liveSceneId = useSceneStore((state) => state.board?.liveSceneId);
  const setEditingSceneId = useSceneStore((state) => state.setEditingSceneId);
  const setLiveSceneId = useSceneStore((state) => state.setLiveSceneId);
  const addScene = useSceneStore((state) => state.addScene);
  const clearSelection = useSelectionStore((state) => state.clear);
  const fitViewport = useViewportStore((state) => state.fit);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [novoMapaId, setNovoMapaId] = useState<string | null>(null);

  const nome = NOME_DO_TIPO[tipo ?? "mapa"].toLowerCase();

  const todasAsPastas = useSceneStore((state) => state.board?.pastas);
  const lista = tipo === "fundo" ? "fundos" : "mapas";
  const pastas = useMemo(
    () => pastasDaLista(todasAsPastas, lista),
    [todasAsPastas, lista],
  );
  const linhas = useMemo(
    () => achatarArvore(scenes ?? [], pastas, (scene) => scene.pastaId),
    [scenes, pastas],
  );

  /**
   * A busca: com texto no campo, a árvore dá lugar aos achados, com o caminho
   * da pasta de cada um na linha de baixo. Pelo nome da cena, sem acento e sem
   * caixa -- ver `normaliza`.
   */
  const [busca, setBusca] = useState("");
  const buscando = busca.trim() !== "";
  const achados = useMemo(() => {
    if (!buscando) return null;
    const termo = normaliza(busca.trim());

    return (scenes ?? []).filter((scene) => normaliza(scene.name).includes(termo));
  }, [buscando, busca, scenes]);

  /**
   * O acervo de imagens, pedido uma vez pela LISTA e não por linha.
   *
   * Só a lista de fundos precisa dele: é lá que a resolução aparece. O store
   * lê uma vez por tipo e ignora pedido repetido, então esta chamada não
   * concorre com a da Biblioteca -- ver `garantir`.
   */
  const garantirAcervo = useAssetsStore((state) => state.garantir);
  useEffect(() => {
    if (tipo === "fundo") garantirAcervo("image");
  }, [tipo, garantirAcervo]);

  const { listRef, dropIndex, startReorder } = useListReorder<string>(
    (arrastado, index) => {
      if (!todas) return;
      const store = useSceneStore.getState();
      const alvo = linhas[index];
      const pastaDoAlvo = !alvo
        ? undefined
        : alvo.tipo === "pasta"
          ? alvo.pasta.id
          : alvo.item.pastaId;

      // Pasta arrastada: só muda de mãe. O store recusa ciclo.
      if (arrastado.startsWith(PREFIXO_PASTA)) {
        const pastaId = arrastado.slice(PREFIXO_PASTA.length);
        if (pastaDoAlvo !== pastaId) store.moverPasta(pastaId, pastaDoAlvo);
        return;
      }

      // Cena: assume a pasta de quem está na linha e o lugar dele no board, que
      // tem os outros tipos no meio. Sobre uma pasta, entra e vai para o fim.
      store.moverParaPasta(arrastado, pastaDoAlvo);
      const destino =
        alvo?.tipo === "item"
          ? todas.findIndex((scene) => scene.id === alvo.item.id)
          : todas.length - 1;
      store.moveSceneToIndex(arrastado, destino);
    },
    // A linha SOB o cursor, como no Arquivos: soltar em cima da pasta é entrar.
    "sobre",
  );

  /**
   * A linha INTEIRA também leva a cena para a pasta: ela já é o arrasto que
   * vira menção `>mapa` numa nota, e soltar esse mesmo gesto sobre uma pasta da
   * aba é entrar nela. A alça continua sendo o reordenar. Ver `aceita`.
   */
  useEffect(
    () =>
      useTokenDragStore.getState().registrarAlvo(`cenas:${lista}`, (solto, destino) => {
        if (solto.fonte.tipo !== "cena" || destino.tipo !== "pasta-cenas") return;
        useSceneStore.getState().moverParaPasta(solto.fonte.sceneId, destino.pastaId);
      }),
    [lista],
  );

  /** A pasta sob a cena arrastada pela linha. `""` é a raiz da aba. */
  const alvoDoArrasto = useTokenDragStore((state) => {
    const destino = state.arrasto?.destino;
    return destino?.tipo === "pasta-cenas" && destino.lista === lista
      ? (destino.pastaId ?? "")
      : null;
  });
  const alvoDaAba = { "data-pasta-cenas": lista };

  /**
   * O mapa nasce e PERGUNTA de onde vem o chão -- imagem ou tabuleiro com
   * grade. Ver `NovoMapaDialog`.
   *
   * O fundo pula a pergunta e abre o seletor de arquivo direto: a única
   * resposta que ele aceita é a imagem, e um diálogo com uma opção só é um
   * clique a mais para chegar onde já se ia. Cancelar deixa o fundo preto, e a
   * imagem continua a um menu de distância na linha dele.
   */
  function criar(pastaId?: string) {
    const id = addScene(undefined, tipo);
    if (pastaId) useSceneStore.getState().moverParaPasta(id, pastaId);
    if (tipo !== "fundo") {
      setNovoMapaId(id);
      return;
    }

    void escolherFundoDaCena(id).catch((cause: unknown) =>
      toast.error(cause instanceof Error ? cause.message : t.geral.falhaAoImportar),
    );
  }

  function criarPasta() {
    const nomeDaPasta = textoDeArquivos.nomesPadrao.pasta(pastas.length + 1);
    useSceneStore.getState().criarPasta(nomeDaPasta, undefined, lista);
  }

  /** O "Novo mapa aqui" do menu da pasta. */
  const itensDeCriarNa = (pastaId: string) =>
    function itensDeCriar({ Item }: Kit) {
      return (
        <Item onClick={() => criar(pastaId)}>
          <Plus />
          {t.sceneList.novoAqui(nome)}
        </Item>
      );
    };

  function abrir(sceneId: string) {
    // Abrir uma cena volta ao palco, se havia nota aberta.
    fecharNota();
    setEditingSceneId(sceneId);
    // Seleção é por cena: manter itens da cena anterior
    // selecionados deixaria o gizmo apontando pro vazio.
    clearSelection();
    // Zoom também: o recorte de um mapa não diz nada sobre o outro.
    fitViewport();
  }

  /**
   * Pôr no ar leva o mestre junto: a mesa passa a ver esta cena, e ele também.
   *
   * Era "sem sair do que tu edita", e transmitir pedia um segundo toque para
   * abrir: o que acabou de ir para a TV é o que o mestre precisa ter na mão.
   * Preparar a próxima cena enquanto a mesa vê a atual continua possível pelo
   * outro lado: abrir sem transmitir.
   *
   * Já aberta, só fecha a nota que cobria o palco: abrir de novo limparia a
   * seleção e o zoom de quem só pôs no ar o que estava editando.
   */
  function transmitir(sceneId: string) {
    if (sceneId === editingSceneId) fecharNota();
    else abrir(sceneId);
    setLiveSceneId(sceneId);
  }

  return (
    <>
      {/* Redondo e à direita, como nos outros painéis: de largura cheia ele
          comia a primeira linha da lista para oferecer uma ação que se usa uma
          vez por cena. */}
      <div className="flex items-center justify-end gap-2 p-2">
        {/* Sempre, e não só com a lista cheia: um campo que aparece e some
            conforme a campanha cresce é um campo com que o mestre não conta.
            Mesma decisão da busca de Personagens. */}
        <CampoDeBusca
          valor={busca}
          onMudar={setBusca}
          placeholder={t.sceneList.buscarPlaceholder(nome)}
          rotulo={t.sceneList.buscarRotulo(nome)}
        />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 rounded-full"
                aria-label={t.sceneList.novaPasta}
                onClick={criarPasta}
                disabled={!ready}
              >
                <FolderPlus />
              </Button>
            }
          />
          <TooltipContent>
            <p className="max-w-48">{t.sceneList.novaPastaDica(nome)}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 rounded-full"
                aria-label={t.sceneList.novo(nome)}
                onClick={() => criar()}
                disabled={!ready}
              >
                <Plus />
              </Button>
            }
          />
          <TooltipContent>{t.sceneList.novo(nome)}</TooltipContent>
        </Tooltip>
      </div>

      {/* Só a lista de mapas o monta: no fundo ele nunca abriria, e um diálogo
          que não tem como aparecer é mobília montada em toda troca de aba. */}
      {tipo === undefined ? (
        <NovoMapaDialog sceneId={novoMapaId} onFechar={() => setNovoMapaId(null)} />
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        {/* O fundo da lista, e SÓ ele, é o gatilho do menu do vazio, como no
            Arquivos: envolver as linhas faria os menus delas disputarem o mesmo
            botão direito. */}
        <div className="relative min-h-full">
          <ContextMenu>
            <ContextMenuTrigger render={<div className="absolute inset-0" aria-hidden />} />
            <ContextMenuContent className="w-48">
              <ContextMenuItem disabled={!ready} onClick={() => criar()}>
                <Plus />
                {t.sceneList.novo(nome)}
              </ContextMenuItem>
              <ContextMenuItem disabled={!ready} onClick={criarPasta}>
                <FolderPlus />
                {t.sceneList.novaPasta}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>

          {/* `pointer-events-none`: o aviso cobre o vazio, e o menu dele está
              DEBAIXO -- sem isto o botão direito no painel vazio não abriria. */}
          {ready && linhas.length === 0 && !buscando ? (
            <PainelVazio
              conteudo={{ tipo: "cenas" }}
              className="pointer-events-none absolute inset-0"
            >
              {t.sceneList.vazio(nome)}
            </PainelVazio>
          ) : null}

          {achados ? (
            // Sem reordenar enquanto busca: "depois deste" na lista de achados
            // não é um lugar da árvore. Ver o mesmo no Arquivos.
            <ul className="relative z-10 space-y-1 p-2 pt-0">
              {achados.length === 0 ? (
                <li className="text-muted-foreground px-2 py-2 text-xs">
                  {t.sceneList.nadaCom(busca.trim())}
                </li>
              ) : null}
              {achados.map((scene) => (
                <SceneRow
                  key={scene.id}
                  scene={scene}
                  pastas={pastas}
                  depth={0}
                  caminho={caminhoDaPasta(pastas, scene.pastaId)}
                  onStage={scene.id === editingSceneId}
                  live={scene.id === liveSceneId}
                  dropTarget={false}
                  renaming={renamingId === scene.id}
                  onRename={() => setRenamingId(scene.id)}
                  onRenameDone={() => setRenamingId(null)}
                  onGoLive={() => transmitir(scene.id)}
                  onOpen={() => abrir(scene.id)}
                />
              ))}
            </ul>
          ) : (
            <>
              <ul ref={listRef} className="relative z-10 space-y-1 p-2 pt-0">
                {linhas.map((linha, index) =>
                  linha.tipo === "pasta" ? (
                    <PastaRow
                      key={linha.pasta.id}
                      pasta={linha.pasta}
                      pastas={pastas}
                      depth={linha.depth}
                      total={linha.total}
                      dropTarget={dropIndex === index || alvoDoArrasto === linha.pasta.id}
                      onReorderStart={startReorder}
                      itensDeCriar={itensDeCriarNa(linha.pasta.id)}
                      alvo={alvoDaAba}
                    />
                  ) : (
                    <SceneRow
                      key={linha.item.id}
                      scene={linha.item}
                      pastas={pastas}
                      depth={linha.depth}
                      onStage={linha.item.id === editingSceneId}
                      live={linha.item.id === liveSceneId}
                      dropTarget={dropIndex === index}
                      onReorderStart={(event) =>
                        startReorder(event, linha.item.id, LIMIAR_ARRASTO_PX)
                      }
                      renaming={renamingId === linha.item.id}
                      onRename={() => setRenamingId(linha.item.id)}
                      onRenameDone={() => setRenamingId(null)}
                      onGoLive={() => transmitir(linha.item.id)}
                      onOpen={() => abrir(linha.item.id)}
                    />
                  ),
                )}
              </ul>

              {/* O vazio abaixo da lista é alvo: soltar aqui tira da pasta. Só
                  com pasta: sem nenhuma, o aviso falaria de algo que não existe. */}
              {pastas.length > 0 ? (
                <div className="relative z-10">
                  <FimDaLista
                    ativo={dropIndex === linhas.length || alvoDoArrasto === ""}
                    alvo={alvoDaAba}
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
      </ScrollArea>
    </>
  );
}

type SceneRowProps = {
  scene: Scene;
  /** As pastas desta lista, para o "Mover para". */
  pastas: Pasta[];
  /** O nível na árvore, para o recuo. */
  depth: number;
  /** O caminho da pasta, mostrado no achado da busca. Ver `caminhoDaPasta`. */
  caminho?: string;
  /** Aberta no palco do Mestre. */
  onStage: boolean;
  /** Sendo exibida para a mesa. */
  live: boolean;
  /** Linha onde a cena arrastada cairia. */
  dropTarget: boolean;
  /** Ausente nos achados da busca, que não reordenam. */
  onReorderStart?: (event: ReactPointerEvent) => void;
  renaming: boolean;
  onRename: () => void;
  onRenameDone: () => void;
  onGoLive: () => void;
  onOpen: () => void;
};

function SceneRow({
  scene,
  pastas,
  depth,
  caminho,
  onStage,
  live,
  dropTarget,
  onReorderStart,
  renaming,
  onRename,
  onRenameDone,
  onGoLive,
  onOpen,
}: SceneRowProps) {
  const renameScene = useSceneStore((state) => state.renameScene);
  const duplicateScene = useSceneStore((state) => state.duplicateScene);
  const definirCapa = useSceneStore((state) => state.definirCapa);
  /**
   * O arquivo de fundo DESTA cena, e só quando a linha vai mostrá-lo.
   *
   * `find` devolve o mesmo objeto do acervo enquanto ele não for relido, então
   * a comparação por identidade do zustand não acorda a linha à toa.
   */
  const imagem = useAssetsStore((state) =>
    ehFundo(scene) && scene.backgroundAssetId
      ? state.image.assets?.find((asset) => asset.id === scene.backgroundAssetId)
      : undefined,
  );
  const removeScene = useSceneStore((state) => state.removeScene);
  const [confirmando, setConfirmando] = useState(false);

  // O item do menu não renomeia na hora: ele PEDE, e o campo nasce quando o
  // menu termina de fechar. Ver `useRenomearPeloMenu` — era isto que fazia o
  // botão "Renomear" não fazer nada.
  const renomear = useRenomearPeloMenu(onRename);

  const fundoEmVoo = useFundoEmVoo((state) => state.cenas.includes(scene.id));
  const arrastarParaNota = useTokenDrag();

  function commitRename(value: string) {
    const name = value.trim();
    if (name && name !== scene.name) renameScene(scene.id, name);
    onRenameDone();
  }

  /**
   * Os itens da linha, escritos uma vez para as duas portas.
   *
   * O botão direito e os três pontos oferecem o MESMO: os três pontos são
   * o caminho de quem está procurando, o botão direito o de quem já sabe.
   * Ver `Kit`.
   */
  const itens = (kit: Kit) => {
    const { Item, Separator } = kit;
    return (
    <>
      <Item disabled={live} onClick={onGoLive}>
        <Radio />
        {t.geral.colocarNoAr}
      </Item>
      <Item onClick={renomear.pedir}>
        <Pencil />
        {t.sceneList.renomear}
      </Item>
      <Item onClick={() => duplicateScene(scene.id)}>
        <CopyPlus />
        {t.sceneList.duplicar}
      </Item>
      <ItensDeMover
        kit={kit}
        atual={scene.pastaId}
        destinos={pastas}
        onMover={(destino) => useSceneStore.getState().moverParaPasta(scene.id, destino)}
      />

      <Separator />

      {/* O fundo mora aqui e não na biblioteca de imagens: ele é da
          CENA. Na biblioteca, ele era mais uma linha entre imagens que
          ainda não são de ninguém -- e depois de escolhido continuava
          ali, oferecendo-se de novo. Ver `escolherFundoDaCena`. */}
      <Item
        disabled={fundoEmVoo}
        onClick={() => {
          void escolherFundoDaCena(scene.id).catch((cause) =>
            toast.error(
              cause instanceof Error
                ? cause.message
                : t.geral.falhaAoImportar,
            ),
          );
        }}
      >
        {fundoEmVoo ? (
          <Loader2 className="animate-spin" />
        ) : (
          <ImageIcon />
        )}
        {fundoEmVoo
          ? t.sceneList.importandoFundo
          : scene.backgroundAssetId
            ? t.sceneList.trocarFundo
            : t.sceneList.escolherFundo}
      </Item>

      {scene.backgroundAssetId ? (
        <Item
          onClick={() => void tirarFundoDaCena(scene.id)}
        >
          <ImageOff />
          {t.sceneList.tirarFundo}
        </Item>
      ) : null}

      {/* Só no FUNDO: a capa é o que fica na TV entre uma cena e outra, e pôr
          um mapa ali mostraria à mesa a grade e o chão da próxima luta antes
          de ela começar. Ver `Scene.capa`. */}
      {ehFundo(scene) ? (
        <Item onClick={() => definirCapa(scene.capa ? null : scene.id)}>
          <BookImage />
          {scene.capa ? t.sceneList.deixarDeSerCapa : t.sceneList.usarComoCapa}
        </Item>
      ) : null}

      <Separator />

      <Item
        variant="destructive"
        onClick={() => setConfirmando(true)}
      >
        <Trash2 />
        {t.sceneList.remover}
      </Item>

      <ItensDeExtensao
        alvo="linha.cena"
        contexto={{ alvo: "linha.cena", cenaId: scene.id }}
        kit={kit}
      />
    </>
    );
  };

  return (
    // Os filhos FORA do `render`, como nas linhas de Arquivos: e a forma
    // que deixa o dropdown dos tres pontos, la dentro, continuar
    // disparando. Ver a nota em `asset-library`.
    <ContextMenu onOpenChangeComplete={renomear.aoFechar}>
      <ContextMenuTrigger
        render={
          <li
            className={cn(
              "flex items-center gap-1 rounded-md p-1",
              onStage ? "bg-accent" : "hover:bg-accent/50",
              dropTarget && "ring-primary ring-1",
            )}
            style={depth > 0 ? { paddingLeft: 4 + depth * RECUO_PX } : undefined}
          />
        }
      >
        {/* A alça, e não a linha toda: a linha inteira já responde ao clique
            abrindo a cena, e arrastar de qualquer ponto dela deixaria os dois
            gestos disputando o mesmo alvo. */}
        {onReorderStart ? (
          <span
            className="text-muted-foreground hover:text-foreground shrink-0 cursor-grab touch-none px-0.5"
            aria-hidden
            onPointerDown={onReorderStart}
          >
            <GripVertical className="size-3.5" />
          </span>
        ) : null}
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-current={onStage}
          onClick={onOpen}
          // Arrastar o mapa para uma nota vira `>mapa`. A alça à esquerda
          // continua sendo o reordenar; aqui é o gesto de apontar.
          onPointerDown={(event) =>
            arrastarParaNota(event, {
              fonte: {
                tipo: "cena",
                sceneId: scene.id,
                nome: scene.name,
                lista: ehFundo(scene) ? "fundos" : "mapas",
              },
              largura: 1,
              altura: 1,
            })
          }
          onDoubleClick={onRename}
          // F2 renomeia, como no gerenciador de arquivos. Ver `aoApertarF2`.
          onKeyDown={aoApertarF2(onRename)}
        >
          <span className="relative shrink-0">
            <ScenePreview scene={scene} className="h-9 w-16" />
            {/* O fundo está copiando: o giro na miniatura é o que diz que o
                clique de há dois segundos ainda está trabalhando. */}
            {fundoEmVoo ? (
              <span
                className="absolute inset-0 flex items-center justify-center rounded bg-black/50"
                aria-label={t.sceneList.importandoFundoRotulo}
              >
                <Loader2 className="size-4 animate-spin" />
              </span>
            ) : null}
            {/* Ponto vermelho na miniatura: qual cena a mesa vê precisa ser
                legível de relance, sem depender de ler o nome. */}
            {live ? (
              <span
                className="absolute top-1 right-1 size-2 rounded-full bg-red-500 shadow-[0_0_6px] shadow-red-500/70"
                aria-hidden
              />
            ) : null}
          </span>

          <span className="min-w-0 flex-1">
            {renaming ? null : (
              <>
                <span className="block truncate text-sm">
                  {scene.name}
                  {live ? (
                    <span className="text-red-500"> · {t.sceneList.noAr}</span>
                  ) : null}
                  {/* Sem cor de aviso: a capa não está acontecendo agora, ela
                      é o que ACONTECE quando nada mais está. */}
                  {scene.capa ? (
                    <span className="text-muted-foreground"> · {t.sceneList.capa}</span>
                  ) : null}
                </span>
                <span className="text-muted-foreground block truncate text-[10px]">
                  {caminho ? `${caminho} · ` : null}
                  {resumoDaCena(scene, imagem)}
                </span>
              </>
            )}
          </span>
        </button>

        {renaming ? (
          <Input
            autoFocus
            defaultValue={scene.name}
            className="h-7 flex-1 text-sm"
            onBlur={(event) => commitRename(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitRename(event.currentTarget.value);
              if (event.key === "Escape") onRenameDone();
            }}
          />
        ) : (
          <>
            {live ? null : (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t.sceneList.colocarNomeNoAr(scene.name)}
                      onClick={onGoLive}
                    >
                      <Radio />
                    </Button>
                  }
                />
                <TooltipContent>
                  <p className="max-w-48">
                    {t.sceneList.abreEPassa(
                      NOME_DO_TIPO[scene.tipo ?? "mapa"].toLowerCase(),
                    )}
                  </p>
                </TooltipContent>
              </Tooltip>
            )}

            <DropdownMenu onOpenChangeComplete={renomear.aoFechar}>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t.sceneList.opcoesDe(scene.name)}
                  >
                    <MoreVertical />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-48">
                {itens(KIT_TRES_PONTOS)}
              </DropdownMenuContent>
            </DropdownMenu>
            <ConfirmarRemocao
              aberto={confirmando}
              onAberto={setConfirmando}
              titulo={t.sceneList.removerTitulo(scene.name)}
              // O que a cena REALMENTE tem: um fundo não guarda área escondida
              // nem câmera, e prometer apagá-las num diálogo de remoção é
              // descrever outra cena para quem está prestes a confirmar.
              itens={[
                t.sceneList.removerTokens,
                ...(temNevoa(scene) ? [t.sceneList.removerAreas] : []),
                ...(temCamera(scene) ? [t.sceneList.removerCameras] : []),
                t.sceneList.removerAnotacoes,
              ]}
              acao={t.sceneList.remover}
              onConfirmar={() => removeScene(scene.id)}
            />
          </>
        )}
      </ContextMenuTrigger>

      <ContextMenuContent className="w-48">
        {itens(KIT_CONTEXTO)}
      </ContextMenuContent>
    </ContextMenu>
  );
}
