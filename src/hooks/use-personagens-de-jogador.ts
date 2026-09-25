"use client";

import { useEffect, useMemo, useState } from "react";

import { donosPorPersonagem } from "@/lib/mestre/vinculos";
import { useCharactersStore } from "@/lib/store/use-characters-store";
import { characterLinks } from "@/lib/vault/characters";

/** Ninguém vinculado, e sempre o MESMO conjunto: um `new Set()` por render
 *  quebraria o `useMemo` de quem o recebe. */
const VAZIO: ReadonlySet<string> = new Set();

/** Nenhum vínculo lido, e sempre o MESMO array: uma falha que gravasse `[]`
 *  novo faria o `useMemo` abaixo recalcular sem nada ter mudado. */
const SEM_PARES: Array<[string, string]> = [];

/**
 * Os personagens que alguém na mesa interpreta, por id.
 *
 * O terceiro hook em cima de `characterLinks`, e de propósito: o
 * `useCharacterNames` responde "que personagem é deste jogador", o
 * `useCharacterOwners` responde "quem joga este personagem", e o palco não
 * precisa de nome nenhum -- só de saber se existe vínculo. Um `Set` em vez do
 * mapa de nomes mantém a identidade estável enquanto ninguém vincula nada, e é
 * isso que impede o mapa de recalcular contorno a cada quadro.
 *
 * Cruza com a mesa pelo `donosPorPersonagem`, o MESMO cruzamento da lista de
 * personagens. Antes lia o vínculo cru, e isso foi um bug de verdade: um
 * jogador removido deixava o vínculo para trás, e o personagem aparecia
 * embaixo de "NPCs" na lista e com contorno azul no mapa ao mesmo tempo.
 *
 * O que NÃO muda com o cruzamento: quem fechou o celular continua contando. A
 * lista de jogadores é quem a campanha conhece, e não quem está conectado agora
 * -- ver `players::list`. O contorno diz de quem é o personagem, e um jogador
 * que largou o celular na mochila não transforma o personagem dele em NPC no
 * meio da sessão.
 *
 * Relê quando o contador compartilhado muda -- vincular na ficha é outra
 * janela. Conjunto vazio em qualquer falha: o mapa desenha sem contorno, que é
 * o de antes.
 */
export function usePersonagensDeJogador(): ReadonlySet<string> {
  const versao = useCharactersStore((state) => state.versao);
  const jogadores = useCharactersStore((state) => state.jogadores);

  const [pares, setPares] = useState<Array<[string, string]>>(SEM_PARES);

  useEffect(() => {
    let ativo = true;

    void characterLinks().then(
      (lidos) => {
        if (ativo) setPares(lidos);
      },
      () => {
        if (ativo) setPares(SEM_PARES);
      },
    );

    return () => {
      ativo = false;
    };
  }, [versao]);

  return useMemo(() => {
    const donos = donosPorPersonagem(pares, jogadores);

    // O `VAZIO` de volta quando não sobrou ninguém: um `Set` vazio novo teria
    // identidade nova, e é essa identidade que segura o `useMemo` do contorno.
    return donos.size === 0 ? VAZIO : new Set(donos.keys());
  }, [pares, jogadores]);
}
