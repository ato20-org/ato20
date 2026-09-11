import type { AnexoAutor } from "@/types/character";

/**
 * O inventário de um personagem.
 *
 * Mora em `personagens/{id}/_inventario.json`, e não no `personagens.json`,
 * pela mesma razão que as notas: o índice é relido inteiro para responder
 * "quais são os personagens", e carregar dentro dele os itens de todo mundo
 * faria cada renomeação regravar dezenas de itens que ninguém pediu.
 *
 * O espelho destes tipos em Rust é `vault::inventory`. Campo novo aqui precisa
 * de campo novo lá.
 */

/**
 * De onde a imagem do item vem.
 *
 * União marcada, e não dois campos opcionais, porque os dois braços são
 * exclusivos e têm transportes diferentes até a TV — e é essa diferença que
 * decide o que a tela faz ao transmitir.
 *
 * `asset` é o acervo, alcançável por `/asset/{id}` sem token. É o que o mestre
 * escolhe, porque só ele importa para o acervo.
 *
 * `anexo` é um arquivo em `personagens/{id}/anexos/{autor}/`, atrás do token de
 * quem o mandou. É o que o jogador sobe do celular, e chega à mesa por
 * `shareCharacterAttachment` — um id sorteado em `/evidencia/{id}` que morre
 * quando sai do ar. Copiá-lo para o acervo na transmissão deixaria um duplicado
 * por transmissão na biblioteca de imagens; é a mesma decisão que
 * `character_attachment_share` já tomou para a ficha.
 */
export type ImagemItem =
  { tipo: "asset"; id: string } | { tipo: "anexo"; autor: AnexoAutor; arquivo: string };

/** Uma coisa que o personagem carrega. */
export type ItemInventario = {
  id: string;
  nome: string;
  descricao: string;
  imagem?: ImagemItem;
  /** Quantas unidades. Nunca zero — o Rust eleva para 1. */
  quantidade: number;
  /**
   * Quem criou.
   *
   * Campo, e não diretório como nos anexos: item não é arquivo. O que ele
   * decide é quem pode mexer — o mestre alcança os dois lados, o jogador só o
   * que ele mesmo criou.
   */
  autor: AnexoAutor;
  /**
   * O jogador não vê.
   *
   * Só o mestre marca, e o daemon filtra ANTES de responder: um item escondido
   * que chegasse ao celular e sumisse no React já teria vazado — estaria no
   * JSON que o navegador guardou.
   */
  escondido: boolean;
  criadoEm: number;
};

/** O que se informa para criar um item. Só o nome importa. */
export type NovoItem = {
  nome: string;
  descricao?: string;
  quantidade?: number;
  imagem?: ImagemItem;
  /** Ignorado quando quem cria é o jogador. */
  escondido?: boolean;
};

/**
 * O que se pode trocar num item.
 *
 * `imagem` ausente não mexe; `imagem: null` LIMPA. Um campo opcional só não
 * conseguiria dizer "tire a imagem" — é o mesmo `Option<Option<_>>` do Rust.
 */
export type PatchItem = {
  nome?: string;
  descricao?: string;
  quantidade?: number;
  imagem?: ImagemItem | null;
  /** Ignorado quando quem edita é o jogador. */
  escondido?: boolean;
};

/** Quantos itens cada AUTOR pode pôr num personagem. Espelha `MAX_ITENS_POR_AUTOR`. */
export const MAX_ITENS_POR_AUTOR = 40;

/**
 * Quantas colunas a grade tem, pela largura que ela recebeu.
 *
 * Não é um número fixo porque o inventário não tem uma largura: ele vive na
 * coluna da direita da ficha, ao lado do retrato, e essa coluna vale 280px num
 * celular em pé e o dobro num tablet deitado. Cinco colunas na estreita davam
 * quadros de 50px — pequenos demais para mostrar a imagem de um item e para o
 * polegar acertar; três na larga davam quadros do tamanho do retrato.
 *
 * Os cortes saem do QUADRO, e não da tela: o alvo é ficar na casa dos 90px, o
 * mesmo dos tiles de retrato e miniatura logo acima. É por isso que a medida
 * que entra aqui é a largura da grade, medida no próprio elemento, e não a da
 * janela — a mesma tela com o painel aberto ou fechado dá duas larguras.
 */
export function colunasPara(largura: number): number {
  if (largura >= 460) return 5;
  if (largura >= 360) return 4;

  return 3;
}

/** O jogador pode mexer neste item. */
export function meuItem(item: ItemInventario): boolean {
  return item.autor === "jogador";
}

/**
 * Uma chave estável para a imagem de um item.
 *
 * Serve de `key` no componente que resolve o endereço dela. Trocar a imagem
 * remonta o componente, e é isso que zera o endereço antigo — o caminho
 * alternativo seria um `useEffect` que chama `setState` para limpar, que é
 * exatamente o que `react-hooks/set-state-in-effect` recusa: um render a mais
 * mostrando a imagem velha sob o item novo.
 */
export function chaveDaImagem(imagem: ImagemItem | undefined): string {
  if (!imagem) return "vazio";

  return imagem.tipo === "asset" ? `asset:${imagem.id}` : `anexo:${imagem.autor}/${imagem.arquivo}`;
}

/**
 * Quantos slots vazios completam a última linha.
 *
 * O inventário é uma LISTA que cresce, e não N quadros fixos: slot fixo pediria
 * uma capacidade a configurar e deixaria buraco no meio quando um item saísse.
 * Aqui os vazios existem só para a última linha não ficar pela metade — e há
 * sempre ao menos um, que é onde se clica para adicionar.
 */
export function vazios(quantos: number, colunas: number): number {
  const sobra = quantos % colunas;

  return sobra === 0 ? colunas : colunas - sobra;
}
