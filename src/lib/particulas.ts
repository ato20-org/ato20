import { sementeDaLuz } from "@/lib/geometry/luz";
import { SCENE_HEIGHT, SCENE_WIDTH } from "@/types/scene";

/**
 * As contas das partículas de um efeito, sem React: de onde, para onde, por
 * quanto tempo, e como isso cabe numa FOLHA de quadros.
 *
 * As partículas são ASSADAS, como o fogo: o forno desenha o voo inteiro numa
 * folha, uma vez por configuração, cor e variante, e cada figura toca a folha
 * com a sua fase. Medido na bancada: uma `<i>` animada por partícula custava
 * uma camada de compositor cada, e quarenta figuras com fagulhas foram de 48
 * para 23 fps. Assada, a fagulha a mais não custa nada por quadro -- o custo é
 * o da folha, que é um só por figura.
 *
 * Puras pela razão de sempre -- o Mestre, a TV e o celular desenham a mesma
 * fagulha, e a conta se confere sem palco.
 */

/** As partículas prontas: nenhum campo ausente, nenhum fora do limite. */
export type ParticulasResolvidas = {
  quantidade: number;
  /** O endereço da imagem desta tela. Ausente = o brilho redondo na `cor`. */
  imagem?: string;
  /** A imagem pintada na `cor`, só a forma. */
  pintar: boolean;
  cor: string;
  /** Em graus por vida. */
  giro: number;
  /** O sprite da imagem. Ver `ParticulasDoEfeito.quadros`. */
  quadros?: { colunas: number; total: number; fps?: number };
  tamanho: number;
  variacao: number;
  direcao: number;
  abertura: number;
  velocidade: number;
  vida: number;
  emissor: { largura: number; altura: number; ancora: "base" | "centro" | "topo" };
};

/** Uma partícula: tudo em fração da caixa da figura, e segundos. */
export type Trajetoria = {
  /** O centro de onde nasce, em fração da largura e da altura. */
  x: number;
  y: number;
  /** Quanto anda, em fração da largura (`dx`) e da altura (`dy`). */
  dx: number;
  dy: number;
  /** O diâmetro, em fração da largura. */
  tamanho: number;
  duracao: number;
  /** Negativo: entra no meio do caminho, para o jorro não começar vazio. */
  atraso: number;
  /** O ângulo em que nasce, em radianos. */
  angulo: number;
  /** Quanto gira na vida, em radianos, já com o sentido. */
  giro: number;
  /** Onde o sprite em laço começa, de 0 a 1 da volta. */
  quadroInicial: number;
};

/** Um gerador semeado (mulberry32): o mesmo número para a mesma semente. */
function gerador(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Os caminhos das `n` partículas desta figura.
 *
 * `proporcao` é altura sobre largura: as distâncias são em FIGURAS de largura,
 * e o `dy` sai em fração da altura -- sem a conta, o token alto soltaria
 * fagulhas que sobem menos. `alcance`, de 0 a 1, encolhe o caminho perto da
 * borda do mapa (ver `extensaoNoPlano`).
 */
export function trajetorias(
  semente: string,
  particulas: ParticulasResolvidas,
  n: number,
  proporcao = 1,
  alcance = 1,
): Trajetoria[] {
  const sorteio = gerador(sementeDaLuz(semente));
  const { emissor } = particulas;
  const x0 = (1 - emissor.largura) / 2;
  const y0 =
    emissor.ancora === "base"
      ? 1 - emissor.altura
      : emissor.ancora === "topo"
        ? 0
        : (1 - emissor.altura) / 2;

  return Array.from({ length: n }, () => {
    const angulo =
      ((particulas.direcao + (sorteio() - 0.5) * particulas.abertura) * Math.PI) / 180;
    const distancia =
      particulas.velocidade * particulas.vida * (0.7 + 0.6 * sorteio()) * alcance;
    const tamanho =
      particulas.tamanho * Math.max(0.2, 1 + (sorteio() - 0.5) * 2 * particulas.variacao);
    const duracao = particulas.vida * (0.8 + 0.4 * sorteio());
    const x = x0 + sorteio() * emissor.largura;
    const y = y0 + sorteio() * emissor.altura;
    const atraso = -sorteio() * duracao;
    // Os dois do giro depois de todo o resto: acrescentá-los não muda o
    // caminho das fagulhas que já existiam.
    const inicio = sorteio() * Math.PI * 2;
    const sentido = sorteio() < 0.5 ? -1 : 1;
    const quadroInicial = sorteio();

    return {
      x,
      y,
      dx: Math.cos(angulo) * distancia,
      dy: (Math.sin(angulo) * distancia) / proporcao,
      tamanho,
      duracao,
      atraso,
      angulo: particulas.giro ? inicio : 0,
      giro: (sentido * particulas.giro * Math.PI) / 180,
      quadroInicial,
    };
  });
}

/** O quanto o caminho passa da caixa da figura, em fração dela, de cada lado. */
export function extensaoDasTrajetorias(caminhos: ReadonlyArray<Trajetoria>) {
  let esquerda = 0;
  let direita = 0;
  let cima = 0;
  let baixo = 0;

  for (const { x, y, dx, dy } of caminhos) {
    esquerda = Math.max(esquerda, -(x + dx));
    direita = Math.max(direita, x + dx - 1);
    cima = Math.max(cima, -(y + dy));
    baixo = Math.max(baixo, y + dy - 1);
  }

  return { esquerda, direita, cima, baixo };
}

/**
 * Quanto do caminho cabe no plano, de 0 a 1.
 *
 * A regra do externo (`tamanhoNoPlano`): o que passa da caixa de um plano
 * infla a camada composta do WebKitGTK, e a fagulha do token encostado na
 * borda de cima do mapa seria isso. Encolher o caminho, e não cortar a
 * fagulha. A conta é a mesma -- cada canto da caixa crescida é linear no
 * fator, já girado com o item --, e o menor teto vence. Item já fora do
 * plano não solta nada para fora dele: 0.
 */
export function extensaoNoPlano(
  caixa: { x: number; y: number; width: number; height: number; rotation: number },
  extensao: { esquerda: number; direita: number; cima: number; baixo: number },
): number {
  const { width: w, height: h } = caixa;
  const angulo = (caixa.rotation * Math.PI) / 180;
  const cos = Math.cos(angulo);
  const sin = Math.sin(angulo);
  const cx = caixa.x + w / 2;
  const cy = caixa.y + h / 2;

  // Cada canto como `a + t * b`, no referencial do item, com o centro nele.
  const xs: Array<[number, number]> = [
    [-w / 2, -extensao.esquerda * w],
    [w / 2, extensao.direita * w],
  ];
  const ys: Array<[number, number]> = [
    [-h / 2, -extensao.cima * h],
    [h / 2, extensao.baixo * h],
  ];

  let teto = 1;
  for (const [ax, bx] of xs) {
    for (const [ay, by] of ys) {
      const a = { x: cx + ax * cos - ay * sin, y: cy + ax * sin + ay * cos };
      const b = { x: bx * cos - by * sin, y: bx * sin + by * cos };

      for (const [inicio, passo, limite] of [
        [a.x, b.x, SCENE_WIDTH],
        [a.y, b.y, SCENE_HEIGHT],
      ] as const) {
        if (inicio < 0 || inicio > limite) return 0;
        if (passo > 0) teto = Math.min(teto, (limite - inicio) / passo);
        if (passo < 0) teto = Math.min(teto, -inicio / passo);
      }
    }
  }

  return Math.max(0, teto);
}

/**
 * Quantas variantes de sorteio cada configuração assa. Cada figura pega uma
 * pela semente, com a fase dela: três folhas bastam para a horda não soltar
 * as mesmas fagulhas nos mesmos lugares, e custam três fornos e não quarenta.
 */
export const VARIANTES_DE_PARTICULAS = 3;

/** A variante de uma figura. */
export function varianteDaFigura(semente: string): number {
  return sementeDaLuz(semente) % VARIANTES_DE_PARTICULAS;
}

/** Quantos pixels da folha por largura de figura. A fagulha é pequena e borrada. */
const PIXELS_POR_FIGURA = 96;

/** Quadros por segundo da folha. Fagulha anda rápido; abaixo disto, ela pula. */
const FPS_DAS_PARTICULAS = 20;

/** Uma folha de partículas: a grade, a velocidade e onde ela fica na figura. */
export type FolhaDeParticulas = {
  colunas: number;
  linhas: number;
  total: number;
  fps: number;
  /** O tamanho de UM quadro, em pixels. */
  celula: { largura: number; altura: number };
  /** Onde a folha fica, em frações da caixa da figura: pode passar dela. */
  regiao: { x: number; y: number; largura: number; altura: number };
};

/**
 * A folha que cabe estes caminhos: a região que eles varrem (com a figura
 * dentro), e quadros bastantes para um laço de `vida` segundos.
 */
export function planoDaFolha(
  caminhos: ReadonlyArray<Trajetoria>,
  vida: number,
): FolhaDeParticulas {
  let x0 = 0;
  let y0 = 0;
  let x1 = 1;
  let y1 = 1;
  for (const { x, y, dx, dy, tamanho } of caminhos) {
    const raio = tamanho / 2;
    x0 = Math.min(x0, x - raio, x + dx - raio);
    x1 = Math.max(x1, x + raio, x + dx + raio);
    y0 = Math.min(y0, y - raio, y + dy - raio);
    y1 = Math.max(y1, y + raio, y + dy + raio);
  }

  const total = Math.min(36, Math.max(12, Math.round(vida * FPS_DAS_PARTICULAS)));
  const colunas = 6;

  return {
    colunas,
    linhas: Math.ceil(total / colunas),
    total: colunas * Math.ceil(total / colunas),
    fps: (colunas * Math.ceil(total / colunas)) / vida,
    celula: {
      largura: Math.max(8, Math.round((x1 - x0) * PIXELS_POR_FIGURA)),
      altura: Math.max(8, Math.round((y1 - y0) * PIXELS_POR_FIGURA)),
    },
    regiao: { x: x0, y: y0, largura: x1 - x0, altura: y1 - y0 },
  };
}

/**
 * Uma fagulha num quadro: centro e raio em fração da CÉLULA, o alfa, o ângulo
 * e o quadro do sprite.
 */
export type FagulhaNoQuadro = {
  x: number;
  y: number;
  raio: number;
  alfa: number;
  angulo: number;
  quadro: number;
};

/** O sprite, para a conta do quadro: quantos, a velocidade, e a vida inteira. */
export type SpriteDaFagulha = { total: number; fps?: number; vida: number };

/**
 * Onde cada fagulha está no instante `t` do laço, de 0 a 1.
 *
 * Todas no MESMO período, e cada uma com a sua fase: é o que faz o laço
 * fechar sem emenda -- o quadro do fim é o do começo. Nasce apagada, acende
 * logo, e some encolhendo até o fim do caminho.
 */
export function quadroDasFagulhas(
  caminhos: ReadonlyArray<Trajetoria>,
  regiao: FolhaDeParticulas["regiao"],
  t: number,
  sprite?: SpriteDaFagulha,
): FagulhaNoQuadro[] {
  return caminhos.map((caminho) => {
    const fase = caminho.duracao > 0 ? -caminho.atraso / caminho.duracao : 0;
    const p = (((t + fase) % 1) + 1) % 1;
    const alfa = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;

    return {
      x: (caminho.x + caminho.dx * p - regiao.x) / regiao.largura,
      y: (caminho.y + caminho.dy * p - regiao.y) / regiao.altura,
      raio: ((caminho.tamanho / 2) * (1 - 0.7 * p)) / regiao.largura,
      alfa: Math.max(0, Math.min(1, alfa)),
      angulo: caminho.angulo + caminho.giro * p,
      quadro: quadroDoSprite(sprite, p, caminho.quadroInicial),
    };
  });
}

/**
 * O quadro do sprite de uma fagulha com `p` da vida andado. Em laço (com
 * `fps`), da volta em que ela começou; sem, uma vez ao longo da vida.
 */
export function quadroDoSprite(
  sprite: SpriteDaFagulha | undefined,
  p: number,
  inicial: number,
): number {
  if (!sprite || sprite.total <= 1) return 0;

  if (sprite.fps) {
    const andado = Math.floor(inicial * sprite.total + p * sprite.vida * sprite.fps);
    return ((andado % sprite.total) + sprite.total) % sprite.total;
  }

  return Math.min(sprite.total - 1, Math.floor(p * sprite.total));
}
