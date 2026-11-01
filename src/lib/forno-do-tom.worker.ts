/// <reference lib="webworker" />

import type { AjusteDeImagem } from "@/lib/imagem-do-espectador";
import { pintarComTom, tamanhoAssado } from "@/lib/tom-do-mapa";

/**
 * O forno do tom do mapa, FORA da thread que desenha: o mapa tem milhares de
 * pixels de lado, e pintá-lo e codificá-lo na janela seria um quadro parado a
 * cada mudança de tom. Ver `mapa-com-tom.ts`.
 */

export type PedidoDeTom = {
  id: number;
  imagem: ImageBitmap;
  ajuste: Required<AjusteDeImagem>;
};

export type RespostaDoTom = { id: number; arquivo: Blob } | { id: number; erro: string };

const escopo = self as unknown as DedicatedWorkerGlobalScope;

escopo.onmessage = async (evento: MessageEvent<PedidoDeTom>) => {
  const { id, imagem, ajuste } = evento.data;

  try {
    const { largura, altura } = tamanhoAssado(imagem.width, imagem.height);
    const tela = new OffscreenCanvas(largura, altura);
    const ctx = tela.getContext("2d");
    if (!ctx) throw new Error("sem contexto 2d");

    pintarComTom(ctx, imagem, largura, altura, ajuste);
    imagem.close();

    const arquivo = await tela.convertToBlob({ type: "image/png" });
    escopo.postMessage({ id, arquivo } satisfies RespostaDoTom);
  } catch (causa) {
    escopo.postMessage({ id, erro: String(causa) } satisfies RespostaDoTom);
  }
};
