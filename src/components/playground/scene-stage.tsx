"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { Bounds } from "@/lib/geometry/bounds";
import type { Vec } from "@/lib/geometry/transform";
import {
  FULL_VIEWPORT,
  panViewport,
  zoomViewport,
} from "@/lib/geometry/viewport";
import { cn } from "@/lib/utils";
import { SCENE_HEIGHT, SCENE_WIDTH, type Viewport } from "@/types/scene";

type SceneScale = {
  /** Fator entre pixels de tela e unidades de cena. 0 antes da primeira medida. */
  scale: number;
  /**
   * O plano amplia por `zoom` agora, e não por `transform`.
   *
   * Vale com a câmera PARADA -- ver a nota sobre os dois planos. Existe porque
   * quem desenha um controle de tamanho fixo na tela precisa desfazer a
   * ampliação, e tem de desfazê-la na MESMA forma que está valendo: `zoom`
   * contra `zoom`, `transform` contra `transform`. Compensar `transform` com
   * `zoom` dá a geometria certa parada e erra no gesto, que é quando as duas
   * formas se alternam.
   */
  ampliacaoNoLayout: boolean;
  /** Converte um ponto de `clientX/clientY` para coordenadas de cena. */
  toScene: (clientX: number, clientY: number) => Vec;
  /**
   * O recorte que está sendo mostrado, em coordenadas de cena.
   *
   * Existe para quem precisa saber ONDE a câmera está sem ler layout: o
   * `DadoLayer` dimensiona o canvas dele pela região visível, e derivar isso de
   * `getBoundingClientRect` durante o render devolve a posição do quadro
   * ANTERIOR -- o plano só recebe o `transform` novo depois. O resultado era o
   * dado um quadro atrás do mapa durante o arrasto.
   */
  viewport: Viewport;
  /**
   * Onde o CONTEÚDO da cena deve se desenhar -- mapa, tokens, retratos.
   *
   * Um nó de DOM e não um `ReactNode` na outra ponta porque quem sabe montar o
   * conteúdo é cada tela, lá no fundo da árvore, e passá-lo para cá exigiria
   * que todas elas mudassem de forma. Quem desenha nele entra por portal; a
   * árvore do React continua a mesma, e com ela os eventos e o `stopPropagation`
   * de sempre.
   *
   * `null` até o primeiro paint. Ver `PlanoDeConteudo` e o cabeçalho do
   * `SceneLayer`, onde está por que os dois planos existem.
   */
  planoDeConteudo: HTMLElement | null;
};

const SceneScaleContext = createContext<SceneScale | null>(null);

/**
 * Só funciona dentro de `SceneStage`. Alças e arrasto precisam do fator para
 * traduzir movimento de mouse em unidades de cena, e para desenhar controles
 * com tamanho constante na tela independente do zoom do palco.
 */
export function useSceneScale(): SceneScale {
  const value = useContext(SceneScaleContext);
  if (!value)
    throw new Error("useSceneScale() precisa estar dentro de <SceneStage>");

  return value;
}

/**
 * Desfaz a ampliação do plano, para o que estiver dentro ser medido em PIXEL DE
 * TELA -- e não em unidade de cena dividida pela escala.
 *
 * Os controles do palco têm tamanho fixo na tela: uma alça tem dez pixels em
 * qualquer ampliação. Até aqui isso era feito dividindo -- `10 / scale` --, e o
 * plano multiplicava de volta. A conta fecha no papel e quebra na prática: sob
 * `zoom`, um valor computado abaixo de um pixel é levado PARA um pixel antes de
 * ser multiplicado, e o que era para ter dez pixels na tela sai com o traço
 * três vezes mais grosso. Medido nesta máquina: o traço do ícone do gizmo tem
 * largura computada de `1 / scale`, e a 800% isso são 0,29px -- abaixo do piso.
 * O botão, com 5,8px computados, passava intacto; era só o traço que engordava,
 * e daí a impressão de que os ícones cresciam.
 *
 * Cancelando a escala aqui, nada lá dentro é sub-pixel: dez pixels são dez
 * pixels, e o traço de um pixel é um pixel. Serve para as duas formas de
 * ampliar, porque desfaz a que estiver valendo -- `zoom` vezes `1 / scale` dá
 * um, e `scale` vezes `1 / scale` também.
 *
 * Só para o CONTEÚDO do controle. Onde ele fica no mapa continua em unidade de
 * cena: é a posição que tem de acompanhar o item, e é só o tamanho que não.
 */
export function emPixelDeTela(scale: number): { zoom: number } {
  return { zoom: 1 / scale };
}

/** Passo de zoom por notch da roda. */
const WHEEL_ZOOM_STEP = 1.15;

type SceneStageProps = {
  children?: ReactNode;
  className?: string;
  /** Recorte do plano a exibir. Ausente = plano inteiro. */
  viewport?: Viewport;
  /**
   * Presente = o palco aceita roda, pinça e arraste para navegar, e informa o
   * novo recorte. Ausente = palco fixo, que é o caso da miniatura.
   */
  onViewportChange?: (viewport: Viewport) => void;
  /**
   * Arrastar com um dedo/botão desloca a cena em vez de agir nos itens.
   *
   * No Mestre é ligado enquanto o espaço está pressionado. As visões de
   * espectador não usam: quem enquadra é o mestre, e a câmera da cena é a
   * única fonte de enquadramento delas.
   */
  panOnDrag?: boolean;
  /**
   * A área que a cena ocupa: o plano mais o que foi colocado fora dele.
   *
   * Presente = o palco desenha o contorno dela e navega dentro dela, o que é o
   * caso do Mestre. Ausente = o plano, e sem contorno: quem não edita não
   * navega, só desenha a câmera que chegou. Ver `limitesDoConteudo`.
   */
  limites?: Bounds;
  /**
   * Interpola a câmera: zoom e deslocamento chegam em amostras, e sem isto a
   * tela inteira salta a cada uma. Ver `.scene-smooth-camera` em
   * `globals.css`.
   *
   * Desligado onde a câmera é gesto direto — o palco do Mestre —, senão o
   * enquadramento correria atrás da roda do mouse.
   */
  smooth?: boolean;
};

/**
 * Moldura do plano de cena.
 *
 * Renderiza um retângulo de SCENE_WIDTH x SCENE_HEIGHT e o escala para que o
 * recorte pedido caiba no espaço disponível, então todo filho pode posicionar
 * em coordenadas de cena e ignorar tanto o tamanho da tela quanto o zoom. É
 * isso que faz o layout do Mestre bater com o da TV.
 */
export function SceneStage({
  children,
  className,
  viewport = FULL_VIEWPORT,
  onViewportChange,
  panOnDrag = false,
  limites,
  smooth = false,
}: SceneStageProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const [conteudoNo, setConteudoNo] = useState<HTMLDivElement | null>(null);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  /** A câmera está parada há tempo bastante para valer redesenhar nítido. */
  const [parada, setParada] = useState(false);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setFrame({ width, height });
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  // Zero em qualquer eixo significa que a moldura ainda não foi medida — ou
  // que a cadeia de altura acima dela quebrou. Nos dois casos não há escala
  // possível, e desenhar com `scale(0)` só mostraria preto.
  const scale =
    frame.width === 0 || frame.height === 0
      ? 0
      : Math.min(frame.width / viewport.width, frame.height / viewport.height);

  // Deslocamento que centraliza o recorte na moldura. Com `transform-origin`
  // no canto, translate e scale compõem de forma previsível.
  const offsetX =
    (frame.width - viewport.width * scale) / 2 - viewport.x * scale;
  const offsetY =
    (frame.height - viewport.height * scale) / 2 - viewport.y * scale;

  /**
   * A câmera parou, e o CONTEÚDO pode ser redesenhado em resolução cheia.
   *
   * ## O que estava errado
   *
   * `transform: scale` é resolvido pelo compositor, e o WebKitGTK rasteriza uma
   * camada transformada no tamanho de LAYOUT -- 1920x1080 -- para esticar essa
   * textura depois. Com o plano ampliado quatro vezes e meia, o que a mesa via
   * era uma imagem de 1920 de largura esticada para 9200.
   *
   * Quando o motor decide compor o plano é heurística interna dele, e por isso
   * o sintoma parecia aleatório: mexer no arranjo de abas da bancada -- que não
   * toca o palco -- acendia e apagava o borrão. Promover o plano à mão, com
   * `will-change`, borra sempre.
   *
   * Descartados por medida: o valor do `scale` (o mesmo em estado nítido e
   * borrado), a variante do fundo, as máscaras de `scroll-fade`, o
   * `backdrop-filter` dos controles, a pressão de camadas -- o estado NÍTIDO
   * tinha mais -- e `WEBKIT_DISABLE_COMPOSITING_MODE=1`.
   *
   * ## Por que dois planos, e não um com `zoom`
   *
   * `zoom` é a única propriedade que põe a ampliação no LAYOUT, e é o que faz o
   * motor rasterizar o mapa no tamanho em que ele aparece. Mas ela tem de estar
   * no elemento que FORMA a camada: pô-la mais fundo e desfazê-la com um
   * `scale` não ganha nada, porque as duas coisas acontecem dentro da mesma
   * camada e a textura continua com 1920. Foi assim que a primeira tentativa
   * deste conserto passou por verificada sem funcionar.
   *
   * E no plano INTEIRO ela quebra os controles, que convertem pixel de tela em
   * unidade de cena com `v / scale`: sob `zoom` o erro cresce com a ampliação,
   * e a 800% as alças e os ícones do gizmo incham. Era isto que a bancada
   * chamava de "o que ela fazia com as bordas de meio pixel dos controles".
   *
   * Daí os dois planos, com a mesma geometria: o de baixo leva o conteúdo e
   * troca de forma, o de cima leva os controles e nunca sai do `transform`.
   *
   * ## Por que só com a câmera parada
   *
   * Trocar `transform` por `zoom` o tempo todo já foi reprovado na bancada --
   * 889 ms de estilo e 164 ms de layout contra 24 ms, no cenário `camera`. Mas
   * o que aquela medida mediu foi o GESTO, e nitidez não é coisa que se olhe
   * durante o gesto: ali a imagem está correndo atrás do cursor. O gesto
   * continua no compositor, e o layout é pago uma vez, quando a mão para.
   */
  const conteudoNoLayout = parada && scale !== 0;

  /** A câmera, resumida a uma string: mudou isto, mudou o enquadramento. */
  const camera = `${scale}|${offsetX}|${offsetY}`;
  const [ultima, setUltima] = useState(camera);

  // Ajuste de estado no próprio render, que é o caminho que o React documenta
  // para estado derivado -- o mesmo de `useVarianteDoFundo`. Num efeito, o
  // quadro entre a câmera mexer e o `parada` cair sairia com a geometria velha.
  if (ultima !== camera) {
    setUltima(camera);
    setParada(false);
  }

  useEffect(() => {
    // Mais longo com a transição ligada: ali a câmera continua andando por
    // 450 ms depois da última mudança de `viewport`, e trocar de forma no meio
    // do voo faria a cena saltar -- `zoom` não interpola.
    const espera = window.setTimeout(() => setParada(true), smooth ? 620 : 180);

    return () => window.clearTimeout(espera);
  }, [camera, smooth]);

  /**
   * Liga a transição da câmera só depois do primeiro paint já medido.
   *
   * Imperativo de propósito: se a classe entrasse no mesmo render em que a
   * escala deixa de ser zero, a abertura de toda tela começaria com a cena
   * crescendo do nada — o `scale(0)` do primeiro paint seria o quadro inicial
   * da animação. Aqui ela passa a valer para a mudança de câmera *seguinte*,
   * que é a que precisa ser suave.
   */
  useEffect(() => {
    if (!smooth || scale === 0) return;

    planeRef.current?.classList.add("scene-smooth-camera");
  }, [smooth, scale]);

  const toScene = useCallback(
    (clientX: number, clientY: number): Vec => {
      // `getBoundingClientRect` já devolve a caixa depois do transform, então o
      // canto do retângulo é o ponto (0,0) da cena na tela.
      const rect = planeRef.current?.getBoundingClientRect();
      if (!rect || scale === 0) return { x: 0, y: 0 };

      return {
        x: (clientX - rect.left) / scale,
        y: (clientY - rect.top) / scale,
      };
    },
    [scale],
  );

  const value = useMemo<SceneScale>(
    () => ({
      scale,
      ampliacaoNoLayout: conteudoNoLayout,
      toScene,
      viewport,
      planoDeConteudo: conteudoNo,
    }),
    [scale, conteudoNoLayout, toScene, viewport, conteudoNo],
  );

  // Guardados em ref porque os listeners nativos abaixo são registrados uma
  // vez e precisam ver sempre o estado atual. Atualizados em efeito, não em
  // render: escrever numa ref durante o render é o que o React proíbe.
  const stateRef = useRef({
    viewport,
    scale,
    toScene,
    onViewportChange,
    panOnDrag,
    limites,
  });

  useEffect(() => {
    stateRef.current = {
      viewport,
      scale,
      toScene,
      onViewportChange,
      panOnDrag,
      limites,
    };
  });

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;

    function handleWheel(event: WheelEvent) {
      const { onViewportChange: notify, toScene: project } = stateRef.current;
      if (!notify) return;

      // Listener não-passivo justamente para poder barrar o scroll da página:
      // a roda sobre o palco é zoom, não rolagem.
      event.preventDefault();

      const factor = event.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
      notify(
        zoomViewport(
          stateRef.current.viewport,
          factor,
          project(event.clientX, event.clientY),
          stateRef.current.limites,
        ),
      );
    }

    element.addEventListener("wheel", handleWheel, { passive: false });

    return () => element.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;

    /** Ponteiros ativos, para distinguir arraste de pinça. */
    const active = new Map<number, Vec>();
    let pinchDistance = 0;
    let panning = false;

    function center(): Vec {
      const points = [...active.values()];
      const sum = points.reduce(
        (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
        {
          x: 0,
          y: 0,
        },
      );

      return { x: sum.x / points.length, y: sum.y / points.length };
    }

    function distance(): number {
      const [a, b] = [...active.values()];
      if (!a || !b) return 0;

      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function handleDown(event: PointerEvent) {
      const { onViewportChange: notify, panOnDrag: pan } = stateRef.current;
      if (!notify) return;

      // Botão do meio sempre navega, inclusive no Mestre, onde o botão
      // esquerdo pertence à seleção.
      const wantsPan = pan || event.button === 1;
      if (!wantsPan && event.pointerType === "mouse") return;

      active.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (active.size === 2) {
        pinchDistance = distance();
        panning = false;
        return;
      }

      if (active.size === 1 && wantsPan) {
        panning = true;
        if (event.button === 1) event.preventDefault();
      }
    }

    function handleMove(event: PointerEvent) {
      const {
        onViewportChange: notify,
        scale: current,
        toScene: project,
      } = stateRef.current;
      if (!notify || current === 0 || !active.has(event.pointerId)) return;

      const previous = active.get(event.pointerId)!;
      const next = { x: event.clientX, y: event.clientY };
      active.set(event.pointerId, next);

      if (active.size >= 2) {
        const now = distance();
        if (pinchDistance > 0 && now > 0) {
          const anchor = center();
          notify(
            zoomViewport(
              stateRef.current.viewport,
              now / pinchDistance,
              project(anchor.x, anchor.y),
              stateRef.current.limites,
            ),
          );
        }
        pinchDistance = now;
        return;
      }

      if (!panning) return;

      // Arrastar move a cena junto do dedo, logo o recorte anda ao contrário.
      notify(
        panViewport(
          stateRef.current.viewport,
          -(next.x - previous.x) / current,
          -(next.y - previous.y) / current,
          stateRef.current.limites,
        ),
      );
    }

    function handleUp(event: PointerEvent) {
      active.delete(event.pointerId);
      if (active.size < 2) pinchDistance = 0;
      if (active.size === 0) panning = false;
    }

    element.addEventListener("pointerdown", handleDown);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);

    return () => {
      element.removeEventListener("pointerdown", handleDown);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, []);

  return (
    <div
      ref={frameRef}
      className={cn("relative flex-1 overflow-hidden bg-black", className)}
      // Sem isto o browser rouba o gesto de duas mãos para dar zoom na página.
      style={onViewportChange ? { touchAction: "none" } : undefined}
    >
      {/* O plano de BAIXO: o conteúdo da cena, e o único que troca de forma de
          ampliar. Quem desenha nele chega por portal -- ver `planoDeConteudo`. */}
      <div
        aria-hidden={scale === 0}
        className={cn("absolute top-0 left-0", scale === 0 && "invisible")}
        style={{
          width: SCENE_WIDTH,
          height: SCENE_HEIGHT,
          transform: `translate(${offsetX}px, ${offsetY}px)`,
          transformOrigin: "0 0",
        }}
      >
        <div
          ref={setConteudoNo}
          // `relative` para este ser SEMPRE o containing block do conteúdo. Sem
          // isso, o `absolute inset-0` de dentro se ancora aqui enquanto há
          // `transform` -- que cria containing block -- e escapa para o
          // elemento de fora quando a forma vira `zoom`, que não cria. O
          // sintoma era o mapa saltando e sumindo no instante em que a câmera
          // parava.
          className="relative bg-black"
          style={{
            width: SCENE_WIDTH,
            height: SCENE_HEIGHT,
            // As duas formas produzem a MESMA geometria: é o que deixa alternar
            // entre elas sem a cena saltar.
            ...(conteudoNoLayout
              ? { zoom: scale }
              : { transform: `scale(${scale})`, transformOrigin: "0 0" }),
          }}
        />
      </div>

      {/* O plano de CIMA: os controles do mestre. Sempre no `transform`, porque
          é o que mantém exato o `v / scale` com que eles se medem.

          `pointer-events: none` porque ele cobre o plano de conteúdo inteiro, e
          sem isso nenhum clique alcançaria o mapa embaixo. Quem é clicável aqui
          se declara com `pointer-events-auto` -- o gizmo, o alfinete, o postit.
          Ver `PLANO_DE_CONTROLES` em `globals.css`. */}
      {/* `pointer-events-none` nos DOIS níveis: este envelope tem o tamanho do
          plano inteiro, e sem isso é ELE quem recebe o clique -- o mapa, que
          vive no plano de baixo, fica inalcançável. */}
      <div
        ref={planeRef}
        // `scale === 0` é o primeiro paint, antes do ResizeObserver medir.
        // Renderizar nessa hora mostraria a cena em tamanho cheio por um frame.
        className={cn(
          "pointer-events-none absolute top-0 left-0",
          scale === 0 && "invisible",
        )}
        style={{
          width: SCENE_WIDTH,
          height: SCENE_HEIGHT,
          transform: `translate(${offsetX}px, ${offsetY}px)`,
          transformOrigin: "0 0",
        }}
      >
      <div
        className="plano-de-controles pointer-events-none relative"
        style={{
          width: SCENE_WIDTH,
          height: SCENE_HEIGHT,
          // Mesma alternância do conteúdo, e pelo mesmo motivo: o plano também
          // borra esticado. O que os controles precisam, e o conteúdo não, é
          // que as medidas de TELA deles não caiam no piso de um pixel que o
          // `zoom` aplica -- ver `emPixelDeTela`.
          ...(conteudoNoLayout
            ? { zoom: scale }
            : { transform: `scale(${scale})`, transformOrigin: "0 0" }),
        }}
      >
        {/* O contorno da área, desenhado como FILHO e não como `outline` do
            plano: a caixa acompanha o conteúdo, e conteúdo largado à esquerda
            do plano tem canto negativo -- que um contorno do próprio plano não
            teria como representar, porque ele começa na origem por definição.

            Mede em unidade de cena e herda a escala do plano, como todo o
            resto: a linha engrossa e afina com o zoom sem ninguém dividir por
            `scale`. */}
        {limites ? (
          <div
            aria-hidden
            className="pointer-events-none absolute outline outline-white/10"
            style={{
              left: limites.minX,
              top: limites.minY,
              width: limites.maxX - limites.minX,
              height: limites.maxY - limites.minY,
            }}
          />
        ) : null}

        {/* Sem escala, sem filhos.
            Treze lugares no palco convertem pixel de tela em unidade de cena
            dividindo por `scale` -- a borda do gizmo, a faixa da moldura de
            câmera, o alfinete, o traço do laço. Com `scale` em zero todos eles
            viram `Infinity`, e o React recusa o valor com um erro de console
            por propriedade: "`Infinity` is an invalid value for the `height`
            css style property".

            Esconder o plano não bastava, porque `invisible` esconde sem
            desmontar. Não renderizar é o que resolve na origem, e é honesto:
            enquanto não há medida não há cena para desenhar. Os filhos entram
            no mesmo quadro em que o plano deixa de estar invisível. */}
        <SceneScaleContext.Provider value={value}>
          {scale === 0 ? null : children}
        </SceneScaleContext.Provider>
      </div>
      </div>
    </div>
  );
}
