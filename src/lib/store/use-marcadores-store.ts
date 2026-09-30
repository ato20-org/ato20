"use client";

import { create } from "zustand";

import {
  listarLivros,
  listarMarcadores,
  type Livro,
  type Marcador,
} from "@/lib/vault/estante";

/** Um marcador com o livro dele: a menção precisa dos dois para abrir e para dizer de onde é. */
export type MarcadorDoLivro = { marcador: Marcador; livro: Livro };

type MarcadoresStore = {
  /**
   * As páginas marcadas pela campanha aberta, em todos os livros da estante:
   * na ordem dos livros, e dentro de cada um na ordem do banco -- página, e o
   * mais antigo desempatando.
   *
   * `null` é "ainda não leu", e não uma campanha sem marcador nenhum.
   */
  lista: MarcadorDoLivro[] | null;
  /** Número do pedido mais novo: a resposta de um pedido velho é descartada. */
  pedido: number;
  emVoo: boolean;

  /** Lê se ninguém leu ainda. É o que quem desenha menção chama ao montar. */
  garantir: () => void;
  /** Relê agora: um marcador nasceu, mudou de nome ou saiu, ou a estante mudou. */
  recarregar: () => void;
  /** A campanha passou a ser outra: os marcadores de antes não valem nela. */
  esquecer: () => void;
};

/**
 * Os marcadores da campanha em TODOS os livros, para a menção `!rótulo`.
 *
 * O leitor tem os dele, por livro, em `useMarcadores` -- é a tira ao lado da
 * página, e só ela. Quem escreve a nota não sabe em que livro está a regra, e
 * é por isso que a menção procura na estante inteira.
 *
 * Um pedido por livro, com os comandos que já existem, e não um comando novo
 * no Rust: a estante tem um punhado de manuais, e a lista só é relida quando
 * um marcador muda, e não a cada tecla.
 *
 * Sem campanha aberta a lista é vazia, como no acervo: o marcador é da
 * campanha, e sem ela não há o que listar.
 */
export const useMarcadoresStore = create<MarcadoresStore>((set, get) => ({
  lista: null,
  pedido: 0,
  emVoo: false,

  garantir() {
    if (get().lista === null && !get().emVoo) buscar(set, get);
  },

  recarregar() {
    // Ninguém pediu ainda: a primeira tela que precisar lê. Relistar a estante
    // porque o mestre marcou uma página, sem nota nem postit aberto, é IPC à toa.
    if (get().lista === null && !get().emVoo) return;
    buscar(set, get);
  },

  esquecer() {
    set({ lista: null, pedido: get().pedido + 1, emVoo: false });
  },
}));

type Set = (parcial: Partial<MarcadoresStore>) => void;
type Get = () => MarcadoresStore;

function buscar(set: Set, get: Get) {
  const meu = get().pedido + 1;
  set({ pedido: meu, emVoo: true });

  void (async () => {
    let lista: MarcadorDoLivro[] = [];

    try {
      const livros = await listarLivros();
      const porLivro = await Promise.all(
        livros.map(async (livro) =>
          (await listarMarcadores(livro.id)).map((marcador) => ({ marcador, livro })),
        ),
      );
      lista = porLivro.flat();
    } catch {
      // Sem campanha, ou a estante que não leu: a menção fica sem vínculo, e é
      // o leitor quem avisa o que houve -- ele é quem mostra os marcadores.
    }

    if (get().pedido !== meu) return;
    set({ lista, emVoo: false });
  })();
}

/** Relê de fora do React: quem mexe num marcador ou num livro. */
export function invalidarMarcadores(): void {
  useMarcadoresStore.getState().recarregar();
}

/** A campanha passou a ser outra. Ver `esquecer`. */
export function esquecerMarcadores(): void {
  useMarcadoresStore.getState().esquecer();
}
