"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  bocaDoTripe,
  daTelaAoChao,
  doOlhoAoMundo,
  pegadaDoTripe,
  projetar,
  type CameraOrbital,
  type PontoNoMundo,
  type Tela,
} from "@/lib/geometry/camera-orbital";
import type { Vec } from "@/lib/geometry/transform";
import { t } from "@/lib/i18n/ferramentas";
import {
  moverTripeNoGesto,
  terminarGestoDoTripe,
} from "@/lib/store/use-gesto-store";
import { cn } from "@/lib/utils";
import type { CameraTripe, Tripe } from "@/types/scene";

/** De quanto a boca da pirâmide fica do olho, em unidades de cena. */
const BOCA = 70;
/** O tamanho do gizmo NA TELA, em pixels: igual perto e longe, como nas ferramentas 3D. */
const GIZMO_PX = 64;
/**
 * O comprimento das setas, em fração do gizmo. Mais longas que o anel maior
 * (raio 1), de propósito: com a ponta em cima do anel de giro, quem ia mover
 * num eixo pegava a rotação sem querer.
 */
const COMPRIMENTO_DO_EIXO = 1.75;
/**
 * De onde a seta passa a ser pegável, em fração do gizmo: por FORA dos anéis.
 * Dentro deles quem responde é o anel -- a seta se pega pelo trecho de fora e
 * pela alça da ponta, onde não há outra coisa por perto.
 */
const EIXO_PEGAVEL_DESDE = 1.15;
/** Quantos lados tem cada anel desenhado. */
const LADOS_DO_ANEL = 48;

const COR_DO_EIXO = { x: "#ef4444", y: "#22c55e", z: "#3b82f6" } as const;
const COR_DO_ANEL = {
  giro: "#3b82f6",
  inclinacao: "#ef4444",
  rolagem: "#facc15",
} as const;

/**
 * O raio de cada anel, em fração do gizmo. Diferentes de propósito: vistos de
 * frente para o eixo do tripé, os três caem um sobre o outro, e com o mesmo
 * raio o de cima roubava a mão dos outros dois.
 */
const RAIO_DO_ANEL = { giro: 1, inclinacao: 0.78, rolagem: 0.56 } as const;

type Eixo = keyof typeof COR_DO_EIXO;
type Anel = keyof typeof COR_DO_ANEL;

/** O que cada parte faz, dito no hover: o mestre sabe o que vai pegar antes de pegar. */
const ROTULO_DO_EIXO: Record<Eixo, string> = {
  x: t.tripe.moverX,
  y: t.tripe.moverY,
  z: t.tripe.subirDescer,
};
const ROTULO_DO_ANEL: Record<Anel, string> = {
  giro: t.tripe.girar,
  inclinacao: t.tripe.inclinar,
  rolagem: t.tripe.rolar,
};

/**
 * O realce de uma parte que a mão pode pegar: mais grossa e com brilho na cor
 * dela, no hover e enquanto ela está sendo arrastada (`data-ativo`).
 *
 * Por CSS, pelo `:hover` do grupo, e não por estado: passar o mouse por cima do
 * gizmo não custa render nenhum. Só o "pegando" passa pelo React, uma vez por
 * gesto -- é ele que mantém a parte acesa quando o mouse sai dela no meio do
 * arrasto.
 */
/*
 * O hover é a regra `.group:hover` direta, e não o `group-hover:` do Tailwind:
 * aquele só vale sob `@media (hover: hover)`, e um aparelho que se declara sem
 * mouse -- medido no Chrome sem tela -- nunca acenderia nada.
 */
const BRILHO =
  "transition-[stroke-width,filter] duration-100 [.group:hover_&]:[filter:drop-shadow(0_0_3px_currentColor)] group-data-[ativo]:[filter:drop-shadow(0_0_3px_currentColor)]";
const ROTULO =
  "pointer-events-none fill-white stroke-black/80 text-[11px] font-medium opacity-0 transition-opacity duration-100 [paint-order:stroke] [stroke-width:3px] [.group:hover_&]:opacity-100 group-data-[ativo]:opacity-100";

/** A câmera do mestre, para quem desenha por cima dela. Ver `useCameraOrbital`. */
export type OlharDoMestre = {
  assinar: (aviso: () => void) => () => void;
  instante: () => { camera: CameraOrbital; tela: Tela } | null;
};

/**
 * Os tripés no 2.5D do Mestre, como OBJETOS: a perna até o chão, a pegada do
 * que eles veem, a pirâmide de visão e o corpo da câmera. O selecionado ganha o
 * gizmo -- setas X, Y e Z, e anéis de giro, inclinação e rolagem --, como nas
 * ferramentas 3D que o mestre já conhece.
 *
 * ## Por que um SVG por cima, e não elementos 3D dentro do chão
 *
 * Linha fina e anel com espessura constante na tela são o que um gizmo precisa,
 * e no CSS 3D a espessura deita com o chão e engrossa com o zoom. Aqui tudo é
 * projetado por `projetar` -- a mesma conta da câmera do mestre -- e desenhado
 * em pixels. Quem anda a cada quadro é só a projeção, escrita no DOM pela
 * assinatura da câmera (sem render, como o chão); a geometria do tripé no
 * mundo só é refeita quando ele muda.
 *
 * ## O gesto
 *
 * Arrastar o corpo anda pelo chão; as setas andam no eixo delas; os anéis
 * giram em volta do centro deles na tela. Tudo pelo `useGestoStore`, como a
 * moldura de recorte: o board só sabe do tripé ao soltar, e a mesa, com ele
 * no ar, acompanha no ritmo do canal.
 *
 * Os alvos levam `data-tripe-alvo`: é o que a câmera do mestre lê para não
 * começar a andar quando a mão pega um tripé.
 */
export function TripesNoPalco({
  sceneId,
  tripes,
  selecionadaId,
  noArId,
  olhar,
  onSelecionar,
}: {
  sceneId: string;
  tripes: CameraTripe[];
  selecionadaId: string | null;
  noArId: string | undefined;
  olhar: OlharDoMestre;
  onSelecionar: (id: string) => void;
}) {
  const raiz = useRef<SVGSVGElement | null>(null);
  /** A parte que a mão está segurando agora, para ela ficar acesa até soltar. */
  const [pegando, setPegando] = useState<string | null>(null);

  // A projeção, a cada aviso da câmera do mestre e a cada tripé que muda.
  useEffect(() => {
    const svg = raiz.current;
    if (!svg) return;

    const desenhar = () => {
      const agora = olhar.instante();
      if (!agora) return;
      for (const tripe of tripes) {
        const grupo = svg.querySelector<SVGGElement>(
          `[data-tripe="${tripe.id}"]`,
        );
        if (grupo) {
          desenharTripe(grupo, tripe, agora, tripe.id === selecionadaId);
        }
      }
    };

    desenhar();
    return olhar.assinar(desenhar);
  }, [olhar, selecionadaId, tripes]);

  /** Começa um gesto de gizmo: captura o ponteiro e segue até soltar. */
  function pegar(
    evento: ReactPointerEvent<SVGElement>,
    tripe: CameraTripe,
    parte: { tipo: "corpo" } | { tipo: "eixo"; eixo: Eixo } | { tipo: "anel"; anel: Anel },
  ) {
    if (evento.button !== 0) return;
    evento.stopPropagation();
    evento.preventDefault();
    onSelecionar(tripe.id);
    setPegando(
      `${tripe.id}:${parte.tipo === "eixo" ? parte.eixo : parte.tipo === "anel" ? parte.anel : "corpo"}`,
    );
    // O cursor de quem segura, na página inteira: o mouse sai da parte no meio
    // do arrasto, e o cursor dela iria junto.
    document.body.style.setProperty("cursor", "grabbing");

    const agora = olhar.instante();
    const svg = raiz.current;
    if (!agora || !svg) return;

    const caixa = svg.getBoundingClientRect();
    const naTela = (cx: number, cy: number): Vec => ({
      x: cx - caixa.left,
      y: cy - caixa.top,
    });
    const inicio = naTela(evento.clientX, evento.clientY);
    const olho0: Tripe = { ...tripe };
    const { camera, tela } = agora;

    // A conta de cada parte é montada uma vez, no começo: o mestre não navega
    // com a mão fechada num gizmo.
    let mover: (ponto: Vec) => Tripe;

    if (parte.tipo === "corpo") {
      // Pelo chão: o ponto do piso sob o cursor anda, e o tripé anda junto.
      const chao0 = daTelaAoChao(camera, tela, inicio);
      mover = (ponto) => {
        const chao = daTelaAoChao(camera, tela, ponto);
        if (!chao0 || !chao) return olho0;
        return { ...olho0, x: olho0.x + chao.x - chao0.x, y: olho0.y + chao.y - chao0.y };
      };
    } else if (parte.tipo === "eixo") {
      const direcao = {
        x: { x: 1, y: 0, altura: 0 },
        y: { x: 0, y: 1, altura: 0 },
        z: { x: 0, y: 0, altura: 1 },
      }[parte.eixo];
      const centro = projetar(camera, tela, olho0, olho0.altura);
      const ponta = projetar(
        camera,
        tela,
        { x: olho0.x + direcao.x, y: olho0.y + direcao.y },
        olho0.altura + direcao.altura,
      );
      // Quantos pixels a unidade do eixo anda na tela. Um eixo que aponta para
      // o olho não anda nada, e aí o arrasto não tem o que mover.
      const passo =
        centro && ponta ? { x: ponta.x - centro.x, y: ponta.y - centro.y } : null;
      const tamanho2 = passo ? passo.x * passo.x + passo.y * passo.y : 0;
      mover = (ponto) => {
        if (!passo || tamanho2 < 1e-6) return olho0;
        const unidades =
          ((ponto.x - inicio.x) * passo.x + (ponto.y - inicio.y) * passo.y) /
          tamanho2;
        return {
          ...olho0,
          x: olho0.x + direcao.x * unidades,
          y: olho0.y + direcao.y * unidades,
          altura: Math.max(1, olho0.altura + direcao.altura * unidades),
        };
      };
    } else {
      const centro = projetar(camera, tela, olho0, olho0.altura) ?? inicio;
      // Em que sentido o anel corre na tela: é o que diz se arrastar no
      // sentido do relógio aumenta ou diminui o ângulo.
      const [p0, p1] = [0, 0.2].map((a) => pontoDoAnel(olho0, parte.anel, a, 1));
      const q0 = projetar(camera, tela, p0!, p0!.altura);
      const q1 = projetar(camera, tela, p1!, p1!.altura);
      const sentido =
        q0 && q1
          ? Math.sign(
              (q0.x - centro.x) * (q1.y - centro.y) -
                (q0.y - centro.y) * (q1.x - centro.x),
            ) || 1
          : 1;
      const angulo0 = Math.atan2(inicio.y - centro.y, inicio.x - centro.x);
      mover = (ponto) => {
        const angulo = Math.atan2(ponto.y - centro.y, ponto.x - centro.x);
        // O mouse andou `graus` em volta do centro, na tela; o anel corre no
        // sentido `sentido` dela, então o ângulo DO ANEL andou isto.
        const graus = ((angulo - angulo0) * 180) / Math.PI;
        return girarPeloAnel(olho0, parte.anel, sentido * graus);
      };
    }

    // Na JANELA, e não no alvo capturado: o alvo é um traço de SVG redesenhado
    // a cada quadro do próprio gesto, e medido no Chrome ele deixava de receber
    // o movimento depois do segundo passo. A janela recebe tudo até soltar, que
    // é o caminho dos outros arrastos do palco.
    function andou(nativo: PointerEvent) {
      if (nativo.pointerId !== evento.pointerId) return;
      moverTripeNoGesto(
        sceneId,
        tripe.id,
        mover(naTela(nativo.clientX, nativo.clientY)),
      );
    }
    function soltou(nativo: PointerEvent) {
      if (nativo.pointerId !== evento.pointerId) return;
      window.removeEventListener("pointermove", andou);
      window.removeEventListener("pointerup", soltou);
      window.removeEventListener("pointercancel", soltou);
      document.body.style.removeProperty("cursor");
      setPegando(null);
      terminarGestoDoTripe();
    }

    window.addEventListener("pointermove", andou);
    window.addEventListener("pointerup", soltou);
    window.addEventListener("pointercancel", soltou);
  }

  return (
    <svg
      ref={raiz}
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
    >
      {tripes.map((tripe) => {
        const selecionado = tripe.id === selecionadaId;
        const noAr = tripe.id === noArId;
        const cor = noAr ? "#f87171" : selecionado ? "#facc15" : "rgba(255,255,255,0.75)";

        return (
          <g key={tripe.id} data-tripe={tripe.id} style={{ color: cor }}>
            <polygon
              data-parte="pegada"
              fill="currentColor"
              fillOpacity={selecionado ? 0.12 : 0.06}
              stroke="currentColor"
              strokeOpacity={0.5}
              strokeDasharray="6 4"
            />
            <line data-parte="perna" stroke="currentColor" strokeOpacity={0.6} strokeDasharray="3 3" />
            <path data-parte="piramide" fill="none" stroke="currentColor" strokeWidth={1.25} />

            <g
              className="group"
              data-ativo={pegando === `${tripe.id}:corpo` || undefined}
            >
              <g
                data-parte="corpo"
                data-tripe-alvo
                className={selecionado ? "cursor-move" : "cursor-pointer"}
                style={{ pointerEvents: "auto" }}
                onPointerDown={(evento) => pegar(evento, tripe, { tipo: "corpo" })}
              >
                <rect
                  x={-11}
                  y={-7}
                  width={22}
                  height={14}
                  rx={3}
                  fill="#18181b"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className={cn(BRILHO, "[.group:hover_&]:[stroke-width:2.5] group-data-[ativo]:[stroke-width:2.5]")}
                />
                <polygon points="11,-4 18,-8 18,8 11,4" fill="currentColor" className={BRILHO} />
                {noAr ? <circle cx={-5} cy={-2} r={2} fill="#ef4444" /> : null}
              </g>
              {/* Sobre o tripé escolhido, o que o corpo faz; sobre os outros,
                  o nome -- é por ele que o mestre os reconhece nos chips. */}
              <text data-rotulo="corpo" textAnchor="middle" className={ROTULO}>
                {selecionado ? t.tripe.arrastarPeloChao : tripe.nome}
              </text>
            </g>

            {selecionado ? (
              <g data-parte="gizmo">
                {(Object.keys(COR_DO_ANEL) as Anel[]).map((anel) => (
                  <g
                    key={anel}
                    className="group"
                    data-ativo={pegando === `${tripe.id}:${anel}` || undefined}
                    style={{ color: COR_DO_ANEL[anel] }}
                  >
                    <path
                      data-anel={anel}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      strokeOpacity={0.9}
                      className={cn(BRILHO, "[.group:hover_&]:[stroke-width:3.5] group-data-[ativo]:[stroke-width:3.5] [.group:hover_&]:[stroke-opacity:1]")}
                    />
                    {/* O alvo largo e invisível: um anel de 1,5 px não se pega. */}
                    <path
                      data-anel-alvo={anel}
                      data-tripe-alvo
                      fill="none"
                      stroke="transparent"
                      strokeWidth={8}
                      className="cursor-grab"
                      style={{ pointerEvents: "stroke" }}
                      onPointerDown={(evento) => pegar(evento, tripe, { tipo: "anel", anel })}
                    />
                    <text data-rotulo-anel={anel} className={ROTULO}>
                      {ROTULO_DO_ANEL[anel]}
                    </text>
                  </g>
                ))}
                {(Object.keys(COR_DO_EIXO) as Eixo[]).map((eixo) => (
                  <g
                    key={eixo}
                    className="group"
                    data-ativo={pegando === `${tripe.id}:${eixo}` || undefined}
                    style={{ color: COR_DO_EIXO[eixo] }}
                  >
                    <line
                      data-eixo={eixo}
                      stroke="currentColor"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      className={cn(BRILHO, "[.group:hover_&]:[stroke-width:4.5] group-data-[ativo]:[stroke-width:4.5]")}
                    />
                    {/* A alça da ponta: é por ela que o eixo se pega primeiro. */}
                    <circle
                      data-eixo-ponta={eixo}
                      r={6.5}
                      fill="currentColor"
                      stroke="white"
                      strokeWidth={1.5}
                      className={cn(BRILHO, "[.group:hover_&]:[r:8.5] group-data-[ativo]:[r:8.5]")}
                    />
                    {/* O trecho pegável, só por fora dos anéis. Ver `EIXO_PEGAVEL_DESDE`. */}
                    <line
                      data-eixo-alvo={eixo}
                      data-tripe-alvo
                      stroke="transparent"
                      strokeWidth={12}
                      className="cursor-grab"
                      style={{ pointerEvents: "stroke" }}
                      onPointerDown={(evento) => pegar(evento, tripe, { tipo: "eixo", eixo })}
                    />
                    <circle
                      data-eixo-alca={eixo}
                      data-tripe-alvo
                      r={13}
                      fill="transparent"
                      className="cursor-grab"
                      style={{ pointerEvents: "all" }}
                      onPointerDown={(evento) => pegar(evento, tripe, { tipo: "eixo", eixo })}
                    />
                    <text data-rotulo-eixo={eixo} className={ROTULO}>
                      {ROTULO_DO_EIXO[eixo]}
                    </text>
                  </g>
                ))}
              </g>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Um ponto do anel `anel` do tripé, no ângulo `a` (radianos), de raio `raio`.
 *
 * O de giro é horizontal, em volta da vertical do tripé. O de inclinação, em
 * volta do eixo de lado da câmera (corre pela frente e por cima dela). O de
 * rolagem, em volta do eixo de visão, na frente da lente.
 */
function pontoDoAnel(tripe: Tripe, anel: Anel, a: number, raio: number): PontoNoMundo {
  if (anel === "giro") {
    return {
      x: tripe.x + raio * Math.cos(a),
      y: tripe.y + raio * Math.sin(a),
      altura: tripe.altura,
    };
  }
  if (anel === "inclinacao") {
    return doOlhoAoMundo(tripe, 0, raio * Math.sin(a), raio * Math.cos(a));
  }
  return doOlhoAoMundo(tripe, raio * Math.cos(a), raio * Math.sin(a), raio * 0.15);
}

/**
 * O tripé girado pelo anel, em graus de anel.
 *
 * Os sinais saem da conta do olho: no anel de giro a direção da câmera no chão
 * é `-giro - 90°`, então o anel e o giro andam ao contrário; no de inclinação,
 * levar a frente para o lado de "cima da tela" é levantar o olhar; no de
 * rolagem, girar a câmera no sentido do relógio gira a imagem ao contrário.
 */
function girarPeloAnel(tripe: Tripe, anel: Anel, graus: number): Tripe {
  if (anel === "giro") {
    return { ...tripe, giro: (((tripe.giro - graus) % 360) + 360) % 360 };
  }
  if (anel === "inclinacao") {
    return {
      ...tripe,
      inclinacao: Math.min(135, Math.max(0, tripe.inclinacao - graus)),
    };
  }
  const rolagem = ((((tripe.rolagem - graus + 180) % 360) + 360) % 360) - 180;
  return { ...tripe, rolagem };
}

/** Projeta um ponto do mundo, ou `null` atrás do olho do mestre. */
function naTelaDoMestre(
  { camera, tela }: { camera: CameraOrbital; tela: Tela },
  ponto: PontoNoMundo,
): Vec | null {
  return projetar(camera, tela, ponto, ponto.altura);
}

function lista(pontos: Array<Vec | null>): string | null {
  if (pontos.some((ponto) => !ponto)) return null;
  return (pontos as Vec[]).map((ponto) => `${r(ponto.x)},${r(ponto.y)}`).join(" ");
}

function r(valor: number): number {
  return Math.round(valor * 10) / 10;
}

/** Escreve a projeção de um tripé no grupo dele. Sem React: roda por quadro. */
function desenharTripe(
  grupo: SVGGElement,
  tripe: Tripe,
  agora: { camera: CameraOrbital; tela: Tela },
  selecionado: boolean,
) {
  const parte = <T extends SVGElement>(seletor: string) =>
    grupo.querySelector<T>(seletor);
  const olho = naTelaDoMestre(agora, tripe);
  grupo.style.display = olho ? "" : "none";
  if (!olho) return;

  const pe = naTelaDoMestre(agora, { x: tripe.x, y: tripe.y, altura: 0 });
  const perna = parte<SVGLineElement>('[data-parte="perna"]');
  if (perna && pe) {
    perna.setAttribute("x1", `${r(olho.x)}`);
    perna.setAttribute("y1", `${r(olho.y)}`);
    perna.setAttribute("x2", `${r(pe.x)}`);
    perna.setAttribute("y2", `${r(pe.y)}`);
  }

  const pegada = pegadaDoTripe(tripe);
  const poligono = parte<SVGPolygonElement>('[data-parte="pegada"]');
  if (poligono) {
    const pontos = pegada
      ? lista(pegada.map((ponto) => naTelaDoMestre(agora, ponto)))
      : null;
    poligono.style.display = pontos ? "" : "none";
    if (pontos) poligono.setAttribute("points", pontos);
  }

  const boca = bocaDoTripe(tripe, BOCA).map((canto) => naTelaDoMestre(agora, canto));
  const piramide = parte<SVGPathElement>('[data-parte="piramide"]');
  if (piramide && boca.every(Boolean)) {
    const [a, b, c, d] = boca as Vec[];
    const linhas = [a!, b!, c!, d!]
      .map((canto) => `M${r(olho.x)},${r(olho.y)}L${r(canto.x)},${r(canto.y)}`)
      .join("");
    piramide.setAttribute(
      "d",
      `${linhas}M${r(a!.x)},${r(a!.y)}L${r(b!.x)},${r(b!.y)}L${r(c!.x)},${r(c!.y)}L${r(d!.x)},${r(d!.y)}Z`,
    );
  }

  const rotuloDoCorpo = parte<SVGTextElement>('[data-rotulo="corpo"]');
  rotuloDoCorpo?.setAttribute("x", `${r(olho.x)}`);
  rotuloDoCorpo?.setAttribute("y", `${r(olho.y - 16)}`);

  // O corpo aponta a lente para onde o tripé olha, na tela.
  const frente = naTelaDoMestre(agora, doOlhoAoMundo(tripe, 0, 0, 20));
  const corpo = parte<SVGGElement>('[data-parte="corpo"]');
  if (corpo) {
    const angulo = frente
      ? (Math.atan2(frente.y - olho.y, frente.x - olho.x) * 180) / Math.PI
      : 0;
    corpo.setAttribute(
      "transform",
      `translate(${r(olho.x)} ${r(olho.y)}) rotate(${r(angulo)})`,
    );
  }

  if (!selecionado) return;

  // O gizmo com tamanho de TELA constante: o raio no mundo é o que dá
  // `GIZMO_PX` pixels na distância em que o tripé está.
  const um = naTelaDoMestre(agora, { ...tripe, x: tripe.x + 1 });
  const pxPorUnidade = um ? Math.max(Math.hypot(um.x - olho.x, um.y - olho.y), 0.01) : 1;
  const tamanho = GIZMO_PX / pxPorUnidade;

  for (const eixo of ["x", "y", "z"] as const) {
    const noEixo = (fracao: number) =>
      naTelaDoMestre(agora, {
        x: tripe.x + (eixo === "x" ? tamanho * fracao : 0),
        y: tripe.y + (eixo === "y" ? tamanho * fracao : 0),
        altura: tripe.altura + (eixo === "z" ? tamanho * fracao : 0),
      });
    const ponta = noEixo(COMPRIMENTO_DO_EIXO);
    const deFora = noEixo(EIXO_PEGAVEL_DESDE);

    const linha = parte<SVGLineElement>(`[data-eixo="${eixo}"]`);
    if (linha) {
      linha.style.display = ponta ? "" : "none";
      if (ponta) {
        linha.setAttribute("x1", `${r(olho.x)}`);
        linha.setAttribute("y1", `${r(olho.y)}`);
        linha.setAttribute("x2", `${r(ponta.x)}`);
        linha.setAttribute("y2", `${r(ponta.y)}`);
      }
    }
    const alvo = parte<SVGLineElement>(`[data-eixo-alvo="${eixo}"]`);
    if (alvo) {
      alvo.style.display = ponta && deFora ? "" : "none";
      if (ponta && deFora) {
        alvo.setAttribute("x1", `${r(deFora.x)}`);
        alvo.setAttribute("y1", `${r(deFora.y)}`);
        alvo.setAttribute("x2", `${r(ponta.x)}`);
        alvo.setAttribute("y2", `${r(ponta.y)}`);
      }
    }
    for (const seletor of [`[data-eixo-ponta="${eixo}"]`, `[data-eixo-alca="${eixo}"]`]) {
      const bolinha = parte<SVGCircleElement>(seletor);
      if (!bolinha) continue;
      bolinha.style.display = ponta ? "" : "none";
      if (ponta) {
        bolinha.setAttribute("cx", `${r(ponta.x)}`);
        bolinha.setAttribute("cy", `${r(ponta.y)}`);
      }
    }
    // O rótulo um pouco além da ponta, na direção da seta.
    const rotulo = parte<SVGTextElement>(`[data-rotulo-eixo="${eixo}"]`);
    if (rotulo && ponta) {
      const dx = ponta.x - olho.x;
      const dy = ponta.y - olho.y;
      const comprimento = Math.max(Math.hypot(dx, dy), 1);
      rotulo.setAttribute("x", `${r(ponta.x + (dx / comprimento) * 16 + 4)}`);
      rotulo.setAttribute("y", `${r(ponta.y + (dy / comprimento) * 16 + 4)}`);
    }
  }

  for (const anel of ["giro", "inclinacao", "rolagem"] as const) {
    const pontos: Array<Vec | null> = [];
    for (let i = 0; i <= LADOS_DO_ANEL; i += 1) {
      const a = (i / LADOS_DO_ANEL) * Math.PI * 2;
      pontos.push(
        naTelaDoMestre(agora, pontoDoAnel(tripe, anel, a, tamanho * RAIO_DO_ANEL[anel])),
      );
    }
    const caminho = pontos.every(Boolean)
      ? `M${(pontos as Vec[]).map((ponto) => `${r(ponto.x)},${r(ponto.y)}`).join("L")}`
      : "";
    for (const seletor of [`[data-anel="${anel}"]`, `[data-anel-alvo="${anel}"]`]) {
      parte<SVGPathElement>(seletor)?.setAttribute("d", caminho);
    }
    // O rótulo no ponto mais alto do anel na tela, por fora dele: é onde ele
    // menos briga com as setas e com os outros anéis.
    const rotulo = parte<SVGTextElement>(`[data-rotulo-anel="${anel}"]`);
    const topo = (pontos.filter(Boolean) as Vec[]).reduce<Vec | null>(
      (acima, ponto) => (!acima || ponto.y < acima.y ? ponto : acima),
      null,
    );
    if (rotulo && topo) {
      rotulo.setAttribute("x", `${r(topo.x + 6)}`);
      rotulo.setAttribute("y", `${r(topo.y - 6)}`);
    }
  }
}
