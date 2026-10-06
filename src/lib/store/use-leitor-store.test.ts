import { beforeEach, describe, expect, it } from "vitest";

import { useLeitorStore } from "./use-leitor-store";

describe("salto de página", () => {
  beforeEach(() => useLeitorStore.setState({ saltos: {} }));

  it("dois pedidos da mesma página têm vezes diferentes", () => {
    const { saltar } = useLeitorStore.getState();
    saltar("phb", 192);
    const primeira = useLeitorStore.getState().saltos.phb!.vez;
    saltar("phb", 192);

    expect(useLeitorStore.getState().saltos.phb).toEqual({ pagina: 192, vez: primeira + 1 });
  });

  it("descartar tira só o salto aplicado, e não um mais novo", () => {
    const { saltar, descartarSalto } = useLeitorStore.getState();
    saltar("phb", 10);
    const aplicado = useLeitorStore.getState().saltos.phb!.vez;
    saltar("phb", 20);

    descartarSalto("phb", aplicado);
    expect(useLeitorStore.getState().saltos.phb?.pagina).toBe(20);

    descartarSalto("phb", aplicado + 1);
    expect(useLeitorStore.getState().saltos.phb).toBeUndefined();
  });
});
