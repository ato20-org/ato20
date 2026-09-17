"use client";

import { useEffect, useState } from "react";

import { pdfjs, RUNTIME } from "@/lib/leitor/pdfjs";
import { livroFonte } from "@/lib/vault/estante";

export type Capa = {
  /** A primeira página, em JPEG, como `data:` URL. */
  url: string;
  /** Altura sobre largura da página, para a caixa ter a forma do livro. */
  proporcao: number;
  /** Cor média da capa, para a lombada e o corte parecerem do mesmo livro. */
  cor: string;
};

/** Largura da capa desenhada, em px físicos. Duas vezes o que a tela mostra. */
const LARGURA_PX = 192;

/**
 * Uma promessa por livro, por sessão.
 *
 * Em memória e não em disco, de propósito: gerar custa abrir o documento pelo
 * daemon e desenhar uma página, meio segundo por livro, e a estante tem meia
 * dúzia. Gravar PNG no daemon seria uma rota e um comando para poupar meio
 * segundo na segunda abertura. Se incomodar, vem depois.
 *
 * `null` guardado = já tentou e falhou; a caixa desenha sem imagem e não tenta
 * de novo a cada render.
 */
const capas = new Map<string, Promise<Capa | null>>();

async function gerar(livroId: string): Promise<Capa | null> {
  const [mod, fonte] = await Promise.all([pdfjs(), livroFonte(livroId)]);
  const tarefa = mod.getDocument({ ...fonte, ...RUNTIME });

  try {
    const doc = await tarefa.promise;
    const pagina = await doc.getPage(1);

    const base = pagina.getViewport({ scale: 1 });
    const viewport = pagina.getViewport({ scale: LARGURA_PX / base.width });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    await pagina.render({ canvas, canvasContext: ctx, viewport }).promise;

    return {
      url: canvas.toDataURL("image/jpeg", 0.82),
      proporcao: viewport.height / viewport.width,
      cor: corMedia(ctx, canvas.width, canvas.height),
    };
  } finally {
    // O documento inteiro sai da memória: só a página 1 interessava, e um
    // manual de trezentas páginas aberto por livro da estante é o que o leitor
    // evita com cuidado.
    void tarefa.destroy();
  }
}

/** Média dos pixels numa amostra grossa, escurecida um pouco para a lombada. */
function corMedia(
  ctx: CanvasRenderingContext2D,
  largura: number,
  altura: number,
): string {
  const { data } = ctx.getImageData(0, 0, largura, altura);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  // Um pixel a cada oito em cada eixo: a média não precisa de todos.
  for (let y = 0; y < altura; y += 8) {
    for (let x = 0; x < largura; x += 8) {
      const i = (y * largura + x) * 4;
      r += data[i] ?? 0;
      g += data[i + 1] ?? 0;
      b += data[i + 2] ?? 0;
      n += 1;
    }
  }
  if (n === 0) return "rgb(40 40 40)";
  const k = 0.72 / n;
  return `rgb(${Math.round(r * k)} ${Math.round(g * k)} ${Math.round(b * k)})`;
}

/**
 * A capa de um livro da estante: `undefined` enquanto gera, `null` se falhou.
 */
export function useCapaDoLivro(livroId: string): Capa | null | undefined {
  const [capa, setCapa] = useState<Capa | null | undefined>(undefined);

  useEffect(() => {
    let ativo = true;

    let promessa = capas.get(livroId);
    if (!promessa) {
      promessa = gerar(livroId).catch(() => null);
      capas.set(livroId, promessa);
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCapa(undefined);
    void promessa.then((pronta) => {
      if (ativo) setCapa(pronta);
    });

    return () => {
      ativo = false;
    };
  }, [livroId]);

  return capa;
}
