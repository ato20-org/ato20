"use client";

import { useEffect } from "react";

import { useSceneStore } from "@/lib/store/use-scene-store";
import { destinoAceito, type MovimentoDoJogador } from "@/lib/sync/movimento";
import { daemonAddr } from "@/lib/vault/bridge";

/**
 * Os jogadores movendo os próprios tokens, do celular.
 *
 * O segundo fluxo que sobe para esta janela, irmão do `useRolagensDaMesa`, e
 * com o mesmo desenho: o daemon é só o cano, e é aqui que o movimento vira
 * board. O Mestre continua sendo a única autoridade sobre o que as telas
 * mostram -- o token anda na TV porque esta janela o moveu e republicou, e não
 * porque o celular disse.
 *
 * A conferência que o daemon não pode fazer mora aqui, porque só o board sabe:
 * o item está na cena NO AR, é daquele personagem, e não está travado. Ver
 * `destinoAceito`. Movimento que não passa é descartado em silêncio -- o
 * celular percebe sozinho, porque o eco não traz o token aonde ele soltou.
 *
 * Entra no HISTÓRICO como qualquer edição, e não por fora dele como a troca de
 * aparência. Por fora, um Ctrl+Z do mestre em qualquer gesto anterior
 * restauraria a cena inteira de antes e devolveria o token do jogador ao lugar
 * antigo, sem ninguém ter pedido. Dentro, o arrasto inteiro vira um passo só
 * -- as amostras chegam a cada 100ms e o histórico funde o que vem a menos de
 * 400 --, e desfazer o movimento de um jogador é um gesto legítimo do mestre.
 *
 * Lê o board com `getState` na chegada, e não por seletor: o `EventSource` é
 * aberto uma vez e vive a sessão inteira, e uma cena capturada no render
 * congelaria qual cena está no ar.
 */
export function useMovimentosDaMesa(): void {
  useEffect(() => {
    let source: EventSource | null = null;
    let cancelado = false;

    void daemonAddr().then(
      ({ url }) => {
        if (cancelado) return;

        source = new EventSource(`${url}/sala/movimentos`);

        source.onmessage = (event) => {
          let movimento: MovimentoDoJogador;

          try {
            movimento = JSON.parse(event.data) as MovimentoDoJogador;
          } catch {
            // O daemon serializa o que emite, então isto só acontece com
            // quadro truncado. A próxima amostra chega em 100ms.
            return;
          }

          const { board, updateItem } = useSceneStore.getState();
          const noAr = board?.scenes.find(
            (scene) => scene.id === board.liveSceneId,
          );
          if (!noAr) return;

          const destino = destinoAceito(noAr, movimento);
          if (destino) updateItem(noAr.id, movimento.itemId, destino);
        };
      },
      () => {
        // Sem daemon não há mesa. O mestre continua editando e gravando.
      },
    );

    return () => {
      cancelado = true;
      source?.close();
    };
  }, []);
}
