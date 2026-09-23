"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Os itens que SAÍRAM da lista há pouco, para eles poderem se despedir.
 *
 * Existe porque React desmonta na hora: tirar um som da lista mata o elemento
 * `<audio>` no mesmo quadro, e não há mais nada para baixar o volume. Quem
 * chama junta o que está vivo com o que está saindo numa lista só e desenha os
 * dois — o que sai chega marcado, entra em rampa e some quando o prazo vence.
 *
 * Uma lista só do lado de quem chama, e não duas: `key` do React vale dentro
 * do array de filhos em que o elemento está, e um item que mudasse de array ao
 * começar a sair seria REMONTADO — que é exatamente o corte seco que este hook
 * existe para evitar.
 */
export function useSaindo<T>(
  itens: T[],
  chave: (item: T) => string,
  prazoMs: number,
): T[] {
  const [saindo, setSaindo] = useState<T[]>([]);

  /** A lista da passada anterior, para saber quem sumiu. */
  const anteriorRef = useRef<T[]>(itens);

  /**
   * A identidade da lista, em uma string.
   *
   * O efeito depende dela e não do array: quem chama monta uma lista nova a
   * cada render, e comparar a embalagem faria este hook rodar sessenta vezes
   * por segundo com a mesa parada. É a mesma correção que `usePublisher` faz
   * com as dependências dele.
   */
  const assinatura = itens.map(chave).join("\u0000");

  useEffect(() => {
    const presentes = new Set(itens.map(chave));

    const foram = anteriorRef.current.filter(
      (item) => !presentes.has(chave(item)),
    );
    anteriorRef.current = itens;

    // Quem voltou sai da fila de despedida mesmo sem ninguém ter saído: apagar
    // e reacender a chuva depressa tem de dar UM som, não dois em rampas
    // opostas.
    setSaindo((fila) => {
      const limpa = fila.filter((item) => !presentes.has(chave(item)));
      const juntos = foram.length === 0 ? limpa : [...limpa, ...foram];

      // Mesma referência quando nada mudou: devolver um array novo redesenharia
      // a lista de canais de quem chama por nada.
      return juntos.length === fila.length &&
        juntos.every((item, i) => item === fila[i])
        ? fila
        : juntos;
    });

    if (foram.length === 0) return;

    const idos = new Set(foram.map(chave));
    const prazo = setTimeout(() => {
      setSaindo((fila) => fila.filter((item) => !idos.has(chave(item))));
    }, prazoMs);

    return () => clearTimeout(prazo);
    // `itens` e `chave` ficam fora, e é o ponto do hook: a assinatura acima já
    // responde "a lista mudou?", e pôr o array aqui traria de volta as sessenta
    // execuções por segundo que ela existe para evitar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura, prazoMs]);

  /**
   * A fila, menos quem voltou.
   *
   * O efeito acima já tira da fila quem reapareceu, mas ele roda DEPOIS do
   * render — e é um quadro tarde demais. Um som que sai e volta dentro do
   * prazo (o pad da trilha apertado duas vezes) é desenhado uma vez estando
   * nas duas listas, e quem chama as junta com a mesma chave nas duas. O React
   * avisa de chave repetida, e o aviso está certo.
   *
   * Então o filtro é feito aqui, no render: o efeito continua sendo quem
   * esvazia a fila com o tempo, e isto garante que ela nunca seja LIDA com um
   * item que já está vivo. Num `useMemo` porque a lista devolvida alimenta os
   * `useMemo` de quem chama — um array novo a cada render remontaria a conta
   * dos canais sessenta vezes por segundo.
   */
  return useMemo(() => {
    const presentes = new Set(itens.map(chave));
    const voltou = saindo.filter((item) => presentes.has(chave(item)));

    // Mesma referência quando ninguém voltou, que é o caso quase sempre.
    return voltou.length === 0
      ? saindo
      : saindo.filter((item) => !presentes.has(chave(item)));
    // `itens` e `chave` fora pela mesma razão do efeito: a assinatura já
    // responde "a lista mudou?".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saindo, assinatura]);
}
