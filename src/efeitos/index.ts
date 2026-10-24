import type { DefinicaoDeEfeito } from "@/types/efeito";

/**
 * Os packs de efeito de FÁBRICA: cada pasta aqui com um `efeito.json` é um
 * efeito, e as imagens dela vêm junto -- criar a pasta basta, sem uma linha
 * de código. É o mesmo formato de um pack de plugin, só que vem no app.
 *
 * Aqui, e não em `public/`, por medida: o `import.meta.glob` do Turbopack não
 * enumera fora de `src/` -- apontado para `public/` ele compila para um objeto
 * vazio, calado, e o vitest (que é Vite) acha tudo. Aqui os JSONs entram no
 * bundle e as imagens viram assets com nome por conteúdo, que se renovam
 * sozinhos no cache da TV quando a arte muda.
 */

/** O `efeito.json` como o pack escreve: a definição, sem a origem. */
type JsonDoPack = Omit<DefinicaoDeEfeito, "origem">;

/** Um pack: a pasta, a definição, e o endereço de cada imagem dela. */
export type PackDeFabrica = {
  pasta: string;
  definicao: JsonDoPack;
  arquivos: Readonly<Record<string, string>>;
};

/**
 * Os JSONs como MÓDULO inteiro, e não com `import: "default"`: o Turbopack
 * compila o JSON como CommonJS, e o `default` dele é `undefined` -- o catálogo
 * saía vazio, calado, só no build de produção. O Vite (o vitest) entrega o
 * JSON no `default`; o Turbopack, no próprio módulo. `jsonDoModulo` aceita os
 * dois.
 */
const JSONS = import.meta.glob("./*/efeito.json", { eager: true }) as Record<
  string,
  JsonDoPack | { default: JsonDoPack }
>;

function jsonDoModulo(modulo: JsonDoPack | { default: JsonDoPack }): JsonDoPack {
  return "default" in modulo && modulo.default ? modulo.default : (modulo as JsonDoPack);
}

/** O que o import de uma imagem devolve: o endereço, ou o módulo que o traz. */
type ModuloDeImagem = string | { src: string } | { default: string | { src: string } };

/**
 * As imagens, uma busca por formato: as que o pack de plugin aceita. O
 * endereço é uma string no Vite e um objeto com `src` no Next; os dois
 * servem. Ver `enderecoDoModulo`.
 *
 * Como MÓDULO inteiro, e não com `import: "default"`, pela razão dos JSONs e
 * por mais uma: no build de produção o Turbopack do Next 16.4 encurta o nome
 * das exportações, e o `default` de cada imagem virou outra letra lá dentro.
 * O `import: "default"` do glob continuou lendo `default`, recebia
 * `undefined`, e o build parava no export da `/espectador`. Com o módulo
 * inteiro nas mãos do código, o Turbopack não sabe que nomes serão lidos e
 * mantém os de verdade.
 */
const IMAGENS = {
  ...import.meta.glob("./*/*.webp", { eager: true }),
  ...import.meta.glob("./*/*.png", { eager: true }),
  ...import.meta.glob("./*/*.jpg", { eager: true }),
  ...import.meta.glob("./*/*.jpeg", { eager: true }),
  ...import.meta.glob("./*/*.gif", { eager: true }),
  ...import.meta.glob("./*/*.avif", { eager: true }),
} as Record<string, ModuloDeImagem>;

/** O endereço de uma imagem, pelo módulo inteiro ou já pelo `default`. */
function enderecoDoModulo(modulo: ModuloDeImagem): string {
  if (typeof modulo === "string") return modulo;
  if ("default" in modulo && modulo.default) return enderecoDoModulo(modulo.default);
  return (modulo as { src: string }).src;
}

/** `./chamas/fogo.webp` -> `["chamas", "fogo.webp"]`. */
function partes(caminho: string): [string, string] {
  const [, pasta = "", arquivo = ""] = caminho.split("/");
  return [pasta, arquivo];
}

/**
 * As imagens de todas as pastas, pelo nome que um pack usa para a de OUTRO:
 * `../chamas/chama-128.webp`. É o que deixa a "Bola de fogo" usar a chama de
 * "Em chamas" sem uma segunda cópia do arquivo no bundle.
 */
const DE_OUTRA_PASTA: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(IMAGENS).map(([imagem, endereco]) => {
    const [pasta, arquivo] = partes(imagem);
    return [`../${pasta}/${arquivo}`, enderecoDoModulo(endereco)];
  }),
);

export const PACKS_DE_FABRICA: ReadonlyArray<PackDeFabrica> = Object.entries(JSONS).map(
  ([caminho, modulo]) => {
    const [pasta] = partes(caminho);
    const definicao = jsonDoModulo(modulo);
    const arquivos: Record<string, string> = { ...DE_OUTRA_PASTA };

    for (const [imagem, endereco] of Object.entries(IMAGENS)) {
      const [dela, arquivo] = partes(imagem);
      if (dela === pasta) arquivos[arquivo] = enderecoDoModulo(endereco);
    }

    return { pasta, definicao, arquivos };
  },
);
