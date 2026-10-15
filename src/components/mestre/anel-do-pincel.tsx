"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { useSceneScale } from "@/components/playground/scene-stage";

/** Acima do gizmo: é a ponta do pincel, e nada pode cobri-la. */
const ANEL_Z = 10_500;

/**
 * O anel do pincel, debaixo do ponteiro: o tamanho do que o arrasto vai fazer,
 * antes de fazer. É o mesmo para o lápis (a largura do risco) e para a
 * borracha da névoa (o furo), e cresce ao vivo com Alt+roda e `[` `]`.
 *
 * Com `noCentro`, ele sai do ponteiro e para no MEIO do palco, preenchido com
 * a `amostra`: é a régua de largura do painel na mão. Ali o ponteiro está no
 * painel, longe do mapa, e o anel colado nele mediria o risco sobre um botão;
 * no centro ele mostra o tamanho real sobre o mapa, no zoom de agora.
 *
 * Na MARGEM, e não no plano de conteúdo: ele anda colado no ponteiro, inclusive
 * fora do mapa, e um filho do plano que passa da caixa dele é a armadilha que
 * pinta o palco deslocado e preto no zoom (`debug-do-palco` §3). Na margem não
 * há caixa a transbordar, e as unidades são as da cena, como as do pincel.
 *
 * A posição vai pelo DOM, num `transform`, e não por estado: cada movimento do
 * mouse renderizaria o palco do mestre inteiro só para mover um círculo.
 */
export function AnelDoPincel({
  raio,
  noCentro = false,
  amostra,
}: {
  /** Em unidade de cena: metade da largura do lápis, o raio da borracha. */
  raio: number;
  /** No meio do palco, e não no ponteiro. */
  noCentro?: boolean;
  /** O preenchimento quando `noCentro`: o risco como ele vai sair. */
  amostra?: { cor: string; opacidade: number };
}) {
  const { scale, toScene, planoDaMargem, moldura } = useSceneScale();
  const anel = useRef<HTMLDivElement>(null);
  /** O último ponto visto, para o anel crescer no lugar quando o raio muda. */
  const ultimo = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const posicionar = (ponto: { x: number; y: number } | null) => {
      const elemento = anel.current;
      if (!elemento || !ponto) return;

      elemento.style.transform = `translate(${ponto.x - raio}px, ${ponto.y - raio}px)`;
      elemento.style.opacity = "1";
    };

    if (noCentro) {
      const caixa = moldura?.getBoundingClientRect();
      if (caixa) {
        posicionar(
          toScene(caixa.left + caixa.width / 2, caixa.top + caixa.height / 2),
        );
      }
      // Parado no meio: o ponteiro está no painel, e segui-lo é o que não se
      // quer aqui. Ao sair do meio, o anel some até o próximo movimento: o
      // último ponto visto é de ANTES da régua, e voltar a ele seria mostrar o
      // pincel onde o ponteiro já não está.
      const elemento = anel.current;
      return () => {
        if (elemento) elemento.style.opacity = "0";
        ultimo.current = null;
      };
    }

    const mover = (evento: PointerEvent) => {
      ultimo.current = toScene(evento.clientX, evento.clientY);
      posicionar(ultimo.current);
    };

    // O raio mudou com o ponteiro parado -- Alt+roda, `[` `]` --, ou o anel
    // acabou de voltar do meio: ele reaparece em volta de onde o ponteiro já
    // está, sem esperar o mouse andar.
    posicionar(ultimo.current);
    window.addEventListener("pointermove", mover);
    return () => window.removeEventListener("pointermove", mover);
  }, [toScene, raio, noCentro, moldura]);

  if (!planoDaMargem || scale === 0) return null;

  return createPortal(
    <div
      ref={anel}
      aria-hidden
      // Escondido até o primeiro movimento: antes dele não se sabe onde o
      // ponteiro está, e um anel no canto do mapa mentiria.
      className="pointer-events-none absolute top-0 left-0 rounded-full opacity-0"
      style={{
        width: raio * 2,
        height: raio * 2,
        // Branco por fora e escuro por dentro: o anel tem de se ler sobre a
        // névoa preta e sobre o mapa claro.
        border: `${1.5 / scale}px solid rgb(255 255 255 / 0.9)`,
        boxShadow: `inset 0 0 0 ${1 / scale}px rgb(0 0 0 / 0.6)`,
        zIndex: ANEL_Z,
      }}
    >
      {noCentro && amostra ? (
        // O preenchimento num filho, e não no fundo do anel: a opacidade é do
        // risco, e o contorno continua inteiro para se ler sobre qualquer mapa.
        <div
          className="size-full rounded-full"
          style={{ background: amostra.cor, opacity: amostra.opacidade }}
        />
      ) : null}
    </div>,
    planoDaMargem,
  );
}
