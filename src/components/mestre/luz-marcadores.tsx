"use client";

import type { PointerEvent as ReactPointerEvent } from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import { raioIntensoDe } from "@/lib/geometry/luz";
import { SCENE_HEIGHT, SCENE_WIDTH, type Luz, type Scene } from "@/types/scene";

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

/**
 * As luzes cravadas, do jeito que só o Mestre as vê: o ponto e o alcance.
 *
 * Fora do `SceneLayer`, pela razão da parede: ele é o componente da TV, e um
 * marcador de tocha lá entregaria à mesa onde há luz antes de ela acender. A
 * mesa vê a LUZ, desenhada pela `LuzLayer` -- não o ponto de onde ela sai.
 *
 * O anel é tracejado na cor da luz. Sem ele, com a escuridão em zero, o mestre
 * cravaria a tocha e não teria como saber até onde ela vai.
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
      className="pointer-events-none absolute top-0 left-0"
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
      viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}
    >
      {luzes.map((luz) => {
        const selecionada = luz.id === selectedLuzId;
        const intenso = raioIntensoDe(luz.raio, luz.raioIntenso);

        return (
          <g key={luz.id}>
            <circle
              cx={luz.x}
              cy={luz.y}
              r={luz.raio}
              fill="none"
              stroke={luz.cor}
              strokeWidth={1.5 / scale}
              strokeOpacity={selecionada ? 0.9 : 0.35}
              strokeDasharray={`${8 / scale} ${6 / scale}`}
              pointerEvents="none"
            />

            {selecionada ? (
              <>
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
                    pointerEvents: aneisInertes ? "none" : "stroke",
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
                    pointerEvents: aneisInertes ? "none" : "auto",
                    cursor: "ew-resize",
                  }}
                  onPointerDown={(event) => ajustarRaio(event, luz)}
                >
                  <title>Área da luz</title>
                </circle>

                {/* O raio FORTE, por dentro do da área: traço mais curto, para
                    os dois anéis não se confundirem quando ficam perto. Só com
                    a luz escolhida -- com todas mostrando dois anéis, o mapa
                    viraria um alvo de tiro. */}
                <circle
                  cx={luz.x}
                  cy={luz.y}
                  r={intenso}
                  fill="none"
                  stroke={luz.cor}
                  strokeWidth={1.5 / scale}
                  strokeOpacity={0.9}
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
                    pointerEvents: aneisInertes ? "none" : "stroke",
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
                    pointerEvents: aneisInertes ? "none" : "auto",
                    cursor: "ew-resize",
                  }}
                  onPointerDown={(event) => ajustarRaioIntenso(event, luz)}
                >
                  <title>Raio forte</title>
                </circle>
              </>
            ) : null}

            <circle
              cx={luz.x}
              cy={luz.y}
              r={PONTO_PX / scale}
              fill={luz.cor}
              stroke={selecionada ? "#fff" : "rgb(23 23 23 / 0.7)"}
              strokeWidth={2 / scale}
              style={{
                pointerEvents: pontosInertes ? "none" : "auto",
                cursor: "move",
              }}
              onPointerDown={(event) => mover(event, luz)}
            />
          </g>
        );
      })}
    </svg>
  );
}
