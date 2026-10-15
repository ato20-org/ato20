import { describe, expect, it } from "vitest";

import { doGrupo, gruposDaFicha, type GrupoDeDetalhes } from "@/types/detalhe";

const molde: GrupoDeDetalhes[] = [
  { id: "g1", nome: "Identidade", exibicao: "linhas" },
  { id: "g2", nome: "Poderes", exibicao: "lista" },
];

describe("gruposDaFicha", () => {
  it("põe os do molde primeiro, mesmo vazios, e os avulsos no fim", () => {
    const grupos = gruposDaFicha(molde, [
      { grupo: "Combate" },
      { grupo: "identidade " },
      { grupo: "Combate" },
    ]);

    expect(grupos.map((grupo) => grupo.nome)).toEqual(["Identidade", "Poderes", "Combate"]);
    expect(grupos[2]).toEqual({ id: "avulso:Combate", nome: "Combate", exibicao: "linhas" });
  });

  it("acha o detalhe pelo nome do grupo, sem caixa nem espaço nas pontas", () => {
    const detalhes = [
      { id: "a", grupo: " PODERES" },
      { id: "b", grupo: "Identidade" },
    ];

    expect(doGrupo(detalhes, molde[1]!).map((detalhe) => detalhe.id)).toEqual(["a"]);
  });
});
