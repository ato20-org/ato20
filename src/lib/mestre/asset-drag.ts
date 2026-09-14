import type { AssetMeta } from "@/types/scene";

/**
 * Tipo próprio no `dataTransfer`.
 *
 * Não `text/plain`: com um tipo genérico, qualquer texto arrastado de outra
 * aba viraria tentativa de inserir imagem, e o palco precisaria adivinhar o
 * que recebeu. Um tipo dedicado faz o navegador filtrar por nós.
 */
export const ASSET_DRAG_TYPE = "application/x-ato20-asset";

/**
 * Segundo tipo, posto junto do primeiro no arrasto de ITEM.
 *
 * Existe porque durante o `dragover` o conteúdo do arrasto é ilegível por
 * segurança — só os TIPOS são. Sem esta marca, a grade de um inventário não
 * teria como saber, enquanto o ponteiro passa por cima dela, se o que vem é um
 * item (que ela aceita) ou uma imagem do acervo (que ela não aceita), e teria de
 * acender a borda para os dois para descobrir no `drop` que recusa um deles.
 *
 * Os dois tipos juntos, e não um no lugar do outro: o palco aceita as duas
 * coisas, e ele já pergunta por `ASSET_DRAG_TYPE`.
 */
export const ITEM_DRAG_TYPE = "application/x-ato20-item";

/**
 * O que viaja no arrasto.
 *
 * As medidas naturais vão junto porque o palco não conhece o acervo: ele
 * recebe o que foi solto, não um id para consultar numa lista que vive noutro
 * painel.
 *
 * `assetId` ausente com `item` presente é o arrasto vindo do INVENTÁRIO: a
 * imagem do item pode ainda ser um anexo, que não tem id de acervo, e o palco
 * resolve isso no `drop` — ver `promoverImagemDoItem`. O id não pode sair daqui
 * pronto porque descobri-lo é ida ao disco, e `dragstart` é síncrono.
 */
export type AssetDragPayload = {
  assetId?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  /** Item de inventário, a ser resolvido em asset no momento em que for solto. */
  item?: { personagemId: string; itemId: string };
  /**
   * De quem é o token, quando o arrasto saiu da lista de personagens.
   *
   * Vai junto do `assetId` da miniatura, e não no lugar dele: o palco insere a
   * imagem pelo mesmo caminho de sempre, e o que este campo acrescenta é o item
   * saber de quem ele é -- o que traz a linha na lista de retratos e faz a
   * camada se chamar "Edgar" em vez de "Personagem - Edgar.png". Mesmo efeito do
   * botão `PorNoMapa`, pelo gesto de arrastar.
   */
  personagemId?: string;
};

export function writeAssetDrag(transfer: DataTransfer, asset: AssetMeta): void {
  escrever(transfer, {
    assetId: asset.id,
    naturalWidth: asset.naturalWidth,
    naturalHeight: asset.naturalHeight,
  });
}

/**
 * Arrasta o token de um personagem para o mapa.
 *
 * A miniatura JÁ é um arquivo do acervo -- é por isso que ela é asset e não
 * anexo, para alcançar a TV --, então isto é o arrasto do acervo com o dono
 * marcado. O palco não precisa aprender um segundo tipo: ele já aceita
 * `ASSET_DRAG_TYPE`, já pinta a borda no `dragover`, e passa o `personagemId`
 * adiante ao criar o item.
 *
 * Quem não tem miniatura não é arrastável, e é o mesmo impedimento do botão:
 * sem o registro do acervo não se sabe a proporção da imagem, e token com
 * tamanho chutado fica esticado PARA SEMPRE -- o gizmo do item trava a
 * proporção. Ver `PorNoMapa`.
 */
export function writeCharacterDrag(
  transfer: DataTransfer,
  personagemId: string,
  miniatura: AssetMeta,
): void {
  escrever(transfer, {
    assetId: miniatura.id,
    naturalWidth: miniatura.naturalWidth,
    naturalHeight: miniatura.naturalHeight,
    personagemId,
  });
}

/**
 * Arrasta um item de inventário para a mesa.
 *
 * Carrega a REFERÊNCIA do item, e não a imagem dele. O mesmo tipo de arrasto do
 * acervo, de propósito: o palco já sabe recebê-lo, já pinta a borda de "pode
 * soltar aqui" no `dragover`, e um segundo tipo faria os dois caminhos
 * divergirem no dia em que um deles mudasse.
 */
export function writeItemDrag(
  transfer: DataTransfer,
  personagemId: string,
  itemId: string,
): void {
  const payload: AssetDragPayload = { item: { personagemId, itemId } };

  escrever(transfer, payload);
  transfer.setData(ITEM_DRAG_TYPE, JSON.stringify(payload));
  // `copyMove` porque as duas coisas são verdade conforme onde se solta: no
  // palco o item é COPIADO para o mapa e continua no inventário; noutro
  // inventário ele é MOVIDO, e sai daqui. Quem escolhe é o alvo, no `dragover`.
  transfer.effectAllowed = "copyMove";

  arrastando = { personagemId, itemId };
}

function escrever(transfer: DataTransfer, payload: AssetDragPayload): void {
  transfer.setData(ASSET_DRAG_TYPE, JSON.stringify(payload));
  transfer.effectAllowed = "copy";
}

/**
 * Que item está sendo arrastado AGORA, se houver.
 *
 * Estado de módulo, e não um store: quem pergunta é o `dragover`, que precisa
 * decidir na hora se acende a borda — e não um render que precise reagir. Um
 * store faria cada tela redesenhar a cada início de arrasto para responder uma
 * pergunta que só um handler faz.
 *
 * Serve ao inventário para não se oferecer como destino do PRÓPRIO item: o tipo
 * do arrasto diz que é item, mas não de quem — e o conteúdo, que diria, é
 * ilegível durante o `dragover`.
 */
let arrastando: { personagemId: string; itemId: string } | null = null;

export function itemEmArrasto(): {
  personagemId: string;
  itemId: string;
} | null {
  return arrastando;
}

/**
 * Fim do arrasto, tenha ele sido solto em algum lugar ou não.
 *
 * Chamada no `dragend` da origem. Se ela não vier — e há navegador em que não
 * vem, quando o arrasto termina fora da janela — o que fica é uma marca velha, e
 * o pior que ela causa é uma borda acesa num inventário no arrasto seguinte. O
 * `drop` confere de novo, no conteúdo, onde a verdade está.
 */
export function limparItemEmArrasto(): void {
  arrastando = null;
}

/** O arrasto atual é um item de inventário. Legível durante o `dragover`. */
export function hasItemDrag(transfer: DataTransfer): boolean {
  return transfer.types.includes(ITEM_DRAG_TYPE);
}

/** `null` quando o que foi solto não é imagem do acervo nem item. */
export function readAssetDrag(transfer: DataTransfer): AssetDragPayload | null {
  const raw = transfer.getData(ASSET_DRAG_TYPE);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as AssetDragPayload;

    return parsed.assetId || parsed.item ? parsed : null;
  } catch {
    // Arrasto de outra origem com o mesmo tipo: ignorar é melhor que quebrar.
    return null;
  }
}

/** O arrasto atual carrega imagem do acervo. */
export function hasAssetDrag(transfer: DataTransfer): boolean {
  // Durante `dragover` o conteúdo é ilegível por segurança — só os tipos são.
  return transfer.types.includes(ASSET_DRAG_TYPE);
}
