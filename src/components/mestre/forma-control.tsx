"use client";

import { Slider } from "@/components/ui/slider";
import {
  CORES_LAPIS,
  ESPESSURAS_LAPIS,
  useToolStore,
} from "@/lib/store/use-tool-store";
import { t } from "@/lib/i18n/ferramentas";
import { cn } from "@/lib/utils";

/**
 * A cor, o fundo e a espessura da próxima forma. Canto e traço não são
 * escolha: toda forma nasce à mão, com canto redondo -- ver `rabiscoDaForma`.
 *
 * Conteúdo, e não um popover: mora no painel de Elementos, no canto de baixo
 * à esquerda, aberto enquanto a forma está na mão -- ver `PainelDeElementos`.
 * Antes era um popover na régua, atrás de uma bolinha de cor, e cada ajuste
 * pedia abrir e fechar.
 *
 * O fundo tem "sem fundo" como primeira opção e como padrão: a forma existe
 * para CERCAR, e uma caixa cheia taparia o que ela aponta.
 */
export function AjustesDaForma() {
  const cor = useToolStore((state) => state.corForma);
  const espessura = useToolStore((state) => state.espessuraForma);
  const fundo = useToolStore((state) => state.fundoForma);
  const setForma = useToolStore((state) => state.setForma);

  return (
    <>
      <div className="space-y-1.5">
        <span className="text-muted-foreground text-[10px]">
          {t.forma.traco}
        </span>

        <div className="flex items-center gap-1.5">
          {/* O padrão na frente, como na paleta do gizmo: é a cor do tema, e
              sem este botão escolher uma cor seria caminho sem volta. */}
          <button
            type="button"
            aria-label={t.forma.tracoPadrao}
            aria-pressed={cor === undefined}
            className={cn(
              "grid size-6 place-items-center rounded-full border text-[10px] transition-transform",
              cor === undefined
                ? "border-foreground scale-110"
                : "border-white/20 hover:scale-105",
            )}
            onClick={() => setForma({ corForma: null })}
          >
            {t.forma.padraoLetra}
          </button>
          {CORES_LAPIS.map((opcao) => (
            <button
              key={opcao}
              type="button"
              aria-label={t.forma.tracoCor(opcao)}
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
        <span className="text-muted-foreground text-[10px]">
          {t.forma.fundo}
        </span>

        <div className="flex items-center gap-1.5">
          {/* O vazado primeiro: é o padrão, e é o que se escolhe de volta. */}
          <button
            type="button"
            aria-label={t.forma.semFundo}
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
              aria-label={t.forma.fundoCor(opcao)}
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
          <span className="text-muted-foreground text-[10px]">
            {t.forma.espessura}
          </span>
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
          aria-label={t.forma.espessura}
          onValueChange={(valor) => {
            const indice = Array.isArray(valor) ? valor[0] : valor;
            setForma({ espessuraForma: ESPESSURAS_LAPIS[indice ?? 1] });
          }}
        />
      </div>
    </>
  );
}
