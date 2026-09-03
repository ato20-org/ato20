"use client";

import { useRef } from "react";
import { Music, Pause, Play, Square, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useAssetList } from "@/hooks/use-asset-list";
import { countAssetUsage } from "@/lib/operator/asset-usage";
import { useSceneStore } from "@/lib/store/use-scene-store";
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
  const startSceneTrack = useSceneStore((state) => state.startSceneTrack);
  const setSceneTrackPlaying = useSceneStore((state) => state.setSceneTrackPlaying);


  const track = scene.audio;
  const trackAsset = assets.find((asset) => asset.id === track?.assetId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-2">
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

      {track ? (
        <>
          <Separator />
          <div className="bg-accent/40 space-y-2 p-2">
            <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
              Trilha da cena
            </p>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={track.playing ? "Pausar trilha" : "Retomar trilha"}
                onClick={() => setSceneTrackPlaying(scene.id, !track.playing)}
              >
                {track.playing ? <Pause /> : <Play />}
              </Button>
              <span className="min-w-0 flex-1 truncate text-sm">
                {trackAsset?.name ?? "Arquivo removido"}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Remover trilha da cena"
                onClick={() => setSceneAudio(scene.id, undefined)}
              >
                <Square />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-xs" htmlFor="track-loop">
                Repetir
              </Label>
              <Switch
                id="track-loop"
                checked={track.loop}
                onCheckedChange={(checked) =>
                  setSceneAudio(scene.id, { ...track, loop: checked })
                }
              />
            </div>

            {/* Único volume do app, e ele viaja: o mestre regula aqui e a TV e
                os celulares seguem. */}
            <div className="flex items-center gap-2">
              <Slider
                className="flex-1"
                aria-label="Volume do som, em todas as telas"
                value={[Math.round(track.volume * 100)]}
                max={100}
                step={1}
                onValueChange={(value) =>
                  setSceneAudio(scene.id, { ...track, volume: firstValue(value) / 100 })
                }
              />
              <span className="text-muted-foreground w-8 text-right text-xs tabular-nums">
                {Math.round(track.volume * 100)}
              </span>
            </div>
          </div>
          <Separator />
        </>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        {assets.length === 0 ? (
          <p className="text-muted-foreground p-3 text-xs">
            Nenhum som ainda. Envie trilhas para as cenas e efeitos para disparar na hora.
          </p>
        ) : (
          <ul className="space-y-1 p-2">
            {assets.map((asset) => (
              <AudioRow
                key={asset.id}
                asset={asset}
                isTrack={asset.id === track?.assetId}
                usageCount={countAssetUsage(scenes ?? [], asset.id)}
                onSetTrack={() => startSceneTrack(scene.id, asset.id, DEFAULT_TRACK_VOLUME)}
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

function AudioRow({ asset, isTrack, usageCount, onSetTrack, onRemove }: AudioRowProps) {
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

      {/* A linha do acervo só escolhe: play e pausa moram no bloco da trilha,
          que é o único lugar onde som é controlado. */}
      {isTrack ? null : (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Usar ${asset.name} como trilha da cena`}
          onClick={onSetTrack}
        >
          <Music />
        </Button>
      )}
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
