import { describe, expect, it } from "vitest";

import {
  atributosDaConta,
  lerReguaDoTexto,
  MAX_METROS_DA_REGUA,
  numeroDaRegua,
  pedacosComRolagens,
  temReguaNoTexto,
  temRolagemNoTexto,
  textoSemChaves,
} from "@/lib/mestre/rolagens-no-texto";
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

describe("a menção da ficha com @ dentro das chaves", () => {
  const ficha = atributosDaConta(
    [
      { sigla: "AGI", valor: 3 },
      { sigla: "VIG", valor: 0, rolagem: "1d8" },
    ],
    [
      { rotulo: "Furtividade", valor: 5 },
      { rotulo: "Classe", valor: "Combatente" },
      { rotulo: "Nível", valor: " 2 " },
      { rotulo: "NEX", valor: "35%" },
      { rotulo: "Vida", valor: undefined },
      { rotulo: "AGI", valor: 9 },
    ],
  );

  it("o detalhe entra só com número, depois dos atributos", () => {
    expect(ficha).toEqual([
      { sigla: "AGI", valor: 3 },
      { sigla: "VIG", valor: 0, rolagem: "1d8" },
      { sigla: "Furtividade", valor: 5, soComArroba: true },
      { sigla: "Nível", valor: 2, soComArroba: true },
      { sigla: "AGI", valor: 9, soComArroba: true },
    ]);
  });

  it("@ lê o atributo e o detalhe, e a dica diz quanto valeram", () => {
    const [, ataque] = pedacosComRolagens("Ataque: {@AGId20>+@Furtividade}", ficha);

    expect(ataque).toEqual({
      tipo: "rolagem",
      texto: "@AGId20>+@Furtividade",
      expressao: { dados: [{ quantidade: 3, faces: 20, manter: "maior" }], modificador: 5 },
      siglas: [
        { sigla: "AGI", valor: 3 },
        { sigla: "Furtividade", valor: 5, soComArroba: true },
      ],
    });
  });

  it("o atributo que é um dado rola o dado dele com @ também", () => {
    expect(pedacosComRolagens("{@VIG+@nível}", ficha)[0]).toMatchObject({
      expressao: { dados: [{ quantidade: 1, faces: 8 }], modificador: 2 },
    });
  });

  it("o detalhe sem @, o de texto e o que não há deixam as chaves como texto", () => {
    for (const texto of ["{1d20+Furtividade}", "{1d20+@Classe}", "{1d20+@NEX}", "{1d20+@Vida}", "{1d20+@}"]) {
      expect(temRolagemNoTexto(texto, ficha)).toBe(false);
    }
  });

  it("no celular, a conta com @ perde as chaves como as outras", () => {
    expect(textoSemChaves("Furtivo: {1d20+@Furtividade}", ficha)).toBe("Furtivo: 1d20+@Furtividade");
  });
});

describe("a régua entre chaves", () => {
  it("m é a régua reta, e ° o círculo com o número no raio", () => {
    expect(lerReguaDoTexto("9m")).toEqual({ forma: "linha", metros: 9 });
    expect(lerReguaDoTexto("6°")).toEqual({ forma: "circulo", metros: 6 });
    // O ordinal do teclado brasileiro vale como o grau, e a unidade não
    // diferencia maiúscula.
    expect(lerReguaDoTexto("6º")).toEqual({ forma: "circulo", metros: 6 });
    expect(lerReguaDoTexto(" 9 M ")).toEqual({ forma: "linha", metros: 9 });
  });

  it("lê a vírgula e o ponto", () => {
    expect(lerReguaDoTexto("1,5m")).toEqual({ forma: "linha", metros: 1.5 });
    expect(lerReguaDoTexto("1.5°")).toEqual({ forma: "circulo", metros: 1.5 });
  });

  it("não é régua o que não é só número e unidade, nem o zero, nem o enorme", () => {
    for (const texto of ["m", "9", "9 metros", "9km", "-3m", "9m+1", "1d20m", "0m", "0,0°", "1,234m"]) {
      expect(lerReguaDoTexto(texto)).toBeNull();
    }
    expect(lerReguaDoTexto(`${MAX_METROS_DA_REGUA}m`)).not.toBeNull();
    expect(lerReguaDoTexto(`${MAX_METROS_DA_REGUA + 1}m`)).toBeNull();
  });

  it("vira um pedaço ao lado das rolagens, guardando como foi escrita", () => {
    const pedacos = pedacosComRolagens("Anda {9m}, explode {1,5°} e causa {2d6}");

    expect(pedacos.map((pedaco) => [pedaco.tipo, pedaco.texto])).toEqual([
      ["texto", "Anda "],
      ["regua", "9m"],
      ["texto", ", explode "],
      ["regua", "1,5°"],
      ["texto", " e causa "],
      ["rolagem", "2d6"],
    ]);
    const explode = pedacos[3]!;
    expect(explode).toEqual({ tipo: "regua", texto: "1,5°", forma: "circulo", metros: 1.5 });
    expect(explode.tipo === "regua" && numeroDaRegua(explode)).toBe("1,5");
  });

  it("a régua não é rolagem, e no celular perde as chaves", () => {
    expect(temReguaNoTexto("Deslocamento: {9m}")).toBe(true);
    expect(temRolagemNoTexto("Deslocamento: {9m}")).toBe(false);
    expect(temReguaNoTexto("{9 metros}")).toBe(false);
    expect(textoSemChaves("Deslocamento: {9m}, {nada}")).toBe("Deslocamento: 9m, {nada}");
  });
});

