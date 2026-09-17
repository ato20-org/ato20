"use client";

import { useEffect } from "react";

import { atalhos } from "@/lib/mestre/atalhos";
import { colarTextoDoSistema } from "@/lib/mestre/texto-actions";

function isTyping(target: EventTarget | null): boolean {
  return Boolean(
    (target as HTMLElement | null)?.closest(
      "input, textarea, [contenteditable='true']",
    ),
  );
}

/**
 * Atalhos do Mestre.
 *
 * O listener é um laço sobre a tabela de `atalhos.ts`, e não um encadeado de
 * `if` com o mapeamento embutido: a MESMA tabela é o que a lista de atalhos em
 * Configurações desenha, e é isso que impede a interface de anunciar uma tecla
 * que o listener não atende mais.
 *
 * O efeito roda uma única vez: as ações leem o estado atual por conta própria,
 * então o listener nunca precisa ser remontado.
 */
export function useMestreShortcuts(): void {
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

    // O texto do sistema entra por aqui, e não pelo Ctrl+V da tabela: o
    // atalho deixa a tecla passar quando não tem nada interno, e o browser
    // dispara `paste` com o texto pronto. Ver `colarTextoDoSistema`.
    const handlePaste = (event: ClipboardEvent) => {
      if (isTyping(event.target)) return;
      const texto = event.clipboardData?.getData("text/plain");
      if (texto && colarTextoDoSistema(texto)) event.preventDefault();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("paste", handlePaste);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("paste", handlePaste);
    };
  }, []);
}
