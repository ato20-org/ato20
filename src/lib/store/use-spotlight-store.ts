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
   * O item da campanha que está no ar, quando é um.
   *
   * Local, como `origem`, e pela mesma razão: a mesa recebe o CARTÃO, e o id do
   * catálogo não diz nada a ela. Aqui ele responde a pergunta que quatro telas
   * fazem — a janela de Itens, a ficha, o ponto e o handout —: "é ESTE item que
   * está no ar?". Antes cada uma guardava a própria resposta, e o botão de uma
   * mentia sobre o que a outra tinha transmitido.
   */
  itemId: string | null;

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
  /**
   * Manda um item da campanha: o cartão com nome e descrição, e a imagem dele
   * quando há uma. Ver `Spotlight.item`.
   *
   * A imagem chega resolvida, como em `transmitShared`: a do jogador precisa
   * do endereço sorteado, e pedi-lo é IPC que pode falhar antes de algo ir ao
   * ar. Ver `transmitirItem`.
   */
  transmitItem: (
    itemId: string,
    cartao: NonNullable<Spotlight["item"]>,
    imagem: { assetId?: string; sharedId?: string },
  ) => void;
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
  itemId: null,

  transmit(assetId) {
    // Fecha o endereço do anexo anterior: a mesa passou a olhar outra coisa, e
    // um arquivo de jogador não tem por que seguir alcançável na rede depois
    // de sair do ar.
    void unshareAttachment();

    set({
      spotlight: { assetId, since: Date.now() },
      origem: null,
      itemId: null,
    });
  },

  transmitShared(sharedId, origem) {
    set({ spotlight: { sharedId, since: Date.now() }, origem, itemId: null });
  },

  transmitItem(itemId, cartao, { assetId, sharedId }) {
    // O endereço do anexo anterior fecha, como em `transmit` -- menos quando é
    // justamente ele que este item vai usar.
    if (!sharedId) void unshareAttachment();

    set({
      spotlight: { assetId, sharedId, item: cartao, since: Date.now() },
      origem: cartao.nome,
      itemId,
    });
  },

  clear() {
    void unshareAttachment();

    set({ spotlight: null, origem: null, itemId: null });
  },
}));
