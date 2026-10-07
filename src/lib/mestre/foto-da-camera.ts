import { pontosNaCaixa } from "@/lib/geometry/area-escondida";
import { caberEm } from "@/lib/geometry/caber";
import {
  daTelaAoChaoNoTripe,
  figuraNoTripe,
  profundidadeNoTripe,
} from "@/lib/geometry/camera-orbital";
import { peDe, sobeDe } from "@/lib/geometry/peca-de-esguelha";
import { ceuNaTela } from "@/lib/geometry/panorama-do-ceu";
import type { Vec } from "@/lib/geometry/transform";
import { sceneForTable } from "@/lib/sync/for-table";
import { assetUrl, type Variante } from "@/lib/vault/assets";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type CanvasItem,
  type FogRegion,
  type Scene,
  type Tripe,
  type Viewport,
} from "@/types/scene";

/**
 * O tamanho da foto, em pixels: 16:9 como a tela da mesa, e pequena de
 * propósito. É para reconhecer o lugar e quem está nele numa lista, e não
 * para ler o mapa -- e cada foto mora no `localStorage`.
 */
export const LARGURA_DA_FOTO = 192;
export const ALTURA_DA_FOTO = 108;

/** A qualidade do JPEG: baixa, porque a foto é um lembrete, e não um mapa. */
const QUALIDADE = 0.5;

/**
 * A assinatura do que a foto mostra: o recorte da câmera e a última mudança
 * da cena. Mudou uma das duas, a foto está velha.
 *
 * A cena inteira pela `updatedAt`, e não token a token: qualquer coisa que a
 * mesa vê pode ter mudado -- um token andou, uma área se revelou --, e a conta
 * fina custaria mais que tirar a foto de novo.
 */
export function assinaturaDaFoto(
  scene: Pick<Scene, "updatedAt" | "backgroundAssetId" | "ceuAssetId">,
  recorte: Viewport,
): string {
  return [
    recorte.x,
    recorte.y,
    recorte.width,
    recorte.height,
    scene.updatedAt,
    scene.backgroundAssetId ?? "",
  ].join("|");
}

/** A assinatura da foto de um TRIPÉ: o olho inteiro, e a cena. */
export function assinaturaDoTripe(
  scene: Pick<Scene, "updatedAt" | "backgroundAssetId" | "ceuAssetId">,
  tripe: Tripe,
): string {
  return [
    "tripe",
    tripe.x,
    tripe.y,
    tripe.altura,
    tripe.giro,
    tripe.inclinacao,
    tripe.rolagem,
    tripe.lente,
    scene.updatedAt,
    scene.backgroundAssetId ?? "",
    scene.ceuAssetId ?? "",
  ].join("|");
}

/**
 * As imagens já carregadas, por endereço. Uma vez por sessão: a mesma imagem
 * de token aparece em dez câmeras e em dez fotos seguidas da mesma câmera.
 */
const imagens = new Map<string, Promise<HTMLImageElement | null>>();

function carregar(assetId: string, variante: Variante) {
  const chave = `${assetId}/${variante}`;
  let pedido = imagens.get(chave);
  if (!pedido) {
    pedido = assetUrl(assetId, variante).then(
      (url) =>
        new Promise<HTMLImageElement | null>((pronta) => {
          const imagem = new Image();
          // O daemon libera CORS para todo mundo, e sem isto o canvas ficaria
          // "sujo" ao desenhar a imagem e o `toDataURL` jogaria exceção.
          imagem.crossOrigin = "anonymous";
          imagem.decoding = "async";
          imagem.onload = () => pronta(imagem);
          imagem.onerror = () => pronta(null);
          imagem.src = url;
        }),
      () => null,
    );
    imagens.set(chave, pedido);
  }
  return pedido;
}

/**
 * Uma foto de como a mesa veria esta câmera: o mapa, os tokens visíveis, os
 * riscos e a névoa fechada em preto. `null` sem canvas ou se o navegador
 * recusar a imagem.
 *
 * Desenhada a partir dos DADOS, num canvas, e não fotografando a tela: o
 * WebKitGTK não tem como transformar DOM em imagem, e a câmera que não está
 * na tela também precisa da sua. É o recorte de mesa (`sceneForTable`), o
 * mesmo que a TV recebe -- sem os escondidos, sem a anotação do mestre.
 *
 * Sem luz, escuridão, furos nem névoa dinâmica: em 192 pixels isso não se lê,
 * e cada um pediria o canvas da luz inteiro. É "onde fica" e "quem está".
 */
export async function fotografarCamera(
  scene: Scene,
  recorte: Viewport,
): Promise<string | null> {
  const daMesa = sceneForTable(scene);
  const canvas = novoCanvas(LARGURA_DA_FOTO, ALTURA_DA_FOTO);
  const contexto = canvas?.getContext("2d");
  if (!daMesa || !canvas || !contexto) return null;

  const imagens = await imagensDaCena(daMesa);

  contexto.fillStyle = daMesa.corDoVazio ?? "#000000";
  contexto.fillRect(0, 0, LARGURA_DA_FOTO, ALTURA_DA_FOTO);

  // Da cena para a foto: o recorte ocupa a foto inteira.
  const escala = LARGURA_DA_FOTO / recorte.width;
  contexto.setTransform(escala, 0, 0, escala, -recorte.x * escala, -recorte.y * escala);
  desenharChao(contexto, daMesa, imagens, () => true);

  return paraJpeg(canvas);
}

/**
 * A resolução da textura do chão do tripé, em fração do plano: 480x270. O
 * bastante para a foto de 192 pixels, que vê o chão de longe e inclinado, e
 * pouco para custar -- é desenhada uma vez por foto.
 */
const ESCALA_DA_TEXTURA = 0.25;

/**
 * Em quantas faixas a tela do tripé é cortada para o chão entrar em
 * perspectiva, e em quantas colunas quando o tripé está de lado. Cada pedaço
 * vira dois triângulos, e cada triângulo um `drawImage` afim: 24 faixas são 48
 * desenhos, e o erro da perspectiva dentro de uma faixa de quatro pixels não
 * se vê.
 */
const FAIXAS = 24;
const COLUNAS_DE_LADO = 4;

/**
 * Uma foto de como a mesa veria este TRIPÉ: o chão em perspectiva, com o que
 * está nele, e as figuras em pé por cima. `null` sem canvas.
 *
 * Sem palco e sem WebGL: as contas do 2.5D já são puras (`camera-orbital`), e
 * a foto as usa direto. O chão é desenhado primeiro VISTO DE CIMA numa textura
 * pequena -- o mapa, os deitados, os riscos e a névoa, com a mesma rotina da
 * foto 2D -- e depois projetado: a tela é cortada em faixas, cada faixa em
 * dois triângulos, os cantos de cada um vão ao chão (`daTelaAoChaoNoTripe`), e
 * a textura entra em cada triângulo por uma transformação afim recortada. A
 * névoa que passa por trás do olho fica certa sem conta nenhuma: ela é parte
 * da textura. As figuras em pé vêm depois, do fundo para a frente, com o pé e
 * a escala que o 2.5D usa (`peDe`, `figuraNoTripe`).
 *
 * Sem o volume das paredes, sem luz e sem sombra: em 192 pixels o chão e
 * quem está nele bastam para reconhecer o lugar.
 */
export async function fotografarTripe(
  scene: Scene,
  tripe: Tripe,
): Promise<string | null> {
  const daMesa = sceneForTable(scene);
  const canvas = novoCanvas(LARGURA_DA_FOTO, ALTURA_DA_FOTO);
  const contexto = canvas?.getContext("2d");
  const textura = novoCanvas(
    Math.round(SCENE_WIDTH * ESCALA_DA_TEXTURA),
    Math.round(SCENE_HEIGHT * ESCALA_DA_TEXTURA),
  );
  const daTextura = textura?.getContext("2d");
  if (!daMesa || !canvas || !contexto || !textura || !daTextura) return null;

  const imagens = await imagensDaCena(daMesa);

  // O chão visto de cima: só o que está DEITADO nele.
  daTextura.setTransform(ESCALA_DA_TEXTURA, 0, 0, ESCALA_DA_TEXTURA, 0, 0);
  desenharChao(daTextura, daMesa, imagens, (item) => Boolean(item.deitado));

  contexto.fillStyle = daMesa.corDoVazio ?? "#000000";
  contexto.fillRect(0, 0, LARGURA_DA_FOTO, ALTURA_DA_FOTO);

  // O céu, atrás do chão, com a mesma conta da tela. Ver `CeuPanoramico`.
  if (imagens.ceu) desenharCeu(contexto, imagens.ceu, tripe);

  projetarChao(contexto, textura, tripe);

  // As figuras em pé, da mais longe para a mais perto.
  const emPe = daMesa.items
    .map((item, indice) => ({ item, imagem: imagens.itens[indice] }))
    .filter(({ item, imagem }) => !item.deitado && imagem)
    .map((peca) => ({
      ...peca,
      profundidade: profundidadeNoTripe(tripe, peDe(peca.item), 0),
    }))
    .sort((a, b) => b.profundidade - a.profundidade);

  const tela = { largura: LARGURA_DA_FOTO, altura: ALTURA_DA_FOTO };
  for (const { item, imagem } of emPe) {
    // No teto em que pisa, como o chão de esguelha a desenha. Ver `sobeDe`.
    const naTela = figuraNoTripe(
      tripe,
      tela,
      peDe(item),
      sobeDe(item, daMesa.paredes),
    );
    if (!naTela || !imagem) continue;

    const largura = item.width * naTela.escala;
    const altura = item.height * naTela.escala;
    contexto.setTransform(1, 0, 0, 1, 0, 0);
    contexto.translate(naTela.x, naTela.y);
    if (naTela.giro) contexto.rotate((naTela.giro * Math.PI) / 180);
    if (item.flipX) contexto.scale(-1, 1);
    contexto.globalAlpha = item.opacity ?? 1;
    contexto.drawImage(imagem, -largura / 2, -altura, largura, altura);
  }
  contexto.setTransform(1, 0, 0, 1, 0, 0);
  contexto.globalAlpha = 1;

  return paraJpeg(canvas);
}

/**
 * O chão em perspectiva: a textura vista de cima, entrando triângulo por
 * triângulo na tela do tripé.
 *
 * Só da linha do horizonte para baixo: acima dela o raio do olho não desce
 * até o chão, e ali fica a cor do vazio, como no 2.5D.
 */
function projetarChao(
  contexto: CanvasRenderingContext2D,
  textura: HTMLCanvasElement,
  tripe: Tripe,
) {
  const tela = { largura: LARGURA_DA_FOTO, altura: ALTURA_DA_FOTO };
  const noChao = (pixel: Vec) => daTelaAoChaoNoTripe(tripe, tela, pixel);

  // A primeira linha cujas duas pontas tocam o chão. Um pixel abaixo dela, e
  // não nela: rente ao horizonte o chão está longe demais para a conta.
  let topo = 0;
  while (
    topo < ALTURA_DA_FOTO &&
    (!noChao({ x: 0, y: topo }) || !noChao({ x: LARGURA_DA_FOTO, y: topo }))
  )
    topo += 1;
  topo += 1;
  if (topo >= ALTURA_DA_FOTO) return;

  const colunas = tripe.rolagem ? COLUNAS_DE_LADO : 1;
  const altura = (ALTURA_DA_FOTO - topo) / FAIXAS;
  const largura = LARGURA_DA_FOTO / colunas;
  // Da cena para o pixel da textura.
  const naTextura = (ponto: Vec): Vec => ({
    x: ponto.x * ESCALA_DA_TEXTURA,
    y: ponto.y * ESCALA_DA_TEXTURA,
  });

  for (let faixa = 0; faixa < FAIXAS; faixa += 1) {
    const y0 = topo + faixa * altura;
    const y1 = y0 + altura;
    for (let coluna = 0; coluna < colunas; coluna += 1) {
      const x0 = coluna * largura;
      const x1 = x0 + largura;
      const cantos: Vec[] = [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ];
      const noPiso = cantos.map(noChao);
      if (noPiso.some((ponto) => !ponto)) continue;
      const fonte = (noPiso as Vec[]).map(naTextura);

      desenharTriangulo(contexto, textura, [fonte[0]!, fonte[1]!, fonte[2]!], [cantos[0]!, cantos[1]!, cantos[2]!]);
      desenharTriangulo(contexto, textura, [fonte[0]!, fonte[2]!, fonte[3]!], [cantos[0]!, cantos[2]!, cantos[3]!]);
    }
  }
  contexto.setTransform(1, 0, 0, 1, 0, 0);
}

type Matriz = [number, number, number, number, number, number];
type Triangulo = [Vec, Vec, Vec];

/**
 * A transformação afim que leva o triângulo `de` ao triângulo `para`, na
 * ordem do `setTransform`. `null` se `de` não tem área.
 */
export function afimDoTriangulo(de: Triangulo, para: Triangulo): Matriz | null {
  const [s0, s1, s2] = de;
  const [d0, d1, d2] = para;
  const sx1 = s1.x - s0.x;
  const sy1 = s1.y - s0.y;
  const sx2 = s2.x - s0.x;
  const sy2 = s2.y - s0.y;
  const determinante = sx1 * sy2 - sx2 * sy1;
  if (Math.abs(determinante) < 1e-9) return null;

  const dx1 = d1.x - d0.x;
  const dy1 = d1.y - d0.y;
  const dx2 = d2.x - d0.x;
  const dy2 = d2.y - d0.y;

  const a = (dx1 * sy2 - dx2 * sy1) / determinante;
  const c = (dx2 * sx1 - dx1 * sx2) / determinante;
  const b = (dy1 * sy2 - dy2 * sy1) / determinante;
  const d = (dy2 * sx1 - dy1 * sx2) / determinante;

  return [a, b, c, d, d0.x - a * s0.x - c * s0.y, d0.y - b * s0.x - d * s0.y];
}

/**
 * Um triângulo da textura num triângulo da tela. O recorte é o triângulo da
 * tela, crescido meio pixel para fora do centro: sem a folga, a emenda entre
 * dois triângulos vizinhos deixaria um fio da cor do vazio.
 */
function desenharTriangulo(
  contexto: CanvasRenderingContext2D,
  textura: HTMLCanvasElement,
  de: Triangulo,
  para: Triangulo,
) {
  const matriz = afimDoTriangulo(de, para);
  if (!matriz) return;

  const centro = {
    x: (para[0].x + para[1].x + para[2].x) / 3,
    y: (para[0].y + para[1].y + para[2].y) / 3,
  };
  const folga = (ponto: Vec): Vec => {
    const dx = ponto.x - centro.x;
    const dy = ponto.y - centro.y;
    const distancia = Math.hypot(dx, dy) || 1;
    return {
      x: ponto.x + (dx / distancia) * 0.5,
      y: ponto.y + (dy / distancia) * 0.5,
    };
  };

  contexto.save();
  contexto.setTransform(1, 0, 0, 1, 0, 0);
  contexto.beginPath();
  para.map(folga).forEach((ponto, i) =>
    i === 0 ? contexto.moveTo(ponto.x, ponto.y) : contexto.lineTo(ponto.x, ponto.y),
  );
  contexto.closePath();
  contexto.clip();
  contexto.setTransform(...matriz);
  contexto.drawImage(textura, 0, 0);
  contexto.restore();
}

/** Um canvas novo, ou `null` fora do navegador. */
function novoCanvas(largura: number, altura: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  return canvas;
}

/** O JPEG da foto, ou `null` se uma imagem sem CORS sujou o canvas. */
function paraJpeg(canvas: HTMLCanvasElement): string | null {
  try {
    return canvas.toDataURL("image/jpeg", QUALIDADE);
  } catch {
    return null;
  }
}

/**
 * As imagens de uma cena de mesa, todas juntas: esperar uma por uma faria a
 * foto de quarenta tokens levar quarenta idas ao daemon em fila. Os itens na
 * ordem de `items`.
 */
async function imagensDaCena(daMesa: Scene) {
  const [fundo, ceu, ...itens] = await Promise.all([
    daMesa.backgroundAssetId
      ? carregar(daMesa.backgroundAssetId, "tela")
      : Promise.resolve(null),
    // O céu só sai na foto do tripé, mas carregar de graça quando não há não
    // custa nada: o `carregar` guarda.
    daMesa.ceuAssetId ? carregar(daMesa.ceuAssetId, "tela") : Promise.resolve(null),
    ...daMesa.items.map((item) => carregar(item.assetId, "mini")),
  ]);
  return { fundo, ceu, itens };
}

/**
 * O panorama do céu na foto do tripé: a conta de `ceuNaTela`, repetida na
 * horizontal até cobrir a largura, e girada pela rolagem em volta do meio.
 */
function desenharCeu(
  contexto: CanvasRenderingContext2D,
  imagem: HTMLImageElement,
  tripe: Tripe,
) {
  const ceu = ceuNaTela(tripe, {
    largura: LARGURA_DA_FOTO,
    altura: ALTURA_DA_FOTO,
  });

  contexto.save();
  if (ceu.rolagem) {
    contexto.translate(LARGURA_DA_FOTO / 2, ALTURA_DA_FOTO / 2);
    contexto.rotate((ceu.rolagem * Math.PI) / 180);
    contexto.translate(-LARGURA_DA_FOTO / 2, -ALTURA_DA_FOTO / 2);
  }
  for (let x = ceu.x; x < LARGURA_DA_FOTO; x += ceu.largura) {
    contexto.drawImage(imagem, x, ceu.y, ceu.largura, ceu.altura);
  }
  contexto.restore();
}

/**
 * O chão visto de cima, na transformação que já está no contexto (unidade de
 * cena): o mapa, os itens que `incluir` deixa, os riscos e a névoa fechada. A
 * foto 2D desenha todos os itens; a textura do tripé, só os deitados -- os em
 * pé sobem depois, na perspectiva.
 */
function desenharChao(
  contexto: CanvasRenderingContext2D,
  daMesa: Scene,
  imagens: Awaited<ReturnType<typeof imagensDaCena>>,
  incluir: (item: CanvasItem) => boolean,
) {
  const { fundo } = imagens;
  if (fundo) {
    // O mesmo encaixe do palco: o mapa inteiro dentro do plano, centrado.
    const lugar = caberEm(
      { largura: fundo.naturalWidth, altura: fundo.naturalHeight },
      { width: SCENE_WIDTH, height: SCENE_HEIGHT },
    );
    contexto.drawImage(fundo, lugar.x, lugar.y, lugar.width, lugar.height);
  }

  daMesa.items
    .map((item, indice) => ({ item, imagem: imagens.itens[indice] }))
    .filter(({ item, imagem }) => imagem && incluir(item))
    .sort((a, b) => a.item.z - b.item.z)
    .forEach(({ item, imagem }) => {
      contexto.save();
      contexto.translate(item.x + item.width / 2, item.y + item.height / 2);
      if (item.rotation) contexto.rotate((item.rotation * Math.PI) / 180);
      contexto.scale(item.flipX ? -1 : 1, item.flipY ? -1 : 1);
      contexto.globalAlpha = item.opacity ?? 1;
      contexto.drawImage(
        imagem!,
        -item.width / 2,
        -item.height / 2,
        item.width,
        item.height,
      );
      contexto.restore();
    });

  for (const traco of daMesa.tracos ?? []) {
    if (traco.pontos.length < 4) continue;
    contexto.beginPath();
    contexto.moveTo(traco.pontos[0]!, traco.pontos[1]!);
    for (let i = 2; i + 1 < traco.pontos.length; i += 2) {
      contexto.lineTo(traco.pontos[i]!, traco.pontos[i + 1]!);
    }
    contexto.strokeStyle = traco.cor;
    contexto.lineWidth = traco.espessura;
    contexto.lineCap = "round";
    contexto.lineJoin = "round";
    contexto.globalAlpha = traco.opacidade ?? 1;
    contexto.stroke();
  }
  contexto.globalAlpha = 1;

  // Por último, como no palco: a névoa cobre tudo o que está embaixo dela.
  contexto.fillStyle = "#000000";
  for (const area of daMesa.fog) {
    if (area.revealed) continue;
    desenharArea(contexto, area);
  }
}

/** Uma área escondida cheia, na forma e no giro dela. */
function desenharArea(contexto: CanvasRenderingContext2D, area: FogRegion) {
  contexto.save();
  contexto.translate(area.x + area.width / 2, area.y + area.height / 2);
  if (area.rotation) contexto.rotate((area.rotation * Math.PI) / 180);
  contexto.translate(-area.width / 2, -area.height / 2);

  contexto.beginPath();
  const formato = area.formato ?? "retangulo";
  const vertices =
    formato === "poligono" ? pontosNaCaixa(area, area.pontos ?? []) : [];
  if (formato === "elipse") {
    contexto.ellipse(
      area.width / 2,
      area.height / 2,
      area.width / 2,
      area.height / 2,
      0,
      0,
      Math.PI * 2,
    );
  } else if (vertices.length >= 3) {
    contexto.moveTo(vertices[0]!.x, vertices[0]!.y);
    for (const ponto of vertices.slice(1)) contexto.lineTo(ponto.x, ponto.y);
    contexto.closePath();
  } else {
    contexto.rect(0, 0, area.width, area.height);
  }
  contexto.fill();
  contexto.restore();
}
