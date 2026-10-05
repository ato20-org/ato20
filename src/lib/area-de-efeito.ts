import { EFEITOS_DE_FABRICA, type LuzResolvida } from "@/lib/efeitos";
import { paraCaixa, paraCena, pontosNaCaixa } from "@/lib/geometry/area-escondida";
import {
  RAIO_MAXIMO_DO_EFEITO,
  limitarIntensidade,
  raioIntensoDe,
  sementeDaLuz,
  type FonteDeLuz,
} from "@/lib/geometry/luz";
import type { Vec } from "@/lib/geometry/transform";
import type { ParticulasResolvidas, Trajetoria } from "@/lib/particulas";
import type { DefinicaoDeEfeito } from "@/types/efeito";
import {
  DEFAULT_GRID,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type AreaDeEfeito,
  type SceneGrid,
} from "@/types/scene";

/**
 * A ÁREA de efeito: o chão em chamas, dividido em segmentos.
 *
 * Contas puras, sem tela: quais casas pegam fogo, onde fica cada foco, a
 * caixa do desenho e as luzes. Quem desenha é `AreaDeEfeitoLayer`, e quem
 * assa a folha é o forno (`assarArea`).
 *
 * ## Por que segmentos
 *
 * O fogo da figura é UMA arte esticada na caixa dela. Numa área isso vira um
 * fogo do tamanho de uma sala, com línguas de dois metros -- e a mesma área
 * pequena e grande teria fogo de tamanho diferente. Aqui a área é dividida em
 * casas FÍSICAS do mapa, as da grade, e cada casa é um foco do tamanho dela: a
 * área maior tem mais focos, e o fogo tem sempre a mesma escala do mapa.
 *
 * ## Por que de pé, e não girado
 *
 * O giro da área vale para o CONTORNO -- quais casas entram --, e não para o
 * fogo: a chama sobe para cima da tela numa área inclinada também. O desenho
 * fica numa caixa sem giro, e é ela que vai para o plano.
 */

/** Os efeitos que servem a uma área: os da fábrica que declaram `area`. */
export const EFEITOS_DE_AREA: ReadonlyArray<DefinicaoDeEfeito> = EFEITOS_DE_FABRICA.filter(
  (efeito) => efeito.area && efeito.externo,
);

/** O foco, em vezes o segmento, quando o efeito não diz. */
export const ESCALA_DO_FOCO = 1.5;

/**
 * Quantos segmentos uma área desenha, no máximo. Passando disso o segmento
 * DOBRA de lado -- a sala inteira em chamas continua um fogo, com focos
 * maiores. É o que prende o forno: cada foco é um `drawImage` por quadro.
 */
export const MAX_SEGMENTOS = 600;

/** Pixels por segmento na folha, no máximo. O fogo é borrado; mais seria memória. */
const PIXELS_POR_SEGMENTO = 64;

/**
 * O lado maior de UM quadro da folha, em pixels. Dezesseis quadros desse
 * tamanho são 16 MB decodificados -- o mesmo que o nível 512 do fogo de uma
 * figura, por área.
 */
const LADO_MAXIMO_DO_QUADRO = 512;

/** O lado de uma casa, em unidades de cena: a da grade, ou a da grade padrão. */
export function ladoDaCasa(grid: SceneGrid | undefined): number {
  const lado = grid?.size;
  return typeof lado === "number" && Number.isFinite(lado) && lado >= 8 ? lado : DEFAULT_GRID.size;
}

/** Quantos segmentos por lado de casa o efeito pede, inteiro de 1 a 4. */
export function divisoesDoEfeito(definicao: DefinicaoDeEfeito | undefined): number {
  const divisoes = definicao?.area?.divisoes;
  return typeof divisoes === "number" && Number.isFinite(divisoes)
    ? Math.min(4, Math.max(1, Math.round(divisoes)))
    : 1;
}

/** O mínimo de segmentos no menor lado que o efeito pede. Zero = sem mínimo. */
export function densidadeDoEfeito(definicao: DefinicaoDeEfeito | undefined): number {
  const densidade = definicao?.area?.densidade;
  return typeof densidade === "number" && Number.isFinite(densidade) && densidade > 0
    ? Math.min(16, densidade)
    : 0;
}

/** Quantas vezes a casa se divide, no máximo, para a área pequena caber. */
const MAX_DIVISOES = 8;

/**
 * Em quantos segmentos a casa se divide para ESTA área: as `divisoes` do
 * efeito, ou mais, se a área é pequena demais para a `densidade` dele. Sempre
 * inteiro, e por isso o segmento continua na grade.
 */
export function divisoesDaArea(
  area: AreaDeEfeito,
  grid: SceneGrid | undefined,
  divisoes = 1,
  densidade = 0,
): number {
  const menor = Math.min(area.width, area.height);
  const pela = densidade > 0 && menor > 0 ? Math.ceil((ladoDaCasa(grid) * densidade) / menor) : 1;
  return Math.min(MAX_DIVISOES, Math.max(divisoes, pela));
}

/** O lado de um segmento: a casa, dividida. */
export function ladoDoSegmento(grid: SceneGrid | undefined, divisoes = 1): number {
  return ladoDaCasa(grid) / divisoes;
}

/** O ponto de cena cai dentro da forma da área? Com o giro. */
export function dentroDaArea(area: AreaDeEfeito, ponto: Vec): boolean {
  const local = paraCaixa(area, ponto);
  const { width, height } = area;
  if (local.x < 0 || local.y < 0 || local.x > width || local.y > height) return false;

  const formato = area.formato ?? "retangulo";
  if (formato === "retangulo") return true;

  if (formato === "elipse") {
    const dx = (local.x - width / 2) / (width / 2);
    const dy = (local.y - height / 2) / (height / 2);
    return dx * dx + dy * dy <= 1;
  }

  return dentroDoPoligono(pontosNaCaixa(area, area.pontos ?? []), local);
}

/** Par-ímpar: o raio para a direita cruza a borda um número ímpar de vezes. */
function dentroDoPoligono(vertices: readonly Vec[], ponto: Vec): boolean {
  if (vertices.length < 3) return false;

  let dentro = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i]!;
    const b = vertices[j]!;
    if (
      a.y > ponto.y !== b.y > ponto.y &&
      ponto.x < ((b.x - a.x) * (ponto.y - a.y)) / (b.y - a.y) + a.x
    ) {
      dentro = !dentro;
    }
  }

  return dentro;
}

/** Um segmento: o canto de cima da casa, em cena, e a casa na grade. */
export type Segmento = { x: number; y: number; coluna: number; linha: number };

/** A caixa da área no chão, sem giro: os quatro cantos girados, e o que os cerca. */
function caixaGirada(area: AreaDeEfeito) {
  const cantos: Vec[] = [
    { x: 0, y: 0 },
    { x: area.width, y: 0 },
    { x: 0, y: area.height },
    { x: area.width, y: area.height },
  ].map((local) => {
    const rad = ((area.rotation ?? 0) * Math.PI) / 180;
    const cx = area.width / 2;
    const cy = area.height / 2;
    const dx = local.x - cx;
    const dy = local.y - cy;
    return {
      x: area.x + cx + dx * Math.cos(rad) - dy * Math.sin(rad),
      y: area.y + cy + dx * Math.sin(rad) + dy * Math.cos(rad),
    };
  });
  const xs = cantos.map((canto) => canto.x);
  const ys = cantos.map((canto) => canto.y);

  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/**
 * As casas que pegam fogo: as da grade cujo CENTRO cai dentro da forma, e
 * dentro do plano. Alinhadas à grade -- o deslocamento dela incluso --, para o
 * fogo cobrir as mesmas casas em que o mestre conta o movimento.
 *
 * Passando de `MAX_SEGMENTOS`, o lado dobra. Devolve o lado que valeu.
 */
export function segmentosDaArea(
  area: AreaDeEfeito,
  grid: SceneGrid | undefined,
  divisoes = 1,
  densidade = 0,
): { lado: number; segmentos: Segmento[] } {
  const ox = grid ? grid.offsetX : 0;
  const oy = grid ? grid.offsetY : 0;
  const caixa = caixaGirada(area);
  let lado = ladoDoSegmento(grid, divisoesDaArea(area, grid, divisoes, densidade));

  // Quantas casas a caixa cobre: se já passa do teto, o lado dobra antes de
  // percorrer qualquer uma.
  while (((caixa.x1 - caixa.x0) / lado + 1) * ((caixa.y1 - caixa.y0) / lado + 1) > MAX_SEGMENTOS * 4) {
    lado *= 2;
  }

  for (;;) {
    const segmentos: Segmento[] = [];
    const c0 = Math.floor((caixa.x0 - ox) / lado);
    const c1 = Math.ceil((caixa.x1 - ox) / lado);
    const l0 = Math.floor((caixa.y0 - oy) / lado);
    const l1 = Math.ceil((caixa.y1 - oy) / lado);

    for (let linha = l0; linha < l1; linha++) {
      for (let coluna = c0; coluna < c1; coluna++) {
        const x = ox + coluna * lado;
        const y = oy + linha * lado;
        const centro = { x: x + lado / 2, y: y + lado / 2 };
        if (centro.x < 0 || centro.y < 0 || centro.x > SCENE_WIDTH || centro.y > SCENE_HEIGHT) continue;
        if (dentroDaArea(area, centro)) segmentos.push({ x, y, coluna, linha });
      }
    }

    if (segmentos.length === 0) {
      // A área menor que um segmento não tem casa cujo centro caia nela. Ela
      // ganha UMA, centrada nela: pequena, mas arde -- e o fogo se encolhe ao
      // tamanho dela (ver `planoDaArea`).
      const centro = { x: area.x + area.width / 2, y: area.y + area.height / 2 };
      const noPlano =
        centro.x >= 0 && centro.y >= 0 && centro.x <= SCENE_WIDTH && centro.y <= SCENE_HEIGHT;
      return {
        lado,
        segmentos: noPlano
          ? [{ x: centro.x - lado / 2, y: centro.y - lado / 2, coluna: 0, linha: 0 }]
          : [],
      };
    }
    if (segmentos.length <= MAX_SEGMENTOS) return { lado, segmentos };
    lado *= 2;
  }
}

/** Um foco na folha: a caixa do sprite em pixels do quadro, e a fase dele. */
export type FocoNaFolha = { x: number; y: number; lado: number; fase: number };

/**
 * O plano do desenho de uma área: a caixa que vai para o palco, o tamanho de
 * um quadro da folha, e as três camadas nela -- a base, os focos do fogo e as
 * fagulhas.
 */
export type PlanoDaArea = {
  /** Em cena, sem giro, dentro do plano. É o `div` que toca a folha. */
  caixa: { x: number; y: number; width: number; height: number };
  /** O lado do segmento que valeu, em cena. */
  lado: number;
  segmentos: Segmento[];
  /** Um quadro da folha, em pixels. */
  quadro: { largura: number; altura: number };
  /** A forma da área em pixels do quadro, já girada: o recorte da base. */
  contorno: Vec[];
  /** O ladrilho da base em pixels, e onde a grade começa dentro do quadro. */
  ladrilho: { lado: number; x: number; y: number };
  focos: FocoNaFolha[];
  /** Em fração da caixa, como `quadroDasFagulhas` lê. Vazio = sem fagulha. */
  fagulhas: Trajetoria[];
};

/** O que o plano precisa do efeito, além da área. */
export type OpcoesDoPlano = {
  /** O foco, em vezes o segmento. */
  escala: number;
  /** A grade de quadros da folha: o laço do fogo. */
  total: number;
  fps: number;
  /** O ladrilho da base, em vezes o segmento. Ausente = sem base. */
  escalaDaBase?: number;
  /** As fagulhas do efeito, em figuras -- aqui, em segmentos. */
  particulas?: ParticulasResolvidas;
  /** Segmentos por lado de casa. Ausente = 1. Ver `AreaDoEfeito.divisoes`. */
  divisoes?: number;
  /** O mínimo no menor lado. Ausente = sem mínimo. Ver `AreaDoEfeito.densidade`. */
  densidade?: number;
};

/**
 * Quantos focos cada segmento acende. Três, e não um: com um foco por casa,
 * centrado e com o pé no pé dela, o chão saía em FILEIRAS -- cada linha da
 * grade com a sua base reta e uma faixa escura em cima. Três focos sorteados
 * dentro da casa, de alturas diferentes, desmancham a grade. Custa só no forno: na tela a área
 * continua uma camada, tenha um foco ou mil.
 */
const FOCOS_POR_SEGMENTO = 3;

/** Fagulhas por área, no máximo: cada uma é um degradê por quadro, no forno. */
const MAX_FAGULHAS = 60;

/** Pontos do contorno de uma elipse. Na folha ela tem poucas centenas de pixels. */
const PONTOS_DA_ELIPSE = 48;

/** Um número de 0 a 1 que sai da semente: a mesma conta da tela e da mesa. */
function sorteio(semente: string): number {
  return sementeDaLuz(semente) / 4_294_967_296;
}

/** A forma da área em cena, já girada: os cantos, a elipse em polígono, os vértices. */
function contornoEmCena(area: AreaDeEfeito): Vec[] {
  const formato = area.formato ?? "retangulo";
  const { width: w, height: h } = area;
  const locais =
    formato === "poligono"
      ? pontosNaCaixa(area, area.pontos ?? [])
      : formato === "elipse"
        ? Array.from({ length: PONTOS_DA_ELIPSE }, (_, i) => {
            const t = (i / PONTOS_DA_ELIPSE) * Math.PI * 2;
            return { x: w / 2 + (Math.cos(t) * w) / 2, y: h / 2 + (Math.sin(t) * h) / 2 };
          })
        : [
            { x: 0, y: 0 },
            { x: w, y: 0 },
            { x: w, y: h },
            { x: 0, y: h },
          ];

  return locais.map((local) => paraCena(area, local));
}

/**
 * Um ponto sorteado dentro da casa e dentro da FORMA: é o pé de uma chama ou
 * de uma fagulha. Quatro tentativas; a que não acerta fica no centro da casa,
 * que está dentro por construção. É o que segura o fogo dentro da base -- só
 * as línguas passam da borda, e para cima.
 */
function peDentro(area: AreaDeEfeito, segmento: Segmento, lado: number, semente: string): Vec {
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const pe = {
      x: segmento.x + lado * (0.1 + 0.8 * sorteio(`${semente}:x${tentativa}`)),
      y: segmento.y + lado * (0.1 + 0.9 * sorteio(`${semente}:y${tentativa}`)),
    };
    if (dentroDaArea(area, pe)) return pe;
  }

  return { x: segmento.x + lado / 2, y: segmento.y + lado / 2 };
}

/**
 * O plano de uma área, em três camadas.
 *
 * - A BASE cobre a forma exata, ladrilhada na grade -- é o que delimita.
 * - Os FOCOS: cada segmento acende dois, do tamanho do segmento vezes a
 *   `escala` (de 85% a 120% disso, sorteado), com o pé num ponto sorteado
 *   dentro da forma. As chamas sobem além da borda de cima e se encostam nas
 *   vizinhas: o chão arde inteiro em vez de uma fileira de fogueiras.
 * - As FAGULHAS nascem em pontos sorteados da área e sobem, no laço da folha.
 *
 * O sorteio sai da casa RELATIVA à área (a primeira coluna e a primeira linha
 * dela são zero), e não da casa absoluta da grade: a área arrastada de casa em
 * casa pede ao forno a mesma folha, que ele já tem (ver `assarArea`). Crescer
 * para a direita ou para baixo também não embaralha o fogo de quem já ardia.
 *
 * `null` sem segmento nenhum: a área fina demais, ou fora do plano.
 */
export function planoDaArea(
  area: AreaDeEfeito,
  grid: SceneGrid | undefined,
  opcoes: OpcoesDoPlano,
): PlanoDaArea | null {
  const { lado, segmentos } = segmentosDaArea(area, grid, opcoes.divisoes, opcoes.densidade);
  if (segmentos.length === 0) return null;

  const coluna0 = Math.min(...segmentos.map((segmento) => segmento.coluna));
  const linha0 = Math.min(...segmentos.map((segmento) => segmento.linha));
  const casaDe = (segmento: Segmento) =>
    `${area.id}:${segmento.coluna - coluna0},${segmento.linha - linha0}`;
  // A chama nunca maior que a área: na área menor que um segmento, o fogo do
  // tamanho da casa subia duas vezes a altura dela e transbordava dos lados.
  const teto = Math.min(area.width, area.height);

  const sprites = segmentos.flatMap((segmento) =>
    Array.from({ length: FOCOS_POR_SEGMENTO }, (_, k) => {
      const casa = `${casaDe(segmento)}:${k}`;
      const tamanho = Math.min(teto, lado * opcoes.escala * (0.75 + 0.5 * sorteio(`${casa}:t`)));
      const pe = peDentro(area, segmento, lado, casa);

      return {
        x: pe.x - tamanho / 2,
        y: pe.y - tamanho,
        tamanho,
        fase: sementeDaLuz(`${casa}:f`) % opcoes.total,
      };
    }),
  );
  // De trás para a frente: o foco de pé mais baixo é chão mais perto de quem
  // olha, e é desenhado depois, por cima.
  sprites.sort((a, b) => a.y + a.tamanho - (b.y + b.tamanho));

  // As fagulhas, em cena: o pé dentro da forma, o voo do efeito em segmentos
  // por segundo, e uma volta por laço da folha -- o laço fecha.
  const laco = opcoes.total / opcoes.fps;
  const particulas = opcoes.particulas;
  const voos = particulas
    ? Array.from(
        {
          length: Math.min(
            MAX_FAGULHAS,
            Math.max(1, Math.round((particulas.quantidade * segmentos.length) / 4)),
          ),
        },
        (_, i) => {
          const semente = `${area.id}:fagulha:${i}`;
          const segmento = segmentos[Math.floor(sorteio(`${semente}:s`) * segmentos.length)]!;
          const pe = peDentro(area, segmento, lado, semente);
          const angulo =
            ((particulas.direcao + (sorteio(`${semente}:a`) - 0.5) * particulas.abertura) * Math.PI) / 180;
          const distancia = particulas.velocidade * laco * lado * (0.7 + 0.6 * sorteio(`${semente}:d`));
          const tamanho =
            particulas.tamanho * lado * Math.max(0.2, 1 + (sorteio(`${semente}:t`) - 0.5) * 2 * particulas.variacao);

          return {
            pe,
            dx: Math.cos(angulo) * distancia,
            dy: Math.sin(angulo) * distancia,
            tamanho,
            atraso: -sorteio(`${semente}:f`) * laco,
          };
        },
      )
    : [];

  // A caixa que cerca as três camadas, presa ao plano: o que passa dele
  // derruba o palco no zoom (ver `tamanhoNoPlano`). O que é cortado na borda
  // do mapa perde a ponta, e o mapa continua.
  const contornoCena = contornoEmCena(area);
  const xs = [
    ...contornoCena.map((ponto) => ponto.x),
    ...sprites.flatMap((sprite) => [sprite.x, sprite.x + sprite.tamanho]),
    ...voos.flatMap((voo) => [voo.pe.x - voo.tamanho, voo.pe.x + voo.dx + voo.tamanho]),
  ];
  const ys = [
    ...contornoCena.map((ponto) => ponto.y),
    ...sprites.flatMap((sprite) => [sprite.y, sprite.y + sprite.tamanho]),
    ...voos.flatMap((voo) => [voo.pe.y + voo.tamanho, voo.pe.y + voo.dy - voo.tamanho]),
  ];
  const x0 = Math.max(0, Math.min(...xs));
  const y0 = Math.max(0, Math.min(...ys));
  const x1 = Math.min(SCENE_WIDTH, Math.max(...xs));
  const y1 = Math.min(SCENE_HEIGHT, Math.max(...ys));
  const caixa = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };

  const pixels = Math.min(
    PIXELS_POR_SEGMENTO / lado,
    LADO_MAXIMO_DO_QUADRO / Math.max(caixa.width, caixa.height),
  );
  const quadro = {
    largura: Math.max(1, Math.round(caixa.width * pixels)),
    altura: Math.max(1, Math.round(caixa.height * pixels)),
  };

  // Arredondados: a chave do forno é o texto do plano, e o ruído da vírgula
  // flutuante faria a mesma área arrastada pedir uma folha nova.
  const r = (valor: number) => Math.round(valor * 10) / 10;
  const focos = sprites.map(({ x, y, tamanho, fase }) => ({
    x: r((x - x0) * pixels),
    y: r((y - y0) * pixels),
    lado: r(tamanho * pixels),
    fase,
  }));
  const contorno = contornoCena.map((ponto) => ({
    x: r((ponto.x - x0) * pixels),
    y: r((ponto.y - y0) * pixels),
  }));

  // O ladrilho começa onde a GRADE começa, e não onde a área começa: o fogo
  // de duas áreas vizinhas emenda, e a área arrastada pela grade não desliza a
  // textura por baixo do mapa.
  const ladoDoLadrilho = lado * (opcoes.escalaDaBase ?? 1);
  const ox = grid ? grid.offsetX : 0;
  const oy = grid ? grid.offsetY : 0;
  const ladrilho = {
    lado: r(ladoDoLadrilho * pixels),
    x: r(((((ox - x0) % ladoDoLadrilho) + ladoDoLadrilho) % ladoDoLadrilho - ladoDoLadrilho) * pixels),
    y: r(((((oy - y0) % ladoDoLadrilho) + ladoDoLadrilho) % ladoDoLadrilho - ladoDoLadrilho) * pixels),
  };

  const fagulhas: Trajetoria[] = voos.map((voo) => ({
    x: (voo.pe.x - x0) / caixa.width,
    y: (voo.pe.y - y0) / caixa.height,
    dx: voo.dx / caixa.width,
    dy: voo.dy / caixa.height,
    tamanho: voo.tamanho / caixa.width,
    duracao: laco,
    atraso: voo.atraso,
    angulo: 0,
    giro: 0,
    quadroInicial: 0,
  }));

  return { caixa, lado, segmentos, quadro, contorno, ladrilho, focos, fagulhas };
}

/**
 * Quantas chamas de pé uma área levanta no 2.5D, mais ou menos. Cada uma é uma
 * peça como um token -- animada, e reposicionada a cada quadro da câmera --, e
 * a sala inteira em chamas não pode virar uma horda. Passando disso, os
 * segmentos se juntam em blocos, e cada bloco levanta UMA chama maior.
 */
export const MAX_CHAMAS_DE_PE = 12;

/**
 * A altura de uma chama de pé, no máximo, em CASAS da grade. Abaixo de um
 * token: de esguelha, a chama do tamanho do bloco subia duas vezes acima dos
 * personagens em volta, e virava uma fogueira de São João no meio da sala.
 */
export const ALTURA_DA_CHAMA_DE_PE = 0.8;

/** Uma chama de pé: a caixa da base no chão, como a de uma peça, e a fase dela. */
export type ChamaDePe = { id: string; x: number; y: number; lado: number; fase: number };

/**
 * As chamas de pé de uma área, para o 2.5D: o fogo se levanta do chão e
 * encara a câmera, como as peças. No chão fica só a base (ver
 * `AreaDeEfeitoLayer`, `soBase`).
 *
 * Uma por segmento, até `MAX_CHAMAS_DE_PE`; passando disso, os segmentos se
 * juntam em blocos de `bloco` por `bloco`, e a chama do bloco tem o tamanho
 * dele. O pé é o meio do bloco, ou o segmento dele mais perto do meio quando o
 * meio cai fora da forma -- a chama nunca nasce fora da área. Do tamanho de
 * sempre (`escala`), preso à casa (`ALTURA_DA_CHAMA_DE_PE`) e à área.
 */
export function chamasDePe(
  area: AreaDeEfeito,
  grid: SceneGrid | undefined,
  opcoes: Pick<OpcoesDoPlano, "escala" | "total" | "divisoes" | "densidade">,
): ChamaDePe[] {
  const { lado, segmentos } = segmentosDaArea(area, grid, opcoes.divisoes, opcoes.densidade);
  if (segmentos.length === 0) return [];

  const coluna0 = Math.min(...segmentos.map((segmento) => segmento.coluna));
  const linha0 = Math.min(...segmentos.map((segmento) => segmento.linha));
  const blocosCom = (bloco: number) => {
    const grupos = new Map<string, Segmento[]>();
    for (const segmento of segmentos) {
      const chave = `${Math.floor((segmento.coluna - coluna0) / bloco)},${Math.floor((segmento.linha - linha0) / bloco)}`;
      const grupo = grupos.get(chave);
      if (grupo) grupo.push(segmento);
      else grupos.set(chave, [segmento]);
    }
    return grupos;
  };

  let bloco = Math.max(1, Math.ceil(Math.sqrt(segmentos.length / MAX_CHAMAS_DE_PE)));
  let grupos = blocosCom(bloco);
  // As bordas tortas deixam blocos pela metade: cresce até caber.
  while (grupos.size > MAX_CHAMAS_DE_PE * 1.5) grupos = blocosCom(++bloco);

  // Presa à casa e à área: no máximo `ALTURA_DA_CHAMA_DE_PE` casa, e metade do
  // menor lado -- a chama de pé é a língua do fogo, e não a área inteira de pé.
  const teto = Math.min(
    Math.min(area.width, area.height) * 0.5,
    ladoDaCasa(grid) * ALTURA_DA_CHAMA_DE_PE,
  );
  return [...grupos].map(([chave, membros]) => {
    const centros = membros.map((segmento) => ({
      x: segmento.x + lado / 2,
      y: segmento.y + lado / 2,
    }));
    const meio = {
      x: centros.reduce((soma, centro) => soma + centro.x, 0) / centros.length,
      y: centros.reduce((soma, centro) => soma + centro.y, 0) / centros.length,
    };
    const pe = dentroDaArea(area, meio)
      ? meio
      : centros.reduce((melhor, centro) =>
          Math.hypot(centro.x - meio.x, centro.y - meio.y) <
          Math.hypot(melhor.x - meio.x, melhor.y - meio.y)
            ? centro
            : melhor,
        );
    const semente = `${area.id}:de-pe:${chave}`;
    const tamanho = Math.min(teto, lado * bloco * opcoes.escala * (0.85 + 0.3 * sorteio(`${semente}:t`)));

    return {
      id: `${area.id}#chama:${chave}`,
      x: pe.x - tamanho / 2,
      y: pe.y - tamanho,
      lado: tamanho,
      fase: sementeDaLuz(`${semente}:f`) % opcoes.total,
    };
  });
}

/**
 * Quanto a luz da área cai para fora do contorno, em vezes o `raio` do efeito
 * em casas. O raio do efeito foi pensado para uma figura -- a luz sai do meio
 * dela --, e a da área já sai da borda: inteiro, ele clarearia a sala toda.
 */
const QUEDA_DA_LUZ = 0.6;

/**
 * A luz de uma área: UMA, com a forma dela -- o chão em chamas clareia em
 * retângulo, em círculo, em laço, e não em manchas redondas. Dentro do
 * contorno a luz é inteira; para fora ela cai em `raio`, até o teto da luz do
 * efeito. As paredes tapam a partir do meio da área, numa aproximação.
 *
 * Uma e não várias por medida: a luz que anda é o maior custo do sistema
 * (issue #168), e a forma clareia a área inteira melhor que quatro pontos.
 */
export function fontesDaArea(
  area: AreaDeEfeito,
  plano: Pick<PlanoDaArea, "segmentos">,
  luz: LuzResolvida,
  casa: number,
): FonteDeLuz[] {
  if (plano.segmentos.length === 0) return [];

  // A queda conta em CASAS da grade, e não em segmentos: dividir a casa deixa
  // o fogo mais fino, e não a sala mais clara.
  const raio = Math.min(RAIO_MAXIMO_DO_EFEITO, luz.raio * casa * QUEDA_DA_LUZ);

  return [
    {
      id: `${area.id}#luz`,
      dono: area.id,
      x: area.x + area.width / 2,
      y: area.y + area.height / 2,
      raio,
      raioIntenso: raioIntensoDe(raio, undefined),
      cor: luz.cor,
      intensidade: limitarIntensidade(luz.intensidade),
      forma: contornoEmCena(area),
      ...(luz.efeito ? { efeito: luz.efeito } : {}),
      // O token não faz sombra no fogo do chão: medido, a luz da área que
      // alcançava um token em movimento se refazia a cada quadro, sombra
      // inclusa, e três áreas levavam a mesa de 62 a 33 fps. O fogo é luz
      // difusa, e a sombra de um token dentro dele é a que menos se lê.
      semTokens: true,
    },
  ];
}
