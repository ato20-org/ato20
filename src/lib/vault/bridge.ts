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
 * A campanha estava aberta e a pasta dela sumiu do disco.
 *
 * O segundo erro que é estado e não falha. Diferente de `sem-campanha`: há uma
 * campanha, com a cena inteira ainda na tela, e o que o mestre precisa é saber
 * QUAL pasta procurar. Ver `Vault::verificar` no Rust.
 */
export function isCampanhaSumiu(cause: unknown): boolean {
  return cause instanceof VaultError && cause.code === "campanha-sumiu";
}

type AoSumir = (mensagem: string) => void;

const ouvintesDeSumico = new Set<AoSumir>();

/**
 * Avisa quando qualquer comando descobrir que a pasta da campanha sumiu.
 *
 * Aqui, e não em cada store: todo erro do Rust atravessa `call`, então este é
 * o único ponto por onde a notícia passa com certeza. A alternativa era o
 * store de cenas checar o código e avisar o de campanha -- e o de campanha já
 * importa o de cenas para o `flushBoard`. Seria um ciclo por uma linha.
 *
 * O board grava com 400ms de atraso e vai continuar tentando enquanto a pasta
 * não voltar; quem ouve tem de aguentar o mesmo aviso muitas vezes.
 */
export function aoSumirCampanha(ouvinte: AoSumir): () => void {
  ouvintesDeSumico.add(ouvinte);

  return () => {
    ouvintesDeSumico.delete(ouvinte);
  };
}

/**
 * Roda dentro do aplicativo, e não numa aba de browser.
 *
 * O mesmo bundle serve as três telas: o Mestre só existe no aplicativo,
 * enquanto Espectador e Jogador são justamente as que rodam noutro aparelho.
 * Checar a marca do Tauri é o que permite as três compartilharem componente
 * sem uma saber da outra.
 */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Chama um comando nativo, traduzindo o erro do Rust. */
export async function call<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
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
    if (
      cause &&
      typeof cause === "object" &&
      "code" in cause &&
      "message" in cause
    ) {
      const erro = new VaultError(String(cause.code), String(cause.message));

      if (isCampanhaSumiu(erro)) {
        for (const ouvinte of ouvintesDeSumico) ouvinte(erro.message);
      }

      throw erro;
    }

    throw new VaultError(
      "ipc",
      typeof cause === "string" ? cause : "Falha ao falar com o aplicativo",
    );
  }
}

export type DaemonAddr = {
  /** Loopback. É por aqui que a janela do Mestre fala com o daemon. */
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
