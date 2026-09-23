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
 * - **A da PAREDE** -- o vulto que o segmento joga atrás de si. Essa é
 *   geometria de verdade, e é barata do mesmo jeito: duas pontas, dois raios
 *   saindo da luz, um quadrilátero. Nada de varrer pixel, nada de varrer
 *   ângulo.
 *
 * Tudo aqui é função pura sobre números -- o componente só pinta o que sai
 * daqui. É o que torna a sombra testável sem tela, que é o único jeito de um
 * bug de geometria aparecer antes de alguém olhar o mapa.
 */

import { paraCena, pontosNaCaixa } from "@/lib/geometry/area-escondida";
import type { Vec } from "@/lib/geometry/transform";
import type { CanvasItem, Luz, Parede, Sol } from "@/types/scene";
import { FORCA_DA_SOMBRA, SCENE_HEIGHT, SCENE_WIDTH } from "@/types/scene";

/** O que a conta precisa saber de um item. O resto -- arquivo, z -- não entra. */
export type CaixaDaFigura = Pick<
  CanvasItem,
  "x" | "y" | "width" | "height" | "rotation"
>;

/**
 * O quanto a sombra de uma parede passa da borda do alcance da luz.
 *
 * Quase nada, e isso é medida e não estética: quem apaga a sombra é o degradê
 * do preenchimento, que chega a zero exatamente no raio. Cada ponto além dele é
 * pixel transparente que o motor rasteriza à toa, e a área cresce com o
 * QUADRADO da folga -- com 1,6 eram dois pontos e meio de área pintada para
 * cada ponto que aparece. A folga que sobra é só para o quadrilátero não acabar
 * em cima da linha em que o degradê zera.
 */
const FOLGA_DA_UMBRA = 1.02;

/** Menor e maior comprimento da sombra sob uma luz pontual, perto e longe dela. */
const COMPRIMENTO_PERTO = 0.18;
const COMPRIMENTO_LONGE = 0.6;

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
  };
}

/**
 * A sombra de uma figura: uma MANCHA no chão, e não a silhueta do arquivo.
 *
 * Esta foi a decisão cara do arquivo, e ela veio da bancada. Duas versões
 * anteriores desenhavam a figura de verdade, e as duas custaram quadro no motor
 * em que o aplicativo roda -- medido em `scripts/perf/webview.py`, cenário
 * `mestre-camera`, 40 itens, WebKitGTK 2.52.5, três corridas:
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
 * pinta como pinta qualquer caixa.
 *
 * E ela não é um consolo: num mapa visto de CIMA, a sombra de um token é a
 * pegada dele deslocada, e a pegada de um token é redonda. A silhueta só teria
 * razão se a mesa visse a figura de lado.
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
 * Quantas manchas uma figura acumula, no máximo. Uma: a da fonte mais forte.
 *
 * O número saiu da bancada, não do gosto. Cada mancha é uma caixa com degradê a
 * pintar, e é ela -- não o SVG das paredes -- o que custa quando a câmera anda:
 * no cenário `mestre-camera` da webview, 40 itens, três luzes e nenhuma parede,
 * duas manchas por figura (80 caixas) davam 45,7 fps contra 59,4 sem sombra
 * nenhuma. Com uma, o custo para de crescer com o número de luzes -- quarenta
 * figuras são quarenta manchas, haja uma tocha ou cinco.
 *
 * E o desenho não perde quase nada: duas sombras moles sob o mesmo token se
 * somam num cinza sem forma, que a mesa lê como sujeira no mapa e não como duas
 * fontes de luz. A que vale é a mais forte, que é justamente a que se escolhe.
 */
const SOMBRAS_POR_FIGURA = 1;

/**
 * As manchas que esta figura deita: a do sol e a das luzes que a alcançam, da
 * mais forte para a mais fraca. Vazio quando não há nenhuma.
 */
export function manchasDaFigura(
  item: CaixaDaFigura,
  sol: Sol | undefined,
  luzes: Luz[],
): ManchaDaSombra[] {
  const todas: FiltroDaSombra[] = [];

  if (sol) todas.push(sombraDoSol(item, sol));

  for (const luz of luzes) {
    const sombra = sombraDaLuz(item, luz);
    if (sombra) todas.push(sombra);
  }

  if (todas.length === 0) return [];

  const centroX = item.x + item.width / 2;
  const centroY = item.y + item.height / 2;

  return todas
    .sort((a, b) => b.forca - a.forca)
    .slice(0, SOMBRAS_POR_FIGURA)
    .map((sombra) => ({
      x: arredondar(centroX + sombra.dx),
      y: arredondar(centroY + sombra.dy),
      largura: arredondar(item.width * ESTREITAMENTO),
      altura: arredondar(item.height * ACHATAMENTO),
      forca: sombra.forca,
    }));
}

/** O deslocamento de uma sombra, antes de virar mancha. */
export type FiltroDaSombra = {
  /** Deslocamento a partir do centro da figura, em unidades de cena. */
  dx: number;
  dy: number;
  forca: number;
};

/**
 * A sombra que o sol joga desta figura.
 *
 * Nunca devolve nada: o sol alcança a cena inteira, e é essa a diferença dele
 * para a tocha. Duas figuras em cantos opostos do mapa têm sombras PARALELAS.
 */
export function sombraDoSol(item: CaixaDaFigura, sol: Sol): FiltroDaSombra {
  return projetarFigura(item, sol.angulo, sol.comprimento, sol.forca);
}

/** O centro da caixa, que é de onde a luz enxerga a figura. */
function centroDa(item: CaixaDaFigura): { x: number; y: number } {
  return { x: item.x + item.width / 2, y: item.y + item.height / 2 };
}

/**
 * A sombra que esta luz joga desta figura, ou nada se a figura está fora do
 * alcance dela.
 *
 * Quanto mais longe da luz, mais comprida e mais fraca -- as duas coisas ao
 * mesmo tempo, que é o que faz a sombra parecer que acaba em vez de ser
 * cortada. E é o que responde à pergunta de sempre numa masmorra: de que lado
 * está a tocha.
 */
export function sombraDaLuz(
  item: CaixaDaFigura,
  luz: Luz,
): FiltroDaSombra | null {
  const centro = centroDa(item);
  const dx = centro.x - luz.x;
  const dy = centro.y - luz.y;
  const distancia = Math.hypot(dx, dy);

  if (distancia === 0 || distancia >= luz.raio) return null;

  const proporcao = distancia / luz.raio;
  const comprimento =
    COMPRIMENTO_PERTO + proporcao * (COMPRIMENTO_LONGE - COMPRIMENTO_PERTO);
  const forca = (luz.forca ?? FORCA_DA_SOMBRA) * (1 - proporcao);
  const angulo = Math.atan2(dy, dx) / GRAU;

  return projetarFigura(item, angulo, comprimento, forca);
}

/**
 * A altura que uma parede FINGE ter, para o sol saber o quanto dela cai no
 * chão.
 *
 * A parede não tem altura nenhuma -- ela é a informação "aqui a luz para", e
 * não um tijolo. Mas o sol precisa de um número para saber quanto de sombra
 * deitar, e o único que não obriga o mestre a responder mais uma pergunta é
 * este: a altura de um token, mais ou menos o lado de um quadrado de grade. Uma
 * parede de dois metros, que é o que quase toda parede de mapa é.
 */
const ALTURA_FINGIDA_DA_PAREDE = 110;

/** Em quantos lados uma elipse é quebrada. Ver `verticesDaParede`. */
const LADOS_DA_ELIPSE = 24;

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
    // exigiria uma conta de tangente por luz, e vinte e quatro lados já leem
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

/** Todos os segmentos de todas as paredes, que é o que a sombra consome. */
function segmentosDe(paredes: Parede[]): Segmento[] {
  return paredes.flatMap(segmentosDaParede);
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
 * nunca a desenha -- ver `LuzLayer`.
 */
export function corpoDaParede(parede: FormaDaParede): string {
  if (parede.formato !== "linha") return contornoDaParede(parede);

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

      const cantos: [number, number][] = [
        [segmento.x1 + nx, segmento.y1 + ny],
        [segmento.x2 + nx, segmento.y2 + ny],
        [segmento.x2 - nx, segmento.y2 - ny],
        [segmento.x1 - nx, segmento.y1 - ny],
      ];

      return `M${cantos.map(([x, y]) => `${arredondar(x)},${arredondar(y)}`).join("L")}Z`;
    })
    .join("");
}

/**
 * Um quadrilátero como caminho SVG, sempre no MESMO sentido.
 *
 * O sentido decide se duas umbras que se cruzam se somam ou se anulam: a regra
 * padrão de preenchimento conta voltas com sinal, e um quadrilátero horário
 * sobre outro anti-horário dá zero -- um BURACO no meio da sombra. Numa parede
 * fechada, cujos lados projetam para lados diferentes, isso acontecia sempre, e
 * era o que fazia a sombra não ter nada a ver com o formato.
 */
function quadrilatero(pontos: { x: number; y: number }[]): string {
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
 * Sem luz pontual não há projeção que se abre: o sol está no infinito, e os
 * dois raios são PARALELOS. A sombra é o próprio segmento, copiado e empurrado.
 */
function umbraAoSol(segmento: Segmento, dx: number, dy: number): string {
  return quadrilatero([
    { x: segmento.x1, y: segmento.y1 },
    { x: segmento.x1 + dx, y: segmento.y1 + dy },
    { x: segmento.x2 + dx, y: segmento.y2 + dy },
    { x: segmento.x2, y: segmento.y2 },
  ]);
}

/** Todas as faixas do sol num caminho só. Ver `umbrasDaLuz`. */
export function umbrasDoSol(paredes: Parede[], sol: Sol): string {
  if (sol.comprimento === 0) return "";

  const angulo = sol.angulo * GRAU;
  const alcance = sol.comprimento * ALTURA_FINGIDA_DA_PAREDE;
  const dx = arredondar(Math.cos(angulo) * alcance);
  const dy = arredondar(Math.sin(angulo) * alcance);

  return segmentosDe(paredes)
    .map((segmento) => umbraAoSol(segmento, dx, dy))
    .join("");
}

/**
 * A caixa que uma umbra ocupa, em coordenadas de cena, já presa ao plano.
 *
 * Existe por medida, e não por elegância: o SVG que pinta as umbras
 * re-rasteriza a cada quadro em que a câmera anda, e um SVG do tamanho do plano
 * são 2,07 milhões de pixels por quadro mesmo quando a sombra ocupa um canto.
 * No cenário `mestre-camera` da webview, com 40 itens, 3 luzes e 40 paredes, o
 * plano inteiro dava 49,2 fps contra 59,4 sem sombra nenhuma.
 *
 * Presa ao plano porque nada pode transbordar dele -- é a regra que já derrubou
 * o Mestre três vezes (`debug-do-palco` §3). O corte também é o que mantém o
 * raster pequeno quando a luz está na beirada do mapa.
 */
export type CaixaDaUmbra = { x: number; y: number; width: number; height: number };

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
 * A caixa da sombra de uma luz: o alcance dela, e nada além.
 *
 * O quadrilátero da umbra mal passa do raio (ver `FOLGA_DA_UMBRA`), e o degradê
 * já o apagou na borda -- o que passa do raio não pinta nada, e não precisa de
 * pixel reservado.
 */
export function caixaDaLuz(luz: Luz): CaixaDaUmbra | null {
  return presaAoPlano(
    luz.x - luz.raio,
    luz.y - luz.raio,
    luz.x + luz.raio,
    luz.y + luz.raio,
  );
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
  const alcance = sol.comprimento * ALTURA_FINGIDA_DA_PAREDE;
  const dx = Math.cos(angulo) * alcance;
  const dy = Math.sin(angulo) * alcance;

  return presaAoPlano(
    Math.min(esquerda, esquerda + dx),
    Math.min(cima, cima + dy),
    Math.max(direita, direita + dx),
    Math.max(baixo, baixo + dy),
  );
}

/**
 * O pedaço de um segmento que cai DENTRO do alcance da luz. `null` se nenhum.
 *
 * Existe porque projetar uma ponta que está fora do círculo é o que fazia a
 * sombra não bater com a parede. A conta empurra cada ponta para longe da luz
 * até a borda do alcance; numa ponta que já passou dessa borda, "até a borda" é
 * para TRÁS, e o quadrilátero saía virado do avesso -- um vulto atravessando a
 * própria parede, apontando para a luz. A versão anterior tentava contornar
 * isso largando a ponta de fora onde estava e desenhando um triângulo, o que
 * dava uma figura que não é a sombra de nada.
 *
 * Recortando antes, as duas pontas estão sempre dentro, e daí em diante a
 * projeção é a mesma conta simples para todos os casos.
 */
function recortarNoCirculo(segmento: Segmento, luz: Luz): Segmento | null {
  const dx = segmento.x2 - segmento.x1;
  const dy = segmento.y2 - segmento.y1;
  const fx = segmento.x1 - luz.x;
  const fy = segmento.y1 - luz.y;

  // |A + t·d - L|² = r², em t.
  const a = dx * dx + dy * dy;
  if (a === 0) return null;

  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - luz.raio * luz.raio;
  const delta = b * b - 4 * a * c;

  // Sem raiz real: a reta inteira passa longe do círculo.
  if (delta < 0) return null;

  const raiz = Math.sqrt(delta);
  const entrada = Math.max(0, (-b - raiz) / (2 * a));
  const saida = Math.min(1, (-b + raiz) / (2 * a));

  // O trecho aceso é vazio: o segmento está todo fora do alcance.
  if (saida <= entrada) return null;

  return {
    x1: segmento.x1 + dx * entrada,
    y1: segmento.y1 + dy * entrada,
    x2: segmento.x1 + dx * saida,
    y2: segmento.y1 + dy * saida,
  };
}

/**
 * O vulto que um segmento joga para trás, visto desta luz. `null` quando ele
 * não recebe luz nenhuma.
 *
 * Quatro pontos: as duas pontas do trecho ACESO e as duas projeções delas, cada
 * uma empurrada para longe da luz na reta que sai dela. Nenhum ângulo é
 * varrido, e nenhum pixel é lido -- um segmento custa duas raízes quadradas.
 *
 * O quadrilátero passa da borda do alcance de propósito. Ver `FOLGA_DA_UMBRA`,
 * e `quadrilatero` para o porquê de todos saírem no mesmo sentido.
 */
export function umbraDoSegmento(segmento: Segmento, luz: Luz): string | null {
  const aceso = recortarNoCirculo(segmento, luz);
  if (!aceso) return null;

  const raio = (x: number, y: number) => {
    const dx = x - luz.x;
    const dy = y - luz.y;
    const distancia = Math.hypot(dx, dy);
    // A luz exatamente em cima da ponta: não há direção para onde empurrar.
    if (distancia === 0) return null;
    return { dx: dx / distancia, dy: dy / distancia, distancia };
  };

  const raio1 = raio(aceso.x1, aceso.y1);
  const raio2 = raio(aceso.x2, aceso.y2);
  if (!raio1 || !raio2) return null;

  /**
   * A borda longe da umbra é uma CORDA, e corda entra no círculo.
   *
   * Empurrar as duas pontas até a mesma distância deixa o meio da borda mais
   * perto da luz do que as pontas -- e quanto mais aberto o ângulo que o
   * segmento abre visto da luz, maior o afundamento. Numa parede perto da
   * tocha, isso comia a sombra bem no meio dela. Dividir pelo cosseno da metade
   * do ângulo empurra a corda para fora na medida exata, sem pintar área à toa
   * nos segmentos estreitos, que são a maioria.
   */
  const cosseno = raio1.dx * raio2.dx + raio1.dy * raio2.dy;
  const metade = Math.sqrt(Math.max(0, (1 + cosseno) / 2));
  const alcance = (luz.raio * FOLGA_DA_UMBRA) / Math.max(metade, 0.25);

  const projetar = (
    x: number,
    y: number,
    direcao: { dx: number; dy: number; distancia: number },
  ) => {
    // Aditivo, e não "até o raio": depois do recorte a ponta está dentro, então
    // a sobra é positiva e a projeção nunca volta para trás.
    const sobra = Math.max(0, alcance - direcao.distancia);
    return { x: x + direcao.dx * sobra, y: y + direcao.dy * sobra };
  };

  const longe1 = projetar(aceso.x1, aceso.y1, raio1);
  const longe2 = projetar(aceso.x2, aceso.y2, raio2);

  return quadrilatero([
    { x: aceso.x1, y: aceso.y1 },
    longe1,
    longe2,
    { x: aceso.x2, y: aceso.y2 },
  ]);
}

/**
 * Todas as umbras desta luz num caminho SÓ.
 *
 * Um caminho e não um por parede porque sombras que se cruzam não podem
 * escurecer duas vezes: no mesmo `path`, com `fill-rule` padrão, a união é uma
 * figura só, e o canto onde duas paredes se encontram fica com a mesma cor do
 * meio do corredor. Em elementos separados, ele ficaria preto.
 */
export function umbrasDaLuz(paredes: Parede[], luz: Luz): string {
  return segmentosDe(paredes)
    .map((segmento) => umbraDoSegmento(segmento, luz))
    .filter((caminho) => caminho !== null)
    .join("");
}
