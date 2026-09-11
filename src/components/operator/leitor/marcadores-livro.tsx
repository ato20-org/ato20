"use client";

import { useState } from "react";
import { BookmarkPlus, Check, Pencil, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMarcadores } from "@/hooks/use-marcadores";

/**
 * Os marcadores da campanha aberta, como tira lateral.
 *
 * Por campanha e não por máquina: a página que interessa muda de mesa — a
 * tabela de condições serve a campanha de horror, e a de veículos serve a
 * outra. Sem campanha aberta a tira diz isso em vez de mostrar uma lista vazia,
 * que pareceria um livro sem nenhuma página marcada.
 */
export function MarcadoresLivro({
  livroId,
  paginaAtual,
  aoEscolher,
}: {
  livroId: string;
  paginaAtual: number;
  aoEscolher: (pagina: number) => void;
}) {
  const { marcadores, semCampanha, marcar, renomear, remover } = useMarcadores(livroId);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");

  if (semCampanha) {
    return (
      <p className="text-muted-foreground text-xs">
        Marcar página pede uma campanha aberta: o marcador é da mesa, e o livro é
        da máquina. A leitura continua funcionando sem isso.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <Button variant="secondary" size="sm" onClick={() => void marcar(paginaAtual, "")}>
        <BookmarkPlus />
        Marcar a página {paginaAtual}
      </Button>

      {marcadores.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Nenhuma página marcada nesta campanha.
        </p>
      ) : null}

      <ul className="scroll-fade min-h-0 flex-1 space-y-1 overflow-y-auto">
        {marcadores.map((marcador) => (
          <li key={marcador.id} className="group/marcador flex items-center gap-1">
            {editando === marcador.id ? (
              <form
                className="flex flex-1 items-center gap-1"
                onSubmit={(evento) => {
                  evento.preventDefault();
                  void renomear(marcador.id, rascunho);
                  setEditando(null);
                }}
              >
                <Input
                  value={rascunho}
                  onChange={(evento) => setRascunho(evento.target.value)}
                  autoFocus
                  aria-label="Rótulo do marcador"
                  className="h-7 text-xs"
                />
                <Button type="submit" variant="ghost" size="icon-xs" aria-label="Confirmar">
                  <Check />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Cancelar"
                  onClick={() => setEditando(null)}
                >
                  <X />
                </Button>
              </form>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => aoEscolher(marcador.pagina)}
                  className="hover:bg-accent aria-[current=true]:bg-accent min-w-0 flex-1 rounded-md p-1.5 text-left"
                  aria-current={marcador.pagina === paginaAtual}
                >
                  <span className="text-muted-foreground text-[0.7rem] tabular-nums">
                    p. {marcador.pagina}
                  </span>
                  <span className="block truncate text-xs">{marcador.rotulo}</span>
                </button>

                {/* Aparecem no foco também, e não só no hover: quem chega por
                    teclado precisa alcançar renomear e remover. */}
                <div className="flex opacity-0 transition-opacity group-hover/marcador:opacity-100 group-focus-within/marcador:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Renomear ${marcador.rotulo}`}
                    onClick={() => {
                      setEditando(marcador.id);
                      setRascunho(marcador.rotulo);
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remover ${marcador.rotulo}`}
                    onClick={() => void remover(marcador.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
