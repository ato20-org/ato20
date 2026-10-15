import { idioma, normalizar, type Idioma } from "@/lib/i18n/idioma";

/**
 * Um texto que um plugin declara no manifesto: uma string, ou um por idioma.
 *
 *     "titulo": "Iniciativa"
 *     "titulo": { "pt-BR": "Iniciativa", "en": "Initiative" }
 *
 * A forma de mapa veio na API 7. A string continua valendo, e vale para todos
 * os idiomas: plugin escrito numa língua só não precisa mudar nada.
 */
export type TextoDePlugin = string | Record<string, string>;

/**
 * O texto no idioma da tela.
 *
 * A chave exata primeiro (`pt-BR`), depois qualquer uma da mesma língua (`pt`,
 * `en-US`), depois o português e o inglês, que são os idiomas do aplicativo, e
 * por fim o primeiro que houver: um plugin só em espanhol ainda aparece, em
 * espanhol, em vez de sumir da tela.
 */
export function resolverTexto(texto: unknown, lingua: Idioma = idioma): string {
  if (typeof texto === "string") return texto;
  if (texto === null || typeof texto !== "object") return "";

  const porIdioma = Object.entries(texto as Record<string, unknown>).filter(
    (par): par is [string, string] => typeof par[1] === "string" && par[1].trim() !== "",
  );
  const achar = (teste: (chave: string) => boolean) =>
    porIdioma.find(([chave]) => teste(chave))?.[1];

  return (
    achar((chave) => chave === lingua) ??
    achar((chave) => normalizar(chave) === lingua) ??
    achar((chave) => normalizar(chave) === "pt-BR") ??
    achar((chave) => normalizar(chave) === "en") ??
    porIdioma[0]?.[1] ??
    ""
  );
}

/** Como `resolverTexto`, guardando o `null` de campo opcional ausente. */
export function resolverOpcional(texto: unknown): string | null {
  return texto === null || texto === undefined ? null : resolverTexto(texto);
}
