"use client";

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
