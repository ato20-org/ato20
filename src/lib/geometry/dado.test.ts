import { describe, expect, it } from "vitest";

import {
  desenharDado,
  girar,
  orientacaoParaValor,
  quatDoEixo,
  SOLIDOS,
} from "@/lib/geometry/dado";
import { rotulosDoDado } from "@/types/dado";

// A mesma distância de câmera de `desenharDado`. Se mudar lá, muda aqui.
const DISTANCIA = 4;

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

describe("culling em perspectiva", () => {
  // Um punhado de orientações por sólido: alguns pousos e uns giros avulsos,
  // para pegar faces de esguelha — é onde o corte frouxo errava.
  const orientacoes = (faces: Parameters<typeof orientacaoParaValor>[0]) => [
    orientacaoParaValor(faces, rotulosDoDado(faces)[0]),
    quatDoEixo({ x: 1, y: 0, z: 0 }, 0.56),
    quatDoEixo({ x: 1, y: 0, z: 0 }, 1.1),
    quatDoEixo({ x: 0.5, y: 1, z: 0.3 }, 0.8),
    quatDoEixo({ x: 0.3, y: 0.4, z: 1 }, 2.0),
  ];

  it("devolve EXATAMENTE as faces à frente do plano vistas da câmera", () => {
    for (const faces of [4, 6, 8, 10, 12, 20, 100] as const) {
      const solido = SOLIDOS[faces];
      for (const q of orientacoes(faces)) {
        const desenho = desenharDado({
          faces,
          orientacao: q,
          cx: 0,
          cy: 0,
          raio: 40,
        });
        const visiveis = new Set(desenho.map((f) => Number(f.chave.slice(1))));

        solido.faces.forEach((face, i) => {
          const normal = girar(q, face.normal);
          // A câmera está em (0,0,DISTANCIA) no espaço do sólido; a face é
          // visível quando a câmera está do lado de fora do plano dela.
          const aFrente = DISTANCIA * normal.z > face.distanciaPlano;
          expect(visiveis.has(i)).toBe(aFrente);
        });
      }
    }
  });

  it("corta faces que o critério ortográfico deixava passar", () => {
    // A pose patológica do d20: inclinação de ~32° no eixo X. O corte por
    // `normal.z > 0` via cinco faces de trás a mais, que sem z-buffer pintavam
    // sobre a frente — a face que "ficava transparente".
    const q = quatDoEixo({ x: 1, y: 0, z: 0 }, 0.5586);
    const solido = SOLIDOS[20];
    const desenho = desenharDado({
      faces: 20,
      orientacao: q,
      cx: 0,
      cy: 0,
      raio: 40,
    });
    const ortografico = solido.faces.filter(
      (f) => girar(q, f.normal).z > 0.001,
    ).length;

    expect(ortografico).toBeGreaterThan(desenho.length);
  });
});
