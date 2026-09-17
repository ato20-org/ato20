"use client";

import { create } from "zustand";

import { gravarDocumento, lerDocumento } from "@/lib/vault/documentos";
import { useSceneStore } from "@/lib/store/use-scene-store";

/** Quanto tempo depois da última tecla o arquivo é gravado. */
const GRAVAR_MS = 400;

/**
 * O texto dos documentos abertos no palco, por arquivo.
 *
 * Fora da cena porque o texto não é da cena -- é do arquivo `.md` --, e fora
 * do componente porque dois cartões podem apontar para o mesmo arquivo e o
 * texto tem de ser um só. Grava com atraso, como o board, e ao gravar toca o
 * `atualizadoEm` do cartão na cena: é por ele que a mesa sabe reler.
 */
type DocumentoStore = {
  textos: Record<string, string>;
  /** Arquivos cuja leitura está a caminho, para não pedir duas vezes. */
  lendo: Record<string, true>;
  carregar: (arquivo: string) => void;
  /** Troca o texto na tela agora e grava daqui a pouco. */
  escrever: (arquivo: string, texto: string) => void;
  /** Grava o que estiver pendente, já. Chamado antes de trocar de campanha. */
  descarregar: () => Promise<void>;
};

const pendentes = new Map<string, ReturnType<typeof setTimeout>>();

async function gravar(arquivo: string) {
  const texto = useDocumentoStore.getState().textos[arquivo];
  if (texto === undefined) return;
  await gravarDocumento(arquivo, texto);
  // Só o carimbo, sem histórico: gravar não é editar a cena. Em TODOS os
  // cartões do arquivo, em todos os quadros: a nota é uma, os cartões são N.
  useSceneStore.getState().tocarDocumentos(arquivo);
}

export const useDocumentoStore = create<DocumentoStore>((set, get) => ({
  textos: {},
  lendo: {},

  carregar(arquivo) {
    const { textos, lendo } = get();
    if (arquivo in textos || lendo[arquivo]) return;
    set({ lendo: { ...lendo, [arquivo]: true } });

    lerDocumento(arquivo).then(
      (texto) =>
        set((state) => {
          const proximo = { ...state.lendo };
          delete proximo[arquivo];
          // Uma tecla que chegou antes da leitura ganha: o mestre já escreveu.
          return {
            lendo: proximo,
            textos: arquivo in state.textos ? state.textos : { ...state.textos, [arquivo]: texto },
          };
        }),
      (cause: unknown) => {
        console.error("falha ao ler o documento", cause);
        set((state) => {
          const proximo = { ...state.lendo };
          delete proximo[arquivo];
          return { lendo: proximo };
        });
      },
    );
  },

  escrever(arquivo, texto) {
    set((state) => ({ textos: { ...state.textos, [arquivo]: texto } }));

    const pendente = pendentes.get(arquivo);
    if (pendente) clearTimeout(pendente);
    pendentes.set(
      arquivo,
      setTimeout(() => {
        pendentes.delete(arquivo);
        gravar(arquivo).catch((cause: unknown) => {
          console.error("falha ao gravar o documento", cause);
        });
      }, GRAVAR_MS),
    );
  },

  async descarregar() {
    const agora = [...pendentes.entries()];
    pendentes.clear();
    for (const [, timer] of agora) clearTimeout(timer);
    await Promise.all(agora.map(([arquivo]) => gravar(arquivo)));
  },
}));
