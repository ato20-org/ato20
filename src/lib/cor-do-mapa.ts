"use client";

/**
 * A cor que o mapa tem num pedaço dele.
 *
 * Existe para a face da parede no 2.5D. A face não é pedaço nenhum do mapa: o
 * autor desenhou a parede vista DE CIMA, e o lado dela não está pintado em
 * lugar algum do arquivo. A primeira versão puxava a tira de mapa que encosta
 * na base e a esticava pela altura -- e o que subia era o chão do corredor
 * borrado na vertical, que numa mesa lê como mancha, não como pedra.
 *
 * O que sobe agora é a cor da PRÓPRIA parede, lida do topo dela. A laje já
 * mostra a pedra que o autor pintou; a face repete a cor dessa pedra, chapada.
 * É como mapa de mesa fake volume desde sempre, e é honesto sobre o que se
 * sabe: a altura é invenção nossa, então ela não finge textura que ninguém
 * desenhou.
 *
 * ## Por que assar, e não ler pixel na hora
 *
 * Mesma razão de `silhueta.ts`: o palco re-rasteriza a cada quadro em que a
 * câmera anda, e uma leitura de `getImageData` por quadro é um passe pela
 * imagem por quadro. Aqui o mapa vira um retrato pequeno UMA vez, em memória, e
 * cada parede lê dele uma dúzia de pixels quando nasce ou se move.
 *
 * ## Dominante, e não média
 *
 * A média de um topo de parede com uma tocha acesa em cima é cinza puxado para
 * o amarelo da tocha -- e aí a parede inteira fica cor de tocha. A dominante
 * quantiza grosso, conta os baldes, pega o mais cheio e tira a média só de quem
 * caiu nele: a pedra ganha por maioria e a tocha vira o que ela é, um detalhe
 * de doze pixels. Mesma ideia de uma paleta reduzida, sem a paleta.
 */

import { caberEm } from "@/lib/geometry/caber";
import { carregarImagem } from "@/lib/imagem";
import type { Vec } from "@/lib/geometry/transform";
import { SCENE_HEIGHT, SCENE_WIDTH } from "@/types/scene";

/**
 * Lado maior do retrato assado, em pixels.
 *
 * Pequeno de propósito, como o `LADO_MAX` da silhueta. O que sai daqui é UMA
 * cor por parede: detalhe é textura que o motor carrega para ser descartada na
 * média. A 640 cada pixel vale três unidades de cena, e uma parede é grossa em
 * dezenas -- sobra resolução de sobra para a dúzia de amostras que ela pede.
 */
const LADO_MAX = 640;

/**
 * Quantos bits de cada canal sobrevivem à quantização.
 *
 * Três: oito níveis por canal, 512 baldes. Com quatro bits a pedra se espalhava
 * por baldes vizinhos -- o mesmo granito em duas luzes caía em dois lugares e
 * nenhum dos dois era maioria de nada. Três junta o que o olho já junta.
 */
const BITS = 3;
const DESCARTE = 8 - BITS;

/** O mapa reduzido a pixel cru, pronto para ser perguntado. */
export type AmostraDoMapa = {
  largura: number;
  altura: number;
  dados: Uint8ClampedArray;
};

/**
 * Assa o mapa num retrato pequeno.
 *
 * Devolve `null` em vez de estourar, pela mesma regra da silhueta: quem chamou
 * desenha o que desenhava antes. Uma face sem cor volta a ser a face texturizada
 * de antes -- pior, e não quebrada.
 *
 * O canvas fica CONTAMINADO se a imagem vier de outra origem, e aí
 * `getImageData` lança. Não é problema nesta casa -- o mapa vem de `/asset/*`
 * ou de `/bancada/*`, ambos servidos pelo mesmo endereço da página --, mas o
 * `try` está aqui porque o preço de errar é a tela preta e o de acertar é uma
 * chave.
 */
export function amostraDoMapa(url: string): Promise<AmostraDoMapa | null> {
  // O chão e o gizmo da parede pedem o MESMO mapa, e cada pedido é um fetch,
  // um decode e um passe de pixels. A promessa fica guardada, e o segundo
  // pedido recebe a mesma.
  const guardada = assados.get(url);
  if (guardada) return guardada;

  const promessa = assar(url);
  assados.set(url, promessa);
  // Falha não fica guardada: o daemon que não respondeu agora pode responder
  // no próximo pedido.
  void promessa.then((amostra) => {
    if (!amostra && assados.get(url) === promessa) assados.delete(url);
  });
  // Duas: a cena de agora e a de antes. Trocar de cena e voltar não reassa, e
  // um mapa de oito mil pixels não fica preso na memória para sempre.
  while (assados.size > 2) {
    assados.delete(assados.keys().next().value!);
  }
  return promessa;
}

/** Os retratos já assados, pela url. Ver `amostraDoMapa`. */
const assados = new Map<string, Promise<AmostraDoMapa | null>>();

async function assar(url: string): Promise<AmostraDoMapa | null> {
  try {
    const img = await carregarImagem(url);

    const escala = Math.min(
      LADO_MAX / Math.max(img.naturalWidth, 1),
      LADO_MAX / Math.max(img.naturalHeight, 1),
      1,
    );
    const largura = Math.max(1, Math.round(img.naturalWidth * escala));
    const altura = Math.max(1, Math.round(img.naturalHeight * escala));

    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;

    const pincel = canvas.getContext("2d", { willReadFrequently: true });
    if (!pincel) return null;

    pincel.drawImage(img, 0, 0, largura, altura);

    return {
      largura,
      altura,
      dados: pincel.getImageData(0, 0, largura, altura).data,
    };
  } catch {
    return null;
  }
}

type Balde = { n: number; r: number; g: number; b: number };

/**
 * O pixel do retrato sob um ponto de CENA, ou `null` fora do mapa.
 *
 * O mapa CABE no plano, sem esticar -- é a conta de `FundoDaCena`. Um mapa que
 * não é 16:9 deixa faixas dos lados, e ler o ponto como fração do plano
 * inteiro pegava a cor de um pedaço ao lado da parede, tanto mais longe quanto
 * mais perto da borda. O retrato tem a proporção do arquivo, e é o que basta
 * para refazer o encaixe.
 */
function pixelSob(amostra: AmostraDoMapa, ponto: Vec): { x: number; y: number } | null {
  const lugar = caberEm(
    { largura: amostra.largura, altura: amostra.altura },
    { width: SCENE_WIDTH, height: SCENE_HEIGHT },
  );
  const x = Math.floor(((ponto.x - lugar.x) / lugar.width) * amostra.largura);
  const y = Math.floor(((ponto.y - lugar.y) / lugar.height) * amostra.altura);
  if (x < 0 || y < 0 || x >= amostra.largura || y >= amostra.altura) return null;
  return { x, y };
}

/** Os pontos contados em baldes de cor grossa. Ver `BITS`. */
function baldesDe(amostra: AmostraDoMapa, pontos: Vec[]): Balde[] {
  const contagem = new Map<number, Balde>();

  for (const ponto of pontos) {
    const pixel = pixelSob(amostra, ponto);
    if (!pixel) continue;

    const i = (pixel.y * amostra.largura + pixel.x) * 4;
    const r = amostra.dados[i]!;
    const g = amostra.dados[i + 1]!;
    const b = amostra.dados[i + 2]!;
    const a = amostra.dados[i + 3]!;
    // Mapa com buraco transparente: o que está ali é o fundo do palco, e não
    // material de parede nenhum.
    if (a < 128) continue;

    const balde =
      ((r >> DESCARTE) << (BITS * 2)) | ((g >> DESCARTE) << BITS) | (b >> DESCARTE);

    const atual = contagem.get(balde);
    if (atual) {
      atual.n += 1;
      atual.r += r;
      atual.g += g;
      atual.b += b;
    } else {
      contagem.set(balde, { n: 1, r, g, b });
    }
  }

  return [...contagem.values()];
}

function emHex(r: number, g: number, b: number): string {
  const canal = (valor: number) =>
    Math.round(valor).toString(16).padStart(2, "0");
  return `#${canal(r)}${canal(g)}${canal(b)}`;
}

/** A cor média de um balde: a de quem caiu nele, e não a do meio do balde. */
function corDoBalde(balde: Balde): string {
  return emHex(balde.r / balde.n, balde.g / balde.n, balde.b / balde.n);
}

/**
 * A cor dominante do mapa nos pontos dados, em coordenadas de CENA.
 *
 * Os pontos são amostras, e não uma região: quem chama sabe onde a parede é
 * grossa e onde ela é um traço, e passar a forma para cá seria ensinar geometria
 * de parede a um módulo que só sabe ler imagem.
 *
 * `null` quando nenhum ponto cai dentro do mapa -- uma parede arrastada para
 * fora do plano, que é gesto legítimo enquanto se desenha.
 */
export function corDominante(
  amostra: AmostraDoMapa,
  pontos: Vec[],
): string | null {
  let vencedor: Balde | null = null;
  for (const balde of baldesDe(amostra, pontos)) {
    if (!vencedor || balde.n > vencedor.n) vencedor = balde;
  }

  return vencedor ? corDoBalde(vencedor) : null;
}

/**
 * Quão longe duas cores ficam para contarem como DUAS sugestões, na régua RGB.
 *
 * Os baldes de três bits já separam tons vizinhos em lugares diferentes, e o
 * mesmo telhado em luz e sombra caía em dois -- duas bolinhas que o olho lê
 * como uma. Abaixo disto, fica a mais cheia.
 */
const DISTANCIA_ENTRE_SUGESTOES = 48;

/**
 * As cores que MAIS aparecem nos pontos, da mais cheia para a menos, sem
 * repetir tom: as sugestões de cor da face, tiradas do pedaço de mapa que a
 * parede cobre.
 *
 * É a `corDominante` com o pódio inteiro. O primeiro lugar é a cor que a face
 * já sobe sozinha; os outros são o que a mesma área tem de segundo e terceiro
 * -- a telha e a sombra dela, o reboco e a madeira do beiral --, e é entre eles
 * que o palpite costuma errar.
 */
export function paletaDaArea(
  amostra: AmostraDoMapa,
  pontos: Vec[],
  quantas: number,
): string[] {
  const escolhidos: Balde[] = [];

  for (const balde of baldesDe(amostra, pontos).sort((a, b) => b.n - a.n)) {
    if (escolhidos.length >= quantas) break;
    const perto = escolhidos.some(
      (outro) =>
        Math.hypot(
          balde.r / balde.n - outro.r / outro.n,
          balde.g / balde.n - outro.g / outro.n,
          balde.b / balde.n - outro.b / outro.n,
        ) < DISTANCIA_ENTRE_SUGESTOES,
    );
    if (!perto) escolhidos.push(balde);
  }

  return escolhidos.map(corDoBalde);
}

/**
 * A cor do mapa num ponto de cena: o conta-gotas.
 *
 * A média dos nove pixels em volta, e não o do meio: o retrato é pequeno (ver
 * `LADO_MAX`), e um pixel só pega o grão do desenho -- o rejunte entre duas
 * telhas, a borda escura de um traço. Nove dão o tom que o olho vê ali.
 *
 * `null` fora do mapa, ou sobre buraco transparente.
 */
export function corNoPonto(amostra: AmostraDoMapa, ponto: Vec): string | null {
  const centro = pixelSob(amostra, ponto);
  if (!centro) return null;

  let n = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const x = centro.x + dx;
      const y = centro.y + dy;
      if (x < 0 || y < 0 || x >= amostra.largura || y >= amostra.altura) continue;
      const i = (y * amostra.largura + x) * 4;
      if (amostra.dados[i + 3]! < 128) continue;
      n += 1;
      r += amostra.dados[i]!;
      g += amostra.dados[i + 1]!;
      b += amostra.dados[i + 2]!;
    }
  }

  return n > 0 ? emHex(r / n, g / n, b / n) : null;
}

/**
 * A mesma cor, mais escura.
 *
 * Multiplica os canais e devolve hexadecimal, em vez de empilhar uma camada
 * preta translúcida por cima. Não é preciosismo: a face é um `div`, e um véu
 * por face é um retângulo a mais na árvore e uma mistura a mais por quadro,
 * vezes quatro lados vezes as paredes do mapa. Aqui a conta sai uma vez, em
 * JavaScript, e o que chega ao compositor é uma cor chapada -- o desenho mais
 * barato que existe.
 *
 * Multiplicar é também o que se parece com luz: um cinza a 60% vira cinza
 * escuro, e uma pedra amarelada a 60% continua amarelada. Um véu preto por cima
 * lava a matiz de todas as paredes na direção do cinza, e o mapa perde a
 * diferença entre o granito e o tijolo.
 */
export function escurecerCor(cor: string, fator: number): string {
  const cru = cor.replace("#", "");
  if (cru.length !== 6) return cor;

  const claro = Math.max(0, fator);
  const canal = (de: number) =>
    Math.min(255, Math.round(parseInt(cru.slice(de, de + 2), 16) * claro))
      .toString(16)
      .padStart(2, "0");

  return `#${canal(0)}${canal(2)}${canal(4)}`;
}
