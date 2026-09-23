"use client";

import { useArrastoDePosicao } from "@/hooks/use-arrasto-de-posicao";
import { cn } from "@/lib/utils";

/** Altura mínima de uma barra, em porcentagem. Zero desapareceria. */
const MIN_ALTURA = 8;

/** Quantas barras a linha lisa tem enquanto os picos não chegam. */
const BARRAS_LISAS = 120;

/**
 * A forma da onda, com a parte tocada acesa.
 *
 * Substituiu um slider comum. Um slider diz onde a faixa está; a onda diz
 * também **como ela é** — onde tem batida, onde tem silêncio, onde o trecho
 * calmo começa. Numa mesa isso é útil de verdade: dá para achar a virada da
 * música sem ouvir até lá.
 *
 * Fica só na barra do pé, e é a navegação rica da trilha. O painel de sons tem
 * uma barra fina por canal — ver `BarraDeProgresso` —, porque lá o que se quer
 * é enxergar quatro camadas de uma vez, e quatro ondas numa coluna estreita não
 * mostram forma nenhuma. O gesto dos dois é o mesmo hook.
 */
export function TrackWave({
  nome,
  peaks,
  position,
  duration,
  onSeek,
}: {
  /** O que está tocando, para o leitor de tela. */
  nome: string;
  /** Um valor de 0 a 100 por barra. Vazio desenha a linha lisa. */
  peaks: number[] | null;
  position: number;
  duration: number;
  onSeek: (segundos: number) => void;
}) {
  const { ref, fracao, conhecida, props } = useArrastoDePosicao({
    rotulo: nome,
    position,
    duration,
    onSeek,
  });

  // Sem picos ainda — medindo, ou arquivo que o browser não decodifica. Uma
  // linha lisa é honesta: mostra a posição sem inventar uma forma.
  const barras =
    peaks && peaks.length > 0
      ? peaks
      : Array.from({ length: BARRAS_LISAS }, () => 12);
  const tocadas = Math.round(fracao * barras.length);

  return (
    <div
      ref={ref}
      {...props}
      className={cn(
        "focus-visible:ring-ring flex h-7 min-w-24 flex-1 items-center gap-px rounded focus-visible:ring-2 focus-visible:outline-none",
        conhecida ? "cursor-pointer" : "cursor-default opacity-60",
      )}
    >
      {barras.map((altura, indice) => (
        <span
          key={indice}
          // `pointer-events-none` nas barras: o alvo do gesto é a trilha
          // inteira, e sem isso `clientX` continuaria certo mas o `currentTarget`
          // do `pointerup` poderia ser uma barra, quebrando a captura.
          className={cn(
            "pointer-events-none min-w-px flex-1 rounded-full transition-colors",
            indice < tocadas ? "bg-foreground" : "bg-muted-foreground/30",
          )}
          style={{ height: `${Math.max(MIN_ALTURA, altura)}%` }}
        />
      ))}
    </div>
  );
}
