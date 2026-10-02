"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * O campo de busca do cabeçalho de uma lista: lupa, texto, Esc limpa.
 *
 * Divide a linha com os botões de criar, como em Sons, Personagens e Arquivos:
 * é o que se faz no cabeçalho de uma lista, e empilhar gastaria uma linha
 * inteira de altura.
 *
 * `stopPropagation` no Esc porque o painel pode estar numa janela que fecha
 * com Esc, e limpar a busca não é fechar a janela.
 */
export function CampoDeBusca({
  valor,
  onMudar,
  placeholder,
  rotulo,
  dica,
  className,
}: {
  valor: string;
  onMudar: (valor: string) => void;
  placeholder: string;
  rotulo: string;
  dica?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-0 flex-1", className)}>
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
        aria-hidden
      />
      <Input
        value={valor}
        placeholder={placeholder}
        aria-label={rotulo}
        title={dica ?? `${rotulo}. Esc limpa.`}
        className="h-8 bg-transparent pl-8 text-xs dark:bg-transparent"
        onChange={(evento) => onMudar(evento.target.value)}
        onKeyDown={(evento) => {
          if (evento.key !== "Escape") return;
          evento.stopPropagation();
          onMudar("");
        }}
      />
    </div>
  );
}
