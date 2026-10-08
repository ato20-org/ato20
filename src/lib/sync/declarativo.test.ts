import { afterEach, describe, expect, it, vi } from "vitest";

import { buscarDeclarativo } from "./declarativo";

function responder(corpo: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(corpo) }),
  );
}

describe("buscarDeclarativo", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lê os efeitos e larga os de casca torta", async () => {
    responder({
      versao: 3,
      estilos: {},
      plugins: ["ordem"],
      efeitos: {
        "ordem/sangrando": { id: "ordem/sangrando", titulo: "Sangrando", figura: { tinta: 0.6 } },
        "ordem/sem-titulo": { id: "ordem/sem-titulo", figura: { halo: true } },
        "../fora": { id: "../fora", titulo: "Fora" },
      },
    });

    const lido = await buscarDeclarativo("ABC");

    expect(Object.keys(lido.efeitos)).toEqual(["ordem/sangrando"]);
  });

  it("declarativo de antes dos efeitos chega com a lista vazia", async () => {
    responder({ versao: 1, estilos: {}, plugins: [] });

    expect((await buscarDeclarativo("ABC")).efeitos).toEqual({});
  });
});
