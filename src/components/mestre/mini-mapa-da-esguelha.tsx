"use client";

import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ChevronDown, ChevronUp, Map as IconeDoMapa } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { caberEm } from "@/lib/geometry/caber";
import {
  pegadaDoTripe,
  tripeDaOrbital,
  type CameraOrbital,
  type Tela,
} from "@/lib/geometry/camera-orbital";
import { useCameraLockStore } from "@/lib/store/use-camera-lock-store";
import { useEsguelhaStore } from "@/lib/store/use-esguelha-store";
import {
  moverTripeNoGesto,
  terminarGestoDoTripe,
} from "@/lib/store/use-gesto-store";
import { cn } from "@/lib/utils";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type CanvasItem,
  type CameraTripe,
  type Tripe,
} from "@/types/scene";

/** O teto do minimapa na tela: ele cabe nesta caixa, na proporção do que mostra. */
const LARGURA = 260;
const ALTURA_MAX = 220;
/** A folga em volta de um tripé fora do plano, em unidades de cena. */
const FOLGA = 60;

/**
 * O pedaço da cena que o minimapa mostra: o plano inteiro, e mais o que for
 * preciso para caberem os tripés que estão fora dele.
 *
 * Um tripé posto atrás da borda do mapa olhando para dentro é o caso comum --
 * é assim que nasce o "nova câmera daqui" de um olhar inclinado --, e um
 * minimapa só do plano o cortaria justo quando o mestre quer saber onde ele
 * está.
 */
type Enquadre = { x: number; y: number; escala: number; largura: number; altura: number };

function enquadrar(tripes: CameraTripe[]): Enquadre {
  let minX = 0;
  let minY = 0;
  let maxX = SCENE_WIDTH;
  let maxY = SCENE_HEIGHT;
  for (const tripe of tripes) {
    minX = Math.min(minX, tripe.x - FOLGA);
    minY = Math.min(minY, tripe.y - FOLGA);
    maxX = Math.max(maxX, tripe.x + FOLGA);
    maxY = Math.max(maxY, tripe.y + FOLGA);
  }
  const escala = Math.min(LARGURA / (maxX - minX), ALTURA_MAX / (maxY - minY));

  return {
    x: minX,
    y: minY,
    escala,
    largura: (maxX - minX) * escala,
    altura: (maxY - minY) * escala,
  };
}

/**
 * O minimapa do 2.5D: a cena vista de cima, pequena, num canto da tela.
 *
 * Referência e não desenho: de esguelha o mestre perde a noção de onde está
 * no plano -- girou, aproximou, e o que era a porta da igreja virou uma parede
 * qualquer. O minimapa responde isso de relance: o mapa, as figuras no lugar
 * delas e os tripés com o que cada um vê.
 *
 * Por isso ele é LEVE de propósito: sem luz, sem névoa, sem animação, e com a
 * miniatura de cada arquivo. Ele redesenha quando a CENA muda -- uma figura
 * andou, um tripé foi girado -- e nunca a cada quadro da navegação do mestre,
 * que não passa por aqui.
 *
 * Uma janela dentro da tela do 2.5D, que se arrasta pela barra e se recolhe.
 * Fora da área da mesa, como o painel do tripé: o clique e a roda sobre ela
 * não andam com a câmera.
 */
export function MiniMapaDaEsguelha({
  sceneId,
  mapaId,
  itens,
  tripes,
  selecionadaId,
  noArId,
  olhar,
}: {
  sceneId: string;
  mapaId: string | undefined;
  itens: CanvasItem[];
  tripes: CameraTripe[];
  selecionadaId: string | null;
  noArId: string | undefined;
  /** O olhar do mestre agora, para o marcador de onde ele está. */
  olhar: {
    assinar: (aviso: () => void) => () => void;
    instante: () => { camera: CameraOrbital; tela: Tela } | null;
  };
}) {
  const janela = useEsguelhaStore((state) => state.miniMapa);
  const mover = useEsguelhaStore((state) => state.moverMiniMapa);
  const alternar = useEsguelhaStore((state) => state.alternarMiniMapa);
  const selecionar = useCameraLockStore((state) => state.selecionar);
  const raiz = useRef<HTMLDivElement | null>(null);
  const area = useRef<HTMLDivElement | null>(null);
  const mestre = useRef<SVGGElement | null>(null);

  /**
   * O enquadre parado enquanto um tripé é arrastado: ele cresce para caber os
   * tripés, e recalcular a cada quadro do arrasto andaria com o mapa embaixo
   * da mão.
   */
  const [enquadreFixo, setEnquadreFixo] = useState<Enquadre | null>(null);
  const enquadre = enquadreFixo ?? enquadrar(tripes);
  const [vista, setVista] = useState<Vista>(VISTA_INTEIRA);
  const escala = enquadre.escala * vista.zoom;
  const naJanela = (x: number, y: number) => ({
    x: (x - enquadre.x) * escala + vista.x,
    y: (y - enquadre.y) * escala + vista.y,
  });

  /**
   * A roda amplia no cursor, de uma a oito vezes. Nativa e não passiva: é o
   * único jeito de a roda não rolar o que estiver por baixo.
   */
  const { largura: larguraVista, altura: alturaVista } = enquadre;
  useEffect(() => {
    const elemento = area.current;
    if (!elemento) return;
    const largura = larguraVista;
    const altura = alturaVista;
    function rodou(evento: WheelEvent) {
      evento.preventDefault();
      const caixa = elemento!.getBoundingClientRect();
      const fator = Math.exp(-evento.deltaY * RODA_POR_PIXEL);
      setVista((atual) =>
        ampliarNo(
          atual,
          evento.clientX - caixa.left,
          evento.clientY - caixa.top,
          fator,
          largura,
          altura,
        ),
      );
    }
    elemento.addEventListener("wheel", rodou, { passive: false });
    return () => elemento.removeEventListener("wheel", rodou);
  }, [janela.aberto, larguraVista, alturaVista]);

  /**
   * Onde o mestre está: o olho dele, o bico para onde olha e a pegada do que
   * vê. Escrito a cada aviso da câmera, como o gizmo do tripé -- o minimapa
   * não redesenha a cada quadro da navegação.
   */
  useLayoutEffect(() => {
    const grupo = mestre.current;
    if (!grupo) return;
    function escrever() {
      const agora = olhar.instante();
      if (!agora || !grupo) return;
      const olho = tripeDaOrbital(agora.camera, agora.tela);
      // Preso na borda quando o olho sai do enquadre -- e ele sai sempre que o
      // mestre olha de esguelha, porque o olho fica ATRÁS do que ele vê. Na
      // borda, o bico continua dizendo para onde ele olha.
      const solto = naJanela(olho.x, olho.y);
      const centro = {
        x: Math.min(larguraVista - BORDA_DO_MESTRE, Math.max(BORDA_DO_MESTRE, solto.x)),
        y: Math.min(alturaVista - BORDA_DO_MESTRE, Math.max(BORDA_DO_MESTRE, solto.y)),
      };
      const giro = (olho.giro * Math.PI) / 180;
      const frente = { x: -Math.sin(giro), y: -Math.cos(giro) };
      const lado = { x: -frente.y, y: frente.x };
      const pegada = pegadaDoTripe(
        olho,
        agora.tela.largura / agora.tela.altura,
      );

      const [area, bico, ponto] = grupo.children;
      if (pegada) {
        area?.removeAttribute("visibility");
        area?.setAttribute(
          "points",
          pegada
            .map((canto) => {
              const naTela = naJanela(canto.x, canto.y);
              return `${naTela.x},${naTela.y}`;
            })
            .join(" "),
        );
      } else {
        area?.setAttribute("visibility", "hidden");
      }
      bico?.setAttribute(
        "points",
        [
          `${centro.x + frente.x * 10},${centro.y + frente.y * 10}`,
          `${centro.x + lado.x * 5},${centro.y + lado.y * 5}`,
          `${centro.x - lado.x * 5},${centro.y - lado.y * 5}`,
        ].join(" "),
      );
      ponto?.setAttribute("cx", `${centro.x}`);
      ponto?.setAttribute("cy", `${centro.y}`);
    }
    escrever();
    return olhar.assinar(escrever);
  });

  /** Arrasta a janela pela barra, presa dentro do palco. */
  function arrastar(evento: ReactPointerEvent<HTMLDivElement>) {
    if (evento.button !== 0) return;
    const elemento = raiz.current;
    const palco = elemento?.offsetParent as HTMLElement | null;
    if (!elemento || !palco) return;
    evento.preventDefault();

    const inicio = { x: evento.clientX, y: evento.clientY };
    const de = { x: janela.x, y: janela.y };
    const limite = {
      x: palco.clientWidth - elemento.offsetWidth,
      y: palco.clientHeight - elemento.offsetHeight,
    };

    function andou(nativo: PointerEvent) {
      mover({
        x: Math.min(limite.x, Math.max(0, de.x + nativo.clientX - inicio.x)),
        y: Math.min(limite.y, Math.max(0, de.y + nativo.clientY - inicio.y)),
      });
    }
    function soltou() {
      window.removeEventListener("pointermove", andou);
      window.removeEventListener("pointerup", soltou);
    }
    window.addEventListener("pointermove", andou);
    window.addEventListener("pointerup", soltou);
  }

  /** Ampliado, arrastar o fundo anda pelo mapa. */
  function arrastarVista(evento: ReactPointerEvent<HTMLDivElement>) {
    if (evento.button !== 0 || vista.zoom <= 1) return;
    evento.preventDefault();
    const inicio = { x: evento.clientX, y: evento.clientY };
    const de = vista;
    const { largura, altura } = enquadre;

    function andou(nativo: PointerEvent) {
      setVista(
        prenderVista(
          {
            zoom: de.zoom,
            x: de.x + nativo.clientX - inicio.x,
            y: de.y + nativo.clientY - inicio.y,
          },
          largura,
          altura,
        ),
      );
    }
    function soltou() {
      window.removeEventListener("pointermove", andou);
      window.removeEventListener("pointerup", soltou);
    }
    window.addEventListener("pointermove", andou);
    window.addEventListener("pointerup", soltou);
  }

  /**
   * Arrastar um tripé pelo minimapa: só onde ele está, no chão. Altura, giro e
   * o resto ficam -- isso é com o gizmo e o painel. O mesmo gesto do gizmo: por
   * quadro só o gesto, o board ao soltar.
   */
  function arrastarTripe(
    evento: ReactPointerEvent<SVGGElement>,
    tripe: CameraTripe,
  ) {
    if (evento.button !== 0) return;
    evento.preventDefault();
    evento.stopPropagation();
    selecionar(tripe.id);

    const caixa = area.current?.getBoundingClientRect();
    if (!caixa) return;
    const congelado = enquadre;
    const esc = congelado.escala * vista.zoom;
    const visto = vista;
    const paraCena = (clientX: number, clientY: number) => ({
      x: (clientX - caixa.left - visto.x) / esc + congelado.x,
      y: (clientY - caixa.top - visto.y) / esc + congelado.y,
    });
    setEnquadreFixo(congelado);

    const inicio = paraCena(evento.clientX, evento.clientY);
    const olho: Tripe = {
      x: tripe.x,
      y: tripe.y,
      altura: tripe.altura,
      giro: tripe.giro,
      inclinacao: tripe.inclinacao,
      rolagem: tripe.rolagem,
      lente: tripe.lente,
    };

    function andou(nativo: PointerEvent) {
      const aqui = paraCena(nativo.clientX, nativo.clientY);
      moverTripeNoGesto(sceneId, tripe.id, {
        ...olho,
        x: tripe.x + aqui.x - inicio.x,
        y: tripe.y + aqui.y - inicio.y,
      });
    }
    function soltou() {
      window.removeEventListener("pointermove", andou);
      window.removeEventListener("pointerup", soltou);
      window.removeEventListener("pointercancel", soltou);
      terminarGestoDoTripe();
      setEnquadreFixo(null);
    }
    window.addEventListener("pointermove", andou);
    window.addEventListener("pointerup", soltou);
    window.addEventListener("pointercancel", soltou);
  }

  const plano = naJanela(0, 0);

  return (
    <div
      ref={raiz}
      className="bg-background/90 pointer-events-auto absolute overflow-hidden rounded-lg border shadow-lg backdrop-blur"
      style={{ left: janela.x, top: janela.y, width: enquadre.largura + 2 }}
    >
      <div
        className="flex h-7 cursor-move items-center gap-1.5 border-b px-2 text-xs select-none"
        onPointerDown={arrastar}
      >
        <IconeDoMapa className="text-muted-foreground size-3.5" />
        <span className="flex-1 font-medium">Minimapa</span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-5"
          aria-label={janela.aberto ? "Recolher o minimapa" : "Abrir o minimapa"}
          onPointerDown={(evento) => evento.stopPropagation()}
          onClick={alternar}
        >
          {janela.aberto ? <ChevronUp /> : <ChevronDown />}
        </Button>
      </div>

      {janela.aberto ? (
        <div
          ref={area}
          className={cn(
            "relative overflow-hidden bg-black",
            vista.zoom > 1 && "cursor-grab active:cursor-grabbing",
          )}
          style={{ width: enquadre.largura, height: enquadre.altura }}
          title="Roda: aproximar. Duplo clique: o mapa todo."
          onPointerDown={arrastarVista}
          onDoubleClick={() => setVista(VISTA_INTEIRA)}
        >
          {/* O plano, no lugar dele dentro do enquadre: fora dele é o vazio
              em volta da mesa, onde os tripés de fora ficam. */}
          <div
            className="absolute overflow-hidden bg-neutral-900"
            style={{
              left: plano.x,
              top: plano.y,
              width: SCENE_WIDTH * escala,
              height: SCENE_HEIGHT * escala,
            }}
          >
            <MapaDeCima
              assetId={mapaId}
              largura={SCENE_WIDTH * escala}
              altura={SCENE_HEIGHT * escala}
            />

            {itens.map((item) => (
              <ItemDeCima key={item.id} item={item} escala={escala} />
            ))}
          </div>

          <svg
            className="pointer-events-none absolute inset-0"
            width={enquadre.largura}
            height={enquadre.altura}
          >
            {tripes.map((tripe) => (
              <TripeDeCima
                key={tripe.id}
                tripe={tripe}
                naJanela={naJanela}
                cor={
                  tripe.id === noArId
                    ? "#f87171"
                    : tripe.id === selecionadaId
                      ? "#facc15"
                      : "rgba(255,255,255,0.85)"
                }
                onPointerDown={(evento) => arrastarTripe(evento, tripe)}
              />
            ))}

            {/* O mestre: azul, como a mão dele no resto do app. Os filhos na
                ordem que o efeito escreve -- pegada, bico, ponto. */}
            <g ref={mestre} style={{ color: "#38bdf8" }}>
              <polygon
                fill="currentColor"
                fillOpacity={0.12}
                stroke="currentColor"
                strokeOpacity={0.8}
                strokeWidth={1}
                strokeDasharray="3 2"
              />
              <polygon fill="currentColor" />
              <circle r={3.5} fill="#0c4a6e" stroke="white" strokeWidth={1.5}>
                <title>Você está aqui</title>
              </circle>
            </g>
          </svg>
        </div>
      ) : null}
    </div>
  );
}

/** A vista do minimapa: quanto ampliou, e onde o canto do conteúdo está. */
type Vista = { zoom: number; x: number; y: number };

const VISTA_INTEIRA: Vista = { zoom: 1, x: 0, y: 0 };
/** O marcador do mestre fica a esta distância da borda, em pixels. */
const BORDA_DO_MESTRE = 7;
const ZOOM_MAXIMO = 8;
/** Quanto a roda amplia por pixel de rolagem. */
const RODA_POR_PIXEL = 0.0015;

/** A vista sem deixar o conteúdo descolar das bordas da janela. */
function prenderVista(vista: Vista, largura: number, altura: number): Vista {
  const zoom = Math.min(ZOOM_MAXIMO, Math.max(1, vista.zoom));
  return {
    zoom,
    x: Math.min(0, Math.max(largura - largura * zoom, vista.x)),
    y: Math.min(0, Math.max(altura - altura * zoom, vista.y)),
  };
}

/** Amplia `fator` vezes com o ponto da janela sob o cursor parado. */
function ampliarNo(
  vista: Vista,
  x: number,
  y: number,
  fator: number,
  largura: number,
  altura: number,
): Vista {
  const zoom = Math.min(ZOOM_MAXIMO, Math.max(1, vista.zoom * fator));
  const k = zoom / vista.zoom;
  return prenderVista(
    { zoom, x: x - (x - vista.x) * k, y: y - (y - vista.y) * k },
    largura,
    altura,
  );
}

/**
 * O mapa, na miniatura, encaixado como o palco encaixa: um mapa que não é
 * 16:9 fica com a tarja dele, e as figuras caem no lugar certo por cima.
 */
const MapaDeCima = memo(function MapaDeCima({
  assetId,
  largura,
  altura,
}: {
  assetId: string | undefined;
  largura: number;
  altura: number;
}) {
  const url = useAssetUrl(assetId, "mini");
  const [natural, setNatural] = useState<{
    largura: number;
    altura: number;
  } | null>(null);

  if (!url) return null;
  const lugar = natural
    ? caberEm(natural, { width: largura, height: altura })
    : { x: 0, y: 0, width: largura, height: altura };

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      draggable={false}
      className="absolute select-none"
      style={{
        left: lugar.x,
        top: lugar.y,
        width: lugar.width,
        height: lugar.height,
      }}
      onLoad={(evento) =>
        setNatural({
          largura: evento.currentTarget.naturalWidth,
          altura: evento.currentTarget.naturalHeight,
        })
      }
    />
  );
});

/**
 * Uma figura vista de cima, no lugar, no tamanho e no giro dela. Quem é
 * personagem ganha o anel: é por quem o mestre procura primeiro.
 */
const ItemDeCima = memo(function ItemDeCima({
  item,
  escala,
}: {
  item: CanvasItem;
  escala: number;
}) {
  const url = useAssetUrl(item.assetId, "mini");
  if (!url) return null;

  const espelho = `scale(${item.flipX ? -1 : 1}, ${item.flipY ? -1 : 1})`;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      draggable={false}
      className={
        item.personagemId
          ? "absolute rounded-sm outline outline-1 outline-sky-300 select-none"
          : "absolute select-none"
      }
      style={{
        left: item.x * escala,
        top: item.y * escala,
        width: Math.max(item.width * escala, 2),
        height: Math.max(item.height * escala, 2),
        transform: `rotate(${item.rotation}deg) ${espelho}`,
      }}
    />
  );
});

/**
 * Um tripé visto de cima: a pegada do que ele vê no chão e o ponto onde ele
 * está, com um bico para o lado em que olha.
 *
 * A direção no plano é `-(sen giro, cos giro)` -- a mesma conta do olho do
 * tripé, vista de cima. Olhando o céu a pegada não fecha, e sobra o bico.
 */
function TripeDeCima({
  tripe,
  naJanela,
  cor,
  onPointerDown,
}: {
  tripe: CameraTripe;
  naJanela: (x: number, y: number) => { x: number; y: number };
  cor: string;
  onPointerDown: (evento: ReactPointerEvent<SVGGElement>) => void;
}) {
  const pegada = pegadaDoTripe(tripe);
  const { x: cx, y: cy } = naJanela(tripe.x, tripe.y);
  const giro = (tripe.giro * Math.PI) / 180;
  const frente = { x: -Math.sin(giro), y: -Math.cos(giro) };
  const lado = { x: -frente.y, y: frente.x };

  return (
    <g style={{ color: cor }}>
      {pegada ? (
        <polygon
          points={pegada
            .map((ponto) => {
              const naTela = naJanela(ponto.x, ponto.y);
              return `${naTela.x},${naTela.y}`;
            })
            .join(" ")}
          fill="currentColor"
          fillOpacity={0.15}
          stroke="currentColor"
          strokeOpacity={0.7}
          strokeWidth={1}
        />
      ) : null}
      <polygon
        points={[
          `${cx + frente.x * 9},${cy + frente.y * 9}`,
          `${cx + lado.x * 4},${cy + lado.y * 4}`,
          `${cx - lado.x * 4},${cy - lado.y * 4}`,
        ].join(" ")}
        fill="currentColor"
      />
      <circle cx={cx} cy={cy} r={3} fill="#18181b" stroke="currentColor" strokeWidth={1.5} />
      {/* O alvo do arrasto, maior que o ponto: três pixels não se pegam. */}
      <circle
        cx={cx}
        cy={cy}
        r={8}
        fill="transparent"
        className="cursor-move"
        style={{ pointerEvents: "all" }}
        onPointerDown={onPointerDown}
      >
        <title>{`${tripe.nome}: arraste para mover`}</title>
      </circle>
    </g>
  );
}
