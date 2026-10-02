"use client";

import { memo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, ChevronUp, Map as IconeDoMapa } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { caberEm } from "@/lib/geometry/caber";
import { pegadaDoTripe } from "@/lib/geometry/camera-orbital";
import { useEsguelhaStore } from "@/lib/store/use-esguelha-store";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type CanvasItem,
  type CameraTripe,
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
  mapaId,
  itens,
  tripes,
  selecionadaId,
  noArId,
}: {
  mapaId: string | undefined;
  itens: CanvasItem[];
  tripes: CameraTripe[];
  selecionadaId: string | null;
  noArId: string | undefined;
}) {
  const janela = useEsguelhaStore((state) => state.miniMapa);
  const mover = useEsguelhaStore((state) => state.moverMiniMapa);
  const alternar = useEsguelhaStore((state) => state.alternarMiniMapa);
  const raiz = useRef<HTMLDivElement | null>(null);
  const enquadre = enquadrar(tripes);

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
          // O botão não arrasta a janela.
          onPointerDown={(evento) => evento.stopPropagation()}
          onClick={alternar}
        >
          {janela.aberto ? <ChevronUp /> : <ChevronDown />}
        </Button>
      </div>

      {janela.aberto ? (
        <div
          className="relative overflow-hidden bg-black"
          style={{ width: enquadre.largura, height: enquadre.altura }}
        >
          {/* O plano, no lugar dele dentro do enquadre: fora dele é o vazio
              em volta da mesa, onde os tripés de fora ficam. */}
          <div
            className="absolute overflow-hidden bg-neutral-900"
            style={{
              left: -enquadre.x * enquadre.escala,
              top: -enquadre.y * enquadre.escala,
              width: SCENE_WIDTH * enquadre.escala,
              height: SCENE_HEIGHT * enquadre.escala,
            }}
          >
            <MapaDeCima
              assetId={mapaId}
              largura={SCENE_WIDTH * enquadre.escala}
              altura={SCENE_HEIGHT * enquadre.escala}
            />

            {itens.map((item) => (
              <ItemDeCima key={item.id} item={item} escala={enquadre.escala} />
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
                enquadre={enquadre}
                cor={
                  tripe.id === noArId
                    ? "#f87171"
                    : tripe.id === selecionadaId
                      ? "#facc15"
                      : "rgba(255,255,255,0.85)"
                }
              />
            ))}
          </svg>
        </div>
      ) : null}
    </div>
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
  enquadre,
  cor,
}: {
  tripe: CameraTripe;
  enquadre: Enquadre;
  cor: string;
}) {
  const pegada = pegadaDoTripe(tripe);
  const naJanela = (x: number, y: number) => ({
    x: (x - enquadre.x) * enquadre.escala,
    y: (y - enquadre.y) * enquadre.escala,
  });
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
    </g>
  );
}
