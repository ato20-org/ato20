import { describe, expect, it } from "vitest";

import { criarResolvedor } from "@/lib/obsidian/caminhos";
import {
  converterNota,
  mencaoDoArquivo,
  type AnexoImportado,
  type ContextoDaNota,
} from "@/lib/obsidian/markdown";

const ANEXOS: Record<string, AnexoImportado> = {
  "Imagens/Npc/PadreArlindoBatista.png": { nome: "PadreArlindoBatista.png", tipo: "image" },
  "Imagens/Npc/ZéDoMato.png": { nome: "ZéDoMato.png", tipo: "image" },
  "Imagens/Npc/?.png": { nome: "?.png", tipo: "image" },
  "Itens/Igreja/Documentos/Carta velha.png": { nome: "Carta velha.png", tipo: "image" },
  "Trilha/tema.mp3": { nome: "tema.mp3", tipo: "audio" },
  "Docs/regras.pdf": { nome: "regras.pdf", tipo: "file" },
};

const contexto: ContextoDaNota = {
  resolver: criarResolvedor([...Object.keys(ANEXOS), "Cenários/Poço.md", "Locais/Vila/Vila Chão de Barro.md"]),
  anexo: (caminho) => ANEXOS[caminho] ?? null,
};

const converter = (texto: string) => converterNota(texto, "Personagens/Npc/Igreja/Padre.md", contexto);

describe("converterNota", () => {
  it("a nota de NPC do Lendas Urbanas: link vira texto, embed vira a imagem", () => {
    const nota = [
      "**Idade:** 73",
      "",
      "Filho de [[Adamastor Batista]], Padre da [[Vila Chão de Barro]]",
      "## Aparência",
      "![[PadreArlindoBatista.png]]",
    ].join("\n");

    expect(converter(nota)).toBe(
      [
        "**Idade:** 73",
        "",
        "Filho de Adamastor Batista, Padre da Vila Chão de Barro",
        "## Aparência",
        "/PadreArlindoBatista.png",
      ].join("\n"),
    );
  });

  it("a largura do embed vira a do ATO20, e o nome com espaço ganha aspas", () => {
    expect(converter("![[ZéDoMato.png|476]]")).toBe("/ZéDoMato.png|476");
    expect(converter("![[Carta velha.png|300x200]]")).toBe('/"Carta velha.png"|300');
    expect(converter("![[?.png]]")).toBe("/?.png");
  });

  it("imagem colada no texto desce para uma linha só dela", () => {
    expect(converter("Emissora local de TV de onde os protagonistas trabalham![[ZéDoMato.png]]")).toBe(
      "Emissora local de TV de onde os protagonistas trabalham\n/ZéDoMato.png",
    );
    expect(converter("antes ![[ZéDoMato.png|200]] depois")).toBe("antes\n/ZéDoMato.png|200\ndepois");
    expect(converter("  - item ![[?.png]]")).toBe("  - item\n/?.png");
  });

  it("só prévias numa linha viram a galeria; no marcador de lista, o chip", () => {
    expect(converter("![[ZéDoMato.png|160]] ![[?.png]]")).toBe("/ZéDoMato.png|160 /?.png");
    expect(converter("- ![[ZéDoMato.png]]")).toBe("- /ZéDoMato.png");
  });

  it("som vira menção sem largura; nota, PDF e o que falta viram o nome", () => {
    expect(converter("![[tema.mp3|80]]")).toBe("/tema.mp3");
    expect(converter("![[Poço]]")).toBe("Poço");
    expect(converter("![[regras.pdf#page=2]]")).toBe("regras");
    expect(converter("![[Sumiu.png]]")).toBe("Sumiu");
  });

  it("o apelido e a seção do link", () => {
    expect(converter("[[Vila Chão de Barro|a vila]] e [[Pasta/Nota#Seção]] e [[#Só a seção]]")).toBe(
      "a vila e Nota e Só a seção",
    );
  });

  it("frontmatter vira linhas no topo", () => {
    const nota = [
      "---",
      'idade: "73"',
      "tags: [npc, igreja]",
      "aliados:",
      "  - Joana",
      "---",
      "# Padre",
    ].join("\n");

    expect(converter(nota)).toBe(
      ["**idade:** 73", "**tags:** npc, igreja", "**aliados:**", "- Joana", "", "# Padre"].join("\n"),
    );
  });

  it("o que o leitor não desenha vira o mais perto", () => {
    expect(converter("##### Fundo")).toBe("### Fundo");
    expect(converter("> [!warning]- Cuidado\n> texto")).toBe("> **Cuidado**\n> texto");
    expect(converter("> [!note]")).toBe("> **note**");
    expect(converter("um ==destaque== e um ~~risco~~ ^bloco1")).toBe("um destaque e um risco");
    expect(converter("antes %%segredo%% depois")).toBe("antes  depois");
  });

  it("imagem em markdown: externa vira link, local vira menção", () => {
    expect(converter("![capa](https://x.com/a.png)")).toBe("[capa](https://x.com/a.png)");
    expect(converter("![|240](../../../Imagens/Npc/ZéDoMato.png)")).toBe("/ZéDoMato.png|240");
    expect(converter("![a carta](Itens/Igreja/Documentos/Carta%20velha.png)")).toBe('/"Carta velha.png"');
  });

  it("link local para nota fica o texto; link externo fica link", () => {
    expect(converter("[o poço](Cenários/Poço.md) e [site](https://a.b)")).toBe(
      "o poço e [site](https://a.b)",
    );
  });

  it("nada dentro da cerca de código muda", () => {
    expect(converter("```\n[[Nao]] ![[ZéDoMato.png]]\n```\n[[Sim]]")).toBe(
      "```\n[[Nao]] ![[ZéDoMato.png]]\n```\nSim",
    );
  });
});

describe("mencaoDoArquivo", () => {
  it("aspas só quando o nome precisa", () => {
    expect(mencaoDoArquivo("poco.jpg")).toBe("/poco.jpg");
    expect(mencaoDoArquivo("Mapa da Vila.jpg")).toBe('/"Mapa da Vila.jpg"');
    expect(mencaoDoArquivo("fim.")).toBe('/"fim."');
    expect(mencaoDoArquivo('com "aspas".png')).toBeNull();
  });
});
