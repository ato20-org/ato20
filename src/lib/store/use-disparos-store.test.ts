import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { vidaDoDisparo } from "@/lib/disparo-de-efeito";
import {
  DISPAROS_NO_AR,
  FOLGA_DO_DISPARO_MS,
  useDisparosStore,
} from "@/lib/store/use-disparos-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import type { EfeitoDisparado } from "@/types/efeito-disparado";

function tiro(id: string): EfeitoDisparado {
  return {
    id,
    cenaId: "c",
    efeito: "campanha/fogo",
    cor: "#ff0000",
    forma: "linha",
    de: { x: 0, y: 0 },
    para: { x: 100, y: 0 },
    tamanho: 50,
    impacto: 100,
    voo: 300,
    quando: 0,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  useDisparosStore.setState({ ativos: [], mira: null });
  useToolStore.setState({ tool: "select" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDisparosStore", () => {
  it("o mesmo tiro duas vezes é um tiro só", () => {
    const { registrar } = useDisparosStore.getState();
    registrar(tiro("a"));
    registrar(tiro("a"));

    expect(useDisparosStore.getState().ativos).toHaveLength(1);
  });

  it("o tiro sai sozinho quando acaba, com a folga", () => {
    useDisparosStore.getState().registrar(tiro("a"));
    const prazo = vidaDoDisparo(tiro("a")) + FOLGA_DO_DISPARO_MS;

    vi.advanceTimersByTime(prazo - 1);
    expect(useDisparosStore.getState().ativos).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(useDisparosStore.getState().ativos).toHaveLength(0);
  });

  it("um teto de tiros no ar, o mais velho sai", () => {
    const { registrar } = useDisparosStore.getState();
    for (let i = 0; i <= DISPAROS_NO_AR; i++) registrar(tiro(`t${i}`));

    const ativos = useDisparosStore.getState().ativos;
    expect(ativos).toHaveLength(DISPAROS_NO_AR);
    expect(ativos[0]!.id).toBe(`t${DISPAROS_NO_AR}`);
    expect(ativos.some((atual) => atual.id === "t0")).toBe(false);
  });

  it("largar a ferramenta larga o ponto A", () => {
    useToolStore.setState({ tool: "disparo" });
    useDisparosStore.getState().mirar("c", { x: 1, y: 2 });

    useToolStore.setState({ tool: "select" });

    expect(useDisparosStore.getState().mira).toBeNull();
  });
});
