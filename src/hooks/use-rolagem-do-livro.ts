"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Quantas páginas ficam DESENHADAS ao mesmo tempo.
 *
 * O teto existe por memória, não por gosto: uma folha A4 ajustada a meia tela
 * dá uns dois megapixels, e cada megapixel é 4 MB de bitmap na webview. Sem
 * teto, descer um manual de trezentas páginas até o fim deixaria dois gigabytes
 * de canvas pendurados — e o mestre percebe isso como a mesa inteira travando,
 * não como o leitor.
 *
 * Doze é o que cobre a vista mais o rastro de quem sobe e desce relendo a mesma
 * seção: a página revisitada nesse raio não é redesenhada.
 */
const MANTIDAS = 12;

/**
 * Quanto além da vista já se manda desenhar.
 *
 * Sem antecipação, a página aparece branca e só então começa a desenhar, e a
 * rolagem fica "atrás" do dedo. Setecentos pixels é meia folha de folga em cima
 * e embaixo, que é o bastante para a página seguinte chegar pronta num gesto de
 * rolagem normal.
 */
const ANTECIPACAO_PX = 700;

function mesmas(uma: number[], outra: number[]): boolean {
  return uma.length === outra.length && uma.every((valor, indice) => valor === outra[indice]);
}

type Rolagem = {
  /** A caixa que rola. Quem a desenha é o leitor; ela é a raiz dos observadores. */
  caixa: React.RefObject<HTMLDivElement | null>;
  /** O `ref` de uma folha, estável por número de página. */
  registrar: (numero: number) => (elemento: HTMLElement | null) => void;
  /** A página que cruza o meio da caixa: a que o mestre está lendo. */
  atual: number;
  /** Quais páginas devem estar desenhadas agora. */
  mantidas: Set<number>;
  irPara: (numero: number) => void;
};

/**
 * A rolagem contínua de um livro, sem carregar o livro todo.
 *
 * As trezentas folhas existem no DOM desde o começo, mas como CAIXAS VAZIAS com
 * a altura reservada: é isso que dá uma barra de rolagem do tamanho do manual e
 * permite saltar para a página 214 sem passar pelas outras. O que custa — pedir
 * a página ao worker, decodificar, desenhar no canvas — acontece quando a caixa
 * entra em vista, e sai de cena quando ela se afasta o bastante.
 *
 * Dois observadores, e não um: "o que desenhar" e "onde estou" são perguntas
 * diferentes. O primeiro trabalha com folga de meia tela para a página chegar
 * pronta; o segundo é uma faixa de um pixel no meio da caixa, porque a página
 * ATUAL é a que está sob os olhos, não a que acabou de assomar na borda.
 */
export function useRolagemDoLivro(paginas: number): Rolagem {
  const caixa = useRef<HTMLDivElement | null>(null);
  const folhas = useRef(new Map<number, HTMLElement>());
  const visiveis = useRef(new Set<number>());
  const refs = useRef(new Map<number, (elemento: HTMLElement | null) => void>());
  const observadores = useRef<{ vista: IntersectionObserver; meio: IntersectionObserver } | null>(
    null,
  );

  const [ordem, setOrdem] = useState<number[]>([1]);
  const [atual, setAtual] = useState(1);

  useEffect(() => {
    const raiz = caixa.current;
    if (!raiz) return;

    const vista = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          const numero = Number((entrada.target as HTMLElement).dataset.pagina);
          if (!numero) continue;

          if (entrada.isIntersecting) visiveis.current.add(numero);
          else visiveis.current.delete(numero);
        }

        const perto = [...visiveis.current].sort((um, outro) => um - outro);

        setOrdem((anteriores) => {
          // As visíveis entram todas, mesmo que passem do teto — esconder uma
          // página que está na tela para respeitar um limite de memória seria
          // trocar um problema que ninguém vê por um que todos veem. O rastro
          // das antigas preenche o que sobra.
          const proximas = [...perto];

          for (const antiga of anteriores) {
            if (proximas.length >= Math.max(MANTIDAS, perto.length)) break;
            if (!proximas.includes(antiga)) proximas.push(antiga);
          }

          return mesmas(anteriores, proximas) ? anteriores : proximas;
        });
      },
      { root: raiz, rootMargin: `${ANTECIPACAO_PX}px 0px` },
    );

    const meio = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (!entrada.isIntersecting) continue;

          const numero = Number((entrada.target as HTMLElement).dataset.pagina);
          if (numero) setAtual(numero);
        }
      },
      // Margem negativa de 50% nos dois lados: sobra uma linha no meio da
      // caixa, e a página que a cruza é a página lida.
      { root: raiz, rootMargin: "-50% 0px -50% 0px" },
    );

    observadores.current = { vista, meio };

    // As folhas que já montaram antes de o observador existir — a primeira
    // passada de render — precisam ser recolhidas aqui.
    for (const folha of folhas.current.values()) {
      vista.observe(folha);
      meio.observe(folha);
    }

    return () => {
      vista.disconnect();
      meio.disconnect();
      observadores.current = null;
    };
  }, [paginas]);

  const registrar = useCallback((numero: number) => {
    // Guardado por número, e não criado a cada render: um `ref` com identidade
    // nova é chamado com `null` e de novo com o elemento em cada passada, o que
    // daria seiscentas operações de observador por render num manual grande.
    let callback = refs.current.get(numero);
    if (callback) return callback;

    callback = (elemento: HTMLElement | null) => {
      const anterior = folhas.current.get(numero);

      if (anterior && observadores.current) {
        observadores.current.vista.unobserve(anterior);
        observadores.current.meio.unobserve(anterior);
      }

      if (!elemento) {
        folhas.current.delete(numero);
        visiveis.current.delete(numero);
        return;
      }

      folhas.current.set(numero, elemento);
      observadores.current?.vista.observe(elemento);
      observadores.current?.meio.observe(elemento);
    };

    refs.current.set(numero, callback);

    return callback;
  }, []);

  const irPara = useCallback((numero: number) => {
    const folha = folhas.current.get(numero);
    if (!folha) return;

    // `instant` e não suave: saltar da busca para a página 214 de um manual de
    // trezentas com rolagem animada percorreria o livro inteiro na tela.
    folha.scrollIntoView({ block: "start", behavior: "instant" });

    // Sem esperar o observador do meio: ele responde no quadro seguinte, e o
    // contador piscando o número velho depois do salto leria como falha.
    setAtual(numero);
  }, []);

  const mantidas = useMemo(() => new Set(ordem), [ordem]);

  return { caixa, registrar, atual, mantidas, irPara };
}
