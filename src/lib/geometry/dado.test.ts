import { describe, expect, it } from "vitest";

import {
  desenharDado,
  orientacaoParaValor,
  SOLIDOS,
} from "@/lib/geometry/dado";
import { rotulosDoDado } from "@/types/dado";

describe("d%", () => {
  it("é o trapezoedro do d10 com as dezenas gravadas", () => {
    const solido = SOLIDOS[100];
    expect(solido.faces).toHaveLength(10);
    expect(
      solido.faces.map((face) => face.numero).sort((a, b) => a! - b!),
    ).toEqual(rotulosDoDado(100));
  });

  it("grava 00 na face do zero", () => {
    const desenho = desenharDado({
      faces: 100,
      orientacao: orientacaoParaValor(100, 0),
      cx: 0,
      cy: 0,
      raio: 40,
    });
    const textos = desenho.flatMap((face) => face.numeros.map((n) => n.texto));
    expect(textos).toContain("00");
  });
});

describe("moeda", () => {
  it("tem duas faces com texto e o resto é o canto", () => {
    const solido = SOLIDOS[2];
    const comTexto = solido.faces.filter((face) => face.numero !== undefined);
    expect(comTexto).toHaveLength(2);
    expect(solido.faces.length).toBeGreaterThan(20);
  });

  it("mostra CARA para o um e COROA para o dois", () => {
    for (const [valor, palavra] of [
      [1, "CARA"],
      [2, "COROA"],
    ] as const) {
      const desenho = desenharDado({
        faces: 2,
        orientacao: orientacaoParaValor(2, valor),
        cx: 0,
        cy: 0,
        raio: 40,
      });
      const textos = desenho.flatMap((face) =>
        face.numeros.map((n) => n.texto),
      );
      expect(textos).toEqual([palavra]);
    }
  });
});

describe("sortearValor", () => {
  it("só devolve faces que o dado tem", async () => {
    const { sortearValor, rotulosDoDado } = await import("@/types/dado");
    for (const faces of [100, 2, 10] as const) {
      const rotulos = rotulosDoDado(faces);
      for (let i = 0; i < 200; i++) {
        expect(rotulos).toContain(sortearValor(faces));
      }
    }
  });
});
