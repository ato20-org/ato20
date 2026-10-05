import type { EfeitoDaLuz } from "@/types/scene";

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
  /** A luz que a figura emana. Ver `LuzDoEfeito`. */
  luz?: LuzDoEfeito;
  /** O que sai voando dela: a fagulha, a gota, a cinza. Ver `ParticulasDoEfeito`. */
  particulas?: ParticulasDoEfeito;
  /**
   * De onde vêm as imagens. Não é o autor que escreve: quem publica preenche
   * -- o plugin e a versão dele, ou a pasta do próprio aplicativo, que vão na
   * URL. Ausente = sem imagem; um externo sem origem não desenha.
   */
  origem?: OrigemDoEfeito;
};

/**
 * O dono das imagens do efeito.
 *
 * - `plugin`: a pasta do plugin, servida em `/plugin/{id}/...`, com a versão
 *   na URL para a TV não desenhar a arte velha.
 * - `app`: um pack de FÁBRICA, que vem no aplicativo (ver `src/efeitos/`). As
 *   imagens são assets do build, e `arquivos` diz o endereço de cada uma -- o
 *   nome já muda com o conteúdo, e versão nenhuma é preciso.
 * - `acervo`: um efeito da CAMPANHA, feito no editor. Cada imagem é o id de um
 *   arquivo do acervo, servido em `/asset/{id}` -- cada tela monta o endereço
 *   do seu jeito, e a definição que viaja não leva o do Mestre.
 */
export type OrigemDoEfeito =
  | { plugin: string; versao: string }
  | { app: string; arquivos: Readonly<Record<string, string>> }
  | { acervo: true };

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
  /**
   * A imagem é uma GRADE de quadros, tocada em ordem: o fogo que lambe, a
   * fumaça que sobe. Animada pelo compositor -- um `translate` em degraus
   * dentro de um recorte --, sem repintar nada, ao contrário do GIF.
   */
  quadros?: QuadrosDoEfeito;
  /**
   * A mesma grade em outros tamanhos, pelo lado do QUADRO em pixels:
   * `{ "128": "fogo-128.webp", "512": "fogo-512.webp" }`. A tela escolhe o
   * menor que cobre o tamanho em que o efeito aparece -- a horda pequena não
   * decodifica a arte grande, e o zoom alto não borra. Ausente = só a `imagem`.
   */
  mipmaps?: Record<string, string>;
  /**
   * O MAPA DE CORES: a arte vem em tons de cinza -- o cinza é o calor, o alfa
   * é a forma --, e a cor sai daqui. `condicao` = uma rampa gerada da cor da
   * condição, e o mesmo fogo vira azul ou verde trocando só ela; ou o caminho
   * de uma rampa, uma imagem de 256x1 lida da esquerda (frio) para a direita.
   */
  cores?: string;
  /**
   * Onde a arte pode aparecer, em tons de cinza: o claro deixa, o escuro
   * apaga. Uma imagem do tamanho de um quadro, que vale para todos.
   */
  mascara?: string;
  /**
   * A PROFUNDIDADE, em tons de cinza: o claro passa na FRENTE da figura, o
   * escuro fica ATRÁS. É o que deixa o fogo envolver o corpo -- as chamas dos
   * pés na frente, o resto subindo por trás. Com ela, o `lado` não vale.
   */
  profundidade?: string;
};

/** Uma grade de quadros: quantos por linha, quantos ao todo, e a velocidade. */
export type QuadrosDoEfeito = {
  colunas: number;
  /** Múltiplo de `colunas`: a grade é cheia. */
  total: number;
  /** Quadros por segundo. */
  fps: number;
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
 * A luz que a figura emana: a tocha viva, a aura que clareia o corredor.
 *
 * Entra na luz da cena como a lanterna do token -- tapada pelas paredes, e
 * indo com a figura aonde ela for. O `raio` é em VEZES o lado maior da figura,
 * e não em unidade de cena como a lanterna: o pack não conhece a escala do
 * mapa, e o dragão em chamas clareia mais que o rato. Espelho de
 * `extensoes::LuzDoEfeito`.
 */
export type LuzDoEfeito = {
  /** De 0,5 a 10 vezes a figura. */
  raio: number;
  /** Ausente = a cor da condição. */
  cor?: string;
  /** De 0 a 1. Ausente = inteira. */
  intensidade?: number;
  /** Ausente = fixa. Os mesmos da luz cravada. */
  efeito?: EfeitoDaLuz;
};

/**
 * As PARTÍCULAS: o que a figura solta -- a fagulha que sobe do fogo, a gota
 * que pinga, a cinza que o vento leva.
 *
 * Cada uma é um elemento animado só por `transform` e `opacity`, nunca um
 * canvas no plano (que borra o mapa no zoom, ver `DadoLayer`). O caminho de
 * cada uma sai da semente da figura: a TV e o Mestre veem as mesmas, e a horda
 * não solta fagulha em uníssono. Muitas figuras dividem um teto -- ver
 * `TETO_DE_PARTICULAS`.
 *
 * Medidas em FIGURAS, como a luz: o pack não conhece a escala do mapa.
 */
export type ParticulasDoEfeito = {
  /** Quantas por figura, até 24 -- e menos quando a mesa inteira pega fogo. */
  quantidade: number;
  /**
   * Uma imagem da pasta, desenhada na proporção dela. Ausente = um brilho
   * redondo na cor.
   */
  imagem?: string;
  /**
   * A imagem vira só a FORMA, pintada na cor -- o símbolo preto que sumiria
   * no mapa escuro sai na cor da condição. Ausente = a imagem como veio.
   */
  pintar?: boolean;
  /** Ausente = a cor da condição. Vale para o brilho e para a imagem pintada. */
  cor?: string;
  /** Quanto cada uma gira ao longo da vida, em graus, para um lado ou outro. */
  giro?: number;
  /**
   * A `imagem` é um SPRITE: uma grade de quadros, como a do externo, que cada
   * partícula toca. Com `fps`, em laço, cada uma começando num quadro; sem,
   * uma vez ao longo da vida -- a fagulha que acende e apaga, a gota que
   * estoura.
   */
  quadros?: { colunas: number; total: number; fps?: number };
  /** O diâmetro, em fração da largura da figura. Ausente = 0,06. */
  tamanho?: number;
  /** De 0 a 1, o quanto o tamanho varia de uma para outra. Ausente = 0,5. */
  variacao?: number;
  /**
   * Para onde vão, em graus, no sentido horário a partir da direita -- o
   * mesmo da luz: 270 sobe, 90 desce. Ausente = 270.
   */
  direcao?: number;
  /** O leque em volta da direção, em graus. Ausente = 40. */
  abertura?: number;
  /** Em figuras por segundo. Ausente = 1. */
  velocidade?: number;
  /** Quanto cada uma dura, em segundos, de 0,3 a 6. Ausente = 1,5. */
  vida?: number;
  /**
   * Onde nascem: uma faixa da figura, em frações dela, encostada na âncora.
   * Ausente = 80% da largura e 30% da altura, na base.
   */
  emissor?: { largura?: number; altura?: number; ancora?: "base" | "centro" | "topo" };
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
