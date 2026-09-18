"use client";

import { Loader2, Music, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAssetList } from "@/hooks/use-asset-list";
import { countAssetUsage } from "@/lib/mestre/asset-usage";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useTrackStore } from "@/lib/store/use-track-store";
import type { AssetMeta } from "@/types/scene";

/**
 * Acervo de sons. Só isso.
 *
 * Os controles da trilha — play, repetir, volume, posição — moram na barra do
 * pé da janela (`TrackBar`). Ficavam num bloco aqui em cima, e as duas coisas
 * têm ritmos diferentes: esta lista é consultada uma vez, quando se escolhe a
 * trilha, e o que está tocando é olhado durante a sessão inteira — o que
 * obrigava a abrir o painel e trocar de aba só para ver se a música rodava.
 *
 * Quem lê a trilha do disco é o `CampaignBoot`, antes de a mesa aparecer: este
 * painel só a escolhe.
 */
export function AudioLibrary() {
  const { assets, importar, importando, remove } = useAssetList("audio");

  const scenes = useSceneStore((state) => state.board?.scenes);

  const track = useTrackStore((state) => state.track);
  const start = useTrackStore((state) => state.start);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-2">
        <Button
          className="w-full"
          variant="outline"
          size="sm"
          disabled={importando}
          onClick={() => void importar()}
        >
          {importando ? <Loader2 className="animate-spin" /> : <Upload />}
          {importando ? "Importando…" : "Importar sons"}
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {assets.length === 0 ? (
          <p className="text-muted-foreground p-3 text-xs">
            Nenhum som enconrado.
          </p>
        ) : (
          <ul className="space-y-1 p-2">
            {assets.map((asset) => (
              <AudioRow
                key={asset.id}
                asset={asset}
                isTrack={asset.id === track?.assetId}
                usageCount={countAssetUsage(scenes ?? [], asset.id, track)}
                onSetTrack={() => start(asset.id)}
                onRemove={() => void remove(asset.id)}
              />
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}

type AudioRowProps = {
  asset: AssetMeta;
  isTrack: boolean;
  usageCount: number;
  onSetTrack: () => void;
  onRemove: () => void;
};

function AudioRow({
  asset,
  isTrack,
  usageCount,
  onSetTrack,
  onRemove,
}: AudioRowProps) {
  return (
    <li className="hover:bg-accent/50 flex items-center gap-1 rounded-md p-1">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs" title={asset.name}>
          {asset.name}
        </span>
        <span className="text-muted-foreground block text-[10px]">
          {Math.round(asset.size / 1024)} KB
          {isTrack ? " · trilha" : ""}
        </span>
      </span>

      {/* A linha do acervo só escolhe: play, pausa e volume moram no bloco da
          trilha, que é o único lugar onde som é controlado. */}
      {isTrack ? null : (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Usar ${asset.name} como trilha`}
          onClick={onSetTrack}
        >
          <Music />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        // Apagar um arquivo em uso deixaria a cena ou a trilha apontando para
        // um id que não existe mais.
        disabled={usageCount > 0}
        aria-label={`Remover ${asset.name}`}
        title={usageCount > 0 ? `Em uso em ${usageCount} lugar(es)` : undefined}
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
    </li>
  );
}
