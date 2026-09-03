import type { Scene, SessionTrack } from "@/types/scene";

/**
 * Só o JSON da cena viaja. As imagens ficam no IndexedDB, que é compartilhado
 * entre abas da mesma origem — o espectador resolve `assetId` localmente.
 * Na Fase 2 (Plateia no celular) isso muda: outra máquina, outro storage, e
 * aí entra uma implementação de `SceneChannel` que também sobe os binários.
 */
/**
 * Tudo que um espectador precisa saber.
 *
 * Cena e trilha viajam juntas numa mensagem só. A trilha não pertence à cena
 * — ela é da sessão — mas separá-las em duas mensagens exigiria dois apertos
 * de mão, dois reenvios e dois heartbeats, para nenhum ganho.
 */
export type LiveState = {
  /** `null` = nada no ar. */
  scene: Scene | null;
  /** `null` = nenhuma trilha escolhida. */
  track: SessionTrack | null;
};

export type ChannelMessage =
  /** Operador anuncia o estado atual. */
  | ({ type: "live:update" } & LiveState)
  /** Espectador acabou de abrir e pede o estado atual. */
  | { type: "live:request" };

export interface SceneChannel {
  send(message: ChannelMessage): void;
  /** Devolve a função de cancelamento. */
  subscribe(handler: (message: ChannelMessage) => void): () => void;
  close(): void;
}
