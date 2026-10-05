"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { Eye, EyeOff, LayoutGrid, Trash2 } from "lucide-react";

import { NomeDoMedidor } from "@/components/mestre/linha-de-medidor";
import {
  ICONES_DA_CONDICAO,
  SeloDaCondicao,
} from "@/components/playground/selos-da-condicao";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { definicaoDoEfeito, EFEITOS_DE_FABRICA } from "@/lib/efeitos";
import { useDeclarativoStore } from "@/lib/store/use-declarativo-store";
import { CORES_LAPIS } from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";
import type { Condicao, PatchCondicao } from "@/types/character";

/**
 * Esconder e apagar só aparecem sob o cursor, como na linha do medidor. O olho
 * riscado é a exceção, pela mesma razão: esconder é um ESTADO.
 */
const SO_SOB_O_CURSOR =
  "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100";

/** Um título e uma linha, para os tooltips que mudam de tela para tela. */
export type Dica = { titulo: string; texto: string };

/**
 * Uma condição numa linha: a alça, o selo que abre a aparência, o nome com o
 * lápis, o efeito escrito ao lado, e o olho e a lixeira à direita.
 *
 * Uma só para a ficha do personagem e para o cardápio da campanha, pela razão
 * da `LinhaDeMedidor`: as duas telas mostram a mesma condição, e duas cópias
 * da linha divergiriam no primeiro ajuste. O que muda entre elas é o texto do
 * olho -- escondida quer dizer uma coisa em cada tela.
 */
export function LinhaDeCondicao({
  condicao,
  ocupado = false,
  dropTarget,
  onReorderStart,
  onEditar,
  onApagar,
  dicaDoOlho,
}: {
  condicao: Condicao;
  ocupado?: boolean;
  dropTarget: boolean;
  onReorderStart: (event: ReactPointerEvent) => void;
  onEditar: (patch: PatchCondicao) => void;
  onApagar: () => void;
  dicaDoOlho: Dica;
}) {
  const deFora = useDeclarativoStore((state) => state.efeitos);

  return (
    <li
      className={cn(
        "group flex h-8 items-center gap-1.5 rounded-md px-1",
        dropTarget && "ring-primary ring-1",
      )}
    >
      <span
        className="text-muted-foreground hover:text-foreground shrink-0 cursor-grab touch-none p-0.5"
        aria-hidden
        onPointerDown={onReorderStart}
      >
        <LayoutGrid className="size-4" />
      </span>

      <AparenciaDaCondicao
        condicao={condicao}
        ocupado={ocupado}
        onEditar={onEditar}
      />

      <div className="flex min-w-0 flex-1 items-center gap-0.5">
        <NomeDoMedidor
          nome={condicao.nome}
          ocupado={ocupado}
          onGravar={(nome) => onEditar({ nome })}
          rotulos={{ campo: "Nome da condição", lapis: "Renomear condição" }}
        />
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {condicao.efeito ? (
          <span className="text-muted-foreground pr-1 text-[10px]">
            {definicaoDoEfeito(condicao.efeito, deFora)?.titulo ?? condicao.efeito}
          </span>
        ) : null}

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={
                  condicao.escondido ? "Mostrar para a mesa" : "Esconder da mesa"
                }
                aria-pressed={condicao.escondido}
                disabled={ocupado}
                className={cn(!condicao.escondido && SO_SOB_O_CURSOR)}
                onClick={() => onEditar({ escondido: !condicao.escondido })}
              >
                {condicao.escondido ? <EyeOff /> : <Eye />}
              </Button>
            }
          />
          <TooltipContent>
            <p className="font-medium">{dicaDoOlho.titulo}</p>
            <p className="text-muted-foreground max-w-48">{dicaDoOlho.texto}</p>
          </TooltipContent>
        </Tooltip>

        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Apagar condição"
          disabled={ocupado}
          className={cn(
            "text-muted-foreground hover:text-destructive",
            SO_SOB_O_CURSOR,
          )}
          onClick={onApagar}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

/**
 * O ícone, a cor e o efeito, atrás do próprio selo.
 *
 * O botão É o selo, pela lição do `CorEForma`: um controle que mostra o que
 * controla não precisa ser descoberto. Os três juntos porque respondem a
 * mesma pergunta -- "como esta condição aparece na mesa".
 */
export function AparenciaDaCondicao({
  condicao,
  ocupado = false,
  onEditar,
}: {
  condicao: Pick<Condicao, "nome" | "cor" | "icone" | "efeito">;
  ocupado?: boolean;
  onEditar: (patch: PatchCondicao) => void;
}) {
  const efeito = condicao.efeito ?? null;
  const deFora = useDeclarativoStore((state) => state.efeitos);
  const definicao = definicaoDoEfeito(condicao.efeito, deFora);
  const dePlugin = Object.values(deFora);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Ícone, cor e efeito"
            disabled={ocupado}
            className="focus-visible:ring-ring shrink-0 rounded-full focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
          >
            <SeloDaCondicao condicao={condicao} tamanho={22} />
          </button>
        }
      />

      <PopoverContent align="start" className="w-64 space-y-3" side="bottom">
        <div className="space-y-1.5">
          <Label className="text-xs font-normal">Ícone</Label>
          <div className="grid grid-cols-8 gap-0.5">
            {ICONES_DA_CONDICAO.map(({ chave, rotulo, Icone }) => (
              <Tooltip key={chave}>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label={rotulo}
                      aria-pressed={condicao.icone === chave}
                      className={cn(
                        "hover:bg-muted grid size-7 place-items-center rounded",
                        condicao.icone === chave && "bg-muted ring-foreground/40 ring-1",
                      )}
                      onClick={() => onEditar({ icone: chave })}
                    >
                      <Icone
                        className="size-4"
                        style={{ color: condicao.cor }}
                        aria-hidden
                      />
                    </button>
                  }
                />
                <TooltipContent>{rotulo}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-normal">Cor</Label>
          <div className="flex gap-1">
            {CORES_LAPIS.map((opcao) => (
              <button
                key={opcao}
                type="button"
                aria-label={`Cor ${opcao}`}
                aria-pressed={condicao.cor === opcao}
                className={cn(
                  "size-6 rounded-full border-2",
                  condicao.cor === opcao
                    ? "border-foreground"
                    : "border-transparent",
                )}
                style={{ backgroundColor: opcao }}
                onClick={() => onEditar({ cor: opcao })}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-normal">Efeito na figura</Label>
          <div className="grid grid-cols-3 gap-1">
            <Button
              variant={efeito === null ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={efeito === null}
              className="h-7 px-1 text-[11px]"
              onClick={() => onEditar({ efeito: null })}
            >
              Nenhum
            </Button>
            {EFEITOS_DE_FABRICA.map((opcao) => (
              <OpcaoDeEfeito
                key={opcao.id}
                titulo={opcao.titulo}
                escolhido={efeito === opcao.id}
                onEscolher={() => onEditar({ efeito: opcao.id })}
              />
            ))}
          </div>
          {dePlugin.length > 0 ? (
            <>
              <p className="text-muted-foreground pt-1 text-[10px] tracking-wide uppercase">
                Dos plugins
              </p>
              <div className="grid grid-cols-3 gap-1">
                {dePlugin.map((opcao) => (
                  <OpcaoDeEfeito
                    key={opcao.id}
                    titulo={opcao.titulo}
                    escolhido={efeito === opcao.id}
                    onEscolher={() => onEditar({ efeito: opcao.id })}
                  />
                ))}
              </div>
            </>
          ) : null}
          {/* Uma linha só, e a do efeito escolhido: os nomes são curtos de
              propósito, e a explicação de todos ao mesmo tempo seria um
              parágrafo que ninguém lê para escolher um. */}
          <p className="text-muted-foreground text-[11px] leading-snug">
            {!efeito
              ? "Só o selo, sem mexer na figura."
              : definicao
                ? definicao.dica
                : "Um efeito que esta mesa não tem. Aparece só o selo."}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Um botão do seletor de efeito. O título inteiro no `title`: o de plugin pode
 * passar da largura do botão, e cortado não se distingue do vizinho.
 */
function OpcaoDeEfeito({
  titulo,
  escolhido,
  onEscolher,
}: {
  titulo: string;
  escolhido: boolean;
  onEscolher: () => void;
}) {
  return (
    <Button
      variant={escolhido ? "secondary" : "ghost"}
      size="sm"
      aria-pressed={escolhido}
      title={titulo}
      className="h-7 truncate px-1 text-[11px]"
      onClick={onEscolher}
    >
      {titulo}
    </Button>
  );
}
