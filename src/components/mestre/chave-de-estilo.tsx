"use client";

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Um par de estados, lado a lado: o de fábrica primeiro, como o "sem fundo".
 *
 * Serve ao canto e ao traço em dois lugares: no popover da ferramenta, onde
 * eles são o padrão da campanha, e no painel de Estilo do gizmo, onde são o
 * jeito DESTE elemento. O mesmo desenho nos dois, para o mestre reconhecer a
 * escolha de um lado quando a encontra do outro.
 */
export function Chave({
  titulo,
  ligada,
  desligada,
  ligadaComo,
  onMudar,
}: {
  titulo: string;
  ligada: boolean;
  desligada: { rotulo: string; Icone: LucideIcon };
  ligadaComo: { rotulo: string; Icone: LucideIcon };
  onMudar: (ligada: boolean) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-muted-foreground text-[10px]">{titulo}</span>

      <div className="flex items-center gap-1.5">
        {(
          [
            { valor: false, ...desligada },
            { valor: true, ...ligadaComo },
          ] as const
        ).map(({ valor, rotulo, Icone }) => (
          <button
            key={rotulo}
            type="button"
            aria-label={rotulo}
            aria-pressed={ligada === valor}
            title={rotulo}
            className={cn(
              "grid size-7 place-items-center rounded-md border transition-transform",
              ligada === valor
                ? "border-foreground scale-110"
                : "border-white/20 hover:scale-105",
            )}
            onClick={() => onMudar(valor)}
          >
            <Icone className="size-4" />
          </button>
        ))}
      </div>
    </div>
  );
}
