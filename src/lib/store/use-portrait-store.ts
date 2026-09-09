"use client";

import { create } from "zustand";

import { createPortrait } from "@/lib/geometry/portrait";
import { loadPortraits, savePortraits } from "@/lib/vault/session";
import type { Portrait } from "@/types/scene";

/**
 * Gravação atrasada, como a do board.
 *
 * Arrastar um retrato emite uma mudança por frame, e gravar todas no disco
 * derruba o frame rate por nada — o que importa é o estado em que o gesto
 * parou.
 */
const PERSIST_DEBOUNCE_MS = 400;

type PortraitStore = {
  portraits: Portrait[];
  /** Qual campanha estes retratos pertencem. Ver `use-scene-store`. */
  hydratedPath: string | null;

  hydrate: (campaignPath: string) => Promise<void>;
  /** Cria um retrato a partir de uma imagem do acervo, no canto inferior. */
  add: (assetId: string, naturalWidth?: number, naturalHeight?: number) => string;
  update: (id: string, patch: Partial<Portrait>) => void;
  /** Um update para N retratos: arrastar ou escalar em grupo é um gesto só. */
  updateMany: (patches: Array<{ id: string; patch: Partial<Portrait> }>) => void;
  remove: (id: string) => void;
  /** Aplica um estado recebido do canal, sem regravar no disco. */
  receive: (portraits: Portrait[]) => void;

};

/**
 * Os retratos da sessão.
 *
 * Store próprio, fora do board, pelos mesmos dois motivos da trilha: desfazer
 * um movimento de imagem não deve mudar quem está no ar, e trocar de cena não
 * deve derrubar o elenco.
 */
export const usePortraitStore = create<PortraitStore>((set, get) => ({
  portraits: [],
  hydratedPath: null,

  async hydrate(campaignPath) {
    if (get().hydratedPath === campaignPath) return;

    // Zera antes de ler: elenco da campanha anterior na tela seria pior que
    // palco vazio por um instante.
    set({ portraits: [], hydratedPath: campaignPath });

    try {
      set({ portraits: await loadPortraits() });
    } catch {
      // Sessão sem retrato guardado é estado válido; não derruba a tela.
    }
  },

  add(assetId, naturalWidth, naturalHeight) {
    const portrait = createPortrait(assetId, naturalWidth, naturalHeight);
    // No fim da lista: o mais novo fica na frente, como acontece ao empilhar
    // qualquer coisa numa mesa.
    persist([...get().portraits, portrait], set);

    return portrait.id;
  },

  update(id, patch) {
    persist(
      get().portraits.map((portrait) =>
        portrait.id === id ? { ...portrait, ...patch } : portrait,
      ),
      set,
    );
  },

  updateMany(patches) {
    if (patches.length === 0) return;

    const byId = new Map(patches.map(({ id, patch }) => [id, patch]));

    persist(
      get().portraits.map((portrait) => {
        const patch = byId.get(portrait.id);
        return patch ? { ...portrait, ...patch } : portrait;
      }),
      set,
    );
  },

  remove(id) {
    persist(
      get().portraits.filter((portrait) => portrait.id !== id),
      set,
    );
  },

  receive(portraits) {
    // Espectador não grava: o disco pertence a quem opera.
    set({ portraits });
  },
}));

let persistTimer: ReturnType<typeof setTimeout> | undefined;

function persist(portraits: Portrait[], set: (partial: { portraits: Portrait[] }) => void) {
  set({ portraits });

  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => void savePortraits(portraits), PERSIST_DEBOUNCE_MS);
}

/**
 * Grava agora o que estiver pendente. Ver `flushBoard` em `use-scene-store`.
 */
export async function flushPortraits(): Promise<void> {
  clearTimeout(persistTimer);
  persistTimer = undefined;

  await savePortraits(usePortraitStore.getState().portraits);
}
