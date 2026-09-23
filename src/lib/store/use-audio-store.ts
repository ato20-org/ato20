"use client";

import { create } from "zustand";

type AudioStore = {
  /**
   * Este aparelho emite som.
   *
   * É decisão local, não da cena. Mestre e Espectador costumam rodar na mesma
   * máquina: os dois emitindo tocariam a mesma faixa com alguns milissegundos
   * de diferença, o que soa como eco. Um por vez resolve.
   */
  enabled: boolean;
  /**
   * O browser recusou tocar por falta de gesto do usuário. Vira `false` no
   * primeiro `play()` que der certo.
   */
  blocked: boolean;
  /** Contador incrementado por "Ativar som" para forçar nova tentativa. */
  nudge: number;

  /**
   * Onde a faixa está, em segundos, e quanto ela tem.
   *
   * Vem do elemento `<audio>` desta tela — é o único que sabe. `duration` é 0
   * até os metadados chegarem, e a barra mostra `--:--` nesse intervalo em vez
   * de fingir um número.
   *
   * Mora aqui, e não no `use-track-store`, porque não é da SESSÃO: é o estado
   * do reprodutor deste aparelho. O que viaja para a TV e para os celulares é
   * `startedAt`, e cada um calcula a própria posição a partir dele.
   */
  position: number;
  duration: number;

  setEnabled: (enabled: boolean) => void;
  setBlocked: (blocked: boolean) => void;
  retry: () => void;
  setProgress: (position: number, duration: number) => void;
};

/**
 * Saída de som deste aparelho.
 *
 * Nada disso entra no board nem viaja no canal: o volume da caixa de som de
 * quem está olhando não é assunto da cena. O que viaja é `Scene.audio`.
 */
export const useAudioStore = create<AudioStore>((set) => ({
  enabled: true,
  blocked: false,
  nudge: 0,
  position: 0,
  duration: 0,

  setEnabled: (enabled) => set({ enabled }),
  setBlocked: (blocked) => set({ blocked }),
  retry: () => set((state) => ({ nudge: state.nudge + 1 })),
  setProgress: (position, duration) => set({ position, duration }),
}));

/**
 * Ganho final aplicado a um elemento.
 *
 * Dois números, e só dois. O VOLUME é da sessão e viaja: o mestre regula de
 * um lugar e a TV e os celulares seguem. O GANHO é do canal — desta chuva,
 * deste tiro — e também viaja, porque "chuva leve por baixo da música" é uma
 * decisão da mesa e não da caixa de som de quem olha.
 *
 * Não existe um terceiro por APARELHO, e isso continua sendo de propósito:
 * sessão a 5% com aparelho a 70% dá 3,5%, e quem arrasta um slider não entende
 * por que o som não sobe. Ajuste fino por aparelho é o volume do próprio
 * sistema, que todo aparelho já tem. O que o aparelho decide é só emitir ou
 * não — `enabled` —, porque Mestre e Espectador na mesma máquina soariam
 * como eco.
 *
 * Multiplicar sessão por canal é outra coisa, e é o que toda mesa de som faz:
 * os dois controles ficam lado a lado na mesma tela, e quem os move vê o que
 * cada um faz.
 */
export function outputVolume(sessionVolume: number, ganho = 1): number {
  if (!useAudioStore.getState().enabled) return 0;

  return Math.max(0, Math.min(1, sessionVolume)) * Math.max(0, Math.min(1, ganho));
}
