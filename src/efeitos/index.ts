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

/**
 * As imagens, uma busca por formato: as que o pack de plugin aceita. Cada
 * import devolve o endereço -- uma string no Vite, um objeto com `src` no
 * Next; os dois servem.
 */
const IMAGENS = {
  ...import.meta.glob("./*/*.webp", { eager: true, import: "default" }),
  ...import.meta.glob("./*/*.png", { eager: true, import: "default" }),
  ...import.meta.glob("./*/*.jpg", { eager: true, import: "default" }),
  ...import.meta.glob("./*/*.jpeg", { eager: true, import: "default" }),
  ...import.meta.glob("./*/*.gif", { eager: true, import: "default" }),
  ...import.meta.glob("./*/*.avif", { eager: true, import: "default" }),
} as Record<string, string | { src: string }>;

/** `./chamas/fogo.webp` -> `["chamas", "fogo.webp"]`. */
function partes(caminho: string): [string, string] {
  const [, pasta = "", arquivo = ""] = caminho.split("/");
  return [pasta, arquivo];
}

export const PACKS_DE_FABRICA: ReadonlyArray<PackDeFabrica> = Object.entries(JSONS).map(
  ([caminho, modulo]) => {
    const [pasta] = partes(caminho);
    const definicao = jsonDoModulo(modulo);
    const arquivos: Record<string, string> = {};

    for (const [imagem, endereco] of Object.entries(IMAGENS)) {
      const [dela, arquivo] = partes(imagem);
      if (dela === pasta) arquivos[arquivo] = typeof endereco === "string" ? endereco : endereco.src;
    }

    return { pasta, definicao, arquivos };
  },
);
