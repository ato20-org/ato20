"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import {
  correnteDaCamera,
  curvaBezier,
  misturar,
  type CameraOrbital,
  type Tela,
} from "@/lib/geometry/camera-orbital";

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
  de: CameraOrbital;
  para: CameraOrbital;
  inicio: number;
  duracao: number;
  curva: (t: number) => number;
};

/**
 * A câmera orbital da TV: segue as amostras do mestre sem saltar entre elas.
 *
 * Na foto quem suavizava era o `SceneStage`, com `transition: transform` no
 * plano. A orbital não tem um plano que ande -- cada elemento do chão carrega a
 * câmera inteira --, então a suavização vira conta: a cada amostra, um voo da
 * câmera exibida até a nova, com a curva e a duração que a transição de CSS
 * teria escolhido. Salto desacelera em 450 ms; fluxo anda linear em 150 ms;
 * corte entra seco, e a primeira amostra depois dele também.
 *
 * Só o alvo e o zoom voam. Giro e inclinação são os de destino na hora: quem
 * os desenha é o React (a ordem do pintor e as peças em pé dependem deles), e
 * animá-los aqui deixaria a câmera girada e as peças olhando para o lado
 * antigo durante o voo. É o que a foto fazia também.
 */
export function useCameraSuave(
  destino: CameraOrbital,
  tela: Tela,
  corte: number,
): { corrente: () => string; assinar: (aviso: () => void) => () => void } {
  const exibida = useRef<CameraOrbital | null>(null);
  const alvoDaVista = useRef(destino);
  const telaAtual = useRef(tela);
  const quadro = useRef<number | undefined>(undefined);
  const ultimaAmostraEm = useRef<number | null>(null);
  const ultimoCorte = useRef(corte);
  const ouvintes = useRef(new Set<() => void>());

  const corrente = useCallback(() => {
    const atual = exibida.current;
    if (!atual) return "";

    return correnteDaCamera(
      {
        ...atual,
        giro: alvoDaVista.current.giro,
        inclinacao: alvoDaVista.current.inclinacao,
      },
      telaAtual.current,
    );
  }, []);

  const assinar = useCallback((aviso: () => void) => {
    ouvintes.current.add(aviso);
    return () => {
      ouvintes.current.delete(aviso);
    };
  }, []);

  const notificar = useCallback(() => {
    for (const aviso of ouvintes.current) aviso();
  }, []);

  const { x, y } = destino.alvo;
  const { zoom, giro, inclinacao } = destino;

  // Giro, inclinação e a tela valem na hora. Ver o cabeçalho.
  useLayoutEffect(() => {
    alvoDaVista.current = { ...alvoDaVista.current, giro, inclinacao };
    telaAtual.current = tela;
    notificar();
  }, [giro, inclinacao, notificar, tela]);

  // Uma amostra nova: voa até ela, ou entra seca.
  useLayoutEffect(() => {
    const para: CameraOrbital = { alvo: { x, y }, zoom, giro, inclinacao };
    const agora = performance.now();
    const cortou = corte !== ultimoCorte.current;
    ultimoCorte.current = corte;

    const anterior = cortou ? null : ultimaAmostraEm.current;
    ultimaAmostraEm.current = agora;

    if (!exibida.current || anterior === null) {
      if (quadro.current !== undefined) cancelAnimationFrame(quadro.current);
      quadro.current = undefined;
      exibida.current = para;
      notificar();
      return;
    }

    const jeito = agora - anterior < FLUXO_MS ? FLUXO : SALTO;
    // Parte de onde a câmera ESTÁ, e não de onde ia: uma amostra no meio do
    // voo anterior recomeça dali, como a transição de CSS recomeçava.
    const voo: Voo = {
      de: exibida.current,
      para,
      inicio: agora,
      duracao: jeito.duracao,
      curva: jeito.curva,
    };

    if (quadro.current !== undefined) cancelAnimationFrame(quadro.current);
    const passo = (instante: number) => {
      const t = Math.min(1, Math.max(0, (instante - voo.inicio) / voo.duracao));
      exibida.current = misturar(voo.de, voo.para, voo.curva(t));
      notificar();
      quadro.current = t < 1 ? requestAnimationFrame(passo) : undefined;
    };
    quadro.current = requestAnimationFrame(passo);
    // Giro e inclinação entram em `para` só para a câmera ficar inteira: quem
    // os aplica é o efeito de cima, e uma mudança só deles não é amostra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y, zoom, corte, notificar]);

  useEffect(
    () => () => {
      if (quadro.current !== undefined) cancelAnimationFrame(quadro.current);
    },
    [],
  );

  return { corrente, assinar };
}
