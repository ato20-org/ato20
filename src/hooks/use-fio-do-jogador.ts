"use client";

import { useEffect } from "react";

import { assinarFio } from "@/lib/player/fio";
import { useFioStore } from "@/lib/store/use-fio-store";

/**
 * O fio da campanha, no celular.
 *
 * Assinado no `JogadorShell`, e não dentro da aba do chat, pelo mesmo motivo
 * da cena: aba inativa é desmontada, e o jogador que fosse olhar a ficha
 * perderia a conversa até voltar — e não saberia que há o que ler.
 *
 * `eu` é o id do jogador: a linha dele não conta como não lida.
 */
export function useFioDoJogador(codigo: string, eu: string | undefined): void {
  const receber = useFioStore((state) => state.receber);
  const recomecar = useFioStore((state) => state.recomecar);
  const esvaziar = useFioStore((state) => state.esvaziar);

  useEffect(() => {
    if (!eu) return;

    const desligar = assinarFio(
      codigo,
      (registro) =>
        receber(
          registro,
          registro.tipo === "linha" &&
            registro.autor.tipo === "jogador" &&
            registro.autor.id === eu,
        ),
      recomecar,
    );

    return () => {
      desligar();
      // Quem sai da mesa (ou troca de nome e volta como outro) não leva a
      // conversa da ficha anterior para a tela nova.
      esvaziar();
    };
  }, [codigo, eu, receber, recomecar, esvaziar]);
}
