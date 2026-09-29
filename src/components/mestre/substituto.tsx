"use client";

import { createElement, useEffect, useMemo, type ReactNode } from "react";

import { BarreiraDeExtensao } from "@/components/mestre/barreira-de-extensao";
import { garantirCarregada } from "@/lib/extensoes/carregar";
import { chaveContribuicao, type Extensao } from "@/lib/extensoes/manifesto";
import { useContribuicoesStore } from "@/lib/store/use-contribuicoes-store";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";

/**
 * Um corpo de fábrica que um plugin pode trocar pelo dele.
 *
 * `alvo` é `secao:medidores`, `janela:personagem`... O componente envolve o
 * corpo de fábrica (`children`) e, se algum plugin ligado declarou substituto
 * para o alvo, desenha o dele no lugar. Tudo que pode dar errado devolve o de
 * fábrica: plugin desligado, módulo que falhou, corpo não registrado, corpo
 * que estourou no render. Metade de uma ficha é pior que a ficha de sempre.
 *
 * Dois plugins no mesmo alvo: vale o PRIMEIRO por ordem de nome, decisão do
 * projeto. É previsível e não pede configuração; quem quiser o outro desliga
 * o primeiro. `quemSubstitui` diz quem venceu, para a tela de Plugins.
 *
 * Sem plugin com substituto para o alvo, isto é `children` e nada mais: nem
 * uma barreira a mais na árvore de quem não instalou nada.
 */
export function Substituto({
  alvo,
  personagemId,
  children,
}: {
  alvo: string;
  personagemId?: string;
  children: ReactNode;
}) {
  const extensao = useQuemSubstitui(alvo);
  const carga = useContribuicoesStore((state) =>
    extensao ? state.carga[extensao.id] : undefined,
  );
  const Corpo = useContribuicoesStore((state) =>
    extensao ? state.substitutos[chaveContribuicao(extensao.id, alvo)] : undefined,
  );

  // Montar o substituto é o que importa o módulo, como abrir um painel.
  useEffect(() => {
    if (extensao) void garantirCarregada(extensao);
  }, [extensao]);

  if (!extensao || !Corpo) return children;

  return (
    <BarreiraDeExtensao nome={extensao.nome} chave={carga?.estado} reserva={children}>
      {createElement(Corpo, { personagemId })}
    </BarreiraDeExtensao>
  );
}

/** O plugin que substitui este alvo agora, ou `null`. */
export function useQuemSubstitui(alvo: string): Extensao | null {
  const extensoes = useExtensoesStore((state) => state.extensoes);

  return useMemo(() => quemSubstitui(extensoes, alvo), [extensoes, alvo]);
}

/** Pura, para a tela de Plugins e para o teste. */
export function quemSubstitui(extensoes: Extensao[], alvo: string): Extensao | null {
  const candidatas = extensoes
    .filter(
      (extensao) =>
        extensao.habilitada &&
        (extensao.contribui?.substitutos ?? []).some((s) => s.alvo === alvo),
    )
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return candidatas[0] ?? null;
}
