"use client";

import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field";
import { Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Um campo de número com botões de menos e mais.
 *
 * O `<input type="number">` do navegador serve mal aqui: as setinhas nativas
 * são dois alvos de 8px empilhados, desenhadas pelo sistema e não pelo tema —
 * no escuro elas aparecem como um retângulo claro no meio do campo. No celular
 * elas nem existem, e sobra digitar um número onde bastava somar um.
 *
 * O `NumberField` do Base UI é o mesmo que o resto da interface já usa. Os
 * botões são alvos de verdade, o campo continua aceitando digitação e teclado,
 * e o desenho é o do tema.
 */
function NumberField({
  className,
  ...props
}: NumberFieldPrimitive.Root.Props & { className?: string }) {
  return (
    <NumberFieldPrimitive.Root {...props}>
      <NumberFieldPrimitive.Group
        className={cn(
          "border-input dark:bg-input/30 flex h-9 w-fit items-center overflow-hidden rounded-md border shadow-xs",
          "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
          className,
        )}
      >
        <NumberFieldPrimitive.Decrement
          className="hover:bg-accent text-muted-foreground hover:text-foreground grid h-full w-9 shrink-0 place-items-center border-r disabled:opacity-40"
          aria-label="Diminuir"
        >
          <Minus className="size-3.5" />
        </NumberFieldPrimitive.Decrement>

        <NumberFieldPrimitive.Input className="w-12 bg-transparent text-center text-sm tabular-nums outline-none" />

        <NumberFieldPrimitive.Increment
          className="hover:bg-accent text-muted-foreground hover:text-foreground grid h-full w-9 shrink-0 place-items-center border-l disabled:opacity-40"
          aria-label="Aumentar"
        >
          <Plus className="size-3.5" />
        </NumberFieldPrimitive.Increment>
      </NumberFieldPrimitive.Group>
    </NumberFieldPrimitive.Root>
  );
}

export { NumberField };
