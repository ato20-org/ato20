"use client";

import { Loader2, TriangleAlert } from "lucide-react";

import { t } from "@/lib/i18n/arquivos";
import type { SituacaoDoYoutube } from "@/lib/store/use-audio-store";
import { cn } from "@/lib/utils";
import { motivoDoErro } from "@/lib/youtube";

/**
 * O que um som do YouTube está fazendo, no lugar da onda ou da barra.
 *
 * Existe porque, sem ele, o som do YouTube carregando e o recusado tinham a
 * mesma cara: botão de pausa, `0:00` e `--:--`. O arquivo do disco carrega em
 * milissegundos e nunca precisou disto; o YouTube leva segundos para trazer o
 * player, e pode não tocar nunca. Ver `SituacaoDoYoutube`.
 *
 * O erro em vermelho e com o motivo, e não só "falhou": "o dono não deixa
 * tocar fora do YouTube" manda trocar de vídeo, "não respondeu" manda olhar a
 * internet, e o número do erro desconhecido é o que se pesquisa.
 */
export function AvisoDoYoutube({
  situacao,
  className,
}: {
  situacao: SituacaoDoYoutube;
  className?: string;
}) {
  const textos = t.audioLibrary.youtube;

  if (situacao.tipo === "carregando") {
    return (
      <span
        role="status"
        className={cn(
          "text-muted-foreground flex min-w-0 items-center gap-1.5 text-[11px]",
          className,
        )}
      >
        <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />
        <span className="truncate">{textos.carregando}</span>
      </span>
    );
  }

  const motivo = motivoDoErro(situacao.codigo);
  const texto = motivo === "player" ? textos.player(situacao.codigo) : textos[motivo];

  return (
    <span
      role="status"
      title={texto}
      className={cn("text-destructive flex min-w-0 items-center gap-1.5 text-[11px]", className)}
    >
      <TriangleAlert className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{texto}</span>
    </span>
  );
}
