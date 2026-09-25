"use client";

import { useEffect, useState } from "react";

import { donosPorPersonagem } from "@/lib/mestre/vinculos";
import { useCharactersStore } from "@/lib/store/use-characters-store";
import { characterLinks } from "@/lib/vault/characters";
import type { Player } from "@/lib/vault/players";

/**
 * Os nomes de quem joga cada personagem, por id de personagem.
 *
 * O espelho do `useCharacterNames`, que responde pelo outro lado — que
 * personagem cada jogador tem. Os dois existem porque as duas listas do canto
 * do palco fazem a mesma pergunta invertida, e cada uma precisa do nome que a
 * outra tem: a de jogadores mostra o personagem embaixo do nome da pessoa, e a
 * de personagens mostra a pessoa embaixo do nome do personagem.
 *
 * Recebe os jogadores em vez de buscá-los: quem chama já os tem do
 * `useCharacters`, e buscar de novo aqui seria uma segunda ida ao IPC pela
 * mesma lista. O que falta é só o vínculo, que é uma chamada.
 *
 * Relê quando o contador compartilhado muda — vincular um jogador na ficha tem
 * de aparecer na lista, que é outra janela. Ver `useCharactersStore`.
 *
 * O cruzamento em si mora no `donosPorPersonagem`, e não aqui, porque o
 * contorno do token faz a mesma pergunta e as duas respostas já discordaram uma
 * vez. Ver o cabeçalho de lá.
 *
 * Devolve mapa vazio em qualquer falha: a lista de personagens continua útil
 * sem os donos, e não vale derrubá-la por causa da linha de baixo.
 */
export function useCharacterOwners(jogadores: Player[]): Map<string, string[]> {
  const versao = useCharactersStore((state) => state.versao);

  const [pares, setPares] = useState<Array<[string, string]>>([]);

  useEffect(() => {
    let ativo = true;

    void characterLinks().then(
      (lidos) => {
        if (ativo) setPares(lidos);
      },
      () => {
        if (ativo) setPares([]);
      },
    );

    return () => {
      ativo = false;
    };
  }, [versao]);

  return donosPorPersonagem(pares, jogadores);
}
