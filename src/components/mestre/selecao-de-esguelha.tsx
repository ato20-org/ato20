"use client";

import { useLayoutEffect, useRef } from "react";
import {
  ArrowLeftRight,
  BedSingle,
  Drama,
  FlipHorizontal,
  Lock,
  LockOpen,
  PersonStanding,
  Trash2,
} from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import {
  cartazNaTela,
  projetar,
  type CameraOrbital,
  type Tela,
} from "@/lib/geometry/camera-orbital";
import {
  cantosDeitado,
  centroDe,
  olharDe,
  peDe,
  pivoDe,
  raioDoAnel,
  sobeDe,
} from "@/lib/geometry/peca-de-esguelha";
import type { Vec } from "@/lib/geometry/transform";
import { t } from "@/lib/i18n/ferramentas";
import {
  flipSelection,
  removeSelection,
  toggleSelectionLock,
} from "@/lib/mestre/item-actions";
import {
  LIMIAR_PARA_APONTAR,
  giroEmVolta,
  miraDaLanterna,
} from "@/lib/mestre/roda-da-lanterna";
import {
  moverNoGesto,
  terminarGesto,
  useGestoStore,
} from "@/lib/store/use-gesto-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { cn } from "@/lib/utils";
import type { CanvasItem, Scene } from "@/types/scene";

/**
 * O que é da mão no 2.5D, e não da câmera: o gizmo e as peças, em pé no chão
 * inclinado (`data-peca`) ou deitadas no piso (`data-item-id`). Ver
 * `podeAgarrar` em `MestreDeEsguelha`.
 */
export const ALVO_DA_MAO =
  "[data-gizmo-esguelha], [data-peca], [data-item-id]";

/** Entre o topo da caixa e a barra, em pixels de tela. */
const FOLGA_DA_BARRA = 8;
/** O lado da alça de tamanho, em pixels de tela. */
const ALCA_PX = 9;
/** Quantos pontos o anel do olhar tem no chão. */
const PONTOS_DO_ANEL = 40;
/** O passo do giro com Shift, em graus. */
const PASSO_DO_GIRO = 15;
/** O tamanho mínimo de uma peça, em unidades de cena. */
const LADO_MINIMO = 8;

type Camera = { camera: CameraOrbital; tela: Tela };

/**
 * O contorno da peça na tela: o retângulo da figura em pé (`cartazNaTela`), ou
 * os quatro cantos da deitada projetados no chão. `null` se ela não se vê.
 */
function contornoNaTela(
  agora: Camera,
  item: CanvasItem,
  sobe: number,
): Vec[] | null {
  if (item.deitado) {
    const cantos: Vec[] = [];
    for (const canto of cantosDeitado(item)) {
      const naTela = projetar(agora.camera, agora.tela, canto);
      if (!naTela) return null;
      cantos.push(naTela);
    }
    return cantos;
  }
  const caixa = cartazNaTela(
    agora.camera,
    agora.tela,
    peDe(item),
    item.width,
    item.height,
    sobe,
  );
  if (!caixa) return null;
  const { x, y, largura, altura } = caixa;
  return [
    { x, y },
    { x: x + largura, y },
    { x: x + largura, y: y + altura },
    { x, y: y + altura },
  ];
}

function emTexto(pontos: Vec[]): string {
  return pontos.map(({ x, y }) => `${x},${y}`).join(" ");
}

/**
 * A seleção do 2.5D: o contorno de cada peça marcada, a barra do gizmo em
 * cima, e -- com UMA marcada -- a alça de tamanho no canto e o anel do olhar no
 * chão.
 *
 * Contorno de TELA na peça em pé, e não de chão: ela é paralela à tela, e o que
 * o mestre clicou é a figura, não a pegada. A deitada é o contrário: está no
 * piso, e o contorno é o dela no chão.
 *
 * Andar e aproximar mudam tudo a cada quadro sem render, como o chão: um SVG do
 * tamanho da área, cujos atributos são escritos a cada aviso da câmera -- o
 * desenho do gizmo do tripé. Uma `div` andando por `transform` deixava rastro
 * no WebKitGTK.
 *
 * Os botões chamam as ações do 2D, sobre a mesma seleção. Fica de fora o que
 * abre painel (opacidade, sombra): eles se ancoram no plano do 2D.
 */
export function SelecaoDeEsguelha({
  scene,
  assinar,
  instante,
  paraChao,
}: {
  /** A cena como está desenhada, com o gesto em curso por cima. */
  scene: Scene;
  assinar: (aviso: () => void) => () => void;
  instante: () => Camera | null;
  paraChao: (clientX: number, clientY: number) => Vec | null;
}) {
  const selectedIds = useSelectionStore((state) => state.selectedIds);
  const abrirJanela = useAbrirJanela();

  const itens = scene.items.filter((item) => selectedIds.includes(item.id));
  const unico = itens.length === 1 ? itens[0]! : null;

  const svg = useRef<SVGSVGElement>(null);
  const contornos = useRef(new Map<string, SVGPolygonElement>());
  const barra = useRef<HTMLDivElement>(null);
  const anel = useRef<SVGPolygonElement>(null);
  const haste = useRef<SVGLineElement>(null);
  const ponta = useRef<SVGCircleElement>(null);
  const alca = useRef<SVGRectElement>(null);

  // Sem lista de dependências, como o chão: depois de todo commit a seleção ou
  // a peça podem ter mudado, e o gizmo tem de estar no lugar antes da pintura.
  useLayoutEffect(() => {
    /** O anel do olhar e a alça de tamanho da peça marcada sozinha. */
    function escreverAlcas(agora: Camera | null) {
      const partes = [anel.current, haste.current, ponta.current, alca.current];
      const esconder = () =>
        partes.forEach((parte) => parte?.setAttribute("visibility", "hidden"));
      if (!unico || !agora) return esconder();

      const pivo = pivoDe(unico);
      const raio = raioDoAnel(unico);
      // No teto em que ela pisa, quando pisa num: o anel é do pé dela.
      const sobe = sobeDe(unico, scene.paredes);
      const volta: Vec[] = [];
      for (let i = 0; i < PONTOS_DO_ANEL; i += 1) {
        const a = (i / PONTOS_DO_ANEL) * Math.PI * 2;
        const naTela = projetar(
          agora.camera,
          agora.tela,
          { x: pivo.x + Math.cos(a) * raio, y: pivo.y + Math.sin(a) * raio },
          sobe,
        );
        if (!naTela) return esconder();
        volta.push(naTela);
      }
      const olhar = (olharDe(unico) * Math.PI) / 180;
      const centro = projetar(agora.camera, agora.tela, pivo, sobe);
      const bico = projetar(
        agora.camera,
        agora.tela,
        {
          x: pivo.x + Math.cos(olhar) * raio * 1.25,
          y: pivo.y + Math.sin(olhar) * raio * 1.25,
        },
        sobe,
      );
      const contorno = contornoNaTela(agora, unico, sobe);
      if (!centro || !bico || !contorno) return esconder();

      partes.forEach((parte) => parte?.removeAttribute("visibility"));
      anel.current?.setAttribute("points", emTexto(volta));
      haste.current?.setAttribute("x1", `${centro.x}`);
      haste.current?.setAttribute("y1", `${centro.y}`);
      haste.current?.setAttribute("x2", `${bico.x}`);
      haste.current?.setAttribute("y2", `${bico.y}`);
      ponta.current?.setAttribute("cx", `${bico.x}`);
      ponta.current?.setAttribute("cy", `${bico.y}`);

      // O canto de cima à direita, na tela: o que fica mais longe do pé.
      const canto = contorno.reduce((melhor, ponto) =>
        ponto.x - ponto.y > melhor.x - melhor.y ? ponto : melhor,
      );
      alca.current?.setAttribute("x", `${canto.x - ALCA_PX / 2}`);
      alca.current?.setAttribute("y", `${canto.y - ALCA_PX / 2}`);
    }

    function escrever() {
      const agora = instante();
      let topo = Infinity;
      let esquerda = Infinity;
      let direita = -Infinity;

      for (const item of itens) {
        const no = contornos.current.get(item.id);
        if (!no) continue;
        const pontos = agora
          ? contornoNaTela(agora, item, sobeDe(item, scene.paredes))
          : null;
        if (!pontos) {
          no.setAttribute("visibility", "hidden");
          continue;
        }
        no.removeAttribute("visibility");
        no.setAttribute("points", emTexto(pontos));
        for (const ponto of pontos) {
          topo = Math.min(topo, ponto.y);
          esquerda = Math.min(esquerda, ponto.x);
          direita = Math.max(direita, ponto.x);
        }
      }

      const fileira = barra.current;
      if (fileira) {
        if (topo === Infinity) fileira.style.display = "none";
        else {
          fileira.style.display = "";
          // Em pixel inteiro: a barra anda por `transform` sem camada própria,
          // e meio pixel deixava a beira dos botões fora do que o motor
          // repinta.
          fileira.style.transform = `translate(${Math.round((esquerda + direita) / 2)}px, ${Math.round(topo - FOLGA_DA_BARRA)}px) translate(-50%, -100%)`;
        }
      }

      escreverAlcas(agora);
    }

    escrever();
    return assinar(escrever);
  });

  if (itens.length === 0) return null;

  const livres = itens.filter((item) => !item.locked);
  const travada = itens.every((item) => item.locked);
  const deitados = itens.every((item) => item.deitado);
  // Só quem está de pé tem lado da tela para onde olhar.
  const emPe = livres.filter((item) => !item.deitado);
  const espelhamPeloOlhar =
    emPe.length > 0 && emPe.every((item) => item.espelharPeloOlhar);
  const personagemId = unico?.personagemId;
  // Azul quando é gente, como o gizmo do 2D: ver `tom` em `TransformHandles`.
  const cor = personagemId
    ? { traco: "var(--color-sky-400)", botao: "bg-sky-500 text-white" }
    : { traco: "var(--primary)", botao: "bg-primary text-primary-foreground" };

  /** Onde o ponteiro está, nas coordenadas da área (as da câmera). */
  function naArea(evento: { clientX: number; clientY: number }): Vec {
    const caixa = svg.current?.getBoundingClientRect();
    return {
      x: evento.clientX - (caixa?.left ?? 0),
      y: evento.clientY - (caixa?.top ?? 0),
    };
  }

  /**
   * Um arrasto de alça, na JANELA: o alvo é um traço de SVG reescrito a cada
   * quadro, e é o caminho do gizmo do tripé. Por quadro só o gesto; o board
   * recebe ao soltar, num passo só do desfazer.
   */
  function arrastar(
    evento: React.PointerEvent,
    passo: (nativo: PointerEvent) => Partial<CanvasItem> | null,
  ) {
    if (evento.button !== 0 || !unico || unico.locked) return;
    evento.preventDefault();
    evento.stopPropagation();
    const id = unico.id;
    const ponteiro = evento.pointerId;

    function andou(nativo: PointerEvent) {
      if (nativo.pointerId !== ponteiro) return;
      const patch = passo(nativo);
      if (patch) moverNoGesto(scene.id, [{ id, patch }]);
    }
    function soltou(nativo: PointerEvent) {
      if (nativo.pointerId !== ponteiro) return;
      window.removeEventListener("pointermove", andou);
      window.removeEventListener("pointerup", soltou);
      window.removeEventListener("pointercancel", soltou);
      const patches = useGestoStore.getState().patches;
      if (patches?.length) terminarGesto(scene.id, patches);
    }
    window.addEventListener("pointermove", andou);
    window.addEventListener("pointerup", soltou);
    window.addEventListener("pointercancel", soltou);
  }

  /**
   * A alça do canto: a peça cresce na razão em que a mão se afasta do pé (ou
   * do meio, deitada), na mesma proporção. O pé fica onde está.
   */
  function redimensionar(evento: React.PointerEvent) {
    const agora = instante();
    if (!unico || !agora) return;
    const item = unico;
    const ancora = projetar(
      agora.camera,
      agora.tela,
      pivoDe(item),
      sobeDe(item, scene.paredes),
    );
    if (!ancora) return;
    const inicio = naArea(evento);
    const d0 = Math.hypot(inicio.x - ancora.x, inicio.y - ancora.y);
    if (d0 < 1) return;

    arrastar(evento, (nativo) => {
      const aqui = naArea(nativo);
      const fator = Math.hypot(aqui.x - ancora.x, aqui.y - ancora.y) / d0;
      const largura = Math.max(LADO_MINIMO, item.width * fator);
      const altura = (largura / item.width) * item.height;
      if (item.deitado) {
        const centro = centroDe(item);
        return {
          x: centro.x - largura / 2,
          y: centro.y - altura / 2,
          width: largura,
          height: altura,
        };
      }
      const pe = peDe(item);
      return {
        x: pe.x - largura / 2,
        y: pe.y - largura,
        width: largura,
        height: altura,
      };
    });
  }

  /**
   * A ponta do anel: o olhar segue a mão em volta do pé, pelo chão. Shift anda
   * de quinze em quinze graus.
   *
   * Com lanterna, mira o FACHO e o token não gira -- a mesma mira da roda do
   * 2D (`miraDaLanterna`): girar o `rotation` aqui virava o desenho no 2D, e o
   * que o mestre pediu foi para onde a luz olha. Sem lanterna o olhar não tem
   * facho onde morar, e gira a figura, como sempre.
   */
  function girar(evento: React.PointerEvent) {
    if (!unico) return;
    const item = unico;
    const pivo = pivoDe(item);
    const inicio = paraChao(evento.clientX, evento.clientY);
    if (!inicio) return;
    // Passou do limiar uma vez, é mira até soltar. Ver `LIMIAR_PARA_APONTAR`.
    let apontou = false;

    arrastar(evento, (nativo) => {
      const aqui = paraChao(nativo.clientX, nativo.clientY);
      if (!aqui) return null;
      const giro = giroEmVolta(pivo, inicio, aqui);

      if (item.luz) {
        apontou ||= Math.abs(giro) >= LIMIAR_PARA_APONTAR;
        const luz = miraDaLanterna(item, giro, {
          encaixar: nativo.shiftKey,
          apontar: apontou,
        });
        return luz ? { luz } : null;
      }

      let rotacao = item.rotation + giro;
      if (nativo.shiftKey) {
        rotacao = Math.round(rotacao / PASSO_DO_GIRO) * PASSO_DO_GIRO;
      }
      return { rotation: ((rotacao % 360) + 360) % 360 };
    });
  }

  /** Deita ou levanta a seleção inteira, menos o travado. */
  function alternarDeitado() {
    if (livres.length === 0) return;
    useSceneStore.getState().updateItems(
      scene.id,
      livres.map((item) => ({
        id: item.id,
        // `undefined` e não `false`: em pé é o padrão, e o campo ausente é
        // como ele se escreve na cena.
        patch: { deitado: deitados ? undefined : true },
      })),
    );
  }

  /**
   * Liga ou desliga o espelhar pelo olhar da seleção em pé, menos o travado.
   * Ver `CanvasItem.espelharPeloOlhar`.
   */
  function alternarEspelharPeloOlhar() {
    if (emPe.length === 0) return;
    useSceneStore.getState().updateItems(
      scene.id,
      emPe.map((item) => ({
        id: item.id,
        // `undefined` e não `false`: desligado é o padrão.
        patch: { espelharPeloOlhar: espelhamPeloOlhar ? undefined : true },
      })),
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg
        ref={svg}
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        {itens.map((item) => (
          <polygon
            key={item.id}
            ref={(no) => {
              if (no) contornos.current.set(item.id, no);
              else contornos.current.delete(item.id);
            }}
            fill="none"
            strokeWidth={1.5}
            strokeLinejoin="round"
            // Por `style`: `var()` em atributo de apresentação o motor ignora.
            style={{ stroke: cor.traco }}
          />
        ))}

        {unico && !unico.locked ? (
          <g style={{ color: cor.traco }}>
            <polygon
              ref={anel}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.7}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            <line
              ref={haste}
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            />
            <circle
              ref={ponta}
              r={6}
              data-gizmo-esguelha=""
              fill="currentColor"
              stroke="white"
              strokeWidth={1.5}
              className="cursor-grab"
              style={{ pointerEvents: "all" }}
              onPointerDown={girar}
            >
              <title>{t.esguelha.paraOndeOlha}</title>
            </circle>
            <rect
              ref={alca}
              width={ALCA_PX}
              height={ALCA_PX}
              rx={1.5}
              data-gizmo-esguelha=""
              fill="white"
              stroke="currentColor"
              strokeWidth={1.5}
              className="cursor-nesw-resize"
              style={{ pointerEvents: "all" }}
              onPointerDown={redimensionar}
            >
              <title>{t.esguelha.tamanho}</title>
            </rect>
          </g>
        ) : null}
      </svg>

      <div
        ref={barra}
        data-gizmo-esguelha=""
        className="absolute top-0 left-0 flex items-center gap-1"
      >
        {unico && !unico.locked ? (
          <Botao
            rotulo={t.esguelha.espelhar}
            classe={cor.botao}
            aoApertar={() => flipSelection("x")}
          >
            <FlipHorizontal className="size-3" />
          </Botao>
        ) : null}
        {livres.length > 0 ? (
          <Botao
            rotulo={deitados ? t.esguelha.levantar : t.esguelha.deitar}
            classe={cor.botao}
            aoApertar={alternarDeitado}
          >
            {deitados ? (
              <PersonStanding className="size-3" />
            ) : (
              <BedSingle className="size-3" />
            )}
          </Botao>
        ) : null}
        {emPe.length > 0 ? (
          <Botao
            rotulo={
              espelhamPeloOlhar
                ? t.esguelha.pararDeEspelharPeloOlhar
                : t.esguelha.espelharPeloOlhar
            }
            // Ligado com o anel claro em volta: é um interruptor, e não uma
            // ação, e o estado tem de se ler sem passar o mouse.
            classe={cn(
              cor.botao,
              espelhamPeloOlhar ? "ring-2 ring-white" : "opacity-60",
            )}
            aoApertar={alternarEspelharPeloOlhar}
          >
            <ArrowLeftRight className="size-3" />
          </Botao>
        ) : null}
        {personagemId ? (
          <Botao
            rotulo={t.esguelha.abrirFicha}
            classe={cor.botao}
            aoApertar={() => abrirJanela({ tipo: "personagem", personagemId })}
          >
            <Drama className="size-3" />
          </Botao>
        ) : null}
        <Botao
          rotulo={travada ? t.esguelha.destravar : t.esguelha.travar}
          classe={travada ? "bg-amber-500 text-neutral-950" : cor.botao}
          aoApertar={toggleSelectionLock}
        >
          {travada ? (
            <Lock className="size-3" />
          ) : (
            <LockOpen className="size-3" />
          )}
        </Botao>
        <Botao
          rotulo={t.esguelha.excluir}
          classe="bg-red-600 text-white"
          aoApertar={() => removeSelection()}
        >
          <Trash2 className="size-3" />
        </Botao>
      </div>
    </div>
  );
}

/**
 * Um botão da barra, no tamanho e no gesto dos do 2D: no `pointerdown`, para o
 * clique não virar arraste de câmera nem desmarcar a peça.
 */
function Botao({
  rotulo,
  classe,
  aoApertar,
  children,
}: {
  rotulo: string;
  classe: string;
  aoApertar: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={rotulo}
            className={cn(
              "pointer-events-auto grid size-5 shrink-0 touch-none place-items-center rounded-full",
              classe,
            )}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              aoApertar();
            }}
          >
            {children}
          </button>
        }
      />
      <TooltipContent>{rotulo}</TooltipContent>
    </Tooltip>
  );
}
