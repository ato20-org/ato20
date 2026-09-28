"use client";

import { Check, Minus, Settings2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { SeloDaCondicao } from "@/components/playground/selos-da-condicao";
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import { chaveDoNome, temCondicao } from "@/lib/condicao";
import { useCharactersStore } from "@/lib/store/use-characters-store";
import { useCondicoesDaCampanha } from "@/lib/store/use-condicoes-store";
import { alternarCondicao, removerCondicao } from "@/lib/vault/characters";
import type { Condicao, Personagem } from "@/types/character";
import type { CanvasItem } from "@/types/scene";

/**
 * "Condições", no botão direito do token: o gesto do meio do combate.
 *
 * Vale para a SELEÇÃO inteira, ao contrário do submenu de aparências. Lá cada
 * personagem tem aparências próprias e não há lista comum; aqui a lista é o
 * cardápio da campanha, e envenenar a horda de uma vez é justamente o pedido.
 *
 * Cada linha diz o estado da seleção: marcada se todos têm, um traço se só
 * alguns têm. Tocar LIGA em todos, a menos que todos já tenham -- aí desliga.
 * É a regra da caixa de marcar de qualquer sistema, e é o que faz o traço
 * virar marca num toque, em vez de desligar quem já estava envenenado.
 *
 * O menu NÃO fecha ao marcar, pela razão da opacidade: marcar é olhar o mapa e
 * corrigir, e dois cliques por condição cobrariam o combate inteiro.
 */
export function SubmenuDeCondicoes({ itens }: { itens: CanvasItem[] }) {
  const personagens = useCharactersStore((state) => state.personagens);
  const recarregar = useCharactersStore((state) => state.recarregar);
  const { modelos } = useCondicoesDaCampanha();
  const abrirJanela = useAbrirJanela();

  // Um personagem por token, sem repetir a horda de clones: são eles que
  // ganham a condição, e não os tokens.
  const ids = [
    ...new Set(
      itens
        .map((item) => item.personagemId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const alvos = ids
    .map((id) => personagens?.find((personagem) => personagem.id === id))
    .filter((personagem): personagem is Personagem => Boolean(personagem));

  if (alvos.length === 0) return null;

  const cardapio = modelos ?? [];
  const nomesDoCardapio = new Set(cardapio.map((modelo) => chaveDoNome(modelo.nome)));

  // Com UM personagem, as condições dele que não estão no cardápio -- a
  // maldição que só ele tem -- aparecem também, para sair pelo mesmo menu.
  // Com vários, não: "tirar a maldição do Edgar" num menu de cinco tokens é um
  // gesto que ninguém procura ali.
  const avulsas =
    alvos.length === 1
      ? (alvos[0]!.condicoes ?? []).filter(
          (condicao) => !nomesDoCardapio.has(chaveDoNome(condicao.nome)),
        )
      : [];

  async function alternar(modelo: Condicao, ligar: boolean) {
    try {
      const mudaram = await alternarCondicao(
        alvos.map((alvo) => alvo.id),
        modelo.id,
        ligar,
      );
      if (ligar && mudaram === 0) {
        toast.error("Ninguém da seleção tem lugar para mais uma condição.");
      }
      recarregar();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao marcar.");
    }
  }

  async function tirarAvulsa(condicao: Condicao) {
    try {
      await removerCondicao(alvos[0]!.id, condicao.id);
      recarregar();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao tirar.");
    }
  }

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Sparkles />
        Condições
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="min-w-44">
        {cardapio.map((modelo) => {
          const quantos = alvos.filter((alvo) =>
            temCondicao(alvo.condicoes, modelo.nome),
          ).length;
          const todos = quantos === alvos.length;

          return (
            <ContextMenuItem
              key={modelo.id}
              closeOnClick={false}
              aria-checked={todos ? true : quantos > 0 ? "mixed" : false}
              onClick={() => void alternar(modelo, !todos)}
            >
              {/* O espaço fica reservado sem a marca, pela razão do submenu de
                  aparências: sem ele os nomes andam a cada toque. */}
              {todos ? (
                <Check />
              ) : quantos > 0 ? (
                <Minus />
              ) : (
                <span className="size-4" aria-hidden />
              )}
              <SeloDaCondicao condicao={modelo} tamanho={16} />
              {modelo.nome}
            </ContextMenuItem>
          );
        })}

        {avulsas.map((condicao) => (
          <ContextMenuItem
            key={condicao.id}
            closeOnClick={false}
            aria-checked
            onClick={() => void tirarAvulsa(condicao)}
          >
            <Check />
            <SeloDaCondicao condicao={condicao} tamanho={16} />
            {condicao.nome}
          </ContextMenuItem>
        ))}

        {cardapio.length === 0 && avulsas.length === 0 ? (
          <ContextMenuItem disabled>
            <span className="size-4" aria-hidden />
            Nenhuma condição na campanha
          </ContextMenuItem>
        ) : null}

        <ContextMenuSeparator />

        {/* O caminho até o cardápio, para quem abriu o menu e não achou o que
            queria. Criar no próprio menu pediria um campo de texto dentro de
            um submenu, que fecha ao primeiro movimento errado do mouse. */}
        <ContextMenuItem onClick={() => abrirJanela({ tipo: "configuracao" })}>
          <Settings2 />
          Condições da campanha…
        </ContextMenuItem>
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
