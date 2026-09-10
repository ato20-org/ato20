import { FOLGA_X, FOLGA_Y } from "@/lib/geometry/viewport";
import { POSTIT_MINIMO, SCENE_HEIGHT, SCENE_WIDTH, type Postit } from "@/types/scene";

/**
 * Onde um postit pode estar, e de que tamanho.
 *
 * O limite NÃO é o plano da cena, e a primeira versão errava justamente nisso:
 * ela prendia o papel dentro de 1920x1080, e o efeito era um postit que travava
 * na beirada do mapa. Errado por duas razões independentes.
 *
 * A primeira é que a área de trabalho do Operador é maior que o mapa: um plano
 * inteiro de folga para cada lado, ver `FOLGA_X`. Essa folga existe por causa
 * deste caso — o comentário dela conta que ela nasceu quando as notas dos
 * pontos de anotação passaram a poder ser estacionadas fora do mapa e não havia
 * como chegar nelas. Anotação na margem é uso legítimo: "isto ainda não está no
 * mapa", "lembrar de descrever o cheiro", a lista de nomes de PNJ que não
 * pertence a lugar nenhum da planta.
 *
 * A segunda é consistência: item de imagem não é preso ao plano — `dragBox` no
 * `OperatorStage` não faz clamp nenhum —, e o plano não corta o que passa da
 * borda. Prender só o postit faria dele o único objeto do palco com uma cerca
 * que os outros não têm.
 *
 * O que continua valendo é o alcance: o papel inteiro fica dentro da área que a
 * câmera consegue percorrer. Fora dela seria um postit que existe no arquivo e
 * não tem como ser alcançado nem lido — o mesmo problema que a folga resolveu,
 * de volta pelo outro lado.
 */
const LIMITE_X = SCENE_WIDTH + FOLGA_X;
const LIMITE_Y = SCENE_HEIGHT + FOLGA_Y;

function preso(valor: number, minimo: number, maximo: number): number {
  return Math.round(Math.min(Math.max(valor, minimo), maximo));
}

/** Prende a posição do papel dentro da área de trabalho, sem mudar o tamanho. */
export function postitNaArea(
  x: number,
  y: number,
  largura: number,
  altura: number,
): { x: number; y: number } {
  return {
    x: preso(x, -FOLGA_X, LIMITE_X - largura),
    y: preso(y, -FOLGA_Y, LIMITE_Y - altura),
  };
}

/**
 * Prende o tamanho do papel.
 *
 * O teto é o PLANO, e não a área de trabalho: um postit maior que o mapa inteiro
 * não é anotação, é uma tela em branco cobrindo a cena — e para chegar nele
 * seria preciso afastar o zoom até o mapa virar um selo. O piso é
 * `POSTIT_MINIMO`, que é o menor papel em que ainda cabe uma linha de texto e a
 * faixa de arrasto.
 */
export function postitNoTamanho(largura: number, altura: number): Pick<Postit, "largura" | "altura"> {
  return {
    largura: preso(largura, POSTIT_MINIMO, SCENE_WIDTH),
    altura: preso(altura, POSTIT_MINIMO, SCENE_HEIGHT),
  };
}
