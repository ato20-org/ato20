import { describe, expect, it } from "vitest";

import { semBiblioteca, type Layout } from "@/lib/store/use-layout-store";
import type { ConteudoJanela } from "@/lib/store/use-window-store";

const aba = (tipo: string) => ({ tipo }) as ConteudoJanela;

function layout(esquerda: string[][], direita: string[][]): Layout {
  const coluna = (grupos: string[][]) => ({
    largura: 288,
    grupos: grupos.map((abas, i) => ({ id: `g${i}`, abas: abas.map(aba), ativa: abas[0]! })),
    fracoes: grupos.map(() => 1 / grupos.length),
  });
  return { esquerda: coluna(esquerda), direita: coluna(direita) };
}

const tipos = (coluna: Layout["esquerda"]) => coluna.grupos.map((g) => g.abas.map((a) => a.tipo));

describe("semBiblioteca", () => {
  it("a bancada de fábrica de antes: a Biblioteca sai e Arquivos fica onde estava", () => {
    const antes = layout([["cenas", "quadros", "personagens"]], [["imagens", "sons"], ["camadas"]]);
    const depois = semBiblioteca(antes);

    expect(tipos(depois.esquerda)).toEqual([["cenas", "quadros", "personagens"]]);
    expect(tipos(depois.direita)).toEqual([["sons"], ["camadas"]]);
    // A ativa apontava para a Biblioteca: cai na primeira que sobrou.
    expect(depois.direita.grupos[0]!.ativa).toBe("sons");
  });

  it("sem Arquivos em lugar nenhum, a Biblioteca vira Arquivos no mesmo lugar", () => {
    const depois = semBiblioteca(layout([["cenas"]], [["imagens", "sons"]]));

    expect(tipos(depois.direita)).toEqual([["quadros", "sons"]]);
    expect(depois.direita.grupos[0]!.ativa).toBe("quadros");
  });

  it("o grupo que só tinha a Biblioteca some, e a bancada sem ela fica igual", () => {
    const depois = semBiblioteca(layout([["cenas", "quadros"]], [["imagens"], ["camadas"]]));
    expect(tipos(depois.direita)).toEqual([["camadas"]]);
    expect(depois.direita.fracoes).toEqual([1]);

    const sem = layout([["cenas", "quadros"]], [["sons"]]);
    expect(semBiblioteca(sem)).toBe(sem);
  });
});
