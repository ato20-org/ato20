import { describe, expect, it } from "vitest";

import {
  collectUsedAssetIds,
  countAssetUsage,
  type SomEmUso,
} from "@/lib/mestre/asset-usage";
import type { Ambiente, Scene, SessionTrack } from "@/types/scene";

const cena = {
  id: "c1",
  items: [{ id: "i", assetId: "imagem" }],
  fog: [],
} as unknown as Scene;

function ambiente(assetId: string): Ambiente {
  return { id: `a-${assetId}`, assetId, ganho: 1, tocando: true, startedAt: 0 };
}

function trilha(assetId: string): SessionTrack {
  return { assetId, loop: true, playing: true, ganho: 1, startedAt: 0 };
}

/**
 * O que estes testes guardam é a LIXEIRA.
 *
 * A conta decide se o botão de apagar fica habilitado, e cada camada de som que
 * ela esquecer vira um id apontando para um arquivo que não existe mais. O pior
 * caso é o pad: ele não está tocando, não aparece em lista nenhuma, e o mestre
 * só descobre que o som sumiu ao apertar o 7 no meio da cena.
 */
describe("countAssetUsage", () => {
  it("conta a trilha, como sempre contou", () => {
    const som: SomEmUso = {
      track: trilha("musica"),
    };

    expect(countAssetUsage([cena], "musica", som)).toBe(1);
  });

  it("conta o ambiente ACESO", () => {
    expect(
      countAssetUsage([cena], "chuva", { ambientes: [ambiente("chuva")] }),
    ).toBe(1);
  });

  it("conta o ambiente que a cena LEMBRA, mesmo apagado agora", () => {
    const som: SomEmUso = {
      ambientes: [],
      ambientesPorCena: { c1: [ambiente("lareira")] },
    };

    expect(countAssetUsage([cena], "lareira", som)).toBe(1);
  });

  it("conta o pad, que é o que ninguém vê", () => {
    const som: SomEmUso = {
      pads: [null, { assetId: "tiro", ganho: 1 }, null],
    };

    expect(countAssetUsage([cena], "tiro", som)).toBe(1);
  });

  it("conta a macro, que também aponta para um id", () => {
    const som: SomEmUso = {
      macros: [{ id: "m1", assetId: "tiro" }],
    };

    expect(countAssetUsage([cena], "tiro", som)).toBe(1);
  });

  it("soma os lugares quando o mesmo arquivo serve a vários", () => {
    const som: SomEmUso = {
      track: trilha("chuva"),
      ambientes: [ambiente("chuva")],
      ambientesPorCena: { c1: [ambiente("chuva")] },
      pads: [{ assetId: "chuva", ganho: 1 }],
      macros: [{ id: "m1", assetId: "chuva" }],
    };

    expect(countAssetUsage([cena], "chuva", som)).toBe(5);
  });

  it("sem som, conta só as cenas", () => {
    expect(countAssetUsage([cena], "imagem")).toBe(1);
    expect(countAssetUsage([cena], "chuva")).toBe(0);
  });
});

describe("collectUsedAssetIds", () => {
  it("recolhe toda camada de som, e não só a trilha", () => {
    const usados = collectUsedAssetIds([cena], [], {
      track: trilha("musica"),
      ambientes: [ambiente("chuva")],
      ambientesPorCena: { c1: [ambiente("lareira")] },
      pads: [{ assetId: "tiro", ganho: 1 }, null],
      macros: [{ id: "m1", assetId: "porta" }],
    });

    expect(usados).toEqual(
      new Set(["imagem", "musica", "chuva", "lareira", "tiro", "porta"]),
    );
  });

  it("som vazio não inventa id", () => {
    expect(collectUsedAssetIds([cena], [], {})).toEqual(new Set(["imagem"]));
  });
});
