"use client";

import { useMemo, useState } from "react";
import { MapPin, Paperclip, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePinWindowStore } from "@/lib/store/use-pin-window-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import { cn } from "@/lib/utils";
import type { MapPin as Ponto, Scene } from "@/types/scene";

/**
 * A lista de pontos de anotação da cena, buscável.
 *
 * Existe porque o alfinete só se acha olhando o mapa. Numa cena com doze
 * pontos, metade deles fora do recorte atual, "onde eu anotei o alçapão?" não
 * tinha resposta que não fosse afastar o zoom e varrer a tela — e afastar o
 * zoom encolhe os marcadores justamente na hora de procurá-los.
 *
 * No canto oposto ao das ferramentas e do zoom, e na mesma pílula: os do canto
 * esquerdo são gesto sobre o mapa — mira, ampliação, enquadramento —, e este é
 * consulta. Juntos, seriam mais quatro alvos numa fila que o mestre já lê da
 * esquerda para a direita procurando o cursor.
 */
export function PinIndex({ scene }: { scene: Scene }) {
  const centerOn = useViewportStore((state) => state.centerOn);
  const abrir = usePinWindowStore((state) => state.abrir);

  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");

  /**
   * Guarda o número do alfinete no mapa junto do ponto.
   *
   * O número é a POSIÇÃO na lista da cena, e é como o marcador se identifica no
   * palco. Filtrar a lista renumeraria os resultados, e "Ponto 2" na busca
   * apontaria para o alfinete 5 do mapa.
   */
  const numerados = useMemo(
    () => (scene.pins ?? []).map((pin, index) => ({ pin, numero: index + 1 })),
    // Sobre `scene.pins`, e não sobre uma cópia com `?? []`: a lista vazia
    // nasceria nova a cada render e o memo não guardaria nada.
    [scene.pins],
  );

  const total = numerados.length;

  const achados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return numerados;

    // Busca no título E na nota. Título é opcional — o campo aceita ficar
    // vazio —, e procurar só por ele deixaria um ponto sem nome
    // inencontrável, que é justamente o que mais precisa de busca.
    return numerados.filter(
      ({ pin }) =>
        pin.title.toLowerCase().includes(termo) || pin.note.toLowerCase().includes(termo),
    );
  }, [numerados, busca]);

  function ir(pin: Ponto) {
    setAberto(false);
    // A vista primeiro: sem isso o cartão apareceria amarrado a um alfinete
    // fora do recorte, com a linha saindo pela borda da tela.
    centerOn({ x: pin.x, y: pin.y });
    // Já aberta, só vem para a frente — e volta no canto onde foi deixada da
    // última vez.
    abrir(pin.id);
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <div className="bg-background/85 pointer-events-auto flex items-center gap-0.5 rounded-lg border p-1 backdrop-blur">
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <Button
                    variant={aberto ? "secondary" : "ghost"}
                    size="icon-sm"
                    // Largura própria quando há contagem: o número ao lado do
                    // ícone diz que existem pontos sem precisar abrir a lista.
                    className={cn(total > 0 && "w-auto gap-1 px-2")}
                    aria-label="Pontos de anotação"
                  >
                    <MapPin />
                    {total > 0 ? <span className="text-xs tabular-nums">{total}</span> : null}
                  </Button>
                }
              />
            }
          />
          <TooltipContent>
            <p className="font-medium">Pontos de anotação</p>
            <p className="text-muted-foreground max-w-48">
              A lista dos pontos desta cena. Escolher um leva a vista até ele.
            </p>
          </TooltipContent>
        </Tooltip>
      </div>

      <PopoverContent className="w-72 p-0" side="top" align="end">
        {total === 0 ? (
          <p className="text-muted-foreground p-3 text-xs leading-snug">
            Nenhum ponto nesta cena. Escolha a ferramenta de ponto, no canto oposto, e clique no
            mapa.
          </p>
        ) : (
          <>
            <div className="relative border-b">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
                aria-hidden
              />
              <Input
                autoFocus
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar por nome ou pela nota"
                aria-label="Buscar ponto"
                className="h-9 border-0 pl-8 text-sm shadow-none focus-visible:ring-0"
              />
            </div>

            {achados.length === 0 ? (
              <p className="text-muted-foreground p-3 text-xs">Nada com esse texto.</p>
            ) : (
              // Teto de altura, e não a lista inteira: com trinta pontos o
              // painel cobriria o mapa que ele serve para navegar.
              <ScrollArea className="max-h-64">
                <ul className="p-1">
                  {achados.map(({ pin, numero }) => (
                    <li key={pin.id}>
                      <button
                        type="button"
                        className="hover:bg-accent flex w-full items-start gap-2 rounded-md p-1.5 text-left"
                        onClick={() => ir(pin)}
                      >
                        <span
                          className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-amber-400 text-[10px] font-semibold text-amber-950 tabular-nums"
                          aria-hidden
                        >
                          {numero}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium">
                            {pin.title || `Ponto ${numero}`}
                          </span>
                          {/* Uma linha da nota, para distinguir dois pontos de
                              título parecido sem abrir os dois. */}
                          {pin.note ? (
                            <span className="text-muted-foreground block truncate text-[10px]">
                              {pin.note}
                            </span>
                          ) : null}
                        </span>

                        {pin.attachments.length > 0 ? (
                          <span className="text-muted-foreground mt-0.5 flex shrink-0 items-center gap-0.5 text-[10px]">
                            <Paperclip className="size-3" aria-hidden />
                            {pin.attachments.length}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
