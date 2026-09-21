"use client";

import { useEffect, useRef } from "react";

import { DockGhost } from "@/components/mestre/dock/dock-ghost";
import { DockOverlay } from "@/components/mestre/dock/dock-overlay";
import {
  JanelaCorpo,
  larguraPadrao,
  useRotuloJanela,
} from "@/components/mestre/dock/window-content";
import { InnerWindow } from "@/components/mestre/inner-window";
import { useWindowStore, type Janela } from "@/lib/store/use-window-store";

/**
 * As janelas internas, sobre o palco E sobre os painéis.
 *
 * Cobre a linha inteira do meio — painel de cenas, palco, biblioteca —, e não
 * só a área do mapa. Era só o mapa antes, e o efeito era uma janela cortada no
 * meio pela borda da biblioteca: arrastar a ficha para a direita a levava para
 * DEBAIXO do painel. Janela que não pode passar por cima de nada não é janela,
 * é um segundo painel com sombra.
 *
 * Os painéis são estáticos e a janela tem `z-index`, então ela vence sem
 * depender da ordem da marcação — mas a camada é a última da linha de qualquer
 * jeito, para o Tab ir dos painéis para a janela e não o contrário.
 *
 * `pointer-events-none` na camada e `auto` em cada janela: sem isso, o retângulo
 * inteiro da camada engoliria o clique no mapa e nos painéis, que é justamente
 * o que a janela existe para não fazer.
 */
export function WindowLayer() {
  const janelas = useWindowStore((state) => state.janelas);
  const acomodar = useWindowStore((state) => state.acomodar);

  const area = useRef<HTMLDivElement | null>(null);

  // Área menor — a janela do aplicativo encolhendo — não pode deixar uma janela
  // fora de alcance: sem barra de tarefas onde reencontrá-la, ela estaria
  // perdida até alguém apagar o `localStorage`. Abrir e fechar painel já não
  // mexe nisto: a camada é a linha inteira, e a linha não muda de tamanho.
  useEffect(() => {
    const alvo = area.current;
    if (!alvo) return;

    const observer = new ResizeObserver(([entrada]) => {
      const { width, height } = entrada.contentRect;
      acomodar(width, height);
    });

    observer.observe(alvo);

    return () => observer.disconnect();
  }, [acomodar]);

  // A pilha do store diz QUEM ESTÁ NA FRENTE; ela não pode ditar a ordem da
  // marcação. `trazerPraFrente` roda no pointerdown, e desenhar na ordem da
  // pilha fazia o React mover o `<section>` da janela entre os irmãos no meio
  // do clique — e um nó movido perde o `click`, porque o motor o desconecta
  // para reinseri-lo e o `pointerup` já não acha o alvo do `pointerdown` no
  // mesmo lugar da árvore. Era o X da janela de trás que não fechava de
  // primeira: o clique só a trazia para a frente, e o segundo funcionava
  // porque aí não havia mais nada a reordenar. Valia para qualquer botão de
  // qualquer janela que não estivesse na frente, não só para o X.
  //
  // Por chave, e não pela pilha: a ordenação é estável, então abrir uma janela
  // nova INSERE uma irmã e não desloca nenhuma das que já estão na tela. Quem
  // empilha é o `z-index`, que o `InnerWindow` já declara a partir de `ordem`.
  const montadas = [...janelas].sort((uma, outra) =>
    uma.chave.localeCompare(outra.chave),
  );
  const pilha = new Map(janelas.map((janela, ordem) => [janela.chave, ordem]));

  return (
    <div
      ref={area}
      // `data-dock-camada`: é este retângulo que o arrasto mede para converter
      // a posição do ponteiro em coordenadas do alvo aceso. Ver `medir`.
      data-dock-camada
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {montadas.map((janela) => (
        <Conteudo
          key={janela.chave}
          janela={janela}
          ordem={pilha.get(janela.chave) ?? 0}
        />
      ))}

      <DockOverlay />
      <DockGhost />
    </div>
  );
}

/**
 * Cada conteúdo na sua moldura flutuante.
 *
 * Um componente só para os oito tipos, e não um por tipo: desde que a moldura
 * saiu de dentro de cada janela, o que sobra aqui é sempre a mesma coisa —
 * pegar rótulo e largura no registro e pôr o corpo dentro. Ver
 * `window-content`.
 */
function Conteudo({ janela, ordem }: { janela: Janela; ordem: number }) {
  const { titulo, subtitulo } = useRotuloJanela(janela.conteudo);

  return (
    <InnerWindow
      janela={janela}
      ordem={ordem}
      titulo={titulo}
      subtitulo={subtitulo}
      largura={larguraPadrao(janela.conteudo)}
    >
      <JanelaCorpo conteudo={janela.conteudo} />
    </InnerWindow>
  );
}
