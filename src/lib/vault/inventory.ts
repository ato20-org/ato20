"use client";

import { open } from "@tauri-apps/plugin-dialog";

import { call } from "@/lib/vault/bridge";
import { shareCharacterAttachment } from "@/lib/vault/evidence";
import type { AssetMeta } from "@/types/scene";
import type { ItemInventario, NovoItem, PatchItem } from "@/types/inventory";

/**
 * O inventário, do lado do mestre.
 *
 * Por IPC, e não pelas rotas do daemon, pela mesma razão dos personagens: o
 * aplicativo **é** o mestre. Uma rota `/mestre/...` obrigaria o daemon a
 * responder "quem é o mestre?" numa porta aberta na rede.
 *
 * A lista vem INTEIRA, com os escondidos: o escondido existe para o mestre ver
 * o que o jogador não vê. Quem filtra é o daemon, do outro lado.
 */

export function listInventory(id: string): Promise<ItemInventario[]> {
  return call<ItemInventario[]>("inventory_list", { id });
}

export function addItem(id: string, novo: NovoItem): Promise<ItemInventario> {
  return call<ItemInventario>("inventory_add", { id, novo });
}

export function updateItem(
  id: string,
  itemId: string,
  patch: PatchItem,
): Promise<ItemInventario> {
  return call<ItemInventario>("inventory_update", { id, itemId, patch });
}

export function removeItem(id: string, itemId: string): Promise<void> {
  return call("inventory_remove", { id, itemId });
}

/**
 * Passa um item de um personagem para outro.
 *
 * Só existe aqui: é gesto de mestre, e o jogador não tem os dois lados da
 * transferência para pedi-la. O ARQUIVO da imagem vai junto quando ela é anexo
 * — o Rust move, porque um anexo apontado de fora da pasta do personagem é
 * recusado na leitura e a grade mostraria um quadro vazio.
 */
export function moveItem(
  de: string,
  para: string,
  itemId: string,
): Promise<ItemInventario> {
  return call<ItemInventario>("inventory_move", { de, para, itemId });
}

/**
 * Pede uma imagem e a prende ao item.
 *
 * Vira ASSET do acervo, e não anexo, porque a imagem do item do mestre precisa
 * alcançar a TV — e o Assistir não tem token nem IPC, só `/asset/{id}`. É a
 * mesma assimetria do retrato e da miniatura, e pelo mesmo motivo.
 *
 * Com escopo `personagem`, para a biblioteca de imagens não listá-la entre as
 * que se arrastam para o mapa.
 *
 * `null` = o mestre fechou o seletor, que não é erro.
 */
export async function escolherImagemDoDisco(
  id: string,
  itemId: string,
): Promise<ItemInventario | null> {
  const escolhido = await open({
    multiple: false,
    title: "Escolha a imagem do item",
    filters: [{ name: "Imagem", extensions: ["png", "jpg", "jpeg", "webp", "gif", "avif"] }],
  });

  if (!escolhido) return null;

  return call<ItemInventario>("inventory_set_imagem", { id, itemId, path: escolhido });
}

/**
 * Leva a imagem do item para o ACERVO, e devolve o asset.
 *
 * Existe para o item poder ir ao MAPA, e é chamada no `drop` do palco — não no
 * `dragstart`, que é síncrono e não pode esperar o disco.
 *
 * Aqui a cópia está certa, ao contrário de `transmitirItem`: o objeto de cena
 * guarda um `assetId` e é GRAVADO na cena, então ele tem de continuar
 * resolvendo depois de fechar e reabrir o aplicativo. O endereço sorteado da
 * evidência morre quando sai do ar e não dá lastro para isso. E é uma cópia por
 * item que vira peça de mapa, num gesto explícito — não uma por transmissão.
 *
 * Idempotente: item cuja imagem já é asset devolve o que ele já tem. O mesmo
 * item vai ao mapa mais de uma vez, e sem isso seriam cinco cópias do mesmo
 * arquivo no acervo.
 */
export function promoverImagemDoItem(
  personagemId: string,
  itemId: string,
): Promise<AssetMeta> {
  return call<AssetMeta>("inventory_promote_imagem", { id: personagemId, itemId });
}

/**
 * Põe a imagem do item na frente de tudo, na mesa.
 *
 * Dois caminhos, porque a imagem tem dois lugares possíveis — e é aqui que a
 * união marcada paga o que custou:
 *
 * `asset` já é alcançável pela TV por `/asset/{id}`, e basta apontar.
 *
 * `anexo` está atrás do token de quem o mandou, e o Assistir não tem token. O
 * daemon então o publica num endereço SORTEADO que morre quando sai do ar —
 * mesmo desenho da ficha. Copiar para o acervo seria o caminho fácil e deixaria
 * um duplicado por transmissão na biblioteca de imagens.
 *
 * Devolve o que a tela precisa guardar para saber se ESTE item é o que está no
 * ar: o id do acervo, ou o sorteado.
 */
export async function transmitirItem(
  personagemId: string,
  item: ItemInventario,
): Promise<{ assetId?: string; sharedId?: string }> {
  if (!item.imagem) throw new Error("Este item não tem imagem para transmitir.");

  if (item.imagem.tipo === "asset") return { assetId: item.imagem.id };

  const sharedId = await shareCharacterAttachment(
    personagemId,
    item.imagem.autor,
    item.imagem.arquivo,
  );

  return { sharedId };
}
