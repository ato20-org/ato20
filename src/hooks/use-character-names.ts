"use client";

import { useEffect, useState } from "react";

import { useCharactersStore } from "@/lib/store/use-characters-store";
import { characterLinks, listCharacters } from "@/lib/vault/characters";

/**
 * Os nomes dos personagens de cada jogador.
 *
 * Existe porque o apelido saiu. A lista do mestre mostrava, embaixo do nome que
 * o jogador digitou, um apelido que o próprio mestre havia escrito à mão — e o
 * que ele escrevia ali era quase sempre o personagem. Agora o personagem existe
 * de verdade, e a lista mostra o dado em vez da anotação: acompanha quando o
 * mestre troca o personagem de mãos, e não vira mentira quando ele esquece de
 * atualizar.
 *
 * Duas chamadas e uma junção aqui, em vez de uma por jogador: uma mesa de cinco
 * pessoas custaria cinco idas ao IPC para desenhar cinco linhas.
 *
 * Relê quando o contador compartilhado muda, como o `useCharacterOwners`:
 * vincular um jogador na ficha do personagem tem de mudar as duas listas, e
 * antes esta lia uma vez na montagem e ficava velha até recarregar a página.
 *
 * Devolve mapa vazio em qualquer falha — a lista de jogadores continua útil sem
 * os personagens, e não vale derrubá-la por causa da linha de baixo.
 */
export function useCharacterNames(): Map<string, string[]> {
  const versao = useCharactersStore((state) => state.versao);

  const [nomes, setNomes] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    let ativo = true;

    void Promise.all([characterLinks(), listCharacters()]).then(
      ([pares, personagens]) => {
        if (!ativo) return;

        const porId = new Map(personagens.map((p) => [p.id, p.nome]));
        const mapa = new Map<string, string[]>();

        for (const [jogadorId, personagemId] of pares) {
          const nome = porId.get(personagemId);
          // Vínculo apontando para personagem que não está no índice: some da
          // lista em vez de aparecer como linha em branco.
          if (!nome) continue;

          mapa.set(jogadorId, [...(mapa.get(jogadorId) ?? []), nome]);
        }

        setNomes(mapa);
      },
      () => {
        if (ativo) setNomes(new Map());
      },
    );

    return () => {
      ativo = false;
    };
  }, [versao]);

  return nomes;
}
