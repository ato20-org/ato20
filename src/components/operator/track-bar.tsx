"use client";

import { Pause, Play, Repeat, Square, Volume2, VolumeX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TrackWave } from "@/components/operator/track-wave";
import { useAssetList } from "@/hooks/use-asset-list";
import { useTrackPeaks } from "@/hooks/use-track-peaks";
import { useAudioStore } from "@/lib/store/use-audio-store";
import { useTrackStore } from "@/lib/store/use-track-store";
import { cn } from "@/lib/utils";

/**
 * A trilha da sessão, numa barra no pé da janela.
 *
 * Saiu de dentro da aba de Sons, onde era um bloco acima da lista. O motivo é
 * que as duas coisas têm ritmos diferentes: a lista de arquivos é consultada
 * quando se escolhe a trilha, uma vez, e o que está tocando é olhado durante a
 * sessão inteira. Com o bloco lá, saber se a música ainda estava rodando exigia
 * abrir o painel direito e trocar de aba.
 *
 * Aqui ela é a linha de baixo, sempre à vista, e o painel voltou a ser só o
 * acervo.
 *
 * Só aparece quando há trilha escolhida: uma barra vazia ocupando altura de
 * palco durante uma sessão sem música seria pior que não tê-la.
 */
export function TrackBar() {
  const track = useTrackStore((state) => state.track);
  const setPlaying = useTrackStore((state) => state.setPlaying);
  const setLoop = useTrackStore((state) => state.setLoop);
  const volume = useTrackStore((state) => state.volume);
  const setVolume = useTrackStore((state) => state.setVolume);
  const seek = useTrackStore((state) => state.seek);
  const clear = useTrackStore((state) => state.clear);

  const position = useAudioStore((state) => state.position);
  const duration = useAudioStore((state) => state.duration);
  const enabled = useAudioStore((state) => state.enabled);
  const setEnabled = useAudioStore((state) => state.setEnabled);
  const blocked = useAudioStore((state) => state.blocked);
  const retry = useAudioStore((state) => state.retry);

  // O nome e a forma da onda vêm do acervo: a trilha guarda só o `assetId`.
  const { assets } = useAssetList("audio");
  const asset = assets.find((candidato) => candidato.id === track?.assetId);
  const peaks = useTrackPeaks(asset);

  if (!track) return null;

  const nome = asset?.name ?? "Arquivo removido";
  const conhecida = duration > 0;

  return (
    <footer className="flex shrink-0 items-center gap-3 border-t px-3 py-1.5 select-none">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={track.playing ? "Pausar trilha" : "Retomar trilha"}
        onClick={() => setPlaying(!track.playing)}
      >
        {track.playing ? <Pause /> : <Play />}
      </Button>

      {/* `max-w-56` e `truncate`: nome de arquivo de música é longo, e sem teto
          ele empurraria a linha de reprodução para fora da vista. */}
      <span className="max-w-56 min-w-0 shrink-0 truncate text-xs" title={nome}>
        {nome}
      </span>

      <span className="text-muted-foreground w-10 shrink-0 text-right text-[10px] tabular-nums">
        {formatar(position)}
      </span>

      {/* A forma da onda, com a parte tocada acesa. Arrastar reescreve
          `startedAt`, então a TV e os celulares acompanham — ver `seek` no
          store. */}
      <TrackWave peaks={peaks} position={position} duration={duration} onSeek={seek} />

      <span className="text-muted-foreground w-10 shrink-0 text-[10px] tabular-nums">
        {conhecida ? formatar(duration) : "--:--"}
      </span>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Repetir a faixa"
              aria-pressed={track.loop}
              className={cn(track.loop ? "text-foreground" : "text-muted-foreground/60")}
              onClick={() => setLoop(!track.loop)}
            >
              <Repeat />
            </Button>
          }
        />
        <TooltipContent>
          <p>{track.loop ? "Repetindo" : "Toca uma vez"}</p>
        </TooltipContent>
      </Tooltip>

      {/* Único volume do som, e ele viaja: o mestre regula aqui e a TV e os
          celulares seguem.

          Da SESSÃO, e não da faixa: trocar de música não mexe nele, e tirar a
          trilha não perde o ajuste. Guardado por faixa, cada troca trazia o
          ganho de quando aquela música foi escolhida e o som saltava. */}
      <div className="flex w-32 shrink-0 items-center gap-2">
        <Slider
          className="flex-1"
          aria-label="Volume do som, em todas as telas"
          value={[Math.round(volume * 100)]}
          max={100}
          step={1}
          onValueChange={(value) => setVolume(primeiro(value) / 100)}
        />
        <span className="text-muted-foreground w-6 text-right text-[10px] tabular-nums">
          {Math.round(volume * 100)}
        </span>
      </div>

      {/* Silenciar ESTA tela, e não a mesa. Veio do cabeçalho: é controle de
          som, e o lugar dele é junto do som. Operador e Assistir costumam rodar
          na mesma máquina, e os dois emitindo soam como eco. */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={enabled ? "Silenciar esta tela" : "Ligar o som desta tela"}
              aria-pressed={!enabled}
              onClick={() => setEnabled(!enabled)}
            >
              {enabled ? <Volume2 /> : <VolumeX />}
            </Button>
          }
        />
        <TooltipContent>
          <p className="max-w-48">
            {enabled
              ? "Silencia só esta tela. A TV e os celulares continuam ouvindo."
              : "Esta tela está muda. A mesa continua ouvindo."}
          </p>
        </TooltipContent>
      </Tooltip>

      {/* O browser recusa tocar antes de um gesto na página. Só aparece quando
          há o que desbloquear. */}
      {blocked ? (
        <Button variant="secondary" size="sm" onClick={retry}>
          <Volume2 />
          Ativar som
        </Button>
      ) : null}

      <Button variant="ghost" size="icon-sm" aria-label="Tirar a trilha" onClick={clear}>
        <Square />
      </Button>
    </footer>
  );
}

function primeiro(value: number | readonly number[]): number {
  return Array.isArray(value) ? (value[0] ?? 0) : (value as number);
}

/** `mm:ss`. Faixa de RPG não passa de uma hora, e `1:04:20` na barra só ocuparia espaço. */
function formatar(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) return "--:--";

  const total = Math.floor(segundos);
  const minutos = Math.floor(total / 60);

  return `${minutos}:${String(total % 60).padStart(2, "0")}`;
}
