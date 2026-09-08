import type { Portrait, Scene, SessionTrack } from "@/types/scene";

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
  /**
   * Volume do som, de 0 a 1, para todas as telas.
   *
   * Viaja fora da faixa porque é da sessão: o mestre regula de um lugar, a TV
   * e os celulares seguem, e trocar de música não mexe no ganho.
   */
  volume: number;
  /**
   * Retratos sobre a cena. Viajam junto porque são da sessão e ficam no ar
   * atravessando a troca de cena — mandá-los em outra mensagem exigiria um
   * segundo aperto de mão para o espectador que chega no meio.
   */
  portraits: Portrait[];
};

export type ChannelMessage =
  /** Operador anuncia o estado atual. */
  | ({ type: "live:update" } & LiveState)
  /** Espectador acabou de abrir e pede o estado atual. */
  | { type: "live:request" };

/**
 * Cadência de publicação da cena, comum aos dois transportes.
 *
 * 10 Hz. Arrastar um item gera ~60 mudanças de estado por segundo: na rede
 * isso estouraria a cota de mensagens do plano gratuito, e no
 * `BroadcastChannel` pagaria uma cópia estruturada do board inteiro por frame
 * — para nada, porque quem assiste interpola entre as amostras (ver
 * `.scene-smooth-item` em `globals.css`).
 *
 * Vive aqui, no módulo de tipos, para o transporte local não precisar importar
 * o do Supabase — e com ele o cliente inteiro — só para ler um número.
 */
export const SCENE_BROADCAST_INTERVAL_MS = 100;

export interface SceneChannel {
  send(message: ChannelMessage): void;
  /** Devolve a função de cancelamento. */
  subscribe(handler: (message: ChannelMessage) => void): () => void;
  close(): void;
}
