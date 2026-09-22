import { ALTURA_DA_LINHA } from "@/lib/mestre/ligacoes";
import type { Texto } from "@/types/scene";

/**
 * A caixa de um texto solto, medida com o CANVAS e não com o layout.
 *
 * A caixa medida entra na cena (ver `medirTexto`), e dela saem o gizmo, a
 * ponta da seta e os limites do conteúdo. Ela era tirada do `offsetWidth` do
 * `<div>` desenhado, e isso a amarrava à ampliação do palco: o plano alterna
 * entre `zoom` e `transform` conforme a câmera para ou anda, a fonte é
 * especificada com um número diferente em cada forma, e o motor rasteriza o
 * glifo com hinting próprio de cada tamanho. O resultado, medido na webview:
 * a mesma frase ia de 91×19 a 92×20,3 conforme o zoom, e cada medida nova
 * GRAVAVA na cena -- board novo, todo mundo re-renderizando, o gizmo e as
 * pontas das setas andando, e a mesa recebendo cena nova por causa de um
 * gesto que não mudou conteúdo nenhum.
 *
 * `measureText` não tem layout, não tem zoom e não tem observador: a mesma
 * frase com a mesma fonte devolve o mesmo número em qualquer ampliação. É a
 * régua que a cena precisa, porque o que ela guarda é uma medida em unidade de
 * CENA -- e unidade de cena não muda quando a câmera anda.
 *
 * A altura continua sendo linhas × tamanho × `ALTURA_DA_LINHA`, que é a conta
 * do próprio CSS (`line-height: 1.25`) e a que `caixaRetaDoTexto` estima.
 */

/** Um canvas só para o processo inteiro: medir não desenha nada. */
let contexto: CanvasRenderingContext2D | null = null;

function pincel(): CanvasRenderingContext2D | null {
  if (contexto) return contexto;
  if (typeof document === "undefined") return null;
  contexto = document.createElement("canvas").getContext("2d");
  return contexto;
}

/**
 * A folga horizontal do marca-texto, em fração do tamanho da fonte. O mesmo
 * `0.15em` de cada lado que `tipografiaDoTexto` aplica como `padding`.
 */
const FOLGA_DO_FUNDO = 0.15;

export function medidaDoTexto(
  texto: Texto,
  /** A família como o CSS resolveu — lida do elemento desenhado, uma vez. */
  familia: string,
): { largura: number; altura: number } | null {
  const ctx = pincel();
  if (!ctx) return null;

  const linhas = texto.texto.split("\n");
  const altura = Math.max(1, linhas.length) * texto.tamanho * ALTURA_DA_LINHA;

  ctx.font = [
    texto.italico ? "italic" : "normal",
    texto.negrito ? "700" : "400",
    `${texto.tamanho}px`,
    familia,
  ].join(" ");

  let maior = 0;
  for (const linha of linhas) maior = Math.max(maior, ctx.measureText(linha).width);

  const folga = texto.fundo ? texto.tamanho * FOLGA_DO_FUNDO * 2 : 0;

  return {
    largura: Math.round((maior + folga) * 10) / 10,
    altura: Math.round(altura * 10) / 10,
  };
}
