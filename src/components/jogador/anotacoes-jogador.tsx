"use client";

import { CadernoJogador } from "@/components/jogador/caderno-jogador";
import { MyCharacters } from "@/components/jogador/my-characters";

/**
 * A aba de anotações do jogador.
 *
 * Duas coisas, e a ordem entre elas é a decisão: em cima o CADERNO — o que se
 * escreve numa sessão e não é sobre a ficha de ninguém: o nome do NPC que
 * mentiu, o número que o mestre falou uma vez, a suspeita que ainda não virou
 * nada. Embaixo, as notas de cada PERSONAGEM, que antes moravam no cartão da
 * ficha.
 *
 * Estavam em dois lugares da interface e a pergunta que sobrava era qual delas
 * valia. Agora anotar é um lugar só — e o que separa as duas continua sendo
 * real: o caderno não pertence a personagem nenhum, e quem joga com dois, ou
 * troca de personagem no meio da campanha, o levaria junto.
 *
 * O caderno era uma caixa de texto de vinte mil caracteres, e virou uma lista
 * de notas com título, etiquetas e menção — ver `CadernoJogador`. O que mudou
 * não foi o tamanho: uma campanha inteira num campo só não tem como ser
 * procurada nem retomada três semanas depois.
 */
export function AnotacoesJogador({
  codigo,
  emCena,
}: {
  codigo: string;
  /** Quem está com o retrato no ar, por id de personagem. Ver `CadernoJogador`. */
  emCena: Set<string>;
}) {
  return (
    <CadernoJogador
      codigo={codigo}
      emCena={emCena}
      // Embaixo da lista, e não ao lado: some enquanto uma nota está aberta,
      // que é quando a tela inteira é para escrever. Vazio quando o mestre
      // ainda não entregou personagem nenhum — e aí não desenha nada.
      rodape={<MyCharacters codigo={codigo} secao="notas" />}
    />
  );
}
