"use client";

import { Check, Sparkles } from "lucide-react";

import type { Kit } from "@/components/ui/menu-kit";
import { useAuras } from "@/lib/extensoes/auras";
import { t } from "@/lib/i18n/mestre";

const texto = t.compendio;

/**
 * O submenu "Aura" de um personagem ou de um item: as auras dos plugins
 * ligados, e "Nenhuma". A escolhida leva o visto. Some quando não há aura a
 * dar nem a tirar -- nenhum plugin ligado declara uma, e a coisa não tem.
 * Ver `extensoes::Aura`.
 */
export function ItensDeAura({
  kit: { Item, Separator, Sub, SubTrigger, SubContent },
  atual,
  onEscolher,
}: {
  kit: Kit;
  atual: string | undefined;
  onEscolher: (aura: string | null) => void;
}) {
  const auras = Object.values(useAuras());
  if (auras.length === 0 && !atual) return null;

  return (
    <Sub>
      <SubTrigger>
        <Sparkles />
        {texto.aura}
      </SubTrigger>
      <SubContent className="w-56">
        <Item disabled={!atual} onClick={() => onEscolher(null)}>
          {texto.semAura}
        </Item>
        {auras.length > 0 ? <Separator /> : null}
        {auras.map((aura) => (
          <Item key={aura.chave} disabled={aura.chave === atual} onClick={() => onEscolher(aura.chave)}>
            <span aria-hidden className="size-3 shrink-0 rounded-full border" style={{ background: aura.cor }} />
            <span className="truncate">{texto.auraDoPlugin(aura.titulo, aura.nomeDoPlugin)}</span>
            {aura.chave === atual ? <Check className="ml-auto" /> : null}
          </Item>
        ))}
      </SubContent>
    </Sub>
  );
}
