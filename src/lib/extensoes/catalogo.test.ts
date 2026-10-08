import { describe, expect, it } from "vitest";

import {
  filtrarCatalogo,
  lerCatalogo,
  repositorioDoGithub,
  versaoMaisNova,
} from "@/lib/extensoes/catalogo";

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

describe("filtrarCatalogo", () => {
  const ORDEM = {
    ...OBS,
    id: "ordem-segredo-na-floresta",
    nome: "Ordem Paranormal: Segredo na Floresta",
    descricao: { "pt-BR": "A névoa do Outro Lado.", en: "The Other Side's fog." },
    executaCodigo: false,
    tags: ["ordem-paranormal", "tema"],
  };
  const plugins = lista([ORDEM, OBS]);
  const ids = (busca: string) => filtrarCatalogo(plugins, busca).map((plugin) => plugin.id);

  it("sem busca devolve a lista inteira, na ordem", () => {
    expect(ids("")).toEqual(["ordem-segredo-na-floresta", "obs"]);
    expect(ids("   ")).toEqual(["ordem-segredo-na-floresta", "obs"]);
  });

  it("ignora acento e caixa", () => {
    expect(ids("NEVOA")).toEqual(["ordem-segredo-na-floresta"]);
    expect(ids("névoa")).toEqual(["ordem-segredo-na-floresta"]);
  });

  it("exige todas as palavras, em qualquer ordem", () => {
    expect(ids("tema ordem")).toEqual(["ordem-segredo-na-floresta"]);
    expect(ids("ordem live")).toEqual([]);
  });

  it("acha pelo autor, pela tag e pelo id", () => {
    expect(ids("valb")).toEqual(["ordem-segredo-na-floresta", "obs"]);
    expect(ids("live")).toEqual(["obs"]);
    expect(ids("segredo-na")).toEqual(["ordem-segredo-na-floresta"]);
  });
});

describe("repositorioDoGithub", () => {
  it("lê dono e repositório, com / ou .git no fim", () => {
    const obs = { dono: "valb-mig", repo: "ato20.obs.plugin" };
    expect(repositorioDoGithub("https://github.com/valb-mig/ato20.obs.plugin")).toEqual(obs);
    expect(repositorioDoGithub("https://github.com/valb-mig/ato20.obs.plugin/")).toEqual(obs);
    expect(repositorioDoGithub("https://github.com/valb-mig/plugin.git")).toEqual({
      dono: "valb-mig",
      repo: "plugin",
    });
  });

  it("recusa o que não é a raiz de um repositório", () => {
    for (const url of [
      "http://github.com/a/b",
      "https://github.com/a",
      "https://github.com/a/b/tree/main",
      "https://github.com/a/..",
      "https://github.com/-a/b",
      "https://github.com.evil.com/a/b",
    ]) {
      expect(repositorioDoGithub(url), url).toBeNull();
    }
  });
});

describe("versaoMaisNova", () => {
  it("compara número a número", () => {
    expect(versaoMaisNova("0.6.0", "0.5.0")).toBe(true);
    expect(versaoMaisNova("0.10.0", "0.9.1")).toBe(true);
    expect(versaoMaisNova("1.0", "1.0.0")).toBe(false);
  });

  it("não chama de nova a versão mais velha", () => {
    // O raw do GitHub ainda com a anterior, logo depois de atualizar.
    expect(versaoMaisNova("0.5.0", "0.6.0")).toBe(false);
    expect(versaoMaisNova("0.6.0", "0.6.0")).toBe(false);
  });

  it("versão que não é número cai na comparação de texto", () => {
    expect(versaoMaisNova("beta", "alfa")).toBe(true);
    expect(versaoMaisNova("beta", "beta")).toBe(false);
  });
});
