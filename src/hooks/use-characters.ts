"use client";

import { useEffect } from "react";

import { useCharactersStore } from "@/lib/store/use-characters-store";
import type { Player } from "@/lib/vault/players";
import type { Personagem } from "@/types/character";

type CharactersApi = {
  /** `null` é "ainda não leu", e não uma lista vazia. */
  personagens: Personagem[] | null;
  jogadores: Player[];
  /** Relê para TODAS as telas: alguém mexeu nos personagens. */
  recarregar: () => void;
};

/**
 * Os personagens da campanha e quem está na mesa.
 *
 * Uma janela para o store, não uma busca: quem lê o disco é o
 * `useCharactersStore`, uma vez, e todas as telas veem a mesma lista. Este hook
 * existe para nenhum componente ter de lembrar de chamar `garantir` na
 * montagem.
 *
 * Os dois juntos porque toda tela que mostra personagem mostra também a quem
 * ele pertence, e separar seriam duas idas ao IPC para desenhar uma linha.
 */
export function useCharacters(): CharactersApi {
  const personagens = useCharactersStore((state) => state.personagens);
  const jogadores = useCharactersStore((state) => state.jogadores);
  const recarregar = useCharactersStore((state) => state.recarregar);
  const garantir = useCharactersStore((state) => state.garantir);

  // Na montagem de cada tela, e não na criação do store: ler o disco na criação
  // aconteceria durante a pré-renderização, onde não há IPC nenhum.
  useEffect(() => {
    garantir();
  }, [garantir]);

  return { personagens, jogadores, recarregar };
}
