"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { CircleDot, Lock, Move, Radio } from "lucide-react";

import {
  emPixelDeTela,
  useSceneScale,
} from "@/components/playground/scene-stage";
import { TransformHandles } from "@/components/playground/transform-handles";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import { CORNER_HANDLES } from "@/lib/geometry/transform";
import {
  clampViewport,
  viewportZoom,
  zoomViewportCentered,
} from "@/lib/geometry/viewport";
import {
  alternarTransmissao,
  ZOOM_CAMERA_STEP,
} from "@/lib/mestre/camera-actions";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import type { CameraSalva, Viewport } from "@/types/scene";

/** Acima do gizmo de seleção: a câmera é a camada de enquadramento. */
const FRAME_Z = 12_000;
const HANDLES_Z = 12_500;
/** Abaixo da moldura e de todo item: a máscara só escurece, nunca cobre. */
const MASCARA_Z = 11_000;

// Tamanhos em pixels de tela: divididos pelo scale, ficam iguais em todo zoom.
/** Espessura da faixa de arraste nas bordas. */
const GRIP_PX = 14;
const BORDA_PX = 1.5;
const HALO_PX = 1.5;
/** Comprimento e espessura dos cantos em L. */
const CANTO_PX = 22;
const CANTO_TRACO_PX = 3;
/** A alça lateral e o botão de transmitir abaixo dela. */
const ALCA_PX = 30;
const ALCA_GAP_PX = 8;
/**
 * Larguras da moldura NA TELA abaixo das quais o rótulo encolhe.
 *
 * O rótulo é medido em pixel de tela e a moldura em unidades de cena: afastando
 * o palco, ela encolhe e ele não, e a 20% o texto cobria a câmera inteira. Acima
 * de `ROTULO_CHEIO_PX` cabe tudo; entre os dois, só o nome; abaixo de
 * `ROTULO_MINIMO_PX`, só o REC quando ela está no ar, e nada quando não está.
 */
const ROTULO_CHEIO_PX = 220;
const ROTULO_MINIMO_PX = 110;

/** Quanto do fora fica escuro. Clareia enquanto o mestre arrasta. */
const MASCARA_PARADA = 0.35;
const MASCARA_ARRASTANDO = 0.15;

type CameraFrameProps = {
  /** A câmera SELECIONADA: a que o mestre está editando. */
  camera: CameraSalva;
  /** Ela está no ar? Muda o rótulo e o botão de transmitir. */
  transmitindo: boolean;
  /** Ausente = moldura só informativa, sem arraste nem alças. */
  onChange?: (viewport: Viewport) => void;
  /** V segurado: a câmera está seguindo o mouse. A moldura se acende. */
  cinegrafista?: boolean;
};

/**
 * O recorte que a mesa está vendo, manipulável direto no palco.
 *
 * Sem esta moldura, o Mestre ampliado num canto do mapa não tem como saber
 * que a TV continua enquadrando outra região — e ele acabaria apontando para
 * algo que ninguém está olhando.
 *
 * O interior é atravessável pelo clique de propósito: a região enquadrada é
 * justamente onde estão os itens que o mestre mexe, e uma moldura opaca ao
 * ponteiro tornaria todos eles inalcançáveis. O que agarra são as bordas, o
 * rótulo, a alça lateral e os quatro cantos.
 *
 * O que está FORA da moldura escurece. Era uma linha tracejada fina, e em mapa
 * escuro ela sumia: o mestre não distinguia "a mesa vê isto" de "a mesa vê
 * tudo". Com o fora escuro a moldura vira a janela iluminada, e a pergunta
 * "o que a TV está mostrando?" se responde de relance. São quatro retângulos e
 * não um `clip-path`: mais barato de compor, e a webview não tem de recalcular
 * um polígono por quadro de arrasto.
 */
export function CameraFrame({
  camera: selecionada,
  transmitindo,
  onChange,
  cinegrafista = false,
}: CameraFrameProps) {
  // O recorte, com o nome curto que o resto do arquivo sempre usou.
  const camera = selecionada.viewport;
  const presaEm = selecionada.alvoIds?.length ?? 0;
  const { scale } = useSceneScale();
  const startDrag = useSceneDrag();
  const [arrastando, setArrastando] = useState(false);

  // Os mesmos limites do palco, e não o plano: o mestre pode largar coisa fora
  // do plano, e uma moldura que não alcança o que ele largou seria um lugar
  // onde dá para pôr e não dá para mostrar.
  //
  // Lido aqui e não recebido do `MestreStage`: a caixa muda a cada quadro em
  // que o mestre arrasta um item para fora, e assinar isso lá em cima
  // redesenharia o palco inteiro por quadro. Só esta moldura precisa saber.
  // Quem renderiza a moldura é o Mestre, e só ele -- por isso ler o store dele
  // aqui não amarra nenhuma outra visão.
  const conteudo = useViewportStore((state) => state.conteudo);
  /** Pixels de tela convertidos para unidades de cena. */
  const px = (value: number) => value / scale;

  // A câmera mais recente, para o arrasto ler: durante o gesto a roda muda a
  // largura dela, e um retrato tirado no pointerdown devolveria a largura
  // velha no próximo movimento, desfazendo o zoom.
  const cameraAtual = useRef(camera);
  useEffect(() => {
    cameraAtual.current = camera;
  }, [camera]);

  function startMove(event: ReactPointerEvent) {
    // O mesmo filtro do `useSceneDrag`: se ele recusar o gesto, o `onEnd` nunca
    // vem, e o ouvinte da roda abaixo ficaria pendurado na janela.
    if (!onChange || event.button !== 0 || scale === 0) return;

    // Incremental e não a partir de um retrato, ao contrário do resto do palco:
    // aqui o zoom da roda pode mexer na câmera NO MEIO do gesto, e somar o
    // delta acumulado sobre a origem apagaria o que a roda fez. A câmera não é
    // arredondada, então somar incrementos não acumula erro.
    let anterior = { x: 0, y: 0 };

    /**
     * A roda, enquanto a alça está segurada: zoom da câmera, no centro dela.
     *
     * Só com o botão apertado, e por isso não é o "roda sobre a alça dava zoom"
     * que saiu: rolar por cima do rótulo sem segurar continua sendo o zoom do
     * palco. Na captura e com `stopPropagation`, como o arrasto de token, porque
     * o `SceneStage` também escuta a roda e um notch faria as duas coisas.
     */
    const aoRodar = (native: WheelEvent) => {
      native.preventDefault();
      native.stopPropagation();

      onChange(
        zoomViewportCentered(
          cameraAtual.current,
          native.deltaY < 0 ? ZOOM_CAMERA_STEP : 1 / ZOOM_CAMERA_STEP,
          conteudo,
        ),
      );
    };
    window.addEventListener("wheel", aoRodar, {
      capture: true,
      passive: false,
    });

    setArrastando(true);
    startDrag(event, {
      onMove: (delta) => {
        const atual = cameraAtual.current;

        onChange(
          clampViewport(
            {
              ...atual,
              x: atual.x + (delta.x - anterior.x),
              y: atual.y + (delta.y - anterior.y),
            },
            conteudo,
          ),
        );
        anterior = delta;
      },
      onEnd: () => {
        window.removeEventListener("wheel", aoRodar, true);
        setArrastando(false);
      },
    });
  }

  const grip = px(GRIP_PX);

  /** Quanto a moldura ocupa na tela, em px. É o que decide o tamanho do rótulo. */
  const larguraNaTela = camera.width * scale;
  const rotulo: "cheio" | "nome" | "rec" | "nada" =
    larguraNaTela >= ROTULO_CHEIO_PX
      ? "cheio"
      : larguraNaTela >= ROTULO_MINIMO_PX
        ? "nome"
        : transmitindo
          ? "rec"
          : "nada";

  const gripClass = onChange
    ? "pointer-events-auto absolute touch-none"
    : "pointer-events-none absolute";

  // Até o CONTEÚDO, e nunca a folga em volta dele. A máscara cobria a área
  // navegável inteira -- três planos por três, com `left/top` negativos -- e
  // isso é a armadilha número um do WebKitGTK (ver `debug-do-palco` §3): um
  // filho que transborda o plano infla a camada composta, o motor pinta o
  // mapa deslocado e, ampliado, preto. Foi o "bug da câmera no zoom" voltando
  // pela terceira porta. O que fica fora do conteúdo já é preto por natureza;
  // não há nada ali a escurecer.
  const fora = conteudo;
  const opacidadeMascara =
    arrastando || cinegrafista ? MASCARA_ARRASTANDO : MASCARA_PARADA;
  const mascara = [
    // Acima, abaixo, esquerda, direita da moldura.
    { left: fora.minX, top: fora.minY, width: fora.maxX - fora.minX, height: camera.y - fora.minY },
    { left: fora.minX, top: camera.y + camera.height, width: fora.maxX - fora.minX, height: fora.maxY - camera.y - camera.height },
    { left: fora.minX, top: camera.y, width: camera.x - fora.minX, height: camera.height },
    { left: camera.x + camera.width, top: camera.y, width: fora.maxX - camera.x - camera.width, height: camera.height },
  ];

  const canto = px(CANTO_PX);
  const traco = px(CANTO_TRACO_PX);
  const cantos = [
    { left: -traco, top: -traco, borderLeftWidth: traco, borderTopWidth: traco },
    { right: -traco, top: -traco, borderRightWidth: traco, borderTopWidth: traco },
    { right: -traco, bottom: -traco, borderRightWidth: traco, borderBottomWidth: traco },
    { left: -traco, bottom: -traco, borderLeftWidth: traco, borderBottomWidth: traco },
  ];

  const corBorda =
    arrastando || cinegrafista ? "border-primary" : "border-primary/80";

  return (
    <>
      {mascara.map((caixa, index) =>
        caixa.width > 0 && caixa.height > 0 ? (
          <div
            key={index}
            className="pointer-events-none absolute bg-black"
            style={{ ...caixa, opacity: opacidadeMascara, zIndex: MASCARA_Z }}
          />
        ) : null,
      )}

      <div
        className={`${corBorda} pointer-events-none absolute border-solid`}
        style={{
          left: camera.x,
          top: camera.y,
          width: camera.width,
          height: camera.height,
          borderWidth: px(BORDA_PX),
          // Halo escuro por fora: a borda clara some em mapa claro, e o halo
          // some em mapa escuro. Juntos, um dos dois sempre aparece.
          boxShadow: `0 0 0 ${px(HALO_PX)}px rgba(0,0,0,0.6), inset 0 0 0 ${px(HALO_PX)}px rgba(0,0,0,0.35)`,
          zIndex: FRAME_Z,
        }}
      >
        {/* Cantos em L, como o visor de uma câmera: dizem "enquadramento"
            sem precisar de texto, e continuam visíveis quando a borda fina
            se perde no mapa. */}
        {cantos.map((posicao, index) => (
          <span
            key={index}
            className="border-primary pointer-events-none absolute border-solid"
            style={{ width: canto, height: canto, borderWidth: 0, ...posicao }}
          />
        ))}

        {/* Faixas nas bordas: a única parte da moldura que responde ao
            ponteiro, além do rótulo, da alça e dos cantos. */}
        {onChange
          ? (
              [
                { left: 0, top: 0, width: "100%", height: grip },
                { left: 0, bottom: 0, width: "100%", height: grip },
                { left: 0, top: 0, width: grip, height: "100%" },
                { right: 0, top: 0, width: grip, height: "100%" },
              ] as const
            ).map((position, index) => (
              <span
                key={index}
                className={gripClass}
                style={{ ...position, cursor: "move" }}
                onPointerDown={startMove}
              />
            ))
          : null}

        {rotulo === "nada" ? null : (
        <span
          className={`${transmitindo ? "bg-primary/85 text-primary-foreground" : "bg-background/90 text-foreground border"} flex max-w-full items-center font-medium tabular-nums ${gripClass}`}
          // Conteúdo em PIXEL DE TELA via `emPixelDeTela`, e não dividido
          // pela escala: sob `zoom` o traço do ícone calculado abaixo de um
          // pixel sobe para um pixel antes de multiplicar, e o REC saía três
          // vezes mais grosso a 500%. Ver a nota em `emPixelDeTela`.
          style={{
            left: 0,
            top: 0,
            fontSize: 12,
            gap: 6,
            padding: "2px 6px",
            cursor: onChange ? "move" : undefined,
            // Em pixel de tela, como o resto do rótulo: a moldura tem
            // `larguraNaTela` px, e o texto não passa dela.
            maxWidth: larguraNaTela,
            ...emPixelDeTela(scale),
          }}
          onPointerDown={startMove}
        >
          {/* O REC na frente do nome é o único sinal de que esta é a que a
              mesa vê. Sem ele, a selecionada e a transmitida se confundem. */}
          {transmitindo ? (
            <CircleDot className="text-red-400" style={{ width: 11, height: 11 }} />
          ) : null}
          {rotulo === "rec" ? null : (
            <span className="truncate">{selecionada.nome}</span>
          )}
          {/* A ampliação desta câmera, na mesma régua dos 100% do palco: o
              mestre sabe se está fechado num corredor ou aberto na sala sem
              ter de olhar a TV. */}
          {rotulo === "cheio" ? (
            <span className="opacity-80">
              {Math.round(viewportZoom(camera) * 100)}%
            </span>
          ) : null}
          {rotulo === "cheio" && presaEm > 0 ? (
            <span className="flex items-center" style={{ gap: 3 }}>
              <Lock style={{ width: 11, height: 11 }} />
              {presaEm > 1 ? presaEm : null}
            </span>
          ) : null}
        </span>
        )}

        {onChange ? (
          <Alca
            transmitindo={transmitindo}
            scale={scale}
            arrastando={arrastando}
            onMove={startMove}
          />
        ) : null}
      </div>

      {onChange ? (
        <TransformHandles
          box={{ ...camera, rotation: 0 }}
          rotatable={false}
          // Só os cantos, e proporção travada por regra: um recorte fora de
          // 16:9 faria cada visão letterboxar diferente, e o enquadramento
          // deixaria de ser o que a mesa vê.
          handles={CORNER_HANDLES}
          keepAspect
          // A moldura já tem a própria borda.
          outline={false}
          // Sem arredondar: `clampViewport` re-deriva a altura da largura, e o
          // resíduo do arredondamento faria a moldura derivar meia unidade por
          // gesto, sempre para o mesmo lado.
          round={false}
          zIndex={HANDLES_Z}
          onChange={({ x, y, width, height }) =>
            onChange(
              clampViewport(
                {
                  x: x ?? camera.x,
                  y: y ?? camera.y,
                  width: width ?? camera.width,
                  height: height ?? camera.height,
                },
                conteudo,
              ),
            )
          }
        />
      ) : null}
    </>
  );
}

type AlcaProps = {
  transmitindo: boolean;
  /** A escala do palco, para `emPixelDeTela` desfazer. */
  scale: number;
  arrastando: boolean;
  onMove: (event: ReactPointerEvent) => void;
};

/**
 * A alça lateral: uma aba saliente na borda direita, meio da altura, com o
 * botão de transmitir logo abaixo. Só isso.
 *
 * Existe porque a faixa de 14px nas bordas é invisível -- o mestre descobria
 * que a moldura arrasta por acidente, ou não descobria. A aba é o lugar óbvio
 * de pegar, com o ícone que diz o que ela faz.
 *
 * Teve um slider de zoom pendurado embaixo, e roda sobre a alça e o rótulo
 * dava zoom. Saíram: o slider era um alvo a mais colado no mapa, e a roda
 * mudava o tamanho da câmera quando o mestre só queria rolar por cima do
 * rótulo. Zoom da câmera é pelos cantos, por `=`/`-`, pela pílula -- e pela
 * roda enquanto a alça está SEGURADA, que é gesto e não passagem (ver
 * `startMove`).
 *
 * Fora da moldura, e não dentro: dentro ela cobriria o que a mesa está vendo,
 * que é justamente onde estão os itens que o mestre mexe.
 */
function Alca({ transmitindo, scale, arrastando, onMove }: AlcaProps) {
  const lado = ALCA_PX;
  const gap = ALCA_GAP_PX;

  const botao =
    "bg-background/90 text-foreground hover:bg-accent pointer-events-auto flex items-center justify-center border shadow";

  return (
    <div
      className="pointer-events-none absolute flex flex-col items-center"
      // A POSIÇÃO em unidade de cena, colada à borda; o CONTEÚDO em pixel de
      // tela via `emPixelDeTela`. Dividir pela escala dava a geometria certa e
      // o traço errado: sub-pixel sob `zoom` engorda. Ver a nota lá.
      style={{
        left: "100%",
        top: "50%",
        marginLeft: gap,
        transform: "translateY(-50%)",
        gap,
        ...emPixelDeTela(scale),
      }}
    >
      <span
        className={`${botao} touch-none rounded-md ${arrastando ? "bg-primary text-primary-foreground" : ""}`}
        style={{ width: lado, height: lado, cursor: "move" }}
        title="Arrastar move a câmera."
        onPointerDown={onMove}
      >
        <Move style={{ width: lado * 0.55, height: lado * 0.55 }} />
      </span>

      {/* Transmitir, colado na alça: é o toque que muda o que a mesa vê, e
          fica ao lado do gesto que prepara o que ela vai ver. Vermelho no
          ar, como o REC de qualquer câmera. */}
      <button
        type="button"
        className={`${botao} touch-none rounded-md ${transmitindo ? "bg-red-500 text-white hover:bg-red-500/90" : ""}`}
        style={{ width: lado, height: lado }}
        aria-label={transmitindo ? "Tirar do ar" : "Transmitir esta câmera"}
        title={
          transmitindo
            ? "No ar. Clique tira do ar: a mesa fica escura."
            : "Transmitir: a mesa passa a ver esta câmera."
        }
        onPointerDown={(event) => event.stopPropagation()}
        onClick={alternarTransmissao}
      >
        <Radio style={{ width: lado * 0.55, height: lado * 0.55 }} />
      </button>
    </div>
  );
}
