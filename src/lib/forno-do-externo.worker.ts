/// <reference lib="webworker" />

import { processarFolha } from "@/lib/folha-de-efeito";

/**
 * O forno do externo, FORA da thread que desenha.
 *
 * Medido na bancada: a folha do fogo tem dois mil pixels de lado, e pintá-la,
 * mascará-la e codificá-la na thread da janela fazia um quadro de 300 ms por
 * cor -- quarenta figuras em oito cores travaram a mesa por segundos. Aqui o
 * mesmo trabalho corre ao lado, e a janela só recebe os arquivos prontos.
 *
 * Um pedido por mensagem, na ordem em que chegam. As imagens vêm como
 * `ImageBitmap`, já decodificadas fora da janela também.
 */

export type PedidoAoForno = {
  id: number;
  folha: ImageBitmap;
  colunas: number;
  linhas: number;
  rampa?: Uint8ClampedArray;
  mascara?: ImageBitmap;
  profundidade?: ImageBitmap;
};

export type RespostaDoForno =
  | { id: number; unica: Blob }
  | { id: number; atras: Blob; frente: Blob }
  | { id: number; erro: string };

const escopo = self as unknown as DedicatedWorkerGlobalScope;

escopo.onmessage = async (evento: MessageEvent<PedidoAoForno>) => {
  const pedido = evento.data;

  try {
    escopo.postMessage(await assar(pedido));
  } catch (causa) {
    escopo.postMessage({
      id: pedido.id,
      erro: causa instanceof Error ? causa.message : String(causa),
    } satisfies RespostaDoForno);
  }
};

async function assar(pedido: PedidoAoForno): Promise<RespostaDoForno> {
  const { folha, colunas, linhas } = pedido;
  const largura = folha.width;
  const altura = folha.height;
  const ql = Math.max(1, Math.floor(largura / colunas));
  const qa = Math.max(1, Math.floor(altura / linhas));

  const saida = processarFolha({
    px: pixels(folha, largura, altura),
    largura,
    altura,
    colunas,
    linhas,
    rampa: pedido.rampa,
    mascara: pedido.mascara ? luminancia(pedido.mascara, ql, qa) : undefined,
    profundidade: pedido.profundidade ? luminancia(pedido.profundidade, ql, qa) : undefined,
  });

  if ("unica" in saida) {
    return { id: pedido.id, unica: await paraBlob(saida.unica, largura, altura) };
  }

  const [atras, frente] = await Promise.all([
    paraBlob(saida.atras, largura, altura),
    paraBlob(saida.frente, largura, altura),
  ]);

  return { id: pedido.id, atras, frente };
}

function pixels(imagem: ImageBitmap, largura: number, altura: number): Uint8ClampedArray {
  const tela = new OffscreenCanvas(largura, altura);
  const ctx = tela.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("sem canvas no forno");

  ctx.drawImage(imagem, 0, 0, largura, altura);
  return ctx.getImageData(0, 0, largura, altura).data;
}

/** Um mapa em tons de cinza no tamanho do quadro, de 0 a 1. */
function luminancia(imagem: ImageBitmap, largura: number, altura: number): Float32Array {
  const px = pixels(imagem, largura, altura);
  const saida = new Float32Array(largura * altura);
  for (let i = 0; i < saida.length; i++) saida[i] = px[i * 4]! / 255;

  return saida;
}

function paraBlob(px: Uint8ClampedArray, largura: number, altura: number): Promise<Blob> {
  const tela = new OffscreenCanvas(largura, altura);
  const ctx = tela.getContext("2d");
  if (!ctx) throw new Error("sem canvas no forno");

  ctx.putImageData(new ImageData(new Uint8ClampedArray(px), largura, altura), 0, 0);
  return tela.convertToBlob({ type: "image/png" });
}
