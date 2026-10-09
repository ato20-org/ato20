import { describe, expect, it } from "vitest";

import { achadosNosDetalhes } from "@/lib/busca-nos-detalhes";

const grupo = (id: string, nome: string) => ({ id, nome, exibicao: "linhas" as const });
const detalhe = (grupo: string, rotulo: string, valor?: string | number, descricao?: string) => ({
  grupo,
  rotulo,
  valor,
  descricao,
});

const grupos = [grupo("a", "Identidade"), grupo("b", "Perícias"), grupo("c", "Ataques")];
const detalhes = [
  detalhe("Identidade", "Classe", "Combatente"),
  detalhe("Identidade", "NEX", 25),
  detalhe("Perícias", "Acrobacia", 5),
  detalhe("Perícias", "Luta", 0),
  detalhe("Ataques", "Pistola", "+5", "1d12, crítico 19/x2"),
];

describe("achadosNosDetalhes", () => {
  it("traz inteiro o grupo cujo nome bate, sem acento nem caixa", () => {
    const achados = achadosNosDetalhes(grupos, detalhes, "pericias");

    expect(achados.map(({ grupo }) => grupo.nome)).toEqual(["Perícias"]);
    expect(achados[0]!.detalhes).toHaveLength(2);
  });

  it("dos outros grupos, só o que bate no rótulo, no valor ou na descrição", () => {
    expect(achadosNosDetalhes(grupos, detalhes, "combatente")[0]!.detalhes).toEqual([
      detalhe("Identidade", "Classe", "Combatente"),
    ]);
    expect(achadosNosDetalhes(grupos, detalhes, "1d12")[0]!.grupo.nome).toBe("Ataques");
    expect(achadosNosDetalhes(grupos, detalhes, "25")[0]!.detalhes[0]!.rotulo).toBe("NEX");
  });

  it("sem achado, nenhum grupo", () => {
    expect(achadosNosDetalhes(grupos, detalhes, "dragao")).toEqual([]);
  });
});
