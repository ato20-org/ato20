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
    useDeclarativoStore.setState({ versao: 0, estilos: {}, efeitos: {}, plugins: [] });
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

  // Camadas não têm arquivo para ler: o `fetch` nem existe no teste, e o
  // estilo tem de sair inteiro do manifesto.
  it("publica o estilo em camadas com o plugin e a versão, sem buscar arquivo", async () => {
    const camadas = {
      moldura: "m/vida.webp",
      conteudo: { modo: "barra" as const, direcao: "cima" as const, imagem: "m/sangue.gif" },
    };
    const ordem = {
      id: "ordem",
      versao: "1.2.0",
      habilitada: true,
      contribui: {
        estilosDeMedidor: [{ id: "vida", titulo: "Vida", altura: 0.22, rotulo: "nome", camadas }],
      },
    } as unknown as Extensao;

    await useDeclarativoStore.getState().sincronizar([ordem]);

    expect(useDeclarativoStore.getState().estilos).toEqual({
      "ordem/vida": {
        tipo: "camadas",
        titulo: "Vida",
        altura: 0.22,
        rotulo: "nome",
        plugin: "ordem",
        versao: "1.2.0",
        camadas,
      },
    });
  });

  it("publica os efeitos dos plugins ligados com o id da mesa", async () => {
    const sangrando = { id: "sangrando", titulo: "Sangrando", figura: { tinta: 0.6 } };
    const ordem = (habilitada: boolean) =>
      ({
        id: "ordem",
        versao: "1.0.0",
        habilitada,
        contribui: { efeitos: [sangrando] },
      }) as unknown as Extensao;

    await useDeclarativoStore.getState().sincronizar([ordem(true)]);
    expect(useDeclarativoStore.getState().efeitos).toEqual({
      "ordem/sangrando": { ...sangrando, id: "ordem/sangrando" },
    });

    // Desligado, o efeito some, e a condição que o aponta volta a ser só o selo.
    await useDeclarativoStore.getState().sincronizar([ordem(false)]);
    expect(useDeclarativoStore.getState().efeitos).toEqual({});
  });

  it("não publica de novo quando só a ordem da lista muda", async () => {
    await useDeclarativoStore.getState().sincronizar([plugin("a", true), plugin("b", true)]);
    await useDeclarativoStore.getState().sincronizar([plugin("b", true), plugin("a", true)]);

    expect(useDeclarativoStore.getState().versao).toBe(1);
  });
});
