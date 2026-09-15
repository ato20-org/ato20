"use client";

import { useEffect, useRef } from "react";

import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import { useLayoutStore } from "@/lib/store/use-layout-store";
import { useRolagensStore } from "@/lib/store/use-rolagens-store";
import { chaveDe, useWindowStore } from "@/lib/store/use-window-store";

const CHAVE = chaveDe({ tipo: "rolagens" });

/**
 * A janela de Rolagens aparece sozinha quando alguém rola.
 *
 * Existe porque a fileira flutuante saiu. Ela cobria o mapa, mas fazia uma
 * coisa que uma janela fechada não faz: aparecia. Rolagem é a única coisa desta
 * bancada que nasce do OUTRO lado da mesa — o mestre não pediu, não clicou, e
 * pode estar de olho no mapa quando ela chega. Se ela dependesse de abrir a
 * janela, a mesa ficaria esperando o mestre perceber.
 *
 * Só quando a janela NÃO está em lugar nenhum. Aberta e atracada atrás de outra
 * aba, ela fica onde está: trazer a coluna para a frente e trocar a aba ativa a
 * cada dado rolado seria o aplicativo mexendo na bancada do mestre no meio de
 * uma frase. Quem avisa nesse caso é o contador do chip, que está sempre à
 * vista no canto do palco.
 *
 * A comparação é pelo id da rolagem mais nova, e não pelo tamanho da bandeja: a
 * bandeja também ENCOLHE — por expiração, por limpeza — e um `length` que muda
 * não distingue "chegou uma" de "saiu uma".
 */
export function useJanelaDeRolagens() {
  const ultima = useRolagensStore((state) => state.historico[0]?.id);

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
   * para responder a uma pergunta que só importa quando um dado cai.
   */
  const casas = useRef({ janelas, layout });
  useEffect(() => {
    casas.current = { janelas, layout };
  });

  useEffect(() => {
    if (ultima === undefined || ultima === visto.current) return;

    visto.current = ultima;

    const { janelas, layout } = casas.current;

    const aberta =
      janelas.some((janela) => janela.chave === CHAVE) ||
      (["esquerda", "direita"] as const).some((lado) =>
        layout[lado].grupos.some((grupo) =>
          grupo.abas.some((aba) => chaveDe(aba) === CHAVE),
        ),
      );

    if (aberta) return;

    abrir({ tipo: "rolagens" });
  }, [ultima, abrir]);
}
