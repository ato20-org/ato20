"use client";

import { Eye, EyeOff, FlipHorizontal, Frame, Trash2, UserSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { cn } from "@/lib/utils";
import type { Portrait } from "@/types/scene";

/**
 * Os retratos da sessão.
 *
 * Lista separada do acervo porque são coisas diferentes: o acervo é o arquivo,
 * e aqui está a cópia que está em cena — a mesma imagem pode ser retrato de um
 * NPC e fundo de outra cena ao mesmo tempo.
 *
 * Não pertence à cena: trocar de mapa não mexe nesta lista.
 */
export function PortraitList() {
  const portraits = usePortraitStore((state) => state.portraits);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        {portraits.length === 0 ? (
          <p className="text-muted-foreground p-3 text-xs">
            Nenhum retrato. Na aba Imagens, use o botão de retrato numa imagem para pôr o
            personagem sobre a cena. Ele fica preso à câmera, então aproximar o mapa não o move.
          </p>
        ) : (
          <ul className="space-y-1 p-2">
            {portraits.map((portrait) => (
              <PortraitRow key={portrait.id} portrait={portrait} />
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}

function PortraitRow({ portrait }: { portrait: Portrait }) {
  const url = useAssetUrl(portrait.assetId);
  const update = usePortraitStore((state) => state.update);
  const remove = usePortraitStore((state) => state.remove);
  const selectedIds = useSelectionStore((state) => state.selectedPortraitIds);
  const selectPortrait = useSelectionStore((state) => state.selectPortrait);
  const togglePortrait = useSelectionStore((state) => state.togglePortrait);

  const selected = selectedIds.includes(portrait.id);

  return (
    <li
      className={cn(
        "flex items-center gap-1 rounded-md p-1",
        selected ? "bg-accent" : "hover:bg-accent/50",
      )}
    >
      {/* A miniatura seleciona: é o caminho para as alças aparecerem no palco
          quando o retrato está atrás de outro, ou fora do enquadramento atual. */}
      <button
        type="button"
        aria-label="Selecionar retrato"
        aria-pressed={selected}
        className="bg-muted size-10 shrink-0 overflow-hidden rounded"
        // Shift soma à seleção, como no palco: é assim que se pega o elenco
        // inteiro para redimensionar tudo junto.
        onClick={(event) =>
          event.shiftKey ? togglePortrait(portrait.id) : selectPortrait(portrait.id)
        }
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="size-full object-cover" draggable={false} />
        ) : (
          <UserSquare className="text-muted-foreground m-auto size-4" aria-hidden />
        )}
      </button>

      <span className="min-w-0 flex-1 text-xs">
        {portrait.visible ? (
          <span className="text-muted-foreground">no ar</span>
        ) : (
          <span className="text-muted-foreground/60">só você vê</span>
        )}
      </span>

      <Toggle
        active={portrait.visible}
        label={portrait.visible ? "Tirar do ar" : "Pôr no ar"}
        hint={
          portrait.visible
            ? "A mesa está vendo este retrato."
            : "Fora do ar: aparece apagado só no teu palco."
        }
        onClick={() => update(portrait.id, { visible: !portrait.visible })}
      >
        {portrait.visible ? <Eye /> : <EyeOff />}
      </Toggle>

      <Toggle
        active={Boolean(portrait.flipX)}
        label="Espelhar"
        hint="Vira o retrato para o lado da tela em que ele está."
        onClick={() => update(portrait.id, { flipX: !portrait.flipX })}
      >
        <FlipHorizontal />
      </Toggle>

      <Toggle
        active={Boolean(portrait.framed)}
        label="Moldura"
        hint="Borda e sombra, para o retrato não parecer recorte colado no mapa."
        onClick={() => update(portrait.id, { framed: !portrait.framed })}
      >
        <Frame />
      </Toggle>

      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Remover retrato"
        onClick={() => remove(portrait.id)}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

/** Botão de estado: o ícone diz o que é, e o fundo diz se está ligado. */
function Toggle({
  active,
  label,
  hint,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  hint: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={active ? "secondary" : "ghost"}
            size="icon-xs"
            aria-label={label}
            aria-pressed={active}
            onClick={onClick}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>
        <p className="max-w-48">{hint}</p>
      </TooltipContent>
    </Tooltip>
  );
}
