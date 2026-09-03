"use client";

import { useRef } from "react";
import {
  CloudOff,
  CloudUpload,
  ImageIcon,
  ImageOff,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAssetList } from "@/hooks/use-asset-list";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { centeredBox, fitInitialSize } from "@/lib/geometry/transform";
import { countAssetUsage } from "@/lib/operator/asset-usage";
import { useRoomStore } from "@/lib/store/use-room-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useUploadStore, type UploadState } from "@/lib/store/use-upload-store";
import type { AssetMeta, Scene } from "@/types/scene";

/** Usado quando a medida do arquivo não veio — arquivo antigo ou corrompido. */
const FALLBACK_SIZE = { x: 480, y: 270 };

export function AssetLibrary({ scene }: { scene: Scene }) {
  const { assets, upload, remove } = useAssetList("image");
  const inputRef = useRef<HTMLInputElement>(null);

  const scenes = useSceneStore((state) => state.board?.scenes);
  const addItem = useSceneStore((state) => state.addItem);
  const setBackground = useSceneStore((state) => state.setBackground);
  const select = useSelectionStore((state) => state.select);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 p-2">
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <Upload />
          Enviar imagens
        </Button>
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
        {assets.length === 0 ? (
          <p className="text-muted-foreground p-3 text-xs">
            Nenhuma imagem ainda. Envie mapas, documentos e retratos.
          </p>
        ) : (
          <ul className="space-y-1 p-2">
            {assets.map((asset) => (
              <AssetRow
                key={asset.id}
                asset={asset}
                isBackground={asset.id === scene.backgroundAssetId}
                usageCount={countAssetUsage(scenes ?? [], asset.id)}
                uploadState={uploadStates[asset.id]}
                uploadError={uploadErrors[asset.id]}
                online={online}
                onAdd={() => handleAddToScene(asset)}
                onSetBackground={() => setBackground(scene.id, asset.id)}
                onRemove={() => void remove(asset.id)}
              />
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}

function isInFlight(state: UploadState | undefined): boolean {
  return state === "pending" || state === "uploading";
}

type AssetRowProps = {
  asset: AssetMeta;
  isBackground: boolean;
  usageCount: number;
  uploadState: UploadState | undefined;
  uploadError: string | undefined;
  online: boolean;
  onAdd: () => void;
  onSetBackground: () => void;
  onRemove: () => void;
};

function AssetRow({
  asset,
  isBackground,
  usageCount,
  uploadState,
  uploadError,
  online,
  onAdd,
  onSetBackground,
  onRemove,
}: AssetRowProps) {
  const url = useAssetUrl(asset.id);

  return (
    <li className="hover:bg-accent/50 flex items-center gap-1 rounded-md p-1">
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
        // Apagar um arquivo em uso deixaria a cena apontando para um id que
        // não existe mais.
        disabled={usageCount > 0}
        aria-label={`Remover ${asset.name}`}
        title={usageCount > 0 ? `Em uso em ${usageCount} cena(s)` : undefined}
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
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
