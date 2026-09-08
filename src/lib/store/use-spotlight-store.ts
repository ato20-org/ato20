"use client";

import { create } from "zustand";

import { unshareAttachment } from "@/lib/vault/evidence";
import type { Spotlight } from "@/types/scene";

type SpotlightStore = {
  /** `null` = nada em evidência. */
  spotlight: Spotlight | null;
  /**
   * De onde saiu o que está no ar, para o aviso do mestre.
   *
   * FORA do `spotlight` de propósito: o que a mesa recebe é o objeto
   * `spotlight`, e nome de arquivo ali seria legenda — que este projeto já
   * tentou e desfez, ver a nota em `Spotlight`. Aqui é só rótulo local, e não
   * atravessa para a TV.
   */
  origem: string | null;

  /**
   * Manda uma imagem do acervo para a frente de tudo, na TV e nos celulares.
   *
   * O instante é estampado aqui, e não no espectador: transmitir o MESMO
   * arquivo de novo é como se chama a atenção para ele outra vez, e sem um
   * campo que muda a tela não teria como distinguir isso de nada acontecendo.
   */
  transmit: (assetId: string) => void;
  /**
   * Manda um anexo de jogador, pelo endereço que o daemon abriu para ele.
   *
   * O `sharedId` vem de `shareAttachment`; quem chama resolve isso antes,
   * porque é IPC e pode falhar — e falhar tem de virar aviso na tela do
   * mestre, não evidência vazia na TV.
   */
  transmitShared: (sharedId: string, origem: string) => void;
  /** Tira da evidência. A mesa volta a ver só a cena. */
  clear: () => void;
};

/**
 * A imagem em evidência.
 *
 * Store próprio, e não um campo da cena, pelo mesmo motivo da trilha: o mestre
 * transmite o retrato de um PNJ e continua montando o mapa embaixo, e trocar
 * de cena não pode derrubar o que a mesa está olhando.
 *
 * Não persiste no vault, e é a única coisa da sessão que não persiste. A
 * trilha é ambiente e faz sentido reencontrar tocando; evidência é um gesto
 * — "olha isto" —, e restaurá-la ao reabrir o aplicativo mandaria para a TV um
 * documento que a mesa já passou meia hora antes. Nada se perde ao não gravar:
 * o anexo continua no ponto de anotação, e retransmitir é um clique.
 */
export const useSpotlightStore = create<SpotlightStore>((set) => ({
  spotlight: null,
  origem: null,

  transmit(assetId) {
    // Fecha o endereço do anexo anterior: a mesa passou a olhar outra coisa, e
    // um arquivo de jogador não tem por que seguir alcançável na rede depois
    // de sair do ar.
    void unshareAttachment();

    set({ spotlight: { assetId, since: Date.now() }, origem: null });
  },

  transmitShared(sharedId, origem) {
    set({ spotlight: { sharedId, since: Date.now() }, origem });
  },

  clear() {
    void unshareAttachment();

    set({ spotlight: null, origem: null });
  },
}));
