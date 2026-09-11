"use client";

import { create } from "zustand";

import {
  type Extensao,
  habilitarExtensao,
  importarExtensao,
  listarExtensoes,
  removerExtensao,
} from "@/lib/extensoes/manifesto";
import { aplicarTemas } from "@/lib/extensoes/tema";
import { isDesktop, VaultError } from "@/lib/vault/bridge";

/**
 * As extensões instaladas nesta máquina.
 *
 * Store próprio e não parte do `usePreferenciasStore`, apesar de as duas serem
 * "da máquina": aquele guarda o que a tela decide sozinha e grava no
 * `localStorage`, e este é uma lista que vive no DISCO, sob o Rust. Misturar
 * os dois daria um store em que metade dos campos é síncrona e a outra metade
 * pede `await`.
 *
 * A lista inteira a cada mudança, e não um item alterado no lugar: quem sabe o
 * que existe é o disco — apagar a pasta pelo gerenciador de arquivos é um
 * jeito legítimo de desinstalar —, e recarregar é o que mantém a tela honesta
 * sobre isso.
 */

type ExtensoesStore = {
  extensoes: Extensao[];
  /** A lista já foi lida uma vez. Antes disso, vazia não quer dizer nenhuma. */
  carregada: boolean;
  /** Uma operação está em curso. Segura os botões. */
  ocupada: boolean;
  /** A última falha, para a tela mostrar. `null` quando não há. */
  erro: string | null;

  carregar: () => Promise<void>;
  importar: () => Promise<void>;
  remover: (id: string) => Promise<void>;
  habilitar: (id: string, habilitada: boolean) => Promise<void>;
};

/** A mensagem de um erro do Rust, ou o que houver. */
function mensagem(causa: unknown): string {
  if (causa instanceof VaultError) return causa.message;

  return "Falha ao falar com o aplicativo.";
}

export const useExtensoesStore = create<ExtensoesStore>((set, get) => ({
  extensoes: [],
  carregada: false,
  ocupada: false,
  erro: null,

  async carregar() {
    // Fora do aplicativo não há disco para ler. A lista fica vazia e
    // carregada, que é o estado honesto: nenhuma extensão, e não um erro.
    if (!isDesktop()) {
      set({ carregada: true });
      return;
    }

    try {
      set({ extensoes: await listarExtensoes(), carregada: true, erro: null });
    } catch (causa) {
      set({ carregada: true, erro: mensagem(causa) });
    }
  },

  async importar() {
    if (get().ocupada) return;

    set({ ocupada: true, erro: null });

    try {
      const nova = await importarExtensao();

      // `null` é o diálogo fechado sem escolher. Cancelar não é falha, e
      // recarregar a lista por causa dele seria trabalho por nada.
      if (nova) await get().carregar();
    } catch (causa) {
      set({ erro: mensagem(causa) });
    } finally {
      set({ ocupada: false });
    }
  },

  async remover(id) {
    if (get().ocupada) return;

    set({ ocupada: true, erro: null });

    try {
      await removerExtensao(id);
      await get().carregar();
    } catch (causa) {
      set({ erro: mensagem(causa) });
    } finally {
      set({ ocupada: false });
    }
  },

  async habilitar(id, habilitada) {
    // Otimista, ao contrário de importar e remover: o interruptor tem de
    // responder ao dedo, e o que ele liga é um `<link>` que já está no disco.
    // Os outros dois mexem em arquivo e podem demorar o que o disco demorar.
    const antes = get().extensoes;

    set({
      extensoes: antes.map((extensao) =>
        extensao.id === id ? { ...extensao, habilitada } : extensao,
      ),
      erro: null,
    });

    try {
      await habilitarExtensao(id, habilitada);
    } catch (causa) {
      // Volta ao que era: o interruptor mostrando o contrário do que vale é
      // pior que não ter mudado.
      set({ extensoes: antes, erro: mensagem(causa) });
    }
  },
}));

/**
 * Os temas seguem a lista, fora do React.
 *
 * Aqui e não num `useEffect` porque o que isto mexe é o `<head>` do documento,
 * que não pertence a componente nenhum: um efeito em algum painel faria o tema
 * do aplicativo depender de aquele painel estar montado — e a tela de
 * Configurações, que é de onde se liga uma extensão, desmonta ao fechar.
 *
 * É a mesma escolha do `usePanelsStore`, que grava a preferência de coluna por
 * um `subscribe` e não por efeito.
 */
useExtensoesStore.subscribe((estado, anterior) => {
  if (estado.extensoes !== anterior.extensoes) aplicarTemas(estado.extensoes);
});
