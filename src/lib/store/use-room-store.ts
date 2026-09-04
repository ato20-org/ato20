"use client";

import { create } from "zustand";

import {
  currentAccount,
  signIn as authSignIn,
  signOut as authSignOut,
  signUp as authSignUp,
  type Account,
} from "@/lib/supabase/account";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  createRoom,
  joinRoomByCode,
  listMasterRooms,
  unlockRoom,
  type Room,
} from "@/lib/supabase/rooms";

export type RoomStatus =
  /** Nada tentado ainda. */
  | "idle"
  /** Sem Supabase configurado: o app segue local, sem Plateia. */
  | "offline"
  | "loading"
  /** Nenhuma conta de mestre neste navegador. A porta pede e-mail e senha. */
  | "unauthenticated"
  /** Conta sem mesa nenhuma. Falta criar uma, ou assumir com o código. */
  | "locked"
  /** Conta com várias mesas e nenhuma escolhida ainda. */
  | "choosing"
  | "ready"
  | "error";

type RoomStore = {
  status: RoomStatus;
  room: Room | null;
  role: "master" | "player" | "viewer" | null;
  /** A conta do mestre. `null` para jogador, TV e instalação local. */
  account: Account | null;
  /** Mesas desta conta, para escolher qual operar. */
  masterRooms: Room[];
  error: string | null;
  /**
   * Uma ação da porta está em curso.
   *
   * Separado de `status` de propósito: se entrar virasse `loading`, a porta
   * sairia da tela no envio e levaria junto o que foi digitado e a mensagem de
   * erro — quem errou a senha teria de redigitar do zero para ler o motivo.
   */
  busy: boolean;

  /**
   * Chamado pelo Operador: procura a conta deste navegador e as mesas dela.
   * Não cria mesa nem conta — as duas coisas são atos do mestre, não efeitos
   * de abrir a tela.
   *
   * `preferredCode` vem da lista em `/mesa`, para quem tem mais de uma abrir a
   * que clicou.
   */
  connectAsMaster: (preferredCode?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  /** Cadastra, ou promove a sessão anônima deste navegador a conta. */
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Escolhe qual mesa operar, na porta de quem tem várias. */
  chooseRoom: (room: Room) => void;
  /** Volta para a escolha de mesa sem sair da conta. */
  leaveRoom: () => void;
  /** Assume a mesa com o código de operação, de qualquer navegador. */
  unlock: (operatorCode: string) => Promise<void>;
  /** Abre uma mesa nova e devolve a senha, que só aparece uma vez. */
  openRoom: () => Promise<string>;
  /** Chamado pela Plateia com o código digitado ou vindo da URL. */
  connectAsPlayer: (code: string) => Promise<void>;
  /** Chamado pelo Assistir: acha a mesa pelo código, sem entrar como jogador. */
  connectAsViewer: (code: string) => Promise<void>;
};

function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.message;

  return "Falha ao conectar na sala";
}

export const useRoomStore = create<RoomStore>((set, get) => ({
  status: "idle",
  room: null,
  role: null,
  account: null,
  masterRooms: [],
  error: null,
  busy: false,

  async connectAsMaster(preferredCode) {
    if (!isSupabaseConfigured()) {
      set({ status: "offline" });
      return;
    }

    // Duas montagens do Operador não devem disparar duas buscas.
    if (get().status === "loading" || get().status === "ready") return;

    set({ status: "loading", error: null });

    try {
      const account = await currentAccount();

      if (!account) {
        set({ account: null, room: null, role: null, status: "unauthenticated" });
        return;
      }

      const masterRooms = await listMasterRooms();

      // Uma mesa só não é escolha: abrir direto poupa um clique em toda
      // abertura de sessão. Código pedido que não é desta conta cai na
      // escolha, e não na mesa errada em silêncio.
      const preferred = preferredCode
        ? masterRooms.find((room) => room.code === preferredCode)
        : undefined;
      const room = preferred ?? (masterRooms.length === 1 ? masterRooms[0] : null);

      if (room) {
        set({ account, masterRooms, room, role: "master", status: "ready" });
        return;
      }

      set({
        account,
        masterRooms,
        room: null,
        role: null,
        status: masterRooms.length === 0 ? "locked" : "choosing",
      });
    } catch (cause) {
      set({ status: "error", error: describe(cause) });
    }
  },

  async signIn(email, password) {
    if (get().busy) return;

    set({ busy: true, error: null });

    try {
      await authSignIn(email, password);
      // `idle` antes de reconectar: `connectAsMaster` sai cedo em `loading` e
      // em `ready`, e sem isto a porta ficaria na tela depois de entrar.
      set({ busy: false, status: "idle" });
      await get().connectAsMaster();
    } catch {
      // Distinguir "e-mail não existe" de "senha errada" só ajudaria quem está
      // adivinhando.
      set({ busy: false, error: "E-mail ou senha inválidos." });
    }
  },

  async signUp(email, password) {
    if (get().busy) return;

    set({ busy: true, error: null });

    try {
      await authSignUp(email, password);
      set({ busy: false, status: "idle" });
      await get().connectAsMaster();
    } catch (cause) {
      // Aqui a mensagem do servidor vale: ela diz senha curta, e-mail já usado
      // ou confirmação pendente — três coisas com saídas diferentes.
      set({ busy: false, error: describe(cause) });
    }
  },

  async signOut() {
    set({ busy: true, error: null });

    try {
      await authSignOut();
    } finally {
      // Mesmo se o servidor recusar, a sessão local já era: manter a tela como
      // se ainda houvesse mesa seria pior que voltar para a porta.
      set({
        busy: false,
        account: null,
        masterRooms: [],
        room: null,
        role: null,
        status: "unauthenticated",
      });
    }
  },

  chooseRoom(room) {
    set({ room, role: "master", status: "ready", error: null });
  },

  leaveRoom() {
    set({ room: null, role: null, status: "choosing", error: null });
  },

  async unlock(operatorCode) {
    if (get().busy) return;

    set({ busy: true, error: null });

    try {
      const room = await unlockRoom(operatorCode);

      set({
        room,
        role: "master",
        status: "ready",
        busy: false,
        // A mesa assumida passa a ser desta conta: sem entrar na lista, ela
        // desapareceria da escolha até o próximo F5.
        masterRooms: [room, ...get().masterRooms.filter((known) => known.id !== room.id)],
      });
    } catch {
      // A mensagem do servidor vem em minúsculas e sem contexto. Distinguir
      // "não existe" de "errada" só ajudaria quem está adivinhando.
      set({ busy: false, error: "Código de operação inválido." });
    }
  },

  async openRoom() {
    set({ busy: true, error: null });

    try {
      const created = await createRoom();
      const room = { id: created.id, code: created.code };

      set({
        room,
        role: "master",
        status: "ready",
        busy: false,
        masterRooms: [room, ...get().masterRooms],
      });

      return created.operatorCode;
    } catch (cause) {
      set({ busy: false, error: describe(cause) });
      throw cause;
    }
  },

  async connectAsPlayer(code) {
    if (!isSupabaseConfigured()) {
      set({ status: "offline" });
      return;
    }

    if (get().status === "loading") return;

    // Já dentro desta mesma mesa: sair daqui evita um RPC redundante quando o
    // efeito de auto-entrada roda de novo, por exemplo depois de a URL ganhar
    // o código.
    const normalized = code.trim().toUpperCase();
    if (get().status === "ready" && get().room?.code === normalized) return;

    set({ status: "loading", error: null });

    try {
      set({ room: await joinRoomByCode(normalized), role: "player", status: "ready" });
    } catch (cause) {
      set({ status: "error", error: describe(cause) });
    }
  },

  async connectAsViewer(code) {
    if (!isSupabaseConfigured()) {
      set({ status: "offline" });
      return;
    }

    if (get().status === "loading") return;

    const normalized = code.trim().toUpperCase();
    if (get().status === "ready" && get().room?.code === normalized) return;

    set({ status: "loading", error: null });

    try {
      // A TV costuma ser uma aba do próprio navegador do mestre. Reaproveitar
      // a mesa dele evita `join_room`, cujo efeito seria inserir o mestre na
      // lista de jogadores dele mesmo.
      const own = (await listMasterRooms()).find((room) => room.code === normalized);
      const room = own ?? (await joinRoomByCode(normalized));

      // Papel próprio, e não `player`: quem assiste não tem ficha nem anexos
      // — só recebe a cena.
      set({ room, role: "viewer", status: "ready" });
    } catch (cause) {
      set({ status: "error", error: describe(cause) });
    }
  },
}));
