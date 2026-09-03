"use client";

import { useEffect, useRef } from "react";

import { useAssetUrl } from "@/hooks/use-asset-url";
import { outputVolume, useAudioStore } from "@/lib/store/use-audio-store";
import type { SessionTrack } from "@/types/scene";

/** Só busca a posição da faixa se estiver atrasada mais que isto. */
const SEEK_TOLERANCE_SECONDS = 2;

/**
 * A trilha da sessão, em qualquer visão. Não desenha nada.
 *
 * O mesmo componente serve Operador, Assistir e Plateia: a trilha viaja no
 * canal, e cada aparelho decide se emite som — `enabled` no store local. Isso
 * é necessário porque Operador e Assistir costumam rodar na mesma máquina, e
 * os dois emitindo produziriam eco.
 */
export function SessionAudio({ track }: { track: SessionTrack | null }) {
  const url = useAssetUrl(track?.assetId);

  const enabled = useAudioStore((state) => state.enabled);
  const nudge = useAudioStore((state) => state.nudge);
  const setBlocked = useAudioStore((state) => state.setBlocked);

  const elementRef = useRef<HTMLAudioElement>(null);
  const volume = track?.volume ?? 1;
  const shouldPlay = Boolean(url) && (track?.playing ?? false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    element.volume = outputVolume(volume);
  }, [volume, enabled]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !url) return;

    if (!shouldPlay) {
      element.pause();
      return;
    }

    // Entra na altura em que a mesa está, em vez de começar do zero. Só vale
    // com `loop`: numa faixa única, buscar além do fim a encerraria na hora.
    if (track?.loop && track.startedAt) {
      const elapsed = (Date.now() - track.startedAt) / 1000;
      const { duration } = element;

      if (Number.isFinite(duration) && duration > 0 && elapsed > SEEK_TOLERANCE_SECONDS) {
        element.currentTime = elapsed % duration;
      }
    }

    void element.play().then(
      () => setBlocked(false),
      // O browser recusa tocar antes de qualquer gesto na página. Quem trata é
      // o botão de ativar som, que incrementa `nudge`.
      () => setBlocked(true),
    );
  }, [url, shouldPlay, track?.loop, track?.startedAt, nudge, setBlocked]);

  if (!url) return null;

  return <audio ref={elementRef} src={url} loop={track?.loop ?? true} />;
}
