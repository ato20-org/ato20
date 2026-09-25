import { normalizeAngle } from "@/lib/geometry/transform";
import { FULL_VIEWPORT } from "@/lib/geometry/viewport";
import { ehQuadro, type CanvasItem, type Scene, type Viewport } from "@/types/scene";

/**
 * O jogador arrastando o token do próprio personagem, como chega à janela.
 *
 * É o espelho de `serve::Movimento`. `jogadorId` vem do token que o daemon
 * resolveu, e não do celular; `personagemId` já passou pela checagem de
 * vínculo lá. O que o daemon NÃO confere -- porque o board não é dele -- é se o
 * item é mesmo daquele personagem. Isso é `destinoAceito`, aqui.
 */
export type MovimentoDoJogador = {
  jogadorId: string;
  personagemId: string;
  itemId: string;
  /** O canto do item, em unidades de cena, como em `CanvasItem`. */
  x: number;
  y: number;
  /**
   * O giro do token, em graus, quando o gesto foi de GIRAR.
   *
   * Ausente quando o jogador só arrastou -- e ausente é diferente de zero:
   * mandar `0` em toda amostra de arrasto endireitaria um token que o mestre
   * deixou torto, a cada passo, sem ninguém pedir.
   *
   * Viaja junto de `x` e `y` porque é o mesmo gesto do ponto de vista da mesa:
   * uma amostra do token, dez por segundo. Girando, `x` e `y` repetem o lugar
   * em que ele já está.
   */
  rotation?: number;
};

/**
 * Até onde o jogador pode levar o token: o recorte que a mesa está vendo.
 *
 * A câmera, e não o plano inteiro. O celular desenha só o que ela enquadra, e
 * um dedo que escapa da moldura não pode largar o token num canto do mapa que
 * a TV não mostra -- ele sumiria de todas as telas, e quem teria de ir buscá-lo
 * é o mestre, no meio da cena.
 */
export function limiteDoMovimento(scene: Pick<Scene, "camera">): Viewport {
  return scene.camera ?? FULL_VIEWPORT;
}

/**
 * O canto do item com o CENTRO preso dentro do limite.
 *
 * O centro, e não a caixa inteira: um token na borda do quadro fica metade para
 * fora, que é o que acontece com qualquer peça encostada na beira do mapa -- e
 * exigir a caixa inteira dentro faria um token maior que a câmera não caber em
 * lugar nenhum. O centro também não muda com o giro, então não há caixa girada
 * para medir.
 */
export function prenderNoLimite(
  item: Pick<CanvasItem, "width" | "height">,
  x: number,
  y: number,
  limite: Viewport,
): { x: number; y: number } {
  const meiaLargura = item.width / 2;
  const meiaAltura = item.height / 2;

  return {
    x: prender(x, limite.x - meiaLargura, limite.x + limite.width - meiaLargura),
    y: prender(y, limite.y - meiaAltura, limite.y + limite.height - meiaAltura),
  };
}

function prender(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

/**
 * Este jogador pode pegar este item?
 *
 * Três condições, e a terceira é a que dá ao mestre o controle sem botão
 * novo: token TRAVADO não anda. É o mesmo cadeado que já impede o próprio
 * mestre de arrastá-lo sem querer -- travar o token do jogador durante uma
 * cena narrada é travar o item, e o celular obedece.
 */
export function podePegar(
  item: Pick<CanvasItem, "personagemId" | "locked">,
  meus: ReadonlySet<string>,
): boolean {
  return Boolean(item.personagemId && meus.has(item.personagemId) && !item.locked);
}

/**
 * Onde o token vai parar, ou `null` se o movimento não vale.
 *
 * A segunda barreira -- a primeira é o vínculo, no daemon. Aqui se confere o
 * que só o board sabe: o item está na cena NO AR, é deste personagem, e não
 * está travado. Um celular modificado que mande o id de outro token, o de um
 * PNJ ou o de uma cena que o mestre está preparando cai aqui.
 *
 * Cena de quadro não aceita movimento nenhum: ali o token é ilustração na
 * mesa de trabalho do mestre, e não uma peça num mapa.
 *
 * O destino é preso ao limite de novo, mesmo que o celular já o tenha preso:
 * a regra tem de valer para quem não é o celular deste aplicativo.
 *
 * `null` também quando o item já está lá, no lugar E no ângulo -- um movimento
 * que não muda nada não deve acordar o histórico nem o disco.
 */
export function destinoAceito(
  scene: Scene,
  movimento: Pick<
    MovimentoDoJogador,
    "personagemId" | "itemId" | "x" | "y" | "rotation"
  >,
): { x: number; y: number; rotation?: number } | null {
  if (ehQuadro(scene)) return null;
  if (!Number.isFinite(movimento.x) || !Number.isFinite(movimento.y)) return null;
  // Presente e sem valor de ângulo derruba o movimento inteiro, como `x` e `y`:
  // aceitar o resto e descartar o giro faria o token andar obedecendo metade de
  // um pedido que já se sabe quebrado.
  if (movimento.rotation !== undefined && !Number.isFinite(movimento.rotation)) {
    return null;
  }

  const item = scene.items.find((candidato) => candidato.id === movimento.itemId);
  if (!item || item.locked || item.personagemId !== movimento.personagemId) {
    return null;
  }

  const destino = prenderNoLimite(
    item,
    movimento.x,
    movimento.y,
    limiteDoMovimento(scene),
  );

  // Normalizado aqui também, e não só no celular: 720 graus e -30 desenham o
  // mesmo token, e guardar o número cru faria a volta comparar diferente do que
  // foi mandado -- o celular esperaria um eco que nunca chegaria igual.
  const giro =
    movimento.rotation === undefined
      ? undefined
      : normalizeAngle(movimento.rotation);

  const parado =
    destino.x === item.x &&
    destino.y === item.y &&
    (giro === undefined || giro === normalizeAngle(item.rotation));

  if (parado) return null;

  return giro === undefined ? destino : { ...destino, rotation: giro };
}
