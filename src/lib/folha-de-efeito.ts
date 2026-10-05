import { normalizarHex } from "@/lib/cor";
import {
  quadroDasFagulhas,
  type FolhaDeParticulas,
  type Trajetoria,
} from "@/lib/particulas";

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

/** Um contexto 2D de canvas: o da janela, ou o do worker. */
type Contexto2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * A imagem da partícula, pronta: o canvas (já pintado, se for o caso), o
 * tamanho dele, e a grade do sprite -- uma coluna e um quadro quando é uma
 * imagem só.
 */
export type ImagemDaFagulha = {
  fonte: CanvasImageSource;
  largura: number;
  altura: number;
  colunas: number;
  linhas: number;
  total: number;
  fps?: number;
};

/**
 * A folha das partículas, quadro a quadro: cada fagulha onde
 * `quadroDasFagulhas` diz, um brilho redondo -- branco no miolo, a cor, e
 * nada na borda -- ou a imagem do pack, na proporção dela e girando. Cada
 * quadro é recortado na própria célula, para a fagulha da borda não vazar no
 * quadro vizinho.
 *
 * A imagem chega PRONTA -- já pintada, se o efeito pediu (`pintarImagem`):
 * quem a passa sabe em que canvas está, o da janela ou o do worker.
 */
export function desenharFolhaDeParticulas(
  ctx: Contexto2D,
  folha: FolhaDeParticulas,
  caminhos: ReadonlyArray<Trajetoria>,
  cor: string,
  imagem?: ImagemDaFagulha,
): void {
  const { largura: l, altura: a } = folha.celula;
  const hex = normalizarHex(cor) ?? "#f59e0b";
  const sprite =
    imagem && imagem.total > 1
      ? { total: imagem.total, fps: imagem.fps, vida: folha.total / folha.fps }
      : undefined;
  const transparente = `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",")},0)`;

  for (let quadro = 0; quadro < folha.total; quadro++) {
    const ox = (quadro % folha.colunas) * l;
    const oy = Math.floor(quadro / folha.colunas) * a;

    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, l, a);
    ctx.clip();

    for (const fagulha of quadroDasFagulhas(caminhos, folha.regiao, quadro / folha.total, sprite)) {
      const r = fagulha.raio * l;
      if (fagulha.alfa <= 0 || r < 0.3) continue;

      const x = ox + fagulha.x * l;
      const y = oy + fagulha.y * a;
      ctx.globalAlpha = fagulha.alfa;

      if (imagem) {
        // O lado MAIOR do quadro é o diâmetro: o símbolo alto não vira um
        // quadrado espremido. O quadro do sprite é o que a fagulha pede.
        const ql = imagem.largura / imagem.colunas;
        const qa = imagem.altura / imagem.linhas;
        const maior = Math.max(ql, qa) || 1;
        const w = (r * 2 * ql) / maior;
        const h = (r * 2 * qa) / maior;
        const sx = (fagulha.quadro % imagem.colunas) * ql;
        const sy = Math.floor(fagulha.quadro / imagem.colunas) * qa;
        ctx.translate(x, y);
        ctx.rotate(fagulha.angulo);
        ctx.drawImage(imagem.fonte, sx, sy, ql, qa, -w / 2, -h / 2, w, h);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        continue;
      }

      const brilho = ctx.createRadialGradient(x, y, 0, x, y, r);
      brilho.addColorStop(0, "#ffffff");
      brilho.addColorStop(0.3, hex);
      brilho.addColorStop(1, transparente);
      ctx.fillStyle = brilho;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

/**
 * O tamanho em que a imagem da partícula vale a pena: o lado maior de cada
 * QUADRO até 192. A fagulha é pequena na folha, e desenhar o arquivo inteiro
 * a cada uma serrilharia a borda e gastaria o forno à toa. A grade continua
 * inteira -- cada quadro com o mesmo tamanho.
 */
export function tamanhoDoSprite(
  largura: number,
  altura: number,
  colunas = 1,
  linhas = 1,
): { largura: number; altura: number } {
  const ql = largura / colunas;
  const qa = altura / linhas;
  const escala = Math.min(1, 192 / Math.max(ql, qa, 1));

  return {
    largura: Math.max(1, Math.round(ql * escala)) * colunas,
    altura: Math.max(1, Math.round(qa * escala)) * linhas,
  };
}

/**
 * A imagem só como FORMA, pintada numa cor: o alfa dela, a cor da partícula.
 * `source-in` -- a cor só cai onde já há imagem, com a borda suave dela.
 */
export function pintarImagem(
  ctx: Contexto2D,
  imagem: CanvasImageSource,
  largura: number,
  altura: number,
  cor: string,
): void {
  ctx.drawImage(imagem, 0, 0, largura, altura);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = normalizarHex(cor) ?? "#f59e0b";
  ctx.fillRect(0, 0, largura, altura);
  ctx.globalCompositeOperation = "source-over";
}

/** A grade do sprite, ou um quadro só. Linhas pela conta: a grade é cheia. */
export function gradeDoSprite(quadros?: { colunas: number; total: number; fps?: number }): {
  colunas: number;
  linhas: number;
  total: number;
  fps?: number;
} {
  if (!quadros) return { colunas: 1, linhas: 1, total: 1 };

  return {
    colunas: quadros.colunas,
    linhas: Math.ceil(quadros.total / quadros.colunas),
    total: quadros.total,
    ...(quadros.fps ? { fps: quadros.fps } : {}),
  };
}
