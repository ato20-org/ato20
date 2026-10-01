import type { Bounds } from "@/lib/geometry/bounds";
import type { Vec } from "@/lib/geometry/transform";
import { SCENE_HEIGHT, SCENE_WIDTH, type Viewport } from "@/types/scene";

/** Plano inteiro: o enquadramento padrão de toda visão. */
export const FULL_VIEWPORT: Viewport = {
  x: 0,
  y: 0,
  width: SCENE_WIDTH,
  height: SCENE_HEIGHT,
};

/**
 * O plano, como caixa.
 *
 * É o PISO de tudo o que se mede aqui: o conteúdo de uma cena pode passar das
 * bordas do plano, nunca ficar aquém delas. Sem esse piso, uma cena vazia
 * encolheria a área de trabalho para nada, e os 100% do botão de porcentagem
 * deixariam de significar a mesma coisa em duas cenas diferentes.
 */
export const PLANO: Bounds = {
  minX: 0,
  minY: 0,
  maxX: SCENE_WIDTH,
  maxY: SCENE_HEIGHT,
};

/**
 * Recorte mínimo, ou seja, ampliação máxima.
 *
 * Vale para dois gestos de uma vez, o `clampViewport` e o `clampCamera`:
 * quanto o mestre aproxima no palco, e quão pequena a moldura da câmera pode
 * ficar -- que é quanto a TV aproxima. Era 8, e apertava nos dois: um token de
 * 70 unidades num mapa de 1920 chegava a 290px de tela e parava, e a câmera não
 * fechava num corredor estreito sem levar meia sala junto.
 *
 * 16 dobra o alcance. O custo não é no canal -- a câmera viaja como quatro
 * números, qualquer que seja -- e sim no desenho: ampliado, o fundo volta ao
 * arquivo original (ver `useVarianteDoFundo`), e o plano parado amplia por
 * `zoom` no LAYOUT, que a 16x num quadro de 1920 vira uma caixa de 30 mil
 * pixels de largura. O motor só rasteriza o recorte visível, mas isso é
 * afirmação sobre a webview, e vale conferir nela antes de subir de novo.
 */
export const MAX_ZOOM = 16;

const ASPECT = SCENE_HEIGHT / SCENE_WIDTH;

/**
 * Ampliação máxima ancorada no PLANO, e não no conteúdo: quanto dá para
 * aproximar é uma propriedade da régua em que as coisas estão desenhadas, e
 * não de quão espalhadas elas estão. Ancorar no conteúdo faria o mesmo token
 * aproximar mais numa cena cheia do que numa vazia.
 */
const MIN_WIDTH = SCENE_WIDTH / MAX_ZOOM;

/**
 * O piso da câmera no outro eixo: a altura do menor recorte 16:9.
 *
 * O palco não precisa dele, porque a altura dele sai da largura. A câmera tem
 * formato próprio (ver `clampCamera`), e um piso só na largura deixaria o
 * corredor achatar até virar uma linha.
 *
 * Os dois pisos juntos garantem o `MAX_ZOOM` em qualquer formato: a TV encaixa
 * a câmera pelo eixo que aperta, e nenhum dos dois passa da ampliação máxima.
 */
const MIN_HEIGHT = MIN_WIDTH * ASPECT;

/**
 * Quanto dá para afastar ALÉM do encaixe, como fator sobre a largura que faz
 * tudo caber.
 *
 * Antes o encaixe era o fim: com tudo à vista, a roda parava. Mas o mestre
 * quer ver o mapa pequeno com vazio em volta -- para arrastar uma imagem para
 * fora dele, para olhar a cena de longe enquanto arruma -- e o encaixe cola o
 * mapa nas bordas da tela. Dobrar a largura é ler 50% quando o plano lê 100%.
 *
 * Dois, e não mais, porque a folga navegável é de um plano para cada lado
 * (ver `FOLGA_X`): um recorte de duas larguras ainda cabe nela com sobra para
 * deslocar. Mais largo que a folga, e o clamp passaria a centrar em vez de
 * deslocar.
 */
export const AFASTAR_EXTRA = 2;

/**
 * Quanto o recorte pode passar das bordas do conteúdo, em unidades de cena.
 *
 * Antes não podia nada: o deslocamento parava na beirada do mapa, e o preto em
 * volta era só letterbox — espaço que existia na tela e não podia ser
 * alcançado. Isso apertava justamente quem trabalha nas bordas, e ficou visível
 * quando as notas dos pontos de anotação passaram a poder ser estacionadas fora
 * do mapa: dava para pôr o cartão ali e não dava para chegar nele.
 *
 * Um plano inteiro de folga para cada lado. Com o conteúdo todo dentro do
 * plano isso dá a mesma área de trabalho de três planos por três que existia
 * quando este número era o limite inteiro, e não a margem dele — a mudança
 * para limites que acompanham o conteúdo não aperta nem afrouxa a cena comum.
 *
 * Não é infinito, e não deveria ser: a folga é o vazio em que ainda não há
 * nada, e ela ANDA com o que o mestre coloca. Largar uma imagem lá fora leva a
 * área junto, então o vazio nunca é uma parede — só nunca é um abismo.
 */
export const FOLGA_X = SCENE_WIDTH;
export const FOLGA_Y = SCENE_HEIGHT;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Preso entre dois valores, centrado quando não cabe.
 *
 * O `max` aqui é `borda - largura do recorte`, e ele fica MENOR que o `min`
 * quando o recorte é mais largo que a área — o que acontece com conteúdo alto
 * e estreito, porque o recorte é sempre 16:9 e precisa transbordar na
 * horizontal para conter a altura. Um `clamp` cru devolveria a ponta errada e
 * grudaria a vista na borda; o meio-termo é o enquadramento que a pessoa
 * espera de algo que não cabe.
 */
function presoNoEixo(value: number, min: number, max: number): number {
  return max < min ? (min + max) / 2 : clamp(value, min, max);
}

/** A área navegável: o conteúdo mais a folga de vazio em volta dele. */
export function comFolga(conteudo: Bounds): Bounds {
  return {
    minX: conteudo.minX - FOLGA_X,
    minY: conteudo.minY - FOLGA_Y,
    maxX: conteudo.maxX + FOLGA_X,
    maxY: conteudo.maxY + FOLGA_Y,
  };
}

/**
 * A largura de recorte que faz a caixa inteira caber, respeitada a proporção.
 *
 * Deriva da altura quando a caixa é mais alta que larga: o recorte do palco é
 * 16:9 e não negocia, então conter uma caixa em pé custa largura sobrando nos
 * lados. A câmera passa a própria `proporcao`, e aí sobra no eixo dela.
 *
 * Os dois pisos, e não só o da largura: num formato deitado é a ALTURA que bate
 * no mínimo primeiro, e só o piso da largura deixaria a câmera menor que o
 * `MAX_ZOOM` permite. Em 16:9 os dois são o mesmo número.
 */
function larguraQueCabe(conteudo: Bounds, proporcao = ASPECT): number {
  const largura = conteudo.maxX - conteudo.minX;
  const altura = conteudo.maxY - conteudo.minY;

  return Math.max(
    largura,
    altura / proporcao,
    MIN_WIDTH,
    MIN_HEIGHT / proporcao,
  );
}

/** A largura no fim do afastar: o encaixe vezes `AFASTAR_EXTRA`. */
function larguraMaxima(conteudo: Bounds): number {
  return larguraQueCabe(conteudo) * AFASTAR_EXTRA;
}

/**
 * O recorte que mostra a caixa inteira, centrado nela. É o que o botão de
 * porcentagem faz.
 *
 * Com o conteúdo todo dentro do plano isto devolve exatamente `FULL_VIEWPORT`
 * — mesmo número, mesmo canto —, e é por isso que os 100% continuam sendo os
 * 100% de sempre na cena que nunca vazou.
 *
 * `proporcao` é altura sobre largura, e o padrão é o 16:9 do palco. A câmera
 * passa a dela, para enquadrar a seleção sem perder o formato que o mestre
 * deu a ela.
 */
export function viewportQueCabe(
  conteudo: Bounds = PLANO,
  proporcao = ASPECT,
): Viewport {
  const width = larguraQueCabe(conteudo, proporcao);
  const height = width * proporcao;

  return {
    x: (conteudo.minX + conteudo.maxX) / 2 - width / 2,
    y: (conteudo.minY + conteudo.maxY) / 2 - height / 2,
    width,
    height,
  };
}

/**
 * Ajusta o recorte do PALCO para algo exibível: proporção do plano, dentro dos
 * limites de ampliação e dentro do conteúdo mais a folga.
 *
 * A proporção é derivada da largura, nunca aceita da entrada. O palco é a
 * vista do mestre, e o formato dela é o da régua, e não algo que ele escolhe.
 * A câmera já foi presa aqui também, e saiu: ela tem formato próprio, e o
 * clamp dela é o `clampCamera`.
 *
 * `conteudo` ausente = o plano, que é o caso de toda visão que não é o palco do
 * Mestre: quem não edita não navega, só desenha a câmera que chegou.
 */
export function clampViewport(
  { x, y, width }: Viewport,
  conteudo: Bounds = PLANO,
): Viewport {
  const clampedWidth = clamp(width, MIN_WIDTH, larguraMaxima(conteudo));

  return naFolga(x, y, clampedWidth, clampedWidth * ASPECT, conteudo);
}

/**
 * O recorte deste tamanho, com o canto preso na área navegável.
 *
 * A folga entra nas duas pontas, antes do começo do conteúdo e depois do fim
 * dele. Ver `FOLGA_X`.
 */
function naFolga(
  x: number,
  y: number,
  width: number,
  height: number,
  conteudo: Bounds,
): Viewport {
  const navegavel = comFolga(conteudo);

  return {
    x: presoNoEixo(x, navegavel.minX, navegavel.maxX - width),
    y: presoNoEixo(y, navegavel.minY, navegavel.maxY - height),
    width,
    height,
  };
}

/**
 * A proporção da tela da mesa, altura sobre largura: 16:9.
 *
 * É a do plano, e a do palco. A câmera nasce nela e pode sair dela (ver
 * `clampCamera`); a TV, não.
 */
export const PROPORCAO_DA_MESA = ASPECT;

/** Altura sobre largura, como `PROPORCAO_DA_MESA`. */
export function proporcaoDe(viewport: Pick<Viewport, "width" | "height">): number {
  return viewport.height / viewport.width;
}

/**
 * A câmera está no formato da tela da mesa.
 *
 * Com tolerância porque a altura de um recorte 16:9 sai de uma multiplicação,
 * e a sobra binária dela diria que 1920 por 1080 não é 16:9.
 */
export function temFormatoDaMesa(
  viewport: Pick<Viewport, "width" | "height">,
): boolean {
  return Math.abs(proporcaoDe(viewport) - ASPECT) < 1e-6;
}

/**
 * Quanto a câmera pode encolher e crescer, eixo por eixo.
 *
 * Os mesmos limites do palco, só que nos dois eixos: o piso é o menor recorte
 * 16:9 e o teto é o maior. A câmera em pé chega ao piso pela largura, e o
 * corredor chega pela altura.
 */
function limitesDaCamera(conteudo: Bounds) {
  const larguraMax = larguraMaxima(conteudo);

  return {
    larguraMin: MIN_WIDTH,
    alturaMin: MIN_HEIGHT,
    larguraMax,
    alturaMax: larguraMax * ASPECT,
  };
}

/**
 * Ajusta a câmera para algo exibível SEM mudar o formato dela.
 *
 * O palco é sempre 16:9; a câmera, não. O mestre estica um canto e ela passa a
 * ser a torre em pé ou o corredor deitado, e a TV encaixa o recorte com tarja
 * preta em volta (ver `tarjas`, no `SceneStage`). O formato é dela, então
 * mover, ampliar, seguir um token e enquadrar a seleção o mantêm. Só o canto da
 * moldura muda o formato, e o canto passa pelo `clampCameraPorEixo`.
 *
 * Fora dos limites, a câmera é escalada INTEIRA até caber, pelo centro. O
 * formato só cede quando não há tamanho que caiba nos dois eixos -- um corredor
 * mais comprido do que a área inteira permite --, e aí cada eixo é preso por si.
 *
 * Os eixos são presos de novo depois de escalar, e não é redundância: sem isso
 * o fator volta com sobra binária, e prender a câmera já presa a mexeria.
 */
export function clampCamera(
  camera: Viewport,
  conteudo: Bounds = PLANO,
): Viewport {
  const { x, y, width, height } = camera;
  const limites = limitesDaCamera(conteudo);

  const fatorMin = Math.max(
    limites.larguraMin / width,
    limites.alturaMin / height,
  );
  const fatorMax = Math.min(
    limites.larguraMax / width,
    limites.alturaMax / height,
  );

  if (!(width > 0 && height > 0) || fatorMin > fatorMax)
    return clampCameraPorEixo(camera, conteudo);

  const fator = clamp(1, fatorMin, fatorMax);
  const largura = clamp(width * fator, limites.larguraMin, limites.larguraMax);
  const altura = clamp(height * fator, limites.alturaMin, limites.alturaMax);

  return naFolga(
    x + (width - largura) / 2,
    y + (height - altura) / 2,
    largura,
    altura,
    conteudo,
  );
}

/**
 * Ajusta a câmera prendendo cada eixo por si: o formato é o que vier.
 *
 * É o clamp do canto da moldura, o único gesto que existe para mudar o
 * formato. Escalar a câmera inteira ali seria errado: o mestre que encolhe a
 * altura de um corredor até o piso veria a largura crescer sozinha para manter
 * uma proporção que ele está justamente mudando.
 */
export function clampCameraPorEixo(
  { x, y, width, height }: Viewport,
  conteudo: Bounds = PLANO,
): Viewport {
  const limites = limitesDaCamera(conteudo);

  return naFolga(
    x,
    y,
    clamp(width, limites.larguraMin, limites.larguraMax),
    clamp(height, limites.alturaMin, limites.alturaMax),
    conteudo,
  );
}

/**
 * Amplia a câmera mantendo o formato. `fator > 1` aproxima, e `ancora` fica
 * parada.
 *
 * O `zoomViewport` do palco prende a largura e deriva a altura; aqui o fator é
 * que é preso, pelos quatro limites de uma vez. A câmera para de aproximar
 * quando QUALQUER eixo chega ao piso, e o formato não muda no caminho.
 */
export function ampliarCamera(
  camera: Viewport,
  fator: number,
  ancora: Vec,
  conteudo: Bounds = PLANO,
): Viewport {
  const limites = limitesDaCamera(conteudo);
  const aproximarAte = Math.min(
    camera.width / limites.larguraMin,
    camera.height / limites.alturaMin,
  );
  const afastarAte = Math.max(
    camera.width / limites.larguraMax,
    camera.height / limites.alturaMax,
  );
  const preso =
    afastarAte > aproximarAte ? 1 : clamp(fator, afastarAte, aproximarAte);

  const width = camera.width / preso;
  const height = camera.height / preso;
  // A mesma fração do `zoomViewport`: é ela que deixa a âncora parada.
  const fracaoX = (ancora.x - camera.x) / camera.width;
  const fracaoY = (ancora.y - camera.y) / camera.height;

  return clampCamera(
    {
      x: ancora.x - fracaoX * width,
      y: ancora.y - fracaoY * height,
      width,
      height,
    },
    conteudo,
  );
}

/** `ampliarCamera` com o centro parado: as teclas `=`/`-` e a roda na alça. */
export function ampliarCameraNoCentro(
  camera: Viewport,
  fator: number,
  conteudo: Bounds = PLANO,
): Viewport {
  return ampliarCamera(
    camera,
    fator,
    { x: camera.x + camera.width / 2, y: camera.y + camera.height / 2 },
    conteudo,
  );
}

/** Recentra a câmera num ponto, sem mudar tamanho nem formato. */
export function centrarCameraEm(
  camera: Viewport,
  ponto: Vec,
  conteudo: Bounds = PLANO,
): Viewport {
  return clampCamera(
    {
      ...camera,
      x: ponto.x - camera.width / 2,
      y: ponto.y - camera.height / 2,
    },
    conteudo,
  );
}

/**
 * O maior recorte com esta `proporcao` que cabe dentro de `alvo`, centrado.
 *
 * É o "trazer para onde estou" de uma câmera que não é 16:9: o palco do mestre
 * é, e copiá-lo inteiro jogaria fora o formato que ele deu à câmera. Ela vem
 * para onde ele está, do tamanho que cabe no que ele vê.
 */
export function formatoDentroDe(alvo: Viewport, proporcao: number): Viewport {
  // O alvo já no formato volta ele mesmo: a câmera 16:9 trazida para o palco,
  // que é o caso de sempre, não pode ganhar sobra binária no caminho.
  if (Math.abs(proporcaoDe(alvo) - proporcao) < 1e-6) return alvo;

  const width = Math.min(alvo.width, alvo.height / proporcao);
  const height = width * proporcao;

  return {
    x: alvo.x + (alvo.width - width) / 2,
    y: alvo.y + (alvo.height - height) / 2,
    width,
    height,
  };
}

/**
 * O 16:9 em volta da câmera: o que a tela da mesa mostra quando ela está no ar.
 *
 * A TV encaixa a câmera pelo eixo que aperta e centra a sobra no outro, então
 * a tela inteira, em unidade de cena, é o menor 16:9 que contém o recorte e tem
 * o mesmo centro. É aqui que o retrato vive (ver `portraitBox`): ele é HUD da
 * tela, e não da câmera. Numa câmera em pé ele fica sobre a tarja dos lados,
 * e não espremido em cima da torre.
 *
 * A câmera 16:9 volta ELA MESMA, e não uma cópia: é o caso de quase toda cena,
 * e um objeto novo a cada render derrubaria o `memo` de quem desenha o retrato.
 */
export function quadroDaMesa(camera: Viewport): Viewport {
  if (temFormatoDaMesa(camera)) return camera;

  const width = Math.max(camera.width, camera.height / ASPECT);
  const height = width * ASPECT;

  return {
    x: camera.x + (camera.width - width) / 2,
    y: camera.y + (camera.height - height) / 2,
    width,
    height,
  };
}

/** `factor > 1` aproxima. O ponto `anchor` fica parado na tela. */
export function zoomViewport(
  viewport: Viewport,
  factor: number,
  anchor: Vec,
  conteudo: Bounds = PLANO,
): Viewport {
  const width = clamp(
    viewport.width / factor,
    MIN_WIDTH,
    larguraMaxima(conteudo),
  );
  const height = width * ASPECT;

  // Fração do recorte em que a âncora está. Preservá-la é o que faz o zoom
  // acontecer sob o cursor, em vez de puxar a cena para o centro.
  const ratioX = (anchor.x - viewport.x) / viewport.width;
  const ratioY = (anchor.y - viewport.y) / viewport.height;

  return clampViewport(
    {
      x: anchor.x - ratioX * width,
      y: anchor.y - ratioY * height,
      width,
      height,
    },
    conteudo,
  );
}

export function panViewport(
  viewport: Viewport,
  dx: number,
  dy: number,
  conteudo: Bounds = PLANO,
): Viewport {
  return clampViewport(
    { ...viewport, x: viewport.x + dx, y: viewport.y + dy },
    conteudo,
  );
}

/**
 * Ampliação atual, onde 1 é o PLANO — não o conteúdo.
 *
 * A referência é a régua, de propósito: 100% tem de querer dizer a mesma coisa
 * em toda cena, senão o número não compara nada. A consequência é que um
 * conteúdo espalhado além do plano mostra menos de 100% quando cabe inteiro, e
 * isso é a leitura certa: a vista está mais longe do que o plano inteiro.
 */
export function viewportZoom(viewport: Viewport): number {
  // Pelo eixo que aperta, como a TV encaixa. No palco, que é 16:9, os dois
  // dão o mesmo número; na câmera em pé é a altura que diz quanto a mesa vê.
  return Math.min(
    SCENE_WIDTH / viewport.width,
    SCENE_HEIGHT / viewport.height,
  );
}

/**
 * O recorte já está no fim do afastar — mais longe que isto não vai.
 *
 * A margem de meio pixel de cena existe porque a largura passa por divisões e
 * volta com sobra binária: comparar cru deixaria o botão de afastar aceso num
 * recorte que já está no limite, e clicá-lo não faria nada.
 */
export function cabeTudo(viewport: Viewport, conteudo: Bounds = PLANO): boolean {
  return viewport.width >= larguraMaxima(conteudo) - 0.5;
}

/**
 * Recentra o recorte num ponto do plano, sem mudar a ampliação.
 *
 * Serve a busca de pontos de anotação: escolher um da lista tem de levar a
 * vista até ele, e mudar o zoom no caminho tiraria o mestre do enquadramento
 * em que ele estava trabalhando.
 *
 * O `clampViewport` cuida das bordas, então um ponto no canto da área fica
 * visível sem ficar centrado — que é o certo: centrar de verdade exigiria
 * mostrar área fora dela.
 */
export function centerViewportOn(
  viewport: Viewport,
  point: Vec,
  conteudo: Bounds = PLANO,
): Viewport {
  return clampViewport(
    {
      ...viewport,
      x: point.x - viewport.width / 2,
      y: point.y - viewport.height / 2,
    },
    conteudo,
  );
}

/** Zoom mantendo o centro parado — é o que os botões de + e - fazem. */
export function zoomViewportCentered(
  viewport: Viewport,
  factor: number,
  conteudo: Bounds = PLANO,
): Viewport {
  return zoomViewport(
    viewport,
    factor,
    {
      x: viewport.x + viewport.width / 2,
      y: viewport.y + viewport.height / 2,
    },
    conteudo,
  );
}

/**
 * Onde o recorte pousa DENTRO da moldura, em pixels de tela.
 *
 * O retângulo que a moldura letterboxa. O que sobra em volta dele são as tarjas
 * pretas -- ver `tarjas`, no `SceneStage`, que sai desta mesma conta.
 *
 * Não depende da AMPLIAÇÃO da câmera: `scale` é `moldura / recorte`, e a
 * largura do recorte aparece nos DOIS lados da multiplicação. Depende do
 * FORMATO, desde que a câmera tem um próprio -- a torre em pé pousa estreita,
 * e o corredor, baixo. Por isso o retrato não mora aqui, e sim no
 * `quadroNaTela`.
 */
export function recorteNaTela(
  frame: { width: number; height: number },
  viewport: Viewport,
  scale: number,
): { left: number; top: number; width: number; height: number } {
  const width = viewport.width * scale;
  const height = viewport.height * scale;

  return {
    left: (frame.width - width) / 2,
    top: (frame.height - height) / 2,
    width,
    height,
  };
}

/**
 * A tela da mesa dentro da moldura, em pixels de tela: o maior 16:9 que cabe,
 * centrado. É a caixa do overlay, onde o retrato se desenha.
 *
 * ## Por que ele é chão firme
 *
 * Não depende da câmera nenhuma -- nem da ampliação, nem do lugar, nem do
 * formato. É o que o torna o lugar de tudo o que não é cenário: a câmera anda,
 * aproxima, vira torre ou corredor, e o retrato continua onde estava. O que
 * muda é o mapa dentro do recorte, que é justamente o que se quer.
 *
 * Com a câmera 16:9 é o mesmo retângulo do `recorteNaTela`, então nada mudou
 * para a cena de sempre. Com a câmera em outro formato ele é maior que o
 * recorte, e o retrato que encosta no canto fica sobre a tarja.
 *
 * Bate com o `quadroDaMesa` do palco do Mestre numa TV 16:9, que é a da
 * maioria das mesas. Numa 16:10 com uma câmera em pé os dois divergem um pouco
 * no eixo que sobra, e o retrato fica um tanto mais para dentro do que o
 * mestre viu -- nunca fora da tela.
 */
export function quadroNaTela(frame: {
  width: number;
  height: number;
}): { left: number; top: number; width: number; height: number } {
  const width = Math.min(frame.width, frame.height / ASPECT);
  const height = width * ASPECT;

  return {
    left: (frame.width - width) / 2,
    top: (frame.height - height) / 2,
    width,
    height,
  };
}
