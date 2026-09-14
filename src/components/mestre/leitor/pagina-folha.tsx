"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

/**
 * Quanto se desenha por pixel de tela.
 *
 * Limitado a 2 mesmo em tela que reporta 3: a área do canvas cresce com o
 * QUADRADO disto, e uma página A4 a 3× num zoom de 200% passa de 50 megapixels
 * — memória de vídeo gasta num detalhe que ninguém distingue num manual de
 * texto.
 */
const DPR_MAX = 2;

/** O diâmetro da lente, em pixels de tela. */
const LENTE_PX = 260;

/**
 * Quanto se espera parado antes de pedir o recorte nítido.
 *
 * Sem isso, arrastar a lupa por meia página dispara uma renderização por pixel
 * de movimento — cada uma cancelando a anterior, e o worker gastando o tempo
 * dele em recortes que ninguém chegou a ver. O esticado cobre o movimento; o
 * nítido é para quando o dedo para, que é quando se lê.
 */
const NITIDO_MS = 90;

/**
 * Uma folha do livro: a caixa sempre, o desenho quando pedido.
 *
 * A caixa existe desde o começo com a ALTURA RESERVADA, e é o que dá uma barra
 * de rolagem do tamanho do manual sem ter aberto uma página. Só quando
 * `desenhar` chega verdadeiro é que a página é pedida ao worker e pintada — e
 * ela continua pintada enquanto o leitor a mantiver, o que é o cache: subir e
 * descer relendo a mesma seção não redesenha nada.
 *
 * A proporção começa emprestada da primeira página (`razaoPadrao`) e é
 * corrigida pela medida real quando a folha desenha. Manual costuma ter todas as
 * páginas do mesmo tamanho, então a estimativa acerta; quando erra — uma prancha
 * dobrada no meio do livro —, a caixa se ajusta ao desenhar, e o preço é um
 * pequeno salto na rolagem. A alternativa era pedir as trezentas páginas ao
 * worker só para medi-las, na abertura, o que é exatamente o que este leitor
 * existe para não fazer.
 */
export function PaginaFolha({
  doc,
  numero,
  largura,
  razaoPadrao,
  desenhar,
  registrar,
  lupa,
  ampliacao,
  aoAmpliar,
}: {
  doc: PDFDocumentProxy;
  numero: number;
  /** Largura da folha em pixels de tela. Sai do zoom, no leitor. */
  largura: number;
  /** Altura dividida pela largura, da primeira página. Ver acima. */
  razaoPadrao: number;
  desenhar: boolean;
  registrar: (elemento: HTMLElement | null) => void;
  /** A ferramenta de lupa está armada. */
  lupa: boolean;
  ampliacao: number;
  aoAmpliar: (delta: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const lente = useRef<HTMLCanvasElement | null>(null);
  const caixa = useRef<HTMLDivElement | null>(null);

  /**
   * O diâmetro que cabe nesta folha.
   *
   * Uma lente de 260 pixels numa folha de 200 — leitor estreito, zoom baixo —
   * transbordaria para o lado da página e mostraria o vazio ao redor dela.
   */
  const lentePx = Math.min(LENTE_PX, Math.max(80, Math.floor(largura)));

  /** A proporção medida desta página. `null` enquanto ela nunca desenhou. */
  const [razao, setRazao] = useState<number | null>(null);

  /**
   * O que já está no canvas, como chave do pedido que o produziu.
   *
   * Derivar "está desenhando" da comparação com o pedido atual em vez de
   * escrever no corpo do efeito: `setState` ali dispara render em cascata, e
   * aqui render significa redesenhar a página.
   */
  const [desenhada, setDesenhada] = useState<string | null>(null);
  const pedido = `${numero}:${largura}`;

  /** Onde a lupa está, em pixels da própria folha. `null` = solta. */
  const [foco, setFoco] = useState<{ x: number; y: number } | null>(null);

  /**
   * O `ref` da caixa, guardado.
   *
   * Duas coisas precisam do elemento: os observadores de rolagem, lá fora, e a
   * roda da lupa, aqui dentro. Uma seta inline serviria às duas, mas um `ref`
   * com identidade nova é chamado com `null` e de novo com o elemento a cada
   * render — e isso soltaria e reobservaria a folha em cada passada.
   */
  const refCaixa = useCallback(
    (elemento: HTMLDivElement | null) => {
      caixa.current = elemento;
      registrar(elemento);
    },
    [registrar],
  );

  useEffect(() => {
    if (!desenhar || largura <= 0) return;

    let ativo = true;
    let tarefa: RenderTask | null = null;

    void (async () => {
      try {
        const page = await doc.getPage(numero);
        if (!ativo) return;

        const natural = page.getViewport({ scale: 1 });
        setRazao(natural.height / natural.width);

        const viewport = page.getViewport({ scale: largura / natural.width });

        const alvo = canvas.current;
        const contexto = alvo?.getContext("2d");
        if (!alvo || !contexto) return;

        const dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);

        // Duas medidas para o mesmo canvas: o atributo é a resolução em que se
        // desenha, e o CSS é o tamanho que ele ocupa. Sem essa separação, a
        // página sai borrada em tela de alta densidade.
        alvo.width = Math.floor(viewport.width * dpr);
        alvo.height = Math.floor(viewport.height * dpr);
        alvo.style.width = `${Math.floor(viewport.width)}px`;
        alvo.style.height = `${Math.floor(viewport.height)}px`;

        contexto.setTransform(dpr, 0, 0, dpr, 0, 0);

        tarefa = page.render({
          canvas: alvo,
          canvasContext: contexto,
          viewport,
        });
        await tarefa.promise;

        if (ativo) setDesenhada(pedido);
      } catch (cause) {
        // `RenderingCancelledException` é o caminho NORMAL de rolar depressa: a
        // tarefa é cancelada de propósito na limpeza, e tratar isso como falha
        // acenderia um erro a cada gesto de rolagem.
        if (
          ativo &&
          !(
            cause instanceof Error &&
            cause.name === "RenderingCancelledException"
          )
        ) {
          setDesenhada(pedido);
        }
      }
    })();

    return () => {
      ativo = false;
      tarefa?.cancel();
    };
  }, [doc, numero, largura, desenhar, pedido]);

  /**
   * O que a lente mostra: o recorte, redesenhado pelo pdf.js na ampliação.
   *
   * Duas passadas de propósito. A primeira estica o bitmap da própria página, e
   * sai na hora — é ela que faz a lente acompanhar o dedo sem atraso. A segunda
   * pede o mesmo recorte ao worker na escala ampliada e pinta por cima quando
   * chega, e é a única que serve ao propósito da ferramenta: ampliar um bitmap
   * de 100% não revela nada, e a lupa existe justamente para a tabela miúda e a
   * nota de rodapé de manual.
   */
  useEffect(() => {
    if (!foco || !razao) return;

    const alvoLente = lente.current;
    const contextoLente = alvoLente?.getContext("2d");
    const fonte = canvas.current;
    if (!alvoLente || !contextoLente || !fonte) return;

    const dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);

    alvoLente.width = Math.floor(lentePx * dpr);
    alvoLente.height = Math.floor(lentePx * dpr);

    // Passada barata: o pedaço do canvas da página, esticado. A fonte está em
    // pixels de dispositivo, então o recorte também.
    const janela = (lentePx / ampliacao) * dpr;
    contextoLente.setTransform(1, 0, 0, 1, 0, 0);
    contextoLente.imageSmoothingEnabled = true;
    contextoLente.drawImage(
      fonte,
      foco.x * dpr - janela / 2,
      foco.y * dpr - janela / 2,
      janela,
      janela,
      0,
      0,
      alvoLente.width,
      alvoLente.height,
    );

    let ativo = true;
    let tarefa: RenderTask | null = null;

    const espera = setTimeout(() => {
      void (async () => {
        try {
          const page = await doc.getPage(numero);
          if (!ativo) return;

          const natural = page.getViewport({ scale: 1 });
          const escala = (largura / natural.width) * ampliacao * dpr;
          const viewport = page.getViewport({ scale: escala });

          // O `transform` desloca a página ANTES da viewport, e é o que recorta:
          // o ponto sob o dedo vai para o centro da lente. Sem ele, a lente
          // mostraria o canto de cima da página ampliada.
          const meio = (lentePx / 2) * dpr;
          const transform = [
            1,
            0,
            0,
            1,
            -(foco.x * ampliacao * dpr - meio),
            -(foco.y * ampliacao * dpr - meio),
          ];

          tarefa = page.render({
            canvas: alvoLente,
            canvasContext: contextoLente,
            viewport,
            transform,
            // O fundo é pintado pelo pdf.js: sem isto o recorte nítido chega
            // sobre o esticado, e a tinta antiga aparece nas bordas.
            background: "#ffffff",
          });

          await tarefa.promise;
        } catch {
          // Cancelamento é o caminho normal: mover a lupa substitui o pedido
          // anterior. O esticado continua na lente.
        }
      })();
    }, NITIDO_MS);

    return () => {
      ativo = false;
      clearTimeout(espera);
      tarefa?.cancel();
    };
  }, [doc, numero, largura, ampliacao, foco, razao, lentePx]);

  /**
   * A roda ajusta a ampliação enquanto a lupa está segurada.
   *
   * Ouvinte nativo e não `onWheel`, porque este precisa de `passive: false`: sem
   * cancelar o evento, a roda rola o livro sob a lente e o gesto de regular a
   * lupa viraria um gesto de perder o lugar.
   */
  useEffect(() => {
    const alvo = caixa.current;
    if (!alvo || !foco) return;

    function aoRodar(evento: WheelEvent) {
      evento.preventDefault();
      evento.stopPropagation();

      aoAmpliar(evento.deltaY < 0 ? 1 : -1);
    }

    alvo.addEventListener("wheel", aoRodar, { passive: false });

    return () => alvo.removeEventListener("wheel", aoRodar);
  }, [foco, aoAmpliar]);

  /** O ponto do gesto, em pixels da folha e limitado a ela. */
  function pontoDe(evento: React.PointerEvent<HTMLDivElement>) {
    const retangulo = evento.currentTarget.getBoundingClientRect();

    return {
      x: Math.min(
        Math.max(evento.clientX - retangulo.left, 0),
        retangulo.width,
      ),
      y: Math.min(
        Math.max(evento.clientY - retangulo.top, 0),
        retangulo.height,
      ),
    };
  }

  const altura = Math.round(largura * (razao ?? razaoPadrao));
  const pronta = desenhar && desenhada === pedido;

  return (
    <div
      ref={refCaixa}
      // Lido pelos observadores para saber de que página é a caixa: o alvo de um
      // `IntersectionObserver` é o elemento, e ele precisa dizer quem é.
      data-pagina={numero}
      // Fundo branco declarado, e não herdado: o canvas do pdf.js desenha só a
      // tinta, e no tema escuro uma página sem fundo próprio apareceria como
      // texto preto sobre preto.
      className={`relative mx-auto bg-white shadow-sm ${
        lupa && pronta ? "cursor-zoom-in touch-none select-none" : ""
      }`}
      style={{ width: largura, height: altura }}
      aria-label={`Página ${numero}`}
      onPointerDown={(evento) => {
        if (!lupa || !pronta || evento.button !== 0) return;

        // Captura o ponteiro: a lente segue o dedo mesmo quando ele sai da
        // folha, e soltar fora dela continua terminando o gesto.
        evento.currentTarget.setPointerCapture(evento.pointerId);
        evento.preventDefault();

        setFoco(pontoDe(evento));
      }}
      onPointerMove={(evento) => {
        if (!foco) return;

        setFoco(pontoDe(evento));
      }}
      onPointerUp={() => setFoco(null)}
      onPointerCancel={() => setFoco(null)}
    >
      {desenhar ? (
        <canvas ref={canvas} className="block h-auto max-w-full" />
      ) : null}

      {/* O número no lugar do desenho, e não um spinner: rolando depressa
          passam-se dez caixas por segundo, e dez rodinhas girando ao mesmo
          tempo é ruído. O número diz onde o mestre está.

          Aparece também quando a folha SAIU do cache: ela já desenhou uma vez,
          então a comparação com o pedido continuaria batendo, e a caixa ficaria
          branca e sem número até o mestre voltar a ela. */}
      {!pronta ? (
        <span className="absolute inset-0 grid place-items-center text-sm tabular-nums text-neutral-400">
          {numero}
        </span>
      ) : null}

      {/* A lente. `pointer-events-none` porque ela fica SOB o dedo: um alvo
          clicável ali roubaria o próprio gesto que a move. */}
      {foco ? (
        <canvas
          ref={lente}
          className="pointer-events-none absolute z-10 rounded-full border-2 border-white/80 bg-white shadow-2xl"
          style={{
            width: lentePx,
            height: lentePx,
            // Centrada no dedo, e limitada à folha: metade da lente fora da
            // página mostraria o vazio ao lado dela.
            left: Math.min(
              Math.max(foco.x - lentePx / 2, 0),
              Math.max(0, largura - lentePx),
            ),
            top: Math.min(
              Math.max(foco.y - lentePx / 2, 0),
              Math.max(0, altura - lentePx),
            ),
          }}
        />
      ) : null}

      {/* A ampliação, ao pé da lente: a roda muda um número que de outro modo
          só se descobre por tentativa. */}
      {foco ? (
        <span
          className="pointer-events-none absolute z-10 rounded bg-black/70 px-1.5 py-0.5 text-[0.7rem] text-white tabular-nums"
          style={{
            left: Math.min(Math.max(foco.x - 16, 0), Math.max(0, largura - 48)),
            top: Math.min(
              Math.max(foco.y + lentePx / 2 + 6, 0),
              Math.max(0, altura - 20),
            ),
          }}
        >
          {ampliacao}×
        </span>
      ) : null}
    </div>
  );
}
