"use client";

import { useEffect, useRef, useState } from "react";

/**
 * O esmaecido das bordas de uma área rolável, só quando há o que rolar.
 *
 * A classe `scroll-fade` do shadcn corta as bordas do conteúdo com uma máscara
 * de 40px presa à rolagem. Num painel que rola ela é boa: diz que tem mais
 * coisa embaixo. Num painel que NÃO rola ela mente — e pior, come o topo do
 * primeiro item e o pé do último de graça, que é como ela apareceu no caderno
 * com uma nota só.
 *
 * O motivo é do CSS e não do uso: a máscara vive numa animação com
 * `animation-timeline: scroll(self y)`, e uma linha do tempo de rolagem sem
 * rolagem nenhuma fica parada no primeiro quadro — que é justamente o quadro em
 * que o pé está esmaecido.
 *
 * Então a classe entra por medida: `scrollHeight` maior que `clientHeight`, e
 * só. Junto vem um esmaecido mais curto que o padrão — 40px sobre um cartão de
 * três linhas apaga a linha inteira, e o que se quer é a insinuação de que a
 * lista continua.
 *
 * `deps` existe porque quem cresce é o CONTEÚDO, e não a caixa: o
 * `ResizeObserver` na área rolável não dispara quando uma nota nova entra na
 * lista dentro dela. Quem chama passa o que muda de tamanho — o número de
 * notas, o texto aberto — e a medida refaz.
 */
/**
 * A classe do esmaecido, com um degradê mais curto que o padrão de 40px.
 *
 * Constante exportada, e não devolvida pelo hook junto do `ref`: um objeto que
 * carrega os dois faz o `react-hooks/refs` recusar qualquer uso do outro campo
 * — para ele, ler um campo ao lado de um `ref` durante o render é ler o `ref`.
 */
export const FADE_DE_ROLAGEM = "scroll-fade [--scroll-fade-size:1.25rem]";

/** Devolve o `ref` da área e se ela tem o que rolar, nessa ordem. */
export function useScrollFade<T extends HTMLElement>(deps: unknown[] = []) {
  const ref = useRef<T | null>(null);
  const [rola, setRola] = useState(false);

  useEffect(() => {
    const area = ref.current;
    if (!area) return;

    // A medida vive no callback do observador, e não aqui: `setState` no corpo
    // de um efeito dispara render em cascata — e o observador chama a primeira
    // vez sozinho, assim que começa a observar.
    const observador = new ResizeObserver(() => {
      // Um pixel de folga: zoom de navegador e arredondamento de subpixel fazem
      // `scrollHeight` passar do `clientHeight` por frações numa caixa que não
      // rola, e o esmaecido piscaria com o redimensionamento da janela.
      setRola(area.scrollHeight - area.clientHeight > 1);
    });

    observador.observe(area);
    // Os filhos também: é neles que a altura do conteúdo mora.
    for (const filho of area.children) observador.observe(filho);

    return () => observador.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `deps` é do chamador, por definição
  }, deps);

  return [ref, rola] as const;
}
