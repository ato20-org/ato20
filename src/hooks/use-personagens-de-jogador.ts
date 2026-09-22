"use client";

import { useEffect, useState } from "react";

import { useCharactersStore } from "@/lib/store/use-characters-store";
import { characterLinks } from "@/lib/vault/characters";

/** Ninguém vinculado, e sempre o MESMO conjunto: um `new Set()` por render
 *  quebraria o `useMemo` de quem o recebe. */
const VAZIO: ReadonlySet<string> = new Set();

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
 * Fica com o vínculo mesmo quando o jogador não está na mesa agora, ao
 * contrário do `useCharacterOwners`, que precisa do nome de quem está. O
 * contorno diz de quem é o personagem, e um jogador que fechou o celular não
 * transforma o personagem dele em NPC no meio da sessão.
 *
 * Relê quando o contador compartilhado muda -- vincular na ficha é outra
 * janela. Conjunto vazio em qualquer falha: o mapa desenha sem contorno, que é
 * o de antes.
 */
export function usePersonagensDeJogador(): ReadonlySet<string> {
  const versao = useCharactersStore((state) => state.versao);

  const [comJogador, setComJogador] = useState<ReadonlySet<string>>(VAZIO);

  useEffect(() => {
    let ativo = true;

    void characterLinks().then(
      (pares) => {
        if (ativo) setComJogador(new Set(pares.map(([, personagemId]) => personagemId)));
      },
      () => {
        if (ativo) setComJogador(VAZIO);
      },
    );

    return () => {
      ativo = false;
    };
  }, [versao]);

  return comJogador;
}
