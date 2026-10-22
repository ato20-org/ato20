"use client";

import { useEffect, useState } from "react";

import { t } from "@/lib/i18n/palco";
import type { EstadoDaConexao } from "@/lib/sync/channel";
import { cn } from "@/lib/utils";

/**
 * Quanto uma queda espera antes de aparecer. Quando a rede só oscilou, o vigia
 * reabre o fluxo num piscar, e uma tarja que surge e some em meio segundo na TV
 * da mesa chama mais atenção que a queda que ela anuncia.
 */
const ATRASO_MS = 2_500;

/**
 * A tarja de quem assiste quando o fio com o daemon cai no meio da sessão.
 *
 * Por cima da última cena, e não no lugar dela: a última imagem que a mesa
 * recebeu ainda é a melhor coisa a mostrar, e trocá-la por uma tela vazia
 * tiraria dos jogadores o mapa que estavam olhando por causa de um Wi-Fi que
 * volta em segundos. O que muda é que a tela PARA de fingir que está ao vivo.
 *
 * Irmã do palco, não filha, como os outros avisos: ver a nota em `JogadorStage`.
 * Sem `backdrop-blur`: filtro na TV é camada composta, e o fundo opaco lê igual.
 */
export function AvisoDeConexao({
  conexao,
  className,
}: {
  conexao: EstadoDaConexao | null;
  className?: string;
}) {
  const caiu = conexao !== null && conexao !== "no-ar";
  const [passou, setPassou] = useState(false);

  useEffect(() => {
    if (!caiu) return;

    const relogio = setTimeout(() => setPassou(true), ATRASO_MS);
    return () => {
      clearTimeout(relogio);
      // A próxima queda espera o atraso de novo.
      setPassou(false);
    };
  }, [caiu]);

  if (!caiu || !passou) return null;

  const desistiu = conexao === "recusado";

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-none absolute top-3 left-1/2 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full bg-black/80 px-3.5 py-1.5 text-sm text-white/90 shadow-lg",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full",
          desistiu ? "bg-red-500" : "animate-pulse bg-amber-400",
        )}
      />
      {conexao === "recusado"
        ? t.conexao.recusado
        : conexao === "mesa-fechada"
          ? t.conexao.mesaFechada
          : t.conexao.reconectando}
    </div>
  );
}
