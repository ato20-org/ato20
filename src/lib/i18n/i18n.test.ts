import { describe, expect, it } from "vitest";

import { IDIOMAS } from "@/lib/i18n/idioma";

// O `import.meta.glob` é do Vite, que o vitest usa por baixo; o tipo dele mora
// em `vite/client`, que o pnpm não deixa alcançável daqui. Declarado só o que
// este arquivo usa.
declare global {
  interface ImportMeta {
    glob<T>(padroes: string[], opcoes: { eager: true }): Record<string, T>;
  }
}

/**
 * Todas as áreas de texto, achadas pelo nome: área nova entra no teste sem
 * ninguém lembrar de registrá-la. Cada uma exporta `dicionarios`.
 */
const areas = Object.entries(
  // Sem os testes e sem o `trocar.ts`, que é do Mestre e arrasta o store da
  // campanha: área de texto não importa store nenhum.
  import.meta.glob<{ dicionarios?: Record<string, unknown> }>(
    ["./*.ts", "!./*.test.ts", "!./trocar.ts"],
    { eager: true },
  ),
).flatMap(([caminho, modulo]) =>
  modulo.dicionarios ? [[caminho, modulo.dicionarios] as const] : [],
);

type Folha = { caminho: string; valor: unknown };

/** Cada folha do dicionário, com o caminho de chaves até ela. */
function folhas(objeto: unknown, prefixo = ""): Folha[] {
  if (objeto === null || typeof objeto !== "object" || Array.isArray(objeto)) {
    return [{ caminho: prefixo, valor: objeto }];
  }

  return Object.entries(objeto).flatMap(([chave, valor]) =>
    folhas(valor, prefixo ? `${prefixo}.${chave}` : chave),
  );
}

/** Os marcadores `{nome}` de um texto, para o `rico`. */
function marcadores(texto: string): string[] {
  return [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

describe("dicionários", () => {
  it("acha as áreas", () => {
    expect(areas.length).toBeGreaterThan(1);
  });

  for (const [arquivo, dicionarios] of areas) {
    describe(arquivo, () => {
      it("tem um dicionário por idioma", () => {
        expect(Object.keys(dicionarios).sort()).toEqual([...IDIOMAS].sort());
      });

      const base = new Map(folhas(dicionarios["pt-BR"]).map((f) => [f.caminho, f.valor]));

      for (const lingua of IDIOMAS) {
        const deste = folhas(dicionarios[lingua]);

        it(`${lingua}: mesmas chaves do português`, () => {
          expect(deste.map((f) => f.caminho).sort()).toEqual([...base.keys()].sort());
        });

        it(`${lingua}: nenhum texto vazio`, () => {
          const vazios = deste.filter((f) => typeof f.valor === "string" && !f.valor.trim());
          expect(vazios.map((f) => f.caminho)).toEqual([]);
        });

        it(`${lingua}: funções com a mesma aridade`, () => {
          const diferentes = deste.filter(
            (f) =>
              typeof f.valor === "function" &&
              (f.valor as () => string).length !==
                (base.get(f.caminho) as () => string).length,
          );
          expect(diferentes.map((f) => f.caminho)).toEqual([]);
        });

        it(`${lingua}: os mesmos marcadores do português`, () => {
          const diferentes = deste.filter(
            (f) =>
              typeof f.valor === "string" &&
              marcadores(f.valor).join() !== marcadores(String(base.get(f.caminho))).join(),
          );
          expect(diferentes.map((f) => f.caminho)).toEqual([]);
        });
      }

      // O texto público em inglês não leva travessão: é a marca de texto de
      // IA que a casa decidiu não usar. O português segue a regra de quem o
      // escreveu.
      it("en: sem travessão", () => {
        const comTravessao = folhas(dicionarios.en).filter(
          (f) => typeof f.valor === "string" && f.valor.includes("—"),
        );
        expect(comTravessao.map((f) => f.caminho)).toEqual([]);
      });
    });
  }
});
