"use client";

import { useCallback, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CloudOff,
  CloudUpload,
  FolderClosed,
  FolderPlus,
  ImageIcon,
  ImageOff,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  UserSquare,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAssetList } from "@/hooks/use-asset-list";
import { useFolderList } from "@/hooks/use-folder-list";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { centeredBox, fitInitialSize } from "@/lib/geometry/transform";
import { hasAssetDrag, readAssetDrag, writeAssetDrag } from "@/lib/operator/asset-drag";
import { countAssetUsage } from "@/lib/operator/asset-usage";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import { useRoomStore } from "@/lib/store/use-room-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useUploadStore, type UploadState } from "@/lib/store/use-upload-store";
import { cn } from "@/lib/utils";
import type { AssetFolder, AssetMeta, Scene } from "@/types/scene";

/** Usado quando a medida do arquivo não veio — arquivo antigo ou corrompido. */
const FALLBACK_SIZE = { x: 480, y: 270 };

export function AssetLibrary({ scene }: { scene: Scene }) {
  const { assets, upload, remove, move, refresh } = useAssetList("image");
  // Mexer em pasta muda arquivo — apagar devolve o conteúdo à raiz —, então a
  // lista de arquivos recarrega junto.
  const { folders, create, rename, remove: removeFolder } = useFolderList(refresh);
  const inputRef = useRef<HTMLInputElement>(null);
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const scenes = useSceneStore((state) => state.board?.scenes);
  const addItem = useSceneStore((state) => state.addItem);
  const setBackground = useSceneStore((state) => state.setBackground);
  const select = useSelectionStore((state) => state.select);
  const addPortrait = usePortraitStore((state) => state.add);
  const selectPortrait = useSelectionStore((state) => state.selectPortrait);

  const online = useRoomStore((state) => Boolean(state.room));
  const uploadStates = useUploadStore((state) => state.states);
  const retryFailed = useUploadStore((state) => state.retryFailed);
  const uploadErrors = useUploadStore((state) => state.errors);

  const inFlight = assets.filter(
    (asset) => !asset.remoteAt && isInFlight(uploadStates[asset.id]),
  ).length;
  const failed = assets.filter((asset) => uploadStates[asset.id] === "error").length;

  function handleAddToScene(asset: AssetMeta) {
    const size =
      asset.naturalWidth && asset.naturalHeight
        ? fitInitialSize(asset.naturalWidth, asset.naturalHeight)
        : FALLBACK_SIZE;

    select([addItem(scene.id, { assetId: asset.id, ...centeredBox(size.x, size.y) })]);
  }

  /**
   * Vira retrato: sai da cena e passa a viver na câmera.
   *
   * Já selecionado, porque o gesto seguinte é arrastar para o canto certo — e
   * o retrato nasce no inferior esquerdo, que raramente é onde ele fica.
   */
  function handleUseAsPortrait(asset: AssetMeta) {
    selectPortrait(addPortrait(asset.id, asset.naturalWidth, asset.naturalHeight));
  }

  /** Move e é chamado tanto pelo arrasto quanto pelo menu da linha. */
  const handleMove = useCallback(
    (assetId: string, folderId: string | undefined) => void move(assetId, folderId),
    [move],
  );

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
        folders={folders}
        isBackground={asset.id === scene.backgroundAssetId}
        usageCount={countAssetUsage(scenes ?? [], asset.id)}
        uploadState={uploadStates[asset.id]}
        uploadError={uploadErrors[asset.id]}
        online={online}
        onAdd={() => handleAddToScene(asset)}
        onSetBackground={() => setBackground(scene.id, asset.id)}
        onUseAsPortrait={() => handleUseAsPortrait(asset)}
        onMove={(folderId) => handleMove(asset.id, folderId)}
        onRemove={() => void remove(asset.id)}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 p-2">
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <Upload />
          Enviar imagens
        </Button>

        {creating ? (
          <FolderNameInput
            placeholder="Nome da pasta"
            onCommit={(name) => {
              void create(name);
              setCreating(false);
            }}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>
            <FolderPlus />
            Nova pasta
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(event) => {
            void upload(event.target.files);
            // Sem isso, reenviar o mesmo arquivo não dispara `change`.
            event.target.value = "";
          }}
        />

        {scene.backgroundAssetId ? (
          <Button variant="ghost" size="sm" onClick={() => setBackground(scene.id, undefined)}>
            <ImageOff />
            Remover fundo
          </Button>
        ) : null}

        {inFlight > 0 ? (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Subindo {inFlight} para a mesa…
          </p>
        ) : null}

        {failed > 0 ? (
          <Button variant="ghost" size="sm" onClick={retryFailed}>
            <RefreshCw />
            Repetir {failed} envio(s)
          </Button>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {assets.length === 0 && folders.length === 0 ? (
          <p className="text-muted-foreground p-3 text-xs">
            Nenhuma imagem ainda. Envie mapas, documentos e retratos.
          </p>
        ) : (
          <div className="space-y-2 p-2">
            {/* Pastas primeiro, e a raiz embaixo: arquivo novo cai na raiz, e é
                de lá que ele é distribuído. */}
            {folders.map((folder) => {
              const inside = assets.filter((asset) => asset.folderId === folder.id);

              return (
                <FolderGroup
                  key={folder.id}
                  folder={folder}
                  count={inside.length}
                  renaming={renamingId === folder.id}
                  onRename={() => setRenamingId(folder.id)}
                  onRenameCommit={(name) => {
                    void rename(folder.id, name);
                    setRenamingId(null);
                  }}
                  onRenameCancel={() => setRenamingId(null)}
                  onDelete={() => void removeFolder(folder.id)}
                  onDropAsset={(assetId) => handleMove(assetId, folder.id)}
                >
                  {inside.map(renderRow)}
                </FolderGroup>
              );
            })}

            {folders.length > 0 ? (
              <RootDrop onDropAsset={(assetId) => handleMove(assetId, undefined)}>
                {loose.length > 0 ? (
                  loose.map(renderRow)
                ) : (
                  <p className="text-muted-foreground px-1 py-2 text-xs">
                    Nada fora de pasta. Solte um arquivo aqui para tirá-lo da pasta.
                  </p>
                )}
              </RootDrop>
            ) : (
              <ul className="space-y-1">{loose.map(renderRow)}</ul>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

/**
 * Uma pasta e o que está dentro.
 *
 * O cabeçalho é o alvo do arrasto: soltar a linha de um arquivo sobre ele
 * move. Aceita solto mesmo colapsada — é o caso de guardar sem querer ver.
 */
function FolderGroup({
  folder,
  count,
  renaming,
  onRename,
  onRenameCommit,
  onRenameCancel,
  onDelete,
  onDropAsset,
  children,
}: {
  folder: AssetFolder;
  count: number;
  renaming: boolean;
  onRename: () => void;
  onRenameCommit: (name: string) => void;
  onRenameCancel: () => void;
  onDelete: () => void;
  onDropAsset: (assetId: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const [receiving, setReceiving] = useState(false);

  return (
    <section>
      <div
        className={cn(
          "flex items-center gap-1 rounded-md px-1 py-1",
          receiving ? "bg-primary/15 ring-primary/60 ring-1" : "hover:bg-accent/50",
        )}
        onDragOver={(event) => {
          if (!hasAssetDrag(event.dataTransfer)) return;

          // `preventDefault` a cada evento, senão o browser recusa o drop.
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setReceiving(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setReceiving(false);
        }}
        onDrop={(event) => {
          const payload = readAssetDrag(event.dataTransfer);
          setReceiving(false);
          if (!payload) return;

          event.preventDefault();
          onDropAsset(payload.assetId);
        }}
      >
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={open ? `Fechar ${folder.name}` : `Abrir ${folder.name}`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronDown /> : <ChevronRight />}
        </Button>

        <FolderClosed className="text-muted-foreground size-3.5 shrink-0" aria-hidden />

        {renaming ? (
          <FolderNameInput
            defaultValue={folder.name}
            onCommit={onRenameCommit}
            onCancel={onRenameCancel}
          />
        ) : (
          <>
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-xs font-medium"
              onDoubleClick={onRename}
              onClick={() => setOpen(!open)}
            >
              {folder.name}
            </button>
            <span className="text-muted-foreground text-[10px]">{count}</span>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-xs" aria-label={`Opções de ${folder.name}`}>
                    <MoreVertical />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={onRename}>
                  <Pencil />
                  Renomear
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete}>
                  <Trash2 />
                  Apagar pasta
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      {/* Apagar pasta não apaga arquivo, e o aviso vive aqui porque é onde a
          dúvida aparece. */}
      {open ? <ul className="mt-1 space-y-1 pl-5">{children}</ul> : null}
    </section>
  );
}

/** A raiz também recebe arrasto: é como um arquivo sai da pasta. */
function RootDrop({
  onDropAsset,
  children,
}: {
  onDropAsset: (assetId: string) => void;
  children: React.ReactNode;
}) {
  const [receiving, setReceiving] = useState(false);

  return (
    <section
      className={cn(
        "rounded-md border border-dashed p-1",
        receiving ? "border-primary/60 bg-primary/10" : "border-transparent",
      )}
      onDragOver={(event) => {
        if (!hasAssetDrag(event.dataTransfer)) return;

        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setReceiving(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setReceiving(false);
      }}
      onDrop={(event) => {
        const payload = readAssetDrag(event.dataTransfer);
        setReceiving(false);
        if (!payload) return;

        event.preventDefault();
        onDropAsset(payload.assetId);
      }}
    >
      <p className="text-muted-foreground px-1 pb-1 text-[10px] uppercase">Fora de pasta</p>
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

function isInFlight(state: UploadState | undefined): boolean {
  return state === "pending" || state === "uploading";
}

type AssetRowProps = {
  asset: AssetMeta;
  folders: AssetFolder[];
  isBackground: boolean;
  usageCount: number;
  uploadState: UploadState | undefined;
  uploadError: string | undefined;
  online: boolean;
  onAdd: () => void;
  onSetBackground: () => void;
  onUseAsPortrait: () => void;
  onMove: (folderId: string | undefined) => void;
  onRemove: () => void;
};

function AssetRow({
  asset,
  folders,
  isBackground,
  usageCount,
  uploadState,
  uploadError,
  online,
  onAdd,
  onSetBackground,
  onUseAsPortrait,
  onMove,
  onRemove,
}: AssetRowProps) {
  const url = useAssetUrl(asset.id);

  return (
    // Arrastável inteiro, e não só a miniatura: o alvo de 40px do polegar seria
    // o menor da tela, e o `+` continua ali para quem prefere clicar — a cena
    // aceita a imagem no centro por ele.
    <li
      className="hover:bg-accent/50 flex items-center gap-1 rounded-md p-1"
      draggable
      onDragStart={(event) => writeAssetDrag(event.dataTransfer, asset)}
    >
      <span className="bg-muted size-10 shrink-0 overflow-hidden rounded">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="size-full object-cover" draggable={false} />
        ) : null}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs" title={asset.name}>
          {asset.name}
        </span>
        {isBackground ? (
          <span className="text-muted-foreground text-[10px] uppercase">fundo</span>
        ) : null}
      </span>

      <SyncIndicator asset={asset} state={uploadState} error={uploadError} online={online} />

      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Adicionar ${asset.name} à cena`}
        onClick={onAdd}
      >
        <Plus />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Usar ${asset.name} como fundo`}
        onClick={onSetBackground}
      >
        <ImageIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Usar ${asset.name} como retrato`}
        onClick={onUseAsPortrait}
      >
        <UserSquare />
      </Button>
      {/* Menu com o que não é gesto de uma mão: mover entre pastas — que
          também se faz arrastando, mas o arrasto não alcança pasta rolada fora
          de vista — e apagar. */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-xs" aria-label={`Opções de ${asset.name}`}>
              <MoreVertical />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-48">
          {asset.folderId ? (
            <DropdownMenuItem onClick={() => onMove(undefined)}>
              <FolderClosed />
              Tirar da pasta
            </DropdownMenuItem>
          ) : null}

          {folders
            .filter((folder) => folder.id !== asset.folderId)
            .map((folder) => (
              <DropdownMenuItem key={folder.id} onClick={() => onMove(folder.id)}>
                <FolderClosed />
                <span className="truncate">Mover para {folder.name}</span>
              </DropdownMenuItem>
            ))}

          {folders.length > 0 || asset.folderId ? <DropdownMenuSeparator /> : null}

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

/**
 * Estado do arquivo em relação à mesa. Silencioso quando já subiu — o normal
 * não precisa de ícone; o que precisa de aviso é o que ainda não chegou lá.
 */
function SyncIndicator({
  asset,
  state,
  error,
  online,
}: {
  asset: AssetMeta;
  state: UploadState | undefined;
  error: string | undefined;
  online: boolean;
}) {
  if (asset.remoteAt || state === "done") return null;

  const { icon, hint } = !online
    ? {
        icon: <CloudOff className="text-muted-foreground size-3.5" />,
        hint: "Modo local: este arquivo só existe neste navegador.",
      }
    : state === "uploading"
      ? {
          icon: <Loader2 className="text-muted-foreground size-3.5 animate-spin" />,
          hint: "Subindo para a mesa.",
        }
      : state === "error"
        ? {
            icon: <CloudOff className="text-destructive size-3.5" />,
            // O motivo, quando existe: "falhou" sozinho não diz se foi
            // tamanho, permissão ou rede.
            hint: error ?? "O envio falhou. Os celulares não vão ver esta imagem.",
          }
        : {
            icon: <CloudUpload className="text-muted-foreground size-3.5" />,
            hint: "Na fila para subir.",
          };

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="grid size-6 place-items-center">{icon}</span>} />
      <TooltipContent>
        <p className="max-w-48">{hint}</p>
      </TooltipContent>
    </Tooltip>
  );
}
