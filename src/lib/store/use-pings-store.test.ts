import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PINGS_POR_AUTOR,
  PRAZO_DO_PING_MS,
  usePingsStore,
} from "@/lib/store/use-pings-store";
import type { Ping } from "@/types/ping";

function ping(id: string, autorId = "ana", quando = Date.now()): Ping {
  return {
    id,
    tipo: "olhe",
    cenaId: "cena-1",
    x: 10,
    y: 20,
    autorId,
    autor: autorId,
    quando,
  };
}

beforeEach(() => {
  usePingsStore.setState({ ativos: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("usePingsStore", () => {
  it("o mesmo ping entregue duas vezes é um ping só", () => {
    const { registrar } = usePingsStore.getState();

    registrar(ping("a"));
    registrar(ping("a"));

    expect(usePingsStore.getState().ativos).toHaveLength(1);
  });

  it("o ping a mais de uma pessoa empurra o mais velho dela, e só o dela", () => {
    const { registrar } = usePingsStore.getState();

    registrar(ping("bruno-1", "bruno"));
    for (let i = 0; i <= PINGS_POR_AUTOR; i += 1) registrar(ping(`ana-${i}`));

    const ids = usePingsStore.getState().ativos.map((atual) => atual.id);

    expect(ids).not.toContain("ana-0");
    expect(ids).toContain(`ana-${PINGS_POR_AUTOR}`);
    expect(ids).toContain("bruno-1");
    expect(ids.filter((id) => id.startsWith("ana-"))).toHaveLength(
      PINGS_POR_AUTOR,
    );
  });

  it("vence no prazo, e sem vencido nada muda de referência", () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);

    const { registrar, expirar } = usePingsStore.getState();
    registrar(ping("velho", "ana", 100_000 - PRAZO_DO_PING_MS - 1));
    registrar(ping("novo", "bruno", 100_000));

    expirar();
    const depois = usePingsStore.getState().ativos;
    expect(depois.map((atual) => atual.id)).toEqual(["novo"]);

    expirar();
    expect(usePingsStore.getState().ativos).toBe(depois);
  });
});
