import { describe, expect, it } from "vitest";

import { aurasDosPlugins } from "@/lib/extensoes/auras";
import type { Extensao } from "@/lib/extensoes/manifesto";

/** Um plugin só com auras, ligado ou não. */
function plugin(id: string, habilitada: boolean, auras: NonNullable<Extensao["contribui"]["auras"]>): Extensao {
  return {
    id,
    nome: id === "ordem-paranormal" ? "Ordem Paranormal" : id,
    versao: "1.0.0",
    apiVersao: 12,
    habilitada,
    contribui: { paineis: [], comandos: [], ferramentas: [], camadas: [], auras },
  } as unknown as Extensao;
}

describe("as auras dos plugins", () => {
  it("indexa pela chave plugin/id, com o plugin junto", () => {
    const auras = aurasDosPlugins([
      plugin("ordem-paranormal", true, [
        { id: "sangue", titulo: "Sangue", cor: "#b3121f", luz: { efeito: "fluxo", cores: ["#dc2626"] } },
      ]),
    ]);

    expect(auras["ordem-paranormal/sangue"]).toMatchObject({
      chave: "ordem-paranormal/sangue",
      extensao: "ordem-paranormal",
      nomeDoPlugin: "Ordem Paranormal",
      cor: "#b3121f",
    });
  });

  it("deixa de fora as do plugin desligado", () => {
    const auras = aurasDosPlugins([
      plugin("ordem-paranormal", false, [{ id: "sangue", titulo: "Sangue", cor: "#b3121f" }]),
      plugin("dnd", true, [{ id: "lendario", titulo: "Lendário", cor: "#d4a72c" }]),
    ]);

    expect(Object.keys(auras)).toEqual(["dnd/lendario"]);
  });
});
