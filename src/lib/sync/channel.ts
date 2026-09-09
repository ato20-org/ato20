import type { Portrait, Scene, SessionTrack, Spotlight } from "@/types/scene";

/**
 * Tudo que um espectador precisa saber.
 *
 * Cena, trilha, retratos e evidência viajam numa mensagem só. Nenhum pertence
 * aos outros — trilha, retratos e evidência são da sessão, não da cena —, mas
 * separá-los exigiria um reenvio e um heartbeat para cada um, para nenhum
 * ganho, e faria quem chega no meio da sessão receber a cena antes do elenco.
 *
 * A cena que entra aqui passou por `sceneForTable`: ela é a cena SEM os pontos
 * de anotação do mestre. Este quadro é público para quem tem o código da mesa.
 */
export type LiveState = {
  /** `null` = nada no ar. */
  scene: Scene | null;
  /** `null` = nenhuma trilha escolhida. */
  track: SessionTrack | null;
  /**
   * Volume do som, de 0 a 1, para todas as telas.
   *
   * Viaja fora da faixa porque é da sessão: o mestre regula de um lugar, a TV
   * e os celulares seguem, e trocar de música não mexe no ganho.
   */
  volume: number;
  /** Retratos sobre a cena, ancorados na câmera. */
  portraits: Portrait[];
  /** Imagem em evidência sobre tudo. `null` = nenhuma. */
  spotlight: Spotlight | null;
};

/**
 * Cadência de publicação da cena.
 *
 * 10 Hz. Arrastar um item gera ~60 mudanças de estado por segundo, e publicar
 * todas pagaria uma serialização do board por frame para produzir a mesma
 * imagem — quem assiste interpola entre as amostras (ver `.scene-smooth-item`
 * em `globals.css`).
 */
export const SCENE_BROADCAST_INTERVAL_MS = 100;

/**
 * O transporte da cena.
 *
 * Encolheu quando o daemon entrou. Antes havia `live:request`: o espectador que
 * abria a tela no meio da sessão pedia o estado, e o Operador respondia — com
 * reenvio a cada 2,5s, porque um pedido que chegasse antes de o Operador se
 * inscrever simplesmente não existia para ele.
 *
 * Nada disso é preciso agora. O daemon guarda o último estado publicado e o
 * manda na conexão, então quem chega no meio já entra sincronizado sem aperto
 * de mão nenhum. Com o pedido foram embora o `ChannelMessage`, o reenvio e a
 * metade do `useSubscription`.
 */
export interface SceneChannel {
  /** Só o Operador chama. Num canal de espectador é inerte. */
  publish(state: LiveState): void;
  /** Devolve a função de cancelamento. */
  subscribe(handler: (state: LiveState) => void): () => void;
  close(): void;
}
