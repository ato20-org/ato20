"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";

import { useSceneScale } from "@/components/playground/scene-stage";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import { centroDe } from "@/lib/geometry/peca-de-esguelha";
import { t } from "@/lib/i18n/ferramentas";
import {
  LIMIAR_PARA_APONTAR,
  bicoDaRoda,
  giroDaMao,
  meioDoToken,
  passoDaRoda,
} from "@/lib/mestre/roda-da-lanterna";
import {
  moverNoGesto,
  terminarGesto,
  useGestoStore,
} from "@/lib/store/use-gesto-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import { SCENE_HEIGHT, SCENE_WIDTH, type CanvasItem } from "@/types/scene";

/** O lado do bico, em pixels de tela: o da ponta da roda do 2.5D. */
const BICO_PX = 12;
/** Quanto o bico fica fora do token quando o alcance é curto, em pixels. */
const FOLGA_PX = 14;
/** A espessura da roda e da haste, em pixels de tela. */
const TRACO_PX = 1.5;
/** Acima do gizmo do token (`GIZMO_Z`): o bico pode cair numa zona de giro. */
const RODA_Z = 10_001;

/**
 * A roda da lanterna do token selecionado, no 2D: o alcance desenhado em
 * volta dele, e um bico na borda, para onde ele olha. Girar o bico mira a
 * lanterna, e não o token: o desenho fica parado. Ver `passoDaRoda`.
 *
 * É a roda do 2.5D trazida para cima, com o alcance no lugar do anel do pé:
 * no 2D o que se quer ver em volta do token é até onde a luz dele chega.
 *
 * Por quadro só o gesto, e o board ao soltar, num passo só do desfazer: o
 * caminho do token arrastado. A luz e a névoa dinâmica leem a cena com o gesto
 * por cima, então o facho anda junto com a mão.
 *
 * Em dois lugares. O BICO mora na MARGEM, como o gizmo: uma `div` com camada
 * própria e `scale(1 / scale)`, como as alças, para ficar nítido ampliado. A
 * roda e a haste moram no plano de CONTROLES: na margem, que amplia sempre por
 * `transform`, o traço era rasterizado com `1,5 / scale` de textura e esticado
 * de volta -- borrado em qualquer ampliação, e a gente só o via fino afastando.
 * O plano de controles assenta em `zoom` com a câmera parada, e o traço sai na
 * resolução da tela. Um círculo não se faz com as barras do `TracoDaCaixa`, e
 * uma camada própria em pixel de tela passaria do teto de textura ampliada.
 *
 * O SVG tem o tamanho EXATO do plano e corta o que passa dele: a roda de um
 * token na borda do mapa passaria do plano, e filho que transborda o plano
 * infla a camada composta (`debug-do-palco` §3). Cortada na borda, ela mostra
 * o mesmo que a luz, que também só existe dentro do plano.
 *
 * Só PARADA. Com um gesto em curso -- o token arrastado, o bico girando -- o
 * traço volta para a margem e desliza por `transform`, borrado enquanto anda.
 * No plano ele custava caro: o círculo andando repinta a caixa dele em
 * resolução de tela a cada quadro, e a 8x a caixa é a tela inteira. Medido na
 * webview (`camera-gesto --gesto token --carregadas 1`, 1440x900, mediana de
 * cinco): arrastar o token caía de 59,2 para 48,6 fps a 4x e de 59,8 para 40
 * a 8x. Ver `gestos` em `useViewportStore`.
 */
export function RodaDaLanterna({
  sceneId,
  item,
  azul,
}: {
  sceneId: string;
  item: CanvasItem;
  /** O tom do gizmo de gente. Ver `tom` em `TransformHandles`. */
  azul: boolean;
}) {
  const { scale, toScene, planoDaMargem } = useSceneScale();
  const arrastar = useSceneDrag();
  const emGesto = useViewportStore((state) => state.gestos > 0);

  const luz = item.luz;
  if (!luz || scale === 0) return null;

  const px = (valor: number) => valor / scale;
  const centro = centroDe(item);
  const bico = bicoDaRoda(item, px(FOLGA_PX));
  const raio = luz.raio;
  // A haste sai da borda do token, e não do meio: por cima do desenho ela
  // riscaria o rosto de quem segura a lanterna.
  const meio = meioDoToken(item);
  const dx = bico.x - centro.x;
  const dy = bico.y - centro.y;
  const comprimento = Math.hypot(dx, dy) || 1;
  const cor = azul ? "var(--color-sky-400)" : "var(--primary)";

  function pegar(event: ReactPointerEvent) {
    const antes = item;
    const inicio = toScene(event.clientX, event.clientY);
    // Passou do limiar uma vez, é mira até soltar: voltar a mão para perto do
    // começo não devolve o círculo no meio do gesto.
    let apontou = false;

    arrastar(event, {
      onMove: (_delta, nativo) => {
        const aqui = toScene(nativo.clientX, nativo.clientY);
        apontou ||=
          Math.abs(giroDaMao(antes, inicio, aqui)) >= LIMIAR_PARA_APONTAR;
        const patch = passoDaRoda(antes, inicio, aqui, {
          encaixar: nativo.shiftKey,
          apontar: apontou,
        });
        if (patch) moverNoGesto(sceneId, [{ id: antes.id, patch }]);
      },
      onEnd: () => {
        const patches = useGestoStore.getState().patches;
        if (patches?.length) terminarGesto(sceneId, patches);
      },
    });
  }

  // O canto do SVG na cena: o do plano parado, o da caixa da roda no gesto.
  const canto = emGesto
    ? { x: centro.x - raio, y: centro.y - raio }
    : { x: 0, y: 0 };
  // O traço nos FILHOS, e não na raiz: o WebKit multiplica o `stroke-width` da
  // raiz pela ampliação.
  const desenho = (
    <>
      <circle
        cx={centro.x - canto.x}
        cy={centro.y - canto.y}
        r={raio}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.7}
        strokeWidth={px(TRACO_PX)}
        strokeDasharray={`${px(4)} ${px(3)}`}
      />
      <line
        x1={centro.x - canto.x + (dx / comprimento) * meio}
        y1={centro.y - canto.y + (dy / comprimento) * meio}
        x2={bico.x - canto.x}
        y2={bico.y - canto.y}
        stroke="currentColor"
        strokeWidth={px(2)}
        strokeLinecap="round"
      />
    </>
  );

  const traco = emGesto ? (
    <svg
      className="absolute top-0 left-0 overflow-visible"
      width={raio * 2}
      height={raio * 2}
      // Pela posição em `transform`, e não em `left`/`top`: a roda anda com o
      // token arrastado, e em caixa isso refazia o layout a cada quadro. Ver
      // `TransformHandles`.
      style={{ transform: `translate(${canto.x}px, ${canto.y}px)` }}
    >
      {desenho}
    </svg>
  ) : (
    <svg
      className="pointer-events-none absolute top-0 left-0"
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
      style={{ zIndex: RODA_Z, color: cor }}
    >
      {desenho}
    </svg>
  );

  const ponta = (
    <div
      className="pointer-events-none absolute top-0 left-0"
      style={{ zIndex: RODA_Z, color: cor }}
    >
      {emGesto ? traco : null}
      <div
        aria-label={t.luz.rodaDaLanterna}
        title={t.luz.rodaDaLanterna}
        className="pointer-events-auto absolute top-0 left-0 cursor-grab touch-none rounded-full border-white bg-current"
        style={{
          width: BICO_PX,
          height: BICO_PX,
          borderWidth: TRACO_PX,
          transform: `translate(${bico.x}px, ${bico.y}px) scale(${1 / scale}) translate(-50%, -50%)`,
          transformOrigin: "0 0",
          // Camada própria: sem ela o bico é rasterizado encolhido dentro da
          // camada da margem e esticado de volta. Ver as alças do gizmo.
          willChange: "transform",
        }}
        onPointerDown={pegar}
      />
    </div>
  );

  return (
    <>
      {emGesto ? null : traco}
      {planoDaMargem ? createPortal(ponta, planoDaMargem) : ponta}
    </>
  );
}
