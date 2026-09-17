"use client";

import { create } from "zustand";

/**
 * Onde os postits entram na escada de empilhamento do palco.
 *
 * A escada inteira está documentada em `use-pin-window-store`: item da cena usa
 * o `z` dele (1, 2, 3…), névoa 5000, máscara da câmera 7000, laço do alfinete
 * 8000, contorno de seleção 9000, alfinete 9500, alças de transformação 10000,
 * cartão da nota 12000.
 *
 * O postit fica em 8500: acima dos itens, da névoa e da máscara escura da
 * câmera, porque é papel COLADO sobre o mapa e um papel atrás da mobília não
 * seria lido -- e um papel escurecido por estar fora da câmera também não, sendo
 * que a câmera nunca o leva para a mesa (ver `MASCARA_Z`); abaixo do alfinete e
 * do cartão dele, porque o postit tem tamanho e o alfinete não — um papel de
 * 260 unidades por cima de um alfinete de 22 pixels esconderia o alfinete
 * inteiro, e o contrário só encosta um círculo no canto do papel.
 */
export const POSTIT_Z = 8_500;

/**
 * O postit que está aberto para digitar.
 *
 * Num store e não em estado da camada porque quem manda abrir é de fora: colar
 * um postit acontece no `MestreStage`, e o gesto seguinte é sempre escrever —
 * um papel em branco colado no mapa sem o cursor dentro dele é um passo a mais
 * para nada. Mesma razão de `abrirNota` depois de `addPin`.
 *
 * Um só, e não uma lista como as notas de alfinete: o cursor de texto é um, e
 * dois postits em modo de edição ao mesmo tempo mostrariam dois campos ativos
 * disputando o teclado.
 *
 * Estado de máquina: não entra no vault, não viaja para a mesa, não sobrevive a
 * fechar o aplicativo.
 */
type PostitStore = {
  editandoId: string | null;
  editar: (postitId: string) => void;
  /** Sai da edição. O postit continua no mapa, com o texto que tem. */
  fechar: () => void;
};

export const usePostitStore = create<PostitStore>((set) => ({
  editandoId: null,
  editar: (postitId) => set({ editandoId: postitId }),
  fechar: () => set({ editandoId: null }),
}));
