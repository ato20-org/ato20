import { describe, expect, it } from "vitest";

import {
  quadroDaSequencia,
  recorteDaBarra,
  reservaDoEstilo,
  urlDaImagemDoEstilo,
} from "@/lib/extensoes/medidor-em-camadas";
import type { ConteudoDoMedidor } from "@/lib/extensoes/manifesto";

describe("o endereço da imagem do estilo", () => {
  it("no Mestre, pelo protocolo da extensão", () => {
    expect(urlDaImagemDoEstilo("ordem", "m/vida.webp", "1.2.0", true)).toBe(
      "ato20-ext://localhost/ordem/m/vida.webp?v=1.2.0",
    );
  });

  it("na mesa, pelo daemon, relativo e com cada pedaço escapado", () => {
    expect(urlDaImagemDoEstilo("ordem", "m/vida cheia.webp", "1.2.0", false)).toBe(
      "/plugin/ordem/m/vida%20cheia.webp?v=1.2.0",
    );
    // Aspas e parênteses escapados: o endereço vai dentro de `url("...")`.
    expect(urlDaImagemDoEstilo("ordem", 'a"b.png', "1", false)).toBe("/plugin/ordem/a%22b.png?v=1");
  });
});

describe("o recorte da barra", () => {
  it("revela a fração para o lado pedido", () => {
    expect(recorteDaBarra(0.25)).toBe("inset(0 75% 0 0)");
    expect(recorteDaBarra(0.25, "esquerda")).toBe("inset(0 0 0 75%)");
    expect(recorteDaBarra(0.25, "cima")).toBe("inset(75% 0 0 0)");
    expect(recorteDaBarra(0.25, "baixo")).toBe("inset(0 0 75% 0)");
  });

  it("não passa do cheio nem do vazio", () => {
    expect(recorteDaBarra(1.5)).toBe("inset(0 0% 0 0)");
    expect(recorteDaBarra(-1)).toBe("inset(0 100% 0 0)");
  });
});

describe("o quadro da sequência", () => {
  it("o primeiro só no zero", () => {
    expect(quadroDaSequencia(0, 5)).toBe(0);
    expect(quadroDaSequencia(1 / 20, 5)).toBe(1);
  });

  it("divide o resto em faixas iguais, com a borda no quadro de baixo", () => {
    // Cinco quadros: o vazio e quatro faixas de um quarto.
    expect(quadroDaSequencia(0.25, 5)).toBe(1);
    expect(quadroDaSequencia(0.26, 5)).toBe(2);
    expect(quadroDaSequencia(0.5, 5)).toBe(2);
    expect(quadroDaSequencia(0.75, 5)).toBe(3);
    expect(quadroDaSequencia(1, 5)).toBe(4);
    // `0.6 * 5` não dá 3 em ponto flutuante.
    expect(quadroDaSequencia(0.6, 6)).toBe(3);
  });

  it("dois quadros são vazio e não vazio", () => {
    expect(quadroDaSequencia(0, 2)).toBe(0);
    expect(quadroDaSequencia(0.01, 2)).toBe(1);
    expect(quadroDaSequencia(1, 2)).toBe(1);
  });
});

describe("a reserva de fábrica do estilo", () => {
  const camadas = (conteudo: ConteudoDoMedidor) =>
    ({
      tipo: "camadas",
      titulo: "X",
      altura: 0.2,
      plugin: "p",
      versao: "1",
      camadas: { conteudo },
    }) as const;

  it("acompanha o que o estilo é", () => {
    expect(reservaDoEstilo(camadas({ modo: "barra" }))).toBe("barra");
    expect(reservaDoEstilo(camadas({ modo: "pontos" }))).toBe("pontos");
    expect(reservaDoEstilo(camadas({ modo: "sequencia", quadros: ["a", "b"] }))).toBe("barra");
  });

  it("não mexe na reserva de um SVG", () => {
    expect(
      reservaDoEstilo({
        tipo: "svg",
        titulo: "X",
        altura: 0.2,
        modelo: { tag: "svg", atributos: {}, filhos: [] },
      }),
    ).toBeNull();
  });
});
