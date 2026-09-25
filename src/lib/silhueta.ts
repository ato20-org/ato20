"use client";

/**
 * A silhueta de um token: a figura dele pintada de preto, para deitar no chão.
 *
 * É a sombra que a mesa reconhece — a forma da pessoa, não uma bola embaixo
 * dela. A versão anterior era uma mancha oval: barata, e mentindo sobre o que
 * está em pé no mapa. Um cajado, uma capa, uma montaria: nada disso aparece
 * numa elipse.
 *
 * ## Por que assar, e não filtrar
 *
 * Pelo mesmo motivo do traço do token, e a tabela que reprovou o filtro está em
 * `ManchaDaSombra`: `drop-shadow` na figura deu 37,3 fps contra 59,4 sem sombra
 * nenhuma, com 76,5% dos quadros perdidos. Filtro é um passe por item POR
 * QUADRO, e o palco re-rasteriza a cada quadro em que a câmera anda.
 *
 * Aqui a figura vira pixel preto UMA vez, em memória, e o que o compositor
 * recebe depois é uma imagem comum — o mesmo custo de desenhar um token a mais,
 * e nenhum filtro na árvore. Ver `contorno.ts`, que assa pela mesma razão.
 *
 * Medido na bancada da webview (`scripts/perf/webview.py`), cenário
 * `mestre-camera`, 40 itens, WebKitGTK 2.52.6, janela 1440x900, contra o
 * `next dev` -- que é três vezes mais lento que o `out/`, e por isso o número
 * aqui é o conservador:
 *
 * | desenho      | fps  | p95  | perdidos | nós |
 * | ------------ | ---- | ---- | -------- | --- |
 * | sem sombra   | 59,7 | 17ms |     0,7% | 209 |
 * | mancha oval  | 60,0 | 17ms |     0,7% | 250 |
 * | silhueta     | 60,0 | 19ms |  0%–1,3% | 330 |
 *
 * Quarenta silhuetas custam duzentos nós a mais que a mancha -- três por figura,
 * a caixa que escorre, a que gira e a imagem -- e nenhum quadro. É a diferença
 * entre pintar e FILTRAR: as duas versões reprovadas mexiam na árvore do palco
 * a cada quadro; esta entrega bitmap pronto ao compositor.
 *
 * ## A sombra que o token já traz pintada
 *
 * Fica de FORA, pelo mesmo corte de alfa que o traço usa (`corteDoAlfa`), e a
 * primeira versão errou isto. Token de pacote quase sempre vem com uma sombra
 * própria dentro do PNG, e ela entrava na silhueta como se fosse o sujeito: o
 * vulto saía com uma bolha na ponta, que é a sombra da sombra. O corte separa
 * as duas sem adivinhar cor -- a figura recortada é opaca, a sombra pintada é
 * degradê.
 *
 * O que se perde é a franja suave da borda, e aqui ela não faz falta: o
 * desfoque vem logo depois e refaz o esfumado inteiro. No traço a borda dura é
 * exigência; aqui é indiferente.
 *
 * O que o corte NÃO faz é apagar a sombra pintada do MAPA: ela é pixel do
 * token, e continua desenhada na figura como o arquivo a entregou. O que este
 * forno garante é só que ela não vire sombra de novo.
 *
 * ## Pequena de propósito
 *
 * `LADO_MAX` é bem menor que o do traço. A silhueta é escurecida, deitada,
 * encurtada e desfocada antes de chegar à tela: detalhe ali é textura que o
 * motor carrega sem que ninguém veja. É a mesma economia do `mini` do acervo,
 * feita onde ela não custa nada.
 */

import { carregarImagem, corteDoAlfa } from "@/lib/imagem";

/**
 * Lado maior da silhueta assada, em pixels.
 *
 * Teto e não alvo: arquivo menor é assado no tamanho dele. Um token de 512
 * assado a 256 e depois esticado de volta sai suave, que é como sombra se
 * comporta — o borrão é de graça.
 */
const LADO_MAX = 256;

/**
 * O desfoque da borda, em fração do lado maior da silhueta.
 *
 * Sombra de contorno perfeito lê como recorte de papel em cima do mapa. Pouco,
 * porque a silhueta ainda vai ser esticada até a caixa do token: o que são três
 * pixels aqui viram uma franja larga num token grande.
 */
const DESFOQUE = 0.025;

/** O que sai do forno: a imagem, o transbordo dela e onde estão os pés. */
export type Silhueta = {
  /** Data URL do PNG assado. */
  desenho: string;
  /** Fração da largura da caixa que a imagem passa, de cada lado. */
  margemX: number;
  /** Fração da altura da caixa que a imagem passa, de cada lado. */
  margemY: number;
  /**
   * O retângulo que a figura de fato ocupa, em frações da CAIXA do token.
   *
   * Existe porque quase nenhum token encosta nas bordas do próprio arquivo --
   * PNG de pacote vem quadrado, com a figura no meio e folga em volta. Ancorando
   * a sombra na base da CAIXA, ela nascia descolada, um palmo abaixo das botas,
   * como se o sujeito estivesse flutuando.
   *
   * O retângulo inteiro, e não só a linha de baixo, porque o token GIRA: com a
   * figura deitada, o ponto que encosta no chão é um canto deste retângulo
   * girado, e não a base dele. Ver `peDaFigura`.
   */
  recorte: { esquerda: number; cima: number; direita: number; baixo: number };
};

/**
 * Uma silhueta por imagem, para sempre.
 *
 * Guarda a PROMESSA e não o resultado, como o forno do traço: quarenta tokens
 * do mesmo inimigo montam no mesmo quadro, e guardar só o resultado faria os
 * quarenta assarem a mesma figura antes de o primeiro terminar.
 */
const assadas = new Map<string, Promise<Silhueta | null>>();

/**
 * A silhueta de uma figura. `null` em qualquer falha — arquivo ilegível, canvas
 * negado, tela sem `document`.
 *
 * Falhar é legítimo e não apaga sombra nenhuma: sem silhueta, a figura volta a
 * deitar a mancha oval de sempre. Ver `SombraDaFigura`.
 */
export function silhuetaDaImagem(url: string): Promise<Silhueta | null> {
  const feita = assadas.get(url);
  if (feita) return feita;

  const assando = assar(url).catch(() => null);
  assadas.set(url, assando);

  return assando;
}

async function assar(url: string): Promise<Silhueta | null> {
  const fonte = await carregarImagem(url);

  const largura = fonte.naturalWidth;
  const altura = fonte.naturalHeight;
  if (!largura || !altura) return null;

  const escala = Math.min(1, LADO_MAX / Math.max(largura, altura));
  const w = Math.max(1, Math.round(largura * escala));
  const h = Math.max(1, Math.round(altura * escala));

  const desfoque = Math.max(1, Math.round(Math.max(w, h) * DESFOQUE));
  /**
   * A folga em volta, para o desfoque ter para onde espalhar.
   *
   * Sem ela o borrão é cortado na borda da tela, e um token recortado justo --
   * o ombro encostando na direita -- sai com a sombra esfumada de um lado e
   * cortada a faca do outro. Dois raios cobrem a cauda do desfoque.
   */
  const margem = desfoque * 2;

  const tela = document.createElement("canvas");
  tela.width = w + margem * 2;
  tela.height = h + margem * 2;

  const ctx = tela.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(fonte, margem, margem, w, h);

  // O alfa limiarizado na PRÓPRIA tela: o que não é figura sai, e o que sobra
  // vira massa opaca. É o que deixa a sombra pintada do arquivo de fora -- ver
  // o cabeçalho -- e o que faz o recorte medir o sujeito, e não a mancha dele.
  const recorte = recortarAFigura(ctx, margem, w, h);
  if (!recorte) return null;

  // E agora tudo preto onde a figura está: `source-in` pinta pelo alfa que
  // acabou de ser limpo.
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, tela.width, tela.height);

  return {
    desenho: (borrar(tela, desfoque) ?? tela).toDataURL("image/png"),
    margemX: margem / w,
    margemY: margem / h,
    recorte,
  };
}

/**
 * Apaga tudo que não é figura e devolve o retângulo do que sobrou, em frações
 * da caixa. `null` na imagem sem pixel nenhum.
 *
 * As duas coisas no mesmo passo porque são a mesma varredura de pixel, e ela é
 * o que custa aqui. O corte é o de `corteDoAlfa`, o mesmo do traço: é ele que
 * separa o sujeito da sombra que o arquivo já traz pintada.
 *
 * O recorte importa tanto quanto a limpeza: é dele que sai o PÉ da figura (ver
 * `peDaFigura`), e com a sombra pintada dentro da conta o pé caía na base da
 * mancha em vez da sola da bota -- a sombra nascia um palmo abaixo do sujeito.
 */
function recortarAFigura(
  ctx: CanvasRenderingContext2D,
  margem: number,
  w: number,
  h: number,
): Silhueta["recorte"] | null {
  const quadro = ctx.getImageData(margem, margem, w, h);
  const px = quadro.data;
  const limiar = corteDoAlfa(px, w * h);

  let esquerda = w;
  let direita = -1;
  let cima = h;
  let baixo = -1;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const alfa = (y * w + x) * 4 + 3;

      if (px[alfa]! < limiar) {
        px[alfa] = 0;
        continue;
      }

      px[alfa] = 255;

      if (x < esquerda) esquerda = x;
      if (x > direita) direita = x;
      if (y < cima) cima = y;
      baixo = y;
    }
  }

  if (direita < 0) return null;

  ctx.putImageData(quadro, margem, margem);

  return {
    esquerda: esquerda / w,
    cima: cima / h,
    direita: (direita + 1) / w,
    baixo: (baixo + 1) / h,
  };
}

/**
 * A mesma mancha, com a borda desfocada. `null` onde o motor não filtra canvas.
 *
 * Aqui o filtro é legítimo, e é a diferença que importa: ele roda UMA vez, num
 * canvas fora da tela, e não a cada quadro em cima de um filho do palco.
 */
function borrar(
  mancha: HTMLCanvasElement,
  raio: number,
): HTMLCanvasElement | null {
  const tela = document.createElement("canvas");
  tela.width = mancha.width;
  tela.height = mancha.height;

  const ctx = tela.getContext("2d");
  if (!ctx || typeof ctx.filter !== "string") return null;

  ctx.filter = `blur(${raio}px)`;
  ctx.drawImage(mancha, 0, 0);

  return tela;
}
