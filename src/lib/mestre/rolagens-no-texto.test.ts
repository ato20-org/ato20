import { describe, expect, it } from "vitest";

import { pedacosComRolagens, temRolagemNoTexto, textoSemChaves } from "@/lib/mestre/rolagens-no-texto";
import { descartadosDe, entraNaSoma, regraDosDescartados } from "@/types/dado";

describe("as rolagens entre chaves no texto da ficha", () => {
  it("separa o texto das rolagens que se leem", () => {
    const pedacos = pedacosComRolagens("Teste: {6d20>+45}\nDano: {2d10+50} Sangue");

    expect(pedacos.map((pedaco) => [pedaco.tipo, pedaco.texto])).toEqual([
      ["texto", "Teste: "],
      ["rolagem", "6d20>+45"],
      ["texto", "\nDano: "],
      ["rolagem", "2d10+50"],
      ["texto", " Sangue"],
    ]);
    const [, teste] = pedacos;
    expect(teste.tipo === "rolagem" && teste.expressao).toEqual({
      dados: [{ quantidade: 6, faces: 20, manter: "maior" }],
      modificador: 45,
    });
  });

  it("deixa como texto a chave que não é rolagem", () => {
    expect(pedacosComRolagens("{nada aqui} e {1d7}")).toEqual([{ tipo: "texto", texto: "{nada aqui} e {1d7}" }]);
    expect(temRolagemNoTexto("{nada aqui}")).toBe(false);
    expect(temRolagemNoTexto("rola {1d6}")).toBe(true);
  });

  it("tira as chaves para quem não tem o botão", () => {
    expect(textoSemChaves("Dano: {2d10+50} Sangue, {texto}")).toBe("Dano: 2d10+50 Sangue, {texto}");
  });
});

describe("os dados que ficam fora da soma", () => {
  it("descarta todos menos o maior, ou todos menos o menor", () => {
    expect(descartadosDe(20, [3, 17, 9], "maior")).toEqual([true, false, true]);
    expect(descartadosDe(20, [3, 17, 9], "menor")).toEqual([false, true, true]);
    // No empate, fica o primeiro; o zero do d10 vale dez.
    expect(descartadosDe(20, [17, 17], "maior")).toEqual([false, true]);
    expect(descartadosDe(10, [9, 0], "maior")).toEqual([true, false]);
    expect(descartadosDe(20, [3, 17], undefined)).toEqual([false, false]);
  });

  it("o descartado não entra na soma, e a notação diz a regra", () => {
    const dados = [
      { faces: 20 as const, valor: 3, descartado: true },
      { faces: 20 as const, valor: 17 },
    ];

    expect(dados.filter(entraNaSoma)).toEqual([{ faces: 20, valor: 17 }]);
    expect(regraDosDescartados(dados, 20)).toBe(">");
    expect(regraDosDescartados([{ faces: 20, valor: 3 }, { faces: 20, valor: 17, descartado: true }], 20)).toBe("<");
    expect(regraDosDescartados([{ faces: 6, valor: 3 }], 6)).toBe("");
  });
});

describe("as siglas da ficha dentro das chaves", () => {
  const ficha = [
    { sigla: "AGI", valor: 3 },
    { sigla: "FOR", valor: 4 },
  ];

  it("vira o botão com a conta resolvida, e guarda como foi escrita", () => {
    const [, ataque] = pedacosComRolagens("Ataque: {AGId20>+5}", ficha);

    expect(ataque).toEqual({
      tipo: "rolagem",
      texto: "AGId20>+5",
      expressao: { dados: [{ quantidade: 3, faces: 20, manter: "maior" }], modificador: 5 },
      siglas: [{ sigla: "AGI", valor: 3 }],
    });
  });

  it("a sigla que a ficha não tem deixa as chaves como texto", () => {
    expect(pedacosComRolagens("Pensar: {1d20+INT}", ficha)).toEqual([
      { tipo: "texto", texto: "Pensar: {1d20+INT}" },
    ]);
    expect(temRolagemNoTexto("{1d20+FOR}")).toBe(false);
    expect(temRolagemNoTexto("{1d20+FOR}", ficha)).toBe(true);
  });

  it("no celular, a conta com sigla perde as chaves como as outras", () => {
    expect(textoSemChaves("Ataque: {AGId20>+5} e {1d6}", ficha)).toBe("Ataque: AGId20>+5 e 1d6");
  });
});

describe("a sigla do atributo que é um dado, no texto", () => {
  it("vira o botão do dado dela", () => {
    const [, esquiva] = pedacosComRolagens("Esquiva: {AGI+1}", [{ sigla: "AGI", valor: 0, rolagem: "1d8" }]);

    expect(esquiva).toMatchObject({
      tipo: "rolagem",
      texto: "AGI+1",
      expressao: { dados: [{ quantidade: 1, faces: 8 }], modificador: 1 },
    });
  });
});
