"use client";

import { useEffect } from "react";

import { useCharacters } from "@/hooks/use-characters";
import { filaDeRetratos, retratosDaCena } from "@/lib/geometry/portrait";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import type { Scene } from "@/types/scene";

/**
 * Quanto de diferença conta como diferença.
 *
 * A comparação é em fração da câmera, e a conta que produz a posição passa por
 * divisões: pedir igualdade exata faria o efeito regravar sempre e o efeito
 * disparar de novo. Um décimo de milésimo da tela é menos de um pixel em
 * qualquer resolução.
 */
const EPSILON = 1e-4;

/**
 * Mantém a fila automática arrumada.
 *
 * Aplica as posições no lugar de só calculá-las na hora de desenhar, e isso é a
 * decisão que define o resto: a geometria guardada continua sendo a única
 * verdade, então desligar o modo deixa os retratos exatamente onde eles estão,
 * em vez de teleportá-los para posições velhas de antes da fila existir.
 *
 * Entra na fila quem está NO AR e não se soltou dela. Fora do ar não ocupa vaga,
 * e é isso que faz tirar um do meio fechar o buraco em vez de deixar um vão.
 *
 * A ordem é a da lista, que é a ordem em que os tokens entraram na cena.
 *
 * ## Qual cena
 *
 * A que está sendo EDITADA, que é a que o mestre vê no palco: é ali que ele
 * arruma. A mesa recebe o elenco da cena NO AR com a geometria como ela ficou —
 * ver `MestreShell`. Nas duas serem a mesma cena, que é o caso normal, não há
 * diferença nenhuma; editando outra, ele arruma a fila dela sem mexer no que
 * está no ar.
 *
 * ## Por que num efeito
 *
 * Porque tem de valer com o painel de Retratos fechado: a fila é do estado da
 * sessão, não da tela que a mostra. Quem chama é o `MestreShell`, que existe
 * enquanto o Mestre existe.
 */
export function useFilaDeRetratos(scene: Scene | null): void {
  const { personagens } = useCharacters();

  const guardados = usePortraitStore((state) => state.portraits);
  const filaAuto = usePortraitStore((state) => state.filaAuto);
  const ancora = usePortraitStore((state) => state.ancora);
  const folga = usePortraitStore((state) => state.folga);
  const updateMany = usePortraitStore((state) => state.updateMany);

  useEffect(() => {
    if (!filaAuto || !scene) return;

    const naFila = retratosDaCena(
      guardados,
      scene.items,
      personagens ?? [],
    ).filter((retrato) => retrato.visible && !retrato.foraDaFila);

    const posicoes = filaDeRetratos(naFila, ancora, folga);

    // Só o que saiu de lugar. Sem esta comparação, cada aplicação produziria
    // um estado novo, que dispararia o efeito, que aplicaria de novo — e a
    // gravação atrasada nunca chegaria a acontecer.
    const patches = posicoes
      .filter((posicao) => {
        const atual = naFila.find((retrato) => retrato.id === posicao.id);
        if (!atual) return false;

        return (
          Math.abs(atual.x - posicao.x) > EPSILON ||
          Math.abs(atual.y - posicao.y) > EPSILON
        );
      })
      .map(({ id, x, y }) => ({ id, patch: { x, y } }));

    if (patches.length > 0) updateMany(patches);
  }, [filaAuto, ancora, folga, scene, guardados, personagens, updateMany]);
}
