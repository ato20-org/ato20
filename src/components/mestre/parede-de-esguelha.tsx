"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { CorDaFace } from "@/components/mestre/cor-da-face";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { useAmostraDoMapa } from "@/hooks/use-cores-das-paredes";
import { corDominante, corNoPonto, paletaDaArea } from "@/lib/cor-do-mapa";
import { projetar, type CameraOrbital, type Tela } from "@/lib/geometry/camera-orbital";
import {
  ALCAS_DA_CAIXA,
  alcaNaCena,
  alturaPeloArrasto,
  anguloDaAlcaDeGiro,
  caixaRedimensionada,
  linhaEntre,
  meioDaParede,
  noPlano,
  paredeGirada,
  paredeSobOPixel,
  pegadasDaParede,
  pontasDaLinha,
  raioDoGiro,
} from "@/lib/geometry/parede-de-esguelha";
import { alturaDaParede } from "@/lib/geometry/sombra";
import { amostrasDaArea, amostrasDaParede } from "@/lib/geometry/volume";
import type { ResizeHandle, Vec } from "@/lib/geometry/transform";
import { t } from "@/lib/i18n/ferramentas";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import type { Parede, Scene } from "@/types/scene";

type Camera = { camera: CameraOrbital; tela: Tela };

/** O lado da alça de tamanho, em pixels de tela. */
const ALCA_PX = 9;
/** Entre o alto da parede na tela e a fileira da cor, em pixels de tela. */
const FOLGA_DA_BARRA = 10;
/** Quantas cores da área a fileira sugere. Ver `paletaDaArea`. */
const QUANTAS_SUGESTOES = 4;
/** Entre o cursor e a prévia do conta-gotas, em pixels de tela. */
const FOLGA_DA_PREVIA = 14;

/** Quantos pontos o anel de giro tem no alto da parede. */
const PONTOS_DO_ANEL = 48;

/** As pontas da `linha`, a alça que sobe a parede e a que a gira. */
type AlcaPropria = "a" | "b" | "altura" | "giro";
type Alca = ResizeHandle | AlcaPropria;

/** Um ponto da área (as coordenadas da câmera), a partir do evento. */
function naArea(area: Element, evento: { clientX: number; clientY: number }): Vec {
  const caixa = area.getBoundingClientRect();
  return { x: evento.clientX - caixa.left, y: evento.clientY - caixa.top };
}

/**
 * Um arrasto de parede no 2.5D, do apertar ao soltar.
 *
 * Grava no board a cada quadro, como o arrasto da parede no 2D (`startDrag` em
 * `MestreStage`): o desfazer junta os passos do mesmo gesto pelo tempo, e o
 * gesto inteiro sai num passo só. Um quadro por vez, no máximo -- o último
 * movimento da janela é o que vale.
 *
 * Na JANELA, e não no alvo: as alças são traços de SVG reescritos a cada
 * quadro, e o corpo da parede nem é elemento. É o caminho do gizmo da peça.
 */
export function arrastarParede({
  evento,
  area,
  instante,
  sceneId,
  paredeId,
  passo,
}: {
  evento: React.PointerEvent;
  /** A área da câmera, para o pixel do ponteiro. */
  area: Element;
  instante: () => Camera | null;
  sceneId: string;
  paredeId: string;
  /** O que muda na parede com a mão neste pixel. `null` = nada agora. */
  passo: (pixel: Vec, nativo: PointerEvent, agora: Camera) => Partial<Parede> | null;
}) {
  evento.preventDefault();
  evento.stopPropagation();
  const ponteiro = evento.pointerId;
  let quadro: number | undefined;
  let pendente: PointerEvent | null = null;

  function aplicar() {
    quadro = undefined;
    const nativo = pendente;
    pendente = null;
    const agora = instante();
    if (!nativo || !agora) return;
    const patch = passo(naArea(area, nativo), nativo, agora);
    if (patch) useSceneStore.getState().updateParede(sceneId, paredeId, patch);
  }
  function andou(nativo: PointerEvent) {
    if (nativo.pointerId !== ponteiro) return;
    pendente = nativo;
    quadro ??= requestAnimationFrame(aplicar);
  }
  function soltou(nativo: PointerEvent) {
    if (nativo.pointerId !== ponteiro) return;
    window.removeEventListener("pointermove", andou);
    window.removeEventListener("pointerup", soltou);
    window.removeEventListener("pointercancel", soltou);
    // O último movimento não espera o quadro: soltar grava onde a mão parou.
    if (quadro !== undefined) {
      cancelAnimationFrame(quadro);
      aplicar();
    }
  }
  window.addEventListener("pointermove", andou);
  window.addEventListener("pointerup", soltou);
  window.addEventListener("pointercancel", soltou);
}

/** Onde cada alça mora no chão. `null` se a parede não a tem. */
function pontoDaAlca(parede: Parede, alca: Alca): Vec | null {
  if (alca === "altura") return meioDaParede(parede);
  if (alca === "giro") {
    const meio = meioDaParede(parede);
    const raio = raioDoGiro(parede);
    const angulo = (anguloDaAlcaDeGiro(parede) * Math.PI) / 180;
    return {
      x: meio.x + Math.cos(angulo) * raio,
      y: meio.y + Math.sin(angulo) * raio,
    };
  }
  if (alca === "a" || alca === "b") {
    const pontas = pontasDaLinha(parede);
    return pontas ? pontas[alca === "a" ? 0 : 1] : null;
  }
  return alcaNaCena(parede, alca);
}

function caminho(pontos: Vec[], fechado: boolean): string {
  const [primeiro, ...resto] = pontos;
  if (!primeiro) return "";
  return (
    `M${primeiro.x},${primeiro.y}` +
    resto.map(({ x, y }) => `L${x},${y}`).join("") +
    (fechado ? "Z" : "")
  );
}

/**
 * A parede marcada no 2.5D: o arame do volume dela, as alças de tamanho no
 * TOPO, a alça que a sobe e, em cima de tudo, a cor da face.
 *
 * A cor mora aqui porque é aqui que a face se vê: no 2D a parede não tem face,
 * e escolher a cor lá seria escolher às cegas. Vale mesmo travada -- o cadeado
 * segura onde a parede está, e não como ela é pintada.
 *
 * No topo, e não no chão: é a parte da parede que fica à vista -- a base some
 * atrás do próprio volume --, e o arrasto se mede no plano dela (`noPlano`),
 * então a alça anda sob o cursor e não sob o chão atrás dela.
 *
 * Mover é no corpo, e quem ouve é o `MestreDeEsguelha`: o corpo não é elemento
 * nenhum, e o clique nele é conta (`paredeSobOPixel`).
 *
 * Andar e aproximar mudam tudo a cada quadro sem render, como a seleção das
 * peças: um SVG do tamanho da área, cujos atributos são escritos a cada aviso
 * da câmera.
 */
export function ParedeDeEsguelha({
  scene,
  assinar,
  instante,
}: {
  scene: Scene;
  assinar: (aviso: () => void) => () => void;
  instante: () => Camera | null;
}) {
  const selecionadaId = useSelectionStore((state) => state.selectedParedeId);
  const parede =
    (scene.paredes ?? []).find((candidata) => candidata.id === selecionadaId) ??
    null;

  const svg = useRef<SVGSVGElement>(null);
  const arame = useRef<SVGPathElement>(null);
  const barra = useRef<HTMLDivElement>(null);
  const alcas = useRef(new Map<Alca, SVGRectElement | SVGCircleElement>());
  const anelDoGiro = useRef<SVGPolygonElement>(null);
  const previa = useRef<HTMLDivElement>(null);

  /**
   * O retrato do mapa, para as sugestões e o conta-gotas. O MESMO arquivo que
   * o chão pede para a cor das faces, e por isso o mesmo retrato -- ver
   * `amostraDoMapa`.
   */
  const mapaUrl = useAssetUrl(scene.backgroundAssetId);
  const amostra = useAmostraDoMapa(mapaUrl);

  /**
   * As cores do pedaço de mapa sob a parede: o telhado, o beiral, o quintal.
   * A primeira é a que a face já sobe sozinha; as outras, o que mais aparece
   * ali. Ver `paletaDaArea`.
   */
  const sugestoes = useMemo(
    () =>
      parede && amostra
        ? paletaDaArea(amostra, amostrasDaArea(parede), QUANTAS_SUGESTOES)
        : [],
    [amostra, parede],
  );

  /**
   * O conta-gotas, ligado PARA esta parede. Pela id e não um booleano: marcar
   * outra parede no meio desliga sozinho, sem efeito nenhum a escrever.
   */
  const [pegandoPara, setPegandoPara] = useState<string | null>(null);
  const pegando = parede !== null && pegandoPara === parede.id;

  // Esc solta o conta-gotas -- e só ele: na CAPTURA da janela, antes dos
  // atalhos do palco, que leriam o mesmo Esc como "desmarcar a parede".
  useEffect(() => {
    if (!pegando) return;
    function tecla(evento: KeyboardEvent) {
      if (evento.key !== "Escape") return;
      evento.preventDefault();
      evento.stopPropagation();
      setPegandoPara(null);
    }
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [pegando]);

  // Sem lista de dependências, como a seleção das peças: depois de todo commit
  // a parede pode ter mudado, e o gizmo tem de estar no lugar antes da pintura.
  useLayoutEffect(() => {
    function escrever() {
      const agora = instante();
      const esconder = () => {
        if (barra.current) barra.current.style.display = "none";
        arame.current?.setAttribute("visibility", "hidden");
        anelDoGiro.current?.setAttribute("visibility", "hidden");
        alcas.current.forEach((no) => no.setAttribute("visibility", "hidden"));
      };
      if (!parede || !agora) return esconder();

      const altura = alturaDaParede(parede);
      const projetado = (ponto: Vec, h: number) =>
        projetar(agora.camera, agora.tela, ponto, h);

      let d = "";
      let topo = Infinity;
      let esquerda = Infinity;
      let direita = -Infinity;
      for (const pegada of pegadasDaParede(parede)) {
        const baixo: Vec[] = [];
        const alto: Vec[] = [];
        for (const ponto of pegada) {
          const noChao = projetado(ponto, 0);
          const noTopo = projetado(ponto, altura);
          if (!noChao || !noTopo) return esconder();
          baixo.push(noChao);
          alto.push(noTopo);
          for (const naTela of [noChao, noTopo]) {
            topo = Math.min(topo, naTela.y);
            esquerda = Math.min(esquerda, naTela.x);
            direita = Math.max(direita, naTela.x);
          }
        }
        d += caminho(baixo, true) + caminho(alto, true);
        // As arestas de pé só nos cantos: uma elipse tem vinte e quatro lados,
        // e vinte e quatro riscos verticais viram hachura.
        if (pegada.length <= 8) {
          baixo.forEach((ponto, i) => {
            d += caminho([ponto, alto[i]!], false);
          });
        }
      }
      arame.current?.removeAttribute("visibility");
      arame.current?.setAttribute("d", d);

      // O anel de giro, no ALTO da parede, como as alças: é onde a mão está.
      const anel = anelDoGiro.current;
      if (anel) {
        const meio = meioDaParede(parede);
        const raio = raioDoGiro(parede);
        const volta: Vec[] = [];
        for (let i = 0; i < PONTOS_DO_ANEL; i += 1) {
          const a = (i / PONTOS_DO_ANEL) * Math.PI * 2;
          const naTela = projetado(
            { x: meio.x + Math.cos(a) * raio, y: meio.y + Math.sin(a) * raio },
            altura,
          );
          if (!naTela) break;
          volta.push(naTela);
        }
        if (volta.length === PONTOS_DO_ANEL) {
          anel.removeAttribute("visibility");
          anel.setAttribute(
            "points",
            volta.map(({ x, y }) => `${x},${y}`).join(" "),
          );
        } else {
          anel.setAttribute("visibility", "hidden");
        }
      }

      const fileira = barra.current;
      if (fileira) {
        fileira.style.display = topo === Infinity ? "none" : "";
        // Em pixel inteiro, como a barra da peça: meio pixel deixava a beira
        // dos botões fora do que o motor repinta.
        fileira.style.transform = `translate(${Math.round((esquerda + direita) / 2)}px, ${Math.round(topo - FOLGA_DA_BARRA)}px) translate(-50%, -100%)`;
      }

      for (const [alca, no] of alcas.current) {
        const ponto = pontoDaAlca(parede, alca);
        const naTela = ponto ? projetado(ponto, altura) : null;
        if (!naTela) {
          no.setAttribute("visibility", "hidden");
          continue;
        }
        no.removeAttribute("visibility");
        if (no instanceof SVGCircleElement) {
          no.setAttribute("cx", `${naTela.x}`);
          no.setAttribute("cy", `${naTela.y}`);
        } else {
          no.setAttribute("x", `${naTela.x - ALCA_PX / 2}`);
          no.setAttribute("y", `${naTela.y - ALCA_PX / 2}`);
        }
      }
    }

    escrever();
    return assinar(escrever);
  });

  if (!parede) return null;

  /**
   * A cor do que se VÊ sob o pixel, para o conta-gotas.
   *
   * O que está na frente ganha, como no olho: o topo de uma parede é o mapa
   * no plano do teto -- o chão sob o pixel fica atrás dela --, a face é a cor
   * dela, e o resto é o chão.
   */
  function corSob(pixel: Vec): string | null {
    const agora = instante();
    if (!agora || !amostra) return null;

    const mira = paredeSobOPixel(scene.paredes ?? [], agora, pixel);
    if (mira) {
      const altura = alturaDaParede(mira.parede);
      if (mira.plano !== altura) {
        return (
          mira.parede.cor ??
          corDominante(amostra, amostrasDaParede(mira.parede))
        );
      }
      const noTopo = noPlano(agora, pixel, altura);
      return noTopo ? corNoPonto(amostra, noTopo) : null;
    }

    const noChao = noPlano(agora, pixel, 0);
    return noChao ? corNoPonto(amostra, noChao) : null;
  }

  /** A bolinha ao lado do cursor, com a cor que o clique vai pegar. */
  function mostrarPrevia(evento: React.PointerEvent<HTMLDivElement>) {
    const no = previa.current;
    if (!no) return;
    const pixel = naArea(evento.currentTarget, evento);
    const cor = corSob(pixel);
    if (!cor) {
      no.style.display = "none";
      return;
    }
    no.style.display = "";
    no.style.background = cor;
    // Por `left`/`top`, e não `transform`: o que anda por `transform` sem
    // camada própria deixava rastro no WebKitGTK. Ver `InfoDeEsguelha`.
    no.style.left = `${pixel.x + FOLGA_DA_PREVIA}px`;
    no.style.top = `${pixel.y + FOLGA_DA_PREVIA}px`;
  }

  function pegarCor(evento: React.PointerEvent<HTMLDivElement>) {
    if (evento.button !== 0 || !parede) return;
    evento.preventDefault();
    evento.stopPropagation();
    const cor = corSob(naArea(evento.currentTarget, evento));
    if (cor) {
      useSceneStore.getState().updateParede(scene.id, parede.id, { cor });
    }
    setPegandoPara(null);
  }

  const livre = !parede.locked;
  const linha = parede.formato === "linha";
  const deTamanho: Alca[] = linha ? ["a", "b"] : ALCAS_DA_CAIXA;

  /** Uma alça de tamanho: a caixa cresce com a oposta parada, no topo. */
  function redimensionar(evento: React.PointerEvent, alca: Alca) {
    const area = svg.current;
    const agora = instante();
    if (evento.button !== 0 || !parede || !area || !agora) return;
    const base = parede;
    const altura = alturaDaParede(base);
    const inicio = noPlano(agora, naArea(area, evento), altura);
    if (!inicio) return;

    const pontas = pontasDaLinha(base);
    arrastarParede({
      evento,
      area,
      instante,
      sceneId: scene.id,
      paredeId: base.id,
      passo: (pixel, nativo, camera) => {
        const aqui = noPlano(camera, pixel, altura);
        if (!aqui) return null;
        const delta = { x: aqui.x - inicio.x, y: aqui.y - inicio.y };

        if (alca === "a" || alca === "b") {
          if (!pontas) return null;
          const [a, b] = pontas;
          return alca === "a"
            ? linhaEntre({ x: a.x + delta.x, y: a.y + delta.y }, b)
            : linhaEntre(a, { x: b.x + delta.x, y: b.y + delta.y });
        }
        if (alca === "altura" || alca === "giro") return null;
        return caixaRedimensionada(base, alca, delta, nativo.shiftKey);
      },
    });
  }

  /**
   * A alça do anel: a parede gira em volta do meio, seguindo a mão pelo plano
   * do topo dela. Shift anda de 15 em 15 graus. Ver `paredeGirada`.
   */
  function girar(evento: React.PointerEvent) {
    const area = svg.current;
    const agora = instante();
    if (evento.button !== 0 || !parede || !area || !agora) return;
    const base = parede;
    const altura = alturaDaParede(base);
    const meio = meioDaParede(base);
    const angulo = (ponto: Vec) =>
      (Math.atan2(ponto.y - meio.y, ponto.x - meio.x) * 180) / Math.PI;
    const inicio = noPlano(agora, naArea(area, evento), altura);
    if (!inicio) return;
    const a0 = angulo(inicio);

    arrastarParede({
      evento,
      area,
      instante,
      sceneId: scene.id,
      paredeId: base.id,
      passo: (pixel, nativo, camera) => {
        const aqui = noPlano(camera, pixel, altura);
        return aqui
          ? paredeGirada(base, angulo(aqui) - a0, nativo.shiftKey)
          : null;
      },
    });
  }

  /** A alça do meio do topo: a parede sobe e desce com a mão. */
  function subir(evento: React.PointerEvent) {
    const area = svg.current;
    if (evento.button !== 0 || !parede || !area) return;
    const base = parede;
    const alturaInicial = alturaDaParede(base);
    const inicio = naArea(area, evento);

    arrastarParede({
      evento,
      area,
      instante,
      sceneId: scene.id,
      paredeId: base.id,
      passo: (pixel, _nativo, camera) => {
        const altura = alturaPeloArrasto(camera, base, alturaInicial, inicio, pixel);
        return altura === null ? null : { altura };
      },
    });
  }

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg ref={svg} className="absolute inset-0 h-full w-full overflow-visible">
        <g style={{ color: "var(--primary)" }}>
          <path
            ref={arame}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          {livre ? (
            <polygon
              ref={anelDoGiro}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.7}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          ) : null}
          {livre ? (
            <circle
              ref={(no) => {
                if (no) alcas.current.set("giro", no);
                else alcas.current.delete("giro");
              }}
              r={6}
              data-gizmo-esguelha=""
              fill="white"
              stroke="currentColor"
              strokeWidth={2}
              className="cursor-grab"
              style={{ pointerEvents: "all" }}
              onPointerDown={girar}
            >
              <title>{t.esguelha.girarParede}</title>
            </circle>
          ) : null}
          {livre
            ? deTamanho.map((alca) => (
                <rect
                  key={alca}
                  ref={(no) => {
                    if (no) alcas.current.set(alca, no);
                    else alcas.current.delete(alca);
                  }}
                  width={ALCA_PX}
                  height={ALCA_PX}
                  rx={1.5}
                  data-gizmo-esguelha=""
                  fill="white"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="cursor-grab"
                  style={{ pointerEvents: "all" }}
                  onPointerDown={(evento) => redimensionar(evento, alca)}
                >
                  <title>
                    {linha ? t.esguelha.pontaDaParede : t.esguelha.tamanhoDaParede}
                  </title>
                </rect>
              ))
            : null}
          {livre ? (
            <circle
              ref={(no) => {
                if (no) alcas.current.set("altura", no);
                else alcas.current.delete("altura");
              }}
              r={6}
              data-gizmo-esguelha=""
              fill="currentColor"
              stroke="white"
              strokeWidth={1.5}
              className="cursor-ns-resize"
              style={{ pointerEvents: "all" }}
              onPointerDown={subir}
            >
              <title>{t.esguelha.alturaDaParede}</title>
            </circle>
          ) : null}
        </g>
      </svg>

      {pegando ? (
        // Por cima da mesa e das alças, e embaixo da fileira -- que continua
        // clicável para desligar o conta-gotas. É da mão (`data-gizmo-esguelha`):
        // o botão esquerdo não anda a câmera, e a roda e o direito continuam
        // dela, para mirar.
        <div
          data-gizmo-esguelha=""
          className="pointer-events-auto absolute inset-0 cursor-crosshair"
          onPointerMove={mostrarPrevia}
          onPointerLeave={() => {
            if (previa.current) previa.current.style.display = "none";
          }}
          onPointerDown={pegarCor}
        >
          <div
            ref={previa}
            className="pointer-events-none absolute size-6 rounded-full border-2 border-white shadow-md"
            style={{ display: "none" }}
          />
          <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-md bg-black/70 px-3 py-1.5 text-xs text-white/90 backdrop-blur">
            {t.esguelha.contaGotasDica}
          </div>
        </div>
      ) : null}

      <div
        ref={barra}
        data-gizmo-esguelha=""
        className="bg-popover/90 pointer-events-auto absolute top-0 left-0 rounded-full p-1 shadow-md backdrop-blur"
        // Para o React não levar o apertar ao `MestreDeEsguelha`, que o leria
        // como mão na parede. Sem `preventDefault`: as bolinhas agem no clique.
        onPointerDown={(evento) => evento.stopPropagation()}
      >
        <CorDaFace
          cor={parede.cor}
          onCor={(cor) =>
            useSceneStore
              .getState()
              .updateParede(scene.id, parede.id, { cor })
          }
          sugestoes={sugestoes}
          contaGotas={{
            ativo: pegando,
            onAlternar: () => setPegandoPara(pegando ? null : parede.id),
          }}
        />
      </div>
    </div>
  );
}
