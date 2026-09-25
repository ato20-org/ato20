/**
 * A conta da sombra: onde ela cai, quanto ela estica e quão escura fica.
 *
 * Duas sombras diferentes moram aqui, e elas são diferentes porque o que as
 * projeta é diferente:
 *
 * - **A da FIGURA** -- token, mobília, o que está em pé no mapa. É uma MANCHA
 *   deslocada para o lado oposto ao da luz: a pegada da figura, e não o recorte
 *   dela. O porquê, com os números que o decidiram, está em `ManchaDaSombra`.
 *
 * - **A da PAREDE** -- a faixa que o segmento deita atrás de si. Essa é
 *   geometria de verdade, e é barata do mesmo jeito: o segmento copiado e
 *   empurrado pela altura da parede, um quadrilátero. Nada de varrer pixel,
 *   nada de varrer ângulo.
 *
 * A fonte é UMA e é o sol, que está no infinito: toda sombra do mapa cai para
 * o mesmo lado e todas são paralelas. Houve tocha aqui -- luz com posição e
 * alcance, sombra que se abre em leque e esmaece com a distância --, e ela
 * saiu: ver o histórico deste arquivo se for preciso ressuscitá-la.
 *
 * Tudo aqui é função pura sobre números -- o componente só pinta o que sai
 * daqui. É o que torna a sombra testável sem tela, que é o único jeito de um
 * bug de geometria aparecer antes de alguém olhar o mapa.
 */

import { paraCena, pontosNaCaixa } from "@/lib/geometry/area-escondida";
import type { Vec } from "@/lib/geometry/transform";
import type { CanvasItem, Parede, Sol } from "@/types/scene";
import { SCENE_HEIGHT, SCENE_WIDTH } from "@/types/scene";

/** O que a conta precisa saber de um item. O resto -- arquivo, z -- não entra. */
export type CaixaDaFigura = Pick<
  CanvasItem,
  "x" | "y" | "width" | "height" | "rotation"
>;

const GRAU = Math.PI / 180;

/** Duas casas: o valor vai para o DOM, e o resto é ruído no atributo. */
function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * O deslocamento da sombra a partir do centro da figura, dado PARA ONDE ela
 * vai.
 *
 * Sem nenhum desconto do giro do item, e isso é consequência de a mancha morar
 * numa camada PRÓPRIA em vez de dentro do item: aqui o referencial já é o da
 * cena, e girar um token não tem por que girar a sombra dele -- ela continua
 * caindo para onde a luz manda.
 */
function projetarFigura(
  item: CaixaDaFigura,
  anguloGraus: number,
  comprimento: number,
  forca: number,
): FiltroDaSombra {
  const angulo = anguloGraus * GRAU;
  const alcance = item.height * comprimento;

  return {
    dx: arredondar(Math.cos(angulo) * alcance),
    dy: arredondar(Math.sin(angulo) * alcance),
    forca: arredondar(forca),
    angulo: arredondar(anguloGraus),
    comprimento: arredondar(comprimento),
  };
}

/**
 * A sombra RESERVA de uma figura: uma mancha no chão, no lugar da silhueta.
 *
 * Foi o desenho principal por duas versões, e hoje é o que segura a cena
 * enquanto a silhueta não ficou pronta -- e para sempre no item cuja imagem não
 * pôde ser lida. O desenho que vale é a figura deitada: ver `vultoDaFigura` e
 * `silhueta.ts`, que assa a silhueta uma vez e não custou quadro nenhum.
 *
 * O que continua valendo aqui é a razão de NÃO filtrar, e ela veio da bancada.
 * Duas versões desenhavam a figura com filtro, e as duas custaram quadro no
 * motor em que o aplicativo roda -- medido em `scripts/perf/webview.py`,
 * cenário `mestre-camera`, 40 itens, WebKitGTK 2.52.5, três corridas:
 *
 * | desenho                              | fps  | perdidos |
 * | ------------------------------------ | ---- | -------- |
 * | sem sombra                           | 59,4 |     2,1% |
 * | `drop-shadow` na figura              | 37,3 |    76,5% |
 * | cópia da `<img>` preta e borrada     |  --  |       -- |
 *
 * O culpado é o mesmo nos dois: filtro. O palco re-rasteriza a cada quadro em
 * que a câmera anda, e um filtro por item é um passe por item por quadro. A
 * mancha não tem filtro nenhum -- é um degradê de fundo num `div`, que o motor
 * pinta como pinta qualquer caixa. A silhueta que a substituiu também não tem:
 * o preto e o desfoque dela são pixel assado fora do quadro.
 *
 * O que esta mancha já foi, e não era: a pegada do token, redonda porque o mapa
 * é visto de cima. A pegada até é redonda -- mas a sombra de quem está EM PÉ
 * não é a pegada dele, é a figura dele deitada, e é ela que a mesa reconhece.
 *
 * Ver a memória "leveza acima de arquitetura".
 */
export type ManchaDaSombra = {
  /** O centro da mancha, em coordenadas de cena. */
  x: number;
  y: number;
  largura: number;
  altura: number;
  /** De 0 a 1. */
  forca: number;
};

/** O quanto a mancha é mais achatada que a caixa de quem a projeta. */
const ACHATAMENTO = 0.55;
/** E o quanto ela é mais estreita: sombra não tem a largura do desenho todo. */
const ESTREITAMENTO = 0.82;

/**
 * A mancha que esta figura deita sob o sol. `null` sem sol na cena.
 *
 * UMA, e não uma lista: com o sol como única fonte, uma figura tem uma sombra.
 * Houve um tempo de duas ou três, quando as tochas se somavam ao sol, e o
 * número era da bancada e não do gosto: cada mancha é uma caixa com degradê a
 * pintar, e duas por figura (80 caixas, 40 itens) davam 45,7 fps contra 59,4
 * sem sombra nenhuma no cenário `mestre-camera` da webview.
 */
export function manchaDaFigura(
  item: CaixaDaFigura,
  sol: Sol | undefined,
): ManchaDaSombra | null {
  if (!sol) return null;

  const sombra = sombraDoSol(item, sol);

  return {
    x: arredondar(item.x + item.width / 2 + sombra.dx),
    y: arredondar(item.y + item.height / 2 + sombra.dy),
    largura: arredondar(item.width * ESTREITAMENTO),
    altura: arredondar(item.height * ACHATAMENTO),
    forca: sombra.forca,
  };
}

/**
 * O VULTO de uma figura: ela mesma, preta, escorrida no chão a partir dos pés.
 *
 * É a sombra que a mesa lê como sombra -- a forma de quem está em pé ali, e não
 * uma bola embaixo dele. A mancha oval continua existindo e continua sendo o
 * que se desenha enquanto a silhueta não ficou pronta, ou quando não há figura
 * de onde tirá-la. Ver `ManchaDaSombra` e `silhuetaDaImagem`.
 *
 * O que sai daqui é uma transformação, e de propósito: esticar e esmaecer uma
 * imagem é trabalho de compositor, e o palco já paga por isso em todo token que
 * anda. O que NÃO sai daqui é pixel -- esse é assado uma vez, longe do quadro.
 *
 * ## Por que ela ESCORRE, e não tomba
 *
 * A primeira versão girava a silhueta inteira até a direção da sombra, como
 * quem derruba um boneco de papelão. Parecia certa com o token em pé e desmontou
 * no primeiro token GIRADO: a figura deitada no mapa continuava com uma sombra
 * em pé ao lado, porque o giro do item não entrava em lugar nenhum -- e somá-lo
 * ao tombo girava a figura duas vezes, mandando a sombra para o lado oposto ao
 * da luz.
 *
 * O que uma sombra faz é outra coisa: o PÉ fica onde está -- ele já está no
 * chão, e o que está no chão não se projeta -- e cada ponto acima dele corre na
 * direção da luz na medida da própria altura. A cabeça, que é o ponto mais
 * alto, corre o máximo. É um cisalhamento, e não um giro:
 *
 *     x' = x + (pé − y) · kx
 *     y' = y + (pé − y) · ky
 *
 * Com isso o giro do item não é caso especial nenhum: a imagem é girada ANTES,
 * exatamente como o token é girado, e o que escorre é a figura já na posição em
 * que a mesa a vê. Ver `matrizDoVulto`.
 */
export type VultoDaFigura = {
  /** O canto da caixa da figura: o vulto nasce em cima dela. */
  x: number;
  y: number;
  largura: number;
  altura: number;
  /**
   * O quanto a sombra corre, nos dois eixos, por unidade de altura na tela.
   *
   * É o `comprimento` da fonte aberto na direção dela: quem está uma unidade
   * acima do pé cai `kx` para o lado e `ky` para baixo.
   */
  kx: number;
  ky: number;
  /** De 0 a 1. */
  forca: number;
};

export function vultoDaFigura(
  item: CaixaDaFigura,
  sol: Sol | undefined,
): VultoDaFigura | null {
  if (!sol) return null;

  const fonte = sombraDoSol(item, sol);
  const angulo = fonte.angulo * GRAU;

  return {
    x: item.x,
    y: item.y,
    largura: item.width,
    altura: item.height,
    kx: arredondar(Math.cos(angulo) * fonte.comprimento),
    ky: arredondar(Math.sin(angulo) * fonte.comprimento),
    forca: fonte.forca,
  };
}

/**
 * A linha do chão de uma figura, em unidades de cena contadas do topo da caixa.
 *
 * É o ponto mais BAIXO da figura na tela: com o token em pé, a sola da bota;
 * com ele girado, o canto do recorte que o giro levou mais para baixo. Sem esta
 * conta a sombra de um token deitado saía presa na linha em que as botas
 * estariam SE ele estivesse em pé -- e o que está abaixo de uma linha dessas
 * escorre para trás, contra a luz, que é a sombra descolada do corpo.
 *
 * Os quatro cantos, e não só os de baixo: qualquer um deles pode ser o mais
 * baixo depois de um giro qualquer. A caixa gira em torno do centro, como o
 * token (ver `CanvasItemView`).
 */
export function peDaFigura(
  recorte: { esquerda: number; cima: number; direita: number; baixo: number },
  largura: number,
  altura: number,
  rotation: number,
): number {
  const meiaL = largura / 2;
  const meiaA = altura / 2;
  const angulo = rotation * GRAU;
  const cos = Math.cos(angulo);
  const sen = Math.sin(angulo);

  const xs = [recorte.esquerda * largura, recorte.direita * largura];
  const ys = [recorte.cima * altura, recorte.baixo * altura];

  let baixo = -Infinity;

  for (const x of xs) {
    for (const y of ys) {
      // O canto girado em torno do centro da caixa, e só o Y importa: o que se
      // procura é a altura na TELA em que a figura encosta no chão.
      baixo = Math.max(baixo, meiaA + (x - meiaL) * sen + (y - meiaA) * cos);
    }
  }

  return arredondar(baixo);
}

/**
 * A matriz CSS que escorre a figura, dado onde ela pisa.
 *
 * O pé vem da SILHUETA e não da caixa -- é o último pixel desenhado do arquivo,
 * e quase nenhum token encosta na borda de baixo do próprio PNG. Ver `ancoraY`.
 *
 * A forma da matriz sai direto das duas linhas do cabeçalho de `VultoDaFigura`,
 * com `pe` no lugar de `pé`:
 *
 *     x' = 1·x + (−kx)·y + kx·pe
 *     y' = 0·x + (1−ky)·y + ky·pe
 *
 * `d` fica negativo quando a sombra passa de uma altura de comprimento, e isso
 * é a projeção e não um erro: com o sol rente ao chão a cabeça vai parar do
 * outro lado do pé, e a figura aparece virada porque é isso que uma sombra
 * comprida faz.
 */
export function matrizDoVulto(vulto: VultoDaFigura, pe: number): string {
  const { kx, ky } = vulto;

  return `matrix(1, 0, ${-kx}, ${arredondar(1 - ky)}, ${arredondar(kx * pe)}, ${arredondar(ky * pe)})`;
}

/** O deslocamento de uma sombra, antes de virar mancha ou vulto. */
export type FiltroDaSombra = {
  /** Deslocamento a partir do centro da figura, em unidades de cena. */
  dx: number;
  dy: number;
  forca: number;
  /**
   * Para onde a sombra vai, em graus, e o quanto ela estica em frações da
   * altura da figura.
   *
   * O deslocamento acima é os dois já resolvidos, e serve à mancha: ela é uma
   * elipse, e elipse não tem para onde apontar. O VULTO precisa dos dois
   * separados -- ele deita a figura inteira, e deitar é girar e encurtar. Ver
   * `vultoDaFigura`.
   */
  angulo: number;
  comprimento: number;
};

/**
 * A sombra que o sol joga desta figura.
 *
 * Nunca devolve nada: o sol alcança a cena inteira, e está no infinito. Duas
 * figuras em cantos opostos do mapa têm sombras PARALELAS, e é isso que faz a
 * conta ser a mesma para todas.
 */
export function sombraDoSol(item: CaixaDaFigura, sol: Sol): FiltroDaSombra {
  return projetarFigura(item, sol.angulo, sol.comprimento, sol.forca);
}

/**
 * A altura de uma parede que não tem altura dita, em unidades de cena.
 *
 * A parede é geometria, e não um tijolo -- ela é a informação "aqui a luz
 * para". Mas o sol precisa de um número para saber quanto de sombra deitar, e
 * este é o que não obriga o mestre a responder mais uma pergunta: a altura de
 * um token, mais ou menos o lado de um quadrado de grade. Uma parede de dois
 * metros, que é o que quase toda parede de mapa é.
 *
 * Era o único número possível, e virou o PADRÃO quando a parede ganhou altura
 * própria: muro de quintal, mureta de jardim e torre de vigia jogam sombras
 * muito diferentes, e era a mesma para as três. Ver `altura` em `Parede`.
 */
export const ALTURA_DA_PAREDE = 110;

/** Em quantos lados uma elipse é quebrada. Ver `verticesDaParede`. */
const LADOS_DA_ELIPSE = 24;

/**
 * Quantos metros vale a parede padrão, e quantas unidades de cena vale um
 * metro de altura.
 *
 * A régua da altura, e ela existe para o controle poder dizer "2,5 m" em vez de
 * "137". O mestre pensa a parede em metros -- uma mureta, um muro, uma torre --,
 * e o número de unidades de cena não significa nada para ele.
 *
 * Não sai da grade de propósito: grade é opcional e ajustável, e a sombra não
 * pode mudar de tamanho porque alguém recalibrou o quadrado. Esta régua é a
 * mesma que `ALTURA_DA_PAREDE` sempre fingiu.
 */
export const METROS_DA_PAREDE_PADRAO = 2;
export const UNIDADES_POR_METRO = ALTURA_DA_PAREDE / METROS_DA_PAREDE_PADRAO;

/** A altura desta parede, em unidades de cena. */
export function alturaDaParede(parede: FormaDaParede): number {
  return parede.altura ?? ALTURA_DA_PAREDE;
}

/** Um pedaço reto de parede: é ele que para a luz. */
export type Segmento = { x1: number; y1: number; x2: number; y2: number };

/**
 * A parede sem o `id`: a geometria dela, e só.
 *
 * Estrutural porque estas contas valem para a parede EM CURSO -- a que o
 * arrasto está desenhando e que ainda não entrou na cena -- tanto quanto para a
 * que já está gravada. É o mesmo motivo de `CaixaDaArea` existir ao lado de
 * `FogRegion`.
 */
export type FormaDaParede = Omit<Parede, "id"> & { id?: string };

/**
 * Os vértices do contorno de uma parede, em coordenadas de CENA e já girados.
 *
 * É aqui que o `formato` deixa de importar: dali para baixo, uma parede é uma
 * lista de pontos, e a sombra, a faixa e o contorno são a mesma conta para os
 * quatro desenhos. Foi o que permitiu a parede ganhar laço, retângulo e giro
 * sem que a conta da umbra soubesse que eles existem.
 */
function verticesDaParede(parede: FormaDaParede): { pontos: Vec[]; fechado: boolean } {
  const locais: Vec[] = [];

  if (parede.formato === "linha") {
    const sobe = parede.diagonal === "secundaria";
    locais.push({ x: 0, y: sobe ? parede.height : 0 });
    locais.push({ x: parede.width, y: sobe ? 0 : parede.height });

    return {
      pontos: locais.map((local) => paraCena(parede, local)),
      fechado: false,
    };
  }

  if (parede.formato === "retangulo") {
    locais.push(
      { x: 0, y: 0 },
      { x: parede.width, y: 0 },
      { x: parede.width, y: parede.height },
      { x: 0, y: parede.height },
    );
  } else if (parede.formato === "elipse") {
    // Quebrada em lados porque a umbra é feita de RETAS: uma elipse de verdade
    // exigiria uma conta de tangente por fonte, e vinte e quatro lados já leem
    // como curva num mapa.
    for (let i = 0; i < LADOS_DA_ELIPSE; i += 1) {
      const angulo = (i / LADOS_DA_ELIPSE) * Math.PI * 2;
      locais.push({
        x: (parede.width / 2) * (1 + Math.cos(angulo)),
        y: (parede.height / 2) * (1 + Math.sin(angulo)),
      });
    }
  } else {
    locais.push(...pontosNaCaixa(parede, parede.pontos ?? []));
  }

  return {
    pontos: locais.map((local) => paraCena(parede, local)),
    fechado: true,
  };
}

/**
 * Os pedaços retos de uma parede. É o que a luz enxerga dela.
 *
 * Laço com menos de dois vértices não devolve nada: um ponto não para luz.
 */
export function segmentosDaParede(parede: FormaDaParede): Segmento[] {
  const { pontos, fechado } = verticesDaParede(parede);
  if (pontos.length < 2) return [];

  const segmentos: Segmento[] = [];
  const ate = fechado ? pontos.length : pontos.length - 1;

  for (let i = 0; i < ate; i += 1) {
    const de = pontos[i]!;
    const para = pontos[(i + 1) % pontos.length]!;
    if (de.x === para.x && de.y === para.y) continue;
    segmentos.push({ x1: de.x, y1: de.y, x2: para.x, y2: para.y });
  }

  return segmentos;
}

/**
 * Os segmentos de uma parede que jogam sombra para FORA dela, dada a direção em
 * que a sombra anda.
 *
 * A parede é uma máscara posta em cima da parede já pintada no mapa, e sombra
 * nenhuma entra na pedra: escurecer o miolo seria escurecer o desenho do mapa.
 *
 * A primeira tentativa recortava a pedra com uma máscara SVG, e ela custou o
 * palco. Medido na bancada da webview (`mestre-camera`, 40 itens, 40 paredes,
 * sol, `next dev`), três corridas cada:
 *
 * | desenho                       | fps  | p95   | perdidos |
 * | ----------------------------- | ---- | ----- | -------- |
 * | tudo, com máscara da pedra    | 25,9 |  55ms |     100% |
 * | tudo, sem recorte nenhum      | 53,5 |  30ms |      20% |
 * | só as bordas que jogam p/fora | 59,7 |  18ms |     2,2% |
 *
 * Mascarar obriga o motor a compor um buffer de alfa do tamanho da sombra a
 * cada re-raster. A conta abaixo não só é de graça como sai na frente das duas:
 * são metade das faixas a pintar.
 *
 * A conta abaixo é de graça, e é a mesma que um motor 3D faz para achar a
 * silhueta de um volume de sombra: um lado só projeta para fora se a NORMAL
 * EXTERNA dele aponta a favor da sombra. Numa sala com o sol a nordeste, os
 * lados de baixo e da direita jogam para o corredor; os de cima e da esquerda
 * jogariam para dentro da própria sala, e são justamente os que não entram.
 *
 * Com os vértices postos no sentido de área positiva, a normal externa de uma
 * aresta `a -> b` é `(dy, -dx)`. É por isso que a ordem é normalizada aqui: ela
 * vem do formato -- retângulo, elipse, laço à mão -- e ninguém garante o
 * sentido.
 *
 * A direção é UMA para a parede inteira, e é a do sol: ele está no infinito, e
 * de lá todos os lados o veem do mesmo ângulo. Já foi uma função por SEGMENTO,
 * quando havia tocha -- luz com posição é vista de um ângulo diferente por cada
 * lado, e com ela acesa dentro do cômodo todos projetam para fora.
 *
 * ## Quem devolve tudo
 *
 * A `linha`, porque uma reta não tem dentro: os dois lados dela são corredor.
 *
 * E o PÁTIO -- a parede descoberta --, porque ali o miolo não é pedra, é chão à
 * vista: o muro pega sol de um lado e deita a sombra dele para dentro do
 * quintal, como deita para fora. É a única diferença de desenho entre coberta e
 * descoberta, e é a que o mestre vê ao apagar a bolinha do teto.
 */
export function segmentosQueProjetam(
  parede: FormaDaParede,
  direcao: Vec,
): Segmento[] {
  const { pontos, fechado } = verticesDaParede(parede);
  if (pontos.length < 2) return [];
  if (!fechado || parede.semTeto) return segmentosDaParede(parede);

  let dobro = 0;
  for (let i = 0; i < pontos.length; i += 1) {
    const atual = pontos[i]!;
    const proximo = pontos[(i + 1) % pontos.length]!;
    dobro += atual.x * proximo.y - proximo.x * atual.y;
  }

  const ordenados = dobro < 0 ? [...pontos].reverse() : pontos;
  const fora: Segmento[] = [];

  for (let i = 0; i < ordenados.length; i += 1) {
    const de = ordenados[i]!;
    const para = ordenados[(i + 1) % ordenados.length]!;
    const dx = para.x - de.x;
    const dy = para.y - de.y;
    if (dx === 0 && dy === 0) continue;

    const segmento = { x1: de.x, y1: de.y, x2: para.x, y2: para.y };
    const { x: dirX, y: dirY } = direcao;

    // A normal externa contra a direção da sombra.
    const cruz = dy * dirX - dx * dirY;
    if (cruz <= 0) continue;

    /**
     * O lado PARALELO à sombra não entra, e a conta é por seno e não por zero
     * cravado: um sol a prumo tem cosseno de 6e-17, e não de zero, então o lado
     * vertical de um retângulo passava raspando e virava uma faixa de área
     * nula -- um polígono a pintar que não pinta nada.
     */
    const escala = (dx * dx + dy * dy) * (dirX * dirX + dirY * dirY);
    if (cruz * cruz <= 1e-18 * escala) continue;

    fora.push(segmento);
  }

  return fora;
}

/**
 * O contorno de uma parede como caminho SVG, em coordenadas de cena.
 *
 * É a linha do MEIO da faixa -- o desenho fino que o mestre segue --, e não a
 * borda dela. Serve ao traço por cima da faixa e ao tracejado da selecionada.
 */
export function contornoDaParede(parede: FormaDaParede): string {
  const { pontos, fechado } = verticesDaParede(parede);
  if (pontos.length < 2) return "";

  const [primeiro, ...resto] = pontos;

  return (
    `M${arredondar(primeiro!.x)},${arredondar(primeiro!.y)}` +
    resto.map((p) => `L${arredondar(p.x)},${arredondar(p.y)}`).join("") +
    (fechado ? "Z" : "")
  );
}

/**
 * A grossura de uma parede que não tem área: a `linha`.
 *
 * Só ela precisa de um número. Nos outros três formatos a parede É a região que
 * o mestre desenhou -- o quadrado, o círculo, o contorno --, e a grossura dela
 * é o tamanho do desenho. Houve uma versão com grossura por parede e um
 * controle na barra para regulá-la, e ela estava respondendo à pergunta errada:
 * o que se queria não era uma borda grossa em volta do contorno, era o MIOLO
 * cheio.
 */
const GROSSURA_DA_LINHA = 22;

/**
 * O CORPO de uma parede: a região preenchida, que é a pedra dela.
 *
 * Nos formatos que cercam uma área -- quadrado, círculo, traço livre --, o
 * corpo é o próprio contorno preenchido: a parede é maciça por dentro, e o
 * mestre desenha o volume dela em vez de desenhar uma linha e pedir uma
 * espessura. É o que separa "contornei esta sala" de "esta massa aqui é
 * parede".
 *
 * A `linha` é a exceção, e por definição: uma reta não tem interior. Ali o
 * corpo é uma faixa em volta dela, com `GROSSURA_DA_LINHA` de largura.
 *
 * Só o Mestre vê isto. A mesa recebe a parede para calcular a própria sombra e
 * nunca a desenha -- ver `ParedeLayer`.
 */
export function corpoDaParede(parede: FormaDaParede): string {
  if (parede.formato !== "linha") {
    const { pontos, fechado } = verticesDaParede(parede);
    if (!fechado || pontos.length < 3) return "";

    return poligonoOrientado(pontos);
  }

  return segmentosDaParede(parede)
    .map((segmento) => {
      const dx = segmento.x2 - segmento.x1;
      const dy = segmento.y2 - segmento.y1;
      const comprimento = Math.hypot(dx, dy);
      if (comprimento === 0) return "";

      // A normal do segmento: o que sai dele para o lado, e é ela que dá a
      // faixa.
      const meia = GROSSURA_DA_LINHA / 2;
      const nx = (-dy / comprimento) * meia;
      const ny = (dx / comprimento) * meia;

      return poligonoOrientado([
        { x: segmento.x1 + nx, y: segmento.y1 + ny },
        { x: segmento.x2 + nx, y: segmento.y2 + ny },
        { x: segmento.x2 - nx, y: segmento.y2 - ny },
        { x: segmento.x1 - nx, y: segmento.y1 - ny },
      ]);
    })
    .join("");
}

/**
 * A PEDRA de todas as paredes num caminho só: onde a sombra não entra.
 *
 * A parede que o mestre desenha é uma máscara posta em cima da parede já
 * pintada no mapa. Escurecer o miolo dela seria escurecer o desenho do mapa --
 * a pedra apareceria na penumbra enquanto o corredor ao lado está no sol --, e
 * é a razão de a sombra ser recortada por isto antes de chegar à tela. Ver
 * `SombraLayer`.
 *
 * O que a parede continua fazendo é a sombra do lado de FORA: o vulto dela
 * atravessa o corredor e cai no chão, e é essa a única coisa que a mesa vê
 * dela. O teto segue decidindo o quanto disso sai -- com ele, a projeção do
 * miolo inteiro; sem ele, só a das bordas. Ver `tetoAoSol`.
 *
 * Um caminho só, e todos os corpos no mesmo sentido: a máscara é preenchida
 * pela regra de voltas, e dois corpos sobrepostos em sentidos contrários se
 * anulariam -- um buraco na máscara é um pedaço de pedra que volta a escurecer.
 */
export function pedraDasParedes(paredes: Parede[]): string {
  return paredes.map(corpoDaParede).join("");
}

/**
 * Um polígono como caminho SVG, sempre no MESMO sentido.
 *
 * O sentido decide se duas umbras que se cruzam se somam ou se anulam: a regra
 * padrão de preenchimento conta voltas com sinal, e um quadrilátero horário
 * sobre outro anti-horário dá zero -- um BURACO no meio da sombra. Numa parede
 * fechada, cujos lados projetam para lados diferentes, isso acontecia sempre, e
 * era o que fazia a sombra não ter nada a ver com o formato.
 *
 * Quase sempre são quatro pontos -- a faixa de um segmento. O teto de uma
 * parede fechada entra aqui com o contorno INTEIRO, e pela mesma razão: ele se
 * soma às faixas no mesmo caminho, e um sentido trocado ali abriria justamente
 * o furo que ele veio tapar.
 */
function poligonoOrientado(pontos: { x: number; y: number }[]): string {
  // Área com sinal: negativa quer dizer que este saiu ao contrário dos outros,
  // e basta lê-lo de trás para frente.
  let area = 0;
  for (let i = 0; i < pontos.length; i += 1) {
    const atual = pontos[i]!;
    const proximo = pontos[(i + 1) % pontos.length]!;
    area += atual.x * proximo.y - proximo.x * atual.y;
  }

  const ordenados = area < 0 ? [...pontos].reverse() : pontos;

  return `M${ordenados
    .map((ponto) => `${arredondar(ponto.x)},${arredondar(ponto.y)}`)
    .join("L")}Z`;
}

/**
 * A faixa que um segmento joga no chão sob o sol.
 *
 * Não há projeção que se abre: o sol está no infinito, e os dois raios são
 * PARALELOS. A sombra é o próprio segmento, copiado e empurrado pela altura da
 * parede.
 */
function umbraAoSol(segmento: Segmento, topo: Vec): string {
  return poligonoOrientado([
    { x: segmento.x1, y: segmento.y1 },
    { x: segmento.x1 + topo.x, y: segmento.y1 + topo.y },
    { x: segmento.x2 + topo.x, y: segmento.y2 + topo.y },
    { x: segmento.x2, y: segmento.y2 },
  ]);
}

/**
 * Todas as faixas do sol num caminho SÓ.
 *
 * Um caminho e não um por parede porque sombras que se cruzam não podem
 * escurecer duas vezes: no mesmo `path`, com `fill-rule` padrão, a união é uma
 * figura só, e o canto onde duas paredes se encontram fica com a mesma cor do
 * meio do corredor. Em elementos separados, ele ficaria preto.
 *
 * Cada parede joga a sua na medida da PRÓPRIA altura: mureta de jardim e torre
 * de vigia lado a lado deitam sombras diferentes, que é o que faz um mapa ter
 * relevo. Ver `altura` em `Parede`.
 */
export function umbrasDoSol(paredes: Parede[], sol: Sol): string {
  if (sol.comprimento === 0) return "";

  const angulo = sol.angulo * GRAU;
  const cos = Math.cos(angulo);
  const sen = Math.sin(angulo);
  const aoSol = { x: cos, y: sen };

  const faixas: string[] = [];

  for (const parede of paredes) {
    const alcance = sol.comprimento * alturaDaParede(parede);
    const topo = {
      x: arredondar(cos * alcance),
      y: arredondar(sen * alcance),
    };

    for (const segmento of segmentosQueProjetam(parede, aoSol)) {
      faixas.push(umbraAoSol(segmento, topo));
    }
  }

  return faixas.join("");
}

/**
 * A caixa que uma umbra ocupa, em coordenadas de cena, já presa ao plano.
 *
 * Existe por medida, e não por elegância: o SVG que pinta as umbras
 * re-rasteriza a cada quadro em que a câmera anda, e um SVG do tamanho do plano
 * são 2,07 milhões de pixels por quadro mesmo quando a sombra ocupa um canto.
 * No cenário `mestre-camera` da webview, com 40 itens e 40 paredes, o plano
 * inteiro dava 49,2 fps contra 59,4 sem sombra nenhuma.
 *
 * Presa ao plano porque nada pode transbordar dele -- é a regra que já derrubou
 * o Mestre três vezes (`debug-do-palco` §3). O corte também é o que mantém o
 * raster pequeno quando as paredes estão todas num canto do mapa.
 */
export type CaixaDaUmbra = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function presaAoPlano(
  x: number,
  y: number,
  direita: number,
  baixo: number,
): CaixaDaUmbra | null {
  const x1 = Math.max(0, Math.floor(x));
  const y1 = Math.max(0, Math.floor(y));
  const x2 = Math.min(SCENE_WIDTH, Math.ceil(direita));
  const y2 = Math.min(SCENE_HEIGHT, Math.ceil(baixo));

  if (x2 <= x1 || y2 <= y1) return null;

  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/**
 * A união de duas caixas, ou a que existir. `null` quando nenhuma existe.
 *
 * Serve ao SVG das umbras, que é UM só: quatro elementos separados, cada um
 * com a sua caixa, mediram PIOR que um do tamanho do plano -- 46,5 fps contra
 * 49,2 --, porque cada SVG é uma camada a compor. Um só, do tamanho do que de
 * fato pinta, é o que junta as duas economias.
 */
export function uniaoDasCaixas(
  a: CaixaDaUmbra | null,
  b: CaixaDaUmbra | null,
): CaixaDaUmbra | null {
  if (!a) return b;
  if (!b) return a;

  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);

  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/**
 * A caixa das faixas do sol: as paredes, mais o quanto a sombra delas anda.
 */
export function caixaDoSol(paredes: Parede[], sol: Sol): CaixaDaUmbra | null {
  if (paredes.length === 0) return null;

  let esquerda = Infinity;
  let cima = Infinity;
  let direita = -Infinity;
  let baixo = -Infinity;

  for (const parede of paredes) {
    // A caixa girada pode passar da caixa declarada; a diagonal cobre qualquer
    // giro sem uma conta de canto por parede.
    const folga = Math.hypot(parede.width, parede.height) / 2;
    const cx = parede.x + parede.width / 2;
    const cy = parede.y + parede.height / 2;

    esquerda = Math.min(esquerda, cx - folga);
    cima = Math.min(cima, cy - folga);
    direita = Math.max(direita, cx + folga);
    baixo = Math.max(baixo, cy + folga);
  }

  const angulo = sol.angulo * GRAU;
  // A parede mais ALTA do mapa decide até onde a sombra pode chegar, e a caixa
  // tem de caber a maior delas.
  const maisAlta = Math.max(...paredes.map(alturaDaParede));
  const alcance = sol.comprimento * maisAlta;
  const dx = Math.cos(angulo) * alcance;
  const dy = Math.sin(angulo) * alcance;

  return presaAoPlano(
    Math.min(esquerda, esquerda + dx),
    Math.min(cima, cima + dy),
    Math.max(direita, direita + dx),
    Math.max(baixo, baixo + dy),
  );
}
