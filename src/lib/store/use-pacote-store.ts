"use client";

import { toast } from "sonner";
import { create } from "zustand";

import { t } from "@/lib/i18n/mestre";
import { abrirPacote, fecharPacote, type PacoteAberto } from "@/lib/vault/pacote";

/**
 * Os diálogos de exportar e importar partes da campanha.
 *
 * Num store, e não num estado de componente, porque quem abre está longe de
 * quem desenha: o menu da campanha, na barra do topo, e o menu da linha de um
 * mapa, no painel. Os dois diálogos moram uma vez só, no `mestre-shell`.
 */
type PacoteStore = {
  /** O diálogo de exportar, com as cenas que já vêm marcadas. `null` = fechado. */
  exportando: { cenas: string[] } | null;
  abrirExportar: (cenas?: string[]) => void;
  fecharExportar: () => void;

  /** O pacote aberto, esperando o mestre escolher o que entra. */
  aberto: PacoteAberto | null;
  abrindo: boolean;
  /** Escolhe o arquivo e o abre. */
  escolherPacote: () => Promise<void>;
  /**
   * Fecha o diálogo de importar. `descartar` apaga a pasta extraída; depois de
   * importar ela já saiu, e não precisa.
   */
  fecharImportar: (descartar: boolean) => void;
};

export const usePacoteStore = create<PacoteStore>((set, get) => ({
  exportando: null,
  abrirExportar: (cenas) => set({ exportando: { cenas: cenas ?? [] } }),
  fecharExportar: () => set({ exportando: null }),

  aberto: null,
  abrindo: false,

  async escolherPacote() {
    if (get().abrindo) return;

    set({ abrindo: true });
    const aviso = toast.loading(t.pacote.abrindo);

    try {
      const aberto = await abrirPacote();
      toast.dismiss(aviso);
      if (aberto) set({ aberto });
    } catch (causa) {
      toast.error(t.pacote.abrirFalhou, {
        id: aviso,
        description: causa instanceof Error ? causa.message : String(causa),
      });
    } finally {
      set({ abrindo: false });
    }
  },

  fecharImportar(descartar) {
    const { aberto } = get();
    if (aberto && descartar) void fecharPacote(aberto.token).catch(() => {});
    set({ aberto: null });
  },
}));
