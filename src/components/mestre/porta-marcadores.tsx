"use client";

import type { PointerEvent as ReactPointerEvent } from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import { usePortasNoGiro } from "@/hooks/use-portas-no-giro";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import { t } from "@/lib/i18n/bancada";
import {
  aberturaAte,
  patchDaAbertura,
  pegaDaAlca,
  pontaDaPorta,
  portaDeVerdade,
  portaPelaAlca,
} from "@/lib/geometry/porta";
import {
  moverPortaNoGesto,
  terminarGestoDaPorta,
  useGestoStore,
} from "@/lib/store/use-gesto-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type NewPorta,
  type Porta,
  type Scene,
} from "@/types/scene";

/**
 * A cor da porta no Mestre. Laranja, e não o amarelo da parede: a porta mora
 * EM CIMA de uma parede quase sempre, e da mesma cor as duas viravam um traço
 * só.
 */
export const COR_DA_PORTA = "#fb923c";

/**
 * Tudo aqui em pixels de TELA, dividido pelo `scale` na hora de desenhar. A
 * regra das alças da luz: em unidade de cena, a 400% a dobradiça cobriria o
 * corredor.
 */
const FOLHA_PX = 3;
/** A faixa invisível em volta da folha que recebe o clique. */
const PEGA_DA_FOLHA_PX = 14;
const DOBRADICA_PX = 5;
const ALCA_PX = 6;
/** O meio lado do losango de girar e esticar. */
const LOSANGO_PX = 5;
/**
 * Quanto o losango fica além da ponta da porta fechada. Longe o bastante para
 * a mão não pegar a alça de abrir no lugar dele, perto o bastante para ler
 * como parte da porta.
 */
const FOLGA_DO_LOSANGO_PX = 22;

/**
 * As portas, do jeito que só o Mestre as vê: a folha, a dobradiça e as alças.
 *
 * Fora do `SceneLayer`, pela razão da parede: ele é o componente da TV, e a
 * mesa não vê a porta -- vê a sala do outro lado acender quando ela abre.
 *
 * Um gesto por pega:
 * - a PONTA abre e fecha. Ela anda num círculo em volta da dobradiça, e perto
 *   do zero o ímã fecha. Ver `aberturaAte`;
 * - a FOLHA e a DOBRADIÇA movem a porta inteira;
 * - o LOSANGO, além da ponta da porta fechada e só na selecionada, gira o
 *   batente em volta da dobradiça e estica a folha, como a ponta do facho da
 *   luz aponta e alcança. Shift cai no múltiplo de 45. Ver `portaPelaAlca`.
 *
 * Os botões -- abrir e fechar, altura, cadeado, lixeira -- moram na fileira do
 * gizmo, que o `MestreStage` monta sobre a porta selecionada.
 *
 * A travada não anda e não gira, mas ABRE. O cadeado protege o traço que o
 * mestre acertou sobre o desenho do mapa; abrir a porta é jogar, e é
 * justamente na sessão que a porta travada é aberta e fechada mil vezes.
 *
 * Os gestos passam pelo `useGestoStore`: a folha que gira refaz a luz em
 * volta a cada quadro, e o board só recebe o resultado ao soltar -- um passo
 * de desfazer só. A folha que muda sem a mão -- o botão, o Ctrl+Z -- gira até
 * lá, como em toda tela. Ver `usePortasNoGiro`.
 *
 * Um SVG do tamanho exato do plano, como o da luz.
 */
export function PortaMarcadores({
  scene,
  panMode,
  fantasma,
}: {
  scene: Scene;
  panMode: boolean;
  /** A porta que o arrasto da ferramenta está traçando. Ver `MestreStage`. */
  fantasma: NewPorta | null;
}) {
  const { scale, toScene } = useSceneScale();
  const arrastar = useSceneDrag();
  const tool = useToolStore((state) => state.tool);
  const selectedPortaId = useSelectionStore((state) => state.selectedPortaId);
  const selectPorta = useSelectionStore((state) => state.selectPorta);
  const naMao = useGestoStore((state) => state.porta?.portaId);
  const noGiro = usePortasNoGiro(scene.portas, naMao);

  const portas = (noGiro ?? []).filter(portaDeVerdade);
  if ((portas.length === 0 && !fantasma) || scale === 0) return null;

  // Com a própria ferramenta na mão, nenhuma porta pega o clique: o gesto ali
  // é traçar outra, e a porta de um lado do batente engoliria o começo da do
  // outro. Com espaço segurado, o gesto é da câmera.
  const inertes = panMode || tool === "porta";

  /** Pega a porta em qualquer botão: o direito abre o menu dela. */
  function pegar(event: ReactPointerEvent, porta: Porta): boolean {
    selectPorta(porta.id);
    // O direito para aqui: o `pointerdown` do palco limpa a seleção com o
    // botão direito, e o menu abriria sem a porta que acabou de ser escolhida.
    if (event.button === 2) {
      event.stopPropagation();
      return false;
    }
    return true;
  }

  function mover(event: ReactPointerEvent, porta: Porta) {
    if (!pegar(event, porta)) return;
    // Travada, o toque só seleciona -- e para aqui, senão o palco largaria a
    // porta que acabou de pegar.
    if (porta.locked) {
      event.stopPropagation();
      return;
    }

    const origem = { x: porta.x, y: porta.y };
    arrastar(event, {
      onMove: (delta) =>
        moverPortaNoGesto(scene.id, porta.id, {
          x: Math.round(origem.x + delta.x),
          y: Math.round(origem.y + delta.y),
        }),
      onEnd: terminarGestoDaPorta,
    });
  }

  /** Pela posição absoluta do ponteiro: a alça mora na ponta, e anda num círculo. */
  function abrir(event: ReactPointerEvent, porta: Porta) {
    if (!pegar(event, porta)) return;

    // A última abertura que a mão deixou: é o que o ímã guarda ao fechar,
    // para o botão saber para onde abrir de novo. Ver `patchDaAbertura`.
    let ultima = porta.abertura ?? porta.ultimaAbertura;
    arrastar(event, {
      onMove: (_delta, native) => {
        const abertura = aberturaAte(
          porta,
          toScene(native.clientX, native.clientY),
          native.shiftKey,
        );
        moverPortaNoGesto(scene.id, porta.id, patchDaAbertura(abertura, ultima));
        if (abertura !== undefined) ultima = abertura;
      },
      onEnd: terminarGestoDaPorta,
    });
  }

  function girarEsticar(event: ReactPointerEvent, porta: Porta) {
    if (!pegar(event, porta)) return;

    const pega = pegaDaAlca(porta, toScene(event.clientX, event.clientY));
    arrastar(event, {
      onMove: (_delta, native) =>
        moverPortaNoGesto(
          scene.id,
          porta.id,
          portaPelaAlca(
            porta,
            toScene(native.clientX, native.clientY),
            pega,
            native.shiftKey,
          ),
        ),
      onEnd: terminarGestoDaPorta,
    });
  }

  return (
    <svg
      // `overflow-visible` pela razão da luz: a porta encostada na borda do
      // mapa perderia a metade de fora da alça, e com ela o jeito de abrir.
      className="pointer-events-none absolute top-0 left-0 overflow-visible"
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
      viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}
    >
      {portas.map((porta) => {
        const selecionada = porta.id === selectedPortaId;
        const ponta = pontaDaPorta(porta);
        const fechada = pontaDaPorta(porta, true);
        const aberta = porta.abertura !== undefined;
        const comLosango = selecionada && !porta.locked;
        const radianos = (porta.angulo * Math.PI) / 180;
        const losango = {
          x: fechada.x + (Math.cos(radianos) * FOLGA_DO_LOSANGO_PX) / scale,
          y: fechada.y + (Math.sin(radianos) * FOLGA_DO_LOSANGO_PX) / scale,
        };

        return (
          <g key={porta.id}>
            {/* Aberta e na mão: onde ela fecha, e o arco que a ponta percorre
                até lá. É o que diz ao mestre de onde a porta saiu. */}
            {selecionada && aberta ? (
              <path
                d={`M ${porta.x} ${porta.y} L ${fechada.x} ${fechada.y} A ${porta.comprimento} ${porta.comprimento} 0 0 ${(porta.abertura ?? 0) > 0 ? 1 : 0} ${ponta.x} ${ponta.y}`}
                fill="none"
                stroke={COR_DA_PORTA}
                strokeWidth={1.5 / scale}
                strokeDasharray={`${4 / scale} ${4 / scale}`}
                strokeOpacity={0.8}
              />
            ) : null}

            {/* O cabo do losango: da ponta fechada até ele, para ler como
                parte do batente e não como uma alça solta no mapa. */}
            {comLosango ? (
              <line
                x1={fechada.x}
                y1={fechada.y}
                x2={losango.x}
                y2={losango.y}
                stroke={COR_DA_PORTA}
                strokeWidth={1 / scale}
                strokeOpacity={0.8}
              />
            ) : null}

            <line
              x1={porta.x}
              y1={porta.y}
              x2={ponta.x}
              y2={ponta.y}
              stroke={COR_DA_PORTA}
              strokeWidth={FOLHA_PX / scale}
              strokeLinecap="round"
            />
            {selecionada ? (
              <line
                x1={porta.x}
                y1={porta.y}
                x2={ponta.x}
                y2={ponta.y}
                stroke="#fff"
                strokeWidth={1 / scale}
                strokeDasharray={`${3 / scale} ${3 / scale}`}
              />
            ) : null}

            {/* A pega da folha: larga e invisível, como a do anel da luz. */}
            <line
              x1={porta.x}
              y1={porta.y}
              x2={ponta.x}
              y2={ponta.y}
              stroke="transparent"
              strokeWidth={PEGA_DA_FOLHA_PX / scale}
              style={{
                pointerEvents: inertes ? "none" : "stroke",
                cursor: porta.locked ? "pointer" : "move",
              }}
              onPointerDown={(event) => mover(event, porta)}
            >
              <title>{t.portaMarcadores.porta}</title>
            </line>

            <circle
              cx={porta.x}
              cy={porta.y}
              r={DOBRADICA_PX / scale}
              fill={COR_DA_PORTA}
              stroke={selecionada ? "#fff" : "rgb(23 23 23 / 0.7)"}
              strokeWidth={2 / scale}
              style={{
                pointerEvents: inertes ? "none" : "auto",
                cursor: porta.locked ? "pointer" : "move",
              }}
              onPointerDown={(event) => mover(event, porta)}
            >
              <title>{t.portaMarcadores.dobradica}</title>
            </circle>

            {comLosango ? (
              <rect
                x={losango.x - LOSANGO_PX / scale}
                y={losango.y - LOSANGO_PX / scale}
                width={(LOSANGO_PX * 2) / scale}
                height={(LOSANGO_PX * 2) / scale}
                transform={`rotate(45 ${losango.x} ${losango.y})`}
                fill={COR_DA_PORTA}
                stroke="#fff"
                strokeWidth={2 / scale}
                style={{
                  pointerEvents: inertes ? "none" : "auto",
                  cursor: "crosshair",
                }}
                onPointerDown={(event) => girarEsticar(event, porta)}
              >
                <title>{t.portaMarcadores.girarEEsticar}</title>
              </rect>
            ) : null}

            <circle
              cx={ponta.x}
              cy={ponta.y}
              r={ALCA_PX / scale}
              fill="#fff"
              stroke={COR_DA_PORTA}
              strokeWidth={2 / scale}
              style={{
                pointerEvents: inertes ? "none" : "auto",
                cursor: "grab",
              }}
              onPointerDown={(event) => abrir(event, porta)}
            >
              <title>
                {aberta
                  ? t.portaMarcadores.arrasteParaFechar
                  : t.portaMarcadores.arrasteParaAbrir}
              </title>
            </circle>
          </g>
        );
      })}

      {fantasma ? (
        <g>
          <line
            x1={fantasma.x}
            y1={fantasma.y}
            x2={pontaDaPorta(fantasma).x}
            y2={pontaDaPorta(fantasma).y}
            stroke={COR_DA_PORTA}
            strokeWidth={FOLHA_PX / scale}
            strokeLinecap="round"
            strokeDasharray={`${6 / scale} ${4 / scale}`}
          />
          <circle
            cx={fantasma.x}
            cy={fantasma.y}
            r={DOBRADICA_PX / scale}
            fill={COR_DA_PORTA}
          />
        </g>
      ) : null}
    </svg>
  );
}
