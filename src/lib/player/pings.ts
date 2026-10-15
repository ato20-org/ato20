"use client";

import { t } from "@/lib/i18n/jogador";
import { authorized, fail } from "@/lib/player/session";
import type { Ping, TipoDePing } from "@/types/ping";

/**
 * Apontar um lugar do mapa para a mesa, do celular.
 *
 * O celular manda o tipo, a cena e o ponto; quem assina com o nome é o daemon,
 * pelo token. O ping não aparece aqui na hora: ele volta pelo quadro, como o
 * de todo mundo, e é isso que confirma que a mesa o viu.
 *
 * Sem retentativa, como o dado: repetir sozinho um pedido que pode ter chegado
 * acenderia dois pings para um gesto.
 */
export async function marcarPing(
  codigo: string,
  pedido: { tipo: TipoDePing; cenaId: string; x: number; y: number },
): Promise<Ping> {
  const response = await fetch("/eu/pings", {
    method: "POST",
    headers: { "content-type": "application/json", ...authorized(codigo) },
    body: JSON.stringify(pedido),
  });

  if (!response.ok) throw await fail(response, t.erros.pingNaoChegou);

  return (await response.json()) as Ping;
}
