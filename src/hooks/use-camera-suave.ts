"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import {
  correnteDoTripe,
  curvaBezier,
  misturarTripe,
  type Tela,
} from "@/lib/geometry/camera-orbital";
import type { Tripe } from "@/types/scene";

/**
 * Abaixo deste intervalo entre amostras, a câmera está em FLUXO.
 *
 * O mesmo número do `SceneStage` (`FLUXO_MS`), pela mesma razão: o mestre
 * arrastando a moldura publica a cada 100 ms, e o botão de enquadrar manda uma
 * amostra só. A TV não sabe qual botão foi, mas sabe quando a anterior chegou.
 */
const FLUXO_MS = 250;

/**
 * As duas transições da TV, as mesmas de `.scene-smooth-camera` e
 * `.scene-smooth-camera-fluxo` em `globals.css`. Copiadas e não lidas do CSS:
 * aqui não há transição de CSS para ler -- a corrente é escrita a cada quadro.
 */
const SALTO = { duracao: 450, curva: curvaBezier(0.22, 0.61, 0.36, 1) };
const FLUXO = { duracao: 150, curva: (t: number) => t };

type Voo = {
  de: Tripe;
  para: Tripe;
  inicio: number;
  duracao: number;
  curva: (t: number) => number;
};

/**
 * O tripé no ar, na janela do espectador: segue as amostras do mestre sem
 * saltar entre elas.
 *
 * Na foto quem suavizava era o `SceneStage`, com `transition: transform` no
 * plano. De esguelha não há plano que ande -- cada elemento do chão carrega a
 * câmera inteira --, então a suavização vira conta: a cada amostra, um voo do
 * tripé exibido até o novo, com a curva e a duração que a transição de CSS
 * teria escolhido. Salto desacelera em 450 ms; fluxo anda linear em 150 ms;
 * corte entra seco, e a primeira amostra depois dele também.
 *
 * O tripé voa INTEIRO -- posição, ângulos e lente --, porque é tudo corrente
 * escrita no DOM. Quem não voa é o que o React desenha: a ordem do pintor e as
 * peças em pé seguem o giro de destino na hora, e por um voo de 150 ms a peça
 * pode olhar um grau ao lado de onde a câmera está. Ninguém vê.
 */
export function useCameraSuave(
  destino: Tripe,
  tela: Tela,
  corte: number,
): {
  corrente: () => string;
  assinar: (aviso: () => void) => () => void;
  /**
   * O tripé exibido AGORA, no meio do voo, e a tela: para quem põe coisa de
   * prumo na tela sobre ele -- a figura em pé, o nome sobre a cabeça. Ver
   * `olho` em `CameraAssinavel`.
   */
  vista: () => { tripe: Tripe; tela: Tela } | null;
} {
  const exibido = useRef<Tripe | null>(null);
  const telaAtual = useRef(tela);
  const quadro = useRef<number | undefined>(undefined);
  const ultimaAmostraEm = useRef<number | null>(null);
  const ultimoCorte = useRef(corte);
  const ouvintes = useRef(new Set<() => void>());

  const corrente = useCallback(
    () =>
      exibido.current ? correnteDoTripe(exibido.current, telaAtual.current) : "",
    [],
  );

  const assinar = useCallback((aviso: () => void) => {
    ouvintes.current.add(aviso);
    return () => {
      ouvintes.current.delete(aviso);
    };
  }, []);

  const notificar = useCallback(() => {
    for (const aviso of ouvintes.current) aviso();
  }, []);

  // A tela vale na hora: trocar de caixa não é amostra.
  useLayoutEffect(() => {
    telaAtual.current = tela;
    notificar();
  }, [notificar, tela]);

  const { x, y, altura, giro, inclinacao, rolagem, lente } = destino;

  // Uma amostra nova: voa até ela, ou entra seca.
  useLayoutEffect(() => {
    const para: Tripe = { x, y, altura, giro, inclinacao, rolagem, lente };
    const agora = performance.now();
    const cortou = corte !== ultimoCorte.current;
    ultimoCorte.current = corte;

    const anterior = cortou ? null : ultimaAmostraEm.current;
    ultimaAmostraEm.current = agora;

    if (!exibido.current || anterior === null) {
      if (quadro.current !== undefined) cancelAnimationFrame(quadro.current);
      quadro.current = undefined;
      exibido.current = para;
      notificar();
      return;
    }

    const jeito = agora - anterior < FLUXO_MS ? FLUXO : SALTO;
    // Parte de onde o tripé ESTÁ, e não de onde ia: uma amostra no meio do voo
    // anterior recomeça dali, como a transição de CSS recomeçava.
    const voo: Voo = {
      de: exibido.current,
      para,
      inicio: agora,
      duracao: jeito.duracao,
      curva: jeito.curva,
    };

    if (quadro.current !== undefined) cancelAnimationFrame(quadro.current);
    const passo = (instante: number) => {
      const t = Math.min(1, Math.max(0, (instante - voo.inicio) / voo.duracao));
      exibido.current = misturarTripe(voo.de, voo.para, voo.curva(t));
      notificar();
      quadro.current = t < 1 ? requestAnimationFrame(passo) : undefined;
    };
    quadro.current = requestAnimationFrame(passo);
  }, [x, y, altura, giro, inclinacao, rolagem, lente, corte, notificar]);

  useEffect(
    () => () => {
      if (quadro.current !== undefined) cancelAnimationFrame(quadro.current);
    },
    [],
  );

  const vista = useCallback(
    () =>
      exibido.current
        ? { tripe: exibido.current, tela: telaAtual.current }
        : null,
    [],
  );

  return { corrente, assinar, vista };
}
