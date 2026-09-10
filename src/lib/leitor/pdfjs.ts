"use client";

import type * as Pdfjs from "pdfjs-dist";

/**
 * O pdf.js, carregado sob demanda e configurado uma vez.
 *
 * Import dinâmico e não estático por duas razões que se somam: o módulo tem
 * peso real e nada além do leitor de Regras o usa — quem nunca abre um livro
 * não devia baixá-lo —, e ele toca `window` na avaliação, o que a exportação
 * estática não sobrevive. Ver `output: "export"` no `next.config.ts`.
 *
 * A promessa é guardada, e não o módulo: dois livros abertos ao mesmo tempo
 * dividem um carregamento só, e o `workerSrc` é escrito uma vez.
 */
let modulo: Promise<typeof Pdfjs> | null = null;

/** Onde o `scripts/copiar-pdfjs.mjs` deixa o runtime. */
const BASE = "/pdfjs";

export function pdfjs(): Promise<typeof Pdfjs> {
  modulo ??= import("pdfjs-dist").then((mod) => {
    // O worker é onde o documento é lido de verdade. Sem ele o pdf.js decodifica
    // na thread da interface, e uma página de mapa vetorial trava o palco
    // inteiro enquanto desenha.
    mod.GlobalWorkerOptions.workerSrc = `${BASE}/pdf.worker.min.mjs`;

    return mod;
  });

  return modulo;
}

/**
 * O que o pdf.js busca por URL enquanto trabalha.
 *
 * Servido do próprio bundle, nunca de CDN: o ATO20 roda numa mesa sem internet,
 * e um manual que perde as fontes ou os cmaps não desenha errado — desenha
 * caixas vazias no lugar do texto, no meio da sessão.
 *
 * O `wasmUrl` é o dos decodificadores de imagem (JBIG2, OpenJPEG, QCMS), que é
 * o caminho de todo manual ESCANEADO.
 */
export const RUNTIME = {
  cMapUrl: `${BASE}/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${BASE}/standard_fonts/`,
  wasmUrl: `${BASE}/wasm/`,
} as const;
