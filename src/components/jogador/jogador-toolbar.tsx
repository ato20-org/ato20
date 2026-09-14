"use client";

import type { ReactNode } from "react";

import { SaquinhoJogador } from "@/components/jogador/saquinho-jogador";
import { cn } from "@/lib/utils";

/**
 * A barra de baixo do Jogador.
 *
 * Era uma `TabsList` — uma pílula centralizada com as abas dentro. Com uma aba
 * só, no celular em pé, ela anunciava uma escolha que não existia; e não havia
 * onde pôr o saquinho, que por isso flutuava por cima do conteúdo.
 *
 * Agora é uma barra de aplicativo de celular: navegação nas pontas, ação
 * principal no meio. O centro é o ponto que o polegar de qualquer mão alcança
 * sem trocar a pegada, e é o que o dado merece — numa mesa de RPG, rolar é o
 * que mais se faz num aparelho desses.
 *
 * SOLTA das bordas, e não colada no fim da tela: a barra é um cartão sobre o
 * fundo, com a bolinha atravessando a borda de cima. É o que deixa claro que
 * ela flutua sobre o conteúdo em vez de ser o fim dele — e é o que dá à
 * bolinha uma borda para atravessar. Em tela baixa a folga encolhe: deitado,
 * cada pixel de altura está sendo disputado pela cena.
 *
 * `env(safe-area-inset-bottom)` embaixo: no iPhone a barra de gestos come os
 * últimos pixels, e sem a folga os alvos ficavam debaixo dela.
 */
export function JogadorToolbar({
  esquerda,
  direita,
}: {
  esquerda: ReactNode;
  direita: ReactNode;
}) {
  return (
    <div className="shrink-0 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] [@media(max-height:520px)]:px-2 [@media(max-height:520px)]:pb-[calc(env(safe-area-inset-bottom)+0.375rem)]">
      <nav className="bg-card flex h-16 items-center justify-between gap-1 rounded-3xl border px-2 shadow-lg select-none [@media(max-height:520px)]:h-14">
        <div className="flex flex-1 justify-evenly">{esquerda}</div>

        <SaquinhoJogador />

        <div className="flex flex-1 justify-evenly">{direita}</div>
      </nav>
    </div>
  );
}

/**
 * Um destino da barra.
 *
 * Ícone em cima, rótulo embaixo, como em qualquer barra de celular: o ícone é o
 * que se acha de relance depois da primeira sessão, e o rótulo é o que ensina
 * na primeira. Os dois juntos custam 44px de altura, que é o alvo mínimo de
 * dedo — o rótulo sai de graça.
 *
 * O ativo ganha fundo, e não só cor de texto: sobre um cartão, dois cinzas de
 * texto diferentes é a diferença que ninguém vê no escuro de uma sala de jogo.
 */
export function ToolbarItem({
  ativo,
  icone,
  rotulo,
  onClick,
}: {
  ativo: boolean;
  icone: ReactNode;
  rotulo: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // `aria-current`, e não `role="tab"`: os painéis são trocados por estado,
      // sem as setas e o foco que um conjunto de abas de verdade promete.
      aria-current={ativo ? "page" : undefined}
      className={cn(
        "flex min-w-16 flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-[11px] font-medium transition-colors",
        "[&_svg]:size-5 [&_svg]:shrink-0",
        ativo
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icone}
      {rotulo}
    </button>
  );
}
