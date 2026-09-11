"use client";

import { useRef, type ReactNode } from "react";
import { ChevronDown, ChevronUp, GripHorizontal, X } from "lucide-react";

import { useDockDrag } from "@/components/operator/dock/dock-drag";
import { Button } from "@/components/ui/button";
import { useScreenDrag } from "@/hooks/use-screen-drag";
import { encaixar, TAB_PX, useWindowStore, type Janela } from "@/lib/store/use-window-store";
import { cn } from "@/lib/utils";

/**
 * A moldura de uma janela interna.
 *
 * O que o `Dialog` dava e isto não dá — foco preso, clique-fora, fundo escuro —
 * é justamente o que precisava sair: a janela existe para o mestre mexer no
 * mapa COM ela aberta. O que sobrou de diálogo é o cabeçalho com título e o X.
 *
 * ESC fecha a da frente, mas só a partir de dentro: o `stopPropagation` é o que
 * impede o mesmo ESC de chegar ao atalho global do palco, que limpa a seleção.
 * Sem janela em foco, ESC continua sendo do palco.
 *
 * Posicionada em `absolute` na camada, e não `fixed` na tela: a camada é a linha
 * do meio do shell, então a janela alcança os painéis laterais mas nunca cobre
 * a barra da sessão nem a do som — controle de sessão não fica atrás de
 * consulta de ficha. Ver `WindowLayer`.
 *
 * ## Tamanho
 *
 * `largura`/`altura` aqui são o PADRÃO do conteúdo; o que vence é o que o
 * mestre deixou na alça, que mora no store. A altura padrão é ausente de
 * propósito: a janela cresce com o que tem dentro até o teto do palco, e uma
 * altura fixa desde o começo deixaria a lista de dois personagens com um vão
 * embaixo.
 */
export function InnerWindow({
  janela,
  ordem,
  titulo,
  subtitulo,
  largura,
  children,
}: {
  janela: Janela;
  /** Posição na pilha; 0 é a mais atrás. */
  ordem: number;
  titulo: string;
  subtitulo?: string;
  /** Largura padrão, em pixels, até o mestre mexer na alça. */
  largura: number;
  children: ReactNode;
}) {
  const startDrag = useScreenDrag();
  const startDockDrag = useDockDrag();

  const mover = useWindowStore((state) => state.mover);
  // O retângulo que comporta as janelas, para o gesto respeitar o mesmo limite
  // que o store aplica ao soltar. Ver `encaixar`.
  const limites = useWindowStore((state) => state.limites);
  const redimensionar = useWindowStore((state) => state.redimensionar);
  const guardar = useWindowStore((state) => state.guardar);
  const fechar = useWindowStore((state) => state.fechar);
  const alternarRecolhida = useWindowStore((state) => state.alternarRecolhida);
  const trazerPraFrente = useWindowStore((state) => state.trazerPraFrente);

  /**
   * A geometria no começo do gesto.
   *
   * O `delta` do arrasto é acumulado desde o pointerdown, então precisa ser
   * aplicado sobre um retrato de onde a janela estava — somar incrementos
   * quadro a quadro acumula erro de arredondamento. Serve aos dois gestos: o
   * cabeçalho move, a alça redimensiona.
   */
  const inicio = useRef({ x: 0, y: 0, largura: 0, altura: 0 });

  /** Onde o gesto chegou. Ver `confirmar`. */
  const fim = useRef({ x: 0, y: 0, largura: 0, altura: 0 });

  /** A moldura, para medir e para mover durante o gesto. */
  const caixa = useRef<HTMLElement | null>(null);

  /**
   * Enquanto o gesto corre, quem move a janela é o DOM — não o store.
   *
   * Escrever no store a cada quadro re-renderizava a janela INTEIRA sessenta
   * vezes por segundo: a ficha com três listas dentro, a biblioteca de imagens,
   * o que estivesse ali. O arrasto ficava pesado justamente nas janelas em que
   * ele importa. Aqui o gesto mexe só nas quatro propriedades que ele mesmo
   * controla, e o store recebe o resultado uma vez, no fim.
   *
   * São as MESMAS propriedades que o `style` deste componente declara, e é isso
   * que dispensa limpeza: ao confirmar, o render seguinte do React reescreve
   * `left`, `top`, `width` e `height` por cima do que a mão deixou.
   */
  function aplicar(estilo: Partial<Record<"left" | "top" | "width" | "height", number>>) {
    const alvo = caixa.current;
    if (!alvo) return;

    for (const [chave, valor] of Object.entries(estilo)) {
      alvo.style.setProperty(chave, `${valor}px`);
    }
  }

  /** Liga e desliga o estado visual de "na mão". Ver o `className`. */
  function arrastando(ligado: boolean) {
    if (ligado) caixa.current?.setAttribute("data-arrastando", "");
    else caixa.current?.removeAttribute("data-arrastando");
  }

  const recolhida = Boolean(janela.recolhida);
  const larguraAtual = janela.largura ?? largura;

  return (
    <section
      ref={caixa}
      // `animate-in` na montagem: a janela nasce com um fade e um zoom curto,
      // como o diálogo que ela substituiu — aparecer instantaneamente sobre o
      // mapa lia como falha de render. `motion-reduce` respeita quem pediu
      // menos movimento no sistema.
      //
      // A sombra e a opacidade mudam no arrasto para a janela parecer levantada
      // da bancada. Não é transform: a mão já controla `left` e `top` durante o
      // gesto, e um `scale` por cima disso brigaria com a mira do encaixe.
      className={cn(
        "bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 pointer-events-auto absolute flex max-h-[calc(100%-1rem)] max-w-[calc(100%-1rem)] flex-col overflow-hidden rounded-lg border shadow-2xl duration-150 ease-out data-arrastando:opacity-90 data-arrastando:shadow-black/60 motion-reduce:animate-none motion-reduce:transition-none",
      )}
      style={{
        left: janela.x,
        top: janela.y,
        // Recolhida encurta para largura de aba: três recolhidas ao pé do palco
        // leem como três abas, e não como três barras de meia tela cada uma.
        width: recolhida ? Math.min(larguraAtual, TAB_PX) : larguraAtual,
        // Sem altura definida a janela cresce com o conteúdo até o `max-h`.
        // Recolhida ela não tem altura nenhuma além do cabeçalho.
        height: recolhida ? undefined : janela.altura,
        zIndex: 20 + ordem,
      }}
      aria-label={titulo}
      // Mexer em qualquer lugar da janela a traz para a frente. É o que se
      // espera, e sem isso duas janelas sobrepostas obrigariam a achar uma alça
      // específica para desempilhar.
      //
      // Na fase de captura, para acontecer antes do arrasto do cabeçalho — que
      // chama `stopPropagation`.
      onPointerDownCapture={() => trazerPraFrente(janela.chave)}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;

        // Digitando não fecha: ESC no meio de uma nota do jogador jogaria o
        // parágrafo fora junto com a janela. Mesma guarda dos atalhos do
        // Operador — ver `isTyping`.
        if ((event.target as HTMLElement).closest("input, textarea, [contenteditable='true']")) {
          return;
        }

        event.stopPropagation();
        fechar(janela.chave);
      }}
    >
      <header
        className="flex shrink-0 cursor-grab items-center gap-2 border-b px-2 py-1.5 select-none active:cursor-grabbing"
        onPointerDown={(event) => {
          // Só o cabeçalho arrasta, e dentro dele nada que seja alvo de clique:
          // pegar a janela pelo X a moveria em vez de fechá-la.
          if ((event.target as HTMLElement).closest("button")) return;

          inicio.current = { ...inicio.current, x: janela.x, y: janela.y };
          fim.current = { ...fim.current, x: janela.x, y: janela.y };

          // O arrasto do cabeçalho não move só a janela: ele também procura
          // lugar na bancada, e acende o alvo sob o ponteiro. Soltar em cima de
          // uma coluna atraca; soltar no palco deixa a janela onde parou.
          arrastando(true);

          startDockDrag(event, {
            conteudo: janela.conteudo,
            aoMover: (delta) => {
              // Limitado DURANTE o gesto, e não só ao soltar: o cabeçalho é o
              // único jeito de pegar a janela de novo, e uma janela que sai da
              // tela sob o ponteiro para voltar no fim do arrasto ensina que
              // dá para perdê-la.
              const { x, y } = encaixar(
                inicio.current.x + delta.x,
                inicio.current.y + delta.y,
                limites,
              );

              fim.current = { ...fim.current, x, y };

              aplicar({ left: x, top: y });
            },
            aoSoltarSolto: () => {
              mover(janela.chave, fim.current.x, fim.current.y);
              guardar(janela.chave);
            },
            aoTerminar: () => arrastando(false),
          });
        }}
        // Duplo clique no cabeçalho recolhe: é o gesto de janela que todo mundo
        // já tem no dedo, e não custa alvo novo na tela.
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;

          alternarRecolhida(janela.chave);
        }}
      >
        <GripHorizontal className="text-muted-foreground size-3.5 shrink-0" aria-hidden />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{titulo}</span>
          {/* O subtítulo sai quando recolhida: numa aba de 240 pixels, duas
              linhas de texto truncado dizem menos que uma. */}
          {subtitulo && !recolhida ? (
            <span className="text-muted-foreground block truncate text-[10px]">{subtitulo}</span>
          ) : null}
        </span>

        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={recolhida ? `Expandir ${titulo}` : `Recolher ${titulo}`}
          aria-expanded={!recolhida}
          onClick={() => alternarRecolhida(janela.chave)}
        >
          {recolhida ? <ChevronDown /> : <ChevronUp />}
        </Button>

        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Fechar ${titulo}`}
          onClick={() => fechar(janela.chave)}
        >
          <X />
        </Button>
      </header>

      {/* Recolhida NÃO renderiza o conteúdo, em vez de esconder com CSS: o que
          está dentro faz leitura por IPC e resolve blob de imagem, e manter
          isso vivo atrás de um `display: none` seria trabalho para uma janela
          que ninguém está olhando. O custo é reler ao expandir, que é a mesma
          leitura de abrir. */}
      {recolhida ? null : (
        <>
          {children}

          {/* A alça é o canto, e sobreposta ao conteúdo: uma faixa própria
              roubaria altura de todas as janelas por causa de um gesto que a
              maioria delas nunca recebe. `touch-none` porque sem isso o
              navegador trata o arrasto como rolagem e o gesto morre no
              primeiro pixel. */}
          <span
            role="separator"
            aria-label={`Redimensionar ${titulo}`}
            aria-orientation="vertical"
            className="hover:bg-accent absolute right-0 bottom-0 z-10 size-4 cursor-se-resize touch-none rounded-tl-sm"
            onPointerDown={(event) => {
              inicio.current = {
                ...inicio.current,
                largura: larguraAtual,
                // A altura pode nunca ter sido definida: o retrato sai do que a
                // janela MEDE agora, senão o primeiro arrasto a faria saltar do
                // tamanho do conteúdo para zero mais o delta.
                altura: janela.altura ?? caixa.current?.getBoundingClientRect().height ?? 0,
              };
              fim.current = { ...fim.current, ...inicio.current };

              startDrag(event, {
                onMove: (delta) => {
                  fim.current = {
                    ...fim.current,
                    largura: inicio.current.largura + delta.x,
                    altura: inicio.current.altura + delta.y,
                  };

                  aplicar({ width: fim.current.largura, height: fim.current.altura });
                },
                onEnd: () => {
                  redimensionar(janela.chave, fim.current.largura, fim.current.altura);
                  guardar(janela.chave);
                },
              });
            }}
          >
            {/* O triângulo do canto, em duas listras. Decoração: quem carrega o
                gesto é o `span` inteiro, que é maior que o desenho. */}
            <span
              aria-hidden
              className="border-muted-foreground/40 absolute right-0.75 bottom-0.75 size-2 border-r-2 border-b-2"
            />
          </span>
        </>
      )}
    </section>
  );
}
