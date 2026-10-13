"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FULL_VIEWPORT } from "@/lib/geometry/viewport";
import {
  aproximarEm,
  deslocarZoom,
  PASSO_DO_ZOOM,
  recorteComZoom,
  temZoom,
  ZOOM_NEUTRO,
  type ZoomDaMesa,
} from "@/lib/geometry/zoom-da-mesa";
import type { Viewport } from "@/types/scene";

/**
 * O que não é mapa dentro da moldura: os controles do jogador, os botões, a
 * evidência. O mesmo filtro da roda de ping, mais o `data-sem-zoom`.
 */
const NAO_E_MAPA =
  "[data-sem-ping], [data-sem-zoom], button, a, input, textarea, select, [contenteditable=true]";

/** Abaixo disto o dedo só encostou: o clique que vem depois é clique. */
const ARRASTO_PX = 6;

/** A lupa, com o corte de câmera em que ela foi feita. Ver `useZoomDaMesa`. */
type Estado = { corte: number; zoom: ZoomDaMesa };

/**
 * O zoom de quem assiste, na tela do jogador e na do espectador: pinça, Ctrl
 * com a roda (que é também a pinça do trackpad), Ctrl com + − 0, e os botões
 * de `ControlesDeZoom`. Com zoom, arrastar com um dedo ou com o mouse anda
 * pelo recorte.
 *
 * O resultado é um RECORTE para o `SceneStage`, e não uma escala em CSS por
 * cima dele: o palco continua desenhando o que pediram, as tarjas continuam
 * cobrindo o que está fora, e o `toScene` do ping e do token continua certo
 * sem saber que há zoom. E o palco não navega sozinho (`onViewportChange`)
 * porque, navegando, ele tira as tarjas -- que é o que esconde da mesa o que o
 * mestre deixou fora da câmera. Ver `zoom-da-mesa.ts`.
 *
 * Cada corte de câmera volta ao enquadramento do mestre: a lupa é guardada
 * junto do `corte` em que foi feita, e um corte novo é outro recorte sobre
 * outro mapa, onde aquele zoom não quer dizer nada. A câmera que só ANDA leva a
 * lupa junto.
 *
 * `tecladoSempre`: o Ctrl + − 0 vale na página inteira. Sem ele, só com o
 * ponteiro em cima do mapa -- no celular o mapa divide a tela com a ficha e o
 * chat, e lá o Ctrl + é o zoom da página.
 */
export function useZoomDaMesa({
  base: recorteDoMestre,
  corte,
  ativo,
  tecladoSempre = false,
}: {
  /** O recorte que o mestre mandou. Ausente = o plano inteiro. */
  base: Viewport | undefined;
  corte: number;
  /** Há cena na tela. Sem ela não há o que aproximar. */
  ativo: boolean;
  tecladoSempre?: boolean;
}): {
  /** O recorte a desenhar. Sem zoom, o do mestre, o mesmo objeto. */
  viewport: Viewport;
  zoom: ZoomDaMesa;
  /** Há um gesto em curso: o palco não interpola, senão a pinça correria atrás dos dedos. */
  direto: boolean;
  /** A moldura que recebe o gesto. */
  alvo: (no: HTMLElement | null) => void;
  aproximar: () => void;
  afastar: () => void;
  voltar: () => void;
} {
  const base = recorteDoMestre ?? FULL_VIEWPORT;
  const [estado, setEstado] = useState<Estado>({ corte, zoom: ZOOM_NEUTRO });
  const [direto, setDireto] = useState(false);
  const [alvo, setAlvo] = useState<HTMLElement | null>(null);

  // A lupa de outro corte é a do mestre. Derivado, e não zerado num efeito:
  // o quadro entre o corte e o efeito sairia com o zoom velho no recorte novo.
  const zoom = estado.corte === corte ? estado.zoom : ZOOM_NEUTRO;

  /**
   * O que os ouvintes nativos leem. Eles são registrados uma vez por moldura, e
   * a pinça a 120 Hz não espera um render para saber onde a lupa está: o
   * `estado` aqui é o que o ÚLTIMO passo escreveu, mesmo antes de virar render.
   */
  const viva = useRef({ estado, corte, base, ativo, tecladoSempre });
  useEffect(() => {
    // O `estado` fica de fora: quem o escreve na ref é o `definir`, antes do
    // render, e um render atrasado traria de volta o passo de antes.
    viva.current = { ...viva.current, corte, base, ativo, tecladoSempre };
  });

  /** A lupa agora, para quem vai mexer nela. */
  const atual = useCallback((): ZoomDaMesa => {
    const { estado: guardado, corte: agora } = viva.current;
    return guardado.corte === agora ? guardado.zoom : ZOOM_NEUTRO;
  }, []);

  const quadro = useRef<number | undefined>(undefined);

  /**
   * Grava a lupa nova. `jaNoQuadro` junta os passos do gesto num render por
   * quadro: a pinça e o trackpad entregam vários eventos por quadro, e cada um
   * seria um render da cena inteira.
   */
  const definir = useCallback((novo: ZoomDaMesa, jaNoQuadro = false) => {
    const proximo = { corte: viva.current.corte, zoom: novo };
    viva.current.estado = proximo;

    if (!jaNoQuadro) {
      setEstado(proximo);
      return;
    }
    if (quadro.current !== undefined) return;

    quadro.current = requestAnimationFrame(() => {
      quadro.current = undefined;
      setEstado(viva.current.estado);
    });
  }, []);

  useEffect(
    () => () => {
      if (quadro.current !== undefined) cancelAnimationFrame(quadro.current);
    },
    [],
  );

  const aproximar = useCallback(
    () => definir(aproximarEm(atual(), PASSO_DO_ZOOM, { x: 0.5, y: 0.5 })),
    [atual, definir],
  );
  const afastar = useCallback(
    () => definir(aproximarEm(atual(), 1 / PASSO_DO_ZOOM, { x: 0.5, y: 0.5 })),
    [atual, definir],
  );
  const voltar = useCallback(() => definir(ZOOM_NEUTRO), [definir]);

  useEffect(() => {
    if (!alvo) return;
    const moldura = alvo;

    /**
     * Onde o recorte pousa na tela, em pixels de cliente. A mesma conta do
     * `recorteNaTela` do palco: o recorte com zoom tem o formato do do mestre,
     * então a caixa na tela é a mesma em qualquer ampliação.
     */
    function recorteNaTela() {
      const caixa = moldura.getBoundingClientRect();
      const { base: b } = viva.current;
      const escala = Math.min(caixa.width / b.width, caixa.height / b.height);
      const largura = b.width * escala;
      const altura = b.height * escala;

      return {
        left: caixa.left + (caixa.width - largura) / 2,
        top: caixa.top + (caixa.height - altura) / 2,
        largura,
        altura,
      };
    }

    /** O ponto da tela em fração do recorte desenhado. */
    function fracao(clientX: number, clientY: number) {
      const r = recorteNaTela();
      return { x: (clientX - r.left) / r.largura, y: (clientY - r.top) / r.altura };
    }

    const dedos = new Map<number, { x: number; y: number }>();
    /** A pinça: a distância e o meio dos dois dedos no passo anterior. */
    let pinca: { distancia: number; meio: { x: number; y: number } } | null = null;
    /**
     * De onde o arrasto de um dedo conta: o ponto do aperto, e depois o do
     * último passo. O aperto, e não o passo de antes, enquanto o dedo não
     * passou de `ARRASTO_PX`: senão os primeiros pixels ficavam na zona morta,
     * e o mapa andava sempre atrás do dedo.
     */
    let origem: { x: number; y: number } | null = null;
    let andou = 0;

    function medirPinca() {
      const [a, b] = [...dedos.values()];
      if (!a || !b) return null;

      return {
        distancia: Math.hypot(a.x - b.x, a.y - b.y),
        meio: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
    }

    function aoApertar(event: PointerEvent) {
      if (!viva.current.ativo) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest(NAO_E_MAPA)) return;

      dedos.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (dedos.size === 1) {
        andou = 0;
        origem = { x: event.clientX, y: event.clientY };
      }

      if (dedos.size === 2) {
        pinca = medirPinca();
        origem = null;
        setDireto(true);
      }
    }

    function aoMover(event: PointerEvent) {
      const antes = dedos.get(event.pointerId);
      if (!antes) return;

      const agora = { x: event.clientX, y: event.clientY };
      dedos.set(event.pointerId, agora);
      andou += Math.hypot(agora.x - antes.x, agora.y - antes.y);

      const { largura, altura } = recorteNaTela();
      if (largura === 0 || altura === 0) return;

      if (dedos.size >= 2) {
        const medida = medirPinca();
        if (!pinca || !medida || pinca.distancia === 0) {
          pinca = medida;
          return;
        }

        // Primeiro anda com o meio dos dedos, depois amplia em volta dele: os
        // dois dedos arrastando juntos movem o mapa, abrindo aproximam.
        const deslocado = deslocarZoom(
          atual(),
          (medida.meio.x - pinca.meio.x) / largura,
          (medida.meio.y - pinca.meio.y) / altura,
        );
        definir(
          aproximarEm(
            deslocado,
            medida.distancia / pinca.distancia,
            fracao(medida.meio.x, medida.meio.y),
          ),
          true,
        );
        pinca = medida;
        return;
      }

      // Um dedo só arrasta com zoom: sem ele não há para onde ir, e o dedo
      // parado é o toque longo do ping.
      const zoomAgora = atual();
      if (!temZoom(zoomAgora) || andou < ARRASTO_PX) return;

      const de = origem ?? antes;
      origem = agora;
      setDireto(true);
      definir(
        deslocarZoom(zoomAgora, (agora.x - de.x) / largura, (agora.y - de.y) / altura),
        true,
      );
    }

    function aoSoltar(event: PointerEvent) {
      if (!dedos.delete(event.pointerId)) return;
      if (dedos.size < 2) pinca = null;
      // Da pinça para um dedo: o arrasto segue de onde o dedo que ficou está.
      if (dedos.size === 1) origem = [...dedos.values()][0] ?? null;
      if (dedos.size > 0) return;

      setDireto(false);
      // Arrastou: o `click` que o navegador manda ao soltar não é clique. Sem
      // isto, soltar o mapa em cima de um token abriria o que o toque abre.
      if (andou >= ARRASTO_PX) calarOProximoClique();
    }

    function aoRolar(event: WheelEvent) {
      if (!viva.current.ativo || !(event.ctrlKey || event.metaKey)) return;

      // A roda com Ctrl é o zoom da PÁGINA, e a pinça do trackpad chega assim.
      // Sobre o mapa, é o do mapa.
      event.preventDefault();

      // Linhas (Firefox) e páginas valem como pixels: um entalhe de roda dá
      // ~1,2x, e a pinça do trackpad, com deltas pequenos, anda contínuo.
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1);
      const passo = Math.min(2, Math.max(0.5, Math.exp(-pixels * 0.002)));

      definir(aproximarEm(atual(), passo, fracao(event.clientX, event.clientY)), true);
    }

    moldura.addEventListener("pointerdown", aoApertar);
    moldura.addEventListener("wheel", aoRolar, { passive: false });
    window.addEventListener("pointermove", aoMover);
    window.addEventListener("pointerup", aoSoltar);
    window.addEventListener("pointercancel", aoSoltar);

    return () => {
      moldura.removeEventListener("pointerdown", aoApertar);
      moldura.removeEventListener("wheel", aoRolar);
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerup", aoSoltar);
      window.removeEventListener("pointercancel", aoSoltar);
    };
  }, [alvo, atual, definir]);

  // O teclado: Ctrl com + − 0, como o zoom da página que ele substitui.
  useEffect(() => {
    let sobreOMapa = false;
    const aoEntrar = () => {
      sobreOMapa = true;
    };
    const aoSair = () => {
      sobreOMapa = false;
    };

    function aoTeclar(event: KeyboardEvent) {
      const { ativo: temCena, tecladoSempre: sempre } = viva.current;
      if (!temCena || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (!sempre && !sobreOMapa) return;
      if (
        event.target instanceof Element &&
        event.target.closest("input, textarea, [contenteditable=true]")
      ) {
        return;
      }

      const tecla = event.key;
      if (tecla === "+" || tecla === "=" || event.code === "NumpadAdd") {
        event.preventDefault();
        aproximar();
      } else if (tecla === "-" || tecla === "_" || event.code === "NumpadSubtract") {
        event.preventDefault();
        afastar();
      } else if (tecla === "0" || event.code === "Numpad0") {
        event.preventDefault();
        voltar();
      }
    }

    alvo?.addEventListener("pointerenter", aoEntrar);
    alvo?.addEventListener("pointerleave", aoSair);
    window.addEventListener("keydown", aoTeclar);

    return () => {
      alvo?.removeEventListener("pointerenter", aoEntrar);
      alvo?.removeEventListener("pointerleave", aoSair);
      window.removeEventListener("keydown", aoTeclar);
    };
  }, [alvo, aproximar, afastar, voltar]);

  // Memoizado: com zoom o recorte é um objeto novo, e o palco o põe no
  // contexto -- um por render faria tudo o que lê a escala redesenhar.
  const viewport = useMemo(() => recorteComZoom(base, zoom), [base, zoom]);

  return {
    viewport,
    zoom,
    direto,
    alvo: setAlvo,
    aproximar,
    afastar,
    voltar,
  };
}

/** Engole o próximo `click`, que é o do fim de um arrasto. */
function calarOProximoClique() {
  function calar(event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
  }

  window.addEventListener("click", calar, { capture: true, once: true });
  // Se o clique não vier -- o toque que vira arrasto nem sempre gera um --, o
  // próximo clique de verdade não pode ser engolido.
  window.setTimeout(() => window.removeEventListener("click", calar, true), 400);
}
