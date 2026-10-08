/**
 * O corpo da release no GitHub, montado de `src/lib/versoes.ts`: o português,
 * e depois do marcador `<!-- en -->`, o inglês.
 *
 * O site (`next.ato20`, `pnpm gerar:releases`) separa as duas seções pelo
 * marcador: a página em português mostra a primeira, a de `/en` a segunda. O
 * `---` antes do marcador é para quem lê a release no próprio GitHub.
 *
 * Uso: node --no-warnings scripts/notas-da-release.mjs 1.1.0 > notas.md
 *      gh release edit v1.1.0 --notes-file notas.md
 *
 * `--so-ingles` imprime só o marcador e a seção em inglês, para acrescentar ao
 * corpo de uma release antiga sem reescrever o português que já está lá:
 *
 *      { gh release view v0.2.0 --json body -q .body; \
 *        node --no-warnings scripts/notas-da-release.mjs 0.2.0 --so-ingles; } > notas.md
 *
 * Lê o `.ts` direto: o Node tira os tipos sozinho (22.18+), e por isso
 * `versoes.ts` não importa nada.
 */
import { VERSOES } from "../src/lib/versoes.ts";

const argumentos = process.argv.slice(2);
const soIngles = argumentos.includes("--so-ingles");
// A tag pode vir com o sufixo das primeiras releases: `v0.0.6-alpha`.
const pedida = argumentos
  .find((cada) => !cada.startsWith("--"))
  ?.replace(/^v/, "")
  .replace(/-.*$/, "");
const versao = VERSOES.find((cada) => cada.versao === pedida);

if (!versao) {
  console.error(`Versão ${pedida ?? "(nenhuma)"} não está em src/lib/versoes.ts.`);
  process.exit(1);
}

const SECOES = {
  pt: { novidade: "## Novidades", correcao: "## Correções" },
  en: { novidade: "## What's new", correcao: "## Fixes" },
};

/** `- **título.** detalhe`, o formato que as releases já usam. */
function linha(mudanca, lingua) {
  const titulo = mudanca.titulo[lingua].replace(/[.!?]?$/, (fim) => fim || ".");
  const detalhe = mudanca.detalhe ? ` ${mudanca.detalhe[lingua]}` : "";

  return `- **${titulo}**${detalhe}`;
}

function secao(lingua) {
  return ["novidade", "correcao"]
    .map((tipo) => {
      const linhas = versao.mudancas.filter((m) => m.tipo === tipo).map((m) => linha(m, lingua));

      return linhas.length ? `${SECOES[lingua][tipo]}\n\n${linhas.join("\n")}` : null;
    })
    .filter(Boolean)
    .join("\n\n");
}

const ingles = `---\n\n<!-- en -->\n\n${secao("en")}\n`;

process.stdout.write(soIngles ? `\n\n${ingles}` : `${secao("pt")}\n\n${ingles}`);
