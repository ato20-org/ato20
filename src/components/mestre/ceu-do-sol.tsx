"use client";

import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  LONGE_PX,
  solNoCeu,
  sombraDoPonteiro,
  TRAVA_EM_GRAUS,
} from "@/lib/geometry/ceu";
import { cn } from "@/lib/utils";
import type { Sol } from "@/types/scene";

/**
 * O lado do céu nas unidades do desenho.
 *
 * O `viewBox` é este e o tamanho na tela é outro -- o SVG encolhe sozinho --,
 * e é o que deixa a geometria de `ceu.ts` entrar aqui sem conversão: os raios
 * dela são pixels, e aqui eles são pixels desta régua.
 */
const LADO = 200;

/** O disco do sol e o halo em volta dele, que é a área de pegar. */
const SOL_PX = 11;
const HALO_PX = 18;

/** O pino no meio do céu, e o quanto a sombra dele cresce no desenho. */
const PINO_PX = 3.5;
const SOMBRA_DO_PINO_PX = 46;

const GRAU = Math.PI / 180;

/** Os oito raios do desenho do sol. */
const RAIOS = [0, 45, 90, 135, 180, 225, 270, 315];

/**
 * O amarelo do sol, claro e quente.
 *
 * Nem o da parede (`#facc15`) nem o da tocha (`#fb923c`): os três aparecem no
 * mesmo mapa ao mesmo tempo, e o que separa um instrumento do outro na tela é
 * primeiro a cor. O sol é o mais claro dos três porque é o que está no céu.
 */
const COR_DO_SOL = "#fde68a";
const COR_DA_HASTE = "#f59e0b";

/** Quanto uma seta do teclado gira o sol, em graus. */
const PASSO_EM_GRAUS = 5;
/** E quanto ela sobe ou desce o sol, em fração do comprimento da sombra. */
const PASSO_DE_ALTURA = 0.05;

/**
 * O céu do sol, dentro do painel do mapa.
 *
 * O que se arrasta é um CÉU visto de cima, e a posição do disco nele diz duas
 * coisas ao mesmo tempo:
 *
 * - o LADO de onde a luz vem, e a sombra cai no lado oposto, como cai no mundo;
 * - a ALTURA dele, que é a distância ao meio: sol a pino faz sombra curta, sol
 *   no horizonte faz sombra comprida.
 *
 * Substituiu duas réguas -- "para onde a sombra cai" em graus e "comprimento"
 * em porcento --, e a troca não foi de aparência: ninguém mestra pensando "a
 * sombra cai a 305 graus".
 *
 * ## Por que no painel, e não no palco
 *
 * Esteve no meio do palco, ancorado no meio da VISTA, e a razão era boa: o
 * mestre ajusta o sol olhando o que ele faz nas figuras. O preço é que o céu
 * tem 210 pixels e o meio da vista é onde o jogo acontece -- um instrumento
 * parado em cima do mapa a sessão inteira, para um gesto de meio minuto por
 * mapa. Aqui ele mora onde moram os outros ajustes da cena, aparece com o
 * painel e some com ele, e o mapa continua respondendo embaixo: o painel é do
 * tamanho de um cartão, no canto.
 *
 * ## Desligado, mas à vista
 *
 * Com o sol apagado o céu continua desenhado, sem cor e sem resposta ao toque.
 * Sumir seria esconder o que o interruptor ao lado faz -- e o painel encolher e
 * crescer a cada clique no interruptor é o tipo de salto que faz errar o alvo
 * seguinte.
 */
export function CeuDoSol({
  sol,
  desabilitado = false,
  onChange,
}: {
  /** O sol da cena, ou o que o interruptor acenderia. Ver `SOL_PADRAO`. */
  sol: Sol;
  /** Sol apagado: o céu vira desenho, sem cor e sem gesto. */
  desabilitado?: boolean;
  onChange: (patch: Pick<Sol, "angulo" | "comprimento">) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [arrastando, setArrastando] = useState(false);

  const { x: solX, y: solY } = solNoCeu(sol.angulo, sol.comprimento);

  const sombraDoPino = {
    x: Math.cos(sol.angulo * GRAU) * sol.comprimento * SOMBRA_DO_PINO_PX,
    y: Math.sin(sol.angulo * GRAU) * sol.comprimento * SOMBRA_DO_PINO_PX,
  };

  /**
   * Onde o ponteiro caiu, nas unidades do desenho.
   *
   * Pela caixa MEDIDA e não pelo lado fixo: o SVG encolhe para caber no painel,
   * e uma conta com o número do `viewBox` mandaria o sol para o dobro da
   * distância do dedo.
   */
  function levarPara(event: ReactPointerEvent) {
    const caixa = ref.current?.getBoundingClientRect();
    if (!caixa || caixa.width === 0) return;

    // Pelo MENOR lado: o `viewBox` é quadrado, e um SVG mais largo que alto
    // encolhe o desenho pela altura e deixa faixas vazias nos cantos. Com a
    // conta na largura, um palmo de dedo virava dois de sol -- o disco ia para
    // o horizonte na metade do caminho.
    const escala = LADO / Math.min(caixa.width, caixa.height);
    const dx = (event.clientX - (caixa.left + caixa.width / 2)) * escala;
    const dy = (event.clientY - (caixa.top + caixa.height / 2)) * escala;
    if (dx === 0 && dy === 0) return;

    onChange(sombraDoPonteiro(dx, dy, event.shiftKey));
  }

  /**
   * O céu INTEIRO pega o gesto, e não só o disco.
   *
   * No palco só o disco pegava, porque tudo em volta dele era mapa clicável.
   * Aqui em volta não há nada: clicar no poente é dizer "o sol está ali", que é
   * um gesto a menos que mirar um alvo de onze pixels e arrastá-lo até lá.
   */
  function pegar(event: ReactPointerEvent) {
    if (desabilitado) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    setArrastando(true);
    levarPara(event);
  }

  function girar(event: React.KeyboardEvent) {
    if (desabilitado) return;

    const passo = event.shiftKey ? TRAVA_EM_GRAUS : PASSO_EM_GRAUS;
    const teclas: Record<string, Pick<Sol, "angulo" | "comprimento">> = {
      ArrowLeft: { angulo: sol.angulo - passo, comprimento: sol.comprimento },
      ArrowRight: { angulo: sol.angulo + passo, comprimento: sol.comprimento },
      // Para cima é o sol subindo, e sol mais alto faz sombra mais curta.
      ArrowUp: {
        angulo: sol.angulo,
        comprimento: sol.comprimento - PASSO_DE_ALTURA,
      },
      ArrowDown: {
        angulo: sol.angulo,
        comprimento: sol.comprimento + PASSO_DE_ALTURA,
      },
    };

    const alvo = teclas[event.key];
    if (!alvo) return;

    event.preventDefault();
    onChange({
      angulo: ((Math.round(alvo.angulo) % 360) + 360) % 360,
      comprimento: Math.round(alvo.comprimento * 100) / 100,
    });
  }

  return (
    <svg
      ref={ref}
      role="application"
      aria-label="Direção e altura do sol"
      aria-disabled={desabilitado}
      tabIndex={desabilitado ? -1 : 0}
      viewBox={`${-LADO / 2} ${-LADO / 2} ${LADO} ${LADO}`}
      className={cn(
        "bg-muted/30 mx-auto block size-44 touch-none rounded-md outline-none",
        "focus-visible:ring-ring/50 focus-visible:ring-2",
        desabilitado
          ? "text-muted-foreground opacity-40"
          : arrastando
            ? "cursor-grabbing"
            : "cursor-grab",
      )}
      onPointerDown={pegar}
      onPointerMove={(event) => {
        if (arrastando) levarPara(event);
      }}
      onPointerUp={() => setArrastando(false)}
      onPointerCancel={() => setArrastando(false)}
      onKeyDown={girar}
    >
      {/* O horizonte: até onde o sol desce, e é o que diz que há mais céu para
          arrastar. Pontilhado porque não é coisa do mapa. */}
      <circle
        cx={0}
        cy={0}
        r={LONGE_PX}
        fill="none"
        stroke={desabilitado ? "currentColor" : COR_DA_HASTE}
        strokeWidth={1}
        strokeOpacity={0.6}
        strokeDasharray="6 6"
      />

      {/* O raio de luz, do sol ao pino: é ele que amarra as duas pontas do
          controle -- o que se arrasta e o que acontece. */}
      <line
        x1={solX}
        y1={solY}
        x2={0}
        y2={0}
        stroke={desabilitado ? "currentColor" : COR_DA_HASTE}
        strokeWidth={1}
        strokeOpacity={0.45}
        strokeDasharray="3 5"
      />

      {/* O relógio de sol: um pino e a sombra dele, na direção e no comprimento
          que a cena inteira vai ter. É o que faz o controle se explicar sem
          rótulo -- arrastar o sol de um lado joga a sombra do pino para o
          outro, que é exatamente o que acontece nas figuras. */}
      <line
        x1={0}
        y1={0}
        x2={sombraDoPino.x}
        y2={sombraDoPino.y}
        stroke="#000"
        strokeOpacity={desabilitado ? 0.35 : 0.55}
        strokeWidth={PINO_PX * 1.6}
        strokeLinecap="round"
      />
      <circle
        cx={0}
        cy={0}
        r={PINO_PX}
        fill={desabilitado ? "currentColor" : COR_DO_SOL}
        stroke="rgb(23 23 23 / 0.7)"
        strokeWidth={1}
      />

      {/* O sol, com os raios de fora. O halo transparente é a área de pegar:
          um disco de onze pixels é alvo de mira, e este é um controle que se
          arrasta olhando o mapa, não o cursor. */}
      <circle cx={solX} cy={solY} r={HALO_PX} fill="transparent" />
      {RAIOS.map((grau) => {
        const angulo = grau * GRAU;

        return (
          <line
            key={grau}
            x1={solX + Math.cos(angulo) * (SOL_PX + 2)}
            y1={solY + Math.sin(angulo) * (SOL_PX + 2)}
            x2={solX + Math.cos(angulo) * (SOL_PX + 5)}
            y2={solY + Math.sin(angulo) * (SOL_PX + 5)}
            stroke={desabilitado ? "currentColor" : COR_DO_SOL}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeOpacity={0.9}
          />
        );
      })}
      <circle
        cx={solX}
        cy={solY}
        r={SOL_PX}
        fill={desabilitado ? "currentColor" : COR_DO_SOL}
        stroke="rgb(23 23 23 / 0.7)"
        strokeWidth={2}
      />
    </svg>
  );
}
