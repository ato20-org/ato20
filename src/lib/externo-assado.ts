"use client";

import type { FocoNaFolha } from "@/lib/area-de-efeito";
import {
  desenharFolhaDaArea,
  esmaecerOsPes,
  desenharFolhaDeParticulas,
  gradeDoSprite,
  pintarImagem,
  processarFolha,
  rampaDaCor,
  tamanhoDaFolha,
  tamanhoDoSprite,
  type BordaDaArea,
  type ImagemDaFagulha,
} from "@/lib/folha-de-efeito";
import type { PedidoAoForno, RespostaDoForno } from "@/lib/forno-do-externo.worker";
import { carregarImagem } from "@/lib/imagem";
import type { FolhaDeParticulas, Trajetoria } from "@/lib/particulas";

/**
 * O forno do visual EXTERNO: o mapa de cores, a máscara e a profundidade,
 * aplicados uma vez na folha de quadros.
 *
 * A mesma decisão da pele (`efeito-na-figura.ts`), e pela mesma medida: cada
 * uma dessas três se escreveria em CSS -- `filter`, `mask-image`, duas
 * camadas recortadas --, e as três custariam por quadro, numa arte que se
 * mexe catorze vezes por segundo. Aqui viram pixel UMA vez, por arte, por cor
 * e por nível de mipmap, e o que anda depois é só o `transform` dos quadros.
 *
 * O trabalho corre num WORKER (`forno-do-externo.worker.ts`): na thread da
 * janela, uma folha custava um quadro de 300 ms. Onde não há worker com
 * `OffscreenCanvas`, o mesmo trabalho corre aqui, mais lento mas igual.
 *
 * Com profundidade a folha sai em DUAS: o que passa na frente da figura e o
 * que fica atrás. Sem ela, uma só. As contas são as de `folha-de-efeito.ts`.
 */

/** O que o forno recebe: a folha já no nível escolhido, e o resto. */
export type PedidoDeExterno = {
  url: string;
  /** A grade. Ausente = a imagem é um quadro só. */
  colunas?: number;
  linhas?: number;
  cores?: { cor: string } | { rampa: string };
  mascara?: string;
  profundidade?: string;
};

/** O que sai: endereços de imagem, prontos para a `<img>`. */
export type ExternoAssado = { unica: string } | { atras: string; frente: string };

/** Precisa de forno? Sem nenhum dos três, a folha vai como veio. */
export function precisaDeForno(pedido: Omit<PedidoDeExterno, "url">): boolean {
  return Boolean(pedido.cores || pedido.mascara || pedido.profundidade);
}

/**
 * Um assado por pedido, para sempre -- as razões de `contorno.ts`: a horda
 * pega fogo no mesmo quadro, e o que entra aqui é um punhado de folhas por
 * cor. Guarda a PROMESSA, e não o resultado. Os endereços nunca são
 * revogados: são o assado.
 */
const assados = new Map<string, Promise<ExternoAssado | null>>();

export function assarExterno(pedido: PedidoDeExterno): Promise<ExternoAssado | null> {
  const chave = JSON.stringify(pedido);
  const feito = assados.get(chave);
  if (feito) return feito;

  // `null` em qualquer falha -- arquivo que não veio, canvas negado. O fogo
  // não aparece, e o mapa continua: a arte crua, em cinza, seria pior.
  // O worker que falha cai na thread da janela: mais lento, mas o fogo vem.
  const assando = (temForno() ? noForno(pedido).catch(() => aqui(pedido)) : aqui(pedido)).catch(
    () => null,
  );
  assados.set(chave, assando);

  return assando;
}

/** A rampa do pedido, de uma cor (conta) ou de uma imagem (lida). */
async function rampaDoPedido(pedido: PedidoDeExterno): Promise<Uint8ClampedArray | undefined> {
  if (!pedido.cores) return undefined;
  if ("cor" in pedido.cores) return rampaDaCor(pedido.cores.cor);

  const imagem = await carregarImagem(pedido.cores.rampa);
  const px = pixels(imagem, 256, 1);
  if (!px) return undefined;

  const rampa = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    rampa[i * 3] = px[i * 4]!;
    rampa[i * 3 + 1] = px[i * 4 + 1]!;
    rampa[i * 3 + 2] = px[i * 4 + 2]!;
  }

  return rampa;
}

// --- no worker ---------------------------------------------------------------

let forno: Worker | null = null;
/** O worker não subiu -- o script não veio, o motor recusou. Daí em diante, aqui. */
let fornoQuebrado = false;
let proximo = 0;
const esperando = new Map<number, (resposta: RespostaDoForno) => void>();

function temForno(): boolean {
  return (
    !fornoQuebrado &&
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap !== "undefined"
  );
}

function oForno(): Worker {
  if (forno) return forno;

  // Sem `{ type: "module" }`: é a forma que o Turbopack reconhece como
  // worker e empacota; com ela, o arquivo era copiado cru, em TypeScript.
  forno = new Worker(new URL("./forno-do-externo.worker.ts", import.meta.url));
  forno.onmessage = (evento: MessageEvent<RespostaDoForno>) => {
    const responder = esperando.get(evento.data.id);
    esperando.delete(evento.data.id);
    responder?.(evento.data);
  };
  // Sem isto, um worker que não carrega deixaria cada pedido esperando para
  // sempre, e o fogo nunca apareceria. Quem esperava recebe o erro e cai na
  // thread da janela.
  forno.onerror = () => {
    fornoQuebrado = true;
    for (const [id, responder] of esperando) responder({ id, erro: "o forno não subiu" });
    esperando.clear();
  };

  return forno;
}

/** A imagem decodificada fora da janela: `fetch` e `createImageBitmap`. */
async function bitmap(url: string): Promise<ImageBitmap> {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`imagem não veio: ${url} (${resposta.status})`);

  return createImageBitmap(await resposta.blob());
}

async function noForno(pedido: PedidoDeExterno): Promise<ExternoAssado | null> {
  const [folha, rampa, mascara, profundidade] = await Promise.all([
    bitmap(pedido.url),
    rampaDoPedido(pedido),
    pedido.mascara ? bitmap(pedido.mascara) : undefined,
    pedido.profundidade ? bitmap(pedido.profundidade) : undefined,
  ]);

  const id = ++proximo;
  const mensagem: PedidoAoForno = {
    tipo: "folha",
    id,
    folha,
    colunas: pedido.colunas ?? 1,
    linhas: pedido.linhas ?? 1,
    ...(rampa ? { rampa } : {}),
    ...(mascara ? { mascara } : {}),
    ...(profundidade ? { profundidade } : {}),
  };
  const transferir: Transferable[] = [folha];
  if (mascara) transferir.push(mascara);
  if (profundidade) transferir.push(profundidade);

  const resposta = await pedirAoForno(mensagem, transferir);

  if ("erro" in resposta) throw new Error(resposta.erro);
  if ("unica" in resposta) return { unica: URL.createObjectURL(resposta.unica) };

  return {
    atras: URL.createObjectURL(resposta.atras),
    frente: URL.createObjectURL(resposta.frente),
  };
}

/** Uma mensagem ao forno, e a resposta dela. */
function pedirAoForno(mensagem: PedidoAoForno, transferir: Transferable[]): Promise<RespostaDoForno> {
  return new Promise<RespostaDoForno>((responder) => {
    esperando.set(mensagem.id, responder);
    oForno().postMessage(mensagem, transferir);
  });
}

/**
 * Uma folha pronta para a tela: a que precisa de cor, máscara ou profundidade
 * vai ao forno (e sai a `unica`); a outra vai como veio. É o fogo da área, no
 * chão e de pé no 2.5D.
 */
export async function fonteAssada(pedido: PedidoDeExterno): Promise<string | null> {
  if (!precisaDeForno(pedido)) return pedido.url;

  const assado = await assarExterno(pedido);
  return assado && "unica" in assado ? assado.unica : null;
}

/**
 * A folha numa FAIXA: os quadros lado a lado, numa linha só. É o que deixa a
 * chama de pé do 2.5D andar pela posição do fundo, um elemento só -- a grade
 * de linhas e colunas pedia dois elementos animados por `transform`, e cada um
 * virava uma camada no compositor. Uma vez por folha.
 */
const faixas = new Map<string, Promise<string | null>>();

export function faixaDaFolha(
  url: string,
  grade: { colunas: number; linhas: number; total: number },
): Promise<string | null> {
  const chave = JSON.stringify([url, grade]);
  const feita = faixas.get(chave);
  if (feita) return feita;

  const fazendo = (async () => {
    const imagem = await carregarImagem(url);
    const ql = imagem.naturalWidth / grade.colunas;
    const qa = imagem.naturalHeight / grade.linhas;
    const tela = document.createElement("canvas");
    tela.width = Math.round(ql * grade.total);
    tela.height = Math.round(qa);
    const ctx = tela.getContext("2d");
    if (!ctx) return null;

    for (let k = 0; k < grade.total; k++) {
      const sx = (k % grade.colunas) * ql;
      const sy = Math.floor(k / grade.colunas) * qa;
      ctx.drawImage(imagem, sx, sy, ql, qa, k * ql, 0, ql, qa);
    }

    return new Promise<string | null>((resolver) =>
      tela.toBlob((blob) => resolver(blob ? URL.createObjectURL(blob) : null), "image/png"),
    );
  })().catch(() => null);
  faixas.set(chave, fazendo);

  return fazendo;
}

// --- as partículas -----------------------------------------------------------

/** O que a folha de partículas precisa: o plano, os caminhos, a cor e a imagem. */
export type PedidoDeParticulasAssadas = {
  folha: FolhaDeParticulas;
  caminhos: Trajetoria[];
  cor: string;
  /** O endereço da imagem do pack. Ausente = o brilho redondo. */
  imagem?: string;
  /** Pintar a imagem na `cor`, só a forma. */
  pintar: boolean;
  /** O sprite da imagem. Ausente = um quadro só. */
  quadros?: { colunas: number; total: number; fps?: number };
};

const particulasAssadas = new Map<string, Promise<string | null>>();

/**
 * A folha das partículas, desenhada do zero, uma vez por pedido. Pelo mesmo
 * forno do externo, e com a mesma volta para a janela se ele não subir.
 */
export function assarParticulas(pedido: PedidoDeParticulasAssadas): Promise<string | null> {
  const chave = JSON.stringify(pedido);
  const feita = particulasAssadas.get(chave);
  if (feita) return feita;

  const assando = (
    temForno()
      ? particulasNoForno(pedido).catch(() => particulasAqui(pedido))
      : particulasAqui(pedido)
  ).catch(() => null);
  particulasAssadas.set(chave, assando);

  return assando;
}

async function particulasNoForno(pedido: PedidoDeParticulasAssadas): Promise<string> {
  const imagem = pedido.imagem ? await bitmap(pedido.imagem) : undefined;
  const id = ++proximo;
  const resposta = await pedirAoForno(
    {
      tipo: "particulas",
      id,
      folha: pedido.folha,
      caminhos: pedido.caminhos,
      cor: pedido.cor,
      pintar: pedido.pintar,
      ...(pedido.quadros ? { quadros: pedido.quadros } : {}),
      ...(imagem ? { imagem } : {}),
    },
    imagem ? [imagem] : [],
  );

  if (!("unica" in resposta)) throw new Error("erro" in resposta ? resposta.erro : "forno");
  return URL.createObjectURL(resposta.unica);
}

async function particulasAqui(pedido: PedidoDeParticulasAssadas): Promise<string> {
  const imagem = pedido.imagem ? await carregarImagem(pedido.imagem) : undefined;
  const { folha } = pedido;
  const tela = document.createElement("canvas");
  tela.width = folha.celula.largura * folha.colunas;
  tela.height = folha.celula.altura * folha.linhas;

  const ctx = tela.getContext("2d");
  if (!ctx) throw new Error("sem canvas");

  desenharFolhaDeParticulas(
    ctx,
    folha,
    pedido.caminhos,
    pedido.cor,
    imagem ? spriteAqui(imagem, pedido) : undefined,
  );

  return new Promise((resolver, recusar) =>
    tela.toBlob((blob) => {
      if (blob) resolver(URL.createObjectURL(blob));
      else recusar(new Error("folha não virou imagem"));
    }, "image/png"),
  );
}

/** A imagem da partícula no tamanho que vale, e pintada se o efeito pediu, na thread da janela. */
function spriteAqui(
  imagem: HTMLImageElement,
  pedido: Pick<PedidoDeParticulasAssadas, "quadros" | "pintar" | "cor">,
): ImagemDaFagulha | undefined {
  const grade = gradeDoSprite(pedido.quadros);
  const { largura, altura } = tamanhoDoSprite(
    imagem.naturalWidth,
    imagem.naturalHeight,
    grade.colunas,
    grade.linhas,
  );
  const pequena = document.createElement("canvas");
  pequena.width = largura;
  pequena.height = altura;
  const pctx = pequena.getContext("2d");
  if (!pctx) return undefined;

  if (pedido.pintar) pintarImagem(pctx, imagem, largura, altura, pedido.cor);
  else pctx.drawImage(imagem, 0, 0, largura, altura);
  return { fonte: pequena, largura, altura, ...grade };
}

// --- a área de efeito --------------------------------------------------------

/** O que a folha de uma área precisa: as fontes já assadas, a grade e o plano. */
export type PedidoDeAreaAssada = {
  quadro: { largura: number; altura: number };
  grade: { colunas: number; linhas: number; total: number };
  contorno: Array<{ x: number; y: number }>;
  borda?: BordaDaArea;
  /** O endereço da base JÁ assada na cor. */
  base?: {
    fonte: string;
    grade: { colunas: number; linhas: number; total: number };
    ladrilho: { lado: number; x: number; y: number };
    opacidade: number;
    escurece: number;
  };
  /** O endereço do fogo JÁ assado na cor: o `unica` de `assarExterno`. */
  fogo?: {
    fonte: string;
    grade: { colunas: number; linhas: number; total: number };
    focos: FocoNaFolha[];
  };
  /** As partículas, com a imagem delas quando o efeito tem uma. */
  fagulhas?: PedidoDeParticulasAssadas;
};

const areasAssadas = new Map<string, Promise<string | null>>();

/**
 * A folha de uma área de efeito, montada das camadas, uma vez por pedido. Pelo
 * mesmo forno, e com a mesma volta para a janela.
 *
 * A chave não tem a POSIÇÃO da área, só o plano relativo à caixa dela: a área
 * arrastada de casa em casa pela grade é a mesma folha, e só a caixa anda.
 */
export function assarArea(pedido: PedidoDeAreaAssada): Promise<string | null> {
  const chave = JSON.stringify(pedido);
  const feita = areasAssadas.get(chave);
  if (feita) return feita;

  const assando = (
    temForno() ? areaNoForno(pedido).catch(() => areaAqui(pedido)) : areaAqui(pedido)
  ).catch(() => null);
  areasAssadas.set(chave, assando);

  return assando;
}

async function areaNoForno(pedido: PedidoDeAreaAssada): Promise<string> {
  const { fagulhas } = pedido;
  const [base, fogo, particula] = await Promise.all([
    pedido.base ? bitmap(pedido.base.fonte) : undefined,
    pedido.fogo ? bitmap(pedido.fogo.fonte) : undefined,
    fagulhas?.imagem ? bitmap(fagulhas.imagem) : undefined,
  ]);
  const transferir: Transferable[] = [];
  if (base) transferir.push(base);
  if (fogo) transferir.push(fogo);
  if (particula) transferir.push(particula);

  const resposta = await pedirAoForno(
    {
      tipo: "area",
      id: ++proximo,
      quadro: pedido.quadro,
      grade: pedido.grade,
      contorno: pedido.contorno,
      ...(pedido.borda ? { borda: pedido.borda } : {}),
      ...(pedido.base && base ? { base: { ...pedido.base, fonte: base } } : {}),
      ...(pedido.fogo && fogo ? { fogo: { ...pedido.fogo, fonte: fogo } } : {}),
      ...(fagulhas
        ? {
            fagulhas: {
              folha: fagulhas.folha,
              caminhos: fagulhas.caminhos,
              cor: fagulhas.cor,
              pintar: fagulhas.pintar,
              ...(fagulhas.quadros ? { quadros: fagulhas.quadros } : {}),
              ...(particula ? { imagem: particula } : {}),
            },
          }
        : {}),
    },
    transferir,
  );

  if (!("unica" in resposta)) throw new Error("erro" in resposta ? resposta.erro : "forno");
  return URL.createObjectURL(resposta.unica);
}

async function areaAqui(pedido: PedidoDeAreaAssada): Promise<string> {
  const [base, fogo, particula] = await Promise.all([
    pedido.base ? carregarImagem(pedido.base.fonte) : undefined,
    pedido.fogo ? carregarImagem(pedido.fogo.fonte) : undefined,
    pedido.fagulhas?.imagem ? carregarImagem(pedido.fagulhas.imagem) : undefined,
  ]);
  const { grade, quadro } = pedido;
  const tela = document.createElement("canvas");
  tela.width = quadro.largura * grade.colunas;
  tela.height = quadro.altura * grade.linhas;

  const ctx = tela.getContext("2d");
  if (!ctx) throw new Error("sem canvas");

  desenharFolhaDaArea(ctx, {
    quadro,
    grade,
    contorno: pedido.contorno,
    ...(pedido.borda ? { borda: pedido.borda } : {}),
    ...(pedido.base && base
      ? { base: { ...pedido.base, fonte: base, largura: base.naturalWidth, altura: base.naturalHeight } }
      : {}),
    ...(pedido.fogo && fogo ? { fogo: { ...pedido.fogo, ...fogoSemPeAqui(fogo, pedido.fogo.grade.linhas) } } : {}),
  });
  if (pedido.fagulhas) {
    const { folha, caminhos, cor } = pedido.fagulhas;
    desenharFolhaDeParticulas(
      ctx,
      folha,
      caminhos,
      cor,
      particula ? spriteAqui(particula, pedido.fagulhas) : undefined,
    );
  }

  return new Promise((resolver, recusar) =>
    tela.toBlob((blob) => {
      if (blob) resolver(URL.createObjectURL(blob));
      else recusar(new Error("folha não virou imagem"));
    }, "image/png"),
  );
}

/** O fogo com o pé esmaecido, na thread da janela. Ver `esmaecerOsPes`. */
function fogoSemPeAqui(fogo: HTMLImageElement, linhas: number) {
  const largura = fogo.naturalWidth;
  const altura = fogo.naturalHeight;
  const tela = document.createElement("canvas");
  tela.width = largura;
  tela.height = altura;
  const ctx = tela.getContext("2d");
  if (!ctx) return { fonte: fogo, largura, altura };

  esmaecerOsPes(ctx, fogo, largura, altura, linhas);
  return { fonte: tela, largura, altura };
}

// --- aqui, sem worker --------------------------------------------------------

async function aqui(pedido: PedidoDeExterno): Promise<ExternoAssado | null> {
  const [fonte, rampa, mascara, profundidade] = await Promise.all([
    carregarImagem(pedido.url),
    rampaDoPedido(pedido),
    pedido.mascara ? carregarImagem(pedido.mascara) : undefined,
    pedido.profundidade ? carregarImagem(pedido.profundidade) : undefined,
  ]);

  if (!fonte.naturalWidth || !fonte.naturalHeight) return null;

  const colunas = pedido.colunas ?? 1;
  const linhas = pedido.linhas ?? 1;
  const { largura, altura, ql, qa } = tamanhoDaFolha(
    fonte.naturalWidth,
    fonte.naturalHeight,
    colunas,
    linhas,
  );

  const px = pixels(fonte, largura, altura);
  if (!px) return null;

  const saida = processarFolha({
    px,
    largura,
    altura,
    colunas,
    linhas,
    rampa,
    mascara: mascara ? luminancia(mascara, ql, qa) : undefined,
    profundidade: profundidade ? luminancia(profundidade, ql, qa) : undefined,
  });

  if ("unica" in saida) {
    return { unica: await paraUrl(saida.unica, largura, altura) };
  }

  const [atras, frente] = await Promise.all([
    paraUrl(saida.atras, largura, altura),
    paraUrl(saida.frente, largura, altura),
  ]);

  return { atras, frente };
}

/** A imagem num canvas do tamanho pedido, e os pixels dele. */
function pixels(
  imagem: HTMLImageElement,
  largura: number,
  altura: number,
): Uint8ClampedArray | null {
  const tela = document.createElement("canvas");
  tela.width = largura;
  tela.height = altura;

  const ctx = tela.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(imagem, 0, 0, largura, altura);
  return ctx.getImageData(0, 0, largura, altura).data;
}

/** Um mapa em tons de cinza, esticado para o tamanho do quadro, de 0 a 1. */
function luminancia(imagem: HTMLImageElement, largura: number, altura: number): Float32Array {
  const px = pixels(imagem, largura, altura);
  const saida = new Float32Array(largura * altura);
  if (!px) return saida.fill(1);

  for (let i = 0; i < saida.length; i++) saida[i] = px[i * 4]! / 255;
  return saida;
}

/** Os pixels de volta a uma imagem, por `toBlob`: base64 de dois mil pixels travaria. */
function paraUrl(px: Uint8ClampedArray, largura: number, altura: number): Promise<string> {
  const tela = document.createElement("canvas");
  tela.width = largura;
  tela.height = altura;

  const ctx = tela.getContext("2d");
  if (!ctx) return Promise.reject(new Error("sem canvas"));
  ctx.putImageData(new ImageData(new Uint8ClampedArray(px), largura, altura), 0, 0);

  return new Promise((resolver, recusar) =>
    tela.toBlob((blob) => {
      if (blob) resolver(URL.createObjectURL(blob));
      else recusar(new Error("folha não virou imagem"));
    }, "image/png"),
  );
}
