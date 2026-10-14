"use client";

import { toast } from "sonner";

import { t } from "@/lib/i18n/itens";
import { useSpotlightStore } from "@/lib/store/use-spotlight-store";
import { imagemParaAMesa } from "@/lib/vault/itens";
import { medidoresDoItem, type Item } from "@/types/inventory";
import type { Spotlight } from "@/types/scene";

/**
 * Pôr um item na frente de tudo, na mesa — e saber se é ele que está lá.
 *
 * Hook, e não componente, porque cada lugar que transmite desenha uma coisa
 * diferente: a janela de Itens tem uma linha de menu, a janela do item tem um
 * botão com rótulo, o ponto e o handout têm um ícone no canto da célula, e o
 * gizmo da peça tem o dele. O que eles compartilham é a resposta a "é ESTE item
 * que está no ar", e ela mora no store da evidência — ver
 * `useSpotlightStore.itemId`.
 *
 * Vai o CARTÃO: nome, descrição, os atributos e os medidores que o jogador vê,
 * e a imagem quando há uma. Item sem imagem também vai -- o bilhete que o grupo
 * achou é só texto.
 *
 * `atuais` são os medidores da mochila de onde ele é mostrado. Sem eles, o item
 * vai com os medidores cheios, que é como a campanha o define.
 */
export function useTransmissaoDoItem(
  item: Item | undefined,
  atuais?: Record<string, number>,
) {
  const noAr = useSpotlightStore(
    (state) => item !== undefined && state.itemId === item.id,
  );

  async function transmitir(item: Item) {
    try {
      // O endereço sai antes de a evidência subir: pedi-lo pode falhar, e
      // falhar tem de virar aviso na tela do mestre, não cartão sem imagem na
      // TV.
      const imagem = await imagemParaAMesa(item);

      useSpotlightStore.getState().transmitItem(item.id, cartaoDoItem(item, atuais), imagem);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t.falhas.transmitir);
    }
  }

  return {
    noAr,
    alternar: () => {
      if (!item) return;

      if (noAr) useSpotlightStore.getState().clear();
      else void transmitir(item);
    },
  };
}

/**
 * O que a mesa recebe de um item: só o que o jogador pode ver.
 *
 * Aqui, e não na tela que desenha: o cartão é publicado para a TV e para todo
 * celular da mesa, e o atributo escondido que chegasse lá e sumisse no React já
 * teria vazado -- estaria no quadro que o navegador recebeu.
 */
export function cartaoDoItem(
  item: Item,
  atuais?: Record<string, number>,
): NonNullable<Spotlight["item"]> {
  const atributos = (item.atributos ?? [])
    .filter((atributo) => !atributo.escondido)
    .map(({ nome, valor }) => ({ nome, valor }));
  const medidores = medidoresDoItem(item, atuais).filter((medidor) => !medidor.escondido);

  return {
    nome: item.nome,
    descricao: item.descricao,
    ...(atributos.length > 0 ? { atributos } : {}),
    ...(medidores.length > 0 ? { medidores } : {}),
  };
}
