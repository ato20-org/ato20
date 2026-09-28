import {
  paredeDeVerdade,
  segmentosDaParede,
  type Segmento,
} from "@/lib/geometry/sombra";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type CanvasItem,
  type Luz,
  type Parede,
} from "@/types/scene";

/**
 * A luz da cena, fora de qualquer componente.
 *
 * O que é conta pura mora aqui pela razão de sempre: três telas acendem o mesmo
 * mapa -- o Mestre, a TV e o celular --, e cada uma calcula a própria luz a
 * partir das paredes e das fontes que recebe. Uma conta escrita dentro de uma
 * delas seria reescrita nas outras duas.
 *
 * A geometria da sombra de parede vista de um PONTO é a da tocha que existiu
 * até o PR #90 -- ver `git show 1b355c1^:src/lib/geometry/sombra.ts`. Ela foi
 * reescrita para devolver pontos, e não caminhos de SVG: quem desenha agora é
 * um canvas. Ver `LuzLayer`.
 */

export type Ponto = { x: number; y: number };

/**
 * Uma luz pronta para desenhar, venha de onde vier.
 *
 * A cravada no mapa e a que um token carrega viram a mesma coisa aqui: um
 * centro, um alcance e uma cor. Dali para baixo ninguém precisa saber quem
 * a segura.
 */
export type FonteDeLuz = {
  /** O da luz solta, ou o do item que a carrega. */
  id: string;
  x: number;
  y: number;
  raio: number;
  /** Até onde a luz é forte, já preso entre 0 e o `raio`. */
  raioIntenso: number;
  cor: string;
  /** De 0 a 1, já preso. A lanterna de um token acende sempre inteira. */
  intensidade: number;
};

/**
 * A parte do alcance que é luz forte, quando ninguém disse.
 *
 * Metade: a luz de antes dos dois raios caía assim, forte até o meio e sumindo
 * até a borda, e uma campanha que já tinha tochas reabre com elas iguais. A
 * lanterna do token usa sempre esta, porque o menu dela só tem o alcance.
 */
export const FRACAO_INTENSA_PADRAO = 0.5;

/** O raio forte, preso entre zero e a área. Ausente vira a metade dela. */
export function raioIntensoDe(
  raio: number,
  pedido: number | undefined,
): number {
  const valor =
    typeof pedido === "number" && Number.isFinite(pedido)
      ? pedido
      : raio * FRACAO_INTENSA_PADRAO;

  return Math.min(raio, Math.max(0, valor));
}

/** O alcance mínimo que se desenha. Menos que isto é um ponto, e não luz. */
const RAIO_MINIMO = 1;

function fonteValida(fonte: FonteDeLuz): boolean {
  return (
    Number.isFinite(fonte.x) &&
    Number.isFinite(fonte.y) &&
    Number.isFinite(fonte.raio) &&
    fonte.raio >= RAIO_MINIMO
  );
}

/**
 * Prende a intensidade entre 0 e 1, ou devolve 1 para o que não é número.
 *
 * Um, e não zero, no que falta: ausente é a luz de antes de a intensidade
 * existir, que acendia inteira.
 */
export function limitarIntensidade(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor)
    ? Math.min(1, Math.max(0, valor))
    : 1;
}

/**
 * Todas as luzes da cena: as soltas e as que os tokens carregam.
 *
 * A carregada acende do CENTRO da caixa do token, e não do canto: é de onde a
 * mesa lê que o personagem está. Girar o token não mexe no centro, então não
 * mexe na luz.
 *
 * O que não é número some aqui, na entrada, e não lá no desenho: uma fonte com
 * `NaN` pede um degradê inválido ao canvas, e o `createRadialGradient` joga
 * exceção -- a luz do mapa inteiro apagaria por causa de uma. É a lição da
 * parede sem caixa, em `paredeDeVerdade`.
 */
export function fontesDaCena(
  luzes: ReadonlyArray<Luz> | undefined,
  items: ReadonlyArray<CanvasItem>,
): FonteDeLuz[] {
  const fontes: FonteDeLuz[] = [];

  for (const luz of luzes ?? []) {
    fontes.push({
      id: luz.id,
      x: luz.x,
      y: luz.y,
      raio: luz.raio,
      raioIntenso: raioIntensoDe(luz.raio, luz.raioIntenso),
      cor: luz.cor,
      intensidade: limitarIntensidade(luz.intensidade),
    });
  }

  for (const item of items) {
    if (!item.luz) continue;

    fontes.push({
      id: item.id,
      x: item.x + item.width / 2,
      y: item.y + item.height / 2,
      raio: item.luz.raio,
      raioIntenso: raioIntensoDe(item.luz.raio, undefined),
      cor: item.luz.cor,
      intensidade: 1,
    });
  }

  return fontes.filter(fonteValida);
}

/**
 * Uma chave que muda quando, e só quando, o desenho da luz muda.
 *
 * Existe por causa do arrasto: o palco do Mestre entrega a lista de itens
 * NOVA a cada quadro em que um token anda, e redesenhar a luz porque um token
 * SEM lanterna andou seria pagar o canvas inteiro por nada. A chave dos
 * mesmos números é a mesma string, e o efeito do desenho não roda.
 */
export function chaveDasFontes(fontes: ReadonlyArray<FonteDeLuz>): string {
  return fontes
    .map(
      (fonte) =>
        `${fonte.id}:${fonte.x.toFixed(1)},${fonte.y.toFixed(1)},${fonte.raio.toFixed(1)},${fonte.raioIntenso.toFixed(1)},${fonte.cor},${fonte.intensidade.toFixed(2)}`,
    )
    .join("|");
}

/** O quanto a luz ainda tem na borda do raio forte, em fração da do centro. */
const FORCA_NA_BORDA_INTENSA = 0.8;

/** Quantas paradas o degradê tem em cada trecho. Mais que isto não se vê. */
const PARADAS_NO_NUCLEO = 3;
const PARADAS_NA_AREA = 6;

/**
 * Como a luz cai do centro até a borda: as paradas do degradê, `[onde, força]`.
 *
 * Mais forte quanto mais perto do centro, SEMPRE, e sem platô: a luz de uma
 * vela não é um disco chapado com borda borrada. Dois trechos:
 *
 * - no RAIO FORTE ela cai devagar, de inteira no centro até oito décimos na
 *   borda dele. É onde se lê o mapa.
 * - na ÁREA, dali até o fim, ela cai em curva até zero: rápido logo depois do
 *   raio forte, e com uma cauda longa até a borda -- é a penumbra, onde se vê
 *   o vulto e não o rosto.
 *
 * `onde` em fração do raio da área, de 0 a 1, e crescente -- é o que o
 * `addColorStop` exige. A força já vem multiplicada pela intensidade da luz.
 */
export function paradasDaLuz(
  fonte: Pick<FonteDeLuz, "raio" | "raioIntenso" | "intensidade">,
): Array<[number, number]> {
  const forca = fonte.intensidade;
  // Nunca o alcance inteiro: sem nenhum trecho de área, a luz terminaria numa
  // borda dura, e uma parede de luz no meio do mapa não é o que se pediu.
  const nucleo =
    fonte.raio > 0 ? Math.min(0.98, fonte.raioIntenso / fonte.raio) : 0;
  const naBorda = forca * FORCA_NA_BORDA_INTENSA;

  const paradas: Array<[number, number]> = [[0, forca]];

  if (nucleo > 0) {
    for (let i = 1; i <= PARADAS_NO_NUCLEO; i += 1) {
      const t = i / PARADAS_NO_NUCLEO;
      // Quadrática: quase nada cai perto do centro, e o resto até a borda.
      paradas.push([nucleo * t, forca - (forca - naBorda) * t * t]);
    }
  }

  const partida = nucleo > 0 ? naBorda : forca;
  for (let i = 1; i <= PARADAS_NA_AREA; i += 1) {
    const u = i / PARADAS_NA_AREA;
    // Expoente acima de um: cai depressa logo depois do raio forte, e a
    // penumbra se arrasta até a borda da área.
    paradas.push([nucleo + (1 - nucleo) * u, partida * (1 - u) ** 1.6]);
  }

  return paradas;
}

/**
 * Os segmentos que param luz, de todas as paredes.
 *
 * Separado das fontes de propósito: parede não se mexe quando um token anda,
 * e quem desenha guarda isto num `useMemo` das paredes -- o quadro do arrasto
 * não recalcula parede nenhuma.
 *
 * TODOS os segmentos, e não só os que olham para a luz, como faz o sol: um
 * segmento para o raio que o cruza venha ele de que lado vier, e as duas faces
 * de uma parede fechada dão a mesma sombra somada. Escolher faces pouparia
 * metade das contas e custaria o caso da luz DENTRO de uma sala desenhada como
 * retângulo, que é justamente o da tocha na parede.
 */
export function segmentosDasParedes(
  paredes: ReadonlyArray<Parede> | undefined,
): Segmento[] {
  return (paredes ?? []).filter(paredeDeVerdade).flatMap(segmentosDaParede);
}

/**
 * Quanto a sombra passa do alcance da luz.
 *
 * Dois por cento. Sem folga, a borda longe da sombra caía em cima da borda do
 * degradê, e o arredondamento do raster deixava um fio de luz escapando por
 * trás da parede, bem onde a mesa olha para saber se o corredor continua.
 */
const FOLGA_DA_UMBRA = 1.02;

/**
 * O pedaço de um segmento que cai DENTRO do alcance da luz. `null` se nenhum.
 *
 * Projetar uma ponta que está fora do círculo virava o quadrilátero do avesso:
 * a conta empurra cada ponta para longe da luz até a borda do alcance, e numa
 * ponta que já passou dessa borda "até a borda" é para TRÁS -- um vulto
 * atravessando a própria parede, apontando para a luz. Recortando antes, as
 * duas pontas estão sempre dentro.
 */
export function recortarNoCirculo(
  segmento: Segmento,
  fonte: Pick<FonteDeLuz, "x" | "y" | "raio">,
): Segmento | null {
  const dx = segmento.x2 - segmento.x1;
  const dy = segmento.y2 - segmento.y1;
  const fx = segmento.x1 - fonte.x;
  const fy = segmento.y1 - fonte.y;

  // |A + t·d - L|² = r², em t.
  const a = dx * dx + dy * dy;
  if (a === 0) return null;

  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - fonte.raio * fonte.raio;
  const delta = b * b - 4 * a * c;

  // Sem raiz real: a reta inteira passa longe do círculo.
  if (delta < 0) return null;

  const raiz = Math.sqrt(delta);
  const entrada = Math.max(0, (-b - raiz) / (2 * a));
  const saida = Math.min(1, (-b + raiz) / (2 * a));

  // O trecho aceso é vazio: o segmento está todo fora do alcance.
  if (saida <= entrada) return null;

  return {
    x1: segmento.x1 + dx * entrada,
    y1: segmento.y1 + dy * entrada,
    x2: segmento.x1 + dx * saida,
    y2: segmento.y1 + dy * saida,
  };
}

/**
 * O vulto que um segmento joga para trás, visto desta luz. `null` quando ele
 * não recebe luz nenhuma.
 *
 * Quatro pontos: as duas pontas do trecho ACESO e as duas projeções delas, cada
 * uma empurrada para longe da luz na reta que sai dela. Nenhum ângulo é
 * varrido e nenhum pixel é lido -- um segmento custa duas raízes quadradas.
 *
 * Sempre no MESMO sentido de giro. Quem desenha junta todas as sombras de uma
 * luz num caminho só, e com a regra de preenchimento padrão dois quadriláteros
 * de sentidos opostos que se cruzam abririam um BURACO de luz no cruzamento --
 * bem no canto onde duas paredes se encontram.
 */
export function umbraDoSegmento(
  segmento: Segmento,
  fonte: Pick<FonteDeLuz, "x" | "y" | "raio">,
): Ponto[] | null {
  const aceso = recortarNoCirculo(segmento, fonte);
  if (!aceso) return null;

  const direcao = (x: number, y: number) => {
    const dx = x - fonte.x;
    const dy = y - fonte.y;
    const distancia = Math.hypot(dx, dy);
    // A luz exatamente em cima da ponta: não há para onde empurrar.
    if (distancia === 0) return null;
    return { dx: dx / distancia, dy: dy / distancia, distancia };
  };

  const raio1 = direcao(aceso.x1, aceso.y1);
  const raio2 = direcao(aceso.x2, aceso.y2);
  if (!raio1 || !raio2) return null;

  /**
   * A borda longe da sombra é uma CORDA, e corda entra no círculo.
   *
   * Empurrar as duas pontas até a mesma distância deixa o meio da borda mais
   * perto da luz do que as pontas -- e quanto mais aberto o ângulo que o
   * segmento abre visto da luz, maior o afundamento. Numa parede perto da
   * tocha, isso comia a sombra bem no meio dela. Dividir pelo cosseno da metade
   * do ângulo empurra a corda para fora na medida exata.
   */
  const cosseno = raio1.dx * raio2.dx + raio1.dy * raio2.dy;
  const metade = Math.sqrt(Math.max(0, (1 + cosseno) / 2));
  const alcance = (fonte.raio * FOLGA_DA_UMBRA) / Math.max(metade, 0.25);

  const projetar = (
    x: number,
    y: number,
    rumo: { dx: number; dy: number; distancia: number },
  ): Ponto => {
    // Aditivo, e não "até o raio": depois do recorte a ponta está dentro, então
    // a sobra é positiva e a projeção nunca volta para trás.
    const sobra = Math.max(0, alcance - rumo.distancia);
    return { x: x + rumo.dx * sobra, y: y + rumo.dy * sobra };
  };

  const pontos = [
    { x: aceso.x1, y: aceso.y1 },
    projetar(aceso.x1, aceso.y1, raio1),
    projetar(aceso.x2, aceso.y2, raio2),
    { x: aceso.x2, y: aceso.y2 },
  ];

  return areaComSinal(pontos) < 0 ? pontos.reverse() : pontos;
}

/** A área do polígono com o sinal do sentido de giro. Positiva num, negativa no outro. */
function areaComSinal(pontos: ReadonlyArray<Ponto>): number {
  let soma = 0;

  for (let i = 0; i < pontos.length; i += 1) {
    const a = pontos[i]!;
    const b = pontos[(i + 1) % pontos.length]!;
    soma += a.x * b.y - b.x * a.y;
  }

  return soma / 2;
}

/** Todas as sombras que as paredes jogam, vistas desta luz. */
export function umbrasDaLuz(
  segmentos: ReadonlyArray<Segmento>,
  fonte: Pick<FonteDeLuz, "x" | "y" | "raio">,
): Ponto[][] {
  const umbras: Ponto[][] = [];

  for (const segmento of segmentos) {
    const umbra = umbraDoSegmento(segmento, fonte);
    if (umbra) umbras.push(umbra);
  }

  return umbras;
}

/**
 * O que um token tapa da luz: a SILHUETA dele, deitada para longe da luz, e
 * o PÉ enquanto ela não fica pronta.
 *
 * A silhueta é a mesma que o sol deita (`silhuetaDaImagem`), e a caixa aqui é
 * o que ela precisa para deitar igual ao token -- ver `matrizDaFigura`. O pé,
 * um círculo no centro da caixa, é a sombra de reserva: o forno ainda
 * trabalhando, ou a imagem que não pôde ser lida. Círculo e não a caixa: token
 * é imagem com folga transparente em volta, e a caixa inteira projetaria um
 * quadrado onde a mesa vê um personagem.
 */
export type Oclusor = {
  id: string;
  /** O centro do pé. */
  x: number;
  y: number;
  raio: number;
  /**
   * A caixa do token como ele aparece: é dela que a SILHUETA é deitada. Ver
   * `matrizDaFigura`. O `assetId` diz de que imagem a silhueta sai.
   */
  caixa: CaixaDoToken;
  assetId: string;
};

/** O que a silhueta precisa saber do token para deitar igual a ele. */
export type CaixaDoToken = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  flipX?: boolean;
  flipY?: boolean;
};

/** O pé do token, em fração do menor lado da caixa. */
export const FRACAO_DO_PE = 0.35;

/**
 * O comprimento da sombra de um token, em raios do pé.
 *
 * Curta, e não até a borda do alcance como a da parede: o personagem é baixo
 * e a tocha está no alto. Uma sombra de token até a borda da luz seria um
 * muro preto saindo de cada goblin -- e com três tochas numa sala, três
 * muros por goblin. Aqui é a sombra MÍNIMA: diz de onde vem a luz e que
 * aquele corpo a tapa, sem riscar o mapa.
 */
export const COMPRIMENTO_DA_SOMBRA = 2.5;

/**
 * Quanto de luz a sombra do token tira, no ponto mais escuro dela.
 *
 * Menos que tudo: a luz de uma tocha contorna um corpo, e uma sombra
 * totalmente preta colada no token leria como buraco no chão.
 */
export const FORCA_DA_SOMBRA_DA_FIGURA = 0.85;

/**
 * Os tokens que tapam luz: todos com caixa de verdade, menos os que o mestre
 * disse que não fazem sombra (`semSombra`), que valem para o sol e para as
 * luzes igual.
 */
export function oclusoresDosItens(items: ReadonlyArray<CanvasItem>): Oclusor[] {
  const oclusores: Oclusor[] = [];

  for (const item of items) {
    if (item.semSombra) continue;

    const lado = Math.min(item.width, item.height);
    const oclusor: Oclusor = {
      id: item.id,
      x: item.x + item.width / 2,
      y: item.y + item.height / 2,
      raio: lado * FRACAO_DO_PE,
      caixa: {
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        rotation: item.rotation,
        ...(item.flipX ? { flipX: true } : {}),
        ...(item.flipY ? { flipY: true } : {}),
      },
      assetId: item.assetId,
    };

    if (
      Number.isFinite(oclusor.x) &&
      Number.isFinite(oclusor.y) &&
      Number.isFinite(oclusor.raio) &&
      oclusor.raio > 0
    ) {
      oclusores.push(oclusor);
    }
  }

  return oclusores;
}

/** O token está ao alcance desta luz? O pé encostando na borda já conta. */
export function alcancaOclusor(
  fonte: Pick<FonteDeLuz, "x" | "y" | "raio">,
  oclusor: Oclusor,
): boolean {
  return (
    Math.hypot(oclusor.x - fonte.x, oclusor.y - fonte.y) - oclusor.raio <
    fonte.raio
  );
}

/**
 * Os tokens que alguma luz alcança, na forma de uma chave.
 *
 * Soma-se à de `chaveDasFontes`: um token sem lanterna andando perto de uma
 * tocha muda a sombra dele, e o canvas tem de repintar. O que anda LONGE de
 * toda luz não entra, e arrastá-lo continua não custando nada.
 */
export function chaveDosOclusores(
  fontes: ReadonlyArray<FonteDeLuz>,
  oclusores: ReadonlyArray<Oclusor>,
): string {
  return oclusores
    .filter((oclusor) => fontes.some((fonte) => alcancaOclusor(fonte, oclusor)))
    .map(({ id, caixa, assetId }) =>
      // A caixa inteira, e não só o centro: girar ou espelhar o token muda a
      // silhueta deitada, e trocar a aparência dele muda a imagem de onde ela
      // sai.
      [
        id,
        caixa.x.toFixed(1),
        caixa.y.toFixed(1),
        caixa.width.toFixed(1),
        caixa.height.toFixed(1),
        caixa.rotation.toFixed(1),
        caixa.flipX ? "h" : "",
        caixa.flipY ? "v" : "",
        assetId,
      ].join(","),
    )
    .join("|");
}

/**
 * O quanto a silhueta estica, em frações da altura da figura: perto da luz e
 * na borda do alcance.
 *
 * A mesma faixa da tocha que existiu até o PR #90: rente à luz o corpo quase
 * não deita sombra -- a chama está no alto, logo acima dele --, e longe dela a
 * sombra se estica pelo chão. Mais que isto, a sombra de um goblin passaria
 * da sala.
 */
export const COMPRIMENTO_PERTO = 0.18;
export const COMPRIMENTO_LONGE = 0.6;

/** O quanto a silhueta corre por unidade de altura, e para onde. Ver `VultoDaFigura`. */
export type CisalhamentoDaLuz = { kx: number; ky: number };

/**
 * Para onde e quanto a silhueta deste token corre, vista desta luz. `null`
 * sem sombra -- a luz dentro do pé, ou o token fora do alcance.
 *
 * É o `VultoDaFigura` do sol com a direção saindo da LUZ, e não de um ângulo
 * fixo: cada token numa sala tem a sombra apontando para longe da tocha, e
 * dois tokens em lados opostos dela têm sombras em sentidos opostos.
 */
export function cisalhamentoDaLuz(
  oclusor: Oclusor,
  fonte: Pick<FonteDeLuz, "x" | "y" | "raio">,
): CisalhamentoDaLuz | null {
  const dx = oclusor.x - fonte.x;
  const dy = oclusor.y - fonte.y;
  const distancia = Math.hypot(dx, dy);

  if (distancia <= oclusor.raio || !alcancaOclusor(fonte, oclusor)) {
    return null;
  }

  const t = Math.min(1, distancia / Math.max(1, fonte.raio));
  const comprimento =
    COMPRIMENTO_PERTO + (COMPRIMENTO_LONGE - COMPRIMENTO_PERTO) * t;

  return {
    kx: (dx / distancia) * comprimento,
    ky: (dy / distancia) * comprimento,
  };
}

/** Uma transformação afim, na ordem do `setTransform`: `[a, b, c, d, e, f]`. */
export type Afim = [number, number, number, number, number, number];

/** `m · n`: aplicar `n` primeiro, e `m` depois. */
function compor(m: Afim, n: Afim): Afim {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function aplicarAfim(m: Afim, ponto: Ponto): Ponto {
  return {
    x: m[0] * ponto.x + m[2] * ponto.y + m[4],
    y: m[1] * ponto.x + m[3] * ponto.y + m[5],
  };
}

/**
 * Da caixa do token (origem no canto dele) para a cena, com ou sem a sombra.
 *
 * A MESMA cadeia que o `SombraDaFigura` monta em CSS para o sol, só que numa
 * matriz para o canvas: a caixa vai para o lugar dela, escorre a partir do pé
 * (`matrizDoVulto`: x' = x − kx·y + kx·pé, y' = (1 − ky)·y + ky·pé), e dentro
 * dela a figura gira em torno do centro e espelha, como o token. Sem
 * `cisalhamento`, é a figura EM PÉ -- a que se recorta da própria sombra.
 */
export function matrizDaFigura(
  caixa: CaixaDoToken,
  cisalhamento: (CisalhamentoDaLuz & { pe: number }) | null,
): Afim {
  const { width: w, height: h } = caixa;
  const angulo = (caixa.rotation * Math.PI) / 180;
  const cos = Math.cos(angulo);
  const sen = Math.sin(angulo);

  let m: Afim = [1, 0, 0, 1, caixa.x, caixa.y];

  if (cisalhamento) {
    const { kx, ky, pe } = cisalhamento;
    m = compor(m, [1, 0, -kx, 1 - ky, kx * pe, ky * pe]);
  }

  m = compor(m, [1, 0, 0, 1, w / 2, h / 2]);
  m = compor(m, [cos, sen, -sen, cos, 0, 0]);
  m = compor(m, [caixa.flipX ? -1 : 1, 0, 0, caixa.flipY ? -1 : 1, 0, 0]);
  m = compor(m, [1, 0, 0, 1, -w / 2, -h / 2]);

  return m;
}

/**
 * O retângulo da imagem da silhueta, na caixa do token: ela passa da caixa
 * pela margem em que o desfoque mora. Ver `Silhueta.margemX`.
 */
export function retanguloDaSilhueta(
  caixa: Pick<CaixaDoToken, "width" | "height">,
  margem: { margemX: number; margemY: number },
): { x: number; y: number; width: number; height: number } {
  return {
    x: -margem.margemX * caixa.width,
    y: -margem.margemY * caixa.height,
    width: caixa.width * (1 + 2 * margem.margemX),
    height: caixa.height * (1 + 2 * margem.margemY),
  };
}

/**
 * A caixa, em cena, que a figura deitada ocupa: os quatro cantos da imagem
 * pela matriz. É o tamanho do rascunho em que cada sombra se pinta -- do
 * tamanho do vulto, e não da luz inteira.
 */
export function caixaDaMatriz(
  m: Afim,
  retangulo: { x: number; y: number; width: number; height: number },
): CaixaDaLuz {
  const cantos = [
    { x: retangulo.x, y: retangulo.y },
    { x: retangulo.x + retangulo.width, y: retangulo.y },
    { x: retangulo.x, y: retangulo.y + retangulo.height },
    { x: retangulo.x + retangulo.width, y: retangulo.y + retangulo.height },
  ].map((canto) => aplicarAfim(m, canto));

  const x1 = Math.floor(Math.min(...cantos.map((canto) => canto.x)));
  const y1 = Math.floor(Math.min(...cantos.map((canto) => canto.y)));
  const x2 = Math.ceil(Math.max(...cantos.map((canto) => canto.x)));
  const y2 = Math.ceil(Math.max(...cantos.map((canto) => canto.y)));

  return {
    x: x1,
    y: y1,
    width: Math.max(1, x2 - x1),
    height: Math.max(1, y2 - y1),
  };
}

/** A sombra de um token para uma luz: o quadrilátero e o eixo do degradê. */
export type SombraDoToken = {
  pontos: Ponto[];
  /** O começo do degradê: o centro do pé. */
  de: Ponto;
  /** E o fim, na ponta da sombra. */
  ate: Ponto;
  /** Onde, entre `de` e `ate`, fica a borda de trás do pé -- o mais escuro. */
  costas: number;
};

/**
 * A sombra que um token deita, vista desta luz. `null` se não há.
 *
 * Sai do MEIO do pé, e não da borda de trás: a metade do token virada para a
 * luz fica acesa e a de trás escurece, que é a luz "batendo" no personagem.
 * Daí ela se abre em leque -- cada lado segue a reta que vem da luz -- e some
 * no degradê até a ponta.
 *
 * Sem sombra quando a luz está DENTRO do pé: é a lanterna na mão de quem a
 * carrega, e um corpo não tapa a luz que ele mesmo segura.
 */
export function sombraDoToken(
  oclusor: Oclusor,
  fonte: Pick<FonteDeLuz, "x" | "y" | "raio">,
): SombraDoToken | null {
  const dx = oclusor.x - fonte.x;
  const dy = oclusor.y - fonte.y;
  const distancia = Math.hypot(dx, dy);

  if (distancia <= oclusor.raio) return null;
  if (!alcancaOclusor(fonte, oclusor)) return null;

  const rumo = { x: dx / distancia, y: dy / distancia };
  const lado = { x: -rumo.y, y: rumo.x };
  const comprimento = oclusor.raio * COMPRIMENTO_DA_SOMBRA;

  const borda = (sinal: 1 | -1): Ponto => ({
    x: oclusor.x + lado.x * oclusor.raio * sinal,
    y: oclusor.y + lado.y * oclusor.raio * sinal,
  });

  // Cada ponta anda na reta que sai da luz e passa por ela: é o que abre o
  // leque, mais largo quanto mais perto da luz.
  const longe = (ponto: Ponto): Ponto => {
    const px = ponto.x - fonte.x;
    const py = ponto.y - fonte.y;
    const d = Math.hypot(px, py);
    return {
      x: ponto.x + (px / d) * comprimento,
      y: ponto.y + (py / d) * comprimento,
    };
  };

  const esquerda = borda(1);
  const direita = borda(-1);

  return {
    pontos: [esquerda, longe(esquerda), longe(direita), direita],
    de: { x: oclusor.x, y: oclusor.y },
    ate: {
      x: oclusor.x + rumo.x * (oclusor.raio + comprimento),
      y: oclusor.y + rumo.y * (oclusor.raio + comprimento),
    },
    costas: oclusor.raio / (oclusor.raio + comprimento),
  };
}

/** Uma caixa em unidade de cena, com os cantos já inteiros. */
export type CaixaDaLuz = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * O quadrado que a luz alcança, preso ao plano. `null` se ela cai inteira fora.
 *
 * Preso porque é o tamanho da tela de rascunho em que a luz se desenha: um
 * alcance de dois mil numa luz no canto pediria um rascunho quatro vezes maior
 * que o plano para pintar um quarto dele.
 */
export function caixaDaFonte(
  fonte: Pick<FonteDeLuz, "x" | "y" | "raio">,
): CaixaDaLuz | null {
  const x1 = Math.max(0, Math.floor(fonte.x - fonte.raio));
  const y1 = Math.max(0, Math.floor(fonte.y - fonte.raio));
  const x2 = Math.min(SCENE_WIDTH, Math.ceil(fonte.x + fonte.raio));
  const y2 = Math.min(SCENE_HEIGHT, Math.ceil(fonte.y + fonte.raio));

  if (x2 <= x1 || y2 <= y1) return null;

  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/**
 * Prende a escuridão entre 0 e 1, ou devolve 0 para o que não é número.
 *
 * O valor entra por caminhos que ninguém controla -- o `ordem.json` de uma
 * versão futura, o quadro que chega pelo canal --, e um `NaN` aqui viraria um
 * `rgba` inválido que o canvas ignora em silêncio, deixando a cor anterior.
 */
export function limitarEscuridao(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor)
    ? Math.min(1, Math.max(0, valor))
    : 0;
}
