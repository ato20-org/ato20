import type { Scene } from "@/types/scene";

/**
 * Só o JSON da cena viaja. As imagens ficam no IndexedDB, que é compartilhado
 * entre abas da mesma origem — o espectador resolve `assetId` localmente.
 * Na Fase 2 (Plateia no celular) isso muda: outra máquina, outro storage, e
 * aí entra uma implementação de `SceneChannel` que também sobe os binários.
 */
export type ChannelMessage =
  /** Operador anuncia o estado atual da cena. `null` = nada no ar. */
  | { type: "scene:update"; scene: Scene | null }
  /** Espectador acabou de abrir e pede o estado atual. */
  | { type: "scene:request" };

export interface SceneChannel {
  send(message: ChannelMessage): void;
  /** Devolve a função de cancelamento. */
  subscribe(handler: (message: ChannelMessage) => void): () => void;
  close(): void;
}
