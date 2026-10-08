"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { t } from "@/lib/i18n/mestre";
import { cn } from "@/lib/utils";

/** A altura da onda, em pixel. */
const ALTURA = 180;
/** O quanto ela avança para dentro da tela, no ponto mais fundo. */
const FUNDO = 34;
/** A que distância da borda a mão já conta como "perto", em pixel. */
const ALCANCE = 56;

/**
 * O caminho de volta de uma coluna recolhida: uma alça na BORDA da janela.
 *
 * Morava no canto do palco, e o palco deixou de encostar nas bordas -- com o
 * livro à esquerda do mapa, o botão de reabrir a coluna esquerda ficava no
 * meio da tela, longe da coluna que ele traz. Agora ele vive onde a gaveta
 * sai, nas pontas da janela.
 *
 * Escondido até a mão chegar perto: dali cresce uma onda suave, na ALTURA do
 * ponteiro, com a seta para dentro. Botão fixo nas duas bordas seria mobília
 * sobre o mapa a sessão inteira, para um gesto que acontece de vez em quando.
 *
 * ## "Perto" é medido, e não uma faixa que ouve o ponteiro
 *
 * Uma faixa larga o bastante para a mão achar sem mirar roubaria o clique de
 * tudo o que está na beirada do palco embaixo dela. Então a distância vem do
 * `pointermove` da janela, e a única coisa que recebe clique é a própria onda,
 * quando está à vista.
 *
 * A onda é um SVG e não uma caixa arredondada: a borda dela nasce colada na
 * janela, sem degrau, e é isso que a faz ler como a beirada da gaveta sendo
 * puxada, e não como um botão pousado ali.
 */
export function AlcaDeGaveta({
  lado,
  aoAbrir,
}: {
  lado: "esquerda" | "direita";
  aoAbrir: () => void;
}) {
  const ancora = useRef<HTMLDivElement | null>(null);
  const [perto, setPerto] = useState(false);
  /** O centro da onda, em pixel da borda. Segue o ponteiro, e fica onde ele saiu. */
  const [centro, setCentro] = useState<number | null>(null);

  const esquerda = lado === "esquerda";

  useEffect(() => {
    function mover(event: PointerEvent) {
      const caixa = ancora.current?.parentElement?.getBoundingClientRect();
      if (!caixa) return;

      const distancia = esquerda
        ? event.clientX - caixa.left
        : caixa.right - event.clientX;
      const dentro =
        distancia >= 0 &&
        distancia <= ALCANCE &&
        event.clientY >= caixa.top &&
        event.clientY <= caixa.bottom;

      setPerto((atual) => (atual === dentro ? atual : dentro));
      if (!dentro) return;

      // Só enquanto perto: longe, a onda fica onde a mão a deixou, e o
      // componente não redesenha a cada movimento do mouse pela tela.
      const meio = ALTURA / 2;
      const y = Math.min(
        Math.max(event.clientY - caixa.top, meio),
        caixa.height - meio,
      );
      setCentro((atual) => (atual === y ? atual : y));
    }

    // A mão que sai da janela pela borda não manda mais `pointermove`: sem
    // isto a onda ficaria aberta até ela voltar.
    function saiu() {
      setPerto(false);
    }

    window.addEventListener("pointermove", mover);
    document.documentElement.addEventListener("pointerleave", saiu);

    return () => {
      window.removeEventListener("pointermove", mover);
      document.documentElement.removeEventListener("pointerleave", saiu);
    };
  }, [esquerda]);

  const Seta = esquerda ? ChevronRight : ChevronLeft;
  const rotulo = esquerda
    ? t.dock.mostrarPainelEsquerdo
    : t.dock.mostrarPainelDireito;

  // Desenhada para a borda esquerda; a direita é o espelho.
  const curva = `M0 0 C0 ${ALTURA * 0.25} ${FUNDO} ${ALTURA * 0.3} ${FUNDO} ${ALTURA / 2} C${FUNDO} ${ALTURA * 0.7} 0 ${ALTURA * 0.75} 0 ${ALTURA}`;

  return (
    <div
      ref={ancora}
      // Sem largura e sem ouvir o ponteiro: é só o ponto de onde a onda sai.
      className={cn(
        "pointer-events-none absolute inset-y-0 z-30 w-0",
        esquerda ? "left-0" : "right-0",
      )}
    >
      <button
        type="button"
        aria-label={rotulo}
        title={rotulo}
        data-perto={perto ? "" : undefined}
        onClick={aoAbrir}
        className={cn(
          "group/gaveta absolute grid place-items-center outline-none",
          "scale-x-0 opacity-0 transition-[transform,opacity,top] duration-200 ease-out motion-reduce:transition-none",
          "data-perto:pointer-events-auto data-perto:scale-x-100 data-perto:opacity-100",
          "focus-visible:pointer-events-auto focus-visible:scale-x-100 focus-visible:opacity-100",
          esquerda ? "left-0 origin-left" : "right-0 origin-right",
        )}
        style={{
          width: FUNDO + 2,
          height: ALTURA,
          top: centro === null ? `calc(50% - ${ALTURA / 2}px)` : centro - ALTURA / 2,
        }}
      >
        <svg
          aria-hidden
          viewBox={`0 0 ${FUNDO + 2} ${ALTURA}`}
          className="absolute inset-0 size-full overflow-visible"
          style={esquerda ? undefined : { transform: "scaleX(-1)" }}
        >
          <path d={`${curva} Z`} className="fill-popover" />
          <path d={curva} className="stroke-border fill-none" strokeWidth={1} />
        </svg>
        <Seta
          className={cn(
            "text-muted-foreground group-hover/gaveta:text-foreground relative size-5 transition-colors",
            esquerda ? "-translate-x-1" : "translate-x-1",
          )}
        />
      </button>
    </div>
  );
}
