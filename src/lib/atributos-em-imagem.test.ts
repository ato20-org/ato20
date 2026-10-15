import { describe, expect, it } from "vitest";

import { estiloEscolhido, repartirAtributos } from "@/lib/atributos-em-imagem";
import type { EstiloDeAtributosPublicado } from "@/lib/sync/declarativo";

const lugar = (sigla: string) => ({ sigla, x: 0.5, y: 0.5, tamanho: 0.1 });

const ritual: EstiloDeAtributosPublicado = {
  titulo: "Ritual",
  imagem: "atributos/ritual.png",
  proporcao: 1,
  lugares: [lugar("AGI"), lugar("FOR")],
  plugin: "ordem-paranormal",
  versao: "0.2.0",
};

describe("estiloEscolhido", () => {
  it("acha o estilo da campanha entre os dos plugins ligados", () => {
    expect(
      estiloEscolhido({
        estiloDosAtributos: "ordem-paranormal/ritual",
        estilosDeAtributos: { "ordem-paranormal/ritual": ritual },
      }),
    ).toBe(ritual);
  });

  it("volta aos cartões sem escolha ou com o plugin desligado", () => {
    expect(estiloEscolhido({ estiloDosAtributos: "", estilosDeAtributos: {} })).toBeNull();
    expect(
      estiloEscolhido({ estiloDosAtributos: "ordem-paranormal/ritual", estilosDeAtributos: {} }),
    ).toBeNull();
  });
});

describe("repartirAtributos", () => {
  it("põe no lugar quem tem sigla na imagem, sem diferença de caixa", () => {
    const { noLugar, fora } = repartirAtributos(
      [{ sigla: "Agi" }, { sigla: "SOR" }, { sigla: "FOR" }],
      ritual.lugares,
    );

    expect(noLugar.map(({ atributo, lugar }) => [atributo.sigla, lugar.sigla])).toEqual([
      ["Agi", "AGI"],
      ["FOR", "FOR"],
    ]);
    expect(fora).toEqual([{ sigla: "SOR" }]);
  });

  it("não põe dois números no mesmo círculo", () => {
    const { noLugar, fora } = repartirAtributos([{ sigla: "AGI" }, { sigla: "agi" }], ritual.lugares);

    expect(noLugar).toHaveLength(1);
    expect(fora).toEqual([{ sigla: "agi" }]);
  });
});
