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
  /** Uma imagem em volta da figura. Ver `ExternoDoEfeito`. */
  externo?: ExternoDoEfeito;
  /** Uma textura pintada dentro da figura. Ver `InternoDoEfeito`. */
  interno?: InternoDoEfeito;
  /**
   * De onde vêm as imagens. Não é o autor que escreve: quem publica preenche
   * -- o plugin e a versão dele, que vão na URL. Ausente = sem imagem, que é
   * o caso da fábrica; um externo sem origem não desenha.
   */
  origem?: OrigemDoEfeito;
};

/** O plugin dono das imagens do efeito, e a versão que vai na URL. */
export type OrigemDoEfeito = { plugin: string; versao: string };

/**
 * Uma imagem em volta da figura: o fogo, a fumaça, o círculo mágico.
 *
 * Esticada na caixa da figura vezes `tamanho`, como o token se estica na
 * dele: o pack desenha o fogo quadrado para o token quadrado. Espelho de
 * `extensoes::Externo`, que é quem valida.
 */
export type ExternoDoEfeito = {
  /** Relativa à pasta do plugin. Só raster. */
  imagem: string;
  /** Vezes a figura, de 0,25 a 2. Ausente = 1,5. Ver `tamanhoNoPlano`. */
  tamanho?: number;
  /** Ausente = `atras`. */
  lado?: "atras" | "frente";
  /** De onde cresce. Ausente = `centro`. */
  ancora?: "centro" | "base" | "topo";
  /** De 0 a 1. Ausente = 1. */
  opacidade?: number;
  animacao?: AnimacaoDoEfeito;
};

/**
 * O "script de animação" de um efeito, como DADO: a TV e o celular não rodam
 * código de plugin. Quatro movimentos, todos em `transform` e `opacity`, que
 * são o que o compositor anima sem refazer layout.
 */
export type AnimacaoDoEfeito = {
  tipo: "pulsar" | "girar" | "flutuar" | "piscar";
  /** Segundos por ciclo, de 0,2 a 30. Ausente = 2. */
  periodo?: number;
  /** De 0 a 1, quanto se afasta do parado. Ausente = 0,5. */
  intensidade?: number;
};

/**
 * Uma textura pintada sobre a figura -- a rachadura, a escama, o musgo --, só
 * onde há figura. Assada UMA vez na pele, como a tinta: zero nó a mais.
 * Esticada na figura inteira.
 */
export type InternoDoEfeito = {
  /** Relativa à pasta do plugin. Só raster. */
  textura: string;
  /** Quanto cobre, de 0 a 1. Ausente = 1. */
  forca?: number;
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
