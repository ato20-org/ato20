"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "@/lib/utils";

/**
 * Painel flutuante ancorado num gatilho.
 *
 * Existe porque `DropdownMenu` é um MENU: ele captura setas e teclas de
 * primeira letra para navegar entre itens, o que briga com controles de valor
 * como slider e campo numérico. E `Dialog` é modal e centralizado, o que
 * cobriria justamente o mapa que se está tentando alinhar.
 */
function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  side = "top",
  sideOffset = 8,
  align = "center",
  alignOffset = 0,
  anchor,
  children,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "anchor" | "side" | "sideOffset"
  >) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        // Âncora explícita, para quem não usa `PopoverTrigger`.
        //
        // Existe por causa dos pontos de anotação: o marcador deles precisa
        // tratar o próprio pointerdown para poder ser arrastado, e o gatilho do
        // base-ui abre no clique — os dois no mesmo elemento disputariam o
        // gesto. Ancorando por elemento, o painel se posiciona igual sem que
        // ninguém precise ser um gatilho.
        anchor={anchor}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "bg-popover text-popover-foreground z-50 w-72 origin-(--transform-origin) rounded-lg border p-3 shadow-md outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverContent };
