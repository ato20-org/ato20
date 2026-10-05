/**
 * Um efeito: o que uma condição faz com a figura, DECLARADO.
 *
 * Dado, e não código, pela regra da mesa declarativa: o mesmo efeito desenha
 * no Mestre, na janela do espectador e no celular, e só o Mestre roda código
 * de plugin. Animação, quando houver, também é dado.
 *
 * A condição aponta para o efeito pelo `id`, e a cor vem dela: o mesmo "Aura"
 * serve ao abençoado dourado e ao amaldiçoado roxo. Ver `Condicao.efeito`.
 *
 * Cada bloco é uma camada que o efeito pode ocupar. Bloco ausente = camada
 * vazia: um efeito só de tinta não paga por halo nenhum.
 */
export type DefinicaoDeEfeito = {
  /**
   * `aura`, da fábrica; `{plugin}/{efeito}` e `campanha/{efeito}` para os que
   * chegam de fora. A forma é conferida no Rust -- ver `efeito_valido`.
   */
  id: string;
  /** Como o seletor o chama. */
  titulo: string;
  /** Uma linha dizendo para que serve, embaixo do seletor. */
  dica?: string;
  /** O que acontece com a própria figura. Ver `FiguraDoEfeito`. */
  figura?: FiguraDoEfeito;
};

/**
 * O que o efeito faz com a figura em si -- os cinco climas de antes do
 * catálogo, agora combináveis dentro de um efeito só.
 *
 * Tinta e cinza viram a PELE da figura, assada uma vez. Halo é uma imagem
 * assada atrás dela. Translúcido e tremor são animação de CSS. Ver
 * `FiguraComEfeitos` para o custo medido de cada um.
 */
export type FiguraDoEfeito = {
  /** Um halo na cor da condição, respirando atrás da figura. */
  halo?: boolean;
  /** Quanto a cor da condição cobre a figura, de 0 a 1. Ausente = sem tinta. */
  tinta?: number;
  /** Cinza e escura. */
  cinza?: boolean;
  /** Meio transparente, tremulando. */
  translucido?: boolean;
  /** Treme no lugar. */
  tremor?: boolean;
};
