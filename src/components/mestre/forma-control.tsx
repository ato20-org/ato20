"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CORES_LAPIS,
  ESPESSURAS_LAPIS,
  useToolStore,
} from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";

/**
 * A cor, a espessura e o fundo da próxima forma.
 *
 * Irmã do `PencilControl`, e pelas mesmas razões: só aparece com a ferramenta
 * na mão, e o gatilho mostra a cor escolhida em vez de um ícone genérico —
 * antes de desenhar, a cor é a única informação que importa.
 *
 * O fundo tem "sem fundo" como primeira opção e como padrão: a forma existe
 * para CERCAR, e uma caixa cheia taparia o que ela aponta.
 */
export function FormaControl({
  lado = "top",
}: {
  /**
   * De que lado o painel abre. `top` é o do rodapé, onde o controle nasceu;
   * `right` é o da régua do quadro, encostada na borda esquerda -- para cima,
   * dali, o painel subiria por cima das próprias ferramentas.
   */
  lado?: "top" | "right";
} = {}) {
  const tool = useToolStore((state) => state.tool);
  const cor = useToolStore((state) => state.corForma);
  const espessura = useToolStore((state) => state.espessuraForma);
  const fundo = useToolStore((state) => state.fundoForma);
  const setForma = useToolStore((state) => state.setForma);

  if (tool !== "forma") return null;

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Cor da forma">
                  {/* Sem cor escolhida, o gatilho mostra a do tema -- que é a
                      que a forma vai ter. Ver `Forma`. */}
                  <span
                    className="border-foreground size-4 rounded-full border-2"
                    style={{
                      ...(cor ? { borderColor: cor } : {}),
                      background: fundo ?? "transparent",
                    }}
                  />
                </Button>
              }
            />
          }
        />
        <TooltipContent>
          <p>Cor, espessura e fundo</p>
        </TooltipContent>
      </Tooltip>

      <PopoverContent align="start" className="w-56 space-y-3 p-3" side={lado}>
        <div className="space-y-1.5">
          <span className="text-muted-foreground text-[10px]">Traço</span>

          <div className="flex items-center gap-1.5">
            {/* O padrão na frente, como na paleta do gizmo: é a cor do tema, e
                sem este botão escolher uma cor seria caminho sem volta. */}
            <button
              type="button"
              aria-label="Traço padrão"
              aria-pressed={cor === undefined}
              className={cn(
                "grid size-6 place-items-center rounded-full border text-[10px] transition-transform",
                cor === undefined
                  ? "border-foreground scale-110"
                  : "border-white/20 hover:scale-105",
              )}
              onClick={() => setForma({ corForma: null })}
            >
              A
            </button>
            {CORES_LAPIS.map((opcao) => (
              <button
                key={opcao}
                type="button"
                aria-label={`Traço ${opcao}`}
                aria-pressed={opcao === cor}
                className={cn(
                  "size-6 rounded-full border transition-transform",
                  opcao === cor
                    ? "border-foreground scale-110"
                    : "border-white/20 hover:scale-105",
                )}
                style={{ background: opcao }}
                onClick={() => setForma({ corForma: opcao })}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="text-muted-foreground text-[10px]">Fundo</span>

          <div className="flex items-center gap-1.5">
            {/* O vazado primeiro: é o padrão, e é o que se escolhe de volta. */}
            <button
              type="button"
              aria-label="Sem fundo"
              aria-pressed={fundo === undefined}
              className={cn(
                "grid size-6 place-items-center rounded-full border text-[10px] transition-transform",
                fundo === undefined
                  ? "border-foreground scale-110"
                  : "border-white/20 hover:scale-105",
              )}
              onClick={() => setForma({ fundoForma: null })}
            >
              ∅
            </button>
            {CORES_LAPIS.map((opcao) => (
              <button
                key={opcao}
                type="button"
                aria-label={`Fundo ${opcao}`}
                aria-pressed={opcao === fundo}
                className={cn(
                  "size-6 rounded-full border transition-transform",
                  opcao === fundo
                    ? "border-foreground scale-110"
                    : "border-white/20 hover:scale-105",
                )}
                // Translúcido: fundo chapado sobre o quadro esconderia o que
                // está atrás, e o que se quer é destacar a região.
                style={{ background: opcao, opacity: 0.35 }}
                onClick={() => setForma({ fundoForma: opcao })}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[10px]">Espessura</span>
            <span
              className="bg-foreground rounded-full"
              style={{
                width: espessura,
                height: espessura,
                maxWidth: 24,
                maxHeight: 24,
                ...(cor ? { background: cor } : {}),
              }}
            />
          </div>

          <Slider
            value={[
              ESPESSURAS_LAPIS.indexOf(
                espessura as (typeof ESPESSURAS_LAPIS)[number],
              ),
            ]}
            min={0}
            max={ESPESSURAS_LAPIS.length - 1}
            step={1}
            aria-label="Espessura"
            onValueChange={(valor) => {
              const indice = Array.isArray(valor) ? valor[0] : valor;
              setForma({ espessuraForma: ESPESSURAS_LAPIS[indice ?? 1] });
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
