"use client";

import { useEffect, useRef } from "react";

import { useAssetUrl } from "@/hooks/use-asset-url";
import { useAudioStore } from "@/lib/store/use-audio-store";
import type { SceneAudio } from "@/types/scene";

/**
 * Trilha de ambiente da cena ativa. Não desenha nada.
 *
 * Vive só no Operador: a máquina do mestre é a mesma que alimenta a TV, então
 * tocar também no Assistir daria o mesmo som duas vezes, fora de fase.
 */
export function SceneAudioPlayer({ audio }: { audio: SceneAudio | undefined }) {
  const url = useAssetUrl(audio?.assetId);
  const muted = useAudioStore((state) => state.muted);
  const masterVolume = useAudioStore((state) => state.masterVolume);
  const nudge = useAudioStore((state) => state.nudge);
  const setBlocked = useAudioStore((state) => state.setBlocked);

  const elementRef = useRef<HTMLAudioElement>(null);
  const trackVolume = audio?.volume ?? 1;

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    element.volume = Math.max(0, Math.min(1, trackVolume * masterVolume));
    element.muted = muted;
  }, [trackVolume, masterVolume, muted]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !url) return;

    // Trocar de cena recomeça a faixa: continuar de onde a cena anterior
    // parou não faz sentido nenhum.
    element.currentTime = 0;

    void element.play().then(
      () => setBlocked(false),
      // O browser recusa tocar antes de qualquer gesto do usuário na página.
      // Quem trata é o botão "Ativar som", que incrementa `nudge`.
      () => setBlocked(true),
    );
  }, [url, nudge, setBlocked]);

  if (!url) return null;

  return <audio ref={elementRef} src={url} loop={audio?.loop ?? true} />;
}
