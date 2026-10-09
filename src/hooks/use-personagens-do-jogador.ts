"use client";

import { useEffect, useState } from "react";

import { myCharacters } from "@/lib/player/characters";
import { useFichasVersaoStore } from "@/lib/store/use-fichas-versao-store";
import type { Personagem } from "@/types/character";

/** De quanto em quanto tempo o celular sem personagem pergunta de novo. */
const RELEITURA_MS = 15_000;

/**
 * Os personagens deste jogador, inteiros. `null` enquanto a primeira leitura
 * não volta.
 *
 * Relê quando o Mestre mexe no elenco (`useFichasVersaoStore`) e, enquanto a
 * lista estiver VAZIA, a cada `RELEITURA_MS`: entregar o personagem é gesto do
 * Mestre noutra janela, e a tela de quem ainda não tem nenhum -- só a cena e o
 * chat -- precisa abrir a ficha, a mochila e o caderno sozinha quando ele
 * chegar. Com personagem, a releitura por relógio para; a versão basta.
 *
 * Falha de rede mantém o que já se sabia: um soluço do Wi-Fi não pode sumir
 * com a ficha da tela.
 */
export function usePersonagensDoJogador(codigo: string): Personagem[] | null {
  const [personagens, setPersonagens] = useState<Personagem[] | null>(null);
  const [pedido, setPedido] = useState(0);
  const versao = useFichasVersaoStore((state) => state.versao);

  useEffect(() => {
    let ativo = true;

    void myCharacters(codigo).then(
      (lista) => {
        if (ativo) setPersonagens(lista);
      },
      () => {
        if (ativo) setPersonagens((antes) => antes ?? []);
      },
    );

    return () => {
      ativo = false;
    };
  }, [codigo, versao, pedido]);

  const vazio = personagens !== null && personagens.length === 0;

  useEffect(() => {
    if (!vazio) return;

    const relogio = setInterval(() => setPedido((atual) => atual + 1), RELEITURA_MS);

    return () => clearInterval(relogio);
  }, [vazio]);

  return personagens;
}
