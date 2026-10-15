"use client";

import { toast } from "sonner";

import { t } from "@/lib/i18n/personagens";
import { itensMudaram } from "@/lib/store/use-itens-store";
import { darItem, moveItem } from "@/lib/vault/inventory";

/**
 * Entrega um item arrastado a um personagem.
 *
 * Dois gestos que se parecem e não são o mesmo. Vindo da ficha de OUTRO
 * personagem (`de`), o item muda de mão: sai de lá e entra aqui. Vindo de onde
 * ele não é de ninguém — a janela de Itens, um ponto, o handout —, ele é DADO, e
 * continua onde estava. Item é item: dar não o tira do catálogo.
 *
 * Um lugar só para os dois destinos que recebem — a grade da ficha aberta e a
 * linha do personagem na lista —, que antes de existir esta função eram duas
 * cópias do mesmo `try`, cada uma avisando um conjunto diferente de telas.
 */
export async function entregarItem(
  itemId: string,
  para: { id: string; nome: string },
  de?: string,
): Promise<void> {
  try {
    const item = de ? await moveItem(de, para.id, itemId) : await darItem(para.id, itemId);

    // Os DOIS, quando mudou de mão: aqui ganhou um item, e a ficha de onde ele
    // saiu perdeu um -- e ela é outra janela, que não fica sabendo de nada
    // sozinha.
    itensMudaram(de ? [para.id, de] : [para.id]);

    toast.success(t.inventario.chegou(item.nome, para.nome));
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : t.inventario.falhaAoMover);
  }
}
