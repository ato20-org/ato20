"use client";

import { create } from "zustand";

import { isDesktop, VaultError } from "@/lib/vault/bridge";
import {
  createCampaign,
  currentCampaign,
  exportCampaign,
  forgetCampaign,
  importCampaign,
  openCampaign,
  pickFolder,
  recentCampaigns,
  reopenLastCampaign,
  type CampaignInfo,
  type RecentEntry,
} from "@/lib/vault/campaign";

/**
 * A campanha aberta.
 *
 * Substitui o store de sala, e com ele desaparecem conta de e-mail, código de
 * operação, sessão anônima e os três papéis de `master`/`player`/`viewer`. O
 * aplicativo de desktop **é** o operador: não há a quem pedir credencial, nem
 * mesa alheia a proteger de quem já está na máquina.
 *
 * O que sobrou é a pergunta que importa: qual pasta está aberta.
 */
export type CampaignStatus =
  | "idle"
  /** Aberto numa aba de navegador, onde não há disco a alcançar. */
  | "sem-aplicativo"
  | "loading"
  /** Nenhuma campanha aberta. A porta mostra recentes e o seletor de pasta. */
  | "escolhendo"
  | "ready"
  | "error";

type CampaignStore = {
  status: CampaignStatus;
  campaign: CampaignInfo | null;
  recents: RecentEntry[];
  error: string | null;
  /**
   * Uma ação da porta está em curso.
   *
   * Separado de `status` de propósito: se abrir uma pasta virasse `loading`, a
   * porta sairia da tela e levaria junto a lista de recentes e a mensagem de
   * erro — quem escolheu a pasta errada teria de reabrir tudo para ler o
   * motivo.
   */
  busy: boolean;

  /**
   * Chamado na montagem do Operador: reabre a campanha da sessão anterior.
   *
   * Não cria nada. Abrir uma pasta é ato do mestre, não efeito de abrir a tela
   * — a versão que criava uma campanha padrão sozinha espalharia pastas pelo
   * disco de quem só quis olhar.
   */
  boot: () => Promise<void>;
  /** Abre uma campanha já conhecida, pelo caminho. */
  choose: (path: string) => Promise<void>;
  /** Seletor nativo de pasta, para abrir uma campanha existente. */
  openFolder: () => Promise<void>;
  /** Pede a pasta-mãe e cria a campanha dentro dela. */
  create: (nome: string) => Promise<void>;
  /** Tira da lista de recentes. Não apaga nada do disco. */
  forget: (path: string) => Promise<void>;
  /**
   * Zipa a campanha aberta, inteira. Devolve o caminho gravado, ou `null` se
   * desistiu no diálogo.
   */
  exportar: () => Promise<string | null>;
  /** Importa um zip como campanha nova e a abre. */
  importar: () => Promise<void>;
  /** Volta para a escolha sem fechar nada no disco. */
  close: () => void;
};

function describe(cause: unknown): string {
  if (cause instanceof VaultError) return cause.message;
  if (cause instanceof Error) return cause.message;

  return "Falha ao abrir a campanha";
}

/** Recarrega a lista de recentes sem derrubar a tela se ela falhar. */
async function refreshRecents(): Promise<RecentEntry[]> {
  try {
    return await recentCampaigns();
  } catch {
    // A lista é conveniência: sem ela a porta ainda abre pelo seletor.
    return [];
  }
}

export const useCampaignStore = create<CampaignStore>((set, get) => ({
  status: "idle",
  campaign: null,
  recents: [],
  error: null,
  busy: false,

  async boot() {
    if (!isDesktop()) {
      set({ status: "sem-aplicativo" });
      return;
    }

    // Duas montagens do Operador não devem disparar duas aberturas.
    if (get().status === "loading" || get().status === "ready") return;

    set({ status: "loading", error: null });

    try {
      // `current` antes de `reopen`: numa remontagem a campanha já está aberta
      // no processo nativo, e reabrir releria o disco por nada.
      const open = (await currentCampaign()) ?? (await reopenLastCampaign());

      if (open) {
        set({ campaign: open, status: "ready" });
        return;
      }

      set({ campaign: null, recents: await refreshRecents(), status: "escolhendo" });
    } catch (cause) {
      set({ status: "error", error: describe(cause) });
    }
  },

  async choose(path) {
    if (get().busy) return;

    set({ busy: true, error: null });

    try {
      set({ campaign: await openCampaign(path), status: "ready", busy: false });
    } catch (cause) {
      // A porta fica: a pasta pode ter sido movida, e a lista é o caminho de
      // volta para escolher outra.
      set({ busy: false, error: describe(cause), recents: await refreshRecents() });
    }
  },

  async openFolder() {
    if (get().busy) return;

    const path = await pickFolder("Escolha a pasta da campanha");
    // Diálogo fechado sem escolher não é erro, e não deve deixar a porta
    // ocupada nem mostrar mensagem.
    if (!path) return;

    await get().choose(path);
  },

  async create(nome) {
    if (get().busy) return;

    const parent = await pickFolder("Onde criar a campanha");
    if (!parent) return;

    set({ busy: true, error: null });

    try {
      set({ campaign: await createCampaign(parent, nome), status: "ready", busy: false });
    } catch (cause) {
      set({ busy: false, error: describe(cause) });
    }
  },

  async forget(path) {
    try {
      await forgetCampaign(path);
    } finally {
      set({ recents: await refreshRecents() });
    }
  },

  async exportar() {
    if (get().busy) return null;

    set({ busy: true, error: null });

    try {
      const dest = await exportCampaign();
      set({ busy: false });

      return dest;
    } catch (cause) {
      set({ busy: false, error: describe(cause) });

      return null;
    }
  },

  async importar() {
    if (get().busy) return;

    set({ busy: true, error: null });

    try {
      const info = await importCampaign();

      // `null` é o diálogo fechado sem escolher: não muda nada, e não é erro.
      set(info ? { campaign: info, status: "ready", busy: false } : { busy: false });
    } catch (cause) {
      // A porta fica, com o motivo: zip que não é campanha e pasta que já tem
      // uma são os dois casos comuns, e os dois pedem escolher outra coisa.
      set({ busy: false, error: describe(cause), recents: await refreshRecents() });
    }
  },

  close() {
    // Só a tela volta para a escolha. O processo nativo continua com a
    // campanha aberta, e é isso que faz o daemon seguir servindo os arquivos
    // para a TV e para os celulares enquanto o mestre olha a lista.
    set({ campaign: null, status: "escolhendo", error: null });
    void refreshRecents().then((recents) => set({ recents }));
  },
}));
