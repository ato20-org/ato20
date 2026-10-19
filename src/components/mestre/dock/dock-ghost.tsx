"use client";

import { SquareArrowOutUpRight } from "lucide-react";

import { t } from "@/lib/i18n/mestre";
import { useDockDragStore } from "@/lib/store/use-dock-drag-store";

/**
 * A etiqueta que segue o cursor enquanto uma aba é arrastada.
 *
 * Existe porque tirar uma aba da coluna não mexia nada na tela: a aba fica onde
 * está, a janela só nasce quando o dedo solta, e no meio do caminho o gesto
 * parecia não ter pegado. Arrastar o cabeçalho de uma janela flutuante nunca
 * teve esse problema — ali o que segue o cursor é a própria janela.
 *
 * Mostra o TÍTULO, e não uma miniatura da janela: renderizar o conteúdo de novo
 * num fantasma custaria as mesmas leituras por IPC da janela verdadeira, a cada
 * gesto, para algo que vive meio segundo.
 *
 * A posição vem do store uma vez, na largada, e depois é escrita direto no DOM
 * pelo arrasto — ver `data-dock-fantasma` em `dock-drag`.
 */
export function DockGhost() {
  const fantasma = useDockDragStore((state) => state.fantasma);
  const fora = useDockDragStore((state) => state.fora);

  // Com a mão fora do ATO20, a etiqueta não está à vista -- ela vive na camada
  // --, e o que se diz é o que soltar ali faz.
  if (fora) {
    return (
      <div
        aria-hidden
        className="bg-popover text-popover-foreground animate-in fade-in-0 slide-in-from-bottom-2 pointer-events-none absolute bottom-4 left-1/2 z-[110] flex -translate-x-1/2 items-center gap-2 rounded-md border px-3 py-1.5 text-xs shadow-xl duration-150 motion-reduce:animate-none"
      >
        <SquareArrowOutUpRight className="size-3.5" />
        {t.janela.soltarFora}
      </div>
    );
  }

  if (!fantasma) return null;

  return (
    <div
      aria-hidden
      data-dock-fantasma
      className="bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 pointer-events-none absolute z-[110] max-w-48 truncate rounded-md border px-2 py-1 text-xs shadow-xl duration-100 motion-reduce:animate-none"
      style={{ left: fantasma.x, top: fantasma.y }}
    >
      {fantasma.titulo}
    </div>
  );
}
