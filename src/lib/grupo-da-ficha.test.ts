import { describe, expect, it } from "vitest";

import { lerGruposLembrados } from "./grupo-da-ficha";

describe("lerGruposLembrados", () => {
  it("aceita qualquer grupo em texto, e só texto", () => {
    expect(lerGruposLembrados(JSON.stringify({ a: "pericias", b: 3 }))).toEqual({ a: "pericias" });
  });

  it("volta vazio com disco ausente, quebrado ou de outro formato", () => {
    expect(lerGruposLembrados(null)).toEqual({});
    expect(lerGruposLembrados("{")).toEqual({});
    expect(lerGruposLembrados(JSON.stringify(["pericias"]))).toEqual({});
  });
});
