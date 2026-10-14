"use client";

import { call } from "@/lib/vault/bridge";
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
 *
 * O inventário guarda só referências ao catálogo — ver `@/types/inventory`. O
 * que volta daqui já vem achatado: o item do catálogo com a quantidade e o
 * escondido DESTE inventário.
 */

export function listInventory(id: string): Promise<ItemInventario[]> {
  return call<ItemInventario[]>("inventory_list", { id });
}

/**
 * Cria um item no catálogo e já o põe neste inventário.
 *
 * É o `+` da ficha: o gesto é "este personagem tem uma coisa nova", e obrigar o
 * mestre a criar no catálogo para depois arrastar seriam dois passos para um.
 */
export function addItem(id: string, novo: NovoItem): Promise<ItemInventario> {
  return call<ItemInventario>("inventory_add", { id, novo });
}

/**
 * Dá um item do catálogo a este personagem.
 *
 * Se ele já tem o item, soma à quantidade em vez de criar uma segunda linha:
 * duas poções iguais na mesma mochila são "2 poções", e não duas coisas.
 */
export function darItem(
  id: string,
  itemId: string,
  quantidade?: number,
): Promise<ItemInventario> {
  return call<ItemInventario>("inventory_give", {
    id,
    itemId,
    quantidade: quantidade ?? null,
  });
}

/**
 * Edita o item visto deste inventário.
 *
 * `nome`, `descricao` e `imagem` vão para o CATÁLOGO e mudam o item em todo
 * inventário que o tem; `quantidade` e `escondido` ficam neste. Ver `PatchItem`.
 */
export function updateItem(
  id: string,
  itemId: string,
  patch: PatchItem,
): Promise<ItemInventario> {
  return call<ItemInventario>("inventory_update", { id, itemId, patch });
}

/**
 * Tira o item DESTE inventário. O item continua na campanha: item é item, e o
 * que sai daqui ainda pode estar com outro personagem, num ponto do mapa ou no
 * catálogo esperando dono. Apagar de vez é `removerItem`.
 */
export function removeItem(id: string, itemId: string): Promise<void> {
  return call("inventory_remove", { id, itemId });
}

/**
 * Passa um item de um personagem para outro.
 *
 * Só existe aqui: é gesto de mestre, e o jogador não tem os dois lados da
 * transferência para pedi-la. Quem já tem o item recebe a quantidade somada.
 */
export function moveItem(
  de: string,
  para: string,
  itemId: string,
): Promise<ItemInventario> {
  return call<ItemInventario>("inventory_move", { de, para, itemId });
}
