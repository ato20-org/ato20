import { describe, expect, it } from "vitest";

import { enderecoDosFluxos } from "@/lib/sync/fluxos-do-mestre";

describe("o endereço dos fluxos do Mestre", () => {
  it("troca o host do loopback, e mantém a porta", () => {
    expect(enderecoDosFluxos("http://127.0.0.1:20200")).toBe("http://localhost:20200");
  });

  it("não mexe no que não é o loopback numérico", () => {
    expect(enderecoDosFluxos("http://192.168.7.40:20200")).toBe("http://192.168.7.40:20200");
    expect(enderecoDosFluxos("http://localhost:20200")).toBe("http://localhost:20200");
    expect(enderecoDosFluxos("")).toBe("");
  });
});
