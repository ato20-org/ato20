"use client";

import { useEffect, useRef } from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import { postitNaArea } from "@/lib/geometry/postit";
import { POSTIT_Z } from "@/lib/store/use-postit-store";
import {
  POSTIT_ALTURA,
  POSTIT_LARGURA,
  type CorPostit,
} from "@/types/scene";

/**
 * O papel de cada cor, na versão fantasma.
 *
 * As mesmas cores do postit de verdade — ver `PAPEL`, no `PostitLayer` —, só
 * que translúcidas e com a borda tracejada. Translúcido porque a prévia existe
 * para mostrar o que o papel VAI cobrir, e um retângulo opaco escondia
 * exatamente a informação que se quer conferir antes de colar.
 */
const PAPEL: Record<CorPostit, string> = {
  amarelo: "bg-amber-200/45 border-amber-600/70",
  rosa: "bg-pink-200/45 border-pink-600/70",
  azul: "bg-sky-200/45 border-sky-600/70",
  verde: "bg-emerald-200/45 border-emerald-600/70",
};

/**
 * Onde o postit vai cair, enquanto a ferramenta está na mão.
 *
 * O papel nasce CENTRADO no clique e tem 260 por 180 unidades de cena — quase
 * um terço da altura do plano. Sem prévia, colar era apostar: o mestre clicava
 * ao lado do que queria anotar e o papel aparecia por cima do token, da porta
 * ou do texto do mapa, e o gesto seguinte era sempre arrastar o papel para o
 * lado. A prévia troca isso por olhar antes.
 *
 * Presa à área de trabalho pelo MESMO `postitNaArea` que o clique usa — não uma
 * conta parecida: a prévia que mostrasse o papel meio pixel fora de onde ele
 * cai seria pior que nenhuma, porque seria acreditada.
 *
 * ## Fora do React, quadro a quadro
 *
 * A posição é escrita direto no `style` do elemento, no tratador do ponteiro.
 * Como estado, cada milímetro de mouse redesenharia a camada inteira — e ela
 * mora dentro do palco, ao lado do mapa, dos alfinetes e dos dados. É o mesmo
 * desenho do arrasto de janela e do arrasto da fileira de rolagens.
 *
 * Nasce invisível e só aparece no primeiro movimento: a ferramenta pode ser
 * escolhida pela barra, com o ponteiro longe do mapa, e um papel fantasma
 * pousado no canto de cima à esquerda pareceria um postit de verdade que
 * alguém esqueceu ali.
 */
export function PostitFantasma({ cor }: { cor: CorPostit }) {
  const { scale, toScene } = useSceneScale();

  const caixa = useRef<HTMLDivElement>(null);

  /**
   * O conversor, sempre atual, sem reinscrever o tratador.
   *
   * `toScene` muda a cada zoom e a cada deslocamento da câmera; com ele na lista
   * de dependências, deslocar o mapa com a ferramenta na mão trocaria o
   * listener do documento a cada quadro do gesto.
   */
  const converter = useRef(toScene);
  useEffect(() => {
    converter.current = toScene;
  });

  useEffect(() => {
    function mover(event: PointerEvent) {
      const alvo = caixa.current;
      if (!alvo) return;

      const ponto = converter.current(event.clientX, event.clientY);
      const onde = postitNaArea(
        ponto.x - POSTIT_LARGURA / 2,
        ponto.y - POSTIT_ALTURA / 2,
        POSTIT_LARGURA,
        POSTIT_ALTURA,
      );

      alvo.style.setProperty("transform", `translate(${onde.x}px, ${onde.y}px)`);
      alvo.style.setProperty("opacity", "1");
    }

    document.addEventListener("pointermove", mover);

    return () => document.removeEventListener("pointermove", mover);
  }, []);

  if (scale === 0) return null;

  return (
    <div
      ref={caixa}
      aria-hidden
      className={`pointer-events-none absolute top-0 left-0 rounded-sm border-2 border-dashed opacity-0 ${PAPEL[cor]}`}
      style={{
        width: POSTIT_LARGURA,
        height: POSTIT_ALTURA,
        zIndex: POSTIT_Z,
      }}
    />
  );
}
