import { describe, expect, it } from "vitest";

import {
  lerExpressaoDeRolagem,
  textoDaExpressao,
  textoDoModificador,
  type ExpressaoDeRolagem,
} from "@/lib/mestre/expressao-de-rolagem";

import casos from "./expressao-de-rolagem.casos.json";

function lida(texto: string): ExpressaoDeRolagem {
  const leitura = lerExpressaoDeRolagem(texto);
  if (!leitura.ok) throw new Error(`${texto}: ${leitura.erro}`);
  return leitura.expressao;
}

// Os casos moram num JSON que o `cargo test` também lê: o daemon tem o
// próprio leitor, para rolar o detalhe que o celular pede, e os dois têm de
// aceitar e recusar as mesmas coisas. Ver `serve/expressao.rs`.
describe("lerExpressaoDeRolagem", () => {
  it.each(casos.aceitas.map((caso) => [caso.texto, caso.dados, caso.modificador] as const))(
    "%j",
    (texto, dados, modificador) => {
      expect(lida(texto)).toEqual({
        dados: dados.map(([quantidade, faces]) => ({ quantidade, faces })),
        modificador,
      });
    },
  );

  it.each(casos.recusadas.map((caso) => [caso.texto, caso.erro] as const))(
    "%j é recusada por %s",
    (texto, erro) => {
      expect(lerExpressaoDeRolagem(texto)).toEqual({ ok: false, erro });
    },
  );
});

describe("textoDaExpressao", () => {
  it("escreve a forma curta", () => {
    expect(textoDaExpressao(lida("1d20+5-2*5/2"))).toBe("1d20");
    expect(textoDaExpressao(lida("2d6 + 1d4 + 3"))).toBe("2d6+1d4+3");
    expect(textoDaExpressao(lida("d20-2"))).toBe("1d20-2");
  });

  it("o modificador zero some", () => {
    expect(textoDoModificador(0)).toBe("");
    expect(textoDoModificador(5)).toBe("+5");
    expect(textoDoModificador(-2)).toBe("-2");
  });
});
