"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { createPortal } from "react-dom";

import {
  DebugPalco,
  MiraDebug,
  useDebugDoPalco,
} from "@/components/playground/debug-palco";
import type { Bounds } from "@/lib/geometry/bounds";
import type { Vec } from "@/lib/geometry/transform";
import {
  FULL_VIEWPORT,
  panViewport,
  zoomViewport,
} from "@/lib/geometry/viewport";
import { useViewportStore } from "@/lib/store/use-viewport-store";
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
  /**
   * Onde vive o que pode ser estacionado FORA do mapa -- postit, cartão de
   * documento.
   *
   * Um envelope irmão dos dois planos, com a mesma geometria e SEM caixa
   * própria (0x0). Existe pela armadilha 1 de `debug-do-palco` §3: um filho
   * que passa da caixa de um plano infla a camada composta dele, e o motor
   * pinta o plano deslocado -- a moldura da câmera tremia a cada notch de
   * zoom porque um postit estava 222px acima do plano de controles. Prender o
   * papel ao plano resolvia o tremor e matava a margem, que é uso legítimo.
   * Aqui o papel fica fora dos planos: não há caixa a transbordar, e o que a
   * camada dele pinta é só ele mesmo.
   *
   * Sempre em `transform`, como o plano de controles: o papel se mede com
   * `emPixelDeTela`, e as duas formas têm de bater.
   */
  planoDaMargem: HTMLElement | null;
  /**
   * O fundo do palco, atrás dos planos e do tamanho da moldura. É onde o
   * envelope de gesto do mestre é montado, para o lado de fora do plano aceitar
   * gesto sem nada transbordar do plano de conteúdo. Ver `fundoNo`.
   */
  fundoDoPalco: HTMLElement | null;
  /**
   * A MOLDURA do palco, e onde o plano começa dentro dela, em pixels de tela.
   * Para quem precisa desenhar sobre o palco inteiro, fora dos planos -- a
   * máscara da câmera no quadro --, e por isso não pode ficar dentro deles:
   * um filho maior que o plano infla a camada composta e derruba a pintura
   * (ver `debug-do-palco` §3). Em pixels de tela: `x_px = offsetX + x × scale`.
   */
  moldura: HTMLElement | null;
  offsetX: number;
  offsetY: number;
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

/**
 * A espessura do traço de um ícone que vive DENTRO de `emPixelDeTela`, em
 * unidades do SVG (24 por ícone).
 *
 * O `zoom` mexe com medida pequena de duas formas, e as duas já morderam o
 * palco:
 *
 * 1. CAIXA abaixo de um pixel é levada A um pixel antes de ser multiplicada --
 *    é o que está contado em `emPixelDeTela`, e foi o que engordava a borda da
 *    alça do gizmo. Contra isso não há compensação: ou a medida sai do `zoom`,
 *    ou ela deixa de ser caixa. A alça fez as duas -- foi para a margem, que
 *    amplia por `transform`, e a borda dela virou sombra pintada.
 * 2. TRAÇO de SVG é multiplicado pelo `zoom` e a redução do envelope não o traz
 *    de volta. É este caso. A 30% os ícones da fileira viravam quadradinhos
 *    cheios; medido tirando e repondo esta conta na webview.
 *
 * Multiplicar pela escala desfaz o que o `zoom` fez. O teto mantém o desenho
 * original de 100% para cima -- ampliar já sai certo --, e o piso impede o
 * traço de sumir num palco muito afastado; se ainda engordar abaixo de 20%, o
 * piso é o primeiro número a baixar.
 *
 * `ampliado` é "este trecho está sob `zoom`". Onde a ampliação é `transform`
 * -- durante o gesto, e sempre na TV -- não há o que desfazer, e compensar
 * deixaria o traço fino demais. Ver `conteudoNoLayout`.
 */
export function tracoDoIcone(scale: number, ampliado = true): number {
  if (!ampliado) return TRACO_DO_ICONE;

  return Math.min(TRACO_DO_ICONE, Math.max(0.5, TRACO_DO_ICONE * scale));
}

/** O traço com que os ícones do `lucide` são desenhados. */
const TRACO_DO_ICONE = 2;

/** Passo de zoom por notch da roda. */
const WHEEL_ZOOM_STEP = 1.15;

/**
 * Entre que larguras NA TELA o azulejo da malha de pontos se mantém.
 *
 * O passo em cena dobra ou cai pela metade para caber nesta faixa: a 400% um
 * ponto a cada 32 unidades seria uma parede de bolinhas, e a 25% seria um
 * ponto a cada oito pixels. O teto também é a folga fixa da peça do fundo --
 * ver `malha`.
 */
const MALHA_MIN_PX = 24;
const MALHA_MAX_PX = 48;

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
   * A cor do vazio. `"mapa"` é o preto de sempre: o mapa é a luz, e o que
   * está fora dele é sala escura. `"quadro"` é papel, na cor da superfície do
   * tema: um quadro sem chão sobre preto lia como cena sem fundo, e o que se
   * quer é uma folha.
   */
  plano?: "mapa" | "quadro";
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
  /**
   * Sobe a cada CORTE de câmera. Quando muda, a amostra que chega junto entra
   * sem interpolar: a troca acontece atrás da cortina (ver `useCorteDeCamera`)
   * e deslizar até lá mostraria o caminho quando a cortina abrisse.
   */
  corte?: number;
};

/**
 * Moldura do plano de cena.
 *
 * Renderiza um retângulo de SCENE_WIDTH x SCENE_HEIGHT e o escala para que o
 * recorte pedido caiba no espaço disponível, então todo filho pode posicionar
 * em coordenadas de cena e ignorar tanto o tamanho da tela quanto o zoom. É
 * isso que faz o layout do Mestre bater com o da TV.
 */
/**
 * Abaixo disto entre duas amostras de câmera, é arrasto e não salto.
 *
 * O canal publica a cada 100 ms no máximo; 250 dá folga para uma amostra
 * atrasada sem confundir dois toques seguidos no botão de enquadrar, que
 * ninguém dá em menos de um quarto de segundo.
 */
const FLUXO_MS = 250;

export function SceneStage({
  children,
  className,
  viewport = FULL_VIEWPORT,
  onViewportChange,
  panOnDrag = false,
  plano = "mapa",
  limites,
  smooth = false,
  corte = 0,
}: SceneStageProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  /**
   * O fundo do palco: um pega-gesto do tamanho da MOLDURA, atrás dos planos.
   *
   * É para onde o `SceneLayer` leva o envelope do palco do mestre, e o que faz
   * o lado de fora do plano aceitar gesto -- soltar imagem, cravar ponto,
   * começar risco. Já foi um filho de 3x3 planos transbordando DENTRO do plano
   * de conteúdo, e isso inflava a camada composta: o WebKitGTK passou a pintar
   * o mapa deslocado depois de cada troca de forma, e a ficar preto ampliado.
   * Aqui ele tem o tamanho da moldura e não transborda nada.
   */
  const [fundoNo, setFundoNo] = useState<HTMLDivElement | null>(null);

  // Modo de depuração: HUD e miras. `Ctrl+Alt+D`. Ver `debug-palco.tsx`.
  const debug = useDebugDoPalco();
  const [frameNo, setFrameNo] = useState<HTMLDivElement | null>(null);
  const [controlesNo, setControlesNo] = useState<HTMLDivElement | null>(null);
  /**
   * O envelope do plano de CONTEÚDO -- o `div` que leva o `translate`.
   *
   * Existe para a transição da câmera alcançar o mapa. Quando o palco virou
   * dois planos, o `planeRef` ficou com o de cima, o dos controles, e a
   * suavização foi junto: na TV, onde os controles não existem, o que deslizava
   * era um plano vazio e o mapa saltava a cada amostra de 100 ms.
   */
  const envelopeDoConteudoRef = useRef<HTMLDivElement>(null);
  const [conteudoNo, setConteudoNo] = useState<HTMLDivElement | null>(null);
  const [margemNo, setMargemNo] = useState<HTMLDivElement | null>(null);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  /** A câmera está parada há tempo bastante para valer redesenhar nítido. */
  const [parada, setParada] = useState(false);
  /**
   * A mesma pergunta feita só sobre a AMPLIAÇÃO, sem o gesto.
   *
   * É o que separa os dois planos: o de conteúdo tem de cair para o compositor
   * enquanto um item anda -- um token dentro de um plano em `zoom` paga layout
   * e re-raster do plano inteiro por quadro, e é a razão de `gestos` existir
   * (ver `useViewportStore`). O de CONTROLES não tem token nenhum: ali moram
   * texto, forma, postit e gizmo, e quem anda no gesto anda pelo `transform`
   * do próprio elemento. Fazê-lo trocar de forma junto só servia para
   * redesenhar toda a letra da folha com outra régua a cada vez que a mão
   * pegava alguma coisa -- que é o quadro "se mexendo" ao mover um elemento.
   */
  const [ampliacaoParada, setAmpliacaoParada] = useState(false);
  const [ultimaAmpliacao, setUltimaAmpliacao] = useState(0);
  // Só no Mestre: na TV nada arrasta, e o plano dela nunca sai do `transform`.
  const emGesto = useViewportStore((state) => !smooth && state.gestos > 0);


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
   *
   * ## O que foi tentado e não serve: segurar o notch da roda em `zoom`
   *
   * Entre 450% e 700%, um notch da roda às vezes mostra por UM quadro o mapa
   * em outro lugar -- o raster anterior deslocado pelo `translate` novo,
   * medido quadro a quadro numa gravação. É corrida entre o compositor, que
   * aplica o `transform` novo à textura que tiver, e o layout, que ainda está
   * rasterizando. Tentou-se não trocar de forma no notch, aplicando o passo em
   * `zoom` mesmo: cada notch a 400-500% passou a forçar um re-raster de seis a
   * nove mil pixels, e o WebKitGTK pinta isso tile a tile -- o plano ficava
   * PRETO por vários quadros, só com a moldura da câmera à vista. Pior. O notch
   * tem de cair para o `transform`, onde o compositor estica a textura que já
   * tem, na hora.
   *
   * ## Nunca em quem só assiste
   *
   * Com `smooth` o plano fica em `transform` sempre. O borrão que o `zoom`
   * conserta é do WebKitGTK, a webview do MESTRE; Chrome e Safari redesenham
   * uma camada escalada nítida sozinhos quando ela para. E a troca de forma
   * custava um defeito na TV, filmado: a cada começo e fim de movimento da
   * câmera -- e uns 600 ms depois de um F5, quando `parada` sobe pela primeira
   * vez --, um token aparecia noutro ponto e era arrastado de volta ao lugar.
   * São os únicos instantes em que o plano troca de forma. O mapa não mostrava
   * o mesmo salto porque é uma imagem só, sem transição; o token tem
   * `transition: transform` (ver `.scene-smooth-item`) e é ele que anda.
   *
   * De brinde, a TV deixa de pagar um layout de `1920 × scale` pixels a cada
   * parada da câmera -- que a 16x é uma caixa de 30 mil pixels.
   */
  /*
   * Houve um teto aqui -- `zoom` só até 4096 px de raster -- posto quando o
   * palco ficava PRETO ampliado. Saiu: o preto (e o mapa pintado deslocado)
   * vinham de um filho de 3x3 planos transbordando dentro do plano de
   * conteúdo, que inflava a camada composta para dezenas de milhares de pixels.
   * Com a camada do tamanho do plano, o `zoom` nítido volta a valer em toda a
   * faixa em que sempre valeu. Ver `zona` em `SceneLayer`.
   */
  // `!emGesto`: item, alça ou moldura andando é gesto tanto quanto a câmera, e
  // gesto é coisa de compositor. Ver `gestos` em `useViewportStore`.
  const conteudoNoLayout = !smooth && parada && !emGesto && scale !== 0;
  /**
   * No QUADRO, o plano de cima sai do layout só enquanto a ampliação muda --
   * pegar um elemento não o tira mais.
   *
   * O que ele ganha com isso é não ser reescrito com outra régua a cada vez
   * que a mão pega alguma coisa: o conteúdo do quadro mora todo aqui, e trocar
   * de forma redesenha cada letra com o hinting do tamanho novo. É a metade do
   * "as coisas se mexem" que sobrava depois de o pan parar de trocar.
   *
   * Custa, e o número está medido: no cenário `quadro` da bancada -- 30
   * textos, 15 formas, 10 postits, um texto arrastado por quadro --, o quadro
   * perdido na webview vai de 2,1% a 3,3% (mediana de três corridas cada). É o
   * preço de deixar o plano em layout enquanto algo anda dentro dele, e é o
   * mesmo motivo que fez `gestos` existir para o plano de conteúdo.
   *
   * Só no quadro, e não no mapa: lá embaixo o plano de conteúdo carrega o
   * bitmap e os tokens, e é dele que veio a medida que criou o `gestos` -- um
   * token dentro de um plano em `zoom` pesando na mão. No mapa os dois planos
   * continuam trocando juntos, como sempre.
   */
  const controlesNoLayout =
    plano === "quadro"
      ? !smooth && ampliacaoParada && scale !== 0
      : conteudoNoLayout;

  /**
   * A malha de pontos do vazio, só onde se navega (o Mestre).
   *
   * Um palco vazio é preto em toda ampliação e em todo deslocamento: a Cena 3
   * sem mapa dava zoom de 100% a 400% sem nenhum pixel mudar, e o mestre não
   * sabia se a roda tinha feito algo. Os pontos são a referência que o mapa
   * dá quando existe. Dois fundos CSS e nenhum nó a mais dentro dos planos
   * (ver `debug-do-palco` §3): a moldura desenha o lado de fora em pixel de
   * tela, deslocado por `offset`; o plano desenha o lado de dentro em unidade
   * de cena e deixa o `zoom`/`transform` escalar. As duas malhas têm o mesmo
   * passo em cena e a mesma origem, então emendam na borda do plano.
   *
   * O passo em cena dobra ou cai pela metade para o espaçamento na tela ficar
   * entre 24 e 48 px: a 400% um ponto a cada 32 unidades seria uma parede de
   * bolinhas, e a 25% seria um ponto a cada oito pixels.
   */
  const malha = useMemo(() => {
    if (!onViewportChange || scale === 0) return null;

    let passo = 32;
    while (passo * scale < MALHA_MIN_PX) passo *= 2;
    while (passo * scale > MALHA_MAX_PX) passo /= 2;

    // No papel a cor vem do tema: branco a 13% some numa folha clara.
    const tinta =
      plano === "quadro"
        ? "color-mix(in oklch, var(--foreground) 18%, transparent)"
        : "rgba(255,255,255,0.13)";
    const ponto = `radial-gradient(circle, ${tinta} 1px, transparent 1.5px)`;

    // O fundo é um azulejo MAIOR que a janela e anda por `translate`, em vez
    // de mudar `backgroundPosition`: mudar a posição do padrão repintava o
    // fundo inteiro -- a janela toda -- a cada quadro de arrasto, no mapa e no
    // quadro. Um `translate` dentro de um azulejo o compositor resolve sem
    // repintar. O tamanho do azulejo ainda muda no zoom, e aí repinta; é um
    // por notch, não um por quadro. O deslocamento fica em (-azulejo, 0] para
    // a peça continuar cobrindo a janela e recebendo o gesto no vazio.
    const azulejo = passo * scale;
    const resto = (v: number) => (((v % azulejo) + azulejo) % azulejo) - azulejo;

    return {
      fora: {
        backgroundImage: ponto,
        backgroundSize: `${azulejo}px ${azulejo}px`,
        // A folga é CONSTANTE, e não do tamanho do azulejo.
        //
        // Era `calc(100% + ${azulejo}px)`, e `azulejo` muda a cada notch da
        // roda -- então a peça do fundo reescrevia `width` e `height` por
        // notch, e caixa marca o documento inteiro para refazer o layout. Este
        // é o elemento que cobre a janela toda, então ele estava na conta de
        // todo zoom do palco.
        //
        // `MALHA_MAX_PX` basta porque o `while` acima prende o azulejo entre
        // `MALHA_MIN_PX` e `MALHA_MAX_PX`, e o `resto` prende o deslocamento a
        // (-azulejo, 0]: a peça nunca precisa de mais folga que um azulejo, e
        // nenhum azulejo passa do teto.
        width: `calc(100% + ${MALHA_MAX_PX}px)`,
        height: `calc(100% + ${MALHA_MAX_PX}px)`,
        transform: `translate(${resto(offsetX)}px, ${resto(offsetY)}px)`,
      },
      // O quadro NÃO tem malha própria no plano: a dele é a do fundo, que
      // atravessa o plano transparente. Ver o plano de conteúdo abaixo.
      dentro:
        plano === "quadro"
          ? undefined
          : {
              backgroundImage: ponto,
              backgroundSize: `${passo}px ${passo}px`,
            },
    };
  }, [onViewportChange, plano, scale, offsetX, offsetY]);

  /**
   * O que obriga o plano a voltar para o compositor: a AMPLIAÇÃO e o gesto.
   *
   * O deslocamento saiu da chave, e é um conserto. A troca de forma existe
   * porque a textura ESTICADA borra, e só a ampliação a estica -- deslocar
   * move a mesma textura, que o compositor faz sem borrar nada. Com o offset
   * aqui dentro, arrastar a tela derrubava o plano para `transform` e o trazia
   * de volta 350 ms depois: layout refeito duas vezes por gesto, e o texto
   * inteiro redesenhado com outra régua nas duas -- medido na webview, 900
   * pixels de tela mudavam sem nada ter se movido. Era metade do "as coisas se
   * mexem quando eu mexo a tela".
   *
   * O gesto FICA na chave: soltar um item é "a câmera parou" outra vez -- a
   * espera recomeça e o plano só volta ao `zoom` nítido depois dela, em vez de
   * pagar o re-raster no mesmo quadro do `pointerup`. Ver `gestos` em
   * `useViewportStore`, onde está por que mover item quer o compositor.
   */
  const camera = `${scale}|${emGesto}`;
  const [ultima, setUltima] = useState(camera);

  // Ajuste de estado no próprio render, que é o caminho que o React documenta
  // para estado derivado -- o mesmo de `useVarianteDoFundo`. Num efeito, o
  // quadro entre a câmera mexer e o `parada` cair sairia com a geometria velha.
  if (ultima !== camera) {
    setUltima(camera);
    setParada(false);
  }
  if (ultimaAmpliacao !== scale) {
    setUltimaAmpliacao(scale);
    setAmpliacaoParada(false);
  }

  /** Quando a última amostra de câmera chegou. `null` = nenhuma medida ainda. */
  const ultimaCameraEm = useRef<number | null>(null);
  /** A câmera está em FLUXO -- amostras seguidas -- e não num salto. */
  const emFluxo = useRef(false);

  /**
   * Escolhe a transição da câmera pela cadência das amostras.
   *
   * São dois gestos distintos chegando pelo mesmo canal. O botão de enquadrar
   * é um SALTO: uma amostra só, e a tela viaja até lá com desaceleração --
   * 450 ms, ver `.scene-smooth-camera`. Arrastar a moldura é FLUXO: uma amostra
   * a cada 100 ms, e a curva longa reiniciada a cada uma nunca alcança o alvo
   * -- a tela anda em serrote, sempre atrás. Para o fluxo vale a mesma
   * transição dos itens, `150ms linear`, pela mesma razão: cobre um intervalo
   * de publicação e pouco mais, sem inércia para acumular.
   *
   * A escolha é pelo intervalo desde a amostra anterior. A TV não sabe qual
   * botão o mestre apertou, mas sabe quando a anterior chegou -- e duas
   * amostras a menos de `FLUXO_MS` uma da outra só existem no arrasto.
   *
   * `useLayoutEffect`, e não `useEffect`: a classe tem de estar no elemento
   * ANTES de o quadro com o `transform` novo ser pintado, senão a transição que
   * vale para esta amostra é a que a anterior escolheu, e a troca de cadência
   * chega sempre uma amostra atrasada.
   *
   * Nos DOIS planos: o de cima leva os controles do mestre, o de baixo leva o
   * mapa. Com cadências diferentes eles se descolariam no meio do voo.
   *
   * E nos DOIS níveis de cada plano. O envelope leva o `translate`; o interno
   * leva o `scale`. Só o envelope interpolava, e redimensionar a moldura da
   * câmera mexe nos dois: a TV deslizava o deslocamento e saltava a escala a
   * cada amostra de 100 ms -- a imagem tremia enquanto a moldura crescia ou
   * encolhia. Na TV o interno está sempre em `transform` (ver
   * `conteudoNoLayout`), então a mesma transição alcança o `scale`.
   *
   * Só depois do primeiro paint já medido, e imperativo de propósito: se a
   * classe entrasse no mesmo quadro em que a escala deixa de ser zero, a
   * abertura de toda tela começaria com a cena vindo do canto -- o `translate`
   * calculado com `scale(0)` seria o quadro inicial da animação. A primeira
   * amostra só marca a hora; a transição passa a valer da seguinte em diante.
   */
  const ultimoCorte = useRef(corte);

  useLayoutEffect(() => {
    if (!smooth || scale === 0) return;

    const planos = [
      planeRef.current,
      envelopeDoConteudoRef.current,
      controlesNo,
      conteudoNo,
    ];

    // Corte: esta amostra entra seca, e a próxima recomeça a contagem como
    // se fosse a primeira -- senão a amostra seguinte ao corte seria lida
    // como fluxo, só porque veio logo depois.
    if (corte !== ultimoCorte.current) {
      ultimoCorte.current = corte;
      ultimaCameraEm.current = null;
      emFluxo.current = false;

      for (const plano of planos) {
        plano?.classList.remove("scene-smooth-camera");
        plano?.classList.remove("scene-smooth-camera-fluxo");
      }

      return;
    }

    const agora = performance.now();
    const anterior = ultimaCameraEm.current;
    ultimaCameraEm.current = agora;

    if (anterior === null) return;

    const fluxo = agora - anterior < FLUXO_MS;
    emFluxo.current = fluxo;

    for (const plano of planos) {
      plano?.classList.toggle("scene-smooth-camera", !fluxo);
      plano?.classList.toggle("scene-smooth-camera-fluxo", fluxo);
    }
    // `camera` já carrega `scale`; ele entra à parte porque o corpo o lê.
  }, [camera, smooth, scale, corte, controlesNo, conteudoNo]);

  useEffect(() => {
    // Mais longo com a transição ligada: ali a câmera continua andando depois
    // da última mudança de `viewport`, e trocar de forma no meio do voo faria a
    // cena saltar -- `zoom` não interpola. A espera segue a transição em curso:
    // 450 ms no salto, 150 ms no fluxo, mais a folga de um quadro de rede.
    //
    // No Mestre, 350 ms e não 180: cada troca de forma abre a janela de
    // corrida compositor x layout do notch (ver "segurar o notch" acima), e
    // uma roda com pausas curtas entre notches cruzava os 180 ms e pagava a
    // corrida a cada retomada -- a 500% isso é um quadro preto de 5 mil px.
    // Nitidez chega 170 ms mais tarde; ninguém olha nitidez com a mão na roda.
    const espera = window.setTimeout(
      () => setParada(true),
      smooth ? (emFluxo.current ? 320 : 620) : 350,
    );

    return () => window.clearTimeout(espera);
  }, [camera, smooth]);

  // A mesma espera para a ampliação sozinha. Ver `ampliacaoParada`.
  useEffect(() => {
    const espera = window.setTimeout(
      () => setAmpliacaoParada(true),
      smooth ? (emFluxo.current ? 320 : 620) : 350,
    );

    return () => window.clearTimeout(espera);
  }, [scale, smooth]);

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
      // Dos CONTROLES, e não do conteúdo: quem lê isto desenha lá em cima --
      // alça, postit, texto, gizmo -- e precisa desfazer a ampliação que está
      // valendo PARA ELE. Ver `emPixelDeTela`.
      ampliacaoNoLayout: controlesNoLayout,
      toScene,
      viewport,
      planoDeConteudo: conteudoNo,
      planoDaMargem: margemNo,
      fundoDoPalco: fundoNo,
      moldura: frameNo,
      offsetX,
      offsetY,
    }),
    [
      scale,
      controlesNoLayout,
      toScene,
      viewport,
      margemNo,
      conteudoNo,
      fundoNo,
      frameNo,
      offsetX,
      offsetY,
    ],
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

    /**
     * Um recorte por quadro, somando os notches que chegarem.
     *
     * A roda não entrega um evento por quadro: roda de alta resolução e
     * trackpad entregam vários, e cada um virava um `setViewport` -- logo um
     * render do palco do mestre inteiro, e com ele um layout, porque os
     * controles se medem em pixel de tela e reescrevem caixa quando o `scale`
     * muda. Era o mesmo buraco do visor e do arrasto de moldura, no terceiro
     * lugar em que ele aparece.
     *
     * `pedido` guarda o recorte JÁ calculado, e é ele que serve de base para o
     * notch seguinte: a roda é multiplicativa, e todos os notches do mesmo
     * quadro partindo do mesmo recorte dariam um degrau em vez de cinco.
     */
    let pedido: Viewport | null = null;
    let proximo: Viewport | null = null;
    let quadroDaRoda: number | undefined;

    function handleWheel(event: WheelEvent) {
      const { onViewportChange: notify, toScene: project } = stateRef.current;
      if (!notify) return;

      // Listener não-passivo justamente para poder barrar o scroll da página:
      // a roda sobre o palco é zoom, não rolagem.
      event.preventDefault();

      const factor = event.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
      const base = pedido ?? stateRef.current.viewport;
      const alvo = zoomViewport(
        base,
        factor,
        project(event.clientX, event.clientY),
        stateRef.current.limites,
      );

      pedido = alvo;
      proximo = alvo;
      if (quadroDaRoda !== undefined) return;

      quadroDaRoda = requestAnimationFrame(() => {
        quadroDaRoda = undefined;
        const entregar = proximo;
        proximo = null;
        // O pedido só vale dentro do quadro: o recorte pode mudar por outro
        // caminho -- botão de zoom, encaixar, espelho -- entre uma rolagem e a
        // seguinte, e partir de um valor velho desfaria o que eles fizeram.
        pedido = null;
        if (entregar) stateRef.current.onViewportChange?.(entregar);
      });
    }

    element.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      if (quadroDaRoda !== undefined) cancelAnimationFrame(quadroDaRoda);
      element.removeEventListener("wheel", handleWheel);
    };
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
      ref={(no) => {
        frameRef.current = no;
        setFrameNo(no);
      }}
      className={cn(
        "relative flex-1 overflow-hidden",
        plano === "quadro" ? "bg-card" : "bg-black",
        className,
      )}
      // Sem isto o browser rouba o gesto de duas mãos para dar zoom na página.
      style={onViewportChange ? { touchAction: "none" } : undefined}
    >
      {/* O fundo: PRIMEIRO filho, então tudo desenha por cima e ele só recebe o
          gesto que sobra -- o clique no vazio, fora do plano. Ver `fundoNo`. */}
      <div
        ref={setFundoNo}
        className="absolute top-0 left-0 h-full w-full"
        style={malha?.fora}
      />

      {/* O plano de BAIXO: o conteúdo da cena, e o único que troca de forma de
          ampliar. Quem desenha nele chega por portal -- ver `planoDeConteudo`. */}
      <div
        ref={envelopeDoConteudoRef}
        aria-hidden={scale === 0}
        // `pointer-events-none` porque esta caixa tem 1920×1080 SEM escala: a
        // ampliação está no filho, e este só desloca. Na tela o plano ocupa
        // `1920 × scale` pixels, mas a caixa transparente do pai continua com o
        // tamanho cheio -- a 39% ela passa 1166 px do plano para a direita e
        // 656 para baixo -- e era ela quem recebia o clique fora do mapa, antes
        // de ele chegar ao `fundoDoPalco`. O sintoma: cravar ponto, colar postit,
        // soltar imagem e desmarcar só funcionavam sobre a imagem do mapa.
        // Medido pelo HUD: `sob o ponteiro: div.absolute.top-0.left-0 1920x1080`,
        // sem `data-palco` na cadeia. O filho religa o ponteiro logo abaixo.
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
          ref={setConteudoNo}
          // `relative` para este ser SEMPRE o containing block do conteúdo. Sem
          // isso, o `absolute inset-0` de dentro se ancora aqui enquanto há
          // `transform` -- que cria containing block -- e escapa para o
          // elemento de fora quando a forma vira `zoom`, que não cria. O
          // sintoma era o mapa saltando e sumindo no instante em que a câmera
          // parava.
          // `pointer-events-auto`: o pai desligou o ponteiro por ter a caixa sem
          // escala; este tem a caixa certa, e é aqui que o mapa recebe o gesto.
          // Quadro: TRANSPARENTE, sem cor nem malha própria. Um quadro não tem
          // chão, e a caixa 1920x1080 não é informação nenhuma nele. Pintada
          // -- mesma cor do fundo, malha própria --, ela aparecia como um
          // retângulo no meio da folha sempre que a câmera andava: em
          // `transform` os pontos de dentro viram bitmap esticado e os de fora
          // continuam nítidos, e a fronteira entre os dois é a borda do plano.
          // Transparente, a malha do fundo atravessa e a folha é uma só.
          // O mapa continua preto: fora do mapa é sala escura, e a imagem cobre
          // o plano de qualquer forma.
          className={cn(
            "pointer-events-auto relative",
            plano === "quadro" ? "" : "bg-black",
          )}
          style={{
            width: SCENE_WIDTH,
            height: SCENE_HEIGHT,
            ...malha?.dentro,
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
        ref={setControlesNo}
        className="plano-de-controles pointer-events-none relative"
        style={{
          width: SCENE_WIDTH,
          height: SCENE_HEIGHT,
          // A alternância do conteúdo com UMA diferença: no quadro, o gesto
          // não conta. O plano também borra esticado, então a ampliação
          // continua mandando; o que saiu foi trocar de forma porque alguém
          // está arrastando algo. Ver `controlesNoLayout`. As medidas de TELA
          // de dentro continuam desfeitas por `emPixelDeTela`, que vale nas
          // duas formas.
          ...(controlesNoLayout
            ? { zoom: scale }
            : { transform: `scale(${scale})`, transformOrigin: "0 0" }),
        }}
      >

        {debug ? <MiraDebug cor="cyan" /> : null}

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

      {/* A MARGEM: postit e cartão, por portal. Ver `planoDaMargem`.
          Depois do plano de controles no DOM, logo por cima dele: o papel
          sempre ficou acima da máscara escura da câmera, e é isso que se
          mantém. 0x0 de propósito -- sem caixa não há transbordo. Só no
          Mestre: a mesa não recebe postit (`sceneForTable`). */}
      {!smooth ? (
        <div
          ref={setMargemNo}
          className={cn(
            "pointer-events-none absolute top-0 left-0",
            scale === 0 && "invisible",
          )}
          style={{
            width: 0,
            height: 0,
            transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
            transformOrigin: "0 0",
          }}
        />
      ) : null}

      {/* O que sobra em volta do recorte, tarjado de preto.

          A moldura da câmera é 16:9 e a tela que assiste raramente é: uma
          janela de navegador, um monitor 16:10. O recorte vai centrado e a
          folga, sem isto, mostrava a cena que continua além da moldura -- o
          mestre enquadrava a sala escondida com o personagem fora da câmera,
          e a TV mostrava o personagem. O enquadramento tem de ser o que ele
          escolheu, e a folga é preto.

          Só onde não se navega: no palco do Mestre a moldura é o próprio
          recorte, e a folga em volta é área de trabalho. Quatro tarjas e não
          um `overflow: hidden` num envelope do tamanho do recorte, porque as
          medidas de tela do palco -- `toScene`, o `ResizeObserver` -- são do
          quadro inteiro, e mudar a caixa que elas medem mexeria em tudo o que
          funciona. */}
      {!onViewportChange && scale !== 0
        ? tarjas(frame, viewport, scale).map((tarja, indice) => (
            <div
              key={indice}
              aria-hidden
              className={cn(
                "pointer-events-none absolute",
                plano === "quadro" ? "bg-card" : "bg-black",
              )}
              style={{ ...tarja, zIndex: 10 }}
            />
          ))
        : null}

      {debug && conteudoNo
        ? createPortal(<MiraDebug cor="magenta" />, conteudoNo)
        : null}
      {debug ? (
        <DebugPalco
          tela={smooth ? "espectador" : "mestre"}
          frame={frameNo}
          conteudo={conteudoNo}
          controles={controlesNo}
          scale={scale}
          offsetX={offsetX}
          offsetY={offsetY}
          modoZoom={conteudoNoLayout}
          viewport={viewport}
        />
      ) : null}
    </div>
  );
}

/**
 * As faixas entre o recorte centrado e a borda do quadro. Duas no máximo -- ou
 * em cima e embaixo, ou nos lados --, e nenhuma quando o quadro tem a proporção
 * do recorte. Abaixo de meio pixel é resto de divisão, não faixa.
 */
function tarjas(
  frame: { width: number; height: number },
  viewport: Viewport,
  scale: number,
): Array<{ left: number; top: number; width: number; height: number }> {
  const sobraX = (frame.width - viewport.width * scale) / 2;
  const sobraY = (frame.height - viewport.height * scale) / 2;
  const faixas = [];

  if (sobraY > 0.5) {
    faixas.push(
      { left: 0, top: 0, width: frame.width, height: sobraY },
      {
        left: 0,
        top: frame.height - sobraY,
        width: frame.width,
        height: sobraY,
      },
    );
  }
  if (sobraX > 0.5) {
    faixas.push(
      { left: 0, top: 0, width: sobraX, height: frame.height },
      {
        left: frame.width - sobraX,
        top: 0,
        width: sobraX,
        height: frame.height,
      },
    );
  }

  return faixas;
}

