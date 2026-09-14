"use client";

import { useEffect, useRef } from "react";
import { GripVertical, Maximize2 } from "lucide-react";

import { DadoRolando } from "@/components/playground/dado-rolando";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  limitarEscala,
  useKillfeedStore,
  type LugarDaFaixa,
} from "@/lib/store/use-killfeed-store";
import {
  DURACAO_DA_CHEGADA,
  instanteDaQueda,
  useQuedaDasRolagens,
} from "@/hooks/use-queda-das-rolagens";
import { useRolagensStore } from "@/lib/store/use-rolagens-store";
import { encaixar, useWindowStore } from "@/lib/store/use-window-store";
import { cn } from "@/lib/utils";
import { valorDaRolagem } from "@/types/dado";

/** Quantos dados a fileira mostra de uma vez. O resto está no chip. */
const TETO = 6;

/**
 * Quantos pixels de arrasto valem um passo inteiro de escala.
 *
 * Alto de propósito: a alça fica num canto de trinta pixels, e um fator curto
 * faria a fileira dobrar de tamanho com um tremor da mão. Duzentos pixels
 * cobrem o intervalo útil inteiro num gesto confortável.
 */
const PIXELS_POR_ESCALA = 200;

/**
 * O que os jogadores jogaram, no canto do palco do mestre.
 *
 * FORA do plano da cena, e é a diferença que separa os dois saquinhos. O dado
 * do mestre é objeto sobre a mesa: ele cai no mapa, é arrastado, é relançado, e
 * acompanha zoom e deslocamento porque pertence àquele lugar. O dado do jogador
 * não pertence ao mapa — ele pertence à pessoa que o jogou, do outro lado da
 * sala. Pousá-lo no plano da cena o deixaria debaixo de um token, fora da vista
 * num canto ampliado, ou no meio do mapa que o mestre está montando.
 *
 * Inerte de propósito: não arrasta, não relança, não abre nada. O mestre não
 * mexe no dado de ninguém — o único gesto que ele tem aqui é tirar da mesa, e é
 * o clique. Quem limpa tudo de uma vez é o chip ao lado.
 *
 * Some sozinho: cada dado sai trinta segundos depois de cair. Ver
 * `PRAZO_DO_DADO_MS`.
 *
 * SEM moldura, no alto e ao centro, como o aviso de abate de um jogo. Era uma
 * fileira de pílulas opacas encostada na direita, e as duas coisas incomodavam:
 * a pílula tapava o mapa justamente onde o mestre estava montando, e a coluna
 * da direita é onde moram os painéis. No alto e ao centro o texto passa por
 * cima do mapa sem esconder região nenhuma, e o olho o encontra sem procurar --
 * é para onde ele já vai quando alguém do outro lado da sala anuncia um número.
 *
 * A legibilidade vem da SOMBRA e não de um fundo: mapa é imagem, e qualquer
 * cor de fundo acerta uns mapas e erra outros. Texto claro com sombra escura
 * lê tanto sobre a masmorra preta quanto sobre a taverna clara -- é a razão de
 * o jogo inteiro desenhar assim.
 *
 * O dado CAI aqui, e o número só aparece quando ele pousa. Antes a linha nascia
 * pronta no instante do arremesso, que é entre um e dois segundos ANTES de o
 * dado pousar no aparelho de quem rolou: o mestre lia o número em voz alta
 * enquanto o jogador ainda olhava o dado dele girando. Ver `DadoRolando`.
 */
export function RolagensFaixa() {
  const bandeja = useRolagensStore((state) => state.bandeja);
  const apagar = useRolagensStore((state) => state.apagar);

  const { chegada, agora } = useQuedaDasRolagens(bandeja);

  const lugar = useKillfeedStore((state) => state.lugar);
  const acomodar = useKillfeedStore((state) => state.acomodar);
  const restaurar = useKillfeedStore((state) => state.restaurar);
  const hidratar = useKillfeedStore((state) => state.hidratar);

  /** O palco, para a fileira não ser arrastada para fora dele. */
  const limites = useWindowStore((state) => state.limites);

  useEffect(hidratar, [hidratar]);

  /** A caixa posicionada. Move-se por `style` durante o gesto. */
  const caixa = useRef<HTMLDivElement | null>(null);

  /**
   * Onde o gesto começou, e onde ele chegou.
   *
   * O mesmo desenho do arrasto de janela: enquanto a mão corre, quem move é o
   * DOM, e o store recebe o resultado UMA vez, no fim. Escrever a cada quadro
   * redesenharia a fileira inteira sessenta vezes por segundo, e ela tem um
   * desenho de dado por linha.
   */
  const inicio = useRef({
    ponteiro: { x: 0, y: 0 },
    lugar: { x: 0, y: 0, escala: 1 },
  });
  const fim = useRef<LugarDaFaixa>({ x: 0, y: 0, escala: 1 });

  /** Onde a fileira está AGORA, em pixels do palco. */
  function lugarAtual(): LugarDaFaixa {
    const alvo = caixa.current;
    const pai = alvo?.offsetParent;

    // No padrão a fileira é centrada por layout e não tem `x` guardado: o
    // primeiro arrasto o descobre medindo, e é isso que faz a fileira começar
    // a se mover de onde ela estava, e não saltar para o canto.
    if (!alvo || !(pai instanceof HTMLElement))
      return lugar ?? { x: 0, y: 0, escala: 1 };

    const dela = alvo.getBoundingClientRect();
    const dele = pai.getBoundingClientRect();

    return {
      x: Math.round(dela.left - dele.left),
      y: Math.round(dela.top - dele.top),
      escala: lugar?.escala ?? 1,
    };
  }

  function comecar(event: React.PointerEvent) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    inicio.current = {
      ponteiro: { x: event.clientX, y: event.clientY },
      lugar: lugarAtual(),
    };
    fim.current = inicio.current.lugar;
  }

  function mover(event: React.PointerEvent) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;

    const { ponteiro, lugar: partida } = inicio.current;
    const solto = encaixar(
      partida.x + event.clientX - ponteiro.x,
      partida.y + event.clientY - ponteiro.y,
      limites,
    );

    fim.current = { ...solto, escala: partida.escala };

    const alvo = caixa.current;
    if (!alvo) return;

    // As MESMAS propriedades que o `style` deste componente declara — é o que
    // dispensa limpeza: ao confirmar, o render seguinte as reescreve por cima.
    alvo.style.setProperty("left", `${solto.x}px`);
    alvo.style.setProperty("top", `${solto.y}px`);
  }

  function escalar(event: React.PointerEvent) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;

    const { ponteiro, lugar: partida } = inicio.current;
    const escala = limitarEscala(
      partida.escala + (event.clientY - ponteiro.y) / PIXELS_POR_ESCALA,
    );

    fim.current = { ...partida, escala };

    caixa.current?.style.setProperty("--faixa-escala", `${escala}`);
  }

  function confirmar(event: React.PointerEvent) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;

    event.currentTarget.releasePointerCapture(event.pointerId);
    acomodar(fim.current);
  }

  if (bandeja.length === 0) return null;

  const escala = lugar?.escala ?? 1;

  return (
    <div
      ref={caixa}
      className={cn(
        "group/faixa pointer-events-auto absolute",
        // Sem lugar gravado a fileira é centrada por LAYOUT, e não por um `x`
        // calculado: assim ela continua no meio quando a janela muda de
        // largura. Ver `LugarDaFaixa`.
        !lugar && "inset-x-0 top-12 flex justify-center",
      )}
      style={
        lugar
          ? {
              left: lugar.x,
              top: lugar.y,
              ["--faixa-escala" as string]: escala,
            }
          : { ["--faixa-escala" as string]: escala }
      }
    >
      <div className="relative">
        {/* A escala é `scale` e não `transform`: no modo padrão quem centra é o
            flex do pai, e um `transform` aqui brigaria com isso. `origin-top`
            faz a fileira crescer para baixo, ancorada onde ela já estava. */}
        <ul
          className="flex origin-top flex-col items-center gap-0.5"
          style={{ scale: "var(--faixa-escala)" }}
        >
          {bandeja.slice(0, TETO).map((rolagem) => {
            const t = instanteDaQueda(chegada.get(rolagem.id), agora);
            const assentou = t >= DURACAO_DA_CHEGADA;

            return (
              <li key={rolagem.id}>
                <button
                  type="button"
                  // O nome inteiro no rótulo: a linha o trunca quando o jogador
                  // escolheu um nome comprido, e quem lê por voz precisa do todo.
                  aria-label={`Tirar da mesa: ${rolagem.jogador} tirou ${valorDaRolagem(
                    rolagem.faces,
                    rolagem.valor,
                  )} no d${rolagem.faces}`}
                  onClick={() => apagar(rolagem.id)}
                  // A sombra vai no BOTÃO e não só no texto: ela alcança o desenho do
                  // dado junto, que é SVG e sumiria num mapa claro do mesmo jeito.
                  //
                  // O fundo só aparece no hover, e é o que diz que a linha é
                  // clicável: sem ele, passar o mouse por cima do texto solto não
                  // prometia nada.
                  className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-left drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] transition-colors hover:bg-black/40"
                >
                  <DadoRolando
                    id={rolagem.id}
                    faces={rolagem.faces}
                    valor={rolagem.valor}
                    tamanho={22}
                    t={t}
                  />

                  {/* Teto na largura e não largura fixa: a fileira é centrada, e um
                  bloco fixo deixaria "Ana" flutuando no meio de um vão. O teto só
                  existe para um nome de sessenta caracteres não atravessar o
                  mapa. */}
                  <span className="max-w-40 truncate text-xs leading-tight font-medium text-white">
                    {rolagem.jogador}
                  </span>

                  {/* A linha tem DOIS estados, e esta é a coluna deles: "Rolando"
                  enquanto o dado tomba, o resultado quando ele pousa.

                  A palavra existe porque o dado miúdo tombando é ambíguo a três
                  metros de distância — dele sozinho não dá para saber se a
                  jogada está em curso ou se a fileira travou. Com ela, a linha
                  se explica antes de ter número.

                  Os dois EMPILHADOS na mesma célula, e não um trocado pelo
                  outro: a fileira é centrada linha a linha, e uma coluna que
                  encolhesse de "Rolando" para "17" faria a linha inteira
                  escorregar para o lado no instante do resultado — justo quando
                  a mesa está olhando para ela. Empilhados, a célula tem a
                  largura da palavra desde o primeiro quadro e nada se move; de
                  quebra, os resultados das várias linhas ficam alinhados. */}
                  <span className="grid place-items-start">
                    <span
                      className="text-sm leading-tight font-bold tabular-nums text-white transition-opacity duration-200 [grid-area:1/1]"
                      style={{ opacity: assentou ? 1 : 0 }}
                    >
                      {valorDaRolagem(rolagem.faces, rolagem.valor)}
                    </span>

                    <span
                      aria-hidden
                      className="text-xs leading-tight font-medium text-white/60 transition-opacity duration-200 [grid-area:1/1] self-center"
                      style={{ opacity: assentou ? 0 : 1 }}
                    >
                      Rolando…
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* As alças só existem no hover. A fileira é um aviso que passa, não um
            painel: mostrá-las o tempo todo poria duas iscas de clique por cima
            do mapa para um gesto que se faz uma vez por campanha. */}
        <div className="absolute -top-1 -left-6 opacity-0 transition-opacity group-hover/faixa:opacity-100 focus-within:opacity-100 motion-reduce:transition-none">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label="Mover a fileira de dados"
                  className="text-white/70 hover:text-white flex size-5 cursor-grab items-center justify-center rounded drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] active:cursor-grabbing"
                  onPointerDown={comecar}
                  onPointerMove={mover}
                  onPointerUp={confirmar}
                  onPointerCancel={confirmar}
                  // Duplo clique devolve ao alto e ao centro. É a saída de quem
                  // arrastou a fileira para fora da vista e não tem como pegá-la
                  // de volta -- a alça mora nela.
                  onDoubleClick={restaurar}
                >
                  <GripVertical className="size-4" aria-hidden />
                </button>
              }
            />
            <TooltipContent>
              <p className="max-w-48">
                Arraste para mover. Dois cliques devolvem ao topo.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="absolute -right-6 -bottom-1 opacity-0 transition-opacity group-hover/faixa:opacity-100 focus-within:opacity-100 motion-reduce:transition-none">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label="Mudar o tamanho da fileira de dados"
                  className="text-white/70 hover:text-white flex size-5 cursor-nwse-resize items-center justify-center rounded drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]"
                  onPointerDown={comecar}
                  onPointerMove={escalar}
                  onPointerUp={confirmar}
                  onPointerCancel={confirmar}
                >
                  <Maximize2 className="size-3.5" aria-hidden />
                </button>
              }
            />
            <TooltipContent>
              <p className="max-w-48">
                Arraste para baixo para aumentar, para cima para diminuir.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
