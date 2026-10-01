"use client";

import { useEffect, useRef } from "react";

import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import { useLayoutStore } from "@/lib/store/use-layout-store";
import {
  chaveDe,
  useWindowStore,
  type ConteudoJanela,
} from "@/lib/store/use-window-store";

/**
 * Abre a janela `conteudo` quando `ultima` muda — e só se ela não estiver em
 * lugar nenhum.
 *
 * O mecanismo das janelas que aparecem sozinhas: a de Rolagens quando um dado
 * cai, a de Chat quando um jogador escreve. Ver `useJanelaDeRolagens`, que diz
 * por que existe e por que respeita a janela atracada atrás de outra aba.
 *
 * `conteudo` tem de ser estável — uma constante de módulo.
 */
export function useJanelaQueAparece(
  conteudo: ConteudoJanela,
  ultima: string | undefined,
) {
  const abrir = useAbrirJanela();

  const janelas = useWindowStore((state) => state.janelas);
  const layout = useLayoutStore((state) => state.layout);

  /**
   * O que já foi visto, por referência.
   *
   * `undefined` no primeiro render e o histórico vazio na abertura do
   * aplicativo são o mesmo estado, e é o certo: nada a mostrar, nada a abrir.
   */
  const visto = useRef(ultima);

  /**
   * Onde a janela está AGORA, sem pôr as duas listas no efeito.
   *
   * Por referência porque elas mudam a cada janela movida, atracada ou trazida
   * para a frente: como dependências, o efeito rodaria em todos esses casos
   * para responder a uma pergunta que só importa quando algo chega.
   */
  const casas = useRef({ janelas, layout });
  useEffect(() => {
    casas.current = { janelas, layout };
  });

  useEffect(() => {
    if (ultima === undefined || ultima === visto.current) return;

    visto.current = ultima;

    const { janelas, layout } = casas.current;
    const chave = chaveDe(conteudo);

    const aberta =
      janelas.some((janela) => janela.chave === chave) ||
      (["esquerda", "direita"] as const).some((lado) =>
        layout[lado].grupos.some((grupo) =>
          grupo.abas.some((aba) => chaveDe(aba) === chave),
        ),
      );

    if (aberta) return;

    abrir(conteudo);
  }, [ultima, abrir, conteudo]);
}
