import { toast } from "sonner";

import { idioma } from "@/lib/i18n/idioma";
import { t } from "@/lib/i18n/mestre";
import type { ColecaoDoPlugin, MotivoDoRust, TrazidoDoPlugin } from "@/lib/vault/bestiario";

const texto = t.compendio;

/** O motivo que o Rust manda nos dois idiomas, no da tela. */
export function noIdioma(motivo: MotivoDoRust): string {
  return idioma === "en" ? motivo.en : motivo.pt;
}

/**
 * As tags de todas as fichas dos plugins, para somar às do Bestiário da
 * campanha na fileira do filtro: o mestre filtra "Sangue" e acha a ameaça do
 * plugin ao lado do molde que ele mesmo fez.
 */
export function tagsDosPlugins(colecoes: readonly ColecaoDoPlugin[]): Array<{ tags: string[] }> {
  return colecoes.flatMap((colecao) => colecao.fichas);
}

/**
 * Avisa o que a ficha trouxe faltando: a imagem que não veio, os grupos que
 * não couberam na ficha da campanha. Calado quando veio tudo -- o "veio para a
 * campanha" é de quem chamou.
 */
export function avisarDoTrazido(trazido: TrazidoDoPlugin): void {
  const nome = trazido.molde.nome;

  for (const motivo of trazido.imagensDeFora) toast.warning(texto.semImagem(nome, noIdioma(motivo)));
  if (trazido.gruposDeFora.length > 0)
    toast.warning(texto.gruposDeFora(trazido.gruposDeFora.join(", ")));
}
