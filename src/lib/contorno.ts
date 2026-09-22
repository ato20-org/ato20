"use client";

/**
 * O contorno de um token: a silhueta do PNG engrossada, numa cor só.
 *
 * Existe para o mestre olhar o mapa e saber, sem clicar em nada, o que ali é
 * personagem de jogador e o que é do mestre. Um retângulo em volta não serve:
 * token é RECORTE, e a caixa dele é quase sempre maior que a figura -- dois
 * tokens vizinhos teriam caixas encostando enquanto as figuras estão a meio
 * metro uma da outra.
 *
 * ## Por que assar, e não filtrar
 *
 * O jeito curto seria `filter: drop-shadow()` repetido na `<img>`. Custa oito
 * passes de blur por token POR QUADRO, e pior: filtro INFLA a caixa pintada do
 * filho, que é a armadilha número um do WebKitGTK medida neste palco -- ver
 * `debug-do-palco` §3, que já derrubou o mestre três vezes. Aqui o contorno
 * vira pixel uma vez, em memória, e depois é só mais uma imagem no compositor:
 * o custo por quadro é o de desenhar um token a mais, e não há filtro nenhum
 * na árvore.
 *
 * ## A sombra que o próprio token traz pintada
 *
 * Isto é o que fazia o traço parecer sombra torta em vez de adesivo, e custou
 * duas versões para aparecer. Token de pacote quase sempre vem com uma sombra
 * PRÓPRIA, borrada e deslocada para um lado só, dentro do mesmo PNG. O núcleo
 * dela passa de meio alfa. Com o limiar em 128 ela entrava na silhueta, e o
 * resultado era exatamente a queixa: de um lado da figura o traço colava, do
 * outro ele contornava a sombra -- longe da figura, e ainda por baixo do véu
 * escuro dela, que o pintava de cinza. Um traço torto, aberto de um lado só.
 *
 * Duas coisas desfazem isso, e as duas são necessárias:
 *
 * 1. Figura é alfa CHEIO (`ALFA_DA_FIGURA`), não meio alfa. A sombra do PNG é
 *    um degradê, nunca opaca; a figura recortada é. O corte alto separa as
 *    duas sem adivinhar cor -- roupa preta e sombra preta têm a mesma cor, e
 *    só o alfa as distingue.
 * 2. O traço é desenhado POR CIMA do token, não atrás. Ele nasce fora da
 *    silhueta opaca, então não tem figura para cobrir; o que ele cobre é a
 *    franja lisa da borda e o começo da sombra, que é o que um adesivo faz.
 *    Atrás, qualquer sombra do arquivo passava na frente do traço. Ver
 *    `CanvasItemView`.
 *
 * ## Por que a borda é DURA
 *
 * 1. A silhueta sai do ARQUIVO, reduzido no máximo até `LADO_MAX` -- o token
 *    comum não é reduzido nenhuma vez. Da miniatura de 160px ela subia umas
 *    quatro vezes, e chegava borrada.
 * 2. O alfa é limiarizado ANTES de engrossar: dentro ou fora, sem meio termo.
 *    Engrossar um alfa suave espalha um degradê, e degradê lê como sombra.
 * 3. Todo deslocamento da engrossada é INTEIRO. Em posição fracionária o motor
 *    interpola, e a borda dura volta a ser degradê.
 */

/**
 * A grossura do traço, em unidades de cena -- a mesma régua de `item.width`.
 *
 * Absoluta, e não fração de coisa nenhuma. Fração do token dava traço grosso no
 * token grande e fio no pequeno: o Bruno a 389 saía com seis unidades de traço
 * e o inimigo a 119 com menos de duas, três vezes mais fino ao lado. Em unidade
 * de cena, os dois saem iguais na tela, que é como um adesivo se comporta --
 * recortado com a mesma tesoura, não com uma tesoura proporcional ao bicho.
 *
 * Acompanha o zoom da câmera, porque unidade de cena acompanha. É de propósito:
 * o traço faz parte do mapa, e não do HUD. Quem não acompanha o zoom é alça e
 * ícone de gizmo, que são ferramenta -- ver o commit que os fez parar de
 * inchar.
 */
export const GROSSURA_DO_CONTORNO = 2;

/**
 * De quantas em quantas unidades de cena a caixa do item é arredondada para
 * escolher o raio.
 *
 * O raio agora depende do TAMANHO do item, então o assado deixou de ser um por
 * (arquivo, cor) e virou um por (arquivo, cor, tamanho). Sem arredondar, cada
 * pixel de redimensionamento pediria um assado novo e o acervo cresceria sem
 * fim. Com passo de 16, os tamanhos que uma campanha usa de verdade caem em
 * meia dúzia de degraus, e o erro de grossura que o degrau introduz é de no
 * máximo meio passo dividido pela caixa -- num token de 119, uns 7%, que
 * ninguém vê.
 */
const PASSO_DA_CAIXA = 16;

/**
 * Teto do raio, em pixels do assado.
 *
 * Token minúsculo no mapa -- um rato de 24 unidades -- pede, para ter duas
 * unidades de traço, um raio enorme em pixel de arquivo. O teto existe para o
 * engrossar não virar trezentas cópias de uma tela grande; o traço desse token
 * sai um pouco mais fino que os outros, e é o único caso em que sai.
 */
const TETO_DO_RAIO = 72;

/** Personagem que alguém na mesa interpreta. */
export const CONTORNO_DE_JOGADOR = "#60a5fa";

/** Personagem do mestre. */
export const CONTORNO_DE_NPC = "#ffffff";

/**
 * Lado maior da imagem assada, em pixels.
 *
 * Teto, e não alvo: arquivo menor que isto é assado no tamanho dele, e é o caso
 * da maioria dos tokens -- aí o contorno tem a MESMA resolução da figura, e
 * amplia junto com ela sem perder a borda. O teto existe para o token que
 * alguém recortou de um arquivo enorme não virar um bitmap de dez megabytes
 * decodificado ao lado do outro.
 */
const LADO_MAX = 768;

/**
 * A partir de que alfa o pixel é figura, de 0 a 255.
 *
 * Quase 255 de propósito: é o corte que deixa a sombra pintada do próprio PNG
 * de fora -- ver o cabeçalho. Não é 255 cravado porque compressão com perda e
 * conversão de perfil raspam um ou dois pontos do alfa cheio.
 */
const ALFA_DA_FIGURA = 250;

/**
 * O corte de reserva, para o arquivo que não tem alfa cheio em lugar nenhum.
 *
 * Existe token exportado inteiro a 90% de opacidade, e para ele o corte alto
 * devolveria silhueta vazia -- isto é, token sem contorno, sem ninguém saber
 * por quê. Quando quase nada passa no corte alto, o corte cai para meio alfa e
 * o traço volta; o arquivo sem sombra pintada, que é o caso desse tipo de
 * exportação, não perde nada com isso.
 */
const ALFA_DE_RESERVA = 128;

/** Abaixo de que fração da tela a silhueta opaca conta como vazia. */
const PISO_DA_FIGURA = 0.002;

/** O que sai do forno: a imagem e o quanto dela sobra para fora da caixa. */
export type Contorno = {
  /** Data URL do PNG assado. */
  desenho: string;
  /** Fração da largura da caixa que a imagem passa, de cada lado. */
  margemX: number;
  /** Fração da altura da caixa que a imagem passa, de cada lado. */
  margemY: number;
};

/**
 * Um contorno por (imagem, cor), para sempre.
 *
 * Guarda a PROMESSA, e não o resultado: quarenta tokens do mesmo inimigo
 * montam no mesmo quadro, e guardar o resultado faria os quarenta assarem a
 * mesma silhueta antes de o primeiro terminar.
 *
 * Nunca esvazia, e isso é de propósito. O que entra aqui é um PNG de poucos KB
 * por personagem da campanha -- dezenas, não milhares --, e é a razão de o
 * resultado ser data URL e não `createObjectURL`: uma blob URL exigiria saber
 * quando ninguém mais a usa, que é exatamente o vazamento que o acervo deste
 * projeto já teve e removeu. Ver `useAssetUrl`.
 */
const assados = new Map<string, Promise<Contorno | null>>();

/**
 * O contorno de uma figura, numa cor.
 *
 * `null` em qualquer falha -- arquivo ilegível, canvas negado, tela sem
 * `document`. O token continua desenhando sem contorno, que é o de antes: um
 * enfeite do palco do mestre não pode derrubar o mapa.
 */
export function contornoDaImagem(
  url: string,
  cor: string,
  /** A caixa do item na cena, que decide o raio. Ver `GROSSURA_DO_CONTORNO`. */
  largura: number,
  altura: number,
): Promise<Contorno | null> {
  const cx = degrau(largura);
  const cy = degrau(altura);
  const chave = `${url}|${cor}|${cx}x${cy}`;

  const feito = assados.get(chave);
  if (feito) return feito;

  const assando = assar(url, cor, cx, cy).catch(() => null);
  assados.set(chave, assando);

  return assando;
}

/** A caixa arredondada para o degrau. Ver `PASSO_DA_CAIXA`. */
function degrau(lado: number): number {
  return Math.max(
    PASSO_DA_CAIXA,
    Math.round(lado / PASSO_DA_CAIXA) * PASSO_DA_CAIXA,
  );
}

async function assar(
  url: string,
  cor: string,
  cx: number,
  cy: number,
): Promise<Contorno | null> {
  const fonte = await carregar(url);

  const largura = fonte.naturalWidth;
  const altura = fonte.naturalHeight;
  if (!largura || !altura) return null;

  const escala = Math.min(1, LADO_MAX / Math.max(largura, altura));
  const w = Math.max(1, Math.round(largura * escala));
  const h = Math.max(1, Math.round(altura * escala));

  const mascara = silhueta(fonte, w, h, cor);
  if (!mascara) return null;

  // O raio DESFAZ o esticamento.
  //
  // A imagem assada é esticada até a caixa do item: cada pixel do assado vira
  // `cx / w` unidades de cena na horizontal e `cy / h` na vertical. Para o
  // traço sair com `GROSSURA_DO_CONTORNO` unidades dos quatro lados, o raio em
  // pixel de arquivo tem de ser a grossura dividida por esses fatores -- é a
  // conta abaixo, e é por isso que ela é por EIXO. Um raio só nos dois eixos
  // sairia igual apenas no token que ninguém deformou.
  const rx = raio((w * GROSSURA_DO_CONTORNO) / cx);
  const ry = raio((h * GROSSURA_DO_CONTORNO) / cy);

  const folha = engrossar(mascara, rx, ry);
  if (!folha) return null;

  const fc = folha.getContext("2d");
  if (!fc) return null;

  // Tira a própria figura da mancha, deixando só o anel em volta.
  //
  // Sem isto o contorno seria uma silhueta CHEIA, e como ele é desenhado por
  // cima da figura ele a cobriria inteira -- o token viraria um vulto de uma
  // cor só.
  //
  // Pela MESMA máscara que cresceu, e por nada além dela: o anel encosta na
  // figura exatamente onde a figura acaba. Apagar também pelo alfa cru do
  // arquivo comeria o anel em cima da sombra pintada, que é o lado em que ele
  // mais faz falta.
  fc.globalCompositeOperation = "destination-out";
  fc.drawImage(mascara, rx, ry);

  return {
    desenho: folha.toDataURL("image/png"),
    margemX: rx / w,
    margemY: ry / h,
  };
}

/** Um raio inteiro, nunca zero, nunca acima do teto. */
function raio(bruto: number): number {
  return Math.min(TETO_DO_RAIO, Math.max(1, Math.round(bruto)));
}

/**
 * A figura virada mancha de uma cor só, com borda dura.
 *
 * O limiar é o ponto: `source-in` sozinho manteria o alfa suave da borda do
 * PNG, e engrossar um alfa suave espalha um degradê -- que é o que lê como
 * sombra. Aqui cada pixel decide de que lado está antes de qualquer cópia.
 */
function silhueta(
  fonte: HTMLImageElement,
  w: number,
  h: number,
  cor: string,
): HTMLCanvasElement | null {
  const tela = document.createElement("canvas");
  tela.width = w;
  tela.height = h;

  const ctx = tela.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(fonte, 0, 0, w, h);

  const { r, g, b } = separar(cor);
  const quadro = ctx.getImageData(0, 0, w, h);
  const px = quadro.data;

  const limiar = corte(px, w * h);

  for (let i = 0; i < px.length; i += 4) {
    const dentro = px[i + 3] >= limiar;

    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = dentro ? 255 : 0;
  }

  ctx.putImageData(quadro, 0, 0);

  return tela;
}

/** Qual corte de alfa usar neste arquivo. Ver `ALFA_DE_RESERVA`. */
function corte(px: Uint8ClampedArray, pixels: number): number {
  let opacos = 0;

  for (let i = 3; i < px.length; i += 4) {
    if (px[i] >= ALFA_DA_FIGURA) opacos++;
  }

  return opacos >= pixels * PISO_DA_FIGURA ? ALFA_DA_FIGURA : ALFA_DE_RESERVA;
}

/**
 * A mancha engrossada por uma elipse de raios `rx` e `ry`.
 *
 * Engrossar é a união da mancha consigo mesma deslocada para todo lado dentro
 * da elipse. Fazer isso cópia a cópia seriam milhares de desenhos; aqui são uns
 * quatro por pixel de raio, porque a largura cresce de um em um e cada passo
 * aproveita o anterior: a mancha esticada em `k` é a esticada em `k-1` unida a
 * ela mesma um pixel para cada lado. A cada passo, as linhas cuja meia-largura
 * na elipse é exatamente `k` são despejadas na folha final.
 *
 * O crescimento acontece numa tela que JÁ tem a margem dos dois lados, e a
 * mancha nasce nela deslocada de `rx, ry`. Isso não é arrumação: crescer numa tela
 * do tamanho do arquivo recortava o que passasse da borda, e token recortado
 * justo -- o ombro encostando na direita, a bota no rodapé -- ficava com
 * contorno em dois lados e nada nos outros dois. Aqui a mancha sempre tem para
 * onde crescer, porque a margem é exatamente o quanto ela vai crescer.
 *
 * Todo deslocamento é INTEIRO. Meio pixel faria o motor interpolar, e a borda
 * dura que o limiar criou voltaria a ser um degradê.
 */
function engrossar(
  mascara: HTMLCanvasElement,
  rx: number,
  ry: number,
): HTMLCanvasElement | null {
  const largura = mascara.width + 2 * rx;
  const altura = mascara.height + 2 * ry;

  const folha = document.createElement("canvas");
  folha.width = largura;
  folha.height = altura;

  const fc = folha.getContext("2d");
  if (!fc) return null;

  // As linhas agrupadas por meia-largura, para cada uma ser despejada no passo
  // em que a mancha esticada tem exatamente aquela largura.
  const porLargura = new Map<number, number[]>();

  for (let dy = -ry; dy <= ry; dy++) {
    const k = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)));
    porLargura.set(k, [...(porLargura.get(k) ?? []), dy]);
  }

  const passo = document.createElement("canvas");
  passo.width = largura;
  passo.height = altura;

  const pc = passo.getContext("2d");
  if (!pc) return null;

  pc.drawImage(mascara, rx, ry);

  for (let k = 0; k <= rx; k++) {
    if (k > 0) {
      // A tela desenhada sobre si mesma: é legítimo, e o motor usa o conteúdo
      // de antes do desenho.
      pc.drawImage(passo, -1, 0);
      pc.drawImage(passo, 1, 0);
    }

    for (const dy of porLargura.get(k) ?? []) {
      fc.drawImage(passo, 0, dy);
    }
  }

  return folha;
}

/** `#rrggbb` em componentes. As cores do contorno são constantes deste módulo,
 *  e não texto que o usuário escreve -- não há formato a adivinhar. */
function separar(cor: string): { r: number; g: number; b: number } {
  const n = Number.parseInt(cor.slice(1), 16);

  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * A imagem carregada de um jeito que o canvas aceite ler de volta.
 *
 * Pelos BYTES, e não apontando a `<img>` para o daemon. A janela do mestre e o
 * daemon são origens diferentes, e uma imagem cross-origin CONTAMINA o canvas:
 * `getImageData` e `toDataURL` jogam em vez de devolver. `crossOrigin` resolveria
 * no papel -- o daemon responde `Access-Control-Allow-Origin: *` em tudo, ver
 * `serve.rs` --, mas o mesmo arquivo já foi buscado SEM CORS pelo próprio
 * palco, e um acerto de cache do modo errado faz o pedido falhar por um motivo
 * que não aparece em lugar nenhum. Um blob local não tem origem para discordar.
 *
 * A blob URL é revogada assim que a imagem carrega: quem guarda cópia daqui
 * para a frente é o `assados`, e o endereço não serve mais para nada. A imagem
 * já decodificada continua desenhável depois da revogação.
 */
async function carregar(url: string): Promise<HTMLImageElement> {
  const resposta = await fetch(url);
  if (!resposta.ok) {
    throw new Error(`contorno sem imagem: ${url} (${resposta.status})`);
  }

  const endereco = URL.createObjectURL(await resposta.blob());

  try {
    return await new Promise<HTMLImageElement>((resolver, recusar) => {
      const img = new Image();
      img.onload = () => resolver(img);
      img.onerror = () => recusar(new Error(`contorno ilegível: ${url}`));
      img.src = endereco;
    });
  } finally {
    URL.revokeObjectURL(endereco);
  }
}
