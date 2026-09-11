"use client"

import * as React from "react"
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area"

import { cn } from "@/lib/utils"

function ScrollArea({
  className,
  children,
  ...props
}: ScrollAreaPrimitive.Root.Props) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        // `scroll-fade` AQUI e nao na Root: a mascara precisa cair no
        // elemento que rola, que e este, e a Root e quem leva fundo, borda e
        // raio de quem chama — mascarar la dissolveria a moldura junto com a
        // lista. O fundo fica transparente no Viewport, entao o fade come o
        // conteudo e nao a caixa.
        // `max-h-[inherit]` e nao `size-full` sozinho: quem chama limita a
        // altura na Root (`max-h-56`), e altura em porcentagem contra um pai de
        // altura indefinida vira `auto` — o Viewport crescia com a lista, nunca
        // passava a ter transbordo, nunca ganhava barra, e vazava por fora do
        // popover. Herdando o `max-height`, o transbordo acontece AQUI, que e o
        // elemento com `overflow: scroll`.
        className="scroll-fade size-full max-h-[inherit] rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:h-full data-vertical:w-2.5 data-vertical:border-l data-vertical:border-l-transparent",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border"
      />
    </ScrollAreaPrimitive.Scrollbar>
  )
}

export { ScrollArea, ScrollBar }
