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
import { clampViewport, viewportZoom, zoomViewportCentered } from "@/lib/geometry/viewport";
import {
  alternarTransmissao,
  ZOOM_CAMERA_STEP,
} from "@/lib/mestre/camera-actions";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import type { CameraSalva, Viewport } from "@/types/scene";

/** Acima do gizmo de seleção: a câmera é a camada de enquadramento. */
const FRAME_Z = 12_000;
const HANDLES_Z = 12_500;
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

type CameraFrameProps = {
  /** A câmera SELECIONADA: a que o mestre está editando. */
  camera: CameraSalva;
  /** Ela está no ar? Muda o rótulo e o botão de transmitir. */
  transmitindo: boolean;
  /** Ausente = moldura só informativa, sem arraste nem alças. */
  onChange?: (viewport: Viewport) => void;
  /** A mão soltou a alça ou o canto. Quem separa gesto de documento grava aqui. */
  onGestureEnd?: () => void;
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
 * O que está FORA dela não escurece, e isso é decisão e não falta. Escureceu
 * por um tempo -- quatro tarjas pretas coladas no recorte --, e saiu por duas
 * razões.
 *
 * A primeira é que dizia errado com mais de uma câmera: esta moldura é da
 * câmera SELECIONADA e a mesa vê a que está NO AR, então quem preparava o beco
 * via o escuro acender o beco e apagar a taverna, que era o que estava indo
 * para a TV. A segunda é que o enquadramento já se lê nos cantos em L, no halo
 * da borda e no REC do rótulo: o escuro repetia, por cima de quase a tela
 * inteira, o que eles dizem na borda.
 *
 * O que ele NÃO era é caro: medido na webview, tirá-lo não devolveu um quadro
 * por segundo -- devolveu o contrário, até a moldura ganhar a camada própria
 * que as tarjas seguravam (ver o `will-change` abaixo). A conta está em
 * `scripts/perf/README.md`, e a lição é a de sempre: o palpite de onde o tempo
 * está foi errado de novo.
 */
export function CameraFrame({
  camera: selecionada,
  transmitindo,
  onChange,
  onGestureEnd,
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
    /**
     * Um commit por quadro, somando roda E arrasto.
     *
     * A roda dispara fora do `requestAnimationFrame` do `useSceneDrag`, e cada
     * notch virava um commit do board por conta própria -- dois commits no
     * mesmo quadro quando a mão anda e rola junto, cada um re-renderizando o
     * palco do mestre inteiro. Aqui os dois escrevem em `proxima` e o quadro
     * grava uma vez. O `cameraAtual` acompanha na hora, para o incremento
     * seguinte partir do que já foi pedido e não do que já foi gravado.
     */
    let proxima: Viewport | null = null;
    let quadro: number | undefined;
    const pedir = (viewport: Viewport) => {
      cameraAtual.current = viewport;
      proxima = viewport;
      if (quadro !== undefined) return;
      quadro = requestAnimationFrame(() => {
        quadro = undefined;
        if (proxima) onChange(proxima);
        proxima = null;
      });
    };
    const despejar = () => {
      if (quadro !== undefined) cancelAnimationFrame(quadro);
      quadro = undefined;
      if (proxima) onChange(proxima);
      proxima = null;
    };

    const aoRodar = (native: WheelEvent) => {
      native.preventDefault();
      native.stopPropagation();

      pedir(
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

        pedir(
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
        despejar();
        setArrastando(false);
        onGestureEnd?.();
      },
    });
  }


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

  /**
   * Os quatro cantos em L, em medida FIXA, com a ampliação do plano desfeita
   * por `transform`.
   *
   * Eram `px(CANTO_PX)` e `px(CANTO_TRACO_PX)`, que dividem pelo `scale` -- e
   * o `scale` muda a cada notch da roda. Cada canto reescrevia `width`,
   * `height`, `border-width` e o próprio deslocamento, tudo caixa, e caixa
   * marca o DOCUMENTO INTEIRO para refazer o layout. Medido na webview, o
   * campeão do zoom do palco: oito mil mudanças de layout numa corrida de oito
   * segundos, com UMA câmera na tela.
   *
   * `origem` é o ponto do L que encosta no canto da moldura, e é ele que fica
   * parado quando o `scale` encolhe o desenho. O deslocamento para fora entra
   * no `translate`, à direita do `scale`, para ser medido no espaço do
   * elemento e escalar junto -- em `scale(s) translate(t)` o translate vale
   * `t × s` na tela, que é exatamente o que a versão antiga escrevia em
   * `left`/`top`.
   */
  const desfazer = 1 / scale;
  const t = CANTO_TRACO_PX;
  const cantos = [
    {
      left: 0,
      top: 0,
      borderLeftWidth: t,
      borderTopWidth: t,
      transformOrigin: "0 0",
      transform: `scale(${desfazer}) translate(${-t}px, ${-t}px)`,
    },
    {
      right: 0,
      top: 0,
      borderRightWidth: t,
      borderTopWidth: t,
      transformOrigin: "100% 0",
      transform: `scale(${desfazer}) translate(${t}px, ${-t}px)`,
    },
    {
      right: 0,
      bottom: 0,
      borderRightWidth: t,
      borderBottomWidth: t,
      transformOrigin: "100% 100%",
      transform: `scale(${desfazer}) translate(${t}px, ${t}px)`,
    },
    {
      left: 0,
      bottom: 0,
      borderLeftWidth: t,
      borderBottomWidth: t,
      transformOrigin: "0 100%",
      transform: `scale(${desfazer}) translate(${-t}px, ${t}px)`,
    },
  ];

  const corBorda =
    arrastando || cinegrafista ? "border-primary" : "border-primary/80";

  return (
    <>
      <div
        className={`${corBorda} pointer-events-none absolute border-solid`}
        style={{
          // A POSIÇÃO por `transform`, e não por `left`/`top`: arrastar a
          // moldura mexe só nela, e mexer em caixa marca o DOCUMENTO INTEIRO
          // para refazer o layout -- colunas laterais, lista de mapas e tudo
          // o mais que estiver na tela, que não têm nada com este gesto. A
          // medida está em `scripts/perf/README.md`.
          //
          // `width` e `height` continuam sendo caixa porque a borda é borda:
          // esticada por `scale` ela engordaria junto. Elas só mudam quando o
          // mestre puxa um canto, e não quando ele arrasta.
          left: 0,
          top: 0,
          transform: `translate(${camera.x}px, ${camera.y}px)`,
          width: camera.width,
          height: camera.height,
          borderWidth: px(BORDA_PX),
          // Halo escuro por fora: a borda clara some em mapa claro, e o halo
          // some em mapa escuro. Juntos, um dos dois sempre aparece.
          boxShadow: `0 0 0 ${px(HALO_PX)}px rgba(0,0,0,0.6), inset 0 0 0 ${px(HALO_PX)}px rgba(0,0,0,0.35)`,
          // Camada própria para a moldura, que anda por `transform` a cada
          // quadro do gesto: com ela o motor RE-COMPÕE, sem ela repinta junto
          // com o mapa.
          //
          // Esta linha não existia enquanto existia a máscara escura, e foi
          // ela que cobrou a conta quando a máscara saiu: as quatro tarjas
          // tinham `will-change` e a promoção vinha de brinde. Medido na
          // webview, bancada cheia, sete câmeras, sete mapas, arrastar a
          // moldura -- com máscara 31,7 e 32,1 fps; sem máscara e sem esta
          // linha 24,2 e 26,7; sem máscara e com ela 31,4. Ver
          // `scripts/perf/README.md`.
          willChange: "transform",
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
            style={{
              width: CANTO_PX,
              height: CANTO_PX,
              borderWidth: 0,
              ...posicao,
            }}
          />
        ))}

        {/* Faixas nas bordas: a única parte da moldura que responde ao
            ponteiro, além do rótulo, da alça e dos cantos. */}
        {onChange
          ? (
              [
                // Tamanho FIXO com a ampliação desfeita por `transform`, e a
                // origem na borda em que a faixa encosta. Era `px(GRIP_PX)`,
                // que divide pelo `scale` -- e o `scale` muda a cada notch da
                // roda, então cada faixa reescrevia caixa e marcava o
                // DOCUMENTO INTEIRO para refazer o layout. Ver
                // `scripts/perf/README.md`.
                {
                  left: 0,
                  top: 0,
                  width: "100%",
                  height: GRIP_PX,
                  transformOrigin: "0 0",
                  transform: `scaleY(${1 / scale})`,
                },
                {
                  left: 0,
                  bottom: 0,
                  width: "100%",
                  height: GRIP_PX,
                  transformOrigin: "0 100%",
                  transform: `scaleY(${1 / scale})`,
                },
                {
                  left: 0,
                  top: 0,
                  width: GRIP_PX,
                  height: "100%",
                  transformOrigin: "0 0",
                  transform: `scaleX(${1 / scale})`,
                },
                {
                  right: 0,
                  top: 0,
                  width: GRIP_PX,
                  height: "100%",
                  transformOrigin: "100% 0",
                  transform: `scaleX(${1 / scale})`,
                },
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
            //
            // Medido e mantido: trocar por `100%` tira uma escrita de caixa por
            // notch da roda, e não mudou um quadro por segundo -- o custo do
            // zoom do palco não está aqui. Ver `scripts/perf/README.md`.
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
          onGestureEnd={onGestureEnd}
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
            ? "No ar. Clique tira do ar: a mesa vê o mapa inteiro."
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
