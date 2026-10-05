"use client";

import { carregarImagem } from "@/lib/imagem";

/**
 * Os efeitos de condição que precisam da SILHUETA da figura, assados uma vez.
 *
 * Três camadas de efeito mexem na cor da figura -- o halo em volta dela, a
 * tinta por cima e o cinza --, e os três se escrevem em uma linha de CSS:
 * `drop-shadow`, `mask-image` e `grayscale`. Nenhum dos três entra, e a razão
 * é a do contorno do item, que já foi medida neste palco: filtro custa passes
 * de blur por token POR QUADRO, e o `drop-shadow` ainda infla a caixa pintada
 * do filho, que é a armadilha do WebKitGTK -- ver `contorno.ts`. A máscara
 * repinta a figura a cada vez que a camada é repintada.
 *
 * Aqui cada efeito vira PIXEL uma vez, em memória.
 *
 * ## A pele: o cinza e a tinta viram a PRÓPRIA figura
 *
 * A primeira versão desenhava a tinta como uma segunda imagem, meio
 * transparente, por cima do token. Medido na webview com quarenta tokens
 * tingidos, no cenário da TV: 22,7% de quadro perdido, contra 0% do cinza --
 * e o cinza já era assado, só que TROCANDO a fonte da figura em vez de pôr
 * uma camada em cima. A diferença entre os dois era só essa camada.
 *
 * Então os dois viram uma coisa só: a pele é a figura com o cinza e a tinta
 * já pintados, e ela entra no lugar do arquivo. Zero nó a mais, zero camada
 * a mais -- o palco desenha o mesmo número de imagens que desenhava antes.
 *
 * A aura não cabe na pele: ela passa da caixa da figura, e é desenhada atrás
 * dela numa imagem própria. Ver `FiguraComEfeitos`.
 *
 * ## A imagem que se mexe
 *
 * A silhueta sai do PRIMEIRO quadro. Numa figura animada a pele troca a
 * animação por um quadro parado -- o preço de não repintar por quadro. É o
 * mesmo preço que a sombra do sol já paga.
 */

/** O que sai do forno: a imagem e o quanto dela sobra para fora da figura. */
export type Assado = {
  /** Data URL do PNG assado. */
  desenho: string;
  /** Fração da largura da figura que a imagem passa, de cada lado. */
  margemX: number;
  /** Fração da altura da figura que a imagem passa, de cada lado. */
  margemY: number;
};

/** O que a pele leva. Os dois juntos são o morto envenenado. */
export type PedidoDePele = {
  cinza: boolean;
  /** A cor da tinta. Ausente = sem tinta. */
  tinta?: string;
  /** Quanto a tinta cobre, de 0 a 1. Ver `FiguraDoEfeito.tinta`. */
  forca?: number;
};

/**
 * Lado maior do assado, em pixels. Teto, e não alvo, como o do contorno.
 *
 * O mesmo número de lá. A pele SUBSTITUI a figura, então ela precisa ter a
 * resolução dela: o token comum é menor que isto e é assado no tamanho dele.
 */
const LADO_MAX = 768;

/** Quanto a tinta cobre, quando o efeito não disse. A do "Tingido" de fábrica. */
const FORCA_DA_TINTA = 0.5;

/**
 * Até onde a aura passa da figura, em fração do lado MAIOR.
 *
 * Pouco, de propósito. A aura transborda a caixa do token, e filho que
 * transborda um plano infla a camada composta no WebKitGTK -- o que derrubou o
 * palco foram retângulos do tamanho do plano, e não bordas de token, mas a
 * regra de ouro continua sendo transbordar o mínimo. Um oitavo lê como halo
 * sem virar uma segunda figura em volta da primeira.
 */
const ALCANCE_DA_AURA = 0.12;

/**
 * Quanto o cinza escurece a figura. O morto não é só descolorido: ele sai da
 * cena, e a figura cinza na mesma luminosidade leria como estátua.
 */
const BRILHO_DO_APAGADO = 0.55;

/**
 * Um assado por pedido, para sempre.
 *
 * Guarda a PROMESSA, e não o resultado, e nunca esvazia -- as duas decisões e
 * as duas razões são as de `contorno.ts`: a horda de quarenta goblins monta no
 * mesmo quadro, e o que entra aqui são PNGs de poucos KB por personagem.
 */
const assados = new Map<string, Promise<Assado | null>>();

function guardado(
  chave: string,
  assar: () => Promise<Assado | null>,
): Promise<Assado | null> {
  const feito = assados.get(chave);
  if (feito) return feito;

  // `null` em qualquer falha -- arquivo ilegível, canvas negado, tela sem
  // `document`. A figura continua desenhando sem o efeito: um veneno que não
  // pinta não pode derrubar o mapa.
  const assando = assar().catch(() => null);
  assados.set(chave, assando);

  return assando;
}

/**
 * A figura com o cinza e a tinta, para entrar no lugar do arquivo.
 *
 * Nada pedido devolve `null` sem abrir o arquivo: é a figura de sempre.
 */
export function assarPele(
  url: string,
  pedido: PedidoDePele,
): Promise<Assado | null> {
  if (!pedido.cinza && !pedido.tinta) return Promise.resolve(null);

  const forca = forcaDaTinta(pedido.forca);

  return guardado(
    `${url}|pele|${pedido.cinza ? "cinza" : ""}|${pedido.tinta ?? ""}|${forca}`,
    async () => {
      const tela = await telaDaFigura(url);
      if (!tela) return null;

      const ctx = tela.getContext("2d");
      if (!ctx) return null;

      if (pedido.cinza) cinza(ctx, tela.width, tela.height);

      // `source-atop`: a cor só cai onde já há figura, com o alfa DELA -- a
      // borda suave do arquivo continua suave, e o fundo transparente continua
      // transparente.
      if (pedido.tinta) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.globalAlpha = forca;
        ctx.fillStyle = pedido.tinta;
        ctx.fillRect(0, 0, tela.width, tela.height);
      }

      return { desenho: tela.toDataURL("image/png"), margemX: 0, margemY: 0 };
    },
  );
}

/**
 * A força pedida, presa entre 0 e 1. Ausente ou torta -- o JSON de um pack
 * escrito à mão -- vira a de fábrica.
 */
export function forcaDaTinta(pedida: number | undefined): number {
  if (typeof pedida !== "number" || !Number.isFinite(pedida)) return FORCA_DA_TINTA;

  return Math.min(1, Math.max(0, pedida));
}

/**
 * O halo: a figura numa cor só, borrada, maior que ela pelo `ALCANCE_DA_AURA`.
 *
 * Borrada pela SOMBRA do canvas, e não por `ctx.filter`: o `shadowBlur` é
 * velho e existe em todo motor, e o `filter` do canvas chegou tarde ao WebKit.
 * Desenhada três vezes porque uma sombra só sai fraca demais para ler sobre um
 * mapa movimentado -- conferido na foto, com duas o halo já sumia no mato.
 *
 * A mancha fica dentro do halo, e é de propósito: a aura desenha ATRÁS da
 * figura, então a mancha some por trás dela -- e na franja suave da borda do
 * arquivo ela aparece, que é justamente onde o halo nasce.
 */
export function assarAura(url: string, cor: string): Promise<Assado | null> {
  return guardado(`${url}|aura|${cor}`, async () => {
    const mancha = await telaDaFigura(url);
    if (!mancha) return null;

    const mc = mancha.getContext("2d");
    if (!mc) return null;

    const w = mancha.width;
    const h = mancha.height;

    mc.globalCompositeOperation = "source-in";
    mc.fillStyle = cor;
    mc.fillRect(0, 0, w, h);

    const raio = Math.max(2, Math.round(Math.max(w, h) * ALCANCE_DA_AURA));

    const tela = document.createElement("canvas");
    tela.width = w + raio * 2;
    tela.height = h + raio * 2;

    const ctx = tela.getContext("2d");
    if (!ctx) return null;

    ctx.shadowColor = cor;
    ctx.shadowBlur = raio;
    for (let passada = 0; passada < 3; passada++) {
      ctx.drawImage(mancha, raio, raio);
    }

    return {
      desenho: tela.toDataURL("image/png"),
      margemX: raio / w,
      margemY: raio / h,
    };
  });
}

/** A figura num canvas próprio, reduzida até o `LADO_MAX` se passar dele. */
async function telaDaFigura(url: string): Promise<HTMLCanvasElement | null> {
  const fonte = await carregarImagem(url);

  const largura = fonte.naturalWidth;
  const altura = fonte.naturalHeight;
  if (!largura || !altura) return null;

  const escala = Math.min(1, LADO_MAX / Math.max(largura, altura));

  const tela = document.createElement("canvas");
  tela.width = Math.max(1, Math.round(largura * escala));
  tela.height = Math.max(1, Math.round(altura * escala));

  const ctx = tela.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(fonte, 0, 0, tela.width, tela.height);

  return tela;
}

/**
 * A figura em cinza e mais escura, com o alfa intacto.
 *
 * Pela luminância, e não pela média dos três canais: o verde pesa mais no olho,
 * e a média faria a capa verde e a vermelha virarem o mesmo cinza que não é o
 * que a figura tinha.
 */
function cinza(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const quadro = ctx.getImageData(0, 0, w, h);
  const px = quadro.data;

  for (let i = 0; i < px.length; i += 4) {
    const luz =
      (0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!) *
      BRILHO_DO_APAGADO;
    px[i] = luz;
    px[i + 1] = luz;
    px[i + 2] = luz;
  }

  ctx.putImageData(quadro, 0, 0);
}
