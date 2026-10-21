import { describe, expect, it } from "vitest";

import {
  facesParaDesenhar,
  lerValorDoAtributo,
  passoDoDado,
  textoDoDado,
  textoDoValor,
} from "@/lib/mestre/valor-do-atributo";
import { MAX_VALOR_ATRIBUTO } from "@/types/character";

describe("o que se digita no valor do atributo", () => {
  it("sem d, é o número de sempre, dentro do teto", () => {
    expect(lerValorDoAtributo("3")).toEqual({ tipo: "numero", valor: 3 });
    expect(lerValorDoAtributo(" -1 ")).toEqual({ tipo: "numero", valor: -1 });
    expect(lerValorDoAtributo("4abc")).toEqual({ tipo: "numero", valor: 4 });
    expect(lerValorDoAtributo("5000")).toEqual({ tipo: "numero", valor: MAX_VALOR_ATRIBUTO });
  });

  it("com d, é o dado na forma que se grava", () => {
    expect(lerValorDoAtributo("d8")).toEqual({ tipo: "dado", rolagem: "1d8" });
    expect(lerValorDoAtributo("1d12+1")).toEqual({ tipo: "dado", rolagem: "1d12+1" });
    expect(lerValorDoAtributo("2d20>")).toEqual({ tipo: "dado", rolagem: "2d20>" });
  });

  it("aceita as chaves de quem já escreve rolagem no texto", () => {
    expect(lerValorDoAtributo("{1d4}")).toEqual({ tipo: "dado", rolagem: "1d4" });
  });

  it("o que não é número nem dado não serve", () => {
    expect(lerValorDoAtributo("")).toBeNull();
    expect(lerValorDoAtributo("abc")).toBeNull();
    expect(lerValorDoAtributo("d7")).toBeNull();
    expect(lerValorDoAtributo("{1d4")).toBeNull();
  });
});

describe("o dado como a ficha o mostra", () => {
  it("sem o 1 do dado sozinho", () => {
    expect(textoDoDado("1d8")).toBe("d8");
    expect(textoDoDado("1d12+1")).toBe("d12+1");
    expect(textoDoDado("2d6")).toBe("2d6");
  });

  it("o valor é o número, ou o dado quando há", () => {
    expect(textoDoValor({ valor: 3 })).toBe("3");
    expect(textoDoValor({ valor: 3, rolagem: "1d8" })).toBe("d8");
  });
});

describe("as setas sobem e descem o dado", () => {
  it("um degrau por vez, sem passar das pontas", () => {
    expect(passoDoDado("d6", 1)).toBe("d8");
    expect(passoDoDado("d8", -1)).toBe("d6");
    expect(passoDoDado("d4", -1)).toBe("d4");
    expect(passoDoDado("d20", 1)).toBe("d20");
    expect(passoDoDado("d12+1", 1)).toBe("d20+1");
  });

  it("número, ou mais de um dado, fica para a conta do número", () => {
    expect(passoDoDado("3", 1)).toBeNull();
    expect(passoDoDado("2d6", 1)).toBeNull();
    expect(passoDoDado("d100", 1)).toBeNull();
  });
});

describe("o desenho do dado do atributo", () => {
  it("um por tipo de dado, e não um por dado", () => {
    expect(facesParaDesenhar("8d4")).toEqual([4]);
    expect(facesParaDesenhar("2d6+1d4+1")).toEqual([6, 4]);
    expect(facesParaDesenhar("1d6+1d6")).toEqual([6]);
  });

  it("no máximo três, e nada para o que não se lê", () => {
    expect(facesParaDesenhar("1d4+1d6+1d8+1d10")).toEqual([4, 6, 8]);
    expect(facesParaDesenhar("abc")).toEqual([]);
  });
});
