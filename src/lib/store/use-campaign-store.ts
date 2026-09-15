"use client";

import { create } from "zustand";

import { flushPortraits } from "@/lib/store/use-portrait-store";
import { flushBoard } from "@/lib/store/use-scene-store";
import { isDesktop, VaultError } from "@/lib/vault/bridge";
import {
  createCampaign,
  exportCampaign,
  forgetCampaign,
  importCampaign,
  pickImport,
  openCampaign,
  pickFolder,
  recentCampaigns,
  type CampaignInfo,
  type RecentEntry,
} from "@/lib/vault/campaign";

/**
 * A campanha aberta.
 *
 * Substitui o store de sala, e com ele desaparecem conta de e-mail, código de
 * operação, sessão anônima e os três papéis de `master`/`player`/`mesa`. O
 * aplicativo de desktop **é** o mestre: não há a quem pedir credencial, nem
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
  /**
   * Abrindo uma campanha: lendo o vault do disco, ou descompactando um zip.
   *
   * Separado de `busy` porque os dois dizem coisas diferentes. `busy` cobre
   * também a espera por um diálogo do SISTEMA, e ali quem tem de aparecer é o
   * diálogo -- uma tela de carregamento por baixo dele anunciaria trabalho que
   * ainda não começou, e que pode nem começar, porque a pessoa ainda vai
   * decidir. Este aqui é só trabalho já em curso, e é o que a tela de
   * carregamento espera para aparecer.
   */
  | "abrindo"
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
   * Chamado na montagem do Mestre: põe a tela na porta.
   *
   * Não abre campanha nenhuma, e é a regra inteira — montar o Mestre mostra a
   * lista, e entrar numa mesa é ato do mestre. Vale igual para abrir o
   * aplicativo e para recarregar a janela.
   *
   * Nem abre pasta, nem cria: a versão que criava uma campanha padrão sozinha
   * espalharia pastas pelo disco de quem só quis olhar.
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

/**
 * Grava o que estiver pendente ANTES de trocar a campanha aberta.
 *
 * A ordem é o ponto todo. O board e os retratos gravam com 400ms de atraso, e
 * `saveBoard` escreve na campanha que o processo nativo tem aberta — um
 * debounce ainda no ar no instante da troca escreveria o conteúdo da campanha
 * ANTERIOR dentro da nova. Ninguém associaria a perda ao clique de trocar.
 *
 * Melhor esforço: se a gravação falhar, a troca continua. Recusar a trocar de
 * campanha por causa de um erro de disco prenderia o mestre onde ele não quer
 * estar, e o motivo apareceria de novo na próxima gravação.
 */
async function fecharOAnterior(): Promise<void> {
  try {
    await Promise.all([flushBoard(), flushPortraits()]);
  } catch {
    // Ver acima.
  }
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

    // Duas montagens do Mestre não devem disparar duas aberturas.
    if (get().status === "loading" || get().status === "ready") return;

    set({ status: "loading", error: null });

    try {
      // A porta, sempre. Não pergunta ao Rust que campanha ele tem aberta, e
      // isso é a regra inteira: montar o Mestre mostra a lista, e entrar numa
      // campanha é um clique do mestre.
      //
      // Perguntar era o que fazia recarregar a janela cair DENTRO da campanha.
      // O `close()` devolve a tela para a lista de propósito sem fechar o vault
      // no Rust -- é o que mantém o daemon servindo a TV e os celulares
      // enquanto o mestre escolhe --, então na porta o processo nativo segue
      // com uma campanha aberta. Recarregar zera este store, que é de módulo, e
      // não zera o Rust: o `boot` perguntava, ouvia "tenho esta", e entrava.
      //
      // Remontar o componente não passa por aqui: a guarda acima sai cedo em
      // `ready`, e o store sobrevive à remontagem por ser de módulo. Quem chega
      // até este ponto ou abriu o aplicativo, ou recarregou a janela -- e as
      // duas querem a porta.
      set({
        campaign: null,
        recents: await refreshRecents(),
        status: "escolhendo",
      });
    } catch (cause) {
      set({ status: "error", error: describe(cause) });
    }
  },

  async choose(path) {
    if (get().busy) return;

    // `abrindo` no mesmo gesto que `busy`: ler o vault do disco leva um tempo
    // que se vê, e sem isto a porta continuava desenhada e sem reagir até a
    // campanha estar pronta -- uma travada, e não uma espera.
    set({ busy: true, status: "abrindo", error: null });

    try {
      await fecharOAnterior();
      set({ campaign: await openCampaign(path), status: "ready", busy: false });
    } catch (cause) {
      // A porta volta: a pasta pode ter sido movida, e a lista é o caminho de
      // volta para escolher outra. O `status` tem de voltar junto, senão a tela
      // de carregamento gira para sempre sobre um erro que ninguém lê.
      set({
        busy: false,
        status: "escolhendo",
        error: describe(cause),
        recents: await refreshRecents(),
      });
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

    // Depois do seletor, nunca antes: enquanto o diálogo do sistema está aberto
    // não há trabalho em curso, e o que a pessoa tem de ver é o diálogo.
    set({ busy: true, status: "abrindo", error: null });

    try {
      await fecharOAnterior();
      set({
        campaign: await createCampaign(parent, nome),
        status: "ready",
        busy: false,
      });
    } catch (cause) {
      set({ busy: false, status: "escolhendo", error: describe(cause) });
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

    // Os dois diálogos ANTES de qualquer marca de ocupado: `null` é o diálogo
    // fechado sem escolher, não muda nada e não é erro -- e enquanto eles estão
    // abertos a porta continua sendo o fundo certo, sem tela de carregamento
    // por baixo anunciando um trabalho que a pessoa ainda pode desistir de
    // pedir.
    const escolha = await pickImport();
    if (!escolha) return;

    // Daqui em diante é o passo mais demorado do aplicativo: o zip pode trazer
    // gigabytes de acervo para descompactar.
    set({ busy: true, status: "abrindo", error: null });

    try {
      await fecharOAnterior();
      const info = await importCampaign(escolha);

      set({ campaign: info, status: "ready", busy: false });
    } catch (cause) {
      // A porta volta, com o motivo: zip que não é campanha e pasta que já tem
      // uma são os dois casos comuns, e os dois pedem escolher outra coisa.
      set({
        busy: false,
        status: "escolhendo",
        error: describe(cause),
        recents: await refreshRecents(),
      });
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
