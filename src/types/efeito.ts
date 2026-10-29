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
   * O efeito também serve a uma ÁREA do chão. Ausente = só a figura. Ver
   * `AreaDoEfeito`.
   */
  area?: AreaDoEfeito;
  /** O chão do efeito: a textura deitada que marca a área. Ver `BaseDoEfeito`. */
  base?: BaseDoEfeito;
  /**
   * Como o efeito DISPARA: em linha, como a bola de fogo, ou em cone, como o
   * sopro do dragão. Ausente = em linha, com os padrões. Ver `DisparoDoEfeito`.
   */
  disparo?: DisparoDoEfeito;
  /**
   * O efeito que cobre a CENA inteira: a chuva, a neve, a neblina. Ausente =
   * não é de ambiente. Ver `AmbienteDoEfeito`.
   */
  ambiente?: AmbienteDoEfeito;
  /**
   * De onde vêm as imagens. Não é o autor que escreve: quem publica preenche
   * -- o plugin e a versão dele, ou a pasta do próprio aplicativo, que vão na
   * URL. Ausente = sem imagem; um externo sem origem não desenha.
   */
  origem?: OrigemDoEfeito;
  /**
   * Um molde do Compêndio, e não um efeito em jogo: fora do seletor, do
   * cardápio e da mesa. Espelho da marca em `efeitos.json` -- ver
   * `efeitos::eh_molde`.
   */
  compendio?: boolean;
  /** As tags do Compêndio, para filtrar. */
  tags?: string[];
  /**
   * O molde do Compêndio de que este efeito em jogo é a cópia. O molde
   * arrastado até um token vai ao jogo copiado, e o próximo token reaproveita
   * a mesma cópia enquanto ela for igual ao molde. Ver `copiaEmJogo`.
   */
  molde?: string;
  /**
   * O efeito do Compêndio do ATO20 que o arrasto até um token trouxe para cá.
   * O segundo token acha o que o primeiro trouxe, em vez de trazer de novo --
   * o "Trazer" sempre dá id novo. Ver `doAto20EmJogo`.
   */
  ato20?: string;
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

/**
 * O efeito numa ÁREA do chão: o fogo que se alastra por um pedaço do mapa.
 *
 * A área usa a imagem do `externo` como o FOCO de cada segmento -- uma casa
 * da grade --, e a `luz` do efeito, espalhada em poucas fontes. Declarado, e
 * não deduzido de todo efeito com externo: a poça do sangue repetida em
 * ladrilhos não é o que se quer de um chão sangrando. Ver `planoDaArea`.
 */
export type AreaDoEfeito = {
  /** A cor de uma área nova. Ausente = a do fogo. */
  cor?: string;
  /** O foco, em vezes o segmento, de 1 a 2,5. Ausente = 1,5. */
  escala?: number;
  /**
   * Quantos segmentos por lado de CASA da grade, de 1 a 4. Ausente = 1, a
   * casa inteira. Dois é cada casa em quatro: chamas menores e mais juntas,
   * que enchem a área pequena em vez de três focos do tamanho dela. Inteiro,
   * e não fração, para o segmento continuar alinhado à grade.
   */
  divisoes?: number;
  /**
   * Quantos segmentos, no MÍNIMO, cabem no menor lado da área. Ausente = sem
   * mínimo. Na área pequena a casa se divide mais -- até oito por lado -- e
   * a chama encolhe junto: o fogo de uma fogueira e o de um salão têm o
   * tamanho do que queima, e não o da casa da grade.
   */
  densidade?: number;
  /**
   * O FOCO: a chama que a área repete, segmento a segmento. Ausente = a
   * imagem do `externo`. Existe porque o externo é desenhado para envolver
   * uma figura -- o anel com as línguas altas nos lados --, e repetido em
   * ladrilho ele desenhava fileiras. O foco é uma chama só, estreita, com o pé
   * macio. Os mesmos campos de imagem da base.
   */
  foco?: Pick<BaseDoEfeito, "imagem" | "quadros" | "mipmaps" | "cores">;
};

/**
 * O efeito DISPARADO: sai de um ponto e vai até outro -- a bola de fogo, o raio
 * de gelo, o jato d'água, o sopro do dragão. É a terceira ESPÉCIE de efeito, ao
 * lado do de personagem (a figura de quem tem a condição) e do de área (o
 * chão): o efeito que declara este bloco é um disparo, e só ele dispara. Tem
 * janela própria e listas próprias -- ver `especieDoEfeito`.
 *
 * Desenha com as camadas de sempre, que no disparo têm outro papel: o
 * `projetil` (ou, sem ele, o elemento da área) é o que voa; as `particulas`
 * são o rastro e o que o cone solta; o chão (`base`) e os elementos
 * (`area.foco`) fazem o cone e o estouro no fim da linha. O `area.cor` é a cor
 * do tiro.
 *
 * Quem decide a forma é o efeito, e não quem dispara: o mestre escolhe a "Bola
 * de fogo", e ela sabe que vai reta e estoura. Os números são em CASAS da
 * grade, como o mapa as mede. Ver `disparoDoEfeito`, que prende cada um.
 */
export type DisparoDoEfeito = {
  /**
   * `linha`: o projétil voa de A até B -- e estoura lá, se tiver `impacto`.
   * `cone`: o leque se abre de A até a distância de B, na direção dele.
   */
  forma: "linha" | "cone";
  /** A abertura do cone, em graus, de 10 a 160. Ausente = 60. */
  abertura?: number;
  /** Em casas por segundo, de 3 a 60. Ausente = 15. */
  velocidade?: number;
  /**
   * Até onde vai, em casas, quando sai de um token para onde ele olha -- o
   * disparo pelo botão direito, que não tem ponto B. De 1 a 30. Ausente = 6.
   */
  alcance?: number;
  /** O lado do projétil da linha, em casas, de 0,3 a 3. Ausente = 1. */
  tamanho?: number;
  /**
   * O raio do estouro no fim da linha, em casas, de 0 a 4. Zero = sem
   * estouro: a flecha que só chega. Ausente = 1.
   */
  impacto?: number;
  /**
   * O que VOA na linha: uma imagem, com os campos de imagem da base. Ausente =
   * o elemento da área (`area.foco`), ou o `externo`, deitado com o topo para
   * trás -- a chama que vira cauda.
   */
  projetil?: ProjetilDoDisparo;
  /** A faixa da cor do tiro, de A até o projétil. Ausente = sim. */
  rastro?: boolean;
  /** O brilho redondo em volta do projétil. Ausente = sim. */
  brilho?: boolean;
};

/**
 * A imagem do projétil. Desenhada como veio, ela voa para a DIREITA da imagem;
 * o `giro` vira a imagem antes do voo -- `90` põe o topo na frente (o
 * estilhaço que fura), `-90` o põe para trás (a chama que vira cauda).
 */
export type ProjetilDoDisparo = Pick<BaseDoEfeito, "imagem" | "quadros" | "mipmaps" | "cores"> & {
  /** Em graus, no sentido horário: `0`, `90`, `-90` ou `180`. Ausente = 0. */
  giro?: number;
};

/**
 * O efeito de AMBIENTE: o clima que cobre a cena inteira -- a chuva, a neve,
 * a neblina, a cinza que cai. É a quarta ESPÉCIE de efeito, ao lado do de
 * personagem, do de área e do disparo: o efeito que declara este bloco é um
 * ambiente, e não serve a figura, a chão nem a tiro. A cena aponta para um
 * (`Scene.ambiente`), com a intensidade e o vento dela.
 *
 * Desenha NA LENTE: por cima da tela, e não no chão do mapa. A chuva cai de
 * cima para baixo no 2D e no 2.5D, não amplia com o zoom e não anda com a
 * câmera -- é o vidro por onde a mesa olha. Por isso também passa por cima da
 * névoa e do escuro: não chove só onde a mesa já viu.
 *
 * Cada camada é uma textura EMENDÁVEL que desliza em laço, animada só por
 * `transform` -- o compositor a move sem repintar nada. Duas ou três camadas
 * de tamanhos e velocidades diferentes dão a profundidade: a gota fina e lenta
 * lá atrás, a grossa e rápida na frente. Ver `planoDaCamada`.
 */
export type AmbienteDoEfeito = {
  /**
   * A cor do ambiente: a das camadas com `cores: "condicao"`, e a do véu
   * quando ele não diz a sua. Ausente = um cinza azulado.
   */
  cor?: string;
  /** As camadas, de TRÁS para a frente: de uma a quatro. Ver `CamadaDoAmbiente`. */
  camadas: CamadaDoAmbiente[];
  /**
   * Uma cor sobre a tela inteira: o cinza da tempestade, o branco da nevasca.
   * Ausente = sem véu.
   */
  veu?: VeuDoAmbiente;
  /** O clarão do relâmpago. Ausente = sem. Ver `RelampagoDoAmbiente`. */
  relampago?: RelampagoDoAmbiente;
};

/**
 * Uma camada do ambiente: a textura, e como ela desliza.
 *
 * As medidas são em ALTURAS DA TELA, e não em pixels nem em casas: o ambiente
 * não está no mapa, e a mesma chuva tem de ler igual na TV e no celular.
 *
 * A imagem tem os campos de imagem da base, menos os quadros: a camada anda
 * deslizando, e uma folha de quadros pediria repintar a tela inteira a cada
 * degrau.
 */
export type CamadaDoAmbiente = Pick<BaseDoEfeito, "imagem" | "mipmaps" | "cores"> & {
  /** O lado do ladrilho, de 0,1 a 2 alturas da tela. Ausente = 0,5. */
  escala?: number;
  /**
   * Para onde vai, em graus, no sentido horário a partir da direita -- o mesmo
   * das partículas: 90 desce, 270 sobe, 0 vai para a direita. Fora dos eixos
   * a textura inclina junto, como a chuva com vento. Ausente = 90.
   */
  direcao?: number;
  /** Em alturas da tela por segundo, de 0 a 3. Zero = parada. Ausente = 1. */
  velocidade?: number;
  /** De 0 a 1. Ausente = 1. */
  opacidade?: number;
  /**
   * O quanto ela balança de um lado para o outro enquanto cai, em vezes o
   * ladrilho, de 0 a 0,5: o floco que dança. Ausente = 0.
   */
  balanco?: number;
};

/** O véu: uma cor parada sobre a tela inteira. */
export type VeuDoAmbiente = {
  /** Ausente = a cor do ambiente. */
  cor?: string;
  /** De 0 a 0,8: mais que isso apagaria a cena. */
  opacidade: number;
};

/**
 * O relâmpago: a tela clareia de repente, duas vezes seguidas, e apaga. Dois
 * relógios de ritmos diferentes, para o clarão não cair sempre no mesmo
 * compasso. Ver `RelampagoNaLente`.
 */
export type RelampagoDoAmbiente = {
  /** Os segundos entre um clarão e outro, de 3 a 60. Ausente = 12. */
  intervalo?: number;
  /** Ausente = um branco azulado. */
  cor?: string;
  /** O quanto clareia, de 0 a 1. Ausente = 0,6. */
  forca?: number;
};

/**
 * A BASE de um efeito: o chão de fogo embaixo das chamas, a poça embaixo do
 * veneno. Plana -- deitada no chão como uma malha --, e recortada na forma
 * EXATA da área: é a única camada que diz ao jogador onde a área termina. O
 * fogo sobe além da borda e a fagulha voa para fora; a base, não.
 *
 * Os mesmos campos de imagem do `externo` -- quadros, mipmaps, cores --, e
 * LADRILHADA: a textura se repete segmento a segmento, na escala da área (ver
 * `AreaDoEfeito.divisoes`), e por isso tem de emendar consigo mesma nas quatro
 * bordas. Na área, a base
 * anda no ritmo da folha do fogo: o total de quadros dela deve dividir o dele,
 * para o laço fechar junto.
 */
export type BaseDoEfeito = {
  /** Relativa à pasta do pack. Só raster, e emendável. */
  imagem: string;
  /** A mesma grade de quadros do externo. Ver `QuadrosDoEfeito`. */
  quadros?: QuadrosDoEfeito;
  /** Pelo lado do QUADRO em pixels, como os do externo. */
  mipmaps?: Record<string, string>;
  /** `condicao` ou o caminho de uma rampa, como no externo. */
  cores?: string;
  /** De 0 a 1. Ausente = 1. */
  opacidade?: number;
  /** O ladrilho, em vezes o segmento da área, de 0,5 a 4. Ausente = 1. */
  escala?: number;
  /**
   * O quanto o chão escurece embaixo da textura, de 0 a 1, e a borda com ele.
   * É o carvão embaixo do chão de fogo: a rampa da cor não chega ao preto, e a
   * textura acende só o que arde. Ausente = 0, a textura sozinha.
   */
  escurece?: number;
};
