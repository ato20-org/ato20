import { describe, expect, it } from "vitest";

import { lerNotacaoDeDados } from "@/lib/mestre/notacao-de-dados";

describe("lerNotacaoDeDados", () => {
  it("lê quantidade e faces", () => {
    expect(lerNotacaoDeDados("2d6")).toEqual({ quantidade: 2, faces: 6 });
    expect(lerNotacaoDeDados("3D8")).toEqual({ quantidade: 3, faces: 8 });
  });

  it("sem quantidade é um dado", () => {
    expect(lerNotacaoDeDados("d20")).toEqual({ quantidade: 1, faces: 20 });
  });

  it("aceita o prefixo de quem digita em inglês ou em português", () => {
    expect(lerNotacaoDeDados("roll 2d6")).toEqual({ quantidade: 2, faces: 6 });
    expect(lerNotacaoDeDados("rolar 1d12")).toEqual({
      quantidade: 1,
      faces: 12,
    });
    expect(lerNotacaoDeDados("r d4")).toEqual({ quantidade: 1, faces: 4 });
  });

  it("recusa faces que o saquinho não tem", () => {
    expect(lerNotacaoDeDados("2d7")).toBeNull();
    expect(lerNotacaoDeDados("d100")).toBeNull();
  });

  it("recusa zero, excesso e o que não é notação", () => {
    expect(lerNotacaoDeDados("0d6")).toBeNull();
    expect(lerNotacaoDeDados("50d6")).toBeNull();
    expect(lerNotacaoDeDados("2d6+3")).toBeNull();
    expect(lerNotacaoDeDados("cenas")).toBeNull();
    expect(lerNotacaoDeDados("")).toBeNull();
  });
});
