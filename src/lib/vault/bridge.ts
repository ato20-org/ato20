"use client";

import { invoke } from "@tauri-apps/api/core";

/**
 * A costura com o processo nativo.
 *
 * Tudo que antes ia para o Supabase ou para o IndexedDB passa por aqui. Duas
 * portas, e a escolha entre elas não é estilo:
 *
 * - `call` para JSON pequeno — board, pastas, sessão. Atravessa o IPC.
 * - o daemon HTTP para binário — imagem e som. Um mapa de 80 MB no IPC vira
 *   serialização de array de números; pelo loopback é streaming direto para o
 *   disco.
 */

/**
 * Erro que veio do Rust, com o código intacto.
 *
 * O código existe para a tela ramificar sem ler texto: `sem-campanha` abre a
 * porta de escolher pasta, `disco` é problema da máquina de quem opera, e
 * `ilegivel` pede olhar o arquivo. Comparar mensagem por substring quebraria na
 * primeira correção de português.
 */
export class VaultError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "VaultError";
  }
}

/** Sem campanha aberta. É o único erro que a tela trata como estado, não falha. */
export function isNoCampaign(cause: unknown): boolean {
  return cause instanceof VaultError && cause.code === "sem-campanha";
}

/**
 * Roda dentro do aplicativo, e não numa aba de browser.
 *
 * O mesmo bundle serve as três telas: o Operador só existe no aplicativo,
 * enquanto Assistir e Plateia são justamente as que rodam noutro aparelho.
 * Checar a marca do Tauri é o que permite as três compartilharem componente
 * sem uma saber da outra.
 */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Chama um comando nativo, traduzindo o erro do Rust. */
export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isDesktop()) {
    throw new VaultError(
      "sem-aplicativo",
      "Esta tela precisa do aplicativo ATO20, não de uma aba do navegador.",
    );
  }

  try {
    return await invoke<T>(command, args);
  } catch (cause) {
    // O Rust serializa `{ code, message }`. Qualquer outra coisa é falha do
    // próprio IPC, e aí a mensagem crua é o que há.
    if (cause && typeof cause === "object" && "code" in cause && "message" in cause) {
      throw new VaultError(String(cause.code), String(cause.message));
    }

    throw new VaultError("ipc", typeof cause === "string" ? cause : "Falha ao falar com o aplicativo");
  }
}

export type DaemonAddr = {
  /** Loopback. É por aqui que a janela do Operador fala com o daemon. */
  url: string;
  /**
   * O mesmo daemon pelo IP da rede local, para a TV e os celulares.
   *
   * `null` quando a máquina não tem rota de rede — sem Wi-Fi nem cabo. A tela
   * diz isso, em vez de mostrar um endereço que não responderia.
   */
  lanUrl: string | null;
  /** Segredo das rotas que escrevem. */
  token: string;
};

/**
 * Endereço do daemon, resolvido uma vez por aba.
 *
 * A porta é efêmera — escolhida pelo sistema na abertura — e o token nasce com
 * o processo. Guardar a promessa, e não o valor, é o que faz N imagens
 * montando ao mesmo tempo dividirem uma chamada só em vez de N.
 */
let addrPromise: Promise<DaemonAddr> | null = null;

export function daemonAddr(): Promise<DaemonAddr> {
  addrPromise ??= call<DaemonAddr>("daemon_addr");

  return addrPromise;
}
