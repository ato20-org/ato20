/** De quanto um passo cresce o pincel. Ver `proximoTamanhoDoPincel`. */
const FATOR = 1.25;

/**
 * O tamanho de um pincel, um passo acima ou abaixo: o do lápis e o da
 * borracha da névoa, pelos mesmos `[`, `]` e Alt+roda.
 *
 * Por fator e não por soma: de 6 para 8 é muito, de 200 para 202 não se vê. O
 * mesmo número de passos atravessa a régua inteira em qualquer altura. Com
 * piso de UMA unidade por passo: no lápis fino o fator sozinho arredondaria de
 * volta ao mesmo número, e a largura 1 nunca cresceria.
 */
export function proximoTamanhoDoPincel(
  valor: number,
  sentido: 1 | -1,
  minimo: number,
  maximo: number,
): number {
  const proximo =
    sentido > 0
      ? Math.max(valor + 1, Math.round(valor * FATOR))
      : Math.min(valor - 1, Math.round(valor / FATOR));

  return Math.min(maximo, Math.max(minimo, proximo));
}

/** A largura do lápis, em unidade de cena: do fio ao marca-texto largo. */
export const LARGURA_DO_LAPIS_MINIMA = 1;
export const LARGURA_DO_LAPIS_MAXIMA = 64;

/**
 * O raio da borracha dos riscos, em unidade de cena. Nasce pequena -- é
 * correção, e corrigir pede pontaria --, e vai até limpar um canto do mapa.
 */
export const RAIO_DA_BORRACHA_DOS_RISCOS_PADRAO = 10;
export const RAIO_DA_BORRACHA_DOS_RISCOS_MINIMO = 2;
export const RAIO_DA_BORRACHA_DOS_RISCOS_MAXIMO = 150;

/**
 * O quanto a roda girou, em pixels, com sinal: negativo é para cima.
 *
 * Lê o eixo que veio, e não só o vertical: em parte dos sistemas o Alt
 * segurado transforma a roda em rolagem HORIZONTAL, e o `deltaY` chega zero.
 * A roda que conta em LINHAS vira pixel numa linha de 16.
 */
export function deltaDaRoda(
  evento: Pick<WheelEvent, "deltaX" | "deltaY" | "deltaMode">,
): number {
  const delta = evento.deltaY !== 0 ? evento.deltaY : evento.deltaX;
  return evento.deltaMode === 1 ? delta * 16 : delta;
}
