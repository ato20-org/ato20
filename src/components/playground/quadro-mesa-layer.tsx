"use client";

import { useId } from "react";

import { PostitTextoView, type Vinculos } from "@/components/mestre/postit-texto-view";
import {
  emPixelDeTela,
  useSceneScale,
} from "@/components/playground/scene-stage";
import { setasDe, type Seta } from "@/lib/mestre/ligacoes";
import { cn } from "@/lib/utils";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type CorPostit,
  type Postit,
  type Scene,
  type Texto,
} from "@/types/scene";

/**
 * O quadro como a MESA o vê: postit, alfinete, texto e seta, só para ler.
 *
 * O mestre tem as camadas dele para cada um desses -- com arrasto, edição,
 * menu -- e elas puxam os stores da bancada. Estas não puxam nada: recebem a
 * cena e desenham, e é isso que as deixa entrar no `SceneLayer`, que é o
 * componente da TV e do celular. Só montam quando a cena é um quadro; um mapa
 * no ar não paga por elas.
 *
 * Mesmas medidas do mestre (fonte do postit, lado do alfinete, espessura da
 * seta), para o que a TV mostra ser o que o mestre viu.
 */

/** Escada de `z` da mesa: acima das imagens e dos riscos, abaixo do retrato. */
const TEXTO_Z = 8_000;
const POSTIT_Z = 8_500;
const SETA_Z = 8_600;
const ALFINETE_Z = 9_500;

// --- postit -----------------------------------------------------------------

/** As cores do papel, como no `PostitLayer`. */
const PAPEL: Record<CorPostit, string> = {
  amarelo: "bg-amber-200 ring-amber-500/60",
  rosa: "bg-pink-200 ring-pink-500/60",
  azul: "bg-sky-200 ring-sky-500/60",
  verde: "bg-emerald-200 ring-emerald-500/60",
  branco: "bg-neutral-50 ring-neutral-400/70",
};
const FONTE_POSTIT = 15;
const MARGEM_POSTIT = 6;

/**
 * Sem vínculo nenhum: na mesa a menção é só o nome. `@Edgar` sai como texto,
 * sem ficha atrás, sem retrato, sem pular de cena -- nada disso existe na TV.
 */
const SEM_VINCULOS: Vinculos = {
  personagem: () => null,
  arquivo: () => null,
  cena: () => null,
  irParaCena: () => undefined,
  abrirJanela: () => undefined,
};

function PostitDaMesa({ postit }: { postit: Postit }) {
  const { scale, ampliacaoNoLayout } = useSceneScale();
  // Mesma conta do corpo do postit do mestre: ver `medidaDoCorpo` lá.
  const fator = ampliacaoNoLayout ? scale : 1;

  return (
    <div
      className={cn(
        "pointer-events-none absolute overflow-hidden rounded-[3px] shadow-lg ring-1",
        PAPEL[postit.cor],
      )}
      style={{
        left: postit.x,
        top: postit.y,
        width: postit.largura,
        height: postit.altura,
        zIndex: POSTIT_Z,
      }}
    >
      <div
        className="absolute inset-0 overflow-hidden text-neutral-900"
        style={{
          ...(ampliacaoNoLayout ? emPixelDeTela(scale) : undefined),
          fontSize: FONTE_POSTIT * fator,
          lineHeight: 1.35,
          padding: MARGEM_POSTIT * fator,
        }}
      >
        {postit.texto ? (
          <PostitTextoView texto={postit.texto} vinculos={SEM_VINCULOS} />
        ) : null}
      </div>
    </div>
  );
}

// --- alfinete ---------------------------------------------------------------

/** Diâmetro do alfinete, em pixels de tela. O mesmo do mestre. */
const ALFINETE_PX = 22;

function AlfinetesDaMesa({ scene }: { scene: Scene }) {
  const { scale } = useSceneScale();
  const pins = scene.pins ?? [];
  if (pins.length === 0 || scale === 0) return null;

  const lado = ALFINETE_PX / scale;

  return pins.map((pin, index) => (
    <div
      key={pin.id}
      title={pin.title || `Ponto ${index + 1}`}
      className="pointer-events-none absolute grid place-items-center rounded-full bg-amber-400 font-semibold text-amber-950 tabular-nums shadow-md ring-2 ring-neutral-900/70 select-none"
      style={{
        left: pin.x,
        top: pin.y,
        width: lado,
        height: lado,
        transform: "translate(-50%, -50%)",
        fontSize: lado * 0.5,
        lineHeight: 1,
        zIndex: ALFINETE_Z,
      }}
    >
      {index + 1}
    </div>
  ));
}

// --- texto ------------------------------------------------------------------

/**
 * A tipografia de um texto solto, em pixel de tela quando o plano amplia por
 * `zoom`. É a mesma conta do `TextoLayer` do mestre, e do corpo do postit: o
 * WebKit tem um piso de 9px para fonte encolhida por `zoom`, e sem isto um
 * título afastado para de encolher. Ver `PostitPapel.medidaDoCorpo`.
 */
export function tipografiaDoTexto(
  texto: Texto,
  scale: number,
  ampliacaoNoLayout: boolean,
) {
  const fator = ampliacaoNoLayout ? scale : 1;
  return {
    medida: ampliacaoNoLayout ? emPixelDeTela(scale) : undefined,
    estilo: {
      fontSize: texto.tamanho * fator,
      lineHeight: 1.25,
      // A mesma estimativa de `caixaDoTexto`.
      minWidth: texto.tamanho * 0.55 * fator,
    },
  };
}

/** Um texto solto, só para ler. O mestre usa este mesmo desenho fora da edição. */
export function TextoView({ texto }: { texto: Texto }) {
  const { scale, ampliacaoNoLayout } = useSceneScale();
  const { medida, estilo } = tipografiaDoTexto(texto, scale, ampliacaoNoLayout);

  return (
    <div style={medida}>
      <div className="text-foreground whitespace-pre select-none" style={estilo}>
        {texto.texto}
      </div>
    </div>
  );
}

function TextosDaMesa({ scene }: { scene: Scene }) {
  return (scene.textos ?? []).map((texto) => (
    <div
      key={texto.id}
      className="pointer-events-none absolute"
      style={{ left: texto.x, top: texto.y, zIndex: TEXTO_Z }}
    >
      <TextoView texto={texto} />
    </div>
  ));
}

// --- seta -------------------------------------------------------------------

/** Espessura, ponta e rótulo da seta, em pixels de tela. Os mesmos do mestre. */
export const SETA_TRACO_PX = 2;
export const SETA_PONTA_PX = 10;
export const SETA_ROTULO_PX = 12;

/**
 * A ponta da seta, como `<marker>`. `markerUnits` em `userSpaceOnUse` para o
 * tamanho ser o pedido, e não um múltiplo da espessura. O id vem de fora
 * porque cada `<svg>` na página precisa do seu: o mestre e a prévia da mesa
 * podem estar montados ao mesmo tempo.
 */
export function PontaDeSeta({
  id,
  escala,
  className,
}: {
  id: string;
  escala: number;
  className: string;
}) {
  const lado = SETA_PONTA_PX / escala;
  return (
    <marker
      id={id}
      markerUnits="userSpaceOnUse"
      markerWidth={lado}
      markerHeight={lado}
      refX={lado * 0.9}
      refY={lado / 2}
      orient="auto"
    >
      <path d={`M 0 0 L ${lado} ${lado / 2} L 0 ${lado} z`} className={className} />
    </marker>
  );
}

/** A linha de uma seta pronta, com o rótulo no meio. */
export function SetaSvg({
  seta,
  escala,
  ponta,
  className,
  rotulo = true,
}: {
  seta: Seta;
  escala: number;
  /** O id do `<marker>` da ponta. */
  ponta: string;
  className: string;
  rotulo?: boolean;
}) {
  const { a, b, ligacao } = seta;
  const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

  return (
    <>
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        className={className}
        strokeWidth={SETA_TRACO_PX / escala}
        strokeLinecap="round"
        markerEnd={`url(#${ponta})`}
      />
      {rotulo && ligacao.rotulo ? (
        <text
          x={meio.x}
          y={meio.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={SETA_ROTULO_PX / escala}
          // Contorno na cor do papel, por baixo da letra: o rótulo cruza a
          // própria seta, e sem isto a linha risca as letras.
          className="fill-foreground stroke-card"
          strokeWidth={4 / escala}
          style={{ paintOrder: "stroke" }}
        >
          {ligacao.rotulo}
        </text>
      ) : null}
    </>
  );
}

function SetasDaMesa({ scene }: { scene: Scene }) {
  const { scale } = useSceneScale();
  const ponta = useId();
  const setas = setasDe(scene);
  if (setas.length === 0 || scale === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 overflow-visible"
      style={{ zIndex: SETA_Z }}
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
      aria-hidden
    >
      <defs>
        <PontaDeSeta id={ponta} escala={scale} className="fill-foreground/70" />
      </defs>
      {setas.map((seta) => (
        <SetaSvg
          key={seta.ligacao.id}
          seta={seta}
          escala={scale}
          ponta={ponta}
          className="stroke-foreground/70"
        />
      ))}
    </svg>
  );
}

// --- tudo -------------------------------------------------------------------

/** As quatro camadas do quadro na mesa. Ver o cabeçalho do arquivo. */
export function QuadroMesaLayer({ scene }: { scene: Scene }) {
  return (
    <>
      <TextosDaMesa scene={scene} />
      {(scene.postits ?? []).map((postit) => (
        <PostitDaMesa key={postit.id} postit={postit} />
      ))}
      <SetasDaMesa scene={scene} />
      <AlfinetesDaMesa scene={scene} />
    </>
  );
}
