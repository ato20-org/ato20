"use client";

import { outputVolume, useAudioStore } from "@/lib/store/use-audio-store";

/**
 * Efeitos avulsos tocando agora, por `assetId`.
 *
 * Um por asset, de propósito. Disparar o mesmo som duas vezes **reinicia** em
 * vez de sobrepor: duas cópias da mesma faixa alguns milissegundos fora de
 * fase soam como defeito, não como camada. Sons diferentes seguem podendo
 * tocar juntos.
 */
const active = new Map<string, HTMLAudioElement>();

function publish() {
  useAudioStore.getState().setPlayingEffects([...active.keys()]);
}

function forget(assetId: string, element: HTMLAudioElement) {
  // Só esquece se ainda for o elemento registrado: um reinício troca a
  // referência, e o `ended` do antigo não pode apagar o novo.
  if (active.get(assetId) !== element) return;

  active.delete(assetId);
  publish();
}

/** Interrompe e descarta o efeito daquele asset, se estiver tocando. */
export function stopEffect(assetId: string): void {
  const element = active.get(assetId);
  if (!element) return;

  element.pause();
  element.src = "";
  active.delete(assetId);
  publish();
}

export function stopAllEffects(): void {
  for (const assetId of [...active.keys()]) stopEffect(assetId);
}

/**
 * Toca um efeito. Devolve `false` quando o browser recusou.
 *
 * Nasce sempre de um clique, então o bloqueio de autoplay não se aplica — mas
 * `play()` também rejeita com arquivo corrompido.
 */
export async function playEffect(
  assetId: string,
  url: string,
  trackVolume = 1,
): Promise<boolean> {
  stopEffect(assetId);

  const element = new Audio(url);
  element.volume = outputVolume(trackVolume);
  element.addEventListener("ended", () => forget(assetId, element));

  active.set(assetId, element);
  publish();

  try {
    await element.play();
    return true;
  } catch {
    forget(assetId, element);
    return false;
  }
}

/** Reaplica a saída deste aparelho ao que já está tocando. */
export function refreshEffectVolume(trackVolume = 1): void {
  const volume = outputVolume(trackVolume);
  for (const element of active.values()) element.volume = volume;
}
