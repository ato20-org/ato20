"use client";

import { authorized, fail } from "@/lib/player/session";
import type { FacesDado, RolagemDaMesa } from "@/types/dado";

/**
 * Jogar um dado na mesa, do celular.
 *
 * O celular pede o dado e o daemon devolve a face. É o inverso do que o
 * saquinho do mestre faz — lá o sorteio mora no `lancar` do store, aqui ele
 * mora do outro lado da rede. A razão está em `POST /eu/rolagens`: um número
 * sorteado no aparelho de quem se beneficia dele é um número que um cliente
 * modificado crava em vinte, e é a única coisa da mesa que alguém pode querer
 * mesmo trapacear.
 *
 * A consequência é que rolar é ASSÍNCRONO, e o dado só nasce quando a resposta
 * chega. Numa rede local isso são poucos milissegundos entre soltar o dedo e o
 * dado aparecer; numa rede ruim, o jogador vê a demora — e é melhor ver a
 * demora do que ver um número que a mesa não viu.
 *
 * Sem retentativa: quem chama avisa e o jogador rola de novo. Repetir sozinho
 * uma chamada que pode ter chegado jogaria dois dados para um gesto.
 */
export async function rolarDado(
  codigo: string,
  faces: FacesDado,
): Promise<RolagemDaMesa> {
  const response = await fetch("/eu/rolagens", {
    method: "POST",
    headers: { "content-type": "application/json", ...authorized(codigo) },
    body: JSON.stringify({ faces }),
  });

  if (!response.ok) throw await fail(response, "a mesa não recebeu o dado");

  return (await response.json()) as RolagemDaMesa;
}
