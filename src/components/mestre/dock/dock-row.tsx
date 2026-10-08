"use client";

import { useRef, useState, type ReactNode } from "react";

import { AlcaDeGaveta } from "@/components/mestre/dock/alca-de-gaveta";
import { DockColumn } from "@/components/mestre/dock/dock-column";
import { Splitter } from "@/components/mestre/dock/splitter";
import {
  MAX_LARGURA_PX,
  MIN_LARGURA_PX,
  useLayoutStore,
  type Lado,
} from "@/lib/store/use-layout-store";
import { t } from "@/lib/i18n/mestre";
import { usePanelsStore } from "@/lib/store/use-panels-store";

/**
 * A linha do meio: coluna, painéis, coluna.
 *
 * O meio entra como `children` -- a fileira de painéis, com o palco e o que foi
 * dividido ao lado dele (ver `FileiraDePaineis`). As colunas ficam nas bordas
 * da janela, e não presas ao mapa: levar o livro para o outro lado do palco não
 * as arrasta junto. O palco não é um tipo de janela: ele é o que a bancada
 * cerca, não uma peça que se atraca. Uma cena não pode virar aba de uma
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
  /**
   * Em qual coluna o ponteiro está.
   *
   * Sobe até aqui porque o divisor de LARGURA é irmão da coluna, e não filho:
   * quem encosta na coluna espera ver a alça que move a borda dela, e a coluna
   * sozinha não tem como acender um irmão.
   */
  const [perto, setPerto] = useState<Lado | null>(null);

  const esquerdaAberta = usePanelsStore((state) => state.left);
  const direitaAberta = usePanelsStore((state) => state.right);
  const mostrar = usePanelsStore((state) => state.show);

  // Coluna recolhida OU sem região nenhuma não desenha nada, divisor incluído:
  // um divisor sem os dois lados seria uma alça de 4 pixels encostada no palco,
  // arrastável e sem efeito visível. Coluna esvaziada se recupera pela beirada
  // da linha, no arrasto — ver `alvoEm`.
  const esquerda = useLayoutStore(
    (state) => state.layout.esquerda.grupos.length > 0,
  );
  const direita = useLayoutStore(
    (state) => state.layout.direita.grupos.length > 0,
  );

  return (
    <>
      {/* O caminho de volta da coluna recolhida, na borda da janela onde ela
          sai. Ver `AlcaDeGaveta`. */}
      {!esquerdaAberta && esquerda ? (
        <AlcaDeGaveta lado="esquerda" aoAbrir={() => mostrar("left")} />
      ) : null}
      {!direitaAberta && direita ? (
        <AlcaDeGaveta lado="direita" aoAbrir={() => mostrar("right")} />
      ) : null}

      {esquerdaAberta && esquerda ? (
        <>
          <DockColumn
            lado="esquerda"
            aoAproximar={(dentro) => setPerto(dentro ? "esquerda" : null)}
          />
          <LarguraSplitter lado="esquerda" aparente={perto === "esquerda"} />
        </>
      ) : null}

      {children}

      {direitaAberta && direita ? (
        <>
          <LarguraSplitter lado="direita" aparente={perto === "direita"} />
          <DockColumn
            lado="direita"
            aoAproximar={(dentro) => setPerto(dentro ? "direita" : null)}
          />
        </>
      ) : null}
    </>
  );
}

/** O divisor entre uma coluna e o palco. */
function LarguraSplitter({
  lado,
  aparente,
}: {
  lado: Lado;
  aparente: boolean;
}) {
  const largura = useLayoutStore((state) => state.layout[lado].largura);
  const larguraColuna = useLayoutStore((state) => state.larguraColuna);
  const guardar = useLayoutStore((state) => state.guardar);

  /** A largura no começo do gesto, e onde ele chegou. */
  const inicio = useRef(0);
  const fim = useRef(0);

  return (
    <Splitter
      direcao="vertical"
      aparente={aparente}
      rotulo={
        lado === "esquerda"
          ? t.dock.larguraDoPainelEsquerdo
          : t.dock.larguraDoPainelDireito
      }
      aoArrastar={(delta) => {
        if (inicio.current === 0) inicio.current = largura;

        // À direita o sinal inverte: arrastar para a esquerda ENGORDA a coluna,
        // porque ela cresce para dentro da tela e não para fora.
        const pedida =
          inicio.current + (lado === "esquerda" ? delta.x : -delta.x);
        fim.current = Math.min(
          Math.max(pedida, MIN_LARGURA_PX),
          MAX_LARGURA_PX,
        );

        // Direto no DOM durante o gesto: pelo store, cada quadro re-renderizava
        // a coluna e tudo que mora nela. `width` é a mesma propriedade que o
        // `style` da coluna declara, então o render seguinte a corrige.
        const alvo = document.querySelector<HTMLElement>(
          `[data-dock-coluna="${lado}"]`,
        );
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
