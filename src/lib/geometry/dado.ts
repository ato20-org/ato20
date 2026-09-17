/**
 * O icosaedro, de verdade.
 *
 * Vinte faces triangulares num sólido convexo, girado por quaternion e
 * projetado em perspectiva a cada quadro. Não é sprite, não é vídeo, não é cubo
 * disfarçado: é a mesma conta que um motor 3D faria, escrita à mão porque cabe
 * em um arquivo e evita setecentos kilobytes de dependência para desenhar um
 * sólido de doze vértices.
 *
 * Sai em SVG, e não em canvas, pelo mesmo motivo que tirou a grade do canvas: o
 * plano da cena é um `div` escalado por CSS, e bitmap dentro de `scale()` borra
 * quando o mestre amplia. Polígono vetorial não borra em zoom nenhum.
 *
 * Tudo aqui é função pura de `(orientação, posição, tempo)`. Quem chama guarda
 * o relógio; este arquivo não sabe que React existe.
 */

import {
  rotulosDoDado,
  textoDaFace,
  TIPOS_DADO,
  type FacesDado,
  type Quat,
} from "@/types/dado";
import { SCENE_HEIGHT, SCENE_WIDTH } from "@/types/scene";

const PHI = (1 + Math.sqrt(5)) / 2;

export type Vec3 = { x: number; y: number; z: number };

/* -------------------------------------------------------------------------- */
/* Quaternion                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Quaternion e não ângulos de Euler.
 *
 * Euler tem trava de eixo: com o dado apontando para a câmera, dois dos três
 * ângulos passam a girar em torno da mesma coisa e a tombada trava num plano.
 * Um dado que rola tem de poder girar em qualquer eixo em qualquer instante, e
 * é exatamente o caso que Euler não cobre.
 *
 * E interpolar: assentar o dado é ir da orientação em que ele está para a que
 * mostra a face sorteada. Em quaternion isso é um `slerp` — o caminho mais
 * curto pela esfera, velocidade constante. Em Euler é interpolar três ângulos
 * separados, e o resultado balança porque os três não chegam juntos.
 */
export const QUAT_IDENTIDADE: Quat = { x: 0, y: 0, z: 0, w: 1 };

export function quatMul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export function quatDoEixo(eixo: Vec3, angulo: number): Quat {
  const n = normalizar(eixo);
  const meio = angulo / 2;
  const s = Math.sin(meio);

  return { x: n.x * s, y: n.y * s, z: n.z * s, w: Math.cos(meio) };
}

function quatNormalizar(q: Quat): Quat {
  const m = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / m, y: q.y / m, z: q.z / m, w: q.w / m };
}

/**
 * Caminho mais curto entre duas orientações.
 *
 * O sinal invertido quando o produto interno é negativo é o que impede o dado
 * de dar a volta longa: `q` e `-q` são a MESMA orientação, e sem esta troca o
 * assentamento às vezes girava trezentos graus para chegar onde faltavam
 * sessenta.
 */
export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  let fim = b;

  if (cos < 0) {
    cos = -cos;
    fim = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
  }

  // Quase paralelos: o seno vai a zero e a divisão explode. Reta serve, porque
  // a diferença entre a corda e o arco aqui é menor que um pixel.
  if (cos > 0.9995) {
    return quatNormalizar({
      x: a.x + (fim.x - a.x) * t,
      y: a.y + (fim.y - a.y) * t,
      z: a.z + (fim.z - a.z) * t,
      w: a.w + (fim.w - a.w) * t,
    });
  }

  const angulo = Math.acos(cos);
  const seno = Math.sin(angulo);
  const pa = Math.sin((1 - t) * angulo) / seno;
  const pb = Math.sin(t * angulo) / seno;

  return {
    x: a.x * pa + fim.x * pb,
    y: a.y * pa + fim.y * pb,
    z: a.z * pa + fim.z * pb,
    w: a.w * pa + fim.w * pb,
  };
}

/** Roda um vetor: `q v q*`. */
export function girar(q: Quat, v: Vec3): Vec3 {
  // Forma expandida, sem construir os dois quaternions intermediários: esta
  // função roda doze vértices e vinte normais por dado por quadro.
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);

  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

/** Rotação que leva o unitário `de` até o unitário `para`. */
function quatEntre(de: Vec3, para: Vec3): Quat {
  const cos = de.x * para.x + de.y * para.y + de.z * para.z;

  // Opostos: qualquer eixo perpendicular serve, e o produto vetorial dá zero
  // justamente aqui. Sem este caso, virar uma face que está de costas para a
  // câmera devolvia um quaternion degenerado e o dado sumia.
  if (cos < -0.999999) {
    const eixo =
      Math.abs(de.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    return quatDoEixo(cruz(de, eixo), Math.PI);
  }

  const c = cruz(de, para);
  return quatNormalizar({ x: c.x, y: c.y, z: c.z, w: 1 + cos });
}

/* -------------------------------------------------------------------------- */
/* Vetores                                                                    */
/* -------------------------------------------------------------------------- */

function cruz(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalizar(v: Vec3): Vec3 {
  const m = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}

function subtrair(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/* -------------------------------------------------------------------------- */
/* Os sólidos                                                                 */
/* -------------------------------------------------------------------------- */

export type Face = {
  /** Índices dos vértices, em volta da face, anti-horário visto de fora. */
  indices: number[];
  /** Normal para fora, unitária. */
  normal: Vec3;
  /** Centro da face, onde o número é gravado. */
  centro: Vec3;
  /**
   * Base local da face, para assentar o número NO PLANO dela.
   *
   * `u` acompanha uma aresta e `v` é perpendicular dentro da face. Sem isto o
   * número seria texto colado no meio do polígono, sempre de frente para a
   * tela — e a ilusão de sólido morre aí: o dado gira e o número não gira com
   * ele.
   */
  u: Vec3;
  v: Vec3;
  /**
   * Distância do centro à aresta mais próxima, na base local.
   *
   * É o que dimensiona o número: face pequena, número pequeno, sem tabela de
   * tamanhos por sólido. Ver `tamanhoQueCabe`.
   */
  raioInterno: number;
  /** O número gravado no centro. Ausente no d4, que numera os vértices. */
  numero?: number;
};

/**
 * De onde o dado é lido.
 *
 * `face` é o caso normal: o número da face virada para a câmera é o resultado.
 *
 * `apice` é o d4, e não é capricho — é geometria. Tetraedro em repouso apoia
 * numa FACE e aponta um VÉRTICE para cima; não existe face para cima para ler.
 * Então cada face carrega três números, um por canto, e o resultado é o que
 * aparece no ápice — repetido nas três faces visíveis, como em d4 físico de
 * canto.
 */
export type Leitura = "face" | "apice";

export type Solido = {
  vertices: readonly Vec3[];
  faces: readonly Face[];
  leitura: Leitura;
  /** Número de cada vértice. Só no d4, onde a leitura é por ápice. */
  numerosDoVertice?: readonly number[];
  /**
   * Tamanho do número, em coordenadas locais da face.
   *
   * Um só para o sólido inteiro, e não um por face: dado de verdade tem uma
   * fonte só. Calculado a partir do rótulo MAIS LARGO na face MENOR, então o
   * `20` do d20 cabe e o `7` usa o mesmo corpo que ele.
   */
  tamanhoNumero: number;
  /**
   * Abaixo deste `normal.z` a face não mostra número.
   *
   * Por sólido porque o repouso de cada um é diferente. O caso que obriga é o
   * d4: com o ápice para cima, as três faces visíveis têm normal a `z = 1/3`, e
   * o limiar de 0,34 que serve para os outros escondia TODOS os números do d4
   * justamente quando ele está parado — por três centésimos. Com o `TOMBO`
   * ainda por cima, duas delas caem para `0,20`, e é por isso que o limiar do d4
   * é bem mais fundo: a promessa daquele dado é que o número do ápice apareça
   * nas TRÊS faces visíveis, e escondê-lo em duas quebra a leitura.
   */
  limiarNumero: number;
  /**
   * Os rótulos `6` e `9` saem sublinhados.
   *
   * Só onde os dois existem: girando, um 6 de cabeça para baixo é um 9, e a
   * mesa não tem tempo de conferir. No d8 e no d6 existe o 6 e não existe o 9,
   * então não há com o que confundir — e um sublinhado ali seria sujeira
   * resolvendo um problema que aquele dado não tem.
   */
  sublinha: boolean;
};

/**
 * As faces de um sólido convexo, DEDUZIDAS dos vértices.
 *
 * Um plano por trio de vértices; se todos os outros vértices ficam de um lado
 * só dele, é um plano de face, e a face é o conjunto de vértices que caem sobre
 * ele. Custa uns poucos milhares de comparações uma vez na vida do módulo.
 *
 * Deduzir e não tabelar, e agora por necessidade e não por gosto: a versão
 * anterior achava faces procurando TRIOS a distância de aresta, o que só existe
 * em sólido de faces triangulares. Cubo, dodecaedro e trapezoedro têm faces de
 * quatro e cinco lados — a tabela à mão seria de sessenta e duas faces, e uma
 * face com a ordem dos vértices trocada aparece como um rasgo no dado que só se
 * vê girando até ela.
 *
 * Os vértices de cada face saem ORDENADOS em volta dela, por ângulo na base
 * local: `polygon` do SVG liga na ordem que recebe, e fora de ordem o polígono
 * sai como uma gravata.
 */
function poliedro(brutos: readonly Vec3[]): {
  vertices: Vec3[];
  faces: Face[];
} {
  // Normalizados pelo circunraio, para que `raio`, do lado de quem chama,
  // signifique raio em unidades de cena em todos os seis sólidos.
  const circunraio = Math.max(...brutos.map((v) => Math.hypot(v.x, v.y, v.z)));
  const vertices = brutos.map((v) => ({
    x: v.x / circunraio,
    y: v.y / circunraio,
    z: v.z / circunraio,
  }));

  const EPS = 1e-6;
  const planos: Array<{ normal: Vec3; d: number }> = [];

  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      for (let k = j + 1; k < vertices.length; k++) {
        const bruta = cruz(
          subtrair(vertices[j], vertices[i]),
          subtrair(vertices[k], vertices[i]),
        );
        if (Math.hypot(bruta.x, bruta.y, bruta.z) < EPS) continue;

        let normal = normalizar(bruta);
        let d =
          normal.x * vertices[i].x +
          normal.y * vertices[i].y +
          normal.z * vertices[i].z;

        // Aponta para fora: com o sólido centrado na origem, o plano de uma
        // face tem `d > 0`. Virar aqui poupa o teste de sentido depois.
        if (d < 0) {
          normal = { x: -normal.x, y: -normal.y, z: -normal.z };
          d = -d;
        }

        // Plano de face é plano de SUPORTE: ninguém do outro lado.
        const suporte = vertices.every(
          (v) => normal.x * v.x + normal.y * v.y + normal.z * v.z <= d + EPS,
        );
        if (!suporte) continue;

        /**
         * Junta os trios que descrevem o mesmo plano — um pentágono tem dez
         * trios, e sem isto ele viraria dez faces sobrepostas.
         *
         * Por TOLERÂNCIA e não por chave arredondada. A chave errou: a normal
         * do mesmo plano sai com ruído de ponto flutuante diferente conforme o
         * trio que a gerou, e `0.5773503` e `0.5773502` viram chaves distintas
         * — o dodecaedro nascia com vinte e quatro faces e o d10 com doze, com
         * as sobras desenhadas por cima das legítimas.
         */
        const repetido = planos.some(
          (plano) =>
            Math.abs(plano.d - d) < 1e-5 &&
            plano.normal.x * normal.x +
              plano.normal.y * normal.y +
              plano.normal.z * normal.z >
              1 - 1e-5,
        );
        if (!repetido) planos.push({ normal, d });
      }
    }
  }

  const faces: Face[] = [];

  for (const { normal, d } of planos) {
    const noPlano = vertices
      .map((v, indice) => ({ v, indice }))
      .filter(
        ({ v }) =>
          Math.abs(normal.x * v.x + normal.y * v.y + normal.z * v.z - d) < 1e-5,
      );

    const centro = {
      x: noPlano.reduce((s, { v }) => s + v.x, 0) / noPlano.length,
      y: noPlano.reduce((s, { v }) => s + v.y, 0) / noPlano.length,
      z: noPlano.reduce((s, { v }) => s + v.z, 0) / noPlano.length,
    };

    /**
     * `u` acompanha uma ARESTA, não a direção de um canto.
     *
     * Parece detalhe e não é: `orientacaoParaValor` endireita o número girando
     * `u` para o `+x` da tela, então `u` é o que decide como a face inteira
     * pousa. Apontado para um canto, o quadrado do d6 pousava girado quarenta e
     * cinco graus — um diamante com um algarismo de pé dentro, que não se
     * parece com dado nenhum.
     */
    // Anti-horário em volta da normal. Visto de FORA, com o y da tela crescendo
    // para baixo, isso é a ordem que o culling por `normal.z` espera.
    //
    // Ordena com uma base PROVISÓRIA tirada do primeiro vértice: a definitiva
    // sai de uma aresta, e aresta só existe depois de os vértices estarem em
    // ordem. Qualquer base do plano serve para ordenar por ângulo.
    const provisorioU = normalizar(subtrair(noPlano[0].v, centro));
    const provisorioV = cruz(normal, provisorioU);
    const angulo = ({ v: p }: { v: Vec3 }) => {
      const r = subtrair(p, centro);
      return Math.atan2(
        r.x * provisorioV.x + r.y * provisorioV.y + r.z * provisorioV.z,
        r.x * provisorioU.x + r.y * provisorioU.y + r.z * provisorioU.z,
      );
    };
    noPlano.sort((a, b) => angulo(a) - angulo(b));

    /**
     * `u` acompanha uma ARESTA, não a direção de um canto.
     *
     * Parece detalhe e não é: `orientacaoParaValor` endireita o número girando
     * `u` para o `+x` da tela, então `u` é o que decide como a face inteira
     * pousa. Apontado para um canto, o quadrado do d6 pousava girado quarenta e
     * cinco graus — um diamante com um algarismo de pé dentro, que não se
     * parece com dado nenhum.
     */
    const u = normalizar(subtrair(noPlano[1].v, noPlano[0].v));
    const v = cruz(normal, u);

    const indices = noPlano.map(({ indice }) => indice);
    const plano = (p: Vec3) => {
      const r = subtrair(p, centro);
      return {
        x: r.x * u.x + r.y * u.y + r.z * u.z,
        y: r.x * v.x + r.y * v.y + r.z * v.z,
      };
    };

    let raioInterno = Infinity;
    for (let i = 0; i < indices.length; i++) {
      const a = plano(vertices[indices[i]]);
      const b = plano(vertices[indices[(i + 1) % indices.length]]);
      const comprimento = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      // Distância do centro (a origem da base local) à reta da aresta.
      raioInterno = Math.min(
        raioInterno,
        Math.abs(a.x * b.y - a.y * b.x) / comprimento,
      );
    }

    faces.push({ indices, normal, centro, u, v, raioInterno });
  }

  return { vertices, faces };
}

/**
 * O corpo de fonte do número, tirado da MENOR face do sólido.
 *
 * A caixa do número tem de caber no círculo INSCRITO da face, não dentro do
 * polígono. É o que torna a conta indiferente à forma: encaixar contra as
 * arestas é frouxo num quadrado — que se abre nos cantos — e apertado num
 * triângulo, e a mesma fórmula dava um d6 com o algarismo quase tocando as
 * bordas e um d20 com o número minúsculo.
 *
 * Um corpo só para o sólido inteiro, e da menor face: dado de verdade tem uma
 * fonte só, e o rótulo mais largo tem de caber na face mais apertada. É por isso
 * que o `20` do d20 manda no tamanho do `7` dele.
 */
function tamanhoQueCabe(faces: readonly Face[], digitos: number) {
  // Medidas de um algarismo em corpos de fonte, para fonte de sistema em peso
  // 700: avanço perto de 0,62 de largura e maiúscula perto de 0,72 de altura.
  const meiaDiagonal = Math.hypot(0.31 * digitos, 0.36);

  // Oitenta e seis por cento do raio inscrito. Sai de ter acertado o d20 à mão
  // primeiro — `0,40` de corpo com raio inscrito `0,30` — e não de gosto.
  const menorRaio = Math.min(...faces.map((face) => face.raioInterno));

  return (menorRaio * 0.86) / meiaDiagonal;
}

/** Numera as faces de modo que as opostas somem sempre o mesmo. */
function numerarOpostas(faces: Face[], rotulos: number[]) {
  const soma = rotulos[0] + rotulos[rotulos.length - 1];
  const postos = new Map<Face, number>();
  let proximo = 0;

  for (const face of faces) {
    if (postos.has(face)) continue;

    const oposta = faces.reduce(
      (melhor, outra) => {
        if (outra === face) return melhor;
        const cos = (f: Face) =>
          f.normal.x * face.normal.x +
          f.normal.y * face.normal.y +
          f.normal.z * face.normal.z;
        return melhor && cos(melhor) <= cos(outra) ? melhor : outra;
      },
      undefined as Face | undefined,
    );

    const rotulo = rotulos[proximo++];
    postos.set(face, rotulo);
    if (oposta && !postos.has(oposta)) postos.set(oposta, soma - rotulo);
  }

  for (const face of faces) face.numero = postos.get(face);
}

const PHI_INV = 1 / PHI;

/**
 * Os vértices de cada sólido, por DEFINIÇÃO e não por tabela copiada.
 *
 * - tetraedro: quatro cantos alternados do cubo;
 * - cubo: os oito `(±1, ±1, ±1)`;
 * - octaedro: os seis pontos dos eixos;
 * - trapezoedro pentagonal (o d10): dois ápices e dois anéis de cinco,
 *   defasados de 36 graus — ver `apiceDoTrapezoedro`;
 * - dodecaedro: o cubo mais os três retângulos áureos deitados;
 * - icosaedro: as permutações cíclicas de `(0, ±1, ±φ)`.
 */
function verticesDoDado(faces: FacesDado): Vec3[] {
  if (faces === 4) {
    return [
      { x: 1, y: 1, z: 1 },
      { x: 1, y: -1, z: -1 },
      { x: -1, y: 1, z: -1 },
      { x: -1, y: -1, z: 1 },
    ];
  }

  if (faces === 6) {
    const saida: Vec3[] = [];
    for (const x of [1, -1])
      for (const y of [1, -1]) for (const z of [1, -1]) saida.push({ x, y, z });
    return saida;
  }

  if (faces === 8) {
    return [
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
    ];
  }

  if (faces === 2) {
    // A moeda: um disco, que aqui é um prisma de vinte lados e pouca altura.
    // Vinte e não mais porque a dedução de faces é cúbica no número de
    // vértices -- quarenta vértices são dez mil trios, e cabem na carga do
    // módulo; oitenta seriam oitenta mil. Vinte lados já não se vê como
    // polígono no tamanho em que a moeda aparece.
    //
    // A altura é a de uma moeda grossa. Fina demais e a lateral some no pouso
    // tombado, e o disco vira um papel; grossa demais e vira uma pastilha.
    const meiaAltura = 0.09;
    const saida: Vec3[] = [];
    for (let i = 0; i < 20; i++) {
      const a = (i * 2 * Math.PI) / 20;
      saida.push({ x: Math.cos(a), y: Math.sin(a), z: meiaAltura });
      saida.push({ x: Math.cos(a), y: Math.sin(a), z: -meiaAltura });
    }
    return saida;
  }

  // O d% é o MESMO trapezoedro do d10: dez faces, só o que está gravado muda.
  if (faces === 10 || faces === 100) {
    const anel = 0.105;
    const apice = apiceDoTrapezoedro(anel);
    const saida: Vec3[] = [
      { x: 0, y: 0, z: apice },
      { x: 0, y: 0, z: -apice },
    ];

    for (let i = 0; i < 5; i++) {
      const a = (i * 2 * Math.PI) / 5;
      saida.push({ x: Math.cos(a), y: Math.sin(a), z: anel });
      saida.push({
        x: Math.cos(a + Math.PI / 5),
        y: Math.sin(a + Math.PI / 5),
        z: -anel,
      });
    }

    return saida;
  }

  if (faces === 12) {
    const saida: Vec3[] = [];
    for (const x of [1, -1])
      for (const y of [1, -1]) for (const z of [1, -1]) saida.push({ x, y, z });
    for (const s of [1, -1]) {
      for (const t of [1, -1]) {
        saida.push({ x: 0, y: s * PHI_INV, z: t * PHI });
        saida.push({ x: s * PHI_INV, y: t * PHI, z: 0 });
        saida.push({ x: s * PHI, y: 0, z: t * PHI_INV });
      }
    }
    return saida;
  }

  const saida: Vec3[] = [];
  for (const s of [1, -1]) {
    for (const t of [1, -1]) {
      saida.push({ x: 0, y: s, z: t * PHI });
      saida.push({ x: s, y: t * PHI, z: 0 });
      saida.push({ x: s * PHI, y: 0, z: t });
    }
  }
  return saida;
}

/**
 * A altura do ápice que deixa a pipa do d10 PLANA.
 *
 * O trapezoedro tem dez faces de quatro lados, e cada uma junta o ápice, dois
 * vértices do anel de cima e um do de baixo. Esses quatro pontos só são
 * coplanares para uma altura de ápice específica — e é a coplanaridade que faz
 * a face existir: fora dela, a dedução de faces devolve triângulos, e o dado
 * aparece com uma costura no meio de cada pipa.
 *
 * Sai fechada porque a condição é LINEAR na altura do ápice: o ponto entra uma
 * vez só no produto vetorial que dá a normal.
 */
function apiceDoTrapezoedro(anel: number): number {
  const sen72 = Math.sin((2 * Math.PI) / 5);
  const cos72 = Math.cos((2 * Math.PI) / 5);
  const sen36 = Math.sin(Math.PI / 5);
  const cos36 = Math.cos(Math.PI / 5);

  const k = sen72 * (cos36 - 1) - (cos72 - 1) * sen36;
  return anel + (2 * anel * sen72) / k;
}

/**
 * Os seis dados, montados uma vez na carga do módulo.
 *
 * Eager e não sob demanda: montar os seis é alguns milhares de comparações de
 * ponto flutuante, e o custo desaparece ao lado do primeiro quadro de
 * animação. Sob demanda pagaria isso no meio de um lançamento.
 */
export const SOLIDOS: Record<FacesDado, Solido> = (() => {
  const montados = {} as Record<FacesDado, Solido>;

  for (const tipo of TIPOS_DADO) {
    const { vertices, faces } = poliedro(verticesDoDado(tipo.faces));
    const rotulos = rotulosDoDado(tipo.faces);
    // Pelo TEXTO gravado e não pelo número: o `00` do d% tem dois algarismos, e
    // a moeda escreve palavra.
    const digitos = Math.max(
      ...rotulos.map((rotulo) => textoDaFace(tipo.faces, rotulo).length),
    );

    if (tipo.faces === 2) {
      // Só as duas faces grandes recebem texto; as vinte laterais são o canto
      // da moeda. E é das grandes que sai o corpo da fonte -- pela menor face
      // do sólido, como nos dados, a palavra sairia do tamanho da lateral.
      const grandes = faces.filter((face) => Math.abs(face.normal.z) > 0.9);
      for (const face of grandes) face.numero = face.normal.z > 0 ? 1 : 2;

      montados[tipo.faces] = {
        vertices,
        faces,
        leitura: "face",
        tamanhoNumero: tamanhoQueCabe(grandes, digitos),
        limiarNumero: 0.34,
        sublinha: false,
      };
      continue;
    }

    if (tipo.faces === 4) {
      montados[tipo.faces] = {
        vertices,
        faces,
        leitura: "apice",
        numerosDoVertice: rotulos,
        // Quase tudo o que cabe no centro, apesar de serem três por face: as
        // faces do d4 são vistas de esguelha de cima, e o número já chega
        // encurtado. Medido no tamanho em que o dado aparece no tabuleiro, e não
        // ampliado — era ali que ele estava ilegível.
        tamanhoNumero: tamanhoQueCabe(faces, digitos) * 0.95,
        limiarNumero: 0.15,
        sublinha: false,
      };
      continue;
    }

    numerarOpostas(faces, rotulos);

    montados[tipo.faces] = {
      vertices,
      faces,
      leitura: "face",
      tamanhoNumero: tamanhoQueCabe(faces, digitos),
      limiarNumero: 0.34,
      sublinha: rotulos.includes(6) && rotulos.includes(9),
    };
  }

  return montados;
})();

/** A câmera olha o tabuleiro de cima: o que aponta para `+z` é o que se lê. */
const CAMERA: Vec3 = { x: 0, y: 0, z: 1 };

/**
 * Quanto o dado fica tombado depois de assentar, em radianos.
 *
 * Existe porque face EXATAMENTE de frente para a câmera é o pior retrato
 * possível de um sólido. Num cubo, as quatro faces vizinhas ficam a noventa
 * graus da visão — de perfil perfeito, largura zero — e o d6 pousava como um
 * quadrado chapado, sem uma única aresta que denunciasse que existe volume ali.
 * No octaedro dava o mesmo tipo de silhueta pobre.
 *
 * Quinze graus resolve: as vizinhas entram em cena e o dado volta a ter forma,
 * enquanto o número da face lida encurta por `cos 15°` — três por cento, que
 * ninguém vê. É o mesmo motivo pelo qual ninguém fotografa um dado a prumo.
 *
 * Em torno do eixo X da TELA, então a linha de base do número continua
 * horizontal: tombar em outro eixo deitaria o algarismo junto.
 */
const TOMBO = 0.26;

/**
 * A orientação que mostra `valor` para quem olha.
 *
 * Duas rotações compostas: a primeira vira para a câmera o que se lê — a face,
 * ou o ápice no d4 —, a segunda gira o dado em torno do eixo de visão até o
 * número ficar de pé na tela.
 *
 * A segunda não é enfeite. A base local da face nasce de uma aresta arbitrária,
 * então sem ela o número pousa torto — e um 17 deitado de lado é lido como
 * outra coisa na velocidade em que a mesa lê um dado.
 *
 * No d4 o alvo do endireitamento é outro: não há número no centro para deitar,
 * então o giro leva uma das três faces visíveis para BAIXO, de frente para
 * quem olha. Fica simétrico, e é a pose em que um d4 na mesa é fotografado.
 */
export function orientacaoParaValor(faces: FacesDado, valor: number): Quat {
  const solido = SOLIDOS[faces];

  const tombar = quatDoEixo({ x: 1, y: 0, z: 0 }, TOMBO);

  if (solido.leitura === "apice") {
    const indice = Math.max(0, solido.numerosDoVertice?.indexOf(valor) ?? 0);
    const virar = quatEntre(normalizar(solido.vertices[indice]), CAMERA);

    const lateral = solido.faces.find((face) => face.indices.includes(indice));
    if (!lateral) return quatMul(tombar, virar);

    const centro = girar(virar, lateral.centro);
    // `+y` é para baixo na tela, e é para lá que a face vai.
    const desvio = Math.atan2(centro.x, centro.y);

    return quatMul(tombar, quatMul(quatDoEixo(CAMERA, desvio), virar));
  }

  const face = solido.faces.find((f) => f.numero === valor) ?? solido.faces[0];
  const virar = quatEntre(face.normal, CAMERA);

  const u = girar(virar, face.u);
  const desvio = Math.atan2(u.y, u.x);

  return quatMul(tombar, quatMul(quatDoEixo(CAMERA, -desvio), virar));
}

/* -------------------------------------------------------------------------- */
/* Projeção e sombreado                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Distância da câmera, em raios.
 *
 * Perspectiva e não projeção ortogonal: quatro raios é perto o bastante para as
 * faces de baixo estreitarem visivelmente, que é o que faz o dado parecer um
 * volume sobre a mesa em vez de um mosaico plano. Muito mais perto e o sólido
 * distorce como lente grande-angular.
 */
const DISTANCIA = 4;

/**
 * De onde vem a luz. Alto, à esquerda e à frente.
 *
 * Fixa no espaço do MUNDO e não no do dado: é a luz da sala. Girar a luz junto
 * com o dado deixaria todas as faces com o mesmo brilho o tempo todo, e o
 * sombreado é o que denuncia que ele está girando — sem ele o dado parece um
 * decalque trocando de forma.
 */
const LUZ: Vec3 = normalizar({ x: -0.4, y: -0.75, z: 0.55 });

/**
 * Corta a precisão dos números que viram atributo de SVG.
 *
 * `Math.round` e não `toFixed`: devolve número, não texto, e a conversão que o
 * navegador faz depois já sai curta.
 *
 * Vale a pena por duas razões. A primeira é o tamanho: um vértice em precisão
 * cheia de ponto flutuante sai como `989.7241743911845` — dezessete caracteres
 * para descrever um décimo de unidade de cena, que a nesta escala não chega a um
 * vigésimo de pixel na tela. Com doze dados no ar isso dava mais de um megabyte
 * de string por segundo para montar, entregar e o navegador reparsear.
 *
 * A segunda é melhor: quando o dado está quase parado, o valor arredondado
 * REPETE entre quadros. React compara a propriedade e não escreve no DOM — e
 * atributo que não muda não obriga o navegador a reposicionar glifo nenhum.
 */
function curto(valor: number, casas = 1): number {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

export type NumeroDesenhado = {
  texto: string;
  /**
   * A base afim que assenta o número no plano da face, como
   * `[a, b, c, d, e, f]`.
   *
   * Os MESMOS seis números que o `matrix(...)` do SVG carrega, e é por isso que
   * eles vêm em número e não em texto: quem desenha em canvas os passa direto
   * para `ctx.transform`, e quem desenha em SVG monta a string. Duas
   * formatações do mesmo dado, uma fonte de verdade.
   */
  matriz: readonly [number, number, number, number, number, number];
  sublinhado: boolean;
};

/**
 * A cor do número, com a MESMA luz que bate na face.
 *
 * Porque é o que ele é: tinta gravada na face, recebendo a luz da face. Antes
 * era a tinta chapada com um `opacity` por cima para "recuar" nas faces
 * escuras, e isso errava nos dois sentidos — apagava o número em vez de
 * escurecê-lo, e no dado de tinta ESCURA sobre corpo claro fazia o contrário do
 * pretendido: reduzia justamente o contraste que sustentava a leitura, e o d4
 * ficava sem número visível.
 *
 * Passando os dois pela mesma conta, o contraste entre tinta e corpo sobrevive
 * em qualquer luz, porque os dois escurecem na mesma proporção.
 */
export function corDaTinta(tinta: string, luz: number): string {
  return corDaFace(tinta, luz);
}

export type FaceDesenhada = {
  /** Chave estável de render. A face, não o número: o d4 tem três por face. */
  chave: string;
  /**
   * Os vértices achatados: `x0, y0, x1, y1, ...`, em unidades de cena.
   *
   * Em número, para quem desenha em canvas traçar o polígono sem reparsear
   * texto. Quem desenha em SVG usa `pontos`, que é esta mesma lista formatada.
   */
  vertices: number[];
  /** `x0,y0 x1,y1 ...`, pronto para o `points` do SVG. */
  pontos: string;
  /** 0 = na sombra, 1 = de frente para a luz. */
  luz: number;
  /** O que está gravado nesta face. Vazio quando ela está muito de lado. */
  numeros: NumeroDesenhado[];
};

/**
 * O dado, pronto para virar SVG.
 *
 * Devolve SÓ as faces viradas para a câmera. Num sólido convexo isso basta e
 * não precisa de ordenação por profundidade: duas faces de frente nunca se
 * sobrepõem na projeção. É o que permite desenhar sessenta e dois triângulos,
 * quadrados, pipas e pentágonos sem um z-buffer.
 */
export function desenharDado({
  faces: quantasFaces,
  orientacao,
  cx,
  cy,
  raio,
  /**
   * Se vale a pena gravar os números, de 0 a 1. Zero não devolve número nenhum.
   *
   * Padrão um, porque quem está parado — o dado do saquinho, o dado na mão — é
   * para ser lido. Quem passa zero é a queda, enquanto o dado ainda tomba rápido
   * demais para qualquer algarismo significar algo. Ver `QuadroDaQueda.nitidez`.
   */
  nitidez = 1,
}: {
  faces: FacesDado;
  orientacao: Quat;
  cx: number;
  cy: number;
  raio: number;
  nitidez?: number;
}): FaceDesenhada[] {
  const solido = SOLIDOS[quantasFaces];
  const camera = DISTANCIA * raio;

  const girados = solido.vertices.map((v) => girar(orientacao, v));
  const projetar = (v: Vec3) => {
    const escala = camera / (camera - v.z * raio);
    return { x: cx + v.x * raio * escala, y: cy + v.y * raio * escala };
  };

  const tela = girados.map(projetar);
  const desenhadas: FaceDesenhada[] = [];

  for (const [indiceFace, face] of solido.faces.entries()) {
    const normal = girar(orientacao, face.normal);
    if (normal.z <= 0.001) continue;

    const vertices: number[] = [];
    for (const i of face.indices) {
      vertices.push(curto(tela[i].x), curto(tela[i].y));
    }

    // A string sai dos MESMOS números arredondados: é ela que o React compara
    // para decidir se escreve no DOM -- ver `curto`.
    const pontos = [];
    for (let i = 0; i < vertices.length; i += 2) {
      pontos.push(`${vertices[i]},${vertices[i + 1]}`);
    }
    const luz = Math.max(
      0,
      normal.x * LUZ.x + normal.y * LUZ.y + normal.z * LUZ.z,
    );

    const numeros: NumeroDesenhado[] = [];

    // Abaixo do limiar a face aparece como um risco, e o número sairia
    // esmagado num borrão de tinta — pior que face lisa. Um dado real também
    // não deixa ler o número de esguelha.
    if (nitidez > 0 && normal.z > solido.limiarNumero) {
      const centro = girar(orientacao, face.centro);

      /**
       * A afim sai da PROJEÇÃO da base, e não de um ângulo calculado à parte:
       * assim o número herda o encurtamento da perspectiva e deita junto com a
       * face, em vez de ficar de pé sobre ela.
       *
       * Nenhum dos dois eixos é invertido. A projeção preserva os números do
       * plano xy, e o y do SVG já cresce para baixo — então `(u, v)` chega com a
       * mesma orientação da identidade do SVG, e o determinante sai positivo.
       * Negar `v` "para compensar o y do SVG" é a armadilha: ela inverte o
       * determinante e o número sai ESPELHADO, o que numa face girada parece só
       * um algarismo estranho — um 20 virava 05 de trás para frente.
       */
      const afim = (
        origem: Vec3,
        eixoU: Vec3,
        eixoV: Vec3,
        corpo: number,
      ): NumeroDesenhado["matriz"] => {
        const o = projetar(origem);
        const pu = projetar({
          x: origem.x + eixoU.x * corpo,
          y: origem.y + eixoU.y * corpo,
          z: origem.z + eixoU.z * corpo,
        });
        const pv = projetar({
          x: origem.x + eixoV.x * corpo,
          y: origem.y + eixoV.y * corpo,
          z: origem.z + eixoV.z * corpo,
        });

        // Três casas na base e uma na posição: a base é um vetor de umas
        // dezesseis unidades, a posição é um ponto do plano de cena.
        return [
          curto(pu.x - o.x, 3),
          curto(pu.y - o.y, 3),
          curto(pv.x - o.x, 3),
          curto(pv.y - o.y, 3),
          curto(o.x),
          curto(o.y),
        ] as const;
      };

      if (solido.leitura === "apice") {
        // Um número por canto, deitado apontando PARA o canto: é assim que d4
        // de canto é gravado, e é o que faz o número do ápice ser o mesmo nas
        // três faces visíveis.
        for (const indice of face.indices) {
          const vertice = girados[indice];
          const paraFora = normalizar(subtrair(vertice, centro));
          const aoLado = cruz(normal, paraFora);
          // Sessenta e seis por cento do caminho até o canto: é onde d4 físico
          // grava. No meio da face os três números se juntam num aglomerado, e
          // deixa de ser óbvio qual deles é o do ápice.
          const posicao = {
            x: centro.x + (vertice.x - centro.x) * 0.66,
            y: centro.y + (vertice.y - centro.y) * 0.66,
            z: centro.z + (vertice.z - centro.z) * 0.66,
          };

          numeros.push({
            texto: String(solido.numerosDoVertice?.[indice] ?? ""),
            // O "para cima" do algarismo é a direção do canto, então `v` do
            // texto é o contrário dela: o topo da letra fica virado para fora.
            matriz: afim(
              posicao,
              aoLado,
              { x: -paraFora.x, y: -paraFora.y, z: -paraFora.z },
              solido.tamanhoNumero,
            ),
            sublinhado: false,
          });
        }
      } else if (face.numero !== undefined) {
        const u = girar(orientacao, face.u);
        const v = girar(orientacao, face.v);

        numeros.push({
          texto: textoDaFace(quantasFaces, face.numero),
          matriz: afim(centro, u, v, solido.tamanhoNumero),
          sublinhado:
            solido.sublinha && (face.numero === 6 || face.numero === 9),
        });
      }
    }

    desenhadas.push({
      chave: `f${indiceFace}`,
      vertices,
      pontos: pontos.join(" "),
      luz,
      numeros,
    });
  }

  return desenhadas;
}

/* -------------------------------------------------------------------------- */
/* A queda                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Gerador semeado (mulberry32).
 *
 * A tombada tem de ser função da SEMENTE e não de `Math.random` chamado no
 * quadro: `quadroDaQueda` é chamada sessenta vezes por segundo, e um sorteio
 * dentro dela daria um eixo de giro novo a cada quadro — o dado tremeria em vez
 * de rolar. Com a semente guardada no `Dado`, a mesma jogada tomba igual toda
 * vez que for redesenhada, o que é o que permite a animação não morar em estado
 * nenhum.
 */
function semeado(semente: number): () => number {
  let a = semente >>> 0;

  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Gravidade, em raios do dado por segundo ao quadrado.
 *
 * Em RAIOS e não em unidades de cena: assim o d4 e o d20 caem com a mesma
 * aparência de peso, cada um na escala dele, em vez de o dado pequeno parecer
 * uma pedra e o grande uma pena.
 */
const GRAVIDADE = 33;

/** De que altura a mão solta o dado, em raios. */
const ALTURA_DA_MAO = 2.4;

/** Quanto da velocidade vertical sobrevive a cada batida. */
const RESTITUICAO = 0.42;

/** Tempo de assentamento: gira menos, cai na face sorteada. */
const ASSENTO = 0.55;

/**
 * A velocidade de arremesso, em unidades de cena por segundo, que conta como
 * peteleco cheio.
 *
 * Acima disto não empurra mais: um escorregão de mouse a três mil pixels por
 * segundo é acidente, não intenção, e sem teto ele mandaria o dado para o outro
 * lado do mapa. O valor é da ordem de um gesto rápido e curto de pulso.
 */
const IMPULSO_CHEIO = 1600;

/**
 * O impulso, com a magnitude presa ao teto.
 *
 * Todo uso do impulso passa por aqui, e é o que torna verdadeiro o teto do
 * `IMPULSO_CHEIO`: antes só a altura e o giro saturavam, e a DISTÂNCIA seguia
 * crescendo sem limite — um escorregão de mouse mandava o dado de uma beirada à
 * outra, e o teto que o comentário prometia não existia na metade que mais se
 * nota.
 */
function impulsoLimitado(impulso: { x: number; y: number }): {
  x: number;
  y: number;
} {
  const forte = Math.hypot(impulso.x, impulso.y);
  if (forte <= IMPULSO_CHEIO) return impulso;

  return {
    x: (impulso.x / forte) * IMPULSO_CHEIO,
    y: (impulso.y / forte) * IMPULSO_CHEIO,
  };
}

/**
 * Quanto tempo o dado escorrega antes de parar, em segundos.
 *
 * Decaimento exponencial com esta constante de tempo, então o deslocamento
 * total é `velocidade × ATRITO` — é o que dá para prever onde ele vai parar
 * enquanto ainda se está com ele na mão.
 *
 * Com o teto do `IMPULSO_CHEIO`, isto fixa o arremesso máximo em umas quatrocentas
 * e oitenta unidades de cena: cinco quadrados de grade, que é uma jogada que
 * atravessa um pedaço de mapa sem atravessar o mapa.
 */
const ATRITO = 0.3;

/** Velocidade vertical que o peteleco cheio acrescenta, em raios por segundo. */
const ARREMESSO_ALTO = 12;

/**
 * O impulso de quem pega o dado que já está na mesa e joga de novo.
 *
 * Um terço de peteleco, em direção qualquer. Nem zero nem cheio: largar parado
 * daria um tombo curto demais para parecer uma jogada nova — e é uma jogada
 * nova, com número novo, então ela precisa parecer uma. Cheio jogaria o dado
 * para o outro lado do mapa a cada reclique.
 *
 * Mora aqui porque a ESCALA do impulso é desta casa: quem chama não tem como
 * saber quanto é "um terço de peteleco" em unidades de cena por segundo.
 */
export function impulsoDeRelance(): { x: number; y: number } {
  const angulo = Math.random() * Math.PI * 2;
  const forca = IMPULSO_CHEIO * (0.22 + Math.random() * 0.2);

  return { x: Math.cos(angulo) * forca, y: Math.sin(angulo) * forca };
}

/** A força do arremesso, de 0 (largou parado) a 1 (peteleco cheio). */
function forcaDoImpulso(impulso: { x: number; y: number }): number {
  return Math.min(1, Math.hypot(impulso.x, impulso.y) / IMPULSO_CHEIO);
}

/**
 * Quanto tempo a jogada inteira dura, em segundos.
 *
 * Por DADO e não uma constante do módulo, porque agora ela depende do
 * arremesso: um peteleco forte joga o dado para cima, e ele fica no ar mais
 * tempo antes da primeira batida — e quica mais vezes depois. Era constante
 * enquanto todo dado caía da mesma altura parado.
 *
 * Quem anima usa isto para saber quando largar o `requestAnimationFrame`.
 */
export function duracaoDaQueda(dado: {
  impulso: { x: number; y: number };
}): number {
  const forca = forcaDoImpulso(dado.impulso);
  const subida = ARREMESSO_ALTO * forca;

  // Tempo até tocar o chão: `h0 + v0·t − g·t²/2 = 0`, raiz positiva.
  let total =
    (subida + Math.sqrt(subida * subida + 2 * GRAVIDADE * ALTURA_DA_MAO)) /
    GRAVIDADE;

  let v = GRAVIDADE * total - subida;
  for (let i = 0; i < batidasDoImpulso(forca); i++) {
    v *= RESTITUICAO;
    // Subir e voltar: `2v/g`.
    total += (2 * v) / GRAVIDADE;
  }

  return total + ASSENTO;
}

/**
 * Quantas vezes ele quica.
 *
 * De uma a três, pela força. Largar o dado parado e vê-lo quicar três vezes é o
 * que faz dado digital parecer de borracha: sem impulso não há energia para
 * três quiques, e o olho sabe disso mesmo sem saber por quê.
 */
function batidasDoImpulso(forca: number): number {
  return 1 + Math.round(forca * 2);
}

/**
 * Altura acima da mesa, em raios, e quando foi a última batida.
 *
 * Arcos analíticos em vez de integrar velocidade quadro a quadro: integrar
 * exige guardar estado entre quadros, e o ponto todo desta função é não ter
 * estado. Com a fórmula fechada, desenhar o instante `t` não depende de ter
 * desenhado `t - 1`.
 */
function alturaEm(
  t: number,
  forca: number,
): { altura: number; batida: number } {
  const subida = ARREMESSO_ALTO * forca;
  const primeira =
    (subida + Math.sqrt(subida * subida + 2 * GRAVIDADE * ALTURA_DA_MAO)) /
    GRAVIDADE;

  if (t < primeira) {
    return {
      altura: Math.max(0, ALTURA_DA_MAO + subida * t - 0.5 * GRAVIDADE * t * t),
      batida: -1,
    };
  }

  let inicio = primeira;
  let v = GRAVIDADE * primeira - subida;

  for (let i = 0; i < batidasDoImpulso(forca); i++) {
    v *= RESTITUICAO;
    const arco = (2 * v) / GRAVIDADE;

    if (t < inicio + arco) {
      const dt = t - inicio;
      return {
        altura: Math.max(0, v * dt - 0.5 * GRAVIDADE * dt * dt),
        batida: inicio,
      };
    }

    inicio += arco;
  }

  return { altura: 0, batida: inicio };
}

export type QuadroDaQueda = {
  /** Centro do dado, em unidades de cena. */
  x: number;
  y: number;
  orientacao: Quat;
  /** Cresce com a altura: de cima, subir é aproximar-se de quem olha. */
  escala: number;
  /** Achatada na batida. `1,1` no resto do tempo. */
  esmagaX: number;
  esmagaY: number;
  sombra: { raio: number; opacidade: number; dx: number; dy: number };
  /**
   * Quanto os números estão LEGÍVEIS, de 0 a 1.
   *
   * Zero enquanto ele tomba: um dado a quatro voltas por segundo não mostra
   * número nenhum — numa foto ele sai borrado, e no jogo os números viravam um
   * enxame de algarismos piscando que ninguém lia. Sobe para um no fim do
   * assentamento, que é quando o resultado passa a ser a informação.
   *
   * Foi também a otimização que mais rendeu, enquanto o dado era SVG: cada
   * quadro com a matriz nova obrigava o navegador a reposicionar os glifos.
   * Medido então, com doze dados rolando juntos: com números em todo quadro,
   * p95 de 33 ms e trinta quadros longos em noventa; sem eles, 16,9 ms e
   * nenhum.
   *
   * O ganho de desenho é parte disso, mas o que a rampa sempre foi está na
   * tela: um dado a quatro voltas por segundo não mostra número nenhum, e dez
   * algarismos piscando não se leem. Ver `DadoNaMesa`.
   */
  nitidez: number;
  /** Já assentou: quem anima pode largar o `requestAnimationFrame`. */
  parado: boolean;
};

/**
 * O dado no instante `t` da jogada.
 *
 * Vista de cima, então altura não é deslocamento na tela — é TAMANHO e SOMBRA.
 * Um dado que sobe fica maior e a sombra dele encolhe e clareia; é assim que se
 * lê altura numa mesa filmada de cima, e é o que dá volume sem inclinar a
 * câmera.
 *
 * O percurso sai do IMPULSO do arremesso, não de sorteio: o dado vai para onde
 * foi jogado, tão longe quanto foi jogado, e gira tanto quanto. Antes a direção
 * e a distância eram semeadas, e o resultado era estranho de um jeito difícil de
 * apontar — o gesto de arremessar não tinha consequência nenhuma, então valia
 * tanto arremessar quanto largar.
 *
 * A semente continua existindo, e agora para o que ela deve fazer: o EIXO da
 * tombada e um desvio pequeno na trajetória. Dado não rola em linha reta, e sem
 * o desvio duas jogadas na mesma direção pousariam no mesmo lugar.
 *
 * O assentamento não é um corte para a pose final: o dado continua girando, com
 * a velocidade caindo, ENQUANTO é interpolado para a orientação sorteada. Um
 * `slerp` puro do quadro da última batida até o alvo faria o giro parar de
 * repente no meio do ar e o dado descer reto, que é o defeito clássico de dado
 * digital — parece decidido de antemão, porque foi.
 */
export function quadroDaQueda(
  dado: {
    faces: FacesDado;
    x: number;
    y: number;
    raio: number;
    valor: number;
    semente: number;
    impulso: { x: number; y: number };
  },
  t: number,
  /**
   * Onde ficam as bordas da mesa, na unidade em que o dado vive.
   *
   * Existe porque a mesa deixou de ser sempre a cena. No palco do mestre ela é
   * o plano de 1920 por 1080; no celular do jogador é a tela dele, que tem
   * outra largura e outra proporção — ver `EspacoDoDado`.
   *
   * Estava cravado em `SCENE_WIDTH`/`SCENE_HEIGHT`, e o sintoma de deixar
   * assim não foi um dado meio para fora: foi um dado que sumia. Num espaço de
   * 600 de largura, o peteleco levava o dado para além de 600 e a trava só o
   * segurava em 1920 — fora do quadro, invisível —, enquanto no eixo Y ele
   * ficava grudado na folga do topo. A queda acontecia inteira, num lugar que
   * ninguém via.
   */
  limites: { largura: number; altura: number } = {
    largura: SCENE_WIDTH,
    altura: SCENE_HEIGHT,
  },
): QuadroDaQueda {
  const rnd = semeado(dado.semente);

  const eixo = normalizar({
    x: rnd() * 2 - 1,
    y: rnd() * 2 - 1,
    z: rnd() * 2 - 1,
  });
  const inicial = quatDoEixo(
    { x: rnd() * 2 - 1, y: rnd() * 2 - 1, z: rnd() * 2 - 1 },
    rnd() * Math.PI * 2,
  );
  // Um desvio de até uns oito graus na direção do arremesso.
  const desvioDaRota = (rnd() * 2 - 1) * 0.14;

  const forca = forcaDoImpulso(dado.impulso);
  /**
   * Velocidade angular, em RADIANOS por segundo: de seis a vinte e oito, que é
   * de perto de uma volta por segundo a umas quatro e meia.
   *
   * O piso não é zero de propósito: largar o dado parado o faria descer sem
   * girar nenhum, como um tijolo, e nem soltar um dado da mão é tão limpo assim.
   */
  const velocidade = 6 + forca * 22;

  const duracao = duracaoDaQueda(dado);
  const decorrido = Math.max(0, t);
  const parado = decorrido >= duracao;
  const agora = Math.min(decorrido, duracao);

  const { altura, batida } = alturaEm(agora, forca);

  /**
   * O escorregão, em unidades de cena.
   *
   * `v · τ · (1 − e^(−t/τ))`: a integral de uma velocidade que decai. Chega
   * assintoticamente a `v · τ`, e é por isso que `ATRITO` é o que permite
   * prever onde o dado vai parar ainda com ele na mão.
   */
  const percorrido = ATRITO * (1 - Math.exp(-agora / ATRITO));
  const empurrao = impulsoLimitado(dado.impulso);
  const cos = Math.cos(desvioDaRota);
  const sen = Math.sin(desvioDaRota);
  const bruto = {
    x: dado.x + (empurrao.x * cos - empurrao.y * sen) * percorrido,
    y: dado.y + (empurrao.x * sen + empurrao.y * cos) * percorrido,
  };

  // Para na borda da mesa, seja ela o mapa ou a tela. Sem isto, um peteleco
  // forte para a beirada mandava o dado para fora, onde ele fica recortado e a
  // jogada se perde sem deixar pista.
  const folga = dado.raio * 1.15;
  const x = Math.min(limites.largura - folga, Math.max(folga, bruto.x));
  const y = Math.min(limites.altura - folga, Math.max(folga, bruto.y));

  const inicioAssento = duracao - ASSENTO;
  const alvo = orientacaoParaValor(dado.faces, dado.valor);

  let orientacao: Quat;

  if (parado) {
    orientacao = alvo;
  } else if (decorrido < inicioAssento) {
    orientacao = quatMul(quatDoEixo(eixo, decorrido * velocidade), inicial);
  } else {
    const p = (decorrido - inicioAssento) / ASSENTO;
    // O giro continua, mais lento: `1 - p` derruba a velocidade angular junto
    // com a mistura, então nos últimos quadros o alvo domina sem freada visível.
    const livre = quatMul(
      quatDoEixo(
        eixo,
        (inicioAssento + (decorrido - inicioAssento) * (1 - p)) * velocidade,
      ),
      inicial,
    );
    orientacao = quatSlerp(livre, alvo, suavizarSaida(p));
  }

  // Trinta e cinco milésimos depois da batida: tempo de um quadro e meio a
  // sessenta, que é o mínimo para o olho registrar o impacto.
  const desdeBatida = batida >= 0 ? agora - batida : Infinity;
  const esmaga =
    desdeBatida < 0.035 && !parado ? 1 - (1 - desdeBatida / 0.035) * 0.14 : 1;

  /**
   * Os números aparecem só na reta final do assentamento.
   *
   * Nos últimos quarenta e cinco por cento dele — perto de um quarto de segundo
   * —, e em rampa: dez algarismos surgindo de uma vez num estalo se nota, e o
   * que se quer é a sensação de o borrão resolvendo conforme o dado perde giro.
   */
  const assentando = parado
    ? 1
    : Math.max(0, (decorrido - inicioAssento) / ASSENTO);
  const nitidez = Math.min(1, Math.max(0, (assentando - 0.55) / 0.45)) ** 2;

  return {
    x,
    y,
    orientacao,
    ...alturaNaTela(altura, dado.raio),
    esmagaX: 2 - esmaga,
    esmagaY: esmaga,
    nitidez,
    parado,
  };
}

/**
 * Como a altura aparece numa mesa vista de cima: tamanho e sombra.
 *
 * Separado porque o dado NA MÃO usa a mesma tradução. São a mesma coisa vista
 * do mesmo lugar, e duas cópias divergiriam — o dado saltaria de tamanho no
 * instante em que sai da mão e começa a cair.
 */
function alturaNaTela(altura: number, raio: number) {
  return {
    escala: 1 + altura * 0.11,
    sombra: {
      raio: raio * Math.max(0.55, 1.05 - altura * 0.12),
      opacidade: Math.max(0.08, 0.42 - altura * 0.11),
      // A sombra escapa para o lado oposto à luz, e mais quanto mais alto ele
      // está: sombra grudada no dado o deixa colado no mapa.
      dx: -LUZ.x * altura * raio * 0.5,
      dy: -LUZ.y * altura * raio * 0.5,
    },
  };
}

/**
 * O dado enquanto está na MÃO, antes de ser jogado.
 *
 * Existe para o dado sair do saquinho e entrar no mundo na hora, em vez de o
 * cursor arrastar um decalque de tamanho fixo: aqui ele já tem o tamanho do
 * zoom atual, a perspectiva certa e a sombra no chão dizendo que está no ar. É
 * o que faz o gesto parecer pegar um dado em vez de arrastar um ícone.
 *
 * Tomba solto e devagar, sem alvo: o valor ainda não foi sorteado, e não
 * existe face para mostrar. Quem sorteia é o arremesso.
 *
 * A altura é a mesma de onde a queda começa — `ALTURA_DA_MAO` —, então soltar
 * não dá salto: o primeiro quadro da queda continua de onde a mão parou.
 */
export function quadroNaMao({
  raio,
  semente,
  t,
}: {
  raio: number;
  semente: number;
  t: number;
}): { orientacao: Quat; escala: number; sombra: QuadroDaQueda["sombra"] } {
  const rnd = semeado(semente);
  const eixo = normalizar({
    x: rnd() * 2 - 1,
    y: rnd() * 2 - 1,
    z: rnd() * 2 - 1,
  });
  const inicial = quatDoEixo(
    { x: rnd() * 2 - 1, y: rnd() * 2 - 1, z: rnd() * 2 - 1 },
    rnd() * Math.PI * 2,
  );

  return {
    // Duas voltas por segundo: o bastante para ele parecer vivo na mão, devagar
    // o bastante para não parecer que já foi jogado.
    orientacao: quatMul(quatDoEixo(eixo, t * 2), inicial),
    ...alturaNaTela(ALTURA_DA_MAO, raio),
  };
}

/**
 * Quanto dura a sucção do saquinho, em segundos.
 *
 * Seis décimos e um pouco: é o tempo de um gesto que se vê acontecer sem
 * atrapalhar quem já está pegando o dado seguinte. Abaixo de meio segundo a
 * espiral não chega a ser lida — o dado só pisca e some, que é o que o
 * recolhimento fazia antes —, e acima de um segundo a mesa fica esperando uma
 * animação para poder jogar de novo.
 */
export const DURACAO_DA_SUCCAO = 0.62;

/**
 * Quantas voltas o dado dá em torno do saquinho enquanto é engolido.
 *
 * Meia volta e pouco. Mais que isso e a trajetória deixa de parecer queda e
 * passa a parecer órbita — o dado circula, e circular é o contrário de ser
 * puxado.
 */
const VOLTAS_DA_ESPIRAL = 0.55;

export type QuadroDaSuccao = {
  /** Centro do dado, na unidade do espaço. */
  x: number;
  y: number;
  orientacao: Quat;
  /** Encolhe até zero: o dado entra no saquinho, não pousa nele. */
  escala: number;
  /**
   * O esticão na direção do buraco, e o aperto no través.
   *
   * Aplicado num eixo GIRADO — ver `anguloDoEstica` —, e não nos eixos da tela.
   * É o que faz o dado alongar na direção de para onde está sendo puxado em vez
   * de alongar sempre na horizontal.
   */
  alonga: number;
  aperta: number;
  /** O ângulo do esticão, em graus, para entrar direto num `rotate` de SVG. */
  anguloDoEstica: number;
  sombra: { raio: number; opacidade: number };
  /** Ver `QuadroDaQueda.nitidez`. Some depressa: o dado volta a ser borrão. */
  nitidez: number;
  opacidade: number;
  /** Já foi engolido: quem anima pode tirá-lo da mesa. */
  sumiu: boolean;
};

/**
 * O dado sendo sugado para o saquinho, no instante `t` do recolhimento.
 *
 * A trajetória é a de quem cai num poço de gravidade: o raio até a boca do
 * saquinho encolhe devagar no começo e desaba no fim — `1 − p^2,6`, que é uma
 * atração que cresce conforme a distância diminui —, e o giro em torno dele
 * acelera junto. O dado sai do lugar quase sem querer, e nos últimos décimos é
 * arrancado.
 *
 * Todos chegam JUNTOS, e é por isso que a conta é em FRAÇÃO do raio de cada um
 * e não em velocidade: o dado do outro canto do mapa anda mais depressa que o
 * que caiu ao lado do saquinho, e os dois somem no mesmo quadro. Com velocidade
 * igual o recolhimento terminaria em cascata, e a última meia dúzia de quadros
 * seria um dado só arrastando o fim da animação.
 *
 * O alongamento é o que dá o BURACO NEGRO em vez de um simples encolher: o dado
 * estica na direção da boca e aperta no través, cada vez mais conforme chega —
 * a maré de quem cai de pé num poço. O volume é preservado (`aperta = 1 /
 * alonga`), senão o dado ganharia massa enquanto é espremido.
 *
 * Função pura do instante, como a queda: nada aqui mora em estado, e o mesmo
 * `t` desenha sempre o mesmo quadro. Ver `quadroDaQueda`.
 */
export function quadroDaSuccao(
  dado: {
    /** Onde o dado está AGORA, na unidade do espaço. Ver `quadroDaQueda`. */
    x: number;
    y: number;
    raio: number;
    semente: number;
    /** A pose em que ele estava quando o recolhimento começou. */
    orientacao: Quat;
  },
  /** A boca do saquinho, na mesma unidade. */
  destino: { x: number; y: number },
  t: number,
): QuadroDaSuccao {
  const p = Math.min(1, Math.max(0, t / DURACAO_DA_SUCCAO));
  const resto = 1 - p;

  const dx = dado.x - destino.x;
  const dy = dado.y - destino.y;
  const raio = Math.hypot(dx, dy);
  const angulo = Math.atan2(dy, dx);

  // A atração que cresce ao se aproximar. Em fração do raio de CADA dado, para
  // todos chegarem juntos — ver a nota da função.
  const restante = 1 - p ** 2.6;

  // A espiral acelera junto com a queda: `p²` tem quase todo o giro no terço
  // final, que é onde o dado já está perto o bastante para o giro ser visível.
  const rnd = semeado(dado.semente);
  // Um quarto de volta de defasagem entre dados, para dois que caíram lado a
  // lado não entrarem no saquinho como um trilho só.
  const espiral = (VOLTAS_DA_ESPIRAL + rnd() * 0.25) * Math.PI * 2 * p ** 2;
  const rumo = angulo + espiral;

  const x = destino.x + Math.cos(rumo) * raio * restante;
  const y = destino.y + Math.sin(rumo) * raio * restante;

  // O eixo da tombada é o mesmo da queda: é o segundo número da semente, e o
  // dado não troca de eixo entre pousar e ser recolhido.
  const eixo = normalizar({
    x: rnd() * 2 - 1,
    y: rnd() * 2 - 1,
    z: rnd() * 2 - 1,
  });
  // Umas três voltas, quase todas no fim: `p³` é o giro de quem acelera para
  // dentro. O dado entra no saquinho rodando, não parado.
  const orientacao = quatMul(quatDoEixo(eixo, p ** 3 * 18), dado.orientacao);

  const alonga = 1 + p ** 2 * 0.6;

  return {
    x,
    y,
    orientacao,
    // Encolhe até nada. A raiz deixa o dado em tamanho de LER na primeira
    // metade — o mestre ainda enxerga o que estava na mesa — e some depressa na
    // segunda, que é quando ele já está dentro da boca.
    escala: resto ** 0.55,
    alonga,
    aperta: 1 / alonga,
    // O esticão aponta para a boca pelo rumo DESTE quadro, e não pelo do
    // primeiro: o dado espirala, então a linha que o liga ao saquinho gira
    // junto com ele. Congelada, o alongamento sairia de través no fim.
    anguloDoEstica: (rumo * 180) / Math.PI,
    sombra: {
      // A sombra sai antes do dado: ele está sendo LEVANTADO da mesa, e sombra
      // que encolhe junto com o corpo o deixaria deslizando pelo chão.
      raio: dado.raio * resto,
      opacidade: 0.42 * resto ** 2.5,
    },
    // Volta a ser borrão: o número deixou de ser a informação no instante em
    // que alguém mandou recolher, e um algarismo nítido girando a três voltas
    // por segundo é um enxame. Ver `QuadroDaQueda.nitidez`.
    nitidez: Math.max(0, 1 - p * 2) ** 2,
    // Apaga só no fim, e rápido: o que faz o dado sumir é o tamanho, e apagar
    // desde o começo o transformaria em fantasma no meio do caminho.
    opacidade: Math.min(1, resto / 0.18),
    sumiu: p >= 1,
  };
}

function suavizarSaida(p: number): number {
  return 1 - (1 - p) ** 3;
}

/**
 * A cor de uma face conforme a luz que bate nela.
 *
 * Com piso de ambiente: sem ele, a face de costas para a luz fica preta, e um
 * dado com faces pretas parece um buraco no mapa em vez de um objeto.
 *
 * Quarenta por cento, e o número subiu de vinte e seis por causa do dado CLARO.
 * Num dado saturado, vinte e seis por cento ainda deixava a face na sombra
 * legível; no d4, que é osso com tinta escura, a mesma conta levava o osso a
 * cinza-chumbo e a tinta escura desaparecia dentro dele — o dado ficava sem
 * número nenhum em duas das três faces visíveis. O piso tem de servir ao dado
 * mais claro do jogo, não ao mais escuro.
 *
 * E com um toque de branco no topo, pelo CUBO da luz: é o brilho de resina
 * polida, e é o que separa "polígono colorido" de "dado". O cubo concentra o
 * brilho na face mais virada para a luz em vez de clarear todas — clarear
 * todas é o mesmo que não sombrear nenhuma.
 *
 * Dezesseis por cento de branco, e não trinta e dois. Trinta e dois servia
 * enquanto todo dado era saturado; num dado claro, a face mais iluminada
 * ESTOURAVA — somava branco sobre o que já era quase branco, saturava nos três
 * canais e virava uma mancha chapada de cromado, sem número legível dentro.
 * Brilho que apaga o que está gravado embaixo dele não é brilho, é queimado.
 *
 * Aqui e não no componente porque são dois componentes: o dado que rola no
 * tabuleiro e o dado parado do saquinho. Eles têm de ser o MESMO dado, e uma
 * segunda cópia desta conta é onde eles começariam a divergir.
 */
export function corDaFace(hex: string, luz: number): string {
  const n = parseInt(hex.slice(1), 16);
  const intensidade = 0.4 + 0.6 * luz;
  const brilho = luz ** 3 * 0.16;

  const canal = (valor: number) =>
    Math.round(Math.min(255, valor * intensidade + 255 * brilho));

  return `rgb(${canal((n >> 16) & 255)} ${canal((n >> 8) & 255)} ${canal(n & 255)})`;
}
