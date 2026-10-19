import { describe, expect, it } from "vitest";

import {
  Argumentos,
  FalhaDaFerramenta,
  acharPorIdOuNome,
  atender,
  listarFerramentas,
  resumo,
  type Ferramenta,
} from "@/lib/mcp/protocolo";

const ECO: Ferramenta = {
  nome: "eco",
  titulo: "Eco",
  descricao: "Devolve o texto.",
  entrada: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] },
  somenteLeitura: true,
  executar: async (args) => args.texto("texto"),
};

const EDITAR: Ferramenta = {
  nome: "editar_coisa",
  titulo: "Editar coisa",
  descricao: "Muda.",
  entrada: { type: "object", properties: {} },
  executar: async () => ({ mudou: true }),
};

const QUEBRA: Ferramenta = {
  nome: "quebra",
  titulo: "Quebra",
  descricao: "Falha.",
  entrada: { type: "object", properties: {} },
  executar: async () => {
    throw new FalhaDaFerramenta("Não deu.");
  },
};

const FERRAMENTAS = [ECO, EDITAR, QUEBRA];

describe("listarFerramentas", () => {
  it("leva nome, esquema e as dicas que o cliente usa para pedir permissão", () => {
    const { tools } = listarFerramentas(FERRAMENTAS) as {
      tools: Array<{ name: string; inputSchema: unknown; annotations: Record<string, unknown> }>;
    };

    expect(tools.map((tool) => tool.name)).toEqual(["eco", "editar_coisa", "quebra"]);
    expect(tools[0].inputSchema).toBe(ECO.entrada);
    expect(tools[0].annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    // Editar sobrescreve; criar não.
    expect(tools[1].annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(tools[2].annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
  });
});

describe("atender", () => {
  it("chama a ferramenta e devolve o texto em bloco de conteúdo", async () => {
    const resposta = await atender(FERRAMENTAS, {
      metodo: "tools/call",
      params: { nome: "eco", argumentos: { texto: "olá" } },
    });

    expect(resposta).toEqual({ ok: { content: [{ type: "text", text: "olá" }] } });
  });

  it("devolve objeto como JSON", async () => {
    const resposta = await atender(FERRAMENTAS, { metodo: "tools/call", params: { nome: "editar_coisa" } });

    expect(resposta).toEqual({ ok: { content: [{ type: "text", text: '{\n  "mudou": true\n}' }] } });
  });

  it("põe a falha da ferramenta no resultado, para o modelo ler", async () => {
    const resposta = await atender(FERRAMENTAS, { metodo: "tools/call", params: { nome: "quebra" } });

    expect(resposta).toEqual({ ok: { content: [{ type: "text", text: "Não deu." }], isError: true } });
  });

  it("o argumento que falta também volta como falha legível", async () => {
    const resposta = await atender(FERRAMENTAS, {
      metodo: "tools/call",
      params: { nome: "eco", argumentos: {} },
    });

    expect(resposta).toMatchObject({ ok: { isError: true } });
    expect(JSON.stringify(resposta)).toContain("texto");
  });

  it("a ferramenta que não existe é erro de protocolo", async () => {
    const resposta = await atender(FERRAMENTAS, { metodo: "tools/call", params: { nome: "nada" } });

    expect(resposta).toMatchObject({ erro: { codigo: -32602 } });
  });

  it("lista no tools/list", async () => {
    const resposta = (await atender(FERRAMENTAS, { metodo: "tools/list", params: {} })) as {
      ok: { tools: unknown[] };
    };

    expect(resposta.ok.tools).toHaveLength(3);
  });
});

describe("Argumentos", () => {
  it("aceita número em texto, que o modelo manda com frequência", () => {
    const args = new Argumentos({ x: "12.5", y: 3 });

    expect(args.numeroOpcional("x")).toBe(12.5);
    expect(args.numeroOpcional("y")).toBe(3);
    expect(args.numeroOpcional("z")).toBeUndefined();
    expect(() => new Argumentos({ x: "doze" }).numeroOpcional("x")).toThrow(FalhaDaFerramenta);
  });

  it("texto vazio conta como ausente, e o livre guarda as quebras de linha", () => {
    const args = new Argumentos({ nome: "  ", corpo: "  linha 1\n\nlinha 2\n" });

    expect(args.textoOpcional("nome")).toBeUndefined();
    expect(() => args.texto("nome")).toThrow(FalhaDaFerramenta);
    expect(args.textoLivre("corpo")).toBe("  linha 1\n\nlinha 2\n");
  });

  it("a lista diz em que item o erro está", () => {
    const args = new Argumentos({ medidores: [{ nome: "Vida" }, { maximo: 3 }] });

    expect(() => args.lista("medidores", (item) => item.texto("nome"))).toThrow(/medidores\[1\]/);
  });
});

describe("acharPorIdOuNome", () => {
  type Coisa = { id: string; nome: string };
  const lista: Coisa[] = [
    { id: "a1", nome: "Édgar" },
    { id: "b2", nome: "Goblin" },
    { id: "c3", nome: "Goblin" },
  ];
  const como = { id: (coisa: Coisa) => coisa.id, nome: (coisa: Coisa) => coisa.nome };
  const oQue = { plural: "os personagens", vazio: "a campanha não tem personagem" };

  it("acha pelo id e pelo nome sem acento nem caixa", () => {
    expect(acharPorIdOuNome(lista, "b2", como, oQue).id).toBe("b2");
    expect(acharPorIdOuNome(lista, " edgar ", como, oQue).id).toBe("a1");
  });

  it("nome repetido não escolhe sozinho: a mensagem traz os ids", () => {
    expect(() => acharPorIdOuNome(lista, "goblin", como, oQue)).toThrow(/b2.*c3/);
  });

  it("o que não existe lista o que existe", () => {
    expect(() => acharPorIdOuNome(lista, "Mira", como, oQue)).toThrow(/Goblin/);
    expect(() => acharPorIdOuNome([], "Mira", como, oQue)).toThrow(/não tem personagem/);
  });
});

describe("resumo", () => {
  it("corta o texto longo e junta os espaços", () => {
    expect(resumo("um  dois\n\ntrês")).toBe("um dois três");
    expect(resumo("a".repeat(200), 10)).toBe(`${"a".repeat(9)}…`);
  });
});
