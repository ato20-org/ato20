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
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { KIT_CONTEXTO, KIT_TRES_PONTOS, type Kit } from "@/components/ui/menu-kit";
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
import {
  escolherFundoDaCena,
  useFundoEmVoo,
  tirarFundoDaCena,
} from "@/lib/mestre/scene-background";
import { useAssetsStore } from "@/lib/store/use-assets-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import { cn } from "@/lib/utils";
import { useArquivoAbertoStore } from "@/lib/store/use-arquivo-aberto-store";
import {
  ehFundo,
  NOME_DO_TIPO,
  temCamera,
  temNevoa,
  type AssetMeta,
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
            Mapas
          </TabsTrigger>
          <TabsTrigger value="fundos" className="flex-none text-xs">
            Fundos
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
  const itens = `${scene.items.length} itens`;

  if (!ehFundo(scene)) return `${itens} · ${scene.fog.length} áreas`;
  if (!scene.backgroundAssetId) return `sem imagem · ${itens}`;

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
 * Os quadros não têm aba aqui: eles moram em Arquivos, numa árvore de pastas.
 * Ver `ArquivosList`.
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

  const moveSceneToIndex = useSceneStore((state) => state.moveSceneToIndex);
  const { listRef, dropIndex, startReorder } = useListReorder<string>(
    (sceneId, index) => {
      // O índice é desta lista, de um tipo só; o board tem os outros no meio.
      // O destino é o lugar de quem está nessa linha, e o fim quando cai no fim.
      if (!todas || !scenes) return;
      const antesDe = scenes[index]?.id;
      const destino = antesDe
        ? todas.findIndex((scene) => scene.id === antesDe)
        : todas.length - 1;
      moveSceneToIndex(sceneId, destino);
    },
  );

  /**
   * O mapa nasce e PERGUNTA de onde vem o chão -- imagem ou tabuleiro com
   * grade. Ver `NovoMapaDialog`.
   *
   * O fundo pula a pergunta e abre o seletor de arquivo direto: a única
   * resposta que ele aceita é a imagem, e um diálogo com uma opção só é um
   * clique a mais para chegar onde já se ia. Cancelar deixa o fundo preto, e a
   * imagem continua a um menu de distância na linha dele.
   */
  function criar() {
    const id = addScene(undefined, tipo);
    if (tipo !== "fundo") {
      setNovoMapaId(id);
      return;
    }

    void escolherFundoDaCena(id).catch((cause: unknown) =>
      toast.error(cause instanceof Error ? cause.message : "Falha ao importar."),
    );
  }

  return (
    <>
      {/* Redondo e à direita, como nos outros painéis: de largura cheia ele
          comia a primeira linha da lista para oferecer uma ação que se usa uma
          vez por cena. */}
      <div className="flex items-center justify-end p-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 rounded-full"
                aria-label={`Novo ${nome}`}
                onClick={criar}
                disabled={!ready}
              >
                <Plus />
              </Button>
            }
          />
          <TooltipContent>Novo {nome}</TooltipContent>
        </Tooltip>
      </div>

      {/* Só a lista de mapas o monta: no fundo ele nunca abriria, e um diálogo
          que não tem como aparecer é mobília montada em toda troca de aba. */}
      {tipo === undefined ? (
        <NovoMapaDialog sceneId={novoMapaId} onFechar={() => setNovoMapaId(null)} />
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        {ready && scenes?.length === 0 ? (
          <PainelVazio conteudo={{ tipo: "cenas" }}>
            Crie o primeiro {nome}
          </PainelVazio>
        ) : null}

        <ul ref={listRef} className="space-y-1 p-2 pt-0">
          {scenes?.map((scene, index) => (
            <SceneRow
              key={scene.id}
              scene={scene}
              onStage={scene.id === editingSceneId}
              live={scene.id === liveSceneId}
              dropTarget={dropIndex === index}
              onReorderStart={(event) => startReorder(event, scene.id)}
              renaming={renamingId === scene.id}
              onRename={() => setRenamingId(scene.id)}
              onRenameDone={() => setRenamingId(null)}
              onGoLive={() => setLiveSceneId(scene.id)}
              onOpen={() => {
                // Abrir uma cena volta ao palco, se havia nota aberta.
                fecharNota();
                setEditingSceneId(scene.id);
                // Seleção é por cena: manter itens da cena anterior
                // selecionados deixaria o gizmo apontando pro vazio.
                clearSelection();
                // Zoom também: o recorte de um mapa não diz nada sobre o outro.
                fitViewport();
              }}
            />
          ))}
        </ul>
      </ScrollArea>
    </>
  );
}

type SceneRowProps = {
  scene: Scene;
  /** Aberta no palco do Mestre. */
  onStage: boolean;
  /** Sendo exibida para a mesa. */
  live: boolean;
  /** Linha onde a cena arrastada cairia. */
  dropTarget: boolean;
  onReorderStart: (event: ReactPointerEvent) => void;
  renaming: boolean;
  onRename: () => void;
  onRenameDone: () => void;
  onGoLive: () => void;
  onOpen: () => void;
};

function SceneRow({
  scene,
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
  const itens = ({ Item, Separator }: Kit) => (
    <>
      <Item disabled={live} onClick={onGoLive}>
        <Radio />
        Colocar no ar
      </Item>
      <Item onClick={renomear.pedir}>
        <Pencil />
        Renomear
      </Item>
      <Item onClick={() => duplicateScene(scene.id)}>
        <CopyPlus />
        Duplicar
      </Item>

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
                : "Falha ao importar.",
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
          ? "Importando o fundo…"
          : scene.backgroundAssetId
            ? "Trocar o fundo"
            : "Escolher o fundo"}
      </Item>

      {scene.backgroundAssetId ? (
        <Item
          onClick={() => void tirarFundoDaCena(scene.id)}
        >
          <ImageOff />
          Tirar o fundo
        </Item>
      ) : null}

      {/* Só no FUNDO: a capa é o que fica na TV entre uma cena e outra, e pôr
          um mapa ali mostraria à mesa a grade e o chão da próxima luta antes
          de ela começar. Ver `Scene.capa`. */}
      {ehFundo(scene) ? (
        <Item onClick={() => definirCapa(scene.capa ? null : scene.id)}>
          <BookImage />
          {scene.capa ? "Deixar de ser capa" : "Usar como capa"}
        </Item>
      ) : null}

      <Separator />

      <Item
        variant="destructive"
        onClick={() => setConfirmando(true)}
      >
        <Trash2 />
        Remover
      </Item>
    </>
  );

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
          />
        }
      >
        {/* A alça, e não a linha toda: a linha inteira já responde ao clique
            abrindo a cena, e arrastar de qualquer ponto dela deixaria os dois
            gestos disputando o mesmo alvo. */}
        <span
          className="text-muted-foreground hover:text-foreground shrink-0 cursor-grab touch-none px-0.5"
          aria-hidden
          onPointerDown={onReorderStart}
        >
          <GripVertical className="size-3.5" />
        </span>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-current={onStage}
          onClick={onOpen}
          // Arrastar o mapa para uma nota vira `>mapa`. A alça à esquerda
          // continua sendo o reordenar; aqui é o gesto de apontar.
          onPointerDown={(event) =>
            arrastarParaNota(event, {
              fonte: { tipo: "cena", sceneId: scene.id, nome: scene.name },
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
                aria-label="Importando o fundo"
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
                  {live ? <span className="text-red-500"> · no ar</span> : null}
                  {/* Sem cor de aviso: a capa não está acontecendo agora, ela
                      é o que ACONTECE quando nada mais está. */}
                  {scene.capa ? (
                    <span className="text-muted-foreground"> · capa</span>
                  ) : null}
                </span>
                <span className="text-muted-foreground block text-[10px]">
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
                      aria-label={`Colocar ${scene.name} no ar`}
                      onClick={onGoLive}
                    >
                      <Radio />
                    </Button>
                  }
                />
                <TooltipContent>
                  <p className="max-w-48">
                    Passa a mesa para este mapa, sem sair do que tu edita.
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
                    aria-label={`Opções de ${scene.name}`}
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
              titulo={`Deseja remover ${scene.name}?`}
              // O que a cena REALMENTE tem: um fundo não guarda área escondida
              // nem câmera, e prometer apagá-las num diálogo de remoção é
              // descrever outra cena para quem está prestes a confirmar.
              itens={[
                "Tokens e imagens",
                ...(temNevoa(scene) ? ["Áreas escondidas"] : []),
                ...(temCamera(scene) ? ["Câmeras salvas"] : []),
                "Postits e anotações",
              ]}
              acao="Remover"
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
