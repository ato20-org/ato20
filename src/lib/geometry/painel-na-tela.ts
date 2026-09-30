/**
 * Onde um painel do gizmo cabe na tela.
 *
 * O painel nasce de um lado fixo da caixa -- o de estilo EMBAIXO, o de
 * opacidade à DIREITA --, e com o elemento perto da borda do palco ele saía
 * pela metade: um retângulo no rodapé do quadro abria o estilo com só o título
 * à vista. A regra é a de qualquer menu de contexto:
 *
 * 1. cabe do lado de sempre: fica;
 * 2. não cabe, mas cabe do lado OPOSTO da caixa: pula para lá -- e "a caixa"
 *    inclui a fileira de botões, que mora em cima dela, para o painel de
 *    cima não a cobrir;
 * 3. não cabe em nenhum dos dois: encosta dentro da tela, por cima do que for.
 *
 * O outro eixo só é empurrado para dentro. Tudo em pixel de TELA: quem mede é
 * o `getBoundingClientRect`, e quem aplica converte.
 *
 * `livre` é o painel que o mestre ARRASTA -- a nota do alfinete: ele não tem
 * lado de nascer, tem o lugar em que foi deixado, e pular de lado brigaria com
 * a mão. Ali só vale o passo 3, nos dois eixos.
 */

export type Retangulo = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/**
 * O desvio que traz o trecho `[inicio, fim]` para dentro de `[minimo, maximo]`.
 * Maior que o espaço, encosta no começo: o título e o primeiro controle são o
 * que precisa estar à vista.
 */
function encaixar(
  inicio: number,
  fim: number,
  minimo: number,
  maximo: number,
): number {
  if (fim - inicio > maximo - minimo) return minimo - inicio;
  if (inicio < minimo) return minimo - inicio;
  if (fim > maximo) return maximo - fim;

  return 0;
}

/**
 * O desvio do painel, a partir de onde ele nasceu, para caber na tela.
 *
 * `painel` é o retângulo NATURAL -- sem desvio nenhum aplicado. `obstaculo` é
 * o que ele não deve cobrir ao pular de lado: a caixa do elemento com a
 * fileira de botões. `vao` é o espaço entre os dois, o mesmo do lado de
 * sempre; `folga`, o quanto ele fica longe da borda da tela.
 */
export function acomodarPainel({
  painel,
  tela,
  obstaculo,
  lado,
  vao = 8,
  folga = 8,
}: {
  painel: Retangulo;
  tela: Retangulo;
  obstaculo: Retangulo;
  lado: "baixo" | "cima" | "direita" | "livre";
  vao?: number;
  folga?: number;
}): { dx: number; dy: number } {
  const cabe = {
    left: tela.left + folga,
    top: tela.top + folga,
    right: tela.right - folga,
    bottom: tela.bottom - folga,
  };

  const encaixeX = encaixar(painel.left, painel.right, cabe.left, cabe.right);
  const encaixeY = encaixar(painel.top, painel.bottom, cabe.top, cabe.bottom);

  if (lado === "livre") return { dx: encaixeX, dy: encaixeY };

  if (lado === "baixo" || lado === "cima") {
    const dentro = painel.top >= cabe.top && painel.bottom <= cabe.bottom;
    // O lado oposto: de baixo para cima da caixa, ou de cima para baixo.
    const pulo =
      lado === "baixo"
        ? obstaculo.top - vao - painel.bottom
        : obstaculo.bottom + vao - painel.top;
    const cabeDoOutroLado =
      lado === "baixo"
        ? painel.top + pulo >= cabe.top
        : painel.bottom + pulo <= cabe.bottom;

    return {
      dx: encaixeX,
      dy: dentro ? 0 : cabeDoOutroLado ? pulo : encaixeY,
    };
  }

  const dentro = painel.left >= cabe.left && painel.right <= cabe.right;
  const aEsquerda = obstaculo.left - vao - painel.right;
  const cabeAEsquerda = painel.left + aEsquerda >= cabe.left;

  return {
    dx: dentro ? 0 : cabeAEsquerda ? aEsquerda : encaixeX,
    dy: encaixeY,
  };
}
