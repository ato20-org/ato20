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
import type { CanvasItem } from "@/types/scene";

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
 * Na MARGEM, como o gizmo: a roda de um token na borda do mapa passa do plano,
 * e filho que transborda o plano infla a camada composta. Ver `planoDaMargem`
 * e `debug-do-palco` §3. O bico é uma `div` com camada própria e
 * `scale(1 / scale)`, como as alças do gizmo, para ficar nítido ampliado; a
 * roda é traço fino de guia, e fica no SVG.
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

  const conteudo = (
    <div
      className="pointer-events-none absolute top-0 left-0"
      style={{ zIndex: RODA_Z, color: cor }}
    >
      <svg
        className="absolute top-0 left-0 overflow-visible"
        width={raio * 2}
        height={raio * 2}
        // Pela posição em `transform`, e não em `left`/`top`: a roda anda com o
        // token arrastado, e em caixa isso refazia o layout a cada quadro. Ver
        // `TransformHandles`.
        style={{
          transform: `translate(${centro.x - raio}px, ${centro.y - raio}px)`,
        }}
      >
        {/* O traço nos FILHOS, e não na raiz: o WebKit multiplica o
            `stroke-width` da raiz pela ampliação. */}
        <circle
          cx={raio}
          cy={raio}
          r={raio}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.7}
          strokeWidth={px(TRACO_PX)}
          strokeDasharray={`${px(4)} ${px(3)}`}
        />
        <line
          x1={raio + (dx / comprimento) * meio}
          y1={raio + (dy / comprimento) * meio}
          x2={raio + dx}
          y2={raio + dy}
          stroke="currentColor"
          strokeWidth={px(2)}
          strokeLinecap="round"
        />
      </svg>

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

  return planoDaMargem ? createPortal(conteudo, planoDaMargem) : conteudo;
}
