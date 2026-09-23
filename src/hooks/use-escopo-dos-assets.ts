"use client";

import { useEffect, useRef } from "react";

import { useCharacters } from "@/hooks/use-characters";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { invalidarAcervo } from "@/lib/store/use-assets-store";
import { listAssets, setAssetEscopo } from "@/lib/vault/assets";
import type { EscopoAsset } from "@/types/scene";
import { imagensDoPersonagem } from "@/types/character";

/**
 * Acerta o dono dos arquivos que entraram antes de o escopo existir.
 *
 * A biblioteca esconde quem tem `escopo`, e o escopo é marcado na IMPORTAÇÃO —
 * então os arquivos de uma campanha anterior a esta mudança não têm marca
 * nenhuma, e continuariam aparecendo na lista para sempre. Isto é a passagem
 * única que os marca, pelo uso: quem é fundo de alguma cena vira `cena`, e quem
 * é retrato ou miniatura de algum personagem vira `personagem`.
 *
 * Derivar do uso é o que a marcação escolhida deliberadamente NÃO faz a cada
 * listagem — varrer cenas e personagens toda vez custaria caro. Aqui é uma vez
 * por campanha aberta, e só escreve no que está sem marca.
 *
 * Roda depois de a campanha estar carregada, porque precisa das cenas e dos
 * personagens para saber quem é de quem. Uma vez por montagem: o `feito` impede
 * a releitura de personagens de disparar a varredura de novo.
 */
export function useEscopoDosAssets(pronto: boolean): void {
  const board = useSceneStore((state) => state.board);
  const { personagens } = useCharacters();

  const feito = useRef(false);

  useEffect(() => {
    if (feito.current || !pronto || !board || personagens === null) return;

    feito.current = true;

    const donos = new Map<string, EscopoAsset>();

    for (const cena of board.scenes) {
      if (cena.backgroundAssetId) donos.set(cena.backgroundAssetId, "cena");
    }

    // Personagem depois da cena, e é escolha arbitrária: o mesmo arquivo servir
    // de fundo e de retrato é raro o bastante para não merecer regra própria, e
    // esconder da lista é o que as duas marcas fazem igual.
    // Todas as aparências, e não só o que está no ar: a imagem da linha guardada
    // é tão do personagem quanto a da ativa, e deixá-la de fora faria a cara
    // que ele não está usando reaparecer na biblioteca de imagens — de novo
    // misturando o que se escolhe com o que já foi escolhido.
    for (const personagem of personagens) {
      for (const asset of imagensDoPersonagem(personagem)) {
        donos.set(asset, "personagem");
      }
    }

    if (donos.size === 0) return;

    void listAssets("image").then(
      async (assets) => {
        let marcou = false;

        for (const asset of assets) {
          const dono = donos.get(asset.id);
          // Só o que está sem marca: reescrever o que já tem dono transformaria
          // uma passagem única em escrita a cada abertura.
          if (!dono || asset.escopo) continue;

          await setAssetEscopo(asset.id, dono);
          marcou = true;
        }

        // Uma vez no fim, e não por arquivo: a passagem pode marcar dezenas, e
        // reler o acervo a cada um seria uma ida ao IPC por arquivo marcado.
        // Nada marcado é o caso normal, e aí não relê.
        if (marcou) invalidarAcervo("image");
      },
      () => {
        // Sem acervo legível não há o que acertar. A lista mostra alguns
        // arquivos a mais, e nada na tela quebra por isso.
      },
    );
  }, [pronto, board, personagens]);
}
