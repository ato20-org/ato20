"use client";

import { useRef, type ReactNode } from "react";

import { DockColumn } from "@/components/operator/dock/dock-column";
import { Splitter } from "@/components/operator/dock/splitter";
import { LeitorSplit } from "@/components/operator/leitor/leitor-split";
import {
  MAX_LARGURA_PX,
  MIN_LARGURA_PX,
  useLayoutStore,
  type Lado,
} from "@/lib/store/use-layout-store";
import { usePanelsStore } from "@/lib/store/use-panels-store";

/**
 * A linha do meio: coluna, palco, coluna.
 *
 * O palco entra como `children` em vez de ser um tipo de janela: ele é o que a
 * bancada cerca, não uma peça que se atraca. Uma cena não pode virar aba de uma
 * coluna nem ser fechada — sem palco não há o que operar —, e um caso desses
 * dentro da árvore obrigaria cada ação do dock a perguntar "isso é o palco?".
 *
 * As colunas guardam largura em pixel e o palco fica com `flex-1`: aumentar a
 * janela do aplicativo dá o espaço novo ao mapa, que é o que se quer. As duas
 * larguras são independentes.
 *
 * `left`/`right` do `usePanelsStore` continuam sendo "esta coluna está
 * recolhida". Isso não virou parte do layout porque são coisas diferentes:
 * recolher é gesto do momento, com caminho de volta no canto do palco, e o
 * layout é onde cada janela mora.
 */
export function DockRow({ children }: { children: ReactNode }) {
  const esquerdaAberta = usePanelsStore((state) => state.left);
  const direitaAberta = usePanelsStore((state) => state.right);

  // Coluna recolhida OU sem região nenhuma não desenha nada, divisor incluído:
  // um divisor sem os dois lados seria uma alça de 4 pixels encostada no palco,
  // arrastável e sem efeito visível. Coluna esvaziada se recupera pela beirada
  // da linha, no arrasto — ver `alvoEm`.
  const esquerda = useLayoutStore((state) => state.layout.esquerda.grupos.length > 0);
  const direita = useLayoutStore((state) => state.layout.direita.grupos.length > 0);

  return (
    <>
      {esquerdaAberta && esquerda ? (
        <>
          <DockColumn lado="esquerda" />
          <LarguraSplitter lado="esquerda" />
        </>
      ) : null}

      {children}

      {direitaAberta && direita ? (
        <>
          <LarguraSplitter lado="direita" />
          <DockColumn lado="direita" />
        </>
      ) : null}

      {/* O leitor de Regras na PONTA da linha, depois da coluna direita, e não
          entre ela e o palco: as duas colunas cercam o mapa, e enfiar meia tela
          de manual no meio empurraria a coluna direita para longe do que ela
          controla. Só existe quando há livro no split. Ver `LeitorSplit`. */}
      <LeitorSplit />
    </>
  );
}

/** O divisor entre uma coluna e o palco. */
function LarguraSplitter({ lado }: { lado: Lado }) {
  const largura = useLayoutStore((state) => state.layout[lado].largura);
  const larguraColuna = useLayoutStore((state) => state.larguraColuna);
  const guardar = useLayoutStore((state) => state.guardar);

  /** A largura no começo do gesto, e onde ele chegou. */
  const inicio = useRef(0);
  const fim = useRef(0);

  return (
    <Splitter
      direcao="vertical"
      rotulo={`Largura do painel ${lado === "esquerda" ? "esquerdo" : "direito"}`}
      aoArrastar={(delta) => {
        if (inicio.current === 0) inicio.current = largura;

        // À direita o sinal inverte: arrastar para a esquerda ENGORDA a coluna,
        // porque ela cresce para dentro da tela e não para fora.
        const pedida = inicio.current + (lado === "esquerda" ? delta.x : -delta.x);
        fim.current = Math.min(Math.max(pedida, MIN_LARGURA_PX), MAX_LARGURA_PX);

        // Direto no DOM durante o gesto: pelo store, cada quadro re-renderizava
        // a coluna e tudo que mora nela. `width` é a mesma propriedade que o
        // `style` da coluna declara, então o render seguinte a corrige.
        const alvo = document.querySelector<HTMLElement>(`[data-dock-coluna="${lado}"]`);
        alvo?.style.setProperty("width", `${fim.current}px`);
      }}
      aoSoltar={() => {
        larguraColuna(lado, fim.current);
        inicio.current = 0;
        guardar();
      }}
    />
  );
}
