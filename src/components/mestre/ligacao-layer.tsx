"use client";

import { useEffect, useId, useRef, useState } from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import {
  PontaDeSeta,
  SETA_TRACO_PX,
  SETA_ROTULO_PX,
  SetaSvg,
} from "@/components/playground/quadro-mesa-layer";
import { ancoraNaBorda, caixaDe, setasDe } from "@/lib/mestre/ligacoes";
import type { Vec } from "@/lib/geometry/transform";
import { LIGACAO_Z, useQuadroStore } from "@/lib/store/use-quadro-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type RefLigacao,
  type Scene,
} from "@/types/scene";

/** Largura da faixa invisível que recebe o clique, em pixels de tela. */
const ALVO_PX = 14;

/**
 * As setas do quadro, e a que está sendo puxada.
 *
 * Um `<svg>` só, em coordenadas de cena, como o `PinTethers`: dentro do palco
 * uma unidade do `viewBox` é uma unidade de cena, e a seta acompanha zoom e
 * deslocamento sem conta de projeção. As pontas saem de `caixaDe`, lidas da
 * cena a cada render -- mover o postit já move a seta.
 *
 * Ponta e espessura em pixel de tela, divididos pela escala: uma seta que
 * engordasse no zoom viraria faixa; uma que afinasse sumiria.
 */
export function LigacaoLayer({ scene }: { scene: Scene }) {
  const { scale, toScene } = useSceneScale();
  const tool = useToolStore((state) => state.tool);
  const origem = useQuadroStore((state) => state.origem);
  const selecionadaId = useQuadroStore((state) => state.ligacaoSelecionadaId);
  const selecionar = useQuadroStore((state) => state.selecionarLigacao);

  const updateLigacao = useSceneStore((state) => state.updateLigacao);

  /**
   * Onde o cursor está, enquanto a primeira ponta já foi clicada. Só então:
   * ouvir o mouse o tempo todo custaria um render por movimento num quadro
   * que não está puxando nada.
   *
   * Guarda a origem junto, e não limpa no efeito: a amostra de uma seta
   * anterior é ignorada por identidade quando a origem muda, sem `setState`
   * dentro do efeito.
   */
  const [amostra, setAmostra] = useState<{
    origem: RefLigacao;
    ponto: Vec;
  } | null>(null);
  useEffect(() => {
    if (!origem || tool !== "ligacao") return;
    const mover = (native: PointerEvent) =>
      setAmostra({ origem, ponto: toScene(native.clientX, native.clientY) });
    window.addEventListener("pointermove", mover);
    return () => window.removeEventListener("pointermove", mover);
  }, [origem, tool, toScene]);
  const cursor = amostra && amostra.origem === origem ? amostra.ponto : null;

  // Antes do retorno cedo: hook não pode ficar atrás de `return null`.
  const pontaComum = useId();
  const pontaViva = useId();
  const [editandoRotuloId, setEditandoRotuloId] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (editandoRotuloId) campo.current?.focus();
  }, [editandoRotuloId]);

  const ligacoes = scene.ligacoes ?? [];
  const puxando =
    origem && cursor && tool === "ligacao" ? caixaDe(scene, origem) : null;

  if (ligacoes.length === 0 && !puxando) return null;

  const px = (valor: number) => valor / scale;

  const setas = setasDe(scene);
  const editando = setas.find(({ ligacao }) => ligacao.id === editandoRotuloId);

  return (
    <>
      <svg
        className="pointer-events-none absolute inset-0 overflow-visible"
        style={{ zIndex: LIGACAO_Z }}
        width={SCENE_WIDTH}
        height={SCENE_HEIGHT}
        aria-hidden
      >
        <defs>
          {/* Duas pontas: a da seta comum e a da selecionada. Ids únicos por
              `<svg>`: a prévia da mesa pode estar montada ao lado. */}
          <PontaDeSeta id={pontaComum} escala={scale} className="fill-foreground/70" />
          <PontaDeSeta id={pontaViva} escala={scale} className="fill-primary" />
        </defs>

        {setas.map((seta) => {
          const { ligacao, a, b } = seta;
          const selecionada = ligacao.id === selecionadaId;

          return (
            <g key={ligacao.id}>
              {/* A faixa larga e invisível é o que recebe o clique: uma linha
                  de 2px é impossível de acertar. `pointer-events: stroke`
                  para o meio da faixa contar e o resto do svg não. */}
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="transparent"
                strokeWidth={px(ALVO_PX)}
                className={cn(
                  "pointer-events-auto",
                  tool === "ligacao" ? "cursor-crosshair" : "cursor-pointer",
                )}
                style={{ pointerEvents: "stroke" }}
                onPointerDown={(event) => {
                  // Com a seta na mão o clique é do palco, que procura um alvo
                  // debaixo; uma seta não é alvo de seta.
                  if (tool === "ligacao") return;
                  event.stopPropagation();
                  selecionar(ligacao.id);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  setEditandoRotuloId(ligacao.id);
                }}
              />
              <SetaSvg
                seta={seta}
                escala={scale}
                ponta={selecionada ? pontaViva : pontaComum}
                className={selecionada ? "stroke-primary" : "stroke-foreground/70"}
                // O rótulo some enquanto o campo dele está aberto no mesmo lugar.
                rotulo={editandoRotuloId !== ligacao.id}
              />
            </g>
          );
        })}

        {/* A seta sendo puxada: da borda da origem até o cursor, tracejada
            porque ainda não é. */}
        {puxando && cursor
          ? (() => {
              const a = ancoraNaBorda(puxando, cursor);
              return (
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={cursor.x}
                  y2={cursor.y}
                  className="stroke-primary/70"
                  strokeWidth={px(SETA_TRACO_PX)}
                  strokeDasharray={`${px(6)} ${px(6)}`}
                  strokeLinecap="round"
                  markerEnd={`url(#${pontaViva})`}
                />
              );
            })()
          : null}
      </svg>

      {/* O campo do rótulo, em HTML e não em `<foreignObject>`: o WebKitGTK
          desenha foreignObject fora do lugar sob `zoom`. Centrado no meio da
          seta, em unidades de cena. */}
      {editando ? (
        <div
          className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
          style={{
            left: (editando.a.x + editando.b.x) / 2,
            top: (editando.a.y + editando.b.y) / 2,
            zIndex: LIGACAO_Z + 1,
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <input
            ref={campo}
            className="bg-card text-foreground rounded border px-1 py-0.5 shadow outline-none"
            style={{ fontSize: px(SETA_ROTULO_PX), width: px(160) }}
            aria-label="Rótulo da seta"
            placeholder="o que esta seta diz"
            defaultValue={editando.ligacao.rotulo ?? ""}
            onBlur={(event) => {
              updateLigacao(scene.id, editando.ligacao.id, {
                rotulo: event.currentTarget.value,
              });
              setEditandoRotuloId(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                event.currentTarget.value = editando.ligacao.rotulo ?? "";
                event.currentTarget.blur();
              }
              event.stopPropagation();
            }}
          />
        </div>
      ) : null}
    </>
  );
}
