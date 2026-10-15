"use client";

import { toast } from "sonner";
import { create } from "zustand";

import { confirmarApagar } from "@/components/mestre/confirmar-apagar";
import { type Kit } from "@/components/ui/menu-kit";
import { useCharacters } from "@/hooks/use-characters";
import { abrirJanela } from "@/lib/extensoes/janelas";
import { t } from "@/lib/i18n/itens";
import { itensMudaram } from "@/lib/store/use-itens-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSpotlightStore } from "@/lib/store/use-spotlight-store";
import { darItem } from "@/lib/vault/inventory";
import { removerItem } from "@/lib/vault/itens";
import type { Personagem } from "@/types/character";
import type { Item } from "@/types/inventory";

/**
 * O que se faz com um item de qualquer lugar do Mestre: abrir, dar, apagar.
 *
 * Funções soltas, e não um componente: quem abre o item é a janela de Itens, a
 * ficha, o ponto, o handout, o gizmo e o menu do palco, e cada um desenha o seu
 * botão. O que eles têm de concordar é o que acontece depois do clique.
 */

/**
 * Abre o item: a janela dele, que é onde ele se lê E se escreve.
 *
 * Com `personagemId`, ele abre como está NAQUELA mochila: a quantidade, o olho
 * e os medidores de lá. Sem, abre como a campanha o define.
 *
 * Janela, e não diálogo, pela razão da ficha do personagem: o mestre lê a
 * espada do Edgar com o mapa e a ficha dele ainda à vista, e abre a da Mira ao
 * lado para comparar.
 */
export function abrirItem(item: Pick<Item, "id">, personagemId?: string) {
  abrirJanela({ tipo: "item", itemId: item.id, personagemId });
}

/**
 * O item que acabou de nascer, e que abre com o nome já em edição.
 *
 * Não há tela de criar: o "Criar item" faz o item com o nome de fábrica e abre
 * a janela dele, onde tudo se edita no lugar. O que falta é o cursor já no nome
 * -- o gesto seguinte é sempre dar o nome --, e quem sabe disso é quem criou,
 * não a janela. Um store, e não um parâmetro da janela, porque o pedido vale
 * UMA vez: reabrir o mesmo item depois não pode voltar a abrir o campo.
 */
const useNomearStore = create<{ itemId: string | null }>(() => ({ itemId: null }));

/** Abre o item recém-criado, com o nome em edição. */
export function abrirItemNovo(item: Pick<Item, "id">, personagemId?: string) {
  useNomearStore.setState({ itemId: item.id });
  abrirItem(item, personagemId);
}

/**
 * Este item pediu para abrir nomeando? Consome o pedido: devolve `true` uma
 * vez, e a próxima pergunta já ouve `false`.
 */
export function consumirPedidoDeNomear(itemId: string): boolean {
  if (useNomearStore.getState().itemId !== itemId) return false;

  useNomearStore.setState({ itemId: null });
  return true;
}

/**
 * As linhas do "Dar a", no menu da linha da janela de Itens -- nos dois menus
 * dela, e por isso recebe a linha do `Kit` em vez de escolher uma.
 *
 * TODOS os personagens, e não "os que ainda não têm": o catálogo não sabe quem
 * tem o quê, e nem precisa. Dar a bandagem a quem já tem uma soma à mochila
 * dele -- é o `darItem`, que junta na mesma linha.
 */
export function OpcoesDeDar({
  item,
  Item: Linha,
}: {
  item: Item;
  Item: Kit["Item"];
}) {
  const { personagens } = useCharacters();

  if (!personagens?.length) {
    return <Linha disabled>{t.dar.ninguem}</Linha>;
  }

  return (
    <>
      {personagens.map((personagem) => (
        <Linha key={personagem.id} onClick={() => void dar(item, personagem)}>
          <span className="truncate">{personagem.nome}</span>
        </Linha>
      ))}
    </>
  );
}

/** Dá o item a um personagem, e avisa quem precisa saber. */
export async function dar(item: Item, personagem: Pick<Personagem, "id" | "nome">) {
  try {
    await darItem(personagem.id, item.id);
    itensMudaram([personagem.id]);
    toast.success(t.dar.chegou(item.nome, personagem.nome));
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : t.falhas.dar);
  }
}

/**
 * Pergunta, e apaga o item da campanha. `true` se apagou.
 *
 * Um caminho só para a janela do item e o menu da janela de Itens: além do
 * Rust, que tira o item do catálogo e das mochilas, o BOARD precisa esquecê-lo
 * — pontos, handouts, pastas e peças do mapa —, e o Rust não alcança o board.
 */
export async function apagarDaCampanha(item: Item): Promise<boolean> {
  const ok = await confirmarApagar({
    titulo: t.apagar.titulo(item.nome),
    itens: t.apagar.itens(item.nome),
    ressalva: t.apagar.ressalva,
  });
  if (!ok) return false;

  try {
    await removerItem(item.id);

    useSceneStore.getState().esquecerItem(item.id);
    // Todas as fichas: quem tinha o item não é pergunta do catálogo.
    itensMudaram();

    // No ar, sai do ar: o cartão de um item que não existe mais ficaria na TV
    // sem nenhum botão na tela do mestre capaz de tirá-lo dali.
    const evidencia = useSpotlightStore.getState();
    if (evidencia.itemId === item.id) evidencia.clear();

    return true;
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : t.falhas.apagar);
    return false;
  }
}
