"use client";

import { create } from "zustand";

/**
 * A versão do elenco, como o Mestre a publica, do lado do celular.
 *
 * O celular lê a ficha por `/eu/personagens` UMA vez ao montar, e nada o
 * avisava de que ela mudou: um plugin que gasta um recurso pelo botão do
 * jogador deixaria o número velho na tela dele. O Mestre passou a mandar
 * `fichasVersao` no quadro -- o contador do `useCharactersStore` --, e é
 * este número que a ficha assina para rebuscar.
 *
 * Store, e não prop: a ficha mora seis camadas abaixo de quem tem o quadro, e
 * em duas disposições de tela. Ver `JogadorShell`.
 */
type FichasVersaoStore = {
  versao: number;
  definir: (versao: number) => void;
};

export const useFichasVersaoStore = create<FichasVersaoStore>((set, get) => ({
  versao: 0,
  definir(versao) {
    if (versao !== get().versao) set({ versao });
  },
}));
