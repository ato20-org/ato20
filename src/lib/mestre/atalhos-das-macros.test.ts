import { beforeEach, describe, expect, it, vi } from "vitest";

import { atalhos, donoDaTecla } from "@/lib/mestre/atalhos";
import { useAssetsStore } from "@/lib/store/use-assets-store";
import { useTrackStore } from "@/lib/store/use-track-store";
import type { AssetMeta, Macro } from "@/types/scene";

/** O evento de teclado como o listener o recebe. Só os campos que a tabela lê. */
function tecla(
  code: string,
  key: string,
  mods: Partial<Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "altKey" | "shiftKey">> = {},
): KeyboardEvent {
  return {
    code,
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    ...mods,
  } as KeyboardEvent;
}

function som(id: string, name: string): AssetMeta {
  return { id, name, kind: "audio", tipoDeSom: "disparo" } as AssetMeta;
}

function comMacros(macros: Macro[]) {
  useTrackStore.setState({ macros });
}

describe("a tecla da macro na tabela de atalhos", () => {
  beforeEach(() => {
    useAssetsStore.setState({
      audio: {
        assets: [som("trovao", "Trovão"), som("chuva", "Chuva forte")],
        pedido: 1,
        emVoo: false,
      },
    });
    comMacros([]);
  });

  it("a tecla do app tem dono, e o dono diz o que ela faz", () => {
    // O `F` é o enquadrar: gravá-lo numa macro deixaria o som mudo para sempre.
    expect(donoDaTecla(tecla("KeyF", "f"), "m1")).not.toBeNull();
  });

  it("a tecla livre não tem dono", () => {
    expect(donoDaTecla(tecla("Digit1", "1", { altKey: true }), "m1")).toBeNull();
  });

  it("a macro com tecla entra na tabela, escrita como se lê, e aciona a macro", () => {
    comMacros([{ id: "m1", assetId: "trovao", tecla: "Alt+Digit1" }]);
    const acionar = vi.fn();
    useTrackStore.setState({ acionarMacro: acionar });

    const evento = tecla("Digit1", "1", { altKey: true });
    const atalho = atalhos().find(({ combina }) => combina(evento));

    expect(atalho?.tecla).toBe("Alt+1");
    expect(atalho?.rotulo).toContain("Trovão");
    expect(atalho?.grupo).toBe("Som");

    atalho?.executar(evento);
    expect(acionar).toHaveBeenCalledWith("m1");
  });

  it("macro sem tecla não entra na tabela", () => {
    comMacros([{ id: "m1", assetId: "trovao" }]);

    expect(atalhos().some((atalho) => atalho.rotulo.includes("Trovão"))).toBe(false);
  });

  it("a tecla de outra macro tem dono; a da própria macro, não", () => {
    comMacros([
      { id: "m1", assetId: "trovao", tecla: "Alt+Digit1" },
      { id: "m2", assetId: "chuva" },
    ]);
    const evento = tecla("Digit1", "1", { altKey: true });

    expect(donoDaTecla(evento, "m2")).toContain("Trovão");
    // Regravar a própria tecla não é conflito.
    expect(donoDaTecla(evento, "m1")).toBeNull();
  });

  it("a fábrica vem antes da macro: nem uma tecla gravada por fora rouba o F", () => {
    // Um `trilha.json` editado à mão, ou de uma versão que deixasse passar.
    comMacros([{ id: "m1", assetId: "trovao", tecla: "KeyF" }]);

    const dono = atalhos().find(({ combina }) => combina(tecla("KeyF", "f")));
    expect(dono?.rotulo).not.toContain("Trovão");
  });
});
