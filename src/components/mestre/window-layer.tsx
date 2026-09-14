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

  return (
    <div
      ref={area}
      // `data-dock-camada`: é este retângulo que o arrasto mede para converter
      // a posição do ponteiro em coordenadas do alvo aceso. Ver `medir`.
      data-dock-camada
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {janelas.map((janela, ordem) => (
        <Conteudo key={janela.chave} janela={janela} ordem={ordem} />
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
