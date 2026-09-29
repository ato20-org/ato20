"use client";

import { useMemo } from "react";

import type { Kit } from "@/components/ui/menu-kit";
import type { ContextoDeMenu } from "@/lib/extensoes/api";
import { executarItemDeMenu } from "@/lib/extensoes/carregar";
import { iconeDeExtensao } from "@/lib/extensoes/icones";
import {
  chaveContribuicao,
  type AlvoDeMenu,
  type Extensao,
  type ItemDeMenuDeclarado,
} from "@/lib/extensoes/manifesto";
import { useContribuicoesStore } from "@/lib/store/use-contribuicoes-store";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";

/**
 * Os itens que os plugins puseram num menu.
 *
 * Saem do que o manifesto DECLARA, e não do que o módulo registrou: o item
 * tem de aparecer antes de o módulo ser importado, porque é o clique nele que
 * importa -- a mesma regra do comando e do painel. `quando` só vale depois de
 * o módulo registrar; antes disso o item aparece, e o pior caso é um clique
 * que carrega o módulo e não faz nada.
 *
 * Um separador antes, e só quando há item: a regra do menu do palco esconde
 * o último separador, então um bloco vazio não deixa risco solto.
 *
 * Sem plugin com item para este alvo, isto renderiza NADA -- nem um
 * fragmento vazio custa aqui, e é o que mantém o menu de fábrica idêntico
 * para quem não instalou nada.
 */
export function ItensDeExtensao({
  alvo,
  contexto,
  kit,
}: {
  alvo: AlvoDeMenu;
  contexto: ContextoDeMenu;
  kit: Kit;
}) {
  const declarados = useItensDeclarados(alvo);
  const registrados = useContribuicoesStore((state) => state.itensDeMenu);

  if (declarados.length === 0) return null;

  const visiveis = declarados.filter(({ extensao, item }) => {
    const registrado = registrados[chaveContribuicao(extensao.id, item.id)];

    return !registrado?.quando || registrado.quando(contexto);
  });

  if (visiveis.length === 0) return null;

  const { Item, Separator } = kit;

  return (
    <>
      <Separator />
      {visiveis.map(({ extensao, item }) => {
        const Icone = iconeDeExtensao(item.icone);

        return (
          <Item
            key={chaveContribuicao(extensao.id, item.id)}
            onClick={() => void executarItemDeMenu(extensao, item.id, contexto)}
          >
            <Icone />
            {item.titulo}
          </Item>
        );
      })}
    </>
  );
}

/** Algum plugin ligado declara item para este alvo? Para o menu que só
 * existe por causa deles -- parede, retrato no palco. */
export function useTemItensDeExtensao(alvo: AlvoDeMenu): boolean {
  return useItensDeclarados(alvo).length > 0;
}

function useItensDeclarados(
  alvo: AlvoDeMenu,
): Array<{ extensao: Extensao; item: ItemDeMenuDeclarado }> {
  const extensoes = useExtensoesStore((state) => state.extensoes);

  return useMemo(
    () =>
      extensoes
        .filter((extensao) => extensao.habilitada)
        .flatMap((extensao) =>
          (extensao.contribui?.itensDeMenu ?? [])
            .filter((item) => item.alvo === alvo)
            .map((item) => ({ extensao, item })),
        ),
    [extensoes, alvo],
  );
}
