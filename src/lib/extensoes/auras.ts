"use client";

import { useMemo } from "react";

import { chaveContribuicao, type AuraDeclarada, type Extensao } from "@/lib/extensoes/manifesto";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";

/**
 * As auras dos plugins ligados, pela chave `{plugin}/{id}` -- a mesma que o
 * molde trazido guarda em `aura`. Ver `extensoes::Aura`.
 *
 * Só do Mestre, e não do `useDeclarativoStore`: a aura pinta pasta, card e
 * janela do Compêndio, e nada disso chega à TV nem ao celular.
 */
export type AuraDoPlugin = AuraDeclarada & {
  chave: string;
  /** O id do plugin, para pedir o emblema da pasta dele. */
  extensao: string;
  /** O nome do plugin, para o menu dizer de onde a aura vem. */
  nomeDoPlugin: string;
};

/** As auras dos plugins habilitados. Um plugin desligado leva as suas junto. */
export function aurasDosPlugins(extensoes: readonly Extensao[]): Record<string, AuraDoPlugin> {
  const auras: Record<string, AuraDoPlugin> = {};

  for (const extensao of extensoes) {
    if (!extensao.habilitada) continue;
    for (const aura of extensao.contribui?.auras ?? []) {
      const chave = chaveContribuicao(extensao.id, aura.id);
      auras[chave] = { ...aura, chave, extensao: extensao.id, nomeDoPlugin: extensao.nome };
    }
  }

  return auras;
}

export function useAuras(): Record<string, AuraDoPlugin> {
  const extensoes = useExtensoesStore((estado) => estado.extensoes);

  return useMemo(() => aurasDosPlugins(extensoes), [extensoes]);
}

/** A aura que uma chave aponta, ou nada: a do plugin desligado some calada. */
export function useAura(chave: string | null | undefined): AuraDoPlugin | null {
  const auras = useAuras();

  return chave ? (auras[chave] ?? null) : null;
}
