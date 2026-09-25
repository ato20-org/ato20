"use client";

import { useCallback, useEffect, useState } from "react";

import { myCharacters } from "@/lib/player/characters";

/** De quanto em quanto tempo o celular pergunta de novo. Ver abaixo. */
const RELEITURA_MS = 15_000;

/** Nenhum personagem, e sempre o MESMO conjunto: ver `usePersonagensDeJogador`. */
const NENHUM: ReadonlySet<string> = new Set();

/**
 * Os personagens deste jogador, por id -- os tokens que ele pode arrastar.
 *
 * Relê por conta própria, e é o ponto. Entregar o personagem é gesto do mestre
 * noutra janela, e o celular não fica sabendo: o `/sala/live` é anônimo, e pôr
 * ali quem joga com quem contaria à mesa quais tokens são PNJ -- que é
 * justamente o que o contorno do mestre não publica. Então o celular pergunta:
 *
 * - quando `chave` muda, que é quem chama dizendo "os personagens no mapa
 *   mudaram" -- o mestre soltou um token novo, ou trocou de cena;
 * - a cada `RELEITURA_MS`, para o caso comum de o mestre preparar o mapa antes
 *   e entregar os personagens depois, com os tokens já lá;
 * - quando `reler` é chamado -- a mesa recusou um movimento, e a lista que o
 *   celular tem está velha.
 *
 * Falha de rede mantém o que já se sabia: perder a lista por um soluço do Wi-Fi
 * travaria o token do jogador no meio da cena.
 */
export function useMeusPersonagens(
  codigo: string,
  chave: string,
): { meus: ReadonlySet<string>; reler: () => void } {
  const [meus, setMeus] = useState<ReadonlySet<string>>(NENHUM);
  const [pedido, setPedido] = useState(0);

  const reler = useCallback(() => setPedido((atual) => atual + 1), []);

  useEffect(() => {
    let ativo = true;

    void myCharacters(codigo).then(
      (lista) => {
        if (!ativo) return;

        // Mesma lista, mesmo conjunto: um `Set` novo a cada releitura faria
        // quem o recebe recalcular por nada de quinze em quinze segundos.
        setMeus((atual) => {
          const ids = lista.map((personagem) => personagem.id);
          const igual =
            ids.length === atual.size && ids.every((id) => atual.has(id));

          return igual ? atual : ids.length === 0 ? NENHUM : new Set(ids);
        });
      },
      () => {
        // Ver acima.
      },
    );

    return () => {
      ativo = false;
    };
  }, [codigo, chave, pedido]);

  useEffect(() => {
    const relogio = setInterval(reler, RELEITURA_MS);

    return () => clearInterval(relogio);
  }, [reler]);

  return { meus, reler };
}
