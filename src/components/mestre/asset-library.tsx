"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  File,
  FileImage,
  FolderClosed,
  FolderPlus,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Radio,
  RadioTower,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { create } from "zustand";

import { PainelVazio } from "@/components/mestre/painel-vazio";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { KIT_CONTEXTO, KIT_TRES_PONTOS, type Kit } from "@/components/ui/menu-kit";
import {
  aoApertarF2,
  useRenomearPeloMenu,
} from "@/hooks/use-renomear-pelo-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useArrastoDeArquivo } from "@/hooks/use-arrasto-de-arquivo";
import { useAssetList } from "@/hooks/use-asset-list";
import { assetUrl } from "@/lib/vault/assets";
import { useFolderList } from "@/hooks/use-folder-list";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { useTokenDrag } from "@/hooks/use-token-drag";
import { MINIATURA } from "@/lib/miniatura";
import { centeredBox, fitInitialSize } from "@/lib/geometry/transform";
import { countAssetUsage } from "@/lib/mestre/asset-usage";
import {
  importarCaminhosNoAcervo,
  rotuloDoArrasto,
} from "@/lib/mestre/importar-arquivos";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useSpotlightStore } from "@/lib/store/use-spotlight-store";
import { useTokenDragStore } from "@/lib/store/use-token-drag-store";
import { cn } from "@/lib/utils";
import type { AssetFolder, AssetMeta, Scene } from "@/types/scene";

/** Usado quando a medida do arquivo não veio — arquivo antigo ou corrompido. */
const FALLBACK_SIZE = { x: 480, y: 270 };

/**
 * A marca do painel inteiro, que é quem aceita o arquivo vindo do sistema.
 *
 * O painel todo e não cada pasta: soltar aqui guarda no acervo, e escolher onde
 * guardar é outro gesto — o da linha, que o `useTokenDrag` já leva às pastas.
 */
const ZONA_DO_ACERVO = "[data-acervo-solto]";

/**
 * O tamanho com que a imagem entra na cena, em unidades de cena. Exportado
 * porque o handout arrasta a mesma imagem para o mesmo palco -- ver
 * `HandoutMestre`.
 */
export function tamanhoNaCena(asset: AssetMeta): { x: number; y: number } {
  return asset.naturalWidth && asset.naturalHeight
    ? fitInitialSize(asset.naturalWidth, asset.naturalHeight)
    : FALLBACK_SIZE;
}

/**
 * A Biblioteca: tudo o que a campanha guarda, menos o som, que tem aba
 * própria. Imagem entra na cena e vai ao ar; o resto -- PDF, texto, o que
 * vier -- fica guardado e abre por fora. Não depende de cena: acervo é da
 * campanha, e a cena é só um dos destinos do que está aqui.
 */
export function AssetLibrary({ scene }: { scene?: Scene | null }) {
  const {
    assets: imagens,
    remove,
    move,
    refresh: refreshImagens,
  } = useAssetList("image");
  // A importação sai da lista de ARQUIVOS: é a que aceita qualquer coisa, e o
  // Rust separa o que é imagem. `absorverImportacao` acorda as duas listas.
  const {
    assets: arquivos,
    importar,
    importando,
    remove: removeArquivo,
    move: moveArquivo,
    refresh: refreshArquivos,
  } = useAssetList("file");
  const todos = useMemo(() => [...imagens, ...arquivos], [imagens, arquivos]);
  const refresh = useCallback(() => {
    refreshImagens();
    refreshArquivos();
  }, [refreshImagens, refreshArquivos]);
  const removerQualquer = useCallback(
    (asset: AssetMeta) => (asset.kind === "image" ? remove(asset.id) : removeArquivo(asset.id)),
    [remove, removeArquivo],
  );

  /**
   * Só o que não tem dono.
   *
   * Fundo de cena, retrato e miniatura de personagem entram no acervo porque
   * precisam alcançar a TV, mas eles JÁ SÃO de alguém: aparecer aqui misturava o
   * que ainda vai ser escolhido com o que já foi. Numa campanha com dez
   * personagens eram vinte linhas que ninguém vai arrastar para o mapa.
   *
   * Cada um deles é trocado onde mora — o fundo no menu da cena, os dois no
   * campo da ficha. Ver `AssetMeta.escopo`.
   */
  const assets = todos.filter((asset) => !asset.escopo);
  // Mexer em pasta muda arquivo — apagar devolve o conteúdo à raiz —, então a
  // lista de arquivos recarrega junto.
  const {
    folders,
    create,
    rename,
    move: moveFolder,
    remove: removeFolder,
  } = useFolderList(refresh);
  const [creating, setCreating] = useState(false);
  /** A pasta que nascer leva os selecionados para dentro. Ver o menu. */
  const [creatingComSelecao, setCreatingComSelecao] = useState(false);

  /**
   * Seleção de arquivos, só deste painel e só para arrumar: Ctrl soma, Shift
   * pega o trecho, arrastar um selecionado leva todos, e o botão direito faz
   * uma pasta com eles. Não é a seleção do palco -- arquivo do acervo não está
   * em cena -- e não persiste: fechar o painel esquece.
   */
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const ancora = useRef<string | null>(null);
  const selecionadosRef = useRef(selecionados);
  useEffect(() => {
    selecionadosRef.current = selecionados;
  }, [selecionados]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  /** Pasta que ganha uma subpasta agora: o campo de nome nasce dentro dela. */
  const [creatingIn, setCreatingIn] = useState<string | null>(null);

  /**
   * O arquivo largado do gerenciador de arquivos SOBRE este painel.
   *
   * O outro destino do mesmo gesto é o mapa, e a diferença entre os dois é a
   * pergunta que cada um responde: soltar no mapa é "põe isto na cena AQUI", e
   * soltar aqui é "guarda isto para depois" — o arquivo entra no acervo e cena
   * nenhuma muda. Ver `ArquivoFantasma`, que recebe o outro.
   *
   * Entra na raiz mesmo que o ponteiro esteja sobre uma pasta aberta: o arrasto
   * é do sistema operacional, e a prévia dele não mostra a imagem nem escolhe
   * tamanho — prometer pontaria fina num gesto que não tem retorno visual era
   * convidar a errar a pasta.
   */
  const noAr = useArrastoDeArquivo(ZONA_DO_ACERVO, (caminhos) => {
    void importarCaminhosNoAcervo(caminhos).then(avisarOsSons);
  });

  const scenes = useSceneStore((state) => state.board?.scenes);
  const addItem = useSceneStore((state) => state.addItem);
  const select = useSelectionStore((state) => state.select);

  function handleAddToScene(asset: AssetMeta) {
    if (!scene || asset.kind !== "image") return;
    const size = tamanhoNaCena(asset);

    select([
      addItem(scene.id, { assetId: asset.id, ...centeredBox(size.x, size.y) }),
    ]);
  }

  /** Move. Só o arrasto chama: mudar de pasta saiu do menu da linha. */
  const handleMove = useCallback(
    (assetId: string, folderId: string | undefined) => {
      const asset = todos.find((atual) => atual.id === assetId);
      void (asset?.kind === "image" ? move : moveArquivo)(assetId, folderId);
    },
    [todos, move, moveArquivo],
  );

  /**
   * Quem recebe a linha solta sobre uma pasta.
   *
   * Um registro para o painel inteiro, e não um por pasta: o que muda entre
   * elas é só o `folderId`, que vem no destino. Ver `useTokenDrag`.
   */
  useEffect(
    () =>
      useTokenDragStore
        .getState()
        .registrarAlvo("acervo", (arrasto, destino) => {
          if (arrasto.fonte.tipo !== "acervo" || destino.tipo !== "pasta") {
            return;
          }

          // Arrastou um dos selecionados: vão todos. Arrastou outro: só ele,
          // e a seleção fica onde estava.
          const { assetId } = arrasto.fonte;
          const juntos = selecionadosRef.current.includes(assetId)
            ? selecionadosRef.current
            : [assetId];
          for (const id of juntos) handleMove(id, destino.folderId);
        }),
    [handleMove],
  );

  /** Os arquivos na ordem em que a lista os mostra: pastas primeiro, depois os soltos. */
  const ordemVisivel = useCallback((): string[] => {
    const ids: string[] = [];
    const nivel = (parentId: string | undefined) => {
      for (const folder of folders.filter((f) => f.parentId === parentId)) {
        nivel(folder.id);
        for (const asset of assets)
          if (asset.folderId === folder.id) ids.push(asset.id);
      }
    };
    nivel(undefined);
    for (const asset of assets) if (!asset.folderId) ids.push(asset.id);
    return ids;
  }, [folders, assets]);

  const ordemRef = useRef(ordemVisivel);
  useEffect(() => {
    ordemRef.current = ordemVisivel;
  }, [ordemVisivel]);

  /**
   * Clique numa linha, com as convenções de qualquer lista de arquivos:
   * simples troca a seleção, Ctrl soma ou tira, Shift pega o trecho desde o
   * último clicado. Estável, para a linha não redesenhar por causa dele.
   */
  const onSelect = useCallback((assetId: string, event: React.MouseEvent) => {
    setSelecionados((atuais) => {
      if (event.shiftKey && ancora.current) {
        const ordem = ordemRef.current();
        const a = ordem.indexOf(ancora.current);
        const b = ordem.indexOf(assetId);
        if (a !== -1 && b !== -1) {
          const trecho = ordem.slice(Math.min(a, b), Math.max(a, b) + 1);
          return [...new Set([...atuais, ...trecho])];
        }
      }

      ancora.current = assetId;

      if (event.ctrlKey || event.metaKey)
        return atuais.includes(assetId)
          ? atuais.filter((id) => id !== assetId)
          : [...atuais, assetId];

      return [assetId];
    });
  }, []);

  const loose = assets.filter((asset) => !asset.folderId);

  /**
   * Monta a linha com o contexto do painel.
   *
   * Função que devolve elemento, e não componente aninhado: componente
   * declarado dentro do render nasce com identidade nova a cada passada, e o
   * React desmontaria e remontaria toda linha — perdendo a URL já resolvida da
   * miniatura e cancelando um arrasto em curso.
   */
  function renderRow(asset: AssetMeta) {
    return (
      <AssetRow
        key={asset.id}
        asset={asset}
        selected={selecionados.includes(asset.id)}
        usageCount={countAssetUsage(scenes ?? [], asset.id)}
        onAdd={scene && asset.kind === "image" ? () => handleAddToScene(asset) : undefined}
        onSelect={onSelect}
        onRemove={() => void removerQualquer(asset)}
      />
    );
  }

  /**
   * As pastas de um nível, cada uma com as de dentro. Recursivo pela mesma
   * razão de `renderRow` ser função e não componente: identidade estável.
   *
   * O total conta os arquivos das subpastas também: "Mapas · 12" tem de dizer
   * quanto há em Mapas, não quanto está solto no primeiro nível dela.
   */
  function renderFolders(parentId: string | undefined): React.ReactNode {
    return folders
      .filter((folder) => folder.parentId === parentId)
      .map((folder) => {
        const inside = assets.filter((asset) => asset.folderId === folder.id);
        const dentroDe = new Set(descendentes(folders, folder.id));
        const total = assets.filter(
          (asset) => asset.folderId && dentroDe.has(asset.folderId),
        ).length;

        return (
          <FolderGroup
            key={folder.id}
            folder={folder}
            folders={folders}
            count={total}
            renaming={renamingId === folder.id}
            onRename={() => setRenamingId(folder.id)}
            onRenameCommit={(name) => {
              void rename(folder.id, name);
              setRenamingId(null);
            }}
            onRenameCancel={() => setRenamingId(null)}
            onNewChild={() => setCreatingIn(folder.id)}
            onMove={(parent) => void moveFolder(folder.id, parent)}
            onDelete={() => void removeFolder(folder.id)}
          >
            {creatingIn === folder.id ? (
              <li>
                <FolderNameInput
                  placeholder="Nome da subpasta"
                  onCommit={(name) => {
                    void create(name, folder.id);
                    setCreatingIn(null);
                  }}
                  onCancel={() => setCreatingIn(null)}
                />
              </li>
            ) : null}
            {renderFolders(folder.id)}
            {inside.map(renderRow)}
          </FolderGroup>
        );
      });
  }

  return (
    <div
      data-acervo-solto
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        // Por dentro (`ring-inset`): o painel atracado encosta na borda da
        // coluna, e um anel por fora ficaria cortado justamente do lado por
        // onde o arquivo chega.
        noAr && "ring-primary/60 bg-primary/5 ring-2 ring-inset",
      )}
    >
      {/* Dois botoes redondos numa fileira, no lugar de duas barras empilhadas
          de largura cheia. As duas comiam quase noventa pixels do topo -- num
          painel que existe para mostrar imagens -- para oferecer acoes que o
          mestre faz uma vez por sessao. Mesmo arranjo do painel de
          Personagens; o que cada um faz vive no tooltip e no rotulo. */}
      <div className="flex flex-col gap-2 p-2">
        {creating ? (
          <FolderNameInput
            placeholder="Nome da pasta"
            onCommit={(name) => {
              const levar = creatingComSelecao ? selecionadosRef.current : [];
              void create(name).then((pasta) => {
                for (const id of levar) handleMove(id, pasta.id);
              });
              setCreating(false);
              setCreatingComSelecao(false);
            }}
            onCancel={() => {
              setCreating(false);
              setCreatingComSelecao(false);
            }}
          />
        ) : (
          <div className="flex items-center justify-end gap-2">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0 rounded-full"
                    aria-label="Nova pasta"
                    onClick={() => setCreating(true)}
                  >
                    <FolderPlus />
                  </Button>
                }
              />
              <TooltipContent>Nova pasta</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0 rounded-full"
                    aria-label={
                      importando ? "Importando arquivos" : "Importar arquivos"
                    }
                    disabled={importando}
                    onClick={() => void importar()}
                  >
                    {importando ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Upload />
                    )}
                  </Button>
                }
              />
              <TooltipContent>
                {importando ? "Importando…" : "Importar arquivos"}
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* O que está vindo, no mesmo rótulo que a sombra do mapa escreve. A
            borda acesa diz que o painel aceita; esta linha diz o quê. */}
        {noAr ? (
          <p className="border-primary/60 bg-primary/10 flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1 text-[11px]">
            <FileImage className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{rotuloDoArrasto(noAr.caminhos)}</span>
          </p>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {/* O fundo da lista, e SÓ ele, é o gatilho do menu de contexto.
            Envolver as linhas fazia o menu de três pontos de cada pasta parar
            de funcionar: um `Menu.Root` dentro de um `ContextMenu.Trigger`
            passa a se achar filho do menu de contexto, e os itens dele deixam
            de disparar. O próprio base-ui tem uma guarda com esse nome. */}
        <div className="relative min-h-full">
          <ContextMenu>
            <ContextMenuTrigger
              render={<div className="absolute inset-0" aria-hidden />}
            />

            <ContextMenuContent>
              <ContextMenuItem onClick={() => setCreating(true)}>
                <FolderPlus />
                Nova pasta
              </ContextMenuItem>
              {selecionados.length > 0 ? (
                <ContextMenuItem
                  onClick={() => {
                    setCreatingComSelecao(true);
                    setCreating(true);
                  }}
                >
                  <FolderPlus />
                  {selecionados.length === 1
                    ? "Nova pasta com a selecionada"
                    : `Nova pasta com as ${selecionados.length} selecionadas`}
                </ContextMenuItem>
              ) : null}
              <ContextMenuItem
                disabled={importando}
                onClick={() => void importar()}
              >
                <Upload />
                Importar arquivos
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>

          {assets.length === 0 && folders.length === 0 ? (
            <PainelVazio conteudo={{ tipo: "imagens" }} className="pointer-events-none absolute inset-0">
              Importe mapas, tokens e retratos
            </PainelVazio>
          ) : (
            <div className="relative z-10 space-y-2 p-2">
              {/* Pastas primeiro, e a raiz embaixo: arquivo novo cai na raiz, e
                  é de lá que ele é distribuído. */}
              {renderFolders(undefined)}

              {folders.length > 0 ? (
                <RootDrop vazio={loose.length === 0}>
                  {loose.map(renderRow)}
                </RootDrop>
              ) : (
                <ul className="space-y-1">{loose.map(renderRow)}</ul>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/**
 * O som que caiu num painel de imagens entrou no acervo — e sumiu daqui.
 *
 * O Rust aceita os dois tipos na mesma importação, e recusar som aqui seria
 * jogar fora arquivo que a campanha quer. Mas ele vai para o painel de sons, e
 * sem este aviso o gesto pareceria não ter feito nada.
 */
function avisarOsSons(aceitos: AssetMeta[]) {
  const sons = aceitos.filter((asset) => asset.kind !== "image").length;
  if (sons === 0) return;

  toast.info(
    sons === 1
      ? "1 som entrou no acervo. Ele está no painel de sons."
      : `${sons} sons entraram no acervo. Eles estão no painel de sons.`,
  );
}

/**
 * O arrasto de uma PASTA sobre outra, no próprio painel.
 *
 * Não passa pelo `useTokenDragStore`: aquele gesto é "leva esta imagem ao
 * mapa", com prévia, roda de tamanho e três telas que sabem receber. Pasta não
 * vai ao mapa. O que ela precisa é achar sob o cursor outro `data-pasta-acervo`
 * -- o mesmo atributo que o gesto da imagem já lê -- e soltar. Um store
 * pequeno, para a pasta sob o cursor acender sem redesenhar as outras.
 *
 * `alvo` é `SEM_ALVO` fora de qualquer pasta; `undefined` é a raiz.
 */
const SEM_ALVO = Symbol("sem alvo");

type PastaDragStore = {
  pastaId: string | null;
  alvo: string | undefined | typeof SEM_ALVO;
  comecar: (pastaId: string) => void;
  mirar: (alvo: string | undefined | typeof SEM_ALVO) => void;
  terminar: () => void;
};

const usePastaDragStore = create<PastaDragStore>((set) => ({
  pastaId: null,
  alvo: SEM_ALVO,
  comecar: (pastaId) => set({ pastaId, alvo: SEM_ALVO }),
  mirar: (alvo) => set((state) => (state.alvo === alvo ? state : { alvo })),
  terminar: () => set({ pastaId: null, alvo: SEM_ALVO }),
}));

/** Quanto o ponteiro anda antes de o toque no cabeçalho virar arrasto. */
const LIMIAR_PASTA_PX = 5;

/**
 * Pega a pasta pelo cabeçalho e larga sobre outra, ou sobre a raiz.
 *
 * Limiar antes de virar arrasto, e sem `preventDefault`: o cabeçalho tem
 * clique (abre e fecha) e duplo clique (renomeia), e os dois têm de continuar
 * sendo o que eram.
 */
function useArrastoDePasta(
  folderId: string,
  onDrop: (parentId: string | undefined) => void,
) {
  return useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;

      const target = event.currentTarget as HTMLElement;
      // Pointerdown vindo do menu de três pontos, que é portal: borbulha pelo
      // React até o cabeçalho sem estar dentro dele no DOM. Não é pegar a
      // pasta. Mesma guarda do `useListReorder`.
      if (!target.contains(event.target as Node)) return;

      const { pointerId, clientX: x0, clientY: y0 } = event;
      let arrastando = false;

      const alvoEm = (x: number, y: number) => {
        const sob = document.elementFromPoint(x, y);
        const pasta = sob?.closest<HTMLElement>("[data-pasta-acervo]");
        if (!pasta) return SEM_ALVO;
        return pasta.dataset.folderId || undefined;
      };

      const mover = (native: PointerEvent) => {
        if (native.pointerId !== pointerId) return;
        if (!arrastando) {
          if (
            Math.hypot(native.clientX - x0, native.clientY - y0) <
            LIMIAR_PASTA_PX
          )
            return;
          arrastando = true;
          target.setPointerCapture(pointerId);
          usePastaDragStore.getState().comecar(folderId);
        }
        usePastaDragStore
          .getState()
          .mirar(alvoEm(native.clientX, native.clientY));
      };

      const soltar = (native: PointerEvent) => {
        if (native.pointerId !== pointerId) return;
        target.removeEventListener("pointermove", mover);
        target.removeEventListener("pointerup", soltar);
        target.removeEventListener("pointercancel", soltar);

        if (arrastando) {
          target.releasePointerCapture(pointerId);
          const alvo = alvoEm(native.clientX, native.clientY);
          usePastaDragStore.getState().terminar();
          if (native.type === "pointerup" && alvo !== SEM_ALVO) onDrop(alvo);
        }
      };

      target.addEventListener("pointermove", mover);
      target.addEventListener("pointerup", soltar);
      target.addEventListener("pointercancel", soltar);
    },
    [folderId, onDrop],
  );
}

/** Esta pasta (ou a raiz, com `undefined`) está sob uma PASTA arrastada? */
function useSobPastaArrastada(folderId: string | undefined): boolean {
  return usePastaDragStore(
    (state) => state.pastaId !== null && state.alvo === folderId,
  );
}

/** A pasta e todas as descendentes dela, por id. Espelha o Rust. */
function descendentes(folders: AssetFolder[], id: string): string[] {
  const ids = [id];
  let cresceu = true;

  while (cresceu) {
    cresceu = false;
    for (const folder of folders) {
      if (
        folder.parentId &&
        ids.includes(folder.parentId) &&
        !ids.includes(folder.id)
      ) {
        ids.push(folder.id);
        cresceu = true;
      }
    }
  }

  return ids;
}

/**
 * Uma pasta está sob o ponteiro de um arrasto agora?
 *
 * Booleano, e não o destino inteiro: um seletor que devolvesse o arrasto faria
 * cada pasta redesenhar a cada quadro do gesto, e ele escreve a posição do
 * ponteiro uma vez por quadro. Assim só as duas que mudam de estado — a que
 * saiu e a que entrou — redesenham. Mesmo argumento da linha da evidência.
 *
 * Quem decide se a pasta é alvo válido é o gesto, em `aceita`: item de
 * inventário passando por cima não a acende.
 */
function useSobOPonteiro(folderId: string | undefined): boolean {
  return useTokenDragStore((state) => {
    const destino = state.arrasto?.destino;

    return destino?.tipo === "pasta" && destino.folderId === folderId;
  });
}

/**
 * Uma pasta e o que está dentro, subpastas incluídas.
 *
 * O cabeçalho é o alvo do arrasto: soltar a linha de um arquivo sobre ele
 * move. Aceita solto mesmo colapsada — é o caso de guardar sem querer ver.
 *
 * O alvo se anuncia por atributo no DOM, e não por handler de arrasto nativo:
 * quem procura é o gesto próprio da linha, com `elementFromPoint`. Ver
 * `useTokenDrag`.
 */
function FolderGroup({
  folder,
  folders,
  count,
  renaming,
  onRename,
  onRenameCommit,
  onRenameCancel,
  onNewChild,
  onMove,
  onDelete,
  children,
}: {
  folder: AssetFolder;
  /** Todas, para o "Mover para" listar destinos. */
  folders: AssetFolder[];
  count: number;
  renaming: boolean;
  onRename: () => void;
  onRenameCommit: (name: string) => void;
  onRenameCancel: () => void;
  onNewChild: () => void;
  /** Para dentro de outra pasta, ou para a raiz com `undefined`. */
  onMove: (parentId: string | undefined) => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  // Fechada por padrão: o painel tem 288px de largura, e três pastas abertas
  // empurram a raiz — de onde sai o arquivo recém-enviado — para fora da vista.
  const [open, setOpen] = useState(false);
  const recebeImagem = useSobOPonteiro(folder.id);
  const recebePasta = useSobPastaArrastada(folder.id);
  const receiving = recebeImagem || recebePasta;
  const naMao = usePastaDragStore((state) => state.pastaId === folder.id);

  // Destinos que o gesto recusa: ela mesma, a mãe atual, e as descendentes --
  // essas o Rust recusaria em silêncio, e é melhor não acender.
  const pegar = useArrastoDePasta(folder.id, (parentId) => {
    if (parentId === folder.id || parentId === folder.parentId) return;
    if (parentId && descendentes(folders, folder.id).includes(parentId)) return;
    onMove(parentId);
  });

  // Destinos válidos: nem ela, nem quem já é a mãe, nem descendente dela —
  // esse último o Rust recusaria em silêncio, e um item que não faz nada é
  // pior que um item que não existe.
  const proibidos = new Set(descendentes(folders, folder.id));
  const destinos = folders.filter(
    (outra) => !proibidos.has(outra.id) && outra.id !== folder.parentId,
  );

  // O campo de nome só nasce depois de o menu fechar: a troca desmonta o menu,
  // e o foco devolvido ao gatilho que sumiu matava o campo no mesmo quadro. É a
  // mesma correção da lista de cenas. Ver `useRenomearPeloMenu`.
  const renomear = useRenomearPeloMenu(onRename);

  /**
   * Os itens da pasta, escritos uma vez para as duas portas.
   *
   * O botão direito na linha e os três pontos dela oferecem o MESMO -- os três
   * pontos só aparecem no hover, então quem usa teclado ou quem já sabe onde
   * clicar chega pelo outro caminho. Ver `Kit`.
   */
  const itens = ({ Item, Separator }: Kit) => (
    <>
      <Item
        onClick={() => {
          setOpen(true);
          onNewChild();
        }}
      >
        <FolderPlus />
        Nova subpasta
      </Item>
      <Item onClick={renomear.pedir}>
        <Pencil />
        Renomear
      </Item>

      {destinos.length > 0 || folder.parentId ? (
        <>
          <Separator />
          {folder.parentId ? (
            <Item onClick={() => onMove(undefined)}>
              <FolderClosed />
              Tirar para a raiz
            </Item>
          ) : null}
          {destinos.map((outra) => (
            <Item key={outra.id} onClick={() => onMove(outra.id)}>
              <FolderClosed />
              <span className="truncate">Mover para {outra.name}</span>
            </Item>
          ))}
        </>
      ) : null}

      <Separator />
      <Item variant="destructive" onClick={onDelete}>
        <Trash2 />
        Apagar pasta
      </Item>
    </>
  );

  return (
    <section>
      {/* O botão direito na linha da pasta, com os mesmos itens dos três
          pontos. `ContextMenuTrigger` com os filhos FORA do `render`, como nas
          linhas de Arquivos: é a forma que deixa o dropdown de dentro
          continuar disparando. */}
      <ContextMenu onOpenChangeComplete={renomear.aoFechar}>
        <ContextMenuTrigger
          render={
            <div
              data-pasta-acervo
              data-folder-id={folder.id}
              className={cn(
                "group flex cursor-grab touch-none items-center gap-1 rounded-md px-1 py-1",
                receiving
                  ? "bg-primary/15 ring-primary/60 ring-1"
                  : "hover:bg-accent/50",
                naMao && "opacity-40",
              )}
              // O cabeçalho inteiro arrasta a pasta para dentro de outra.
              // Botões e campo param a propagação para o toque neles não virar
              // arrasto.
              onPointerDown={pegar}
            />
          }
        >
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={open ? `Fechar ${folder.name}` : `Abrir ${folder.name}`}
            aria-expanded={open}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setOpen(!open)}
          >
            {open ? <ChevronDown /> : <ChevronRight />}
          </Button>

          <FolderClosed
            className="text-muted-foreground size-3.5 shrink-0"
            aria-hidden
          />

          {renaming ? (
            <div
              className="min-w-0 flex-1"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <FolderNameInput
                defaultValue={folder.name}
                onCommit={onRenameCommit}
                onCancel={onRenameCancel}
              />
            </div>
          ) : (
            <>
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-xs font-medium"
                onDoubleClick={onRename}
                // F2 renomeia, a mesma convenção da lista de cenas.
                onKeyDown={aoApertarF2(onRename)}
                onClick={() => setOpen(!open)}
              >
                {folder.name}
              </button>
              <span className="text-muted-foreground text-[10px]">{count}</span>

              <DropdownMenu onOpenChangeComplete={renomear.aoFechar}>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Opções de ${folder.name}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      // Escondido até o ponteiro chegar ou o foco entrar: renomear
                      // e apagar pasta são gestos raros, e três pontos em cada
                      // linha viram ruído numa lista que se lê de relance.
                      // `focus-within` mantém o alcance pelo teclado.
                      className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-[popup-open]:opacity-100"
                    >
                      <MoreVertical />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end" className="w-52">
                  {itens(KIT_TRES_PONTOS)}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </ContextMenuTrigger>

        <ContextMenuContent className="w-52">
          {itens(KIT_CONTEXTO)}
        </ContextMenuContent>
      </ContextMenu>

      {/* Apagar pasta não apaga arquivo, e o aviso vive aqui porque é onde a
          dúvida aparece. */}
      {open ? <ul className="mt-1 space-y-1 pl-5">{children}</ul> : null}
    </section>
  );
}

/**
 * A raiz também recebe arrasto: é como um arquivo sai da pasta.
 *
 * Sem `data-folder-id`, e é isso que a distingue: o gesto lê o atributo ausente
 * como "sem pasta", que é exatamente o que mover para cá significa.
 *
 * Sem rótulo nem moldura própria: os arquivos soltos são só a continuação da
 * lista, abaixo das pastas. Tinha um título "Fora de pasta" com borda
 * tracejada, e ele dividia o painel em dois quando o que há é uma lista só. A
 * área se anuncia só enquanto um arrasto passa por cima, que é quando importa
 * saber que soltar aqui tira da pasta.
 */
function RootDrop({
  vazio,
  children,
}: {
  vazio: boolean;
  children: React.ReactNode;
}) {
  const recebeImagem = useSobOPonteiro(undefined);
  const recebePasta = useSobPastaArrastada(undefined);
  const receiving = recebeImagem || recebePasta;

  return (
    <section
      data-pasta-acervo
      className={cn(
        // Altura mínima para haver onde soltar quando não há arquivo solto.
        "min-h-10 rounded-md p-1",
        receiving && "bg-primary/10 ring-primary/60 ring-1",
      )}
    >
      {vazio && receiving ? (
        <p className="text-muted-foreground px-1 py-2 text-xs">
          Solte aqui para tirar da pasta.
        </p>
      ) : null}
      <ul className="space-y-1">{children}</ul>
    </section>
  );
}

/** Nome de pasta: Enter confirma, Escape cancela, sair do campo confirma. */
function FolderNameInput({
  defaultValue,
  placeholder,
  onCommit,
  onCancel,
}: {
  defaultValue?: string;
  placeholder?: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  function commit(raw: string) {
    const name = raw.trim();
    if (name) onCommit(name);
    else onCancel();
  }

  return (
    <Input
      autoFocus
      defaultValue={defaultValue}
      placeholder={placeholder}
      className="h-7 flex-1 text-xs"
      onBlur={(event) => commit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit(event.currentTarget.value);
        if (event.key === "Escape") onCancel();
      }}
    />
  );
}

type AssetRowProps = {
  asset: AssetMeta;
  selected: boolean;
  usageCount: number;
  /** Ausente = não entra na cena: não há cena aberta, ou não é imagem. */
  onAdd?: () => void;
  onSelect: (assetId: string, event: React.MouseEvent) => void;
  onRemove: () => void;
};

function AssetRow({
  asset,
  selected,
  usageCount,
  onAdd,
  onSelect,
  onRemove,
}: AssetRowProps) {
  const imagem = asset.kind === "image";
  const url = useAssetUrl(imagem ? asset.id : undefined, "mini");

  // Boolean, e não o objeto: seletor que devolve o `spotlight` inteiro
  // redesenharia toda linha da lista a cada troca de evidência. Assim só as
  // duas linhas que mudam de estado — a que saiu e a que entrou — redesenham.
  const noAr = useSpotlightStore(
    (state) => state.spotlight?.assetId === asset.id,
  );
  const transmit = useSpotlightStore((state) => state.transmit);
  const clear = useSpotlightStore((state) => state.clear);

  const arrastar = useTokenDrag();

  // A linha some enquanto está no ar, como a do personagem: o arquivo está na
  // mão, e vê-lo em dois lugares ao mesmo tempo contradiz o gesto.
  const naMao = useTokenDragStore(
    (state) =>
      state.arrasto?.fonte.tipo === "acervo" &&
      state.arrasto.fonte.assetId === asset.id,
  );

  return (
    // Arrastável inteiro, e não só a miniatura: o alvo de 40px do polegar seria
    // o menor da tela, e o `+` continua ali para quem prefere clicar — a cena
    // aceita a imagem no centro por ele.
    <li
      className={cn(
        "group flex cursor-grab items-center gap-1 rounded-md p-1 select-none active:cursor-grabbing",
        selected ? "bg-accent" : "hover:bg-accent/50",
        naMao && "opacity-40",
      )}
      // Clique seleciona; o arrasto começa no pointerdown abaixo e só vira
      // arrasto depois do limiar, então os dois convivem. Ver `useTokenDrag`.
      onClick={(event) => onSelect(asset.id, event)}
      // Gesto próprio e não o arrasto do navegador: é o que permite a sombra da
      // imagem no mapa e a roda escolhendo o tamanho no ar -- ver `useTokenDrag`.
      // O mesmo gesto alcança as pastas, que o arrasto nativo servia antes.
      onPointerDown={(event) => {
        // Arquivo que não é imagem não vai para a cena: o arrasto dele é só
        // entre pastas, e o `useTokenDrag` cuida disso com o mesmo gesto.
        const tamanho = imagem ? tamanhoNaCena(asset) : { x: 1, y: 1 };

        arrastar(event, {
          fonte: { tipo: "acervo", assetId: asset.id },
          largura: tamanho.x,
          altura: tamanho.y,
        });
      }}
    >
      <span className="bg-muted text-muted-foreground grid size-10 shrink-0 place-items-center overflow-hidden rounded">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className="size-full object-cover"
            draggable={false}
            {...MINIATURA}
          />
        ) : imagem ? null : (
          <File className="size-5" aria-hidden />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs" title={asset.name}>
          {asset.name}
        </span>
      </span>

      {onAdd ? (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Adicionar ${asset.name} à cena`}
          onClick={onAdd}
        >
          <Plus />
        </Button>
      ) : null}
      {/* Menu com o resto: transmitir para a mesa, mover entre pastas — que
          também se faz arrastando, mas o arrasto não alcança pasta rolada fora
          de vista — e apagar. Só o `+` fica solto na linha; ícones lado a lado
          numa lista rolável eram ruído, e nenhum deles é gesto de toda hora
          como adicionar à cena.

          "Usar como fundo" e "usar como retrato" saíram: cada arquivo agora tem
          uma casa só, e é de lá que ele é escolhido. */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Opções de ${asset.name}`}
            >
              <MoreVertical />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-48">
          {/* Primeiro item, e acima de mover e apagar: é a única coisa aqui que
              a mesa vê acontecer, e as outras são arrumação do acervo.

              Existe porque o `+` da linha é o outro destino possível da mesma
              imagem, e os dois não são a mesma pergunta: mapa é cenário que
              fica, evidência é "olha isto" — o retrato do PNJ, o documento, a
              carta. Antes disto, mostrar um handout obrigava a jogá-lo no mapa
              e depois apagá-lo de lá. */}
          {imagem ? (
            <DropdownMenuItem onClick={noAr ? clear : () => transmit(asset.id)}>
              {noAr ? <RadioTower /> : <Radio />}
              {noAr ? "Tirar da evidência" : "Transmitir para a mesa"}
            </DropdownMenuItem>
          ) : (
            // Arquivo que não é imagem abre por fora, no programa do sistema:
            // PDF no leitor, texto no editor. A biblioteca guarda; quem lê é
            // quem já sabe ler.
            <DropdownMenuItem
              onClick={() =>
                void assetUrl(asset.id)
                  .then((url) => openUrl(url))
                  .catch(() => toast.error("Não deu para abrir o arquivo."))
              }
            >
              <ExternalLink />
              Abrir
            </DropdownMenuItem>
          )}

          {/* Mover de pasta saiu deste menu: é arrasto, e só arrasto. Com
              pastas dentro de pastas a lista de destinos crescia até cobrir o
              painel, para um gesto que a linha já faz ao ser puxada. */}
          <DropdownMenuSeparator />

          <DropdownMenuItem
            // Apagar um arquivo em uso deixaria a cena apontando para um id que
            // não existe mais.
            disabled={usageCount > 0}
            onClick={onRemove}
          >
            <Trash2 />
            {usageCount > 0 ? `Em uso em ${usageCount} cena(s)` : "Remover"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
