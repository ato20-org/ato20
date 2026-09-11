"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * As docas de ferramentas da tela deitada.
 *
 * A cena é o palco; o resto é ferramenta. Painéis fixos nas laterais faziam o
 * contrário — a ficha e o saquinho ficavam na tela a sessão inteira, cada um
 * comendo um quarto da largura, e o mapa, que é o motivo de todo mundo estar
 * olhando, ficava espremido no meio.
 *
 * A doca não toma largura nenhuma: é uma pílula FLUTUANTE sobre a cena, colada
 * na borda e centrada na altura. A faixa que ela cobre do mapa é de 48px numa
 * ponta — contra a coluna inteira que a trilha com borda tirava do palco.
 *
 * Centrada na vertical porque é onde a mão está: deitado, o polegar cai no meio
 * da lateral do aparelho, não no alto nem no pé.
 */
export function Dock({ lado, children }: { lado: "esquerda" | "direita"; children: ReactNode }) {
  return (
    <nav
      className={cn(
        "bg-card/80 absolute top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1 rounded-full border p-1.5 shadow-lg backdrop-blur select-none",
        lado === "esquerda" ? "left-3" : "right-3",
      )}
    >
      {children}
    </nav>
  );
}

/**
 * Um botão da doca.
 *
 * 44px de alvo, que é o mínimo de dedo, e só o ícone: o rótulo vai no título da
 * gaveta que ele abre. Ativo ganha fundo, e não só cor — no escuro de uma sala
 * de jogo, dois cinzas de ícone são o mesmo cinza.
 */
export function DockButton({
  ativo,
  rotulo,
  icone,
  onClick,
}: {
  ativo: boolean;
  rotulo: string;
  icone: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={rotulo}
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        "size-11 rounded-full [&_svg]:size-5",
        ativo && "bg-accent text-accent-foreground",
      )}
    >
      {icone}
    </Button>
  );
}

/**
 * A gaveta que uma ferramenta abre.
 *
 * SOBRE a cena, e não ao lado dela: o mapa continua atrás, e o jogador que abre
 * a ficha para conferir uma coisa não perde de vista o que está acontecendo.
 * Deitado dá para fazer isso sem cobrir tudo — é a vantagem do formato, e é o
 * oposto do modal de tela cheia que o celular em pé obriga.
 *
 * Largura contida: o suficiente para a ficha respirar, nunca tanto que a cena
 * vire um filete. Em telas grandes ela para de crescer — uma coluna de texto de
 * 700px não se lê melhor, e a cena tem mais o que fazer com o espaço.
 *
 * A altura é do CONTEÚDO, não da tela. Esticada de cima a baixo, a gaveta do
 * inventário era um painel preto de 900px com três quadrinhos no topo — o
 * fundo cobrindo a cena sem ter o que pôr ali. Agora ela cresce até onde o
 * conteúdo pede e para; só passa a rolar quando bate no teto da área.
 *
 * E abre NA ALTURA DA DOCA, centrada como ela. Presa no topo, uma gaveta baixa
 * nascia a meia tela de distância do botão que a abriu — o dedo tocava no meio
 * da lateral e a resposta aparecia lá em cima, parecendo outra coisa. Saindo do
 * lado de quem a chamou, o gesto e o que ele fez ficam no mesmo lugar.
 */
export function Drawer({
  lado,
  titulo,
  icone,
  onFechar,
  children,
}: {
  lado: "esquerda" | "direita";
  titulo: string;
  icone?: ReactNode;
  onFechar: () => void;
  children: ReactNode;
}) {
  return (
    <aside
      className={cn(
        // `absolute` dentro do palco, e não `fixed`: a gaveta pertence à área
        // entre as trilhas, e não à janela — senão ela passaria por cima da
        // própria trilha que a abriu.
        "bg-card/95 absolute top-1/2 z-40 flex max-h-[calc(100%-1rem)] w-[min(24rem,45%)] -translate-y-1/2 flex-col rounded-lg border shadow-xl backdrop-blur",
        // Ao LADO da doca, não por cima dela: a gaveta cobre a doca e o botão
        // que a fechou some debaixo do que ele abriu.
        lado === "esquerda" ? "left-18" : "right-18",
      )}
    >
      <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        {icone}
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{titulo}</h2>

        <Button variant="ghost" size="icon-sm" aria-label="Fechar" onClick={onFechar}>
          <X />
        </Button>
      </header>

      {/* `min-h-0` com `overflow-y-auto`: é o que faz a rolagem acontecer aqui
          dentro quando o conteúdo passa do teto, em vez de esticar a gaveta
          para fora da área da cena. */}
      <div className="scroll-fade min-h-0 overflow-y-auto p-3">{children}</div>
    </aside>
  );
}
