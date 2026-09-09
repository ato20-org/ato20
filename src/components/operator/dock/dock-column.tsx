"use client";

import { useRef } from "react";

import { DockGroup } from "@/components/operator/dock/dock-group";
import { Splitter } from "@/components/operator/dock/splitter";
import { MIN_FRACAO as MIN, useLayoutStore, type Lado } from "@/lib/store/use-layout-store";
import { cn } from "@/lib/utils";

/**
 * Uma coluna do dock: regiões empilhadas, com divisor entre elas.
 *
 * O que era um `aside w-72` com abas dentro. A diferença que importa é que a
 * pilha é dado: o painel direito já era duas regiões — as abas em cima e as
 * camadas embaixo com `h-2/5` cravado no CSS —, e agora aquela divisão tem um
 * divisor que se arrasta e um número que sobrevive ao fechar o aplicativo.
 *
 * A altura de cada região é fração, e não pixel: encolher a janela do
 * aplicativo tem de encolher as regiões junto, senão a última seria empurrada
 * para fora da coluna. A largura da coluna é o contrário, em pixel — ver
 * `Coluna`.
 */
export function DockColumn({ lado }: { lado: Lado }) {
  const coluna = useLayoutStore((state) => state.layout[lado]);
  const redimensionarGrupos = useLayoutStore((state) => state.redimensionarGrupos);
  const guardar = useLayoutStore((state) => state.guardar);

  /** A altura da coluna e as frações no começo do gesto. Ver `Splitter`. */
  const inicio = useRef({ altura: 0, fracoes: [] as number[] });
  const fim = useRef(0);
  const caixa = useRef<HTMLDivElement | null>(null);

  /** Mexe nas duas regiões vizinhas sem passar pelo React. Ver o divisor. */
  function aplicar(indice: number, antes: number, depois: number) {
    const regioes = caixa.current?.querySelectorAll<HTMLElement>("[data-dock-regiao]");
    if (!regioes) return;

    regioes[indice]?.style.setProperty("flex", `0 1 ${antes * 100}%`);
    regioes[indice + 1]?.style.setProperty("flex", `0 1 ${depois * 100}%`);
  }

  // Coluna sem região nenhuma não desenha borda nem largura: sobraria uma
  // faixa vazia encostada no palco, sem nada que a explique. Acontece quando o
  // mestre tira a última aba de um lado.
  if (coluna.grupos.length === 0) return null;

  return (
    <div
      ref={caixa}
      // `data-dock-coluna`: o divisor de largura, que é irmão desta coluna e
      // não filho, precisa alcançá-la para mexer na largura durante o gesto.
      data-dock-coluna={lado}
      // `min-w-0` é o que faz a largura declarada valer. Item de flex tem
      // `min-width: auto` por padrão — o tamanho MÍNIMO DO CONTEÚDO —, e uma
      // ficha desenhada para 512 pixels atracada numa coluna de 288 empurrava a
      // coluna, que empurrava a linha, que estourava a tela inteira: o mapa
      // ficava cortado e os painéis saíam pela direita.
      //
      // `max-w` como teto de verdade: o limite do store é em pixel e não sabe o
      // tamanho da janela do aplicativo, então numa tela estreita duas colunas
      // no máximo não deixariam palco nenhum.
      className={cn(
        "flex min-h-0 max-w-[40%] min-w-0 shrink-0 flex-col overflow-hidden select-none",
        lado === "esquerda" ? "border-r" : "border-l",
      )}
      style={{ width: coluna.largura }}
    >
      {coluna.grupos.map((grupo, indice) => (
        <div
          key={grupo.id}
          data-dock-regiao={indice}
          // A fração vira `flex-basis` com `flex-grow: 0`: em `flex-grow` as
          // sobras se redistribuiriam sozinhas e o divisor deixaria de mandar
          // no tamanho.
          className="flex min-h-0 min-w-0 flex-col overflow-hidden"
          style={{ flex: `0 1 ${coluna.fracoes[indice] * 100}%` }}
        >
          <DockGroup lado={lado} grupo={grupo} comRecolher={indice === 0} />

          {/* Entre este e o próximo, nunca depois do último. */}
          {indice < coluna.grupos.length - 1 ? (
            <Splitter
              direcao="horizontal"
              rotulo="Redimensionar as regiões"
              aoArrastar={(delta) => {
                if (inicio.current.altura === 0) {
                  inicio.current = {
                    altura: caixa.current?.getBoundingClientRect().height ?? 0,
                    fracoes: coluna.fracoes,
                  };
                }

                const altura = inicio.current.altura;
                if (altura === 0) return;

                // Pixels arrastados viram fração da coluna, somados à fração
                // que a região de cima tinha ANTES do gesto: acumular sobre a
                // atual faria o arrasto acelerar sozinho.
                const par =
                  (inicio.current.fracoes[indice] ?? 0) +
                  (inicio.current.fracoes[indice + 1] ?? 0);
                const antes = Math.min(
                  Math.max((inicio.current.fracoes[indice] ?? 0) + delta.y / altura, MIN),
                  par - MIN,
                );

                fim.current = antes;

                // Escreve nas duas vizinhas direto no DOM. Pelo store, cada
                // quadro re-renderizava a COLUNA inteira — a biblioteca de
                // imagens e a lista de camadas junto —, e arrastar o divisor
                // engasgava. `flex` é a mesma propriedade que o `style` das
                // regiões declara, então o render seguinte a corrige sozinho.
                aplicar(indice, antes, par - antes);
              }}
              aoSoltar={() => {
                redimensionarGrupos(lado, indice, fim.current);
                inicio.current = { altura: 0, fracoes: [] };
                guardar();
              }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
