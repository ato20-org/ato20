"use client";

import { useEffect, useState } from "react";

import { assetUrl, setAssetPeaks } from "@/lib/vault/assets";
import type { AssetMeta } from "@/types/scene";

/** Quantas barras a onda tem. */
export const PEAK_BUCKETS = 120;

/**
 * Taxa de amostragem usada só para medir.
 *
 * `decodeAudioData` reamostra para a taxa do contexto, e 8 kHz é o mínimo que
 * a especificação permite. Não é escolha de qualidade — é de memória: uma faixa
 * de cinco minutos em estéreo a 44,1 kHz decodifica para ~106 MB de float, e a
 * 8 kHz para ~19 MB. A forma da onda é a mesma em qualquer taxa; o que se está
 * medindo é a envoltória, não o timbre.
 */
const MEASURE_RATE = 8000;

/**
 * A forma da onda de uma faixa.
 *
 * Calculada uma vez por arquivo e gravada no vault, então a segunda vez que a
 * mesma trilha aparece não decodifica nada. Enquanto não houver picos devolve
 * `null`, e a barra desenha uma linha lisa — o arquivo toca de qualquer jeito.
 *
 * O cálculo mora no navegador porque ele já tem um decodificador de áudio. No
 * Rust seria preciso embutir um para mp3, ogg, flac e m4a, o que é um preço
 * alto por uma decoração.
 */
export function useTrackPeaks(asset: AssetMeta | undefined): number[] | null {
  const gravados = asset?.kind === "audio" ? asset.peaks : undefined;
  const jaTem = Boolean(gravados && gravados.length > 0);

  /**
   * O que foi medido nesta sessão, com o id de quem foi medido.
   *
   * O id acompanha de propósito. Trocar de faixa não precisa de um efeito que
   * zere isto: basta comparar, e a medida velha deixa de valer sozinha —
   * derivar é mais seguro que lembrar de limpar.
   */
  const [medido, setMedido] = useState<{ id: string; peaks: number[] } | null>(null);

  useEffect(() => {
    if (!asset || asset.kind !== "audio" || jaTem) return;

    let ativo = true;

    void medir(asset.id).then(
      (peaks) => {
        if (!ativo || !peaks) return;

        setMedido({ id: asset.id, peaks });
        // Grava para nunca mais medir. Falha aqui não custa nada visível: a
        // onda já está na tela, e a próxima sessão mede de novo.
        void setAssetPeaks(asset.id, peaks).catch(() => {});
      },
      () => {
        // Arquivo que o browser não decodifica — ou um formato que ele não
        // conhece. A barra fica lisa e o som continua tocando.
      },
    );

    return () => {
      ativo = false;
    };
  }, [asset, jaTem]);

  // O que está no vault manda: ele foi medido uma vez e não muda.
  if (gravados && gravados.length > 0) return gravados;

  return medido && medido.id === asset?.id ? medido.peaks : null;
}

async function medir(assetId: string): Promise<number[] | null> {
  const url = await assetUrl(assetId);
  const bytes = await (await fetch(url)).arrayBuffer();

  // `OfflineAudioContext` e não `AudioContext`: o segundo pede saída de som e
  // pode nascer suspenso esperando um gesto do usuário. Aqui não se toca nada,
  // só se decodifica.
  const contexto = new OfflineAudioContext(1, 1, MEASURE_RATE);
  const buffer = await contexto.decodeAudioData(bytes);

  return balder(buffer);
}

/**
 * Reduz o áudio a uma barra por balde.
 *
 * Pico absoluto do balde, e não média: a média achata tudo num traço quase
 * reto, porque som tem tanto silêncio entre as batidas quanto batida. O que
 * desenha a forma que se reconhece é o extremo.
 *
 * Normalizado pelo maior pico da faixa, e não por 1.0: uma gravação baixa
 * desenharia uma linha rasteira e indistinguível de silêncio.
 */
function balder(buffer: AudioBuffer): number[] {
  const canal = buffer.getChannelData(0);
  const porBalde = Math.max(1, Math.floor(canal.length / PEAK_BUCKETS));

  const brutos: number[] = [];
  let maior = 0;

  for (let balde = 0; balde < PEAK_BUCKETS; balde++) {
    const inicio = balde * porBalde;
    const fim = Math.min(canal.length, inicio + porBalde);

    let pico = 0;
    for (let i = inicio; i < fim; i++) {
      const valor = Math.abs(canal[i]);
      if (valor > pico) pico = valor;
    }

    brutos.push(pico);
    if (pico > maior) maior = pico;
  }

  // Faixa em silêncio absoluto: sem isso a divisão daria NaN.
  if (maior === 0) return brutos.map(() => 0);

  return brutos.map((pico) => Math.round((pico / maior) * 100));
}
