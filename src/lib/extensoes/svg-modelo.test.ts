import { describe, expect, it } from "vitest";

import { filtrarSvg, preencher, type NoBruto, type NoSvg } from "./svg-modelo";

const no = (tag: string, atributos: Record<string, string> = {}, filhos: Array<NoBruto | string> = []): NoBruto => ({
  tag,
  atributos,
  filhos,
});

const variaveis = { fracao: 0.5, atual: 5, maximo: 10, cor: "#f00", largura: 200, altura: 40 };

describe("filtrarSvg", () => {
  it("a raiz tem de ser svg", () => {
    expect(filtrarSvg(no("div"))).toBeNull();
    expect(filtrarSvg(no("svg"))?.tag).toBe("svg");
  });

  it("o que executa ou busca de fora não passa", () => {
    const arvore = filtrarSvg(
      no("svg", { onload: "alert(1)", viewBox: "0 0 10 10" }, [
        no("script", {}, ["alert(1)"]),
        no("foreignObject", {}, [no("div")]),
        no("image", { href: "https://x/y.png" }),
        no("use", { href: "#a" }),
        no("rect", { width: "10", style: "fill:red", onclick: "x()" }),
      ]),
    )!;

    expect(arvore.atributos).toEqual({ viewbox: "0 0 10 10" });
    expect(arvore.filhos).toEqual([{ tag: "rect", atributos: { width: "10" }, filhos: [] }]);
  });

  it("url() só para o próprio arquivo", () => {
    const arvore = filtrarSvg(
      no("svg", {}, [
        no("rect", { fill: "url(#grad)" }),
        no("rect", { fill: "url(https://x/a.svg#g)" }),
        no("rect", { fill: "javascript:alert(1)" }),
      ]),
    )!;

    expect(arvore.filhos.map((f) => (f as NoSvg).atributos.fill)).toEqual(["url(#grad)", undefined, undefined]);
  });

  it("animação só em opacity e transform", () => {
    const arvore = filtrarSvg(
      no("svg", {}, [
        no("animate", { attributeName: "opacity", values: "1;0;1", dur: "2s" }),
        no("animateTransform", { attributeName: "transform", type: "rotate" }),
        no("animate", { attributeName: "width", values: "0;10" }),
        no("animate", {}),
      ]),
    )!;

    expect(arvore.filhos.map((f) => (f as NoSvg).atributos.attributename)).toEqual(["opacity", "transform"]);
  });

  it("texto só em text e tspan, e nó desconhecido leva os filhos junto", () => {
    const arvore = filtrarSvg(
      no("svg", {}, [
        no("text", {}, ["{atual}/{maximo}"]),
        no("g", {}, ["solto", no("circle", { r: "1" })]),
        no("desconhecido", {}, [no("rect", { width: "1" })]),
      ]),
    )!;

    expect(arvore.filhos).toEqual([
      { tag: "text", atributos: {}, filhos: ["{atual}/{maximo}"] },
      { tag: "g", atributos: {}, filhos: [{ tag: "circle", atributos: { r: "1" }, filhos: [] }] },
    ]);
  });
});

describe("preencher", () => {
  const modelo = filtrarSvg(
    no("svg", { viewBox: "0 0 {largura} {altura}" }, [
      no("rect", { width: "{fracao * largura}", height: "{altura - 4}", fill: "{cor}" }),
      no("text", {}, ["{atual}/{maximo} ({fracao * 100}%)"]),
      no("rect", { width: "{invalida}", x: "{fracao *}" }),
    ]),
  )!;

  it("troca as variáveis e faz a conta, em atributo e em texto", () => {
    const cheio = preencher(modelo, variaveis);
    const [barra, texto] = cheio.filhos as NoSvg[];

    expect(cheio.atributos.viewbox).toBe("0 0 200 40");
    expect(barra.atributos).toEqual({ width: "100", height: "36", fill: "#f00" });
    expect(texto.filhos).toEqual(["5/10 (50%)"]);
  });

  it("o que não casa fica como está, para o autor ver", () => {
    const [, , quebrado] = preencher(modelo, variaveis).filhos as NoSvg[];

    expect(quebrado.atributos).toEqual({ width: "{invalida}", x: "{fracao *}" });
  });

  it("não é eval: nome que não é variável não resolve", () => {
    const perigoso = filtrarSvg(no("svg", {}, [no("text", {}, ["{constructor}", "{window}"])]))!;
    const [texto] = preencher(perigoso, variaveis).filhos as NoSvg[];

    expect(texto.filhos).toEqual(["{constructor}", "{window}"]);
  });
});
