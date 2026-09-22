"use client";

import { useEffect, useId, useRef, useState, useMemo } from "react";

import {
  AncorasDeSeta,
  RAIO_DE_ENCAIXE_PX,
} from "@/components/mestre/ancoras-de-seta";
import { useSceneScale } from "@/components/playground/scene-stage";
import {
  PontaDeSeta,
  SETA_ROTULO_PX,
  SetaSvg,
} from "@/components/playground/quadro-mesa-layer";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import {
  ancorada,
  caminhoDaSeta,
  pontaEm,
  pontoNaSeta,
  setasDe,
  setasLivresPara,
  tracadoDe,
  type Seta,
} from "@/lib/mestre/ligacoes";
import { LIGACAO_Z, useQuadroStore } from "@/lib/store/use-quadro-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type Ligacao,
  type PontaDeLigacao,
  type Scene,
} from "@/types/scene";

/** Largura da faixa invisível que recebe o clique, em pixels de tela. */
const ALVO_PX = 14;
/** Diâmetro da alça de cada ponta, em pixels de tela. */
const ALCA_PX = 10;
/** Diagonal do losango que dobra a seta, em pixels de tela. */
const DOBRA_PX = 11;
/**
 * Abaixo disto a dobra é ZERO, em fração do vão.
 *
 * Sem a zona morta não havia como desfazer uma dobra: acertar a fração exata
 * que devolve a curva de fábrica é impossível com a mão, e a seta ficaria para
 * sempre com uma barriga de meio pixel que ninguém vê e nada explica. Soltar a
 * alça perto do lugar de origem é o gesto de desistir.
 */
const DOBRA_MINIMA = 0.02;

/**
 * As setas do quadro e as alças da selecionada.
 *
 * Um `<svg>` só, em coordenadas de cena, como o `PinTethers`: dentro do palco
 * uma unidade do `viewBox` é uma unidade de cena, e a seta acompanha zoom e
 * deslocamento sem conta de projeção. As pontas saem de `pontasDe`, lidas da
 * cena a cada render -- mover o postit já move a seta ancorada nele.
 *
 * A seta que ainda está NASCENDO não é desenhada aqui: ela é a sombra de
 * `AncorasDeSeta`, que vive enquanto a ferramenta está na mão e escreve fora
 * do React. Aqui ficam as que já existem.
 *
 * Como no Excalidraw: a seta selecionada mostra uma alça em cada ponta, e
 * arrastar a alça leva a ponta; soltar sobre uma coisa do quadro ancora nela,
 * soltar no vazio deixa a ponta livre ali. A alça ancorada é cheia, a livre é
 * vazada -- é o que diz de relance quem acompanha o postit e quem não. O
 * arrasto mira os mesmos pontos de encaixe da criação, e é por isso que ele
 * monta a camada das âncoras enquanto dura.
 *
 * Ponta e espessura em pixel de tela, divididos pela escala: uma seta que
 * engordasse no zoom viraria faixa; uma que afinasse sumiria.
 */
export function LigacaoLayer({ scene }: { scene: Scene }) {
  const { scale, toScene } = useSceneScale();
  const tool = useToolStore((state) => state.tool);
  const selecionadaId = useQuadroStore((state) => state.ligacaoSelecionadaId);
  const selecionar = useQuadroStore((state) => state.selecionarLigacao);

  const updateLigacao = useSceneStore((state) => state.updateLigacao);
  const startDrag = useSceneDrag();

  // Antes do retorno cedo: hook não pode ficar atrás de `return null`.
  const pontaComum = useId();
  const pontaViva = useId();
  const [editandoRotuloId, setEditandoRotuloId] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (editandoRotuloId) campo.current?.focus();
  }, [editandoRotuloId]);

  /**
   * A ponta em arrasto, enquanto o mestre a leva: qual seta, qual lado, e a
   * ponta que soltar ali criaria. Local, e não na cena: a cena só recebe a
   * ponta quando ela é solta.
   *
   * A ponta JÁ RESOLVIDA, e não o ponto do cursor. É o que faz a seta pular
   * para o encaixe enquanto a alça ainda está na mão, em vez de encostar no
   * cursor e só pular na hora de soltar -- e é a mesma conta que a solta usa,
   * feita uma vez.
   */
  const [levando, setLevando] = useState<{
    ligacaoId: string;
    lado: "de" | "para";
    ponta: PontaDeLigacao;
  } | null>(null);

  /**
   * A dobra em arrasto: qual seta e quanto. Local pela mesma razão da ponta --
   * a cena só recebe a curva no soltar, e um commit por quadro do gesto
   * encheria o histórico de passos que ninguém pediu.
   */
  const [dobrando, setDobrando] = useState<{
    ligacaoId: string;
    curva: number;
  } | null>(null);

  /**
   * `useMemo` porque a conta é O(setas × elementos): cada ponta ancorada
   * procura o alvo na lista da cena, e as duas pontas de quinze setas num
   * quadro de cinquenta coisas dão centenas de buscas -- por render, e a
   * bancada renderiza por muito motivo que não muda a cena.
   *
   * Medido na webview: as mesmas trinta frases com quinze setas entre elas
   * levam o quadro perdido de ~15% para ~40% durante um gesto. Isto é a metade
   * barata do conserto; a outra é não redesenhar as quinze quando só uma mudou
   * -- ver a issue do motor do quadro.
   */
  const cruas = useMemo(() => setasDe(scene), [scene]);

  const setas = useMemo(
    () =>
      cruas.map((seta) => {
        if (levando && seta.ligacao.id === levando.ligacaoId)
          return comPontaLevada(scene, seta, levando.lado, levando.ponta);
        if (dobrando && seta.ligacao.id === dobrando.ligacaoId)
          return comDobra(scene, seta, dobrando.curva);
        return seta;
      }),
    [scene, cruas, levando, dobrando],
  );

  const ligacoes = scene.ligacoes ?? [];

  if (ligacoes.length === 0) return null;

  const px = (valor: number) => valor / scale;


  const editando = setas.find(({ ligacao }) => ligacao.id === editandoRotuloId);
  const selecionada = setas.find(({ ligacao }) => ligacao.id === selecionadaId);

  function levarPonta(
    event: React.PointerEvent,
    ligacao: Ligacao,
    lado: "de" | "para",
  ) {
    if (event.button !== 0) return;

    const raio = RAIO_DE_ENCAIXE_PX / scale;
    // Onde esta ponta pode se prender. Fixado no começo do gesto: a cena não
    // muda enquanto a alça está na mão -- a seta só é gravada na solta.
    const livres = setasLivresPara(scene, ligacao.id, cruas);
    const onde = (native: PointerEvent) =>
      pontaEm(scene, toScene(native.clientX, native.clientY), raio, livres);

    startDrag(event, {
      onMove: (_delta, native) =>
        setLevando({ ligacaoId: ligacao.id, lado, ponta: onde(native) }),
      onEnd: (native) => {
        setLevando(null);
        updateLigacao(scene.id, ligacao.id, { [lado]: onde(native) });
      },
    });
  }

  /**
   * Dobrar a seta pela alça do meio.
   *
   * A conta é uma projeção: o meio da seta SEM dobra e a perpendicular do vão
   * ficam parados o gesto inteiro -- as pontas não se mexem enquanto a alça
   * está na mão --, então a dobra é só o quanto o cursor se afastou daquele
   * ponto naquela direção, dividido pelo vão. Fração, e não distância, pela
   * mesma razão que a ligação guarda fração: ver `curva` em `Ligacao`.
   */
  function dobrar(event: React.PointerEvent, seta: Seta) {
    if (event.button !== 0) return;

    const reta = tracadoDe(scene, seta.ligacao.de, seta.ligacao.para);
    if (!reta) return;

    const vao = Math.hypot(reta.b.x - reta.a.x, reta.b.y - reta.a.y);
    if (vao === 0) return;

    const meio = pontoNaSeta(reta, 0.5);
    const normal = {
      x: -(reta.b.y - reta.a.y) / vao,
      y: (reta.b.x - reta.a.x) / vao,
    };

    const daMao = (native: PointerEvent) => {
      const ponto = toScene(native.clientX, native.clientY);
      const curva =
        ((ponto.x - meio.x) * normal.x + (ponto.y - meio.y) * normal.y) / vao;
      return Math.abs(curva) < DOBRA_MINIMA ? 0 : curva;
    };

    startDrag(event, {
      onMove: (_delta, native) =>
        setDobrando({ ligacaoId: seta.ligacao.id, curva: daMao(native) }),
      onEnd: (native) => {
        setDobrando(null);
        updateLigacao(scene.id, seta.ligacao.id, { curva: daMao(native) });
      },
    });
  }

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
          const { ligacao } = seta;
          const viva = ligacao.id === selecionadaId;

          return (
            <g key={ligacao.id}>
              {/* A faixa larga e invisível é o que recebe o clique: um traço
                  de 2px é impossível de acertar. O MESMO caminho da seta, e
                  não a reta entre as pontas: numa seta dobrada a reta passa
                  longe de onde a curva está desenhada, e o clique pegaria o
                  vazio ao lado dela. */}
              <path
                d={caminhoDaSeta(seta)}
                fill="none"
                stroke="transparent"
                strokeWidth={px(ALVO_PX)}
                className={cn(
                  tool === "ligacao"
                    ? "pointer-events-none cursor-crosshair"
                    : "pointer-events-auto cursor-pointer",
                )}
                // `pointer-events: stroke` para o meio da faixa contar e o
                // resto do `<svg>` não. Com a seta na mão a faixa se apaga de
                // vez: o clique tem de ATRAVESSAR até o envelope do palco, que
                // é quem trata o gesto -- e hoje esse gesto pode ser uma
                // bifurcação, uma seta que nasce em cima desta.
                style={{
                  pointerEvents: tool === "ligacao" ? "none" : "stroke",
                }}
                onPointerDown={(event) => {
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
                ponta={viva ? pontaViva : pontaComum}
                className={viva ? "stroke-primary" : "stroke-foreground/70"}
                // O rótulo some enquanto o campo dele está aberto no mesmo lugar.
                rotulo={editandoRotuloId !== ligacao.id}
              />
            </g>
          );
        })}

        {/* A alça de DOBRA, no meio da curva. Losango, e não círculo: as duas
            das pontas são redondas, e um terceiro círculo no meio pediria que
            se decorasse qual é qual. Ela vem antes das outras duas porque numa
            seta curtinha os três se sobrepõem, e aí quem tem de ganhar o
            clique é a ponta.

            Duplo clique desentorta: é o caminho curto para o que soltar a alça
            no lugar de origem também faz. */}
        {selecionada && tool !== "ligacao"
          ? (() => {
              const meio = pontoNaSeta(selecionada, 0.5);
              const raio = px(DOBRA_PX) / 2;
              const pontas = [
                [meio.x, meio.y - raio],
                [meio.x + raio, meio.y],
                [meio.x, meio.y + raio],
                [meio.x - raio, meio.y],
              ];
              return (
                <polygon
                  points={pontas.map(([x, y]) => `${x},${y}`).join(" ")}
                  className="pointer-events-auto fill-card stroke-primary cursor-move"
                  strokeWidth={px(2)}
                  onPointerDown={(event) => dobrar(event, selecionada)}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    updateLigacao(scene.id, selecionada.ligacao.id, { curva: 0 });
                  }}
                />
              );
            })()
          : null}

        {/* As alças das PONTAS, por cima de todas as setas. Cheia quando a
            ponta está ancorada, vazada quando está livre. */}
        {selecionada && tool !== "ligacao"
          ? (["de", "para"] as const).map((lado) => {
              const ponto = lado === "de" ? selecionada.a : selecionada.b;
              const presa = ancorada(selecionada.ligacao[lado]);
              return (
                <circle
                  key={lado}
                  cx={ponto.x}
                  cy={ponto.y}
                  r={px(ALCA_PX) / 2}
                  className={cn(
                    "pointer-events-auto cursor-move stroke-primary",
                    presa ? "fill-primary" : "fill-card",
                  )}
                  strokeWidth={px(2)}
                  onPointerDown={(event) =>
                    levarPonta(event, selecionada.ligacao, lado)
                  }
                />
              );
            })
          : null}

      </svg>

      {/* Os pontos de encaixe enquanto a alça está na mão, para mover uma ponta
          poder mirar um lado como criar a seta mira. A seta em arrasto sai das
          candidatas: uma seta não se prende nela mesma. */}
      {levando ? (
        <AncorasDeSeta scene={scene} semSeta={levando.ligacaoId} />
      ) : null}

      {/* O campo do rótulo, em HTML e não em `<foreignObject>`: o WebKitGTK
          desenha foreignObject fora do lugar sob `zoom`. No meio da CURVA, que
          é onde o rótulo é desenhado -- em unidades de cena. */}
      {editando ? (
        <div
          className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
          style={{
            left: pontoNaSeta(editando, 0.5).x,
            top: pontoNaSeta(editando, 0.5).y,
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

/**
 * A seta com uma ponta no cursor, enquanto a alça é arrastada. A outra ponta
 * continua onde a cena diz, mas recalculada virada para o cursor -- uma ponta
 * ancorada encosta na borda do lado de quem a puxa.
 */
function comPontaLevada(
  scene: Scene,
  seta: Seta,
  lado: "de" | "para",
  ponta: PontaDeLigacao,
): Seta {
  const opcoes = { curva: seta.ligacao.curva };
  const tracado =
    lado === "de"
      ? tracadoDe(scene, ponta, seta.ligacao.para, opcoes)
      : tracadoDe(scene, seta.ligacao.de, ponta, opcoes);
  return tracado ? { ...seta, ...tracado } : seta;
}

/** A seta com a dobra que a alça do meio está pedindo, enquanto ela é levada. */
function comDobra(scene: Scene, seta: Seta, curva: number): Seta {
  const tracado = tracadoDe(scene, seta.ligacao.de, seta.ligacao.para, { curva });
  return tracado ? { ...seta, ...tracado } : seta;
}
