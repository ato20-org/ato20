"use client";

import { open } from "@tauri-apps/plugin-dialog";

import { invalidarAcervo } from "@/lib/store/use-assets-store";
import { call } from "@/lib/vault/bridge";
import { shareCharacterAttachment } from "@/lib/vault/evidence";
import { t } from "@/lib/i18n/itens";
import type { AssetMeta } from "@/types/scene";
import type {
  Item,
  NovoItemDaCampanha,
  PatchItemDaCampanha,
  Portador,
} from "@/types/inventory";

/**
 * O catálogo de itens da campanha, do lado do mestre.
 *
 * Por IPC, e não pelas rotas do daemon, pela mesma razão do inventário e dos
 * personagens: o aplicativo **é** o mestre. O celular nunca vê o catálogo
 * inteiro — só o que está no inventário do personagem dele, e sem o escondido.
 * Ver `vault::itens`.
 */

export function listItens(): Promise<Item[]> {
  return call<Item[]>("itens_list");
}

export function criarItem(novo: NovoItemDaCampanha): Promise<Item> {
  return call<Item>("item_create", { novo });
}

export function editarItem(id: string, patch: PatchItemDaCampanha): Promise<Item> {
  return call<Item>("item_update", { id, patch });
}

/**
 * Apaga o item da campanha, e com ele cada entrada dele nos inventários.
 *
 * Os pontos, os handouts e as peças do mapa que o citam são do BOARD, que o Rust
 * não conhece — a cena é opaca para ele. Quem os limpa é o chamador, pelo
 * `esquecerItem` do store da cena.
 */
export function removerItem(id: string): Promise<void> {
  return call("item_remove", { id });
}

/** Quem carrega o quê: uma linha por item em cada inventário. */
export function listPortadores(): Promise<Portador[]> {
  return call<Portador[]>("itens_portadores");
}

/**
 * Pede uma imagem e a prende ao item.
 *
 * Vira ASSET do acervo, e não anexo, porque a imagem do item do mestre precisa
 * alcançar a TV — e o Espectador não tem token nem IPC, só `/asset/{id}`. É a
 * mesma assimetria do retrato e da miniatura, e pelo mesmo motivo.
 *
 * Com escopo `personagem`, para a biblioteca de imagens não listá-la entre as
 * que se arrastam para o mapa.
 *
 * `null` = o mestre fechou o seletor, que não é erro.
 */
export async function escolherImagemDoItem(id: string): Promise<Item | null> {
  const escolhido = await open({
    multiple: false,
    title: t.imagem.escolhaAImagem,
    filters: [
      {
        name: t.imagem.filtro,
        extensions: ["png", "apng", "jpg", "jpeg", "webp", "gif", "avif"],
      },
    ],
  });

  if (!escolhido) return null;

  const item = await call<Item>("item_set_imagem", { id, path: escolhido });

  invalidarAcervo("image");

  return item;
}

/**
 * Leva a imagem do item para o ACERVO, e devolve o asset.
 *
 * Existe para o item poder ir ao MAPA, e é chamada no `drop` do palco — não no
 * `pointerdown`, que é síncrono e não pode esperar o disco.
 *
 * Aqui a cópia está certa, ao contrário de `transmitirItem`: a peça de mapa
 * guarda um `assetId` e é GRAVADA na cena, então ela tem de continuar
 * resolvendo depois de fechar e reabrir o aplicativo. O endereço sorteado da
 * evidência morre quando sai do ar e não dá lastro para isso. E é uma cópia por
 * item que vira peça de mapa, num gesto explícito — não uma por transmissão.
 *
 * Idempotente: item cuja imagem já é asset devolve o que ele já tem. O mesmo
 * item vai ao mapa mais de uma vez, e sem isso seriam cinco cópias do mesmo
 * arquivo no acervo.
 */
export async function promoverImagemDoItem(id: string): Promise<AssetMeta> {
  const asset = await call<AssetMeta>("item_promote_imagem", { id });

  // Pode ter nascido um arquivo agora -- e por ser idempotente, pode não ter.
  // Reler nos dois casos é uma chamada, e adivinhar qual foi custaria comparar
  // com a lista de antes.
  invalidarAcervo("image");

  return asset;
}

/**
 * A imagem do item como a mesa a alcança.
 *
 * Dois caminhos, porque a imagem tem dois lugares possíveis — e é aqui que a
 * união marcada paga o que custou:
 *
 * `asset` já é alcançável pela TV por `/asset/{id}`, e basta apontar.
 *
 * `anexo` está atrás do token de quem o mandou, e o Espectador não tem token. O
 * daemon então o publica num endereço SORTEADO que morre quando sai do ar —
 * mesmo desenho da ficha. Copiar para o acervo seria o caminho fácil e deixaria
 * um duplicado por transmissão na biblioteca de imagens.
 *
 * Sem imagem, nada: o item ainda vai ao ar, como cartão só de texto.
 */
export async function imagemParaAMesa(
  item: Item,
): Promise<{ assetId?: string; sharedId?: string }> {
  if (!item.imagem) return {};

  if (item.imagem.tipo === "asset") return { assetId: item.imagem.id };

  const sharedId = await shareCharacterAttachment(
    item.imagem.personagem,
    item.imagem.autor,
    item.imagem.arquivo,
  );

  return { sharedId };
}
