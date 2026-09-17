"use client";

import { useEffect, useRef, useState } from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import {
  ancoraNaBorda,
  caixaDe,
  centroDe,
} from "@/lib/mestre/ligacoes";
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

/** Espessura da seta, em pixels de tela. Dividida pela escala para não engordar no zoom. */
const TRACO_PX = 2;
/** Largura da faixa invisível que recebe o clique, em pixels de tela. */
const ALVO_PX = 14;
/** Tamanho da ponta da seta, em pixels de tela. */
const PONTA_PX = 10;
/** Fonte do rótulo, em pixels de tela. */
const ROTULO_PX = 12;

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

  const setas = ligacoes.flatMap((ligacao) => {
    const de = caixaDe(scene, ligacao.de);
    const para = caixaDe(scene, ligacao.para);
    // Ponta sem alvo não deveria existir -- `semReferencia` cuida --, mas um
    // arquivo editado à mão não pode derrubar o quadro.
    if (!de || !para) return [];
    const a = ancoraNaBorda(de, centroDe(para));
    const b = ancoraNaBorda(para, centroDe(de));
    return [{ ligacao, a, b }];
  });

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
          {/* Duas pontas: a cor da seta e a da selecionada. `markerUnits`
              em `userSpaceOnUse` para o tamanho ser o que se pede, e não um
              múltiplo da espessura. */}
          <marker
            id="ligacao-ponta"
            markerUnits="userSpaceOnUse"
            markerWidth={px(PONTA_PX)}
            markerHeight={px(PONTA_PX)}
            refX={px(PONTA_PX) * 0.9}
            refY={px(PONTA_PX) / 2}
            orient="auto"
          >
            <path
              d={`M 0 0 L ${px(PONTA_PX)} ${px(PONTA_PX) / 2} L 0 ${px(PONTA_PX)} z`}
              className="fill-foreground/70"
            />
          </marker>
          <marker
            id="ligacao-ponta-selecionada"
            markerUnits="userSpaceOnUse"
            markerWidth={px(PONTA_PX)}
            markerHeight={px(PONTA_PX)}
            refX={px(PONTA_PX) * 0.9}
            refY={px(PONTA_PX) / 2}
            orient="auto"
          >
            <path
              d={`M 0 0 L ${px(PONTA_PX)} ${px(PONTA_PX) / 2} L 0 ${px(PONTA_PX)} z`}
              className="fill-primary"
            />
          </marker>
        </defs>

        {setas.map(({ ligacao, a, b }) => {
          const selecionada = ligacao.id === selecionadaId;
          const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

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
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className={selecionada ? "stroke-primary" : "stroke-foreground/70"}
                strokeWidth={px(TRACO_PX)}
                strokeLinecap="round"
                markerEnd={
                  selecionada
                    ? "url(#ligacao-ponta-selecionada)"
                    : "url(#ligacao-ponta)"
                }
              />
              {ligacao.rotulo && editandoRotuloId !== ligacao.id ? (
                <text
                  x={meio.x}
                  y={meio.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={px(ROTULO_PX)}
                  // Contorno na cor do papel, por baixo da letra: o rótulo
                  // cruza a própria seta, e sem isto a linha risca as letras.
                  className="fill-foreground stroke-card"
                  strokeWidth={px(4)}
                  style={{ paintOrder: "stroke" }}
                >
                  {ligacao.rotulo}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* A seta sendo puxada: da borda da origem até o cursor, tracejada
            porque ainda não é. */}
        {puxando && cursor ? (
          (() => {
            const a = ancoraNaBorda(puxando, cursor);
            return (
              <line
                x1={a.x}
                y1={a.y}
                x2={cursor.x}
                y2={cursor.y}
                className="stroke-primary/70"
                strokeWidth={px(TRACO_PX)}
                strokeDasharray={`${px(6)} ${px(6)}`}
                strokeLinecap="round"
                markerEnd="url(#ligacao-ponta-selecionada)"
              />
            );
          })()
        ) : null}
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
            style={{ fontSize: px(ROTULO_PX), width: px(160) }}
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
