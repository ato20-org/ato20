import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Uma tecla, ou uma combinação delas, dentro do texto.
 *
 * Existe para a tecla NÃO se ler como o resto da frase. "Shift+clique escolhe
 * vários" é uma linha de instrução onde as duas primeiras palavras são um
 * gesto e o resto é o efeito dele, e sem a pastilha o olho tem de descobrir
 * isso lendo. Com ela, a instrução se reconhece antes de ser lida.
 *
 * `0.85em` e não um tamanho fixo: a pastilha aparece na lista de Configurações
 * (texto de 14px), no palco vazio (12px) e na barra dos retratos (10px), e uma
 * medida em pixels ficava grande demais na última e pequena na primeira.
 * Relativa, ela acompanha quem a hospeda.
 *
 * `font-mono` porque em lista vertical -- Configurações > Teclado -- a largura
 * fixa alinha os modificadores uns sob os outros.
 *
 * `data-slot="kbd"` não é enfeite: o `TooltipContent` procura por ele para
 * apertar o próprio recuo quando a dica termina numa tecla. Ver `tooltip.tsx`.
 */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "bg-muted text-muted-foreground inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 font-mono text-[0.85em] leading-none select-none",
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
