"use client";

import { useId, type PointerEvent as ReactPointerEvent } from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import {
  contornoDaParede,
  corpoDaParede,
  type FormaDaParede,
} from "@/lib/geometry/sombra";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type Luz,
  type Parede,
  type Scene,
} from "@/types/scene";

/**
 * Tudo aqui em pixels de TELA, dividido pelo `scale` na hora de desenhar.
 *
 * É a mesma regra das alças de transformação e do alfinete: um traço em
 * unidades de cena engrossaria com o zoom, e a 400% a parede viraria uma faixa
 * cobrindo o corredor que ela contorna.
 */
const TRACO_PX = 1.5;
const LUZ_PX = 8;

/**
 * O passo e a espessura da hachura, em pixels de tela.
 *
 * Esparsa, e isso foi correção: a 9px a faixa virava um bloco listrado, e numa
 * parede que corre perto dos 45° da tela os riscos ficavam quase paralelos às
 * bordas dela -- o olho lia meia dúzia de paredes finas em vez de uma grossa.
 * Hachura de planta é rala: ela diz "isto é maciço" com três riscos, não
 * preenche o desenho.
 */
const HACHURA_PASSO_PX = 26;
const HACHURA_TRACO_PX = 1;

/** Menor alcance de uma luz, em unidades de cena. Abaixo disso ela não ilumina. */
const RAIO_MINIMO = 60;
/**
 * E o maior: a diagonal do plano, arredondada.
 *
 * Não é uma opinião sobre quanto uma tocha alcança -- é o ponto a partir do
 * qual crescer não muda nada, porque a luz já cobre a cena inteira de qualquer
 * canto em que esteja. Sem teto, um arrasto atravessado deixava o raio em
 * dezenas de milhares e a umbra pintava uma área que ninguém vê.
 */
const RAIO_MAXIMO = 2200;

/** A faixa invisível que recebe o arrasto do anel, em pixels de tela. */
const PEGA_DO_ANEL_PX = 16;
/** A alça à vista, na borda do anel. */
const ALCA_PX = 5;

const COR_DA_PAREDE = "#facc15";
/**
 * A luz saiu do âmbar para o laranja quando a parede virou amarela: as duas
 * cores anteriores eram vizinhas, e num mapa de caverna -- que já é todo
 * ocre -- a tocha e a parede viravam a mesma mancha. O que separa as duas na
 * tela é primeiro a cor e só depois a forma.
 */
const COR_DA_LUZ = "#fb923c";

/**
 * As paredes e as luzes, do jeito que só o Mestre as vê.
 *
 * Mora aqui e NÃO no `SceneLayer`, pela mesma razão do `PinLayer`: o
 * `SceneLayer` é o mesmo componente do Espectador e do Jogador, e uma parede
 * desenhada lá apareceria na TV virada para a mesa -- entregando de graça onde
 * estão os cômodos que ninguém abriu. A mesa recebe a geometria, porque é ela
 * que calcula a própria sombra, mas o DESENHO dela é do palco do mestre.
 *
 * Um SVG só, do tamanho exato do plano: nada aqui sai da caixa, que é a regra
 * que o palco cobra de todo mundo (ver `debug-do-palco` §3).
 */
export function LuzLayer({
  scene,
  panMode,
  fantasma,
}: {
  scene: Scene;
  panMode: boolean;
  /**
   * A parede que o arrasto está desenhando agora, antes de existir na cena.
   *
   * Desenhada AQUI e não numa camada própria porque a hachura mora nos `defs`
   * deste SVG: uma prévia noutro lugar precisaria de um segundo padrão idêntico
   * -- e ela tem de sair exatamente igual ao que vai ficar, senão não é prévia.
   */
  fantasma?: FormaDaParede | null;
}) {
  const { scale, toScene } = useSceneScale();
  // `useId` traz dois-pontos, e dois-pontos dentro de um `url(#...)` não é
  // seletor válido.
  const base = useId().replace(/:/g, "");
  const arrastar = useSceneDrag();
  const tool = useToolStore((state) => state.tool);

  const selectedParedeId = useSelectionStore((state) => state.selectedParedeId);
  const selectedLuzId = useSelectionStore((state) => state.selectedLuzId);
  const selectParede = useSelectionStore((state) => state.selectParede);
  const selectLuz = useSelectionStore((state) => state.selectLuz);

  const updateParede = useSceneStore((state) => state.updateParede);
  const updateLuz = useSceneStore((state) => state.updateLuz);

  const paredes = scene.paredes ?? [];
  const luzes = scene.luzes ?? [];

  if (paredes.length === 0 && luzes.length === 0 && !fantasma) return null;

  // Com a própria ferramenta na mão o desenho deixa o clique passar: ali o
  // gesto é CRIAR outra, e não pegar a que já está embaixo do cursor. Mesma
  // regra do alfinete com a seta na mão. Com espaço segurado idem -- o gesto é
  // da câmera.
  const inerte = panMode || tool === "parede" || tool === "luz";

  function moverParede(event: ReactPointerEvent, parede: Parede) {
    selectParede(parede.id);
    const origem = { x: parede.x, y: parede.y };

    arrastar(event, {
      onMove: (delta) =>
        updateParede(scene.id, parede.id, {
          x: origem.x + delta.x,
          y: origem.y + delta.y,
        }),
    });
  }

  function moverLuz(event: ReactPointerEvent, luz: Luz) {
    selectLuz(luz.id);
    const origem = { x: luz.x, y: luz.y };

    arrastar(event, {
      onMove: (delta) =>
        updateLuz(scene.id, luz.id, {
          x: origem.x + delta.x,
          y: origem.y + delta.y,
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
        const raio = Math.hypot(ponta.x - luz.x, ponta.y - luz.y);
        updateLuz(scene.id, luz.id, {
          raio: Math.min(RAIO_MAXIMO, Math.max(RAIO_MINIMO, raio)),
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
      {/* A hachura é UMA, compartilhada por todas as paredes: um padrão por
          parede seria uma textura por parede para desenhar o mesmo risco. Em
          pixel de tela, como o resto deste desenho -- a GROSSURA é do mundo e
          acompanha o zoom, mas o risco que enche a faixa é instrumento, e
          instrumento se mede na tela. */}
      <defs>
        <pattern
          id={`${base}-hachura`}
          patternUnits="userSpaceOnUse"
          width={HACHURA_PASSO_PX / scale}
          height={HACHURA_PASSO_PX / scale}
          patternTransform="rotate(45)"
        >
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={HACHURA_PASSO_PX / scale}
            stroke={COR_DA_PAREDE}
            strokeWidth={HACHURA_TRACO_PX / scale}
            strokeOpacity={0.5}
          />
        </pattern>
      </defs>

      {paredes.map((parede) => {
        const selecionada = parede.id === selectedParedeId;
        const corpo = corpoDaParede(parede);
        const contorno = contornoDaParede(parede);
        const traco = TRACO_PX / scale;

        if (!corpo) return null;

        return (
          <g key={parede.id}>
            {/* O corpo, num amarelo quase transparente: é ele que diz que a
                parede é MACIÇA -- ela é a massa que o mestre desenhou, e não um
                contorno com borda grossa. A hachura rala sozinha não diz isso.

                É também quem recebe o gesto -- `all` e não o padrão, porque num
                `fill` de padrão os vãos entre os riscos não são pintados e o
                clique cairia através deles como se a parede tivesse buracos. */}
            <path
              d={corpo}
              fill={COR_DA_PAREDE}
              fillOpacity={0.1}
              style={{
                pointerEvents: inerte ? "none" : "all",
                cursor: "move",
              }}
              onPointerDown={(event) => moverParede(event, parede)}
            />
            <path
              d={corpo}
              fill={`url(#${base}-hachura)`}
              pointerEvents="none"
            />

            {/* A borda do corpo, fina: é ela que separa a pedra do mapa por
                baixo, e é o que o olho segue para ver onde a parede acaba.
                Sólida parada, tracejada selecionada -- o tracejado é o que diz
                "esta é a que está na mão". */}
            <path
              d={contorno}
              fill="none"
              stroke={COR_DA_PAREDE}
              strokeWidth={selecionada ? traco * 1.8 : traco}
              strokeOpacity={selecionada ? 0.95 : 0.55}
              strokeDasharray={
                selecionada ? `${traco * 5} ${traco * 4}` : undefined
              }
              pointerEvents="none"
            />
          </g>
        );
      })}

      {/* A prévia: a mesma pintura da parede pronta, esmaecida. Igual de
          propósito -- o mestre precisa ver o formato que vai ficar, e uma
          caixa de seleção retangular não conta isso de um círculo nem de um
          contorno à mão. */}
      {fantasma && corpoDaParede(fantasma) ? (
        <g opacity={0.65} pointerEvents="none">
          <path
            d={corpoDaParede(fantasma)}
            fill={COR_DA_PAREDE}
            fillOpacity={0.1}
          />
          <path d={corpoDaParede(fantasma)} fill={`url(#${base}-hachura)`} />
          <path
            d={contornoDaParede(fantasma)}
            fill="none"
            stroke={COR_DA_PAREDE}
            strokeWidth={(TRACO_PX * 1.8) / scale}
            strokeOpacity={0.95}
            strokeDasharray={`${(TRACO_PX * 5) / scale} ${(TRACO_PX * 4) / scale}`}
          />
        </g>
      ) : null}

      {luzes.map((luz) => {
        const selecionada = luz.id === selectedLuzId;

        return (
          <g key={luz.id}>
            {/* O alcance, pontilhado: é o que diz até onde a sombra existe, e
                sem ele o mestre cravaria a tocha e não entenderia por que o
                token do outro lado da sala não escureceu. */}
            <circle
              cx={luz.x}
              cy={luz.y}
              r={luz.raio}
              fill="none"
              stroke={COR_DA_LUZ}
              strokeWidth={1.5 / scale}
              strokeOpacity={selecionada ? 0.8 : 0.35}
              strokeDasharray={`${8 / scale} ${6 / scale}`}
              pointerEvents="none"
            />

            {selecionada ? (
              <>
                {/* A pega do alcance: o anel INTEIRO, numa faixa invisível e
                    larga. O pontilhado tem um pixel e meio de espessura, e
                    pegar um pixel e meio com o mouse é sorte -- o anel existia
                    e era arrastável desde o começo, e ninguém conseguia
                    encostar nele.

                    O anel todo e não só a alça: a luz pode estar num canto do
                    mapa, com a alça fora da tela, e aí puxar de qualquer ponto
                    da borda é o que salva o gesto. */}
                <circle
                  cx={luz.x}
                  cy={luz.y}
                  r={luz.raio}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={PEGA_DO_ANEL_PX / scale}
                  style={{
                    pointerEvents: inerte ? "none" : "stroke",
                    cursor: "ew-resize",
                  }}
                  onPointerDown={(event) => ajustarRaio(event, luz)}
                />

                {/* E a alça à vista, na borda direita: sem ela o anel é uma
                    linha pontilhada que não se anuncia como arrastável. */}
                <circle
                  cx={luz.x + luz.raio}
                  cy={luz.y}
                  r={ALCA_PX / scale}
                  fill="#fff"
                  stroke={COR_DA_LUZ}
                  strokeWidth={2 / scale}
                  style={{
                    pointerEvents: inerte ? "none" : "auto",
                    cursor: "ew-resize",
                  }}
                  onPointerDown={(event) => ajustarRaio(event, luz)}
                />
              </>
            ) : null}

            <circle
              cx={luz.x}
              cy={luz.y}
              r={LUZ_PX / scale}
              fill={COR_DA_LUZ}
              stroke="rgb(23 23 23 / 0.7)"
              strokeWidth={2 / scale}
              style={{
                pointerEvents: inerte ? "none" : "auto",
                cursor: "move",
              }}
              onPointerDown={(event) => moverLuz(event, luz)}
            />
          </g>
        );
      })}
    </svg>
  );
}
