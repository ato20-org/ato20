"use client";

import { useRef } from "react";
import { Music, Play, Square, Trash2, Upload, Volume2, VolumeX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useAssetList } from "@/hooks/use-asset-list";
import { playOneShot } from "@/lib/audio/play-one-shot";
import { countAssetUsage } from "@/lib/operator/asset-usage";
import { useAudioStore } from "@/lib/store/use-audio-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { cn } from "@/lib/utils";
import type { AssetMeta, Scene } from "@/types/scene";

/** Volume padrão de uma trilha recém-atribuída à cena. */
const DEFAULT_TRACK_VOLUME = 0.8;

function firstValue(value: number | readonly number[]): number {
  return Array.isArray(value) ? value[0] : (value as number);
}

export function AudioLibrary({ scene }: { scene: Scene }) {
  const { assets, upload, remove } = useAssetList("audio");
  const inputRef = useRef<HTMLInputElement>(null);

  const scenes = useSceneStore((state) => state.board?.scenes);
  const setSceneAudio = useSceneStore((state) => state.setSceneAudio);

  const muted = useAudioStore((state) => state.muted);
  const setMuted = useAudioStore((state) => state.setMuted);
  const masterVolume = useAudioStore((state) => state.masterVolume);
  const setMasterVolume = useAudioStore((state) => state.setMasterVolume);

  const ambience = scene.audio;
  const ambienceAsset = assets.find((asset) => asset.id === ambience?.assetId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 p-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={muted ? "Reativar som" : "Silenciar"}
            onClick={() => setMuted(!muted)}
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </Button>
          <Slider
            className="flex-1"
            aria-label="Volume geral"
            value={[Math.round(masterVolume * 100)]}
            max={100}
            step={1}
            onValueChange={(value) => setMasterVolume(firstValue(value) / 100)}
          />
          <span className="text-muted-foreground w-8 text-right text-xs tabular-nums">
            {Math.round(masterVolume * 100)}
          </span>
        </div>

        <Button
          className="w-full"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
        >
          <Upload />
          Enviar sons
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          multiple
          className="sr-only"
          onChange={(event) => {
            void upload(event.target.files);
            // Sem isso, reenviar o mesmo arquivo não dispara `change`.
            event.target.value = "";
          }}
        />
      </div>

      {ambience ? (
        <>
          <Separator />
          <div className="bg-accent/40 space-y-2 p-2">
            <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
              Ambiente da cena
            </p>
            <div className="flex items-center gap-1">
              <span className="min-w-0 flex-1 truncate text-sm">
                {ambienceAsset?.name ?? "Arquivo removido"}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Parar ambiente"
                onClick={() => setSceneAudio(scene.id, undefined)}
              >
                <Square />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-xs" htmlFor="ambience-loop">
                Repetir
              </Label>
              <Switch
                id="ambience-loop"
                checked={ambience.loop}
                onCheckedChange={(checked) =>
                  setSceneAudio(scene.id, { ...ambience, loop: checked })
                }
              />
            </div>

            <div className="flex items-center gap-2">
              <Slider
                className="flex-1"
                aria-label="Volume do ambiente"
                value={[Math.round(ambience.volume * 100)]}
                max={100}
                step={1}
                onValueChange={(value) =>
                  setSceneAudio(scene.id, { ...ambience, volume: firstValue(value) / 100 })
                }
              />
              <span className="text-muted-foreground w-8 text-right text-xs tabular-nums">
                {Math.round(ambience.volume * 100)}
              </span>
            </div>
          </div>
          <Separator />
        </>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        {assets.length === 0 ? (
          <p className="text-muted-foreground p-3 text-xs">
            Nenhum som ainda. Envie ambientes para as cenas e efeitos para disparar na hora.
          </p>
        ) : (
          <ul className="space-y-1 p-2">
            {assets.map((asset) => (
              <AudioRow
                key={asset.id}
                asset={asset}
                isAmbience={asset.id === ambience?.assetId}
                usageCount={countAssetUsage(scenes ?? [], asset.id)}
                onPlay={() => void playOneShot(asset.id, muted ? 0 : masterVolume)}
                onSetAmbience={() =>
                  setSceneAudio(scene.id, {
                    assetId: asset.id,
                    loop: true,
                    volume: DEFAULT_TRACK_VOLUME,
                  })
                }
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
  isAmbience: boolean;
  usageCount: number;
  onPlay: () => void;
  onSetAmbience: () => void;
  onRemove: () => void;
};

function AudioRow({
  asset,
  isAmbience,
  usageCount,
  onPlay,
  onSetAmbience,
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
          {isAmbience ? " · ambiente" : ""}
        </span>
      </span>

      <Button variant="ghost" size="icon-xs" aria-label={`Tocar ${asset.name}`} onClick={onPlay}>
        <Play />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Usar ${asset.name} como ambiente da cena`}
        className={cn(isAmbience && "text-primary")}
        onClick={onSetAmbience}
      >
        <Music />
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
