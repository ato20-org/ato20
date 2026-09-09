"use client";

import { useEffect, useState } from "react";
import { Users2 } from "lucide-react";

import { CharactersDialog } from "@/components/operator/characters-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { listCharacters } from "@/lib/vault/characters";
import { cn } from "@/lib/utils";

/**
 * Quantos personagens a campanha tem, no canto do palco.
 *
 * Mesma pílula das ferramentas, do zoom, do índice de pontos e dos jogadores.
 * Ao lado da de jogadores de propósito: são as duas metades da mesma pergunta
 * — quem senta na mesa, e quem eles interpretam — e a segmentação entre as duas
 * é justamente o que este trabalho introduziu.
 *
 * A contagem é lida uma vez e ao fechar o diálogo. Sem sondagem: personagem é
 * conteúdo que só o mestre cria, e ninguém mais o adiciona por trás dele —
 * diferente da lista de jogadores, que muda quando um celular entra.
 */
export function CharactersChip() {
  const [aberto, setAberto] = useState(false);
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    // Relê ao FECHAR o diálogo, que é quando o número pode ter mudado.
    if (aberto) return;

    let ativo = true;

    void listCharacters().then(
      (lista) => {
        if (ativo) setTotal(lista.length);
      },
      () => {
        // Sem campanha aberta a contagem não existe; a pílula fica só com o
        // ícone em vez de a tela cair.
        if (ativo) setTotal(null);
      },
    );

    return () => {
      ativo = false;
    };
  }, [aberto]);

  return (
    <>
      <div className="bg-background/85 pointer-events-auto flex items-center gap-0.5 rounded-lg border p-1 backdrop-blur">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={aberto ? "secondary" : "ghost"}
                size="icon-sm"
                className={cn(total ? "w-auto gap-1 px-2" : undefined)}
                aria-label="Personagens"
                onClick={() => setAberto(true)}
              >
                <Users2 />
                {total ? <span className="text-xs tabular-nums">{total}</span> : null}
              </Button>
            }
          />
          <TooltipContent>
            <p className="font-medium">Personagens</p>
            <p className="text-muted-foreground max-w-52">
              Ficha, miniaturas e a quem cada um pertence. O que está aqui fica na campanha, não
              na mão de quem joga.
            </p>
          </TooltipContent>
        </Tooltip>
      </div>

      <CharactersDialog open={aberto} onOpenChange={setAberto} />
    </>
  );
}
