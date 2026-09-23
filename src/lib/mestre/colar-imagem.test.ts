import { describe, expect, it } from "vitest";

import {
  enderecoDeImagem,
  enderecoDoHtml,
  nomeDeColagem,
} from "@/lib/mestre/colar-imagem";

describe("enderecoDeImagem", () => {
  it("aceita endereço http(s) que termina em imagem", () => {
    expect(enderecoDeImagem("https://exemplo.com/mapa.png")?.pathname).toBe(
      "/mapa.png",
    );
    expect(enderecoDeImagem("  http://exemplo.com/a/b/token.webp  ")).not.toBe(
      null,
    );
    // A busca sobrevive ao que vem depois do caminho.
    expect(enderecoDeImagem("https://cdn.exemplo.com/x.jpg?v=2")).not.toBe(null);
  });

  it("recusa o que não é endereço de imagem", () => {
    // Página comum: continua sendo texto, e vira nota no quadro. Sem isto,
    // colar um link deixaria de criar nota e viraria uma ida à rede inútil.
    expect(enderecoDeImagem("https://exemplo.com/artigo")).toBe(null);
    expect(enderecoDeImagem("só um texto qualquer")).toBe(null);
    expect(enderecoDeImagem("")).toBe(null);
  });

  it("recusa esquema que não é http nem https", () => {
    // `file:` faria um Ctrl+V ler o disco da máquina.
    expect(enderecoDeImagem("file:///home/alguem/mapa.png")).toBe(null);
    expect(enderecoDeImagem("data:image/png;base64,AAAA")).toBe(null);
  });
});

describe("nomeDeColagem", () => {
  it("põe a extensão do tipo, porque é ela que o Rust classifica", () => {
    // Sem extensão a imagem voltaria recusada com "o acervo aceita imagem e
    // som", que é a mensagem menos útil possível para uma imagem.
    expect(nomeDeColagem("image/png")).toMatch(/\.png$/);
    expect(nomeDeColagem("image/jpeg")).toMatch(/\.jpeg$/);
    expect(nomeDeColagem("image/webp")).toMatch(/\.webp$/);
    // O subtipo inteiro não é extensão de nada; o `+` é aparado.
    expect(nomeDeColagem("image/svg+xml")).toMatch(/\.svg$/);
  });

  it("cai em png quando não reconhece o tipo", () => {
    expect(nomeDeColagem("image/vnd.coisa-nova")).toMatch(/\.png$/);
    expect(nomeDeColagem("")).toMatch(/\.png$/);
  });

  it("carimba a hora, para duas colagens não virarem a mesma linha", () => {
    expect(nomeDeColagem("image/png")).toMatch(
      /^Colado \d{4}-\d{2}-\d{2} \d{2}h\d{2}\.png$/,
    );
  });
});

describe("enderecoDoHtml", () => {
  it("acha o src do img, sem exigir extensão no caminho", () => {
    // O caso que motivou tudo: miniatura do Google, sem extensão nenhuma. É
    // imagem por declaração de quem copiou, não por palpite sobre o endereço.
    const html =
      '<meta charset="utf-8"><img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ABC123" alt="gnu">';

    expect(enderecoDoHtml(html)?.href).toContain("q=tbn:ABC123");
  });

  it("aceita aspas simples, atributos antes do src e maiúsculas", () => {
    expect(
      enderecoDoHtml(`<IMG class='x' data-a="1" SRC='https://e.com/a.png'>`)
        ?.pathname,
    ).toBe("/a.png");
  });

  it("aceita imagem embutida em data:", () => {
    const html = '<img src="data:image/png;base64,iVBORw0KGgo=">';

    expect(enderecoDoHtml(html)?.protocol).toBe("data:");
  });

  it("recusa o que não é imagem", () => {
    // `data:` de outro tipo, esquema estranho, src relativo e html sem img.
    expect(enderecoDoHtml('<img src="data:text/html,<b>oi</b>">')).toBe(null);
    expect(enderecoDoHtml('<img src="javascript:alert(1)">')).toBe(null);
    expect(enderecoDoHtml('<img src="/local/sem-origem.png">')).toBe(null);
    expect(enderecoDoHtml("<p>só texto</p>")).toBe(null);
    expect(enderecoDoHtml("")).toBe(null);
  });
});
