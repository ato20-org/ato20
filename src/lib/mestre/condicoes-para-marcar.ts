"use client";

import { useMemo } from "react";

import { chaveDoNome } from "@/lib/condicao";
import { useCondicoesDaCampanha } from "@/lib/store/use-condicoes-store";
import { useCondicoesDoCompendio } from "@/lib/store/use-condicoes-do-compendio-store";
import { useEfeitosDaCampanhaStore } from "@/lib/store/use-efeitos-da-campanha-store";
import { criarCondicao, editarCondicao, removerCondicao } from "@/lib/vault/characters";
import { MAX_CONDICOES, type Condicao, type MoldeDeCondicao, type Personagem } from "@/types/character";

/**
 * Uma condição que o mestre pode marcar, e de onde ela vem.
 *
 * O cardápio da campanha e a biblioteca do Compêndio marcam por caminhos
 * diferentes: o cardápio pelo Rust, que acha o modelo pelo id; o Compêndio
 * pela cópia na ficha, com o efeito dele posto em jogo antes -- o mesmo de
 * soltar o card num token. Ver `alternarNosPersonagens`.
 */
export type CondicaoParaMarcar = { condicao: Condicao; doCompendio: boolean };

/**
 * O que o botão direito do token e o "+" da ficha oferecem: o cardápio, e
 * depois as condições do Compêndio.
 *
 * As duas listas, e não só o Compêndio: o cardápio é onde o sistema de um
 * plugin põe as condições dele, e onde estavam as da campanha antes de o
 * Compêndio ter as suas. Um nome que está nos dois aparece uma vez, a do
 * cardápio -- o menu reconhece as fichas pelo nome, e duas linhas "Em chamas"
 * marcariam a mesma coisa.
 *
 * `null` enquanto nenhuma das duas foi lida.
 */
export function useCondicoesParaMarcar(): CondicaoParaMarcar[] | null {
  const { modelos } = useCondicoesDaCampanha();
  const { lista } = useCondicoesDoCompendio();

  return useMemo(() => {
    if (modelos === null && lista === null) return null;

    const nomes = new Set<string>();
    const opcoes: CondicaoParaMarcar[] = [];

    for (const condicao of modelos ?? []) {
      nomes.add(chaveDoNome(condicao.nome));
      opcoes.push({ condicao, doCompendio: false });
    }
    for (const molde of lista ?? []) {
      const chave = chaveDoNome(molde.nome);
      if (nomes.has(chave)) continue;
      nomes.add(chave);
      opcoes.push({ condicao: semTags(molde), doCompendio: true });
    }

    return opcoes;
  }, [modelos, lista]);
}

/**
 * A condição sem as tags do Compêndio: elas são da biblioteca, e iriam parar
 * na ficha e na cena junto com a cópia.
 */
function semTags(molde: MoldeDeCondicao): Condicao {
  const { id, nome, cor, icone, efeito, escondido } = molde;
  return efeito ? { id, nome, cor, icone, efeito, escondido } : { id, nome, cor, icone, escondido };
}

/**
 * A condição do Compêndio pronta para a peça: o efeito guardado no Compêndio
 * está fora do jogo, e a mesa não o desenharia. Vai uma cópia dele ao jogo e o
 * molde fica, como no arrasto até o token. `null` = o efeito não coube, e o
 * store já disse por quê.
 */
export async function prontaParaAPeca(condicao: Condicao): Promise<Condicao | null> {
  if (!condicao.efeito) return condicao;

  const efeito = await useEfeitosDaCampanhaStore.getState().paraOJogo(condicao.efeito);
  return efeito ? { ...condicao, efeito } : null;
}

/**
 * Liga ou desliga uma condição do Compêndio nos personagens: o que
 * `alternarCondicao` faz pelo Rust com o cardápio, aqui pela ficha de cada um.
 * As mesmas regras -- pelo nome, ninguém ganha duas, quem está cheio fica de
 * fora sem parar a horda -- e devolve quantos mudaram, como lá.
 *
 * Ligar espera a condição já pronta para a peça. Ver `prontaParaAPeca`.
 */
export async function alternarNosPersonagens(
  personagens: ReadonlyArray<Personagem>,
  condicao: Condicao,
  ligar: boolean,
): Promise<number> {
  const chave = chaveDoNome(condicao.nome);
  let mudaram = 0;

  for (const personagem of personagens) {
    const atual = personagem.condicoes ?? [];
    const tem = atual.find((existente) => chaveDoNome(existente.nome) === chave);

    if (ligar) {
      if (tem || atual.length >= MAX_CONDICOES) continue;
      await criarNaFicha(personagem.id, condicao);
      mudaram += 1;
    } else if (tem) {
      await removerCondicao(personagem.id, tem.id);
      mudaram += 1;
    }
  }

  return mudaram;
}

/**
 * Cria a cópia na ficha, escondida se a condição chega escondida -- o que o
 * Rust faz ao marcar pelo cardápio. Sem isso, o segredo do Compêndio chegaria
 * à vista da mesa.
 */
export async function criarNaFicha(
  personagemId: string,
  condicao: Omit<Condicao, "id">,
): Promise<void> {
  const nova = await criarCondicao(
    personagemId,
    condicao.nome,
    condicao.cor,
    condicao.icone,
    condicao.efeito ?? null,
  );
  if (condicao.escondido) await editarCondicao(personagemId, nova.id, { escondido: true });
}
