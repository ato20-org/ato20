import { describe, expect, it } from "vitest";

import type { LiveState } from "@/lib/sync/channel";
import { DEFAULT_SESSION_VOLUME } from "@/types/scene";

import { quadroRecebido } from "./server-channel";

describe("quadroRecebido", () => {
  it("deixa passar os campos que não precisam de padrão", () => {
    // Os que a lista fixa perdia: a TV e o celular nunca os recebiam, embora
    // o Mestre os publicasse e o daemon os repassasse.
    const quadro = quadroRecebido({
      volumeTrilha: 0.3,
      volumeAmbiente: 0.5,
      volumeDisparo: 0.7,
    });

    expect(quadro.volumeTrilha).toBe(0.3);
    expect(quadro.volumeAmbiente).toBe(0.5);
    expect(quadro.volumeDisparo).toBe(0.7);
  });

  it("deixa passar o campo que esta versão nem conhece", () => {
    // É o caso que a lista fixa não tinha como cobrir: um campo que o Mestre
    // passou a publicar depois de esta tela ser escrita.
    const futuro = { campoNovo: [1, 2, 3] } as Partial<LiveState>;

    expect((quadroRecebido(futuro) as Record<string, unknown>).campoNovo).toEqual(
      [1, 2, 3],
    );
  });

  it("dá padrão ao que o quadro de uma versão anterior não traz", () => {
    const quadro = quadroRecebido({});

    expect(quadro).toMatchObject({
      scene: null,
      track: null,
      ambientes: [],
      disparos: [],
      portraits: [],
      volume: DEFAULT_SESSION_VOLUME,
      spotlight: null,
      rolagens: [],
    });
  });

  it("o padrão não passa por cima do que veio", () => {
    // Volume zero é escolha do mestre, e não ausência: o `??` o mantém.
    expect(quadroRecebido({ volume: 0 }).volume).toBe(0);
  });
});
