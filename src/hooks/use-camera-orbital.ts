"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import type { Bounds } from "@/lib/geometry/bounds";
import {
  agarrarAte,
  aproximar,
  correnteDaCamera,
  daTelaAoChao,
  focalDaLente,
  prender,
  type CameraOrbital,
  type LimitesDaCamera,
  type Tela,
} from "@/lib/geometry/camera-orbital";
import type { Vec } from "@/lib/geometry/transform";

/** Os mesmos números da câmera da foto, para a comparação ser só de modelo. */
const ATRITO = 0.88;
/** Em pixels de TELA por quadro: abaixo disto a deslizada acabou. */
const PARAR_ABAIXO = 0.35;
const GRAUS_POR_PIXEL = 0.4;
const TOMBO_POR_PIXEL = 0.25;
const TOMBO_MAX = 75;

/**
 * Quanto a roda aproxima por pixel de `deltaY`.
 *
 * Exponencial no delta, e não um passo fixo por evento: um entalhe de mouse
 * chega como cem pixels de uma vez, e o trackpad manda o mesmo gesto em dezenas
 * de eventos pequenos. Com o passo fixo, o trackpad disparava; assim os dois
 * aproximam o mesmo pelo mesmo movimento. Cem pixels dão 1,12x.
 */
const RODA_POR_PIXEL = 0.0011;

/** Ampliado até doze vezes o mapa inteiro, e afastado até a metade dele. */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 12;

/**
 * A câmera de mesa de verdade, com os gestos da câmera da foto.
 *
 * Os gestos não mudam -- agarrar o chão, deslizar ao soltar, roda no cursor,
 * botão direito gira com o eixo invertido. O que muda é o que eles movem: um
 * olho sobre a mesa, e não uma imagem dela. Ver `camera-orbital.ts`.
 *
 * Os ouvintes são nativos e na `mesa`, pela razão de `useCameraDeMesa`: correm
 * antes do React, e o `stopPropagation` daqui impede que a ferramenta na mão
 * também responda ao gesto que é da câmera.
 *
 * A `mesa` é criada AQUI e devolvida para quem monta pendurar no `div` do
 * tamanho da tela: é nela que a variável é escrita e os ouvintes moram.
 */
export function useCameraOrbital({
  inicial,
  lente,
  giro,
  inclinacao,
  onGirar,
  arrastar,
  podeAgarrar,
  mapa,
  onSair,
  onAssentar,
}: {
  /** A câmera do primeiro quadro, já sabendo o tamanho da tela. */
  inicial: (tela: Tela) => CameraOrbital;
  /** A abertura vertical da lente, em graus. */
  lente: number;
  giro: number;
  inclinacao: number;
  onGirar: (vista: { giro: number; inclinacao: number }) => void;
  /** Espaço segurado: o botão esquerdo é da câmera em qualquer lugar. */
  arrastar: boolean;
  /**
   * Se o botão esquerdo neste alvo agarra o chão.
   *
   * Quem monta decide, porque depende da ferramenta: com "mover" na mão, o
   * chão vazio anda a câmera e a peça anda a peça.
   */
  podeAgarrar: (alvo: EventTarget | null) => boolean;
  /** De onde o alvo não sai, em unidades de cena. */
  mapa: Bounds;
  /** Devolve a câmera ao sair, para quem monta não perder o lugar. */
  onSair?: (camera: CameraOrbital, tela: Tela) => void;
  /**
   * O gesto acabou -- soltou e a deslizada parou.
   *
   * É a hora de gravar o que precisa ser gravado, e não a cada quadro: o
   * Mestre leva o giro para a cena aqui, uma vez, como o gesto de token grava
   * no soltar (ver `useGestoStore`). Gravar por quadro seria um desfazer e um
   * envio ao disco por quadro.
   */
  onAssentar?: (camera: CameraOrbital) => void;
}): {
  /** O `div` do tamanho da tela. */
  mesa: RefObject<HTMLDivElement | null>;
  /**
   * A corrente da câmera agora, e o aviso de quando ela muda.
   *
   * Andar e aproximar NÃO passam pelo React: quem desenha assina e reescreve o
   * `transform` dos próprios elementos. Nem por variável CSS, que no WebKit
   * repinta a subárvore inteira a cada troca. Ver `orbital` em `ChaoInclinado`.
   */
  corrente: () => string;
  assinar: (aviso: () => void) => () => void;
  /** A focal em pixels, para o `perspective`. Zero até a tela ser medida. */
  focal: number;
  /** A tela medida, em pixels. `null` até a primeira medida. */
  tamanho: { largura: number; altura: number } | null;
  /** O ponto do chão sob o cursor, ou `null` no céu. */
  paraChao: (clientX: number, clientY: number) => Vec | null;
} {
  const [tamanho, setTamanho] = useState<{
    largura: number;
    altura: number;
  } | null>(null);
  const focal = tamanho ? focalDaLente(tamanho.altura, lente) : 0;

  const mesa = useRef<HTMLDivElement | null>(null);
  const camera = useRef<CameraOrbital | null>(null);
  const tela = useRef<Tela | null>(null);
  /**
   * Um gesto está mexendo na câmera agora.
   *
   * Enquanto estiver, o giro e o tombo que voltam por props são ECO do próprio
   * gesto, e podem chegar um quadro atrasados. Aplicá-los puxaria a mesa de
   * volta para o passo anterior.
   */
  const ocupado = useRef(false);
  const ouvintes = useRef(new Set<() => void>());

  const agora = useRef({
    inicial,
    onGirar,
    arrastar,
    podeAgarrar,
    mapa,
    onSair,
    onAssentar,
  });
  useEffect(() => {
    agora.current = {
      inicial,
      onGirar,
      arrastar,
      podeAgarrar,
      mapa,
      onSair,
      onAssentar,
    };
  });

  const corrente = useCallback(
    () =>
      camera.current && tela.current
        ? correnteDaCamera(camera.current, tela.current)
        : "",
    [],
  );

  const assinar = useCallback((aviso: () => void) => {
    ouvintes.current.add(aviso);
    return () => {
      ouvintes.current.delete(aviso);
    };
  }, []);

  const aplicar = useCallback(() => {
    if (!camera.current || !tela.current) return;
    for (const aviso of ouvintes.current) aviso();
  }, []);

  // A tela medida pelo observador, e não no corpo do efeito: o primeiro
  // relatório chega antes da pintura, e é o setState fora do efeito que a
  // regra do repositório pede.
  useLayoutEffect(() => {
    const elemento = mesa.current;
    if (!elemento) return;

    const observador = new ResizeObserver(([entrada]) => {
      const caixa = entrada?.contentRect;
      if (!caixa || caixa.width === 0 || caixa.height === 0) return;
      setTamanho({ largura: caixa.width, altura: caixa.height });
    });
    observador.observe(elemento);

    return () => observador.disconnect();
  }, []);

  // A tela, a lente e a vista que vêm de fora entram aqui -- inclusive o
  // painel mexendo no giro, que tem de valer como o botão direito vale.
  useLayoutEffect(() => {
    if (!tamanho) return;

    tela.current = { ...tamanho, focal };
    if (!camera.current) camera.current = agora.current.inicial(tela.current);
    if (!ocupado.current) {
      camera.current = { ...camera.current, giro, inclinacao };
    }
    aplicar();
  }, [aplicar, focal, giro, inclinacao, tamanho]);

  // Ao desmontar, a câmera volta para quem a montou.
  useEffect(
    () => () => {
      if (camera.current && tela.current) {
        agora.current.onSair?.(camera.current, tela.current);
      }
    },
    [],
  );

  const paraChao = useCallback(
    (clientX: number, clientY: number): Vec | null => {
      const elemento = mesa.current;
      if (!elemento || !camera.current || !tela.current) return null;
      const caixa = elemento.getBoundingClientRect();

      return daTelaAoChao(camera.current, tela.current, {
        x: clientX - caixa.left,
        y: clientY - caixa.top,
      });
    },
    [],
  );

  useEffect(() => {
    const elemento = mesa.current;
    if (!elemento) return;

    let agarrado: Vec | null = null;
    let girando: Vec | null = null;
    let velocidade: Vec = { x: 0, y: 0 };
    let giroVel = 0;
    let tomboVel = 0;
    let quadro: number | undefined;

    function limites(): LimitesDaCamera | null {
      const atual = tela.current;
      if (!atual) return null;
      const { mapa } = agora.current;
      const largura = mapa.maxX - mapa.minX;
      const altura = mapa.maxY - mapa.minY;
      const inteiro = Math.min(atual.largura / largura, atual.altura / altura);

      return {
        x: mapa.minX,
        y: mapa.minY,
        width: largura,
        height: altura,
        zoomMin: inteiro * ZOOM_MIN,
        zoomMax: inteiro * ZOOM_MAX,
      };
    }

    function noPixel(evento: { clientX: number; clientY: number }): Vec {
      const caixa = elemento!.getBoundingClientRect();
      return { x: evento.clientX - caixa.left, y: evento.clientY - caixa.top };
    }

    function girar(dGiro: number, dTombo: number) {
      const atual = camera.current;
      if (!atual) return;

      const proxima = {
        ...atual,
        giro: (((atual.giro + dGiro) % 360) + 360) % 360,
        inclinacao: Math.min(TOMBO_MAX, Math.max(0, atual.inclinacao + dTombo)),
      };
      camera.current = proxima;
      aplicar();
      agora.current.onGirar({
        giro: proxima.giro,
        inclinacao: proxima.inclinacao,
      });
    }

    function andar(passo: Vec) {
      const atual = camera.current;
      const presa = limites();
      if (!atual || !presa) return;

      camera.current = prender(
        {
          ...atual,
          alvo: { x: atual.alvo.x + passo.x, y: atual.alvo.y + passo.y },
        },
        presa,
      );
      aplicar();
    }

    /** O gesto acabou de verdade: avisa quem monta. Ver `onAssentar`. */
    function assentar() {
      ocupado.current = false;
      if (camera.current) agora.current.onAssentar?.(camera.current);
    }

    function pararDeslizar() {
      if (quadro !== undefined) cancelAnimationFrame(quadro);
      quadro = undefined;
      velocidade = { x: 0, y: 0 };
      giroVel = 0;
      tomboVel = 0;
    }

    function deslizar() {
      velocidade = { x: velocidade.x * ATRITO, y: velocidade.y * ATRITO };
      giroVel *= ATRITO;
      tomboVel *= ATRITO;

      // A deslizada é medida na TELA: a velocidade anda em unidade de chão, e
      // ampliado o mesmo resto de chão é muito mais pixel.
      const zoom = camera.current?.zoom ?? 1;
      const andou =
        Math.hypot(velocidade.x, velocidade.y) * zoom >= PARAR_ABAIXO;
      const girou = Math.hypot(giroVel, tomboVel) >= PARAR_ABAIXO / 8;

      if (!andou && !girou) {
        pararDeslizar();
        assentar();
        return;
      }

      if (andou) andar(velocidade);
      if (girou) girar(giroVel, tomboVel);
      quadro = requestAnimationFrame(deslizar);
    }

    function desceu(evento: PointerEvent) {
      if (evento.button === 2) {
        evento.preventDefault();
        evento.stopPropagation();
        pararDeslizar();
        ocupado.current = true;
        girando = { x: evento.clientX, y: evento.clientY };
        elemento!.setPointerCapture(evento.pointerId);
        return;
      }

      const daCamera =
        evento.button === 1 ||
        (evento.button === 0 &&
          (agora.current.arrastar || agora.current.podeAgarrar(evento.target)));
      if (!daCamera || !camera.current || !tela.current) return;

      const ponto = daTelaAoChao(camera.current, tela.current, noPixel(evento));
      if (!ponto) return;

      evento.preventDefault();
      evento.stopPropagation();
      pararDeslizar();
      ocupado.current = true;
      agarrado = ponto;
      elemento!.setPointerCapture(evento.pointerId);
    }

    function andou(evento: PointerEvent) {
      if (girando) {
        evento.stopPropagation();
        const dx = evento.clientX - girando.x;
        const dy = evento.clientY - girando.y;
        girando = { x: evento.clientX, y: evento.clientY };

        // Os sinais da câmera da foto: o olhar vai para onde o mouse vai, e
        // puxar para baixo empurra a mesa para longe até vê-la de cima.
        const dGiro = -dx * GRAUS_POR_PIXEL;
        const dTombo = -dy * TOMBO_POR_PIXEL;
        girar(dGiro, dTombo);
        giroVel = dGiro;
        tomboVel = dTombo;
        return;
      }

      if (!agarrado || !camera.current || !tela.current) return;
      evento.stopPropagation();

      const presa = limites();
      if (!presa) return;
      const antes = camera.current.alvo;
      camera.current = prender(
        agarrarAte(camera.current, tela.current, agarrado, noPixel(evento)),
        presa,
      );
      aplicar();

      velocidade = {
        x: camera.current.alvo.x - antes.x,
        y: camera.current.alvo.y - antes.y,
      };
    }

    function soltou(evento: PointerEvent) {
      if (!agarrado && !girando) return;
      agarrado = null;
      girando = null;
      if (elemento!.hasPointerCapture(evento.pointerId)) {
        elemento!.releasePointerCapture(evento.pointerId);
      }

      const zoom = camera.current?.zoom ?? 1;
      if (
        Math.hypot(velocidade.x, velocidade.y) * zoom >= PARAR_ABAIXO ||
        Math.hypot(giroVel, tomboVel) >= PARAR_ABAIXO / 8
      ) {
        quadro = requestAnimationFrame(deslizar);
      } else {
        assentar();
      }
    }

    function rodou(evento: WheelEvent) {
      evento.preventDefault();
      evento.stopPropagation();
      if (!camera.current || !tela.current) return;
      const presa = limites();
      if (!presa) return;
      pararDeslizar();
      // A roda corta a deslizada, e com ela o gesto: o próximo giro do painel
      // já vale.
      if (!agarrado && !girando && ocupado.current) assentar();

      // Em linhas (Firefox), cada uma vale um terço de entalhe.
      const delta = evento.deltaMode === 1 ? evento.deltaY * 33 : evento.deltaY;
      camera.current = aproximar(
        camera.current,
        tela.current,
        Math.exp(-delta * RODA_POR_PIXEL),
        noPixel(evento),
        presa,
      );
      aplicar();
    }

    /** O direito é câmera, e o botão do meio não vira rolagem automática. */
    function semMenu(evento: MouseEvent) {
      evento.preventDefault();
    }
    function semRolagem(evento: MouseEvent) {
      if (evento.button === 1) evento.preventDefault();
    }

    elemento.addEventListener("pointerdown", desceu);
    elemento.addEventListener("pointermove", andou);
    elemento.addEventListener("pointerup", soltou);
    elemento.addEventListener("pointercancel", soltou);
    elemento.addEventListener("wheel", rodou, { passive: false });
    elemento.addEventListener("contextmenu", semMenu);
    elemento.addEventListener("mousedown", semRolagem);

    return () => {
      pararDeslizar();
      elemento.removeEventListener("pointerdown", desceu);
      elemento.removeEventListener("pointermove", andou);
      elemento.removeEventListener("pointerup", soltou);
      elemento.removeEventListener("pointercancel", soltou);
      elemento.removeEventListener("wheel", rodou);
      elemento.removeEventListener("contextmenu", semMenu);
      elemento.removeEventListener("mousedown", semRolagem);
    };
  }, [aplicar]);

  return { mesa, focal, tamanho, paraChao, corrente, assinar };
}
