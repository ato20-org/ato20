"use client";

import { authorized } from "@/lib/player/session";
import { SCENE_BROADCAST_INTERVAL_MS } from "@/lib/sync/channel";
import type { MovimentoDoJogador } from "@/lib/sync/movimento";
import { createTrailingThrottle } from "@/lib/sync/throttle";

/** O que o celular manda: tudo do movimento, menos quem -- quem é o token. */
export type AmostraDeMovimento = Omit<MovimentoDoJogador, "jogadorId">;

export type EnvioDeMovimentos = {
  /** Uma posição do meio do arrasto. Pode ser engolida pela seguinte. */
  mover: (amostra: AmostraDeMovimento) => void;
  /** A posição onde o dedo soltou. Sempre sai. */
  soltar: (amostra: AmostraDeMovimento) => void;
  cancelar: () => void;
};

/**
 * O arrasto do token, subindo para a mesa ao vivo.
 *
 * Duas regras, e cada uma tem o seu motivo:
 *
 * - **No máximo dez por segundo**, que é a cadência em que o Mestre publica.
 *   Mandar sessenta posições por segundo produziria a mesma imagem na TV, que
 *   só vê as amostras que o Mestre republica e interpola entre elas.
 * - **Um pedido em voo por vez.** No Wi-Fi da casa, dois `fetch` seguidos
 *   podem sair por conexões diferentes e chegar trocados -- e o token daria um
 *   passo para trás no meio do arrasto. Esperar a resposta antes de mandar a
 *   próxima garante a ordem; o que chegar enquanto isso substitui o pendente,
 *   porque a posição que importa é sempre a última.
 *
 * O throttle é o que nunca perde o último valor (ver `createTrailingThrottle`),
 * então o lugar onde o dedo soltou sempre chega -- é o que `soltar` força.
 *
 * `aoRecusar` é chamado quando a mesa diz que o personagem não é mais deste
 * jogador (404) ou que o jogador não está mais na mesa (401). Falha de rede não
 * conta: a amostra seguinte tenta de novo sozinha.
 */
export function criarEnvioDeMovimentos(
  codigo: string,
  aoRecusar: () => void,
): EnvioDeMovimentos {
  let emVoo = false;
  let seguinte: AmostraDeMovimento | null = null;
  let cancelado = false;

  async function enviar(amostra: AmostraDeMovimento): Promise<void> {
    if (cancelado) return;

    if (emVoo) {
      seguinte = amostra;
      return;
    }

    emVoo = true;

    try {
      const response = await fetch("/eu/movimentos", {
        method: "POST",
        headers: { "content-type": "application/json", ...authorized(codigo) },
        body: JSON.stringify(amostra),
      });

      if (response.status === 401 || response.status === 404) {
        seguinte = null;
        aoRecusar();
      }
    } catch {
      // Ver acima: a próxima amostra é a retentativa.
    } finally {
      emVoo = false;

      const proxima = seguinte;
      seguinte = null;
      if (proxima) void enviar(proxima);
    }
  }

  const throttle = createTrailingThrottle<AmostraDeMovimento>(
    SCENE_BROADCAST_INTERVAL_MS,
    (amostra) => void enviar(amostra),
  );

  return {
    mover: (amostra) => throttle.run(amostra),

    soltar(amostra) {
      throttle.run(amostra);
      throttle.flush();
    },

    cancelar() {
      cancelado = true;
      seguinte = null;
      throttle.cancel();
    },
  };
}
