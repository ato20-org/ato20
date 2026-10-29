import { describe, expect, it } from "vitest";

import { rolagemNoValor } from "./rolagem-no-valor";

describe("rolagemNoValor", () => {
  it("lê o dado do começo e devolve o resto", () => {
    const leitura = rolagemNoValor("1d8+2 cortante");

    expect(leitura?.texto).toBe("1d8+2");
    expect(leitura?.resto).toBe("cortante");
    expect(leitura?.expressao.modificador).toBe(2);
    expect(leitura?.expressao.dados).toEqual([{ quantidade: 1, faces: 8 }]);
  });

  it("acha o começo mais longo que lê, mesmo com letra de dado no resto", () => {
    const leitura = rolagemNoValor("1d6 de fogo");

    expect(leitura?.texto).toBe("1d6");
    expect(leitura?.resto).toBe("de fogo");
  });

  it("o valor que é só a expressão rola inteiro", () => {
    expect(rolagemNoValor("2d6+1d4+3")?.resto).toBe("");
  });

  it("número sem dado não rola: é peso, preço ou bônus", () => {
    expect(rolagemNoValor("2 kg")).toBeNull();
    expect(rolagemNoValor("+1")).toBeNull();
  });

  it("texto que não começa com dado não rola", () => {
    expect(rolagemNoValor("incomum")).toBeNull();
    expect(rolagemNoValor("")).toBeNull();
  });
});
