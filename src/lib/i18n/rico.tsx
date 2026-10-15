import { Fragment, type ReactNode } from "react";

/**
 * Um texto do dicionário com pedaços de interface no meio.
 *
 * `"Um plugin é uma pasta com {manifest} dentro."` com `{ manifest: <code>…</code> }`.
 * O marcador fica no texto, e não o texto partido em dois pedaços no
 * dicionário, porque cada idioma põe o pedaço num lugar da frase -- e o teste
 * do dicionário confere que os dois idiomas têm os mesmos marcadores.
 */
export function rico(texto: string, pecas: Record<string, ReactNode>): ReactNode {
  return texto
    .split(/\{(\w+)\}/)
    .map((parte, i) => (i % 2 === 1 ? <Fragment key={i}>{pecas[parte]}</Fragment> : parte));
}
