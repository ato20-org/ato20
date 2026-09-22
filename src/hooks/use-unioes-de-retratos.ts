"use client";

import { useEffect } from "react";

import { useCharacters } from "@/hooks/use-characters";
import { filasDeUnioes, retratosDaCena } from "@/lib/geometry/portrait";
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
 * Mantém as uniões de retratos arrumadas.
 *
 * Aplica as posições no lugar de só calculá-las na hora de desenhar, e isso é a
 * decisão que define o resto: a geometria guardada continua sendo a única
 * verdade, então desfazer uma união deixa os retratos exatamente onde eles
 * estão, em vez de teleportá-los para posições velhas de antes dela existir.
 *
 * Governa quem está NO AR e numa união. Fora do ar não ocupa vaga, e é isso que
 * faz tirar um do meio fechar o buraco em vez de deixar um vão. Retrato solto
 * não é tocado: solto não tem regra, e essa é a diferença que o painel promete.
 *
 * A ordem de cada fila é a da união, que o mestre reordena arrastando a linha.
 * Antes era a ordem de entrada dos tokens na cena, que ele não controlava.
 *
 * ## Qual cena
 *
 * A que está sendo EDITADA, que é a que o mestre vê no palco: é ali que ele
 * arruma. A mesa recebe o elenco da cena NO AR com a geometria como ela ficou —
 * ver `MestreShell`. Nas duas serem a mesma cena, que é o caso normal, não há
 * diferença nenhuma; editando outra, ele arruma as uniões dela sem mexer no que
 * está no ar.
 *
 * ## Por que num efeito
 *
 * Porque tem de valer com o painel de Retratos fechado: a união é do estado da
 * sessão, não da tela que a mostra. Quem chama é o `MestreShell`, que existe
 * enquanto o Mestre existe.
 */
export function useUnioesDeRetratos(scene: Scene | null): void {
  const { personagens } = useCharacters();

  const guardados = usePortraitStore((state) => state.portraits);
  const unioes = usePortraitStore((state) => state.unioes);
  const updateMany = usePortraitStore((state) => state.updateMany);

  useEffect(() => {
    if (unioes.length === 0 || !scene) return;

    const daCena = retratosDaCena(guardados, scene.items, personagens ?? []);
    const posicoes = filasDeUnioes(unioes, daCena);

    // Só o que saiu de lugar. Sem esta comparação, cada aplicação produziria
    // um estado novo, que dispararia o efeito, que aplicaria de novo — e a
    // gravação atrasada nunca chegaria a acontecer.
    const patches = posicoes
      .filter((posicao) => {
        const atual = daCena.find((retrato) => retrato.id === posicao.id);
        if (!atual) return false;

        return (
          Math.abs(atual.x - posicao.x) > EPSILON ||
          Math.abs(atual.y - posicao.y) > EPSILON
        );
      })
      .map(({ id, x, y }) => ({ id, patch: { x, y } }));

    if (patches.length > 0) updateMany(patches);
  }, [unioes, scene, guardados, personagens, updateMany]);
}
