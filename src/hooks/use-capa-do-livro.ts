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
 * `null` guardado = já tentou e falhou; a caixa desenha sem imagem e não tenta
 * de novo a cada render.
 */
const capas = new Map<string, Promise<Capa | null>>();

/**
 * A capa pronta, guardada entre aberturas do aplicativo.
 *
 * Gerar custa abrir o documento pelo daemon e desenhar a primeira página: num
 * manual de 90 MB isso passa de um segundo, e a porta abria com uma caixa
 * cinza que só depois virava capa -- o livro grande "chegava atrasado" a
 * cada abertura. A capa não muda: o arquivo é copiado para a estante e o id é
 * dele. Então o JPEG de 192 px, uns 20 KB, fica no `localStorage`, e da
 * segunda abertura em diante o livro nasce com a capa, sem passar pelo
 * estado de carregando.
 *
 * `localStorage` e não uma rota do daemon: são uns poucos livros de uns
 * poucos KB, e uma gravação no disco pelo Rust seria comando e rota para o
 * que um `setItem` resolve. Toda leitura e escrita em `try/catch`: modo
 * privado, storage cheio ou bloqueado só voltam ao caminho de gerar.
 */
const PREFIXO = "ato20.capa-do-livro.";

function lerGuardada(livroId: string): Capa | null {
  try {
    const bruto = window.localStorage.getItem(PREFIXO + livroId);
    if (!bruto) return null;

    const capa = JSON.parse(bruto) as Partial<Capa>;
    if (
      typeof capa.url !== "string" ||
      typeof capa.proporcao !== "number" ||
      typeof capa.cor !== "string"
    )
      return null;

    return { url: capa.url, proporcao: capa.proporcao, cor: capa.cor };
  } catch {
    return null;
  }
}

function guardar(livroId: string, capa: Capa): void {
  try {
    window.localStorage.setItem(PREFIXO + livroId, JSON.stringify(capa));
  } catch {
    // Sem espaço ou sem storage: a próxima abertura gera de novo, como antes.
  }
}

/** Some com a capa guardada quando o livro sai da estante. */
export function esquecerCapa(livroId: string): void {
  capas.delete(livroId);
  try {
    window.localStorage.removeItem(PREFIXO + livroId);
  } catch {
    // Nada a apagar.
  }
}

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
  // A guardada entra já no primeiro render: é o que faz o livro nascer com a
  // capa, sem um quadro de caixa vazia antes.
  const [capa, setCapa] = useState<Capa | null | undefined>(() =>
    lerGuardada(livroId) ?? undefined,
  );

  useEffect(() => {
    let ativo = true;

    const guardada = lerGuardada(livroId);
    if (guardada) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCapa(guardada);
      return;
    }

    let promessa = capas.get(livroId);
    if (!promessa) {
      promessa = gerar(livroId)
        .then((pronta) => {
          if (pronta) guardar(livroId, pronta);
          return pronta;
        })
        .catch(() => null);
      capas.set(livroId, promessa);
    }

     
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
