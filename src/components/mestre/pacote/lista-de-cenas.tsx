"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { t } from "@/lib/i18n/mestre";

export type LinhaDeCena = { id: string; nome: string; pasta: string | null };

/**
 * Uma seção do diálogo de pacote: o título com o "Todos", e uma linha por
 * cena, com a pasta de onde ela vem em cinza.
 */
export function ListaDeCenas({
  titulo,
  cenas,
  marcadas,
  onMarcar,
}: {
  titulo: string;
  cenas: LinhaDeCena[];
  marcadas: ReadonlySet<string>;
  onMarcar: (ids: string[], marcar: boolean) => void;
}) {
  const quantas = cenas.filter((cena) => marcadas.has(cena.id)).length;
  const todas = cenas.length > 0 && quantas === cenas.length;

  return (
    <section className="flex flex-col gap-1.5">
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox
          checked={todas}
          indeterminate={quantas > 0 && !todas}
          disabled={cenas.length === 0}
          onCheckedChange={(marcar) => onMarcar(cenas.map((cena) => cena.id), marcar)}
        />
        <span className="flex-1">{titulo}</span>
        <span className="text-muted-foreground text-xs font-normal tabular-nums">
          {cenas.length === 0 ? t.pacote.nenhumaCena : t.pacote.marcados(quantas, cenas.length)}
        </span>
      </label>

      {cenas.length > 0 ? (
        <ul className="flex flex-col gap-0.5 border-l pl-3 ml-2">
          {cenas.map((cena) => (
            <li key={cena.id}>
              <label className="hover:bg-muted/50 flex items-center gap-2 rounded px-1.5 py-1 text-sm">
                <Checkbox
                  checked={marcadas.has(cena.id)}
                  onCheckedChange={(marcar) => onMarcar([cena.id], marcar)}
                />
                <span className="min-w-0 flex-1 truncate">{cena.nome}</span>
                {cena.pasta ? (
                  <span className="text-muted-foreground max-w-32 shrink-0 truncate text-xs">
                    {cena.pasta}
                  </span>
                ) : null}
              </label>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Marca ou desmarca `ids` num conjunto, devolvendo um conjunto novo. */
export function marcar(atual: ReadonlySet<string>, ids: string[], ligar: boolean): Set<string> {
  const proximo = new Set(atual);
  for (const id of ids) {
    if (ligar) proximo.add(id);
    else proximo.delete(id);
  }
  return proximo;
}
