"use client";

import { cn } from "@/lib/utils";
import type { Personagem } from "@/types/character";

/**
 * De qual personagem é o que está na tela -- a mochila, o caderno --, para
 * quem joga com mais de um: um botão por personagem, numa fileira que rola de
 * lado. Com um personagem só não desenha nada: não há o que escolher.
 */
export function EscolhaDePersonagem({
  personagens,
  escolhido,
  onEscolher,
  className,
}: {
  personagens: Personagem[];
  escolhido: string | undefined;
  onEscolher: (id: string) => void;
  className?: string;
}) {
  if (personagens.length < 2) return null;

  return (
    <div className={cn("flex shrink-0 gap-1.5 overflow-x-auto", className)}>
      {personagens.map((atual) => (
        <button
          key={atual.id}
          type="button"
          aria-pressed={atual.id === escolhido}
          onClick={() => onEscolher(atual.id)}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
            atual.id === escolhido ? "bg-accent text-accent-foreground" : "text-muted-foreground",
          )}
        >
          {atual.nome}
        </button>
      ))}
    </div>
  );
}
