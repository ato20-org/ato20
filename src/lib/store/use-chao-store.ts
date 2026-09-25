import { create } from "zustand";

type ChaoStore = {
  /**
   * O elemento cujo sistema de coordenadas É o chão da cena, quando ela está
   * deitada. `null` com o mapa de prumo.
   *
   * Guardado num store e não num contexto porque quem precisa dele não está
   * todo dentro de uma árvore só: o item está sob a `SceneLayer`, mas a parede,
   * o alfinete e o postit são irmãos dela no palco do Mestre. Um contexto
   * teria de envolver o palco inteiro para alcançar os dois lados, e aí
   * qualquer troca de chão re-renderizaria tudo o que há nele.
   *
   * Ninguém assina este valor para desenhar -- ele é lido no começo de um
   * gesto, por `getState()`, e um gesto começa uma vez.
   */
  chao: HTMLElement | null;
  /** Anunciado pela `SceneLayer` quando ela deita, e apagado quando ela levanta. */
  anunciarChao: (chao: HTMLElement | null) => void;
};

/**
 * Onde fica o chão da cena deitada.
 *
 * ## Por que isto existe
 *
 * Todo arrasto do palco converte ponteiro em cena dividindo por `scale` -- é a
 * conta do plano chapado, e ela vale enquanto o chão está de prumo. Deitado,
 * entre o cursor e o chão passaram a existir uma rotação e uma perspectiva, e
 * `(clientX - inicio) / scale` deixa de dizer onde o dedo caiu: o item salta ao
 * ser pego e anda em ritmo próprio depois.
 *
 * Inverter isso na mão é uma homografia a manter. O motor já sabe: um evento
 * que cai num elemento traz `offsetX/offsetY` NO SISTEMA DELE, com a rotação, a
 * inclinação, a perspectiva e a escala já desfeitas. Capturando o ponteiro no
 * chão, o gesto inteiro continua chegando em coordenadas de chão -- inclusive
 * com o cursor sobre um token, que tem sistema próprio.
 *
 * Medido em seis pontos do plano, com inclinação, giro, perspectiva e uma
 * escala por fora: erro zero em todos. É a única peça do modo que depende de o
 * motor fazer certo uma conta que não se vê, e por isso ela foi medida antes de
 * ser usada. Ver `ChaoInclinado`.
 */
export const useChaoStore = create<ChaoStore>((set) => ({
  chao: null,
  anunciarChao: (chao) => set({ chao }),
}));
