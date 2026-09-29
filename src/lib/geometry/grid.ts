import type { CanvasItem, Scene, SceneGrid } from "@/types/scene";

/**
 * Quantos metros vale um quadrado da grade.
 *
 * A convencao da mesa: um quadrado e um metro de lado, ou seja um metro
 * quadrado de chao. Constante e nao campo da cena porque a regra e do
 * APLICATIVO, nao de cada mapa -- e porque com ela fixa o mestre casa a grade
 * com o desenho do mapa e a medida sai certa de graca, em vez de ter de declarar
 * duas vezes a mesma coisa.
 *
 * Se um dia precisar virar campo -- pes por quadrado, ou dois metros --, e este
 * numero que sai daqui para dentro de `SceneGrid`, e as duas contas abaixo
 * passam a le-lo de la.
 */
export const METROS_POR_QUADRADO = 1;

/**
 * A distancia entre dois pontos da cena, em metros.
 *
 * Em linha reta, e nao contada em quadrados como algumas regras de mesa pedem:
 * a regua responde "quanto tem daqui ate ali", e quem joga com movimento por
 * quadrado le o numero e arredonda. Contar quadrados obrigaria a escolher entre
 * as tres formas de contar diagonal, o que e regra de sistema e nao de mapa.
 */
export function metrosEntre(
  de: { x: number; y: number },
  para: { x: number; y: number },
  grid: SceneGrid,
): number {
  return (Math.hypot(para.x - de.x, para.y - de.y) / grid.size) * METROS_POR_QUADRADO;
}

/** Formata para a etiqueta da regua: um decimal ate 10 m, inteiro acima. */
export function formatarMetros(metros: number): string {
  return metros < 10 ? `${metros.toFixed(1)} m` : `${Math.round(metros)} m`;
}

/**
 * O lado do quadrado como ele e DESENHADO.
 *
 * O mesmo minimo de `GridLayer`: abaixo de 8 a grade vira um borrao cinza, e
 * um valor acidental de 0 faria a conta de encaixe dividir por zero. Aqui e
 * la porque o encaixe TEM de cair sobre a linha que a mesa ve -- duas regras
 * diferentes deixariam o token grudado onde nao ha quadrado nenhum.
 */
export function passoDaGrade(grid: SceneGrid): number {
  return Math.max(8, grid.size);
}

/**
 * A grade a que os tokens se encaixam, ou nada.
 *
 * Nada quando a cena nao tem grade, e nada quando ela tem mas o ima esta
 * desligado -- desenhar o quadrado e obrigar a peca a ele sao duas decisoes:
 * mapa com grade so de referencia visual e comum, e forcar o encaixe nele
 * tiraria do mestre a posicao exata que ele escolheu.
 */
export function gradeDoEncaixe(scene: Pick<Scene, "grid">): SceneGrid | undefined {
  return scene.grid?.snap ? scene.grid : undefined;
}

type Ponto = { x: number; y: number };

/** A grade e de hexagonos, em qualquer das duas orientacoes. */
export function ehHexagonal(grid: Pick<SceneGrid, "forma">): boolean {
  return grid.forma === "hex-ponta" || grid.forma === "hex-lado";
}

/**
 * De quanto em quanto a grade se repete, em cada eixo.
 *
 * No quadrado e o lado nos dois. No hexagono com a ponta para cima e a
 * largura na horizontal e raiz de tres larguras na vertical -- duas fileiras,
 * porque a segunda nasce meia casa para o lado e so a terceira cai sobre a
 * primeira. Deitado, o mesmo com os eixos trocados.
 *
 * E o alcance do deslocamento: arrastar a grade um periodo inteiro e o mesmo
 * que nao arrastar, entao a regua do controle para ali.
 */
export function periodoDaGrade(grid: SceneGrid): Ponto {
  const passo = passoDaGrade(grid);
  if (!ehHexagonal(grid)) return { x: passo, y: passo };

  const fileiras = Math.sqrt(3) * passo;

  return grid.forma === "hex-lado"
    ? { x: fileiras, y: passo }
    : { x: passo, y: fileiras };
}

/**
 * O centro da casa que contem o ponto.
 *
 * E a unica pergunta que muda de resposta com a forma da casa: o encaixe e o
 * realce so precisam dela, e por isso o mestre, o celular e `destinoAceito`
 * seguem a mesma regra sem saber qual forma a grade tem.
 */
export function centroDaCasa(ponto: Ponto, grid: SceneGrid): Ponto {
  const passo = passoDaGrade(grid);

  if (!ehHexagonal(grid)) {
    return {
      x: centroNoEixo(ponto.x, grid.offsetX, passo),
      y: centroNoEixo(ponto.y, grid.offsetY, passo),
    };
  }

  const hex = emPe(grid);
  const origem = origemDoHex(grid);
  const { x, y } = hex.trocar(ponto);

  // A conversao de pixel para coordenada axial, e o arredondamento pelo cubo:
  // arredondar as duas axiais sozinhas erra perto dos cantos, onde tres casas
  // se encontram e a mais proxima nao e a de nenhum dos dois arredondamentos.
  const u = x - origem.x;
  const v = y - origem.y;
  const casa = arredondarNoCubo(
    ((Math.sqrt(3) / 3) * u - v / 3) / hex.raio,
    ((2 / 3) * v) / hex.raio,
  );

  return hex.trocar(centroDoHex(casa.q, casa.r, origem, passo, hex.raio));
}

/**
 * O canto do item com o CENTRO dele no meio da casa mais proxima.
 *
 * Pelo centro, e nao pelo canto: `CanvasItem` guarda o canto, mas quem joga
 * poe a peca no MEIO da casa. Arredondar o canto so acerta quando o token tem
 * exatamente o tamanho do quadrado -- um token de 64 numa grade de 96 ficaria
 * encostado no canto de cima da casa, para sempre e em todas as telas.
 *
 * Nao arredonda o resultado: a mesma conta roda no celular e na janela do
 * mestre, e um arredondamento a mais de um lado faria o mestre recusar o
 * destino que o proprio celular calculou. Ver `destinoAceito`.
 */
export function encaixarNaGrade(
  item: Pick<CanvasItem, "width" | "height">,
  x: number,
  y: number,
  grid: SceneGrid,
): Ponto {
  const centro = centroDaCasa(
    { x: x + item.width / 2, y: y + item.height / 2 },
    grid,
  );

  return { x: centro.x - item.width / 2, y: centro.y - item.height / 2 };
}

/**
 * Um eixo do quadrado.
 *
 * O deslocamento cru, e nao o resto da divisao que `GridLayer` usa para pintar:
 * os dois descrevem a MESMA rede de linhas -- deslocar um quadrado inteiro e o
 * mesmo que nao deslocar --, e o resto so existe la porque o padrao do SVG nao
 * aceita origem negativa.
 */
function centroNoEixo(ponto: number, deslocamento: number, passo: number): number {
  const casa = Math.floor((ponto - deslocamento) / passo);

  return deslocamento + (casa + 0.5) * passo;
}

/**
 * O hexagono visto sempre com a ponta para cima.
 *
 * O deitado e o em pe refletido na diagonal: trocar x por y leva um no outro,
 * e com isso a conta so precisa ser escrita uma vez. `trocar` vai e volta --
 * aplicar duas vezes devolve o ponto.
 */
function emPe(grid: SceneGrid): { raio: number; trocar: (p: Ponto) => Ponto } {
  const deitado = grid.forma === "hex-lado";

  return {
    // O raio do vertice: a largura de lado a lado e raiz de tres raios.
    raio: passoDaGrade(grid) / Math.sqrt(3),
    trocar: deitado ? (p) => ({ x: p.y, y: p.x }) : (p) => p,
  };
}

/**
 * O centro da casa zero, na orientacao em pe.
 *
 * Com a caixa da casa zero encostada no deslocamento, como o quadrado zero:
 * sem deslocamento, o primeiro hexagono toca o canto do mapa em vez de nascer
 * cortado ao meio por ele.
 */
function origemDoHex(grid: SceneGrid): Ponto {
  const hex = emPe(grid);
  const deslocamento = hex.trocar({ x: grid.offsetX, y: grid.offsetY });

  return {
    x: deslocamento.x + passoDaGrade(grid) / 2,
    y: deslocamento.y + hex.raio,
  };
}

function centroDoHex(
  q: number,
  r: number,
  origem: Ponto,
  passo: number,
  raio: number,
): Ponto {
  return { x: origem.x + passo * (q + r / 2), y: origem.y + 1.5 * raio * r };
}

/**
 * A casa inteira mais proxima de uma coordenada axial quebrada.
 *
 * As tres coordenadas do cubo somam zero; arredondadas sozinhas, podem deixar
 * de somar, e a que mais se afastou do valor quebrado e refeita a partir das
 * outras duas.
 */
function arredondarNoCubo(q: number, r: number): { q: number; r: number } {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);

  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);

  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;

  return { q: rq, r: rr };
}

/** Os vertices de um hexagono em pe, no sentido do relogio a partir da ponta. */
function verticesDoHex(centro: Ponto, passo: number, raio: number): Ponto[] {
  const meio = passo / 2;

  return [
    { x: centro.x, y: centro.y - raio },
    { x: centro.x + meio, y: centro.y - raio / 2 },
    { x: centro.x + meio, y: centro.y + raio / 2 },
    { x: centro.x, y: centro.y + raio },
    { x: centro.x - meio, y: centro.y + raio / 2 },
    { x: centro.x - meio, y: centro.y - raio / 2 },
  ];
}

/**
 * A casa em que o item ESTA -- a que contem o centro dele.
 *
 * Pelo centro, como o encaixe: um token maior que a casa cobre varias, e a que
 * conta e aquela em que a peca esta plantada. Com o ima ligado a resposta e a
 * casa em que o encaixe a pos; com ele desligado, ainda e a casa que qualquer
 * pessoa apontaria olhando o mapa.
 *
 * Devolve o centro, que identifica a casa, e os vertices, que e o que um
 * poligono precisa -- quatro ou seis, conforme a forma. Ver `GridLayer`.
 */
export function casaDoItem(
  item: Pick<CanvasItem, "x" | "y" | "width" | "height">,
  grid: SceneGrid,
): { centro: Ponto; vertices: Ponto[] } {
  const centro = centroDaCasa(
    { x: item.x + item.width / 2, y: item.y + item.height / 2 },
    grid,
  );
  const passo = passoDaGrade(grid);

  if (!ehHexagonal(grid)) {
    const x = centro.x - passo / 2;
    const y = centro.y - passo / 2;

    return {
      centro,
      vertices: [
        { x, y },
        { x: x + passo, y },
        { x: x + passo, y: y + passo },
        { x, y: y + passo },
      ],
    };
  }

  const hex = emPe(grid);

  return {
    centro,
    vertices: verticesDoHex(hex.trocar(centro), passo, hex.raio).map(
      hex.trocar,
    ),
  };
}

/**
 * O ladrilho que o padrao SVG repete para desenhar a grade de hexagonos.
 *
 * Um periodo de cada lado, com o canto no deslocamento, e o caminho de TODOS
 * os hexagonos que encostam nele -- nao so das seis arestas que o periodo
 * tem de seu. O padrao recorta o ladrilho, e a aresta que passa na beira dele
 * perderia meia grossura de cada lado; a do vizinho so devolve essa metade se
 * o vizinho tambem a desenhar. Os vertices sobre a beira pediriam o mesmo.
 *
 * Arestas repetidas no mesmo caminho nao escurecem: o traco de um `path` e
 * pintado uma vez, pela uniao, e a linha translucida sai da mesma tinta em
 * todo lugar.
 *
 * `null` na grade quadrada, que se desenha com dois retangulos. Ver
 * `GridLayer`.
 */
export function ladrilhoHex(
  grid: SceneGrid,
): { x: number; y: number; width: number; height: number; caminho: string } | null {
  if (!ehHexagonal(grid)) return null;

  const passo = passoDaGrade(grid);
  const hex = emPe(grid);
  const raio = hex.raio;
  const periodo = periodoDaGrade(grid);

  // Na orientacao em pe, com a casa zero de caixa no canto do ladrilho: ela,
  // as duas vizinhas de cima e as tres de baixo, que e tudo o que toca um
  // ladrilho de uma largura por tres raios.
  const centros: Ponto[] = [
    { x: 0, y: -raio / 2 },
    { x: passo, y: -raio / 2 },
    { x: passo / 2, y: raio },
    { x: 0, y: 2.5 * raio },
    { x: passo, y: 2.5 * raio },
    { x: passo / 2, y: 4 * raio },
  ];

  const caminho = centros
    .map((centro) => {
      const [primeiro, ...resto] = verticesDoHex(centro, passo, raio).map(
        hex.trocar,
      );
      return `M${emTexto(primeiro)}${resto.map((v) => `L${emTexto(v)}`).join("")}Z`;
    })
    .join("");

  return {
    x: restoPositivo(grid.offsetX, periodo.x),
    y: restoPositivo(grid.offsetY, periodo.y),
    width: periodo.x,
    height: periodo.y,
    caminho,
  };
}

/** Tres casas decimais: o suficiente a 500% de zoom, e um caminho que se le. */
function emTexto(p: Ponto | undefined): string {
  return p ? `${+p.x.toFixed(3)} ${+p.y.toFixed(3)}` : "";
}

/**
 * O resto sempre positivo: o padrao do SVG nao aceita origem negativa, e o `%`
 * do JavaScript devolve o sinal do dividendo.
 */
function restoPositivo(valor: number, periodo: number): number {
  return ((valor % periodo) + periodo) % periodo;
}
