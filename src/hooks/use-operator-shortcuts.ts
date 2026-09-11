"use client";

import { useEffect } from "react";

import { atalhos } from "@/lib/operator/atalhos";

function isTyping(target: EventTarget | null): boolean {
  return Boolean(
    (target as HTMLElement | null)?.closest("input, textarea, [contenteditable='true']"),
  );
}

/**
 * Atalhos do Operador.
 *
 * O listener é um laço sobre a tabela de `atalhos.ts`, e não um encadeado de
 * `if` com o mapeamento embutido: a MESMA tabela é o que a lista de atalhos em
 * Configurações desenha, e é isso que impede a interface de anunciar uma tecla
 * que o listener não atende mais.
 *
 * O efeito roda uma única vez: as ações leem o estado atual por conta própria,
 * então o listener nunca precisa ser remontado.
 */
export function useOperatorShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;

      // Quem casa primeiro executa, e mais ninguém é consultado -- a ordem da
      // tabela É a precedência. Ver a nota em `ATALHOS_BASE`. A tabela é
      // consultada a cada tecla e não capturada no efeito: os comandos dos
      // plugins entram e saem dela conforme extensões são ligadas.
      const atalho = atalhos().find(({ combina }) => combina(event));
      if (!atalho) return;

      if (atalho.impedirPadrao) event.preventDefault();

      atalho.executar(event);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
