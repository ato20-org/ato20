"use client";

import { toast } from "sonner";

import { mesaCheia, TETO_DA_MESA } from "@/lib/store/use-dados-store";

/**
 * A mesa está cheia? Então avisa, e diz o que fazer.
 *
 * Um lugar só porque são três os gestos que esbarram no teto — o arremesso do
 * saquinho, o relance de um dado já na mesa e o arremesso do celular — e os
 * três acontecem no meio de uma jogada. Três textos diferentes para o mesmo
 * limite fariam parecer três limites.
 *
 * O aviso diz a SAÍDA, e não só o problema: quem está com a mesa cheia não
 * precisa saber que ela tem teto, precisa saber que recolher libera espaço.
 *
 * `id` fixo porque o dedo insiste: quem tenta jogar numa mesa cheia tenta duas
 * ou três vezes seguidas, e sem ele a tela ganharia uma pilha de avisos iguais.
 * Com ele, o mesmo aviso é reaproveitado e apenas renova o prazo.
 */
export function recusaPorMesaCheia(): boolean {
  if (!mesaCheia()) return false;

  toast.warning(`A mesa está cheia: ${TETO_DA_MESA} dados.`, {
    id: "mesa-cheia",
    description: "Recolha os dados no saquinho para jogar de novo.",
  });

  return true;
}
