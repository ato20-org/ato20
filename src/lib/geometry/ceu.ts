/**
 * O céu do sol: a conta que troca um ponto arrastado por uma sombra.
 *
 * O sol da cena não tem lugar -- é direção, e só (ver `Sol`). O que o mestre
 * arrasta é um céu visto de cima, no painel do mapa, e a posição do disco nele
 * diz as duas coisas de uma vez: de que LADO a luz vem, e quão ALTO ela está. Aqui mora a tradução entre as duas linguagens, e ela é função pura de
 * números -- o componente só desenha o que sai daqui. Ver `CeuDoSol`.
 *
 * As medidas são em PIXEL, e o desenho encolhe para o tamanho que couber no
 * painel. Já foram pixels de TELA, quando o céu morava no palco: ali a régua
 * tinha de ser a da tela, senão o céu engordaria com o zoom e a 400% o sol
 * cobriria o corredor que ele ilumina.
 */

/**
 * O menor e o maior comprimento de sombra que o céu alcança, em frações da
 * altura da figura.
 *
 * Os mesmos números que as duas réguas do painel tinham. O mínimo não é zero
 * porque sombra de comprimento zero é sombra apagada, e apagar o sol é o
 * interruptor do painel -- não um gesto que se faz sem querer, arrastando o sol
 * até o meio do céu.
 */
export const COMPRIMENTO_MIN = 0.1;
export const COMPRIMENTO_MAX = 1.4;

/**
 * Os dois raios que o sol percorre, em pixels de tela.
 *
 * `PERTO` é o sol a pino e `LONGE` é o sol no horizonte. Não começa no centro
 * porque um alvo no meio de um anel de raio quase nulo é impossível de pegar --
 * e porque sol a pino não existe num mapa: a sombra mínima ainda aponta para
 * algum lado.
 */
export const PERTO_PX = 28;
export const LONGE_PX = 82;

/** De quantos em quantos graus o sol trava com Shift, como o gizmo faz. */
export const TRAVA_EM_GRAUS = 15;

const GRAU = Math.PI / 180;

/** A que distância do meio do céu fica um sol que faz esta sombra. */
export function raioDoComprimento(comprimento: number): number {
  const parte =
    (prender(comprimento, COMPRIMENTO_MIN, COMPRIMENTO_MAX) - COMPRIMENTO_MIN) /
    (COMPRIMENTO_MAX - COMPRIMENTO_MIN);

  return PERTO_PX + parte * (LONGE_PX - PERTO_PX);
}

/** E o contrário: que sombra faz um sol solto a esta distância do meio. */
export function comprimentoDoRaio(raioPx: number): number {
  const parte =
    (prender(raioPx, PERTO_PX, LONGE_PX) - PERTO_PX) / (LONGE_PX - PERTO_PX);

  const comprimento =
    COMPRIMENTO_MIN + parte * (COMPRIMENTO_MAX - COMPRIMENTO_MIN);

  // Duas casas: o valor vai para a cena e viaja para a mesa, e o resto é ruído.
  return Math.round(comprimento * 100) / 100;
}

/** Onde o sol fica no céu, em pixels de tela a partir do meio dele. */
export function solNoCeu(
  angulo: number,
  comprimento: number,
): { x: number; y: number } {
  // Do lado OPOSTO ao da sombra: é ele que a empurra.
  const doSol = (angulo + 180) * GRAU;
  const raio = raioDoComprimento(comprimento);

  return { x: Math.cos(doSol) * raio, y: Math.sin(doSol) * raio };
}

/**
 * A sombra que um ponteiro define, dado o quanto ele está longe do meio do céu
 * em PIXEL DE TELA.
 *
 * O ângulo é o do ponteiro mais meia volta, porque a sombra cai do lado oposto
 * ao sol -- arrastar o sol para o poente joga as sombras para o nascente, como
 * no mundo. E é sempre inteiro e dentro de uma volta: o valor vai para a cena e
 * viaja para a mesa.
 */
export function sombraDoPonteiro(
  dx: number,
  dy: number,
  travar = false,
): { angulo: number; comprimento: number } {
  const bruto = (Math.atan2(dy, dx) * 180) / Math.PI + 180;
  const angulo = travar
    ? Math.round(bruto / TRAVA_EM_GRAUS) * TRAVA_EM_GRAUS
    : Math.round(bruto);

  return {
    angulo: ((angulo % 360) + 360) % 360,
    comprimento: comprimentoDoRaio(Math.hypot(dx, dy)),
  };
}

function prender(valor: number, menor: number, maior: number): number {
  return Math.min(maior, Math.max(menor, valor));
}
