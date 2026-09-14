"use client";

import { useRef } from "react";

import { Splitter } from "@/components/mestre/dock/splitter";
import { LeitorLivro } from "@/components/mestre/leitor/leitor-livro";
import {
  MAX_FRACAO,
  MIN_FRACAO,
  useLeitorStore,
} from "@/lib/store/use-leitor-store";

/**
 * O leitor de Regras dividindo a linha com o palco.
 *
 * Região própria, e não uma coluna do dock: coluna tem teto de 640 pixels e
 * serve painel de cena, e a página de um manual é diagramada em duas colunas de
 * texto — abaixo de meia tela ela deixa de ser legível. Aqui o padrão é metade
 * da linha, e o divisor move isso.
 *
 * Em FRAÇÃO da linha, ao contrário da largura das colunas, que é em pixel: o
 * mestre pediu meio a meio, e meio a meio tem de continuar meio a meio quando
 * ele aumenta a janela do aplicativo. Em pixel, o espaço novo iria todo para o
 * palco e a divisão combinada se desfaria sozinha.
 *
 * Um livro por vez. Vários ao mesmo tempo é o caso das janelas, que empilham —
 * um segundo livro aqui deixaria o mapa com um terço da tela.
 */
export function LeitorSplit() {
  const livroId = useLeitorStore((state) => state.livroId);
  const fracao = useLeitorStore((state) => state.fracao);
  const redimensionar = useLeitorStore((state) => state.redimensionar);
  const guardar = useLeitorStore((state) => state.guardar);

  /** A fração no começo do gesto, e onde ele chegou. Ver `LarguraSplitter`. */
  const inicio = useRef(0);
  const fim = useRef(0);

  if (!livroId) return null;

  return (
    <>
      <Splitter
        direcao="vertical"
        rotulo="Largura do leitor de Regras"
        aoArrastar={(delta) => {
          const alvo = document.querySelector<HTMLElement>(
            "[data-leitor-regiao]",
          );
          const linha = alvo?.parentElement;
          if (!alvo || !linha) return;

          if (inicio.current === 0) inicio.current = fracao;

          // A linha inteira é a referência, e não a região: fração pede o
          // denominador, e ele muda com o tamanho da janela do aplicativo e com
          // as colunas do dock abertas.
          const largura = linha.clientWidth || 1;

          // O sinal inverte porque o leitor cresce para dentro da tela:
          // arrastar o divisor para a esquerda ENGORDA o livro.
          const pedida = inicio.current - delta.x / largura;
          fim.current = Math.min(Math.max(pedida, MIN_FRACAO), MAX_FRACAO);

          // Direto no DOM durante o gesto, como o divisor das colunas: pelo
          // store, cada quadro re-renderizaria o leitor inteiro — e re-render do
          // leitor é redesenhar a página no canvas. O render seguinte corrige,
          // porque é a mesma propriedade que o `style` da região declara.
          alvo.style.setProperty("flex", `0 1 ${fim.current * 100}%`);
        }}
        aoSoltar={() => {
          redimensionar(fim.current);
          inicio.current = 0;
          guardar();
        }}
      />

      <section
        data-leitor-regiao
        // `min-w-0` é o que faz a fração valer: item de flex tem
        // `min-width: auto`, e a barra do leitor com todos os botões teria um
        // mínimo de conteúdo maior que a metade da linha numa tela estreita —
        // empurrando o palco para fora em vez de envolver.
        className="bg-background flex min-h-0 min-w-0 flex-col border-l"
        style={{ flex: `0 1 ${fracao * 100}%` }}
        aria-label="Leitor de Regras"
      >
        <LeitorLivro livroId={livroId} />
      </section>
    </>
  );
}
