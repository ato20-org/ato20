"use client";

import { useMemo, useState } from "react";
import { Dices, Eraser, Trash2 } from "lucide-react";

import { DadoParado } from "@/components/playground/dado-parado";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRolagensStore } from "@/lib/store/use-rolagens-store";
import { cn } from "@/lib/utils";
import { valorDaRolagem, type RolagemDaMesa } from "@/types/dado";

/**
 * As rolagens dos jogadores, na pílula do canto do palco.
 *
 * Segundo chip da mesma moldura de Jogadores, e é ali que ele pertence: as duas
 * respondem sobre a MESA, e não sobre o mapa — quem entrou, e o que eles
 * tiraram. O saquinho do mestre continua flutuando sobre a cena, porque é
 * ferramenta de quem opera, não consulta sobre os outros.
 *
 * O contador conta o que está na mesa AGORA, não o histórico: é o número que
 * responde "tem dado esperando leitura?" sem abrir nada.
 *
 * Três coisas num lugar só, que é o que o canto do palco pede: ver o que caiu,
 * limpar, e conferir o que passou. Espalhá-las em dois controles faria o mestre
 * procurar no meio da sessão.
 */
export function RolagensChip() {
  const [aberto, setAberto] = useState(false);

  const bandeja = useRolagensStore((state) => state.bandeja);
  const historico = useRolagensStore((state) => state.historico);
  const limpar = useRolagensStore((state) => state.limpar);
  const esquecer = useRolagensStore((state) => state.esquecer);

  const naMesa = bandeja.length;

  /**
   * O histórico sem o que ainda está na mesa.
   *
   * A mesma rolagem está nas duas listas — a bandeja é um recorte do histórico
   * —, e mostrá-la em cima e embaixo faria o mestre contar dois dados onde caiu
   * um. Some daqui quando expira lá.
   */
  const passado = useMemo(() => {
    const naMesaIds = new Set(bandeja.map((rolagem) => rolagem.id));

    return historico.filter((rolagem) => !naMesaIds.has(rolagem.id));
  }, [bandeja, historico]);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant={aberto ? "secondary" : "ghost"}
                  size="icon-sm"
                  className={cn(naMesa > 0 && "w-auto gap-1 px-2")}
                  aria-label={`Rolagens dos jogadores (${naMesa} na mesa)`}
                >
                  <Dices />
                  {naMesa > 0 ? <span className="text-xs tabular-nums">{naMesa}</span> : null}
                </Button>
              }
            />
          }
        />
        <TooltipContent>
          <p className="font-medium">Rolagens</p>
          <p className="text-muted-foreground max-w-48">
            {naMesa > 0
              ? `${naMesa} na mesa agora. Elas saem sozinhas em trinta segundos.`
              : "O que os jogadores tiraram no celular aparece aqui."}
          </p>
        </TooltipContent>
      </Tooltip>

      <PopoverContent className="w-72 p-0" side="bottom" align="end">
        {historico.length === 0 ? (
          <p className="text-muted-foreground p-3 text-xs leading-snug">
            Ninguém rolou ainda. Quem entrou pela Plateia tem o saquinho na tela do celular — e o
            dado é sorteado aqui, nesta máquina, não no aparelho de quem joga.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <p className="text-xs font-medium">Na mesa</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-1.5 text-xs"
                disabled={naMesa === 0}
                onClick={limpar}
              >
                <Trash2 className="size-3" />
                Limpar tudo
              </Button>
            </div>

            {naMesa === 0 ? (
              <p className="text-muted-foreground px-3 py-2 text-xs">
                Nada na mesa agora.
              </p>
            ) : (
              <ul className="divide-y">
                {bandeja.map((rolagem) => (
                  <Linha key={rolagem.id} rolagem={rolagem} />
                ))}
              </ul>
            )}

            {passado.length > 0 ? (
              <>
                <div className="flex items-center justify-between gap-2 border-y px-3 py-2">
                  <p className="text-muted-foreground text-xs font-medium">Antes</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-1.5 text-xs"
                    onClick={esquecer}
                  >
                    <Eraser className="size-3" />
                    Esquecer
                  </Button>
                </div>

                {/* Rolagem é a coisa que mais acontece numa sessão, e a lista
                    cresce o tempo todo. Altura fixa aqui, e não no popover
                    inteiro: o que está NA MESA não pode sair de vista por causa
                    do que já passou. */}
                <ScrollArea className="max-h-56">
                  <ul className="divide-y opacity-70">
                    {passado.map((rolagem) => (
                      <Linha key={rolagem.id} rolagem={rolagem} />
                    ))}
                  </ul>
                </ScrollArea>
              </>
            ) : null}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Uma rolagem: quem, que dado, e quanto deu. */
function Linha({ rolagem }: { rolagem: RolagemDaMesa }) {
  return (
    <li className="flex items-center gap-2 px-3 py-1.5">
      <DadoParado faces={rolagem.faces} valor={rolagem.valor} tamanho={22} />

      <span className="min-w-0 flex-1 truncate text-xs">{rolagem.jogador}</span>

      <span className="text-muted-foreground text-[10px] tabular-nums">d{rolagem.faces}</span>

      <span className="w-6 text-right text-sm font-semibold tabular-nums">
        {valorDaRolagem(rolagem.faces, rolagem.valor)}
      </span>
    </li>
  );
}
