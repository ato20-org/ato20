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
   * Onde cada canal está, por chave de canal. Ver `Canal` no `SessionAudio`.
   *
   * Vem dos elementos `<audio>` desta tela — são os únicos que sabem. Um MAPA
   * e não um par de números porque a mesa toca em camadas: a trilha, a chuva e
   * a fogueira andam ao mesmo tempo, e o painel mostra as três.
   *
   * Cada escrita troca só a entrada do canal que mexeu, e as outras mantêm a
   * referência. É isso que faz a linha da chuva não re-renderizar quatro vezes
   * por segundo por causa da música — ver `useProgresso`.
   *
   * Mora aqui, e não no `use-track-store`, porque não é da SESSÃO: é o estado
   * do reprodutor deste aparelho. O que viaja para a TV e para os celulares é
   * `startedAt`, e cada um calcula a própria posição a partir dele.
   */
  progresso: Record<string, Progresso>;

  setEnabled: (enabled: boolean) => void;
  setBlocked: (blocked: boolean) => void;
  retry: () => void;
  setProgress: (chave: string, position: number, duration: number) => void;
  /** O canal saiu do ar: a linha dele não fica parada no último instante. */
  esquecerProgresso: (chave: string) => void;
};

/**
 * Onde um canal está, em segundos, e quanto ele tem.
 *
 * `duration` é 0 até os metadados chegarem, e a barra mostra `--:--` nesse
 * intervalo em vez de fingir um número.
 */
export type Progresso = { position: number; duration: number };

/**
 * O que um canal que ainda não se reportou vale.
 *
 * Constante de módulo, e não um objeto novo a cada leitura: `useProgresso`
 * devolve isto quando não há entrada, e um literal ali daria um valor
 * diferente a cada render — que é o laço infinito clássico do `useSyncExternalStore`.
 */
const SEM_PROGRESSO: Progresso = { position: 0, duration: 0 };

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
  progresso: {},

  setEnabled: (enabled) => set({ enabled }),
  setBlocked: (blocked) => set({ blocked }),
  retry: () => set((state) => ({ nudge: state.nudge + 1 })),

  setProgress: (chave, position, duration) =>
    set((state) => {
      const atual = state.progresso[chave];

      // Mesma referência quando nada mudou: `timeupdate` continua chegando com
      // o canal pausado, e devolver um mapa novo a cada batida acordaria todas
      // as linhas do painel para redesenhar o mesmo número.
      if (atual?.position === position && atual.duration === duration) {
        return state;
      }

      return { progresso: { ...state.progresso, [chave]: { position, duration } } };
    }),

  esquecerProgresso: (chave) =>
    set((state) => {
      if (!(chave in state.progresso)) return state;

      const { [chave]: saiu, ...resto } = state.progresso;

      return { progresso: resto };
    }),
}));

/**
 * Onde este canal está. Re-renderiza só quem o lê.
 *
 * Hook e não seletor solto porque o `?? SEM_PROGRESSO` é a parte que importa:
 * ele tem de devolver SEMPRE o mesmo objeto enquanto o canal não se reportou.
 */
export function useProgresso(chave: string | null): Progresso {
  return useAudioStore((state) =>
    chave === null ? SEM_PROGRESSO : (state.progresso[chave] ?? SEM_PROGRESSO),
  );
}

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
