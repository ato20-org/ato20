"use client";

import { Drama } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import { useCharacters } from "@/hooks/use-characters";
import { useWindowStore } from "@/lib/store/use-window-store";
import { cn } from "@/lib/utils";

/**
 * Quantos personagens a campanha tem, no canto do palco.
 *
 * Divide a pílula com os jogadores, e não tem uma própria: são as duas metades
 * da mesma pergunta — quem senta na mesa, e quem eles interpretam —, e duas
 * pílulas de um botão lado a lado leem como duas ferramentas sem relação. Quem
 * desenha a pílula é `OperatorShell`; aqui sai só o botão.
 *
 * O ícone é a máscara, e não outro grupo de gente: ao lado do de jogadores,
 * dois ícones de pessoas viravam a mesma silhueta duas vezes, e o que separa os
 * dois cantos é justamente pessoa contra papel que ela interpreta.
 *
 * A contagem sai do `useCharacters`, que relê quando qualquer janela mexe nos
 * personagens. Sem sondagem: personagem é conteúdo que só o mestre cria, e
 * ninguém mais o adiciona por trás dele — diferente da lista de jogadores, que
 * muda quando um celular entra.
 *
 * O botão fica marcado enquanto a janela da lista está aberta, e clicar de novo
 * a traz para a frente em vez de abrir uma segunda — quem garante isso é a
 * chave derivada do conteúdo, no store.
 */
export function CharactersChip() {
  const { personagens } = useCharacters();
  const abrir = useAbrirJanela();
  const aberta = useWindowStore((state) =>
    state.janelas.some((janela) => janela.conteudo.tipo === "personagens"),
  );

  const total = personagens?.length ?? null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={aberta ? "secondary" : "ghost"}
            size="icon-sm"
            className={cn(total ? "w-auto gap-1 px-2" : undefined)}
            aria-label="Personagens"
            onClick={() => abrir({ tipo: "personagens" })}
          >
            <Drama />
            {total ? <span className="text-xs tabular-nums">{total}</span> : null}
          </Button>
        }
      />
      <TooltipContent>
        <p className="font-medium">Personagens</p>
        <p className="text-muted-foreground max-w-52">
          Ficha, miniaturas e a quem cada um pertence. Abre como janela: fica na tela enquanto
          você mexe no mapa.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
