"use client";

import { useEffect, useMemo, useState } from "react";

import { amostrasDaParede } from "@/lib/geometry/volume";
import { amostraDoMapa, corDominante, type AmostraDoMapa } from "@/lib/cor-do-mapa";
import type { Parede } from "@/types/scene";

type Assado = { url: string; amostra: AmostraDoMapa | null };

/**
 * De que cor é cada parede: a escolha do mestre, ou o palpite do mapa.
 *
 * A escolhida GANHA, e nem chega a custar leitura -- `Parede.cor` sai daqui sem
 * passar pelo retrato. Quem escolheu já respondeu a pergunta que a amostragem
 * existe para responder.
 *
 * `Map` vazio enquanto o forno trabalha, e vazio para sempre se ele falhar --
 * nos dois casos quem chamou desenha o que desenhava antes, que é a regra do
 * `useSilhueta`. A face sem cor volta a ser a face texturizada, que é pior e
 * não quebrada.
 *
 * ## Duas memórias, e não uma
 *
 * O retrato do mapa custa um `fetch`, um decode e um `getImageData`, e só muda
 * quando o MAPA muda. As cores custam uma dúzia de leituras por parede, e mudam
 * quando a parede se move. Assar as duas coisas juntas refaria o retrato a cada
 * arrasto de muro; guardá-las em memórias separadas faz o arrasto pagar só o
 * que ele de fato mexeu.
 */
export function useCoresDasParedes(
  paredes: Parede[],
  mapaUrl: string | undefined,
): Map<string, string> {
  const [assado, setAssado] = useState<Assado | null>(null);

  useEffect(() => {
    if (!mapaUrl) return;

    let ativo = true;

    void amostraDoMapa(mapaUrl).then((amostra) => {
      if (ativo) setAssado({ url: mapaUrl, amostra });
    });

    return () => {
      ativo = false;
    };
  }, [mapaUrl]);

  // A url assada é conferida na saída, como no `useSilhueta`: trocar o mapa
  // mostraria as cores do anterior por um quadro, e parede da cor da sala
  // errada é pior que parede sem cor.
  const amostra = assado && assado.url === mapaUrl ? assado.amostra : null;

  return useMemo(() => {
    const cores = new Map<string, string>();

    for (const parede of paredes) {
      if (parede.cor) {
        cores.set(parede.id, parede.cor);
        continue;
      }

      if (!amostra) continue;

      const cor = corDominante(amostra, amostrasDaParede(parede));
      if (cor) cores.set(parede.id, cor);
    }

    return cores;
  }, [amostra, paredes]);
}
