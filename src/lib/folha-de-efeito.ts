import { normalizarHex } from "@/lib/cor";

/**
 * As contas de pixel do forno do externo, sem DOM e sem canvas: a rampa de
 * uma cor, e a folha pintada, mascarada e dividida. Puras de propósito -- o
 * forno as roda num worker, fora da thread que desenha, e o teste as roda sem
 * navegador. Ver `externo-assado.ts`.
 */

/**
 * A rampa de uma cor: 256 cores, do frio (0) ao miolo (255), em RGB.
 *
 * Escura na borda, a cor no meio, quase branca no miolo -- é o desenho de toda
 * chama, e é o que faz a mesma arte virar fogo laranja, azul ou verde
 * trocando só a cor da condição.
 */
export function rampaDaCor(hex: string): Uint8ClampedArray {
  const limpo = normalizarHex(hex) ?? "#f59e0b";
  const cor = [1, 3, 5].map((i) => parseInt(limpo.slice(i, i + 2), 16));
  const paradas: Array<[number, number[]]> = [
    [0, cor.map((c) => c * 0.35)],
    [0.45, cor],
    [0.75, cor.map((c) => c + (255 - c) * 0.55)],
    [1, cor.map((c) => c + (255 - c) * 0.9)],
  ];

  const rampa = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const depois = paradas.findIndex(([onde]) => onde >= t);
    const [t1, c1] = paradas[Math.max(0, depois)]!;
    const [t0, c0] = paradas[Math.max(0, depois - 1)]!;
    const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
    for (let canal = 0; canal < 3; canal++) {
      rampa[i * 3 + canal] = c0[canal]! + (c1[canal]! - c0[canal]!) * f;
    }
  }

  return rampa;
}

/** O que a conta de pixel recebe. Os mapas já no tamanho de UM quadro. */
export type Folha = {
  px: Uint8ClampedArray;
  largura: number;
  altura: number;
  colunas: number;
  linhas: number;
  rampa?: Uint8ClampedArray;
  /** De 0 a 1, `quadroLargura * quadroAltura`. */
  mascara?: Float32Array;
  profundidade?: Float32Array;
};

/**
 * A conta de pixel, pura: a cor pela rampa (o cinza é o calor), o alfa pela
 * máscara, e a divisão pela profundidade. Os mapas valem por QUADRO: o pixel
 * da folha é lido na posição dele dentro do quadro.
 */
export function processarFolha(
  folha: Folha,
): { unica: Uint8ClampedArray } | { atras: Uint8ClampedArray; frente: Uint8ClampedArray } {
  const { px, largura, altura, colunas, linhas, rampa, mascara, profundidade } = folha;
  const ql = Math.max(1, Math.floor(largura / colunas));
  const qa = Math.max(1, Math.floor(altura / linhas));
  const frente = new Uint8ClampedArray(px.length);
  const atras = profundidade ? new Uint8ClampedArray(px.length) : null;

  for (let y = 0; y < altura; y++) {
    const ly = Math.min(qa - 1, y % qa);
    for (let x = 0; x < largura; x++) {
      const i = (y * largura + x) * 4;
      const local = ly * ql + Math.min(ql - 1, x % ql);
      const calor = px[i]!;

      let r = px[i]!;
      let g = px[i + 1]!;
      let b = px[i + 2]!;
      if (rampa) {
        r = rampa[calor * 3]!;
        g = rampa[calor * 3 + 1]!;
        b = rampa[calor * 3 + 2]!;
      }
      const alfa = px[i + 3]! * (mascara ? mascara[local]! : 1);

      frente[i] = r;
      frente[i + 1] = g;
      frente[i + 2] = b;
      if (atras && profundidade) {
        const d = profundidade[local]!;
        frente[i + 3] = alfa * d;
        atras[i] = r;
        atras[i + 1] = g;
        atras[i + 2] = b;
        atras[i + 3] = alfa * (1 - d);
      } else {
        frente[i + 3] = alfa;
      }
    }
  }

  return atras ? { atras, frente } : { unica: frente };
}
