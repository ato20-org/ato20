import {
  inicioDoCone,
  paradasDaLuz,
  paradasDoCone,
  umbrasDaLuz,
  type CaixaDaLuz,
  type FonteDeLuz,
} from "@/lib/geometry/luz";
import type { Segmento } from "@/lib/geometry/sombra";
import { SCENE_WIDTH } from "@/types/scene";

/**
 * O ALCANCE de uma luz, pintado em branco: o degradê, o facho e o que as
 * paredes tapam. Sem os tokens.
 *
 * É a parte que a luz e a névoa dinâmica dividem. A luz acrescenta depois as
 * sombras dos tokens (`luzRecortada`); a névoa usa isto puro, porque o goblin
 * no corredor não esconde o chão atrás dele -- só a parede esconde.
 *
 * O contexto já chega com a transformação de quem chama, e tudo aqui é em
 * unidade de cena. `caixa` é a da luz (`caixaDaFonte`): o degradê e o facho
 * enchem só ela. `resolucao` é a do canvas, que o `shadowBlur` da luz com
 * forma precisa porque a transformação não o escala.
 */
export function pintarAlcance(
  contexto: CanvasRenderingContext2D,
  fonte: FonteDeLuz,
  caixa: CaixaDaLuz,
  segmentos: ReadonlyArray<Segmento>,
  resolucao: number,
) {
  if (fonte.forma && fonte.forma.length >= 3) {
    luzDaForma(contexto, fonte, fonte.forma, resolucao);
  } else {
    const degrade = contexto.createRadialGradient(
      fonte.x,
      fonte.y,
      0,
      fonte.x,
      fonte.y,
      fonte.raio,
    );
    // O raio forte e a área, e a intensidade multiplicando tudo: a brasa fraca
    // é fraca de ponta a ponta, e o véu da cor, que sai desta forma, enfraquece
    // junto. Ver `paradasDaLuz`.
    for (const [onde, forca] of paradasDaLuz(fonte)) {
      degrade.addColorStop(onde, `rgba(255,255,255,${forca})`);
    }

    contexto.fillStyle = degrade;
    contexto.fillRect(caixa.x, caixa.y, caixa.width, caixa.height);
  }

  // O cone: um degradê que dá a volta no centro, inteiro dentro do facho e
  // zero fora, multiplicado pela forma. Depois as paredes e os tokens tapam
  // o que sobrou, como no círculo -- a ordem não importa, as três contas
  // multiplicam. Ver `paradasDoCone`.
  if (fonte.cone) {
    const mascara = contexto.createConicGradient(
      inicioDoCone(fonte.cone),
      fonte.x,
      fonte.y,
    );
    for (const [onde, forca] of paradasDoCone(fonte.cone.abertura)) {
      mascara.addColorStop(onde, `rgba(0,0,0,${forca})`);
    }
    contexto.globalCompositeOperation = "destination-in";
    contexto.fillStyle = mascara;
    contexto.fillRect(caixa.x, caixa.y, caixa.width, caixa.height);
    contexto.globalCompositeOperation = "source-over";
  }

  // A luz com forma alcança do contorno, e não do meio: as paredes que ela
  // pega são as até o canto mais longe da caixa. Ver `alcanceDaForma`.
  const umbras = umbrasDaLuz(
    segmentos,
    fonte.forma ? { ...fonte, raio: alcanceDaForma(fonte, fonte.forma) } : fonte,
  );
  if (umbras.length > 0) {
    // Um caminho só, com todas as sombras: todas no mesmo sentido de giro,
    // então o cruzamento de duas não abre buraco. Ver `umbraDoSegmento`.
    contexto.globalCompositeOperation = "destination-out";
    contexto.beginPath();
    for (const umbra of umbras) {
      const [primeiro, ...resto] = umbra;
      if (!primeiro) continue;
      contexto.moveTo(primeiro.x, primeiro.y);
      for (const ponto of resto) contexto.lineTo(ponto.x, ponto.y);
      contexto.closePath();
    }
    contexto.fillStyle = "#000";
    contexto.fill();
    contexto.globalCompositeOperation = "source-over";
  }
}

/**
 * A luz com a FORMA de uma área: o contorno cheio, e a queda para fora em
 * `raio` -- o chão em chamas clareia em retângulo, em círculo, em laço, e não
 * em manchas redondas.
 *
 * A queda é a SOMBRA desfocada do contorno, pintada uma vez quando a luz se
 * forma (e não a cada quadro: o laço da animação só compõe os rascunhos). O
 * contorno é desenhado longe, fora do rascunho, e só a sombra dele cai no
 * lugar. O `shadowBlur` e o deslocamento são em pixels do canvas, que a
 * transformação não escala: daí a `resolucao`.
 */
function luzDaForma(
  contexto: CanvasRenderingContext2D,
  fonte: FonteDeLuz,
  forma: ReadonlyArray<{ x: number; y: number }>,
  resolucao: number,
) {
  const contorno = (dx: number) => {
    contexto.beginPath();
    forma.forEach((ponto, i) =>
      i === 0 ? contexto.moveTo(ponto.x + dx, ponto.y) : contexto.lineTo(ponto.x + dx, ponto.y),
    );
    contexto.closePath();
  };
  const longe = SCENE_WIDTH * 4;

  // A sombra DUAS vezes, e não o contorno cheio por cima: cheio, ele fazia um
  // degrau na borda -- inteiro dentro, metade logo fora -- e a área virava um
  // vidro aceso. Duas sombras chegam à força cheia no miolo e caem sem degrau.
  contexto.save();
  contexto.shadowColor = `rgba(255,255,255,${fonte.intensidade})`;
  contexto.shadowBlur = fonte.raio * resolucao;
  contexto.shadowOffsetX = longe * resolucao;
  contexto.fillStyle = "#fff";
  for (let vez = 0; vez < 2; vez++) {
    contorno(-longe);
    contexto.fill();
  }
  contexto.restore();
}

/** Até onde a luz com forma alcança, a partir do meio: o contorno mais longe, mais o raio. */
function alcanceDaForma(fonte: FonteDeLuz, forma: ReadonlyArray<{ x: number; y: number }>): number {
  return (
    Math.max(...forma.map((ponto) => Math.hypot(ponto.x - fonte.x, ponto.y - fonte.y))) + fonte.raio
  );
}
