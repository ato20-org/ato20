"use client";

import { useEffect } from "react";

import { chegadaDe } from "@/hooks/use-queda-das-rolagens";
import { prepararSomDosDados, tocarQueda } from "@/lib/som-dos-dados";
import { useDadosStore } from "@/lib/store/use-dados-store";
import { useRolagensStore } from "@/lib/store/use-rolagens-store";

/** A rolagem de jogador cai como um dado largado parado. Ver `DURACAO_DA_CHEGADA`. */
const PARADO = { impulso: { x: 0, y: 0 } };

/**
 * Rolagem mais velha que isto não faz som, em milissegundos.
 *
 * Reconexão do fluxo reentrega o que ainda está na bandeja, e a rolagem que
 * caiu há dez segundos não cai de novo no ouvido. O `quando` é do daemon, que
 * roda nesta mesma máquina, então o relógio é o mesmo.
 */
const RECENTE_MS = 3_000;

/**
 * O som dos dados que caem no Mestre: os do tabuleiro e os que os jogadores
 * rolam.
 *
 * Um dono só, aqui no shell, e não cada lugar que desenha um dado: a mesma
 * rolagem de jogador aparece na janela de Rolagens, no chat, sob o retrato e na
 * Janela Mesa, e cada um tocaria o mesmo som por cima do outro.
 *
 * Pela LISTA e não por quem lança: o tabuleiro recebe dado do saquinho, da
 * paleta, do relançar no lugar e de plugin, e todos passam por `lancar`.
 */
export function useSomDosDados(): void {
  useEffect(() => {
    void prepararSomDosDados();

    // O que já estava lá quando a tela abriu não toca.
    let dados = new Set(useDadosStore.getState().dados.map((dado) => dado.id));
    let rolagens = new Set(
      useRolagensStore.getState().bandeja.map((rolagem) => rolagem.id),
    );

    const pararDados = useDadosStore.subscribe((estado, antes) => {
      if (estado.dados === antes.dados) return;

      for (const dado of estado.dados) {
        if (!dados.has(dado.id)) tocarQueda(dado.lancadoEm, dado);
      }
      // Recriado em vez de crescer: o id é novo a cada lançamento, então o que
      // saiu da lista nunca volta.
      dados = new Set(estado.dados.map((dado) => dado.id));
    });

    const pararRolagens = useRolagensStore.subscribe((estado, antes) => {
      if (estado.bandeja === antes.bandeja) return;

      for (const rolagem of estado.bandeja) {
        if (rolagens.has(rolagem.id)) continue;
        if (Date.now() - rolagem.quando > RECENTE_MS) continue;

        // O mesmo carimbo de quem desenha: quem chamar `chegadaDe` depois recebe
        // este, e o som cai junto com o dado na tela.
        tocarQueda(chegadaDe(rolagem.id), PARADO);
      }
      rolagens = new Set(estado.bandeja.map((rolagem) => rolagem.id));
    });

    return () => {
      pararDados();
      pararRolagens();
    };
  }, []);
}
