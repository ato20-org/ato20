"use client";

import { useArrastoDePosicao } from "@/hooks/use-arrasto-de-posicao";
import { mmss } from "@/lib/mestre/tempo";
import { cn } from "@/lib/utils";

/**
 * Onde um canal está: tempo, barra fina, tempo.
 *
 * A versão de painel da `TrackWave`. Lá a onda mostra a FORMA da música, e vale
 * a altura que ocupa; aqui são quatro camadas numa coluna estreita, e quatro
 * ondas empilhadas não mostrariam forma nenhuma — só roubariam a altura da
 * lista. Uma linha de um pixel responde a pergunta que se faz num mixer: isto
 * ainda está andando, e falta quanto.
 *
 * Sem `onSeek` ela só acompanha, e o hook cuida de tirar o foco e o cursor. É o
 * ambiente, que toca em loop.
 */
export function BarraDeProgresso({
  nome,
  position,
  duration,
  onSeek,
}: {
  nome: string;
  position: number;
  duration: number;
  onSeek?: (segundos: number) => void;
}) {
  const { ref, mostrado, fracao, conhecida, props } = useArrastoDePosicao({
    rotulo: nome,
    position,
    duration,
    onSeek,
  });

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground w-7 shrink-0 text-right text-[10px] tabular-nums">
        {mmss(mostrado)}
      </span>

      {/* `h-3` no alvo do gesto e `h-1` no traço: um pixel de altura é o que se
          quer ver, e não o que se consegue acertar com o mouse. */}
      <div
        ref={ref}
        {...props}
        className={cn(
          "focus-visible:ring-ring flex h-3 min-w-8 flex-1 items-center rounded focus-visible:ring-2 focus-visible:outline-none",
          onSeek && conhecida ? "cursor-pointer" : "cursor-default",
        )}
      >
        <span className="bg-muted-foreground/25 pointer-events-none relative h-1 w-full overflow-hidden rounded-full">
          <span
            className="bg-foreground absolute inset-y-0 left-0"
            style={{ width: `${fracao * 100}%` }}
          />
        </span>
      </div>

      <span className="text-muted-foreground w-7 shrink-0 text-[10px] tabular-nums">
        {conhecida ? mmss(duration) : "--:--"}
      </span>
    </div>
  );
}
