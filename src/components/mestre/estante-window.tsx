"use client";

import { BookOpen, Columns2, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import { useEstante } from "@/hooks/use-estante";
import { useFecharJanela } from "@/hooks/use-fechar-janela";
import { useLeitorStore } from "@/lib/store/use-leitor-store";
import { chaveDe } from "@/lib/store/use-window-store";
import type { Livro } from "@/lib/vault/estante";

/**
 * A estante: os livros de regras desta máquina.
 *
 * Da MÁQUINA e não da campanha, e é a decisão que dá forma a este painel. O
 * manual de um sistema serve todas as mesas daquele sistema — guardado dentro de
 * uma campanha, o mesmo PDF de oitenta megabytes seria copiado uma vez por mesa
 * e viajaria em cada zip exportado. A consequência boa é que a lista funciona
 * com a mesa fechada: o mestre consulta uma regra antes de escolher a campanha
 * da noite.
 *
 * O que é da campanha são os MARCADORES, e eles moram no leitor. Ver
 * `useMarcadores`.
 */
export function EstanteBody() {
  const { livros, importar, remover } = useEstante();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-2">
        <Button
          className="w-full"
          variant="outline"
          size="sm"
          onClick={() => void importar()}
        >
          <Upload />
          Importar livros
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {livros.length === 0 ? (
          <p className="text-muted-foreground p-3 text-xs">
            Nenhum livro ainda. Só PDF entra, e ele é copiado para a máquina: o
            arquivo pode sair do pendrive depois. Os livros não viajam no zip da
            campanha.
          </p>
        ) : (
          <ul className="space-y-1 p-2">
            {livros.map((livro) => (
              <LivroRow
                key={livro.id}
                livro={livro}
                onRemove={() => void remover(livro.id)}
              />
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}

/** Megabytes com uma casa: tamanho de manual não se lê em bytes. */
function tamanhoLegivel(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function LivroRow({ livro, onRemove }: { livro: Livro; onRemove: () => void }) {
  const abrirJanela = useAbrirJanela();
  const fecharJanela = useFecharJanela();
  const abrirNoSplit = useLeitorStore((state) => state.abrirNoSplit);
  const noSplit = useLeitorStore((state) => state.livroId === livro.id);
  const fecharSplit = useLeitorStore((state) => state.fecharSplit);

  return (
    <li className="group/livro hover:bg-accent/50 flex items-center gap-1 rounded-md p-1">
      <button
        type="button"
        // O clique na linha abre como JANELA, que é a casa que empilha: dois
        // manuais abertos ao mesmo tempo é o caso comum de comparar regra. O
        // split, que é um por vez, tem botão próprio.
        onClick={() =>
          abrirJanela({
            tipo: "livro",
            livroId: livro.id,
            titulo: livro.titulo,
          })
        }
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <BookOpen className="text-muted-foreground size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">
            {livro.titulo}
          </span>
          <span className="text-muted-foreground block truncate text-[0.7rem] tabular-nums">
            {tamanhoLegivel(livro.tamanho)}
            {/* A página só aparece depois de a primeira abertura contar o
                documento: quem copia o arquivo é o Rust, e ele não o abre. */}
            {livro.paginas ? ` · p. ${livro.pagina} de ${livro.paginas}` : null}
          </span>
        </span>
      </button>

      <div className="flex opacity-0 transition-opacity group-hover/livro:opacity-100 group-focus-within/livro:opacity-100">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Abrir ${livro.titulo} ao lado do palco`}
                onClick={() => abrirNoSplit(livro.id)}
              >
                <Columns2 />
              </Button>
            }
          />
          <TooltipContent>
            <p>Abrir ao lado do palco</p>
          </TooltipContent>
        </Tooltip>

        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Tirar ${livro.titulo} da estante`}
          onClick={() => {
            // As duas casas fecham ANTES de o arquivo sair do disco: um leitor
            // aberto sobre um livro removido continuaria pedindo faixas de um
            // PDF que já não existe, e o mestre veria a página em branco sem
            // pista do motivo. Vale para a janela e para o split.
            fecharJanela(
              chaveDe({
                tipo: "livro",
                livroId: livro.id,
                titulo: livro.titulo,
              }),
            );
            if (noSplit) fecharSplit();

            onRemove();
          }}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}
