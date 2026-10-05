/// <reference lib="webworker" />

import type { FocoNaFolha } from "@/lib/area-de-efeito";
import {
  desenharFolhaDaArea,
  esmaecerOsPes,
  desenharFolhaDeParticulas,
  gradeDoSprite,
  pintarImagem,
  processarFolha,
  tamanhoDaFolha,
  tamanhoDoSprite,
  type BordaDaArea,
  type ImagemDaFagulha,
} from "@/lib/folha-de-efeito";
import type { FolhaDeParticulas, Trajetoria } from "@/lib/particulas";

/**
 * O forno do externo, FORA da thread que desenha.
 *
 * Medido na bancada: a folha do fogo tem dois mil pixels de lado, e pintá-la,
 * mascará-la e codificá-la na thread da janela fazia um quadro de 300 ms por
 * cor -- quarenta figuras em oito cores travaram a mesa por segundos. Aqui o
 * mesmo trabalho corre ao lado, e a janela só recebe os arquivos prontos.
 *
 * Um pedido por mensagem, na ordem em que chegam. As imagens vêm como
 * `ImageBitmap`, já decodificadas fora da janela também. Três tipos: a folha
 * do externo (cor, máscara, profundidade), a folha das partículas, desenhada
 * do zero, e a folha de uma área de efeito, montada dos focos.
 */

export type PedidoAoForno = PedidoDeFolha | PedidoDeParticulas | PedidoDeArea;

export type PedidoDeFolha = {
  tipo: "folha";
  id: number;
  folha: ImageBitmap;
  colunas: number;
  linhas: number;
  rampa?: Uint8ClampedArray;
  mascara?: ImageBitmap;
  profundidade?: ImageBitmap;
};

export type PedidoDeParticulas = {
  tipo: "particulas";
  id: number;
  folha: FolhaDeParticulas;
  caminhos: Trajetoria[];
  cor: string;
  imagem?: ImageBitmap;
  /** Pintar a imagem na `cor`, só a forma. */
  pintar: boolean;
  /** O sprite da imagem. Ausente = um quadro só. */
  quadros?: { colunas: number; total: number; fps?: number };
};

export type PedidoDeArea = {
  tipo: "area";
  id: number;
  quadro: { largura: number; altura: number };
  grade: { colunas: number; linhas: number; total: number };
  contorno: Array<{ x: number; y: number }>;
  borda?: BordaDaArea;
  /** A base e o fogo, já assados na cor. */
  base?: {
    fonte: ImageBitmap;
    grade: { colunas: number; linhas: number; total: number };
    ladrilho: { lado: number; x: number; y: number };
    opacidade: number;
    escurece: number;
  };
  fogo?: {
    fonte: ImageBitmap;
    grade: { colunas: number; linhas: number; total: number };
    focos: FocoNaFolha[];
  };
  /** As partículas, com o sprite delas quando o efeito tem um: a caveirinha do veneno. */
  fagulhas?: Omit<PedidoDeParticulas, "tipo" | "id">;
};

export type RespostaDoForno =
  | { id: number; unica: Blob }
  | { id: number; atras: Blob; frente: Blob }
  | { id: number; erro: string };

const escopo = self as unknown as DedicatedWorkerGlobalScope;

escopo.onmessage = async (evento: MessageEvent<PedidoAoForno>) => {
  const pedido = evento.data;

  try {
    escopo.postMessage(
      pedido.tipo === "particulas"
        ? await assarParticulas(pedido)
        : pedido.tipo === "area"
          ? await assarArea(pedido)
          : await assar(pedido),
    );
  } catch (causa) {
    escopo.postMessage({
      id: pedido.id,
      erro: causa instanceof Error ? causa.message : String(causa),
    } satisfies RespostaDoForno);
  }
};

async function assarParticulas(pedido: PedidoDeParticulas): Promise<RespostaDoForno> {
  const { folha } = pedido;
  const tela = new OffscreenCanvas(
    folha.celula.largura * folha.colunas,
    folha.celula.altura * folha.linhas,
  );
  const ctx = tela.getContext("2d");
  if (!ctx) throw new Error("sem canvas no forno");

  desenharFolhaDeParticulas(ctx, folha, pedido.caminhos, pedido.cor, sprite(pedido));
  return { id: pedido.id, unica: await tela.convertToBlob({ type: "image/png" }) };
}

async function assarArea(pedido: PedidoDeArea): Promise<RespostaDoForno> {
  const { grade, quadro } = pedido;
  const tela = new OffscreenCanvas(quadro.largura * grade.colunas, quadro.altura * grade.linhas);
  const ctx = tela.getContext("2d");
  if (!ctx) throw new Error("sem canvas no forno");

  desenharFolhaDaArea(ctx, {
    quadro,
    grade,
    contorno: pedido.contorno,
    ...(pedido.borda ? { borda: pedido.borda } : {}),
    ...(pedido.base
      ? { base: { ...pedido.base, largura: pedido.base.fonte.width, altura: pedido.base.fonte.height } }
      : {}),
    ...(pedido.fogo ? { fogo: { ...pedido.fogo, ...fogoSemPe(pedido.fogo) } } : {}),
  });
  if (pedido.fagulhas) {
    const { folha, caminhos, cor } = pedido.fagulhas;
    desenharFolhaDeParticulas(ctx, folha, caminhos, cor, sprite(pedido.fagulhas));
  }

  return { id: pedido.id, unica: await tela.convertToBlob({ type: "image/png" }) };
}

/** O fogo com o pé esmaecido. Ver `esmaecerOsPes`. */
function fogoSemPe(fogo: NonNullable<PedidoDeArea["fogo"]>) {
  const { width: largura, height: altura } = fogo.fonte;
  const tela = new OffscreenCanvas(largura, altura);
  const ctx = tela.getContext("2d");
  if (!ctx) return { fonte: fogo.fonte, largura, altura };

  esmaecerOsPes(ctx, fogo.fonte, largura, altura, fogo.grade.linhas);
  return { fonte: tela, largura, altura };
}

/** A imagem da partícula no tamanho que vale, e pintada se o efeito pediu. */
function sprite(
  pedido: Pick<PedidoDeParticulas, "imagem" | "quadros" | "pintar" | "cor">,
): ImagemDaFagulha | undefined {
  const imagem = pedido.imagem;
  if (!imagem) return undefined;

  const grade = gradeDoSprite(pedido.quadros);
  const { largura, altura } = tamanhoDoSprite(
    imagem.width,
    imagem.height,
    grade.colunas,
    grade.linhas,
  );
  const tela = new OffscreenCanvas(largura, altura);
  const ctx = tela.getContext("2d");
  if (!ctx) return undefined;

  if (pedido.pintar) pintarImagem(ctx, imagem, largura, altura, pedido.cor);
  else ctx.drawImage(imagem, 0, 0, largura, altura);

  return { fonte: tela, largura, altura, ...grade };
}

async function assar(pedido: PedidoDeFolha): Promise<RespostaDoForno> {
  const { folha, colunas, linhas } = pedido;
  const { largura, altura, ql, qa } = tamanhoDaFolha(folha.width, folha.height, colunas, linhas);

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
