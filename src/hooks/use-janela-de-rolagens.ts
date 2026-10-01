"use client";

import { useJanelaQueAparece } from "@/hooks/use-janela-que-aparece";
import { useRolagensStore } from "@/lib/store/use-rolagens-store";
import type { ConteudoJanela } from "@/lib/store/use-window-store";

const ROLAGENS: ConteudoJanela = { tipo: "rolagens" };

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

  useJanelaQueAparece(ROLAGENS, ultima);
}
