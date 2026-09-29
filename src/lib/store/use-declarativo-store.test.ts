import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Extensao } from "@/lib/extensoes/manifesto";
import { useDeclarativoStore } from "@/lib/store/use-declarativo-store";

vi.mock("@/lib/vault/bridge", () => ({
  daemonAddr: vi.fn().mockRejectedValue(new Error("sem daemon no teste")),
}));

/** Plugin sem estilo de medidor: é o caso em que só a lista muda. */
const plugin = (id: string, habilitada: boolean) => ({ id, habilitada }) as Extensao;

describe("o declarativo do Mestre", () => {
  beforeEach(() => {
    useDeclarativoStore.setState({ versao: 0, estilos: {}, plugins: [] });
  });

  it("publica um plugin ligado mesmo sem estilo de medidor", async () => {
    await useDeclarativoStore.getState().sincronizar([plugin("teste", true)]);

    expect(useDeclarativoStore.getState().plugins).toEqual(["teste"]);
    expect(useDeclarativoStore.getState().versao).toBe(1);
  });

  // A seção do plugin no celular some por aqui. Ver `BlocosDePlugin`.
  it("tira da lista o plugin desligado ou desinstalado", async () => {
    await useDeclarativoStore.getState().sincronizar([plugin("teste", true)]);
    await useDeclarativoStore.getState().sincronizar([plugin("teste", false)]);
    expect(useDeclarativoStore.getState().plugins).toEqual([]);

    await useDeclarativoStore.getState().sincronizar([]);
    expect(useDeclarativoStore.getState().versao).toBe(2);
  });

  it("não publica de novo quando só a ordem da lista muda", async () => {
    await useDeclarativoStore.getState().sincronizar([plugin("a", true), plugin("b", true)]);
    await useDeclarativoStore.getState().sincronizar([plugin("b", true), plugin("a", true)]);

    expect(useDeclarativoStore.getState().versao).toBe(1);
  });
});
