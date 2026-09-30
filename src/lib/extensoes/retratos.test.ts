import { afterEach, describe, expect, it } from "vitest";

import { useCharactersStore } from "@/lib/store/use-characters-store";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import type { Personagem } from "@/types/character";
import { LAYOUT_PADRAO } from "@/types/scene";

import { retratoDoPersonagem } from "./retratos";

const medidor = (id: string, escondido: boolean) => ({
  id,
  nome: id,
  cor: "#ef4444",
  estilo: "barra" as const,
  atual: 5,
  maximo: 10,
  escondido,
});

function comFicha(ficha: Partial<Personagem>) {
  useCharactersStore.setState({
    personagens: [{ id: "ana", nome: "Ana", ...ficha } as Personagem],
  });
}

afterEach(() => {
  useCharactersStore.setState({ personagens: null });
  usePortraitStore.setState({ portraits: [], layout: LAYOUT_PADRAO });
});

describe("retratoDoPersonagem", () => {
  it("sai com o corte da mesa: sem medidor escondido, e sem nome com a peça desligada", () => {
    comFicha({ retrato: "img", medidores: [medidor("vida", false), medidor("corrupcao", true)] });

    const retrato = retratoDoPersonagem("ana");

    expect(retrato?.medidores?.map((m) => m.id)).toEqual(["vida"]);
    // O padrão da sessão desliga o nome: o do PNJ não atravessa a rede.
    expect(retrato?.nome).toBeUndefined();
    expect(retrato?.visible).toBe(true);
  });

  it("o nome vem quando o mestre liga a peça na sessão", () => {
    comFicha({ retrato: "img" });
    usePortraitStore.setState({ layout: { ...LAYOUT_PADRAO, nome: true } });

    expect(retratoDoPersonagem("ana")?.nome).toBe("Ana");
  });

  it("sem Retrato na ficha, não há retrato", () => {
    comFicha({});

    expect(retratoDoPersonagem("ana")).toBeNull();
    expect(retratoDoPersonagem("ninguem")).toBeNull();
  });

  it("usa o registro guardado quando o retrato já foi armado", () => {
    comFicha({ retrato: "img" });
    usePortraitStore.setState({
      portraits: [
        {
          id: "ana",
          personagemId: "ana",
          assetId: "velho",
          x: 0.5,
          y: 0.5,
          width: 0.2,
          height: 0.4,
          visible: false,
          layout: { medidores: false },
        },
      ],
    });

    const retrato = retratoDoPersonagem("ana");

    // A imagem vem da ficha, e não do registro; a geometria e o layout, do registro.
    expect(retrato).toMatchObject({ assetId: "img", width: 0.2, visible: true });
    expect(retrato?.layout?.medidores).toBe(false);
  });
});
