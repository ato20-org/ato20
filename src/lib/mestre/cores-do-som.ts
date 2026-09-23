import type { TipoDeSom } from "@/types/scene";

/**
 * A cor de cada tipo de som, num lugar só.
 *
 * Três camadas que se parecem na tela — nome de arquivo, ícone pequeno, botão
 * de mesma forma — e se comportam de modo oposto: a trilha é uma e navega, o
 * ambiente alterna e repete, o disparo soa e some. O ícone já distinguia os
 * três, mas ícone é lido; cor é vista, e o painel de som é consultado de
 * relance no meio de uma cena.
 *
 * Vermelho para a trilha, azul para o ambiente, amarelo para o disparo.
 *
 * Só a GRADE DOS PADS usa isto, e é o ponto. A cor foi experimentada também na
 * lista do que está no ar e nos botões do acervo, e ali ela virou ruído: as
 * duas já separam as coisas em linhas, e o que se procura nelas é um arquivo,
 * não uma categoria. O pad é o caso contrário — nove quadrados iguais, olhados
 * de relance com a mão no numpad, onde ler nove nomes é o que a cor evita.
 *
 * A trilha entra no mapa mesmo sem pad de trilha: as três cores são um
 * vocabulário, e deixá-la de fora faria a próxima pessoa escolher outro
 * vermelho quando ele fizer falta.
 *
 * Tons crus da paleta e não `primary`/`accent`: os tokens do tema são um eixo
 * só — mais claro, mais escuro —, e três categorias lado a lado precisam de
 * matizes diferentes para serem contadas sem ler.
 */

export type CorDoSom = {
  /** O ícone do tipo, dentro do pad. */
  texto: string;
  /** A moldura de um pad preenchido, em repouso. */
  borda: string;
  /** O pad ACESO: ambiente tocando agora. Ver `PadCell`. */
  acesa: string;
};

export const CORES_DO_SOM: Record<TipoDeSom, CorDoSom> = {
  trilha: {
    texto: "text-red-400",
    borda: "border-red-500/40",
    acesa: "border-red-500 bg-red-500/15",
  },
  ambiente: {
    texto: "text-sky-400",
    borda: "border-sky-500/40",
    acesa: "border-sky-500 bg-sky-500/15",
  },
  disparo: {
    texto: "text-amber-400",
    borda: "border-amber-500/40",
    acesa: "border-amber-500 bg-amber-500/15",
  },
};
