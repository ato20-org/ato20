import { describe, expect, it } from "vitest";

import { lerCatalogo } from "@/lib/extensoes/catalogo";

const BASE = "https://ato20.valbmig.com.br/plugins.json";

const OBS = {
  id: "obs",
  nome: "OBS",
  descricao: { "pt-BR": "Leva a mesa para a live.", en: "Takes the table to your stream." },
  autor: "valb-mig",
  repositorio: "https://github.com/valb-mig/ato20.obs.plugin",
  executaCodigo: true,
  apiVersao: 3,
  tags: ["obs", "live"],
};

function lista(plugins: unknown[]) {
  const catalogo = lerCatalogo({ formato: 1, plugins }, BASE);
  if (catalogo.tipo !== "lista") throw new Error("esperava a lista");

  return catalogo.plugins;
}

describe("lerCatalogo", () => {
  it("lê a entrada como o site escreve", () => {
    expect(lista([OBS])).toEqual([{ ...OBS, icone: null, capa: null }]);
  });

  it("resolve as imagens contra o endereço da lista", () => {
    const [plugin] = lista([
      { ...OBS, icone: "/plugins/obs/icone.png", capa: "https://cdn.exemplo/capa.webp" },
    ]);

    expect(plugin.icone).toBe("https://ato20.valbmig.com.br/plugins/obs/icone.png");
    expect(plugin.capa).toBe("https://cdn.exemplo/capa.webp");
  });

  it("recusa imagem fora de http(s)", () => {
    const [plugin] = lista([{ ...OBS, icone: "file:///etc/passwd", capa: "javascript:alert(1)" }]);

    expect(plugin.icone).toBeNull();
    expect(plugin.capa).toBeNull();
  });

  it("entrada estragada some, e as outras ficam", () => {
    const plugins = lista([
      { ...OBS, id: "sem-nome", nome: "" },
      { ...OBS, id: "fora-do-github", repositorio: "https://exemplo.com/plugin" },
      { ...OBS, id: "esquema-perigoso", repositorio: "javascript:alert(1)" },
      { ...OBS, id: "api-quebrada", apiVersao: "3" },
      "lixo",
      OBS,
    ]);

    expect(plugins.map((plugin) => plugin.id)).toEqual(["obs"]);
  });

  it("id repetido: vale o primeiro", () => {
    const plugins = lista([OBS, { ...OBS, nome: "Outro OBS" }]);

    expect(plugins).toHaveLength(1);
    expect(plugins[0].nome).toBe("OBS");
  });

  it("sem executaCodigo, o selo de código aparece", () => {
    const semCampo: Partial<typeof OBS> = { ...OBS };
    delete semCampo.executaCodigo;

    expect(lista([semCampo])[0].executaCodigo).toBe(true);
    expect(lista([{ ...OBS, executaCodigo: false }])[0].executaCodigo).toBe(false);
  });

  it("formato que este aplicativo não conhece", () => {
    expect(lerCatalogo({ formato: 2, plugins: [] }, BASE)).toEqual({ tipo: "formatoNovo" });
  });

  it("casca ilegível lança", () => {
    expect(() => lerCatalogo("<html>", BASE)).toThrow();
    expect(() => lerCatalogo({ formato: 1 }, BASE)).toThrow();
  });
});
