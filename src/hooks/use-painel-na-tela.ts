"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

import { acomodarPainel, type Retangulo } from "@/lib/geometry/painel-na-tela";

type Opcoes = {
  /** De que lado o painel nasce. Ver `acomodarPainel`. */
  lado: "baixo" | "cima" | "direita" | "livre";
  /** A ampliação do palco: o desvio vai em unidade de cena. */
  scale: number;
  /** O que recorta o palco. Sem ela, nada a fazer. */
  moldura: HTMLElement | null;
  /**
   * O que o painel não pode cobrir ao pular de lado, como elementos: a caixa
   * do gizmo e a fileira de botões dele.
   */
  obstaculos?: Array<{ current: HTMLElement | null }>;
  /**
   * O mesmo, como um PONTO em pixel de tela a partir da moldura -- a luz não
   * tem elemento, tem coordenada. `x_px = offsetX + x × scale`.
   */
  ancora?: { x: number; y: number };
  /** Entre o painel e o obstáculo, do lado oposto. O mesmo do lado de sempre. */
  vao?: number;
  /**
   * O ref do painel, quando ele já tem um -- a nota do alfinete usa o dela
   * para outra coisa. Ausente, o hook cria o seu.
   */
  ref?: RefObject<HTMLDivElement | null>;
  /**
   * Desviar o PAI e não o painel. Para quem desfaz o zoom no próprio painel com
   * `zoom` (ver `emPixelDeTela`): ali um `translate` seria multiplicado de
   * novo, e o pai, que está na escala do palco, desvia na conta de sempre.
   */
  moverPai?: boolean;
};

/**
 * Mantém um painel do palco dentro da tela. Ver `acomodarPainel`, que tem a
 * regra e o teste.
 *
 * Mede DEPOIS de cada render: o painel acompanha o elemento, a câmera e o
 * zoom, e qualquer um deles pode tê-lo levado para fora da borda. Fechado, o
 * painel não está montado e o efeito não faz nada -- o custo da medida é só de
 * quem está com um aberto.
 *
 * O desvio vai direto no DOM, pela propriedade `translate`, e não por estado:
 * é o efeito sincronizando o elemento com a tela, e um estado aqui pediria um
 * segundo render a cada medida. `translate` e não mais um item do `transform`:
 * ela é aplicada ANTES do `transform` do elemento, no espaço do pai -- que
 * está na escala do palco e, no gizmo, já contra-girado --, e por isso um
 * desvio de N pixels de tela é N/scale ali. E é pintura, não layout.
 *
 * O desvio já aplicado fica no próprio elemento, em unidade de cena, e é
 * descontado da medida: a conta parte sempre de onde o painel NASCE, e não de
 * onde o último desvio o deixou -- senão ele pularia de volta a cada render.
 * Painel reaberto é elemento novo, e começa sem desvio nenhum.
 *
 * O palco é a `moldura`: é ela que recorta, e o que passa dela não se vê.
 */
export function usePainelNaTela({
  lado,
  scale,
  moldura,
  obstaculos = [],
  ancora,
  vao,
  ref: deFora,
  moverPai = false,
}: Opcoes): RefObject<HTMLDivElement | null> {
  const proprio = useRef<HTMLDivElement | null>(null);
  const ref = deFora ?? proprio;

  useLayoutEffect(() => {
    const painel = ref.current;
    const alvo = moverPai ? painel?.parentElement : painel;
    if (!painel || !alvo || !moldura || scale <= 0) return;

    // Guardado em unidade de cena, que é o que o `translate` carrega, e
    // convertido pela escala de AGORA: com zoom no meio, o mesmo `translate`
    // vale outro tanto de pixels, e é esse outro tanto que a medida já viu.
    const antes = {
      dx: Number(alvo.dataset.desvioX ?? 0) * scale,
      dy: Number(alvo.dataset.desvioY ?? 0) * scale,
    };
    const medido = painel.getBoundingClientRect();
    const natural: Retangulo = {
      left: medido.left - antes.dx,
      right: medido.right - antes.dx,
      top: medido.top - antes.dy,
      bottom: medido.bottom - antes.dy,
    };
    const tela = moldura.getBoundingClientRect();

    const caixas: Retangulo[] = obstaculos
      .map((obstaculo) => obstaculo.current?.getBoundingClientRect())
      .filter((caixa): caixa is DOMRect => Boolean(caixa));
    if (ancora) {
      const x = tela.left + ancora.x;
      const y = tela.top + ancora.y;
      caixas.push({ left: x, right: x, top: y, bottom: y });
    }

    const obstaculo: Retangulo =
      caixas.length > 0
        ? {
            left: Math.min(...caixas.map((caixa) => caixa.left)),
            top: Math.min(...caixas.map((caixa) => caixa.top)),
            right: Math.max(...caixas.map((caixa) => caixa.right)),
            bottom: Math.max(...caixas.map((caixa) => caixa.bottom)),
          }
        : natural;

    const { dx, dy } = acomodarPainel({
      painel: natural,
      tela,
      obstaculo,
      lado,
      vao,
    });

    if (Math.abs(dx - antes.dx) <= 0.5 && Math.abs(dy - antes.dy) <= 0.5) return;

    alvo.dataset.desvioX = String(dx / scale);
    alvo.dataset.desvioY = String(dy / scale);
    alvo.style.translate = dx || dy ? `${dx / scale}px ${dy / scale}px` : "";
  });

  return ref;
}
