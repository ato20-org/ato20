"use client";

import type { PointerEvent as ReactPointerEvent } from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import { coneDe, raioIntensoDe } from "@/lib/geometry/luz";
import {
  ABERTURA_MAXIMA,
  ABERTURA_MINIMA,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type ConeDaLuz,
  type Luz,
  type Scene,
} from "@/types/scene";

/**
 * Tudo aqui em pixels de TELA, dividido pelo `scale` na hora de desenhar.
 *
 * A regra das alças e do alfinete: um marcador em unidade de cena engrossaria
 * com o zoom, e a 400% o ponto da tocha cobriria a sala que ela acende.
 */
const PONTO_PX = 8;
/** A faixa invisível que recebe o arrasto do anel. */
const PEGA_DO_ANEL_PX = 16;
/** A alça à vista, na borda do anel. */
const ALCA_PX = 5;

/** Menor alcance de uma luz, em unidade de cena. Abaixo disso ela é um ponto. */
const RAIO_MINIMO = 60;
/**
 * Menor raio forte que a alça deixa. A conta aceita zero, mas a alça não:
 * em zero ela cairia embaixo do ponto do centro, e o mestre não teria mais
 * como pegá-la para abrir o raio de novo.
 */
const RAIO_INTENSO_MINIMO = 30;
/**
 * E o maior: a diagonal do plano, arredondada.
 *
 * Não é uma opinião sobre quanto uma tocha alcança -- é o ponto a partir do
 * qual crescer não muda nada, porque a luz já cobre a cena inteira de qualquer
 * canto. Sem teto, um arrasto atravessado deixava o raio em dezenas de milhares.
 */
const RAIO_MAXIMO = 2200;

/** O cinza do contorno do ponto, e do miolo dele quando a luz está desligada. */
const APAGADO = "rgb(23 23 23 / 0.7)";

/** Um ponto a `raio` do centro da luz, no ângulo dado em graus. */
function naBorda(luz: Luz, graus: number, raio: number) {
  const radianos = (graus * Math.PI) / 180;
  return {
    x: luz.x + Math.cos(radianos) * raio,
    y: luz.y + Math.sin(radianos) * raio,
  };
}

/**
 * O trecho `A` de um arco que já começa em `de` e vai, no sentido horário, até
 * `ate` graus. Sem o `M`: quem chama diz de onde ele sai.
 */
function trechoDoArco(luz: Luz, raio: number, de: number, ate: number): string {
  const fim = naBorda(luz, ate, raio);
  const grande = ate - de > 180 ? 1 : 0;
  return `A ${raio} ${raio} 0 ${grande} 1 ${fim.x} ${fim.y}`;
}

/** O arco de `de` até `ate` graus, sozinho, num caminho de SVG. */
function arco(luz: Luz, raio: number, de: number, ate: number): string {
  const inicio = naBorda(luz, de, raio);
  return `M ${inicio.x} ${inicio.y} ${trechoDoArco(luz, raio, de, ate)}`;
}

/** Para onde o ponteiro está, visto do centro da luz, em graus de 0 a 360. */
function anguloAte(luz: Luz, ponta: { x: number; y: number }): number {
  const graus = (Math.atan2(ponta.y - luz.y, ponta.x - luz.x) * 180) / Math.PI;
  return (graus + 360) % 360;
}

/**
 * As luzes cravadas, do jeito que só o Mestre as vê: o ponto e o alcance.
 *
 * Fora do `SceneLayer`, pela razão da parede: ele é o componente da TV, e um
 * marcador de tocha lá entregaria à mesa onde há luz antes de ela acender. A
 * mesa vê a LUZ, desenhada pela `LuzLayer` -- não o ponto de onde ela sai.
 *
 * O anel é tracejado na cor da luz, e só na SELECIONADA: sem ele, com a
 * escuridão em zero, o mestre cravaria a tocha e não teria como saber até onde
 * ela vai -- mas com o anel de todas à vista, um mapa com seis tochas vira um
 * alvo de tiro por cima do que o mestre veio olhar. Largada, a luz fica só com
 * o ponto, e clicar nele traz o anel de volta.
 *
 * O cone troca o anel pelo facho: as duas bordas, o arco do alcance, e três
 * alças -- a ponta, que aponta e alcança; a da borda, que abre; e a de dentro,
 * o raio forte, como no círculo.
 *
 * A luz desligada continua aqui, com o miolo vazio: é o que diz ao mestre que
 * a tocha existe e está apagada, e é onde ele clica para acendê-la de novo.
 *
 * A lanterna de um token não aparece aqui: quem a mostra é o próprio token, e
 * o alcance dela se escolhe no menu dele. Ver `SubmenuDaLanterna`.
 *
 * Um SVG do tamanho exato do plano, como o da parede: nada aqui sai da caixa.
 */
export function LuzMarcadores({
  scene,
  panMode,
}: {
  scene: Scene;
  panMode: boolean;
}) {
  const { scale, toScene } = useSceneScale();
  const arrastar = useSceneDrag();
  const tool = useToolStore((state) => state.tool);

  const selectedLuzId = useSelectionStore((state) => state.selectedLuzId);
  const selectLuz = useSelectionStore((state) => state.selectLuz);
  const updateLuz = useSceneStore((state) => state.updateLuz);

  const luzes = scene.luzes ?? [];
  if (luzes.length === 0) return null;

  // Com a própria ferramenta na mão o ANEL deixa o clique passar: ali o gesto
  // é acender outra, e a faixa larga do anel engoliria a tocha que cai perto
  // da borda de uma já acesa. O PONTO continua respondendo: clicar nele pega a
  // luz que já existe, e duas luzes no mesmo pixel não é um pedido que alguém
  // faz. Com espaço segurado, tudo inerte -- o gesto é da câmera.
  const aneisInertes = panMode || tool === "luz";
  const pontosInertes = panMode;

  function mover(event: ReactPointerEvent, luz: Luz) {
    // Selecionar em qualquer botão: o direito abre o menu, e o menu fala da
    // luz selecionada. O arrasto em si só começa no esquerdo.
    selectLuz(luz.id);
    // O direito para aqui: o `pointerdown` do palco limpa a seleção com o
    // botão direito, e o menu abriria sem a luz que acabou de ser escolhida.
    if (event.button === 2) event.stopPropagation();
    // Travada, o toque só seleciona -- e para aqui, senão o palco largaria a
    // luz que acabou de pegar. É o caminho até o cadeado do painel.
    if (luz.locked) {
      event.stopPropagation();
      return;
    }
    const origem = { x: luz.x, y: luz.y };

    arrastar(event, {
      onMove: (delta) =>
        updateLuz(scene.id, luz.id, {
          x: Math.round(origem.x + delta.x),
          y: Math.round(origem.y + delta.y),
        }),
    });
  }

  /**
   * O alcance, arrastando a borda.
   *
   * Pela posição absoluta do ponteiro e não pelo `delta`: a alça mora NA borda,
   * e o raio é a distância dela até o centro. Somar o deslocamento daria o
   * mesmo número só enquanto o mestre arrastasse na horizontal.
   */
  function ajustarRaio(event: ReactPointerEvent, luz: Luz) {
    selectLuz(luz.id);

    arrastar(event, {
      onMove: (_delta, native) => {
        const ponta = toScene(native.clientX, native.clientY);
        const raio = Math.round(
          Math.min(
            RAIO_MAXIMO,
            Math.max(RAIO_MINIMO, Math.hypot(ponta.x - luz.x, ponta.y - luz.y)),
          ),
        );
        updateLuz(scene.id, luz.id, {
          raio,
          // O raio forte que o mestre escolheu não passa da área: encolher a
          // área o empurra junto. O que ele não escolheu segue a metade
          // sozinho -- ver `FRACAO_INTENSA_PADRAO`.
          ...(luz.raioIntenso !== undefined && luz.raioIntenso > raio
            ? { raioIntenso: raio }
            : {}),
        });
      },
    });
  }

  /**
   * A ponta do cone: para onde ele aponta E até onde vai, num gesto só. É o
   * gesto de quem mira uma lanterna.
   */
  function apontar(event: ReactPointerEvent, luz: Luz, cone: ConeDaLuz) {
    selectLuz(luz.id);

    arrastar(event, {
      onMove: (_delta, native) => {
        const ponta = toScene(native.clientX, native.clientY);
        const raio = Math.round(
          Math.min(
            RAIO_MAXIMO,
            Math.max(RAIO_MINIMO, Math.hypot(ponta.x - luz.x, ponta.y - luz.y)),
          ),
        );
        updateLuz(scene.id, luz.id, {
          raio,
          cone: { ...cone, angulo: Math.round(anguloAte(luz, ponta)) },
          ...(luz.raioIntenso !== undefined && luz.raioIntenso > raio
            ? { raioIntenso: raio }
            : {}),
        });
      },
    });
  }

  /**
   * A borda do cone: a abertura é o dobro do ângulo entre o ponteiro e o
   * eixo. O eixo fica onde está -- abrir o facho não pode virá-lo.
   */
  function abrir(event: ReactPointerEvent, luz: Luz, cone: ConeDaLuz) {
    selectLuz(luz.id);

    arrastar(event, {
      onMove: (_delta, native) => {
        const ponta = toScene(native.clientX, native.clientY);
        const desvio = Math.abs(
          ((((anguloAte(luz, ponta) - cone.angulo) % 360) + 540) % 360) - 180,
        );
        updateLuz(scene.id, luz.id, {
          cone: {
            ...cone,
            abertura: Math.round(
              Math.min(ABERTURA_MAXIMA, Math.max(ABERTURA_MINIMA, desvio * 2)),
            ),
          },
        });
      },
    });
  }

  /** O raio forte, arrastando o anel de dentro. Pela mesma conta do alcance. */
  function ajustarRaioIntenso(event: ReactPointerEvent, luz: Luz) {
    selectLuz(luz.id);

    arrastar(event, {
      onMove: (_delta, native) => {
        const ponta = toScene(native.clientX, native.clientY);
        const distancia = Math.hypot(ponta.x - luz.x, ponta.y - luz.y);
        updateLuz(scene.id, luz.id, {
          raioIntenso: Math.round(
            Math.min(luz.raio, Math.max(RAIO_INTENSO_MINIMO, distancia)),
          ),
        });
      },
    });
  }

  return (
    <svg
      // `overflow-visible`: o SVG tem o tamanho do plano, e cortava o que
      // passasse da borda. A luz pode ser levada para fora do mapa, e lá ela
      // sumia -- o ponto, o anel e a alça --, sem onde clicar para trazê-la de
      // volta. Uma luz encostada na borda também perdia a metade de fora do
      // anel, e com ela a alça do alcance.
      className="pointer-events-none absolute top-0 left-0 overflow-visible"
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
      viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}
    >
      {luzes.map((luz) => {
        const selecionada = luz.id === selectedLuzId;
        const intenso = raioIntensoDe(luz.raio, luz.raioIntenso);
        const cone = coneDe(luz.cone);
        // A desligada mostra o alcance mais fraco: continua ajustável, mas
        // não finge que está acendendo nada.
        const traco = luz.desligada ? 0.45 : 0.9;
        // Travada, os anéis continuam dizendo até onde ela chega, mas nenhum
        // se arrasta, e as alças à vista somem: alça que não responde é
        // convite a um gesto que não acontece.
        const presa = Boolean(luz.locked);
        const pegasInertes = aneisInertes || presa;

        return (
          <g key={luz.id}>
            {selecionada && !cone ? (
              <>
                <circle
                  cx={luz.x}
                  cy={luz.y}
                  r={luz.raio}
                  fill="none"
                  stroke={luz.cor}
                  strokeWidth={1.5 / scale}
                  strokeOpacity={traco}
                  strokeDasharray={`${8 / scale} ${6 / scale}`}
                  pointerEvents="none"
                />

                {/* A pega do alcance: o anel INTEIRO, numa faixa invisível e
                    larga. O tracejado tem um pixel e meio, e pegar um pixel e
                    meio com o mouse é sorte. O anel todo, e não só a alça: a
                    luz pode estar num canto, com a alça fora da tela. */}
                <circle
                  cx={luz.x}
                  cy={luz.y}
                  r={luz.raio}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={PEGA_DO_ANEL_PX / scale}
                  style={{
                    pointerEvents: pegasInertes ? "none" : "stroke",
                    cursor: "ew-resize",
                  }}
                  onPointerDown={(event) => ajustarRaio(event, luz)}
                />

                {/* E a alça à vista, na borda direita: sem ela o anel é uma
                    linha tracejada que não se anuncia como arrastável. */}
                <circle
                  cx={luz.x + luz.raio}
                  cy={luz.y}
                  r={ALCA_PX / scale}
                  fill="#fff"
                  stroke={luz.cor}
                  strokeWidth={2 / scale}
                  style={{
                    pointerEvents: pegasInertes ? "none" : "auto",
                    display: presa ? "none" : undefined,
                    cursor: "ew-resize",
                  }}
                  onPointerDown={(event) => ajustarRaio(event, luz)}
                >
                  <title>Área da luz</title>
                </circle>

                {/* O raio FORTE, por dentro do da área: traço mais curto, para
                    os dois anéis não se confundirem quando ficam perto. */}
                <circle
                  cx={luz.x}
                  cy={luz.y}
                  r={intenso}
                  fill="none"
                  stroke={luz.cor}
                  strokeWidth={1.5 / scale}
                  strokeOpacity={traco}
                  strokeDasharray={`${3 / scale} ${4 / scale}`}
                  pointerEvents="none"
                />
                <circle
                  cx={luz.x}
                  cy={luz.y}
                  r={intenso}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={PEGA_DO_ANEL_PX / scale}
                  style={{
                    pointerEvents: pegasInertes ? "none" : "stroke",
                    cursor: "ew-resize",
                  }}
                  onPointerDown={(event) => ajustarRaioIntenso(event, luz)}
                />

                {/* A alça do raio forte fica à ESQUERDA, e a da área à
                    direita: com os dois raios quase iguais, as alças do mesmo
                    lado ficariam uma em cima da outra. Cheia na cor da luz, e
                    não branca como a outra: é o miolo, onde a luz é mais
                    forte. */}
                <circle
                  cx={luz.x - intenso}
                  cy={luz.y}
                  r={ALCA_PX / scale}
                  fill={luz.cor}
                  stroke="#fff"
                  strokeWidth={2 / scale}
                  style={{
                    pointerEvents: pegasInertes ? "none" : "auto",
                    display: presa ? "none" : undefined,
                    cursor: "ew-resize",
                  }}
                  onPointerDown={(event) => ajustarRaioIntenso(event, luz)}
                >
                  <title>Raio forte</title>
                </circle>
              </>
            ) : null}

            {selecionada && cone
              ? (() => {
                  const de = cone.angulo - cone.abertura / 2;
                  const ate = cone.angulo + cone.abertura / 2;
                  const ponta = naBorda(luz, cone.angulo, luz.raio);
                  const borda = naBorda(luz, ate, luz.raio);
                  const miolo = naBorda(luz, de, intenso);
                  const comeco = naBorda(luz, de, luz.raio);

                  return (
                    <>
                      {/* O facho: as duas bordas e o arco do alcance, num
                          contorno só. */}
                      <path
                        d={`M ${luz.x} ${luz.y} L ${comeco.x} ${comeco.y} ${trechoDoArco(luz, luz.raio, de, ate)} Z`}
                        fill="none"
                        stroke={luz.cor}
                        strokeWidth={1.5 / scale}
                        strokeOpacity={traco}
                        strokeDasharray={`${8 / scale} ${6 / scale}`}
                        strokeLinejoin="round"
                        pointerEvents="none"
                      />
                      {/* A pega do alcance é o ARCO, pela razão do anel: a
                          ponta pode estar fora da tela. */}
                      <path
                        d={arco(luz, luz.raio, de, ate)}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={PEGA_DO_ANEL_PX / scale}
                        style={{
                          pointerEvents: pegasInertes ? "none" : "stroke",
                          cursor: "ew-resize",
                        }}
                        onPointerDown={(event) => ajustarRaio(event, luz)}
                      />

                      {/* O raio forte, o mesmo traço curto do círculo. */}
                      <path
                        d={arco(luz, intenso, de, ate)}
                        fill="none"
                        stroke={luz.cor}
                        strokeWidth={1.5 / scale}
                        strokeOpacity={traco}
                        strokeDasharray={`${3 / scale} ${4 / scale}`}
                        pointerEvents="none"
                      />
                      <path
                        d={arco(luz, intenso, de, ate)}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={PEGA_DO_ANEL_PX / scale}
                        style={{
                          pointerEvents: pegasInertes ? "none" : "stroke",
                          cursor: "ew-resize",
                        }}
                        onPointerDown={(event) =>
                          ajustarRaioIntenso(event, luz)
                        }
                      />

                      {/* As três alças em três lugares: a do raio forte na
                          borda de um lado, a da abertura na ponta do outro, e
                          a da direção no eixo. Com os dois raios iguais, a
                          do forte e a da ponta continuam separadas pela
                          metade da abertura. */}
                      <circle
                        cx={miolo.x}
                        cy={miolo.y}
                        r={ALCA_PX / scale}
                        fill={luz.cor}
                        stroke="#fff"
                        strokeWidth={2 / scale}
                        style={{
                          pointerEvents: pegasInertes ? "none" : "auto",
                          display: presa ? "none" : undefined,
                          cursor: "ew-resize",
                        }}
                        onPointerDown={(event) =>
                          ajustarRaioIntenso(event, luz)
                        }
                      >
                        <title>Raio forte</title>
                      </circle>

                      {/* A da abertura é um losango, e não um círculo: é a
                          única que gira em vez de afastar, e a forma diferente
                          avisa antes do arrasto. */}
                      <rect
                        x={borda.x - ALCA_PX / scale}
                        y={borda.y - ALCA_PX / scale}
                        width={(ALCA_PX * 2) / scale}
                        height={(ALCA_PX * 2) / scale}
                        transform={`rotate(45 ${borda.x} ${borda.y})`}
                        fill="#fff"
                        stroke={luz.cor}
                        strokeWidth={2 / scale}
                        style={{
                          pointerEvents: pegasInertes ? "none" : "auto",
                          display: presa ? "none" : undefined,
                          cursor: "crosshair",
                        }}
                        onPointerDown={(event) => abrir(event, luz, cone)}
                      >
                        <title>Abertura do cone</title>
                      </rect>

                      <circle
                        cx={ponta.x}
                        cy={ponta.y}
                        r={ALCA_PX / scale}
                        fill="#fff"
                        stroke={luz.cor}
                        strokeWidth={2 / scale}
                        style={{
                          pointerEvents: pegasInertes ? "none" : "auto",
                          display: presa ? "none" : undefined,
                          cursor: "grab",
                        }}
                        onPointerDown={(event) => apontar(event, luz, cone)}
                      >
                        <title>Direção e alcance</title>
                      </circle>
                    </>
                  );
                })()
              : null}

            <circle
              cx={luz.x}
              cy={luz.y}
              r={PONTO_PX / scale}
              // Desligada, o miolo é o cinza do contorno e a cor vai para a
              // borda: a lâmpada apagada, que ainda diz de que cor acende.
              fill={luz.desligada ? APAGADO : luz.cor}
              stroke={selecionada ? "#fff" : luz.desligada ? luz.cor : APAGADO}
              strokeWidth={2 / scale}
              style={{
                pointerEvents: pontosInertes ? "none" : "auto",
                cursor: luz.locked ? "pointer" : "move",
              }}
              onPointerDown={(event) => mover(event, luz)}
            />
          </g>
        );
      })}
    </svg>
  );
}
