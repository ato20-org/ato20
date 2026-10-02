import type { Vec } from "@/lib/geometry/transform";
import type { Tripe } from "@/types/scene";

/**
 * A câmera de mesa de verdade: um olho que olha um ponto do chão.
 *
 * ## O que ela substitui, e por quê
 *
 * O chão de esguelha nasceu como FOTO. A cena deita dentro de uma caixa de
 * 1920x1080, `encaixeDoChao` encolhe o resultado para caber, e o palco recorta
 * e amplia essa imagem como recorta e amplia o mapa de prumo. Cada passo é
 * certo sozinho, e juntos eles não são uma câmera:
 *
 * - **Inclinar dá zoom.** O encaixe muda a cada ângulo: deitar de 0° a 72°
 *   encolhe a cena 20%, e girar a 52° faz ela respirar entre 0,71 e 0,88.
 * - **Andar desliza a foto.** O ponto de fuga anda junto com a imagem, e o
 *   canto do mapa aparece visto do centro dele, de lado.
 * - **Aproximar amplia a foto.** A perspectiva não muda com a distância -- o
 *   perto não cresce mais que o longe, e a parede não abre.
 * - **Girar é em torno do meio do MAPA**, e não do que se está olhando.
 *
 * Aqui a câmera é um olho: um `alvo` no chão, que é o centro da tela, a
 * distância até ele (que é o `zoom`), e o `giro` e a `inclinacao` de onde se
 * olha. Andar move o alvo SOBRE O CHÃO, aproximar encurta a distância, girar e
 * deitar acontecem em volta do alvo, e a tela é uma janela: a mesa continua
 * além da borda, em vez de encolher para caber nela.
 *
 * ## A corrente
 *
 * `translate(centro da tela) rotateX(inclinacao) rotateZ(giro) scale3d(zoom)
 * translate(-alvo)`, com `perspective: focal` no pai do tamanho da tela. É a
 * mesma corrente de `correnteDeEsguelha`, com o alvo e o zoom DENTRO do tombo
 * em vez de fora dele -- e essa troca de lugar é a diferença inteira entre a
 * foto de uma mesa e uma câmera sobre ela.
 *
 * O `scale3d` é a distância: com a lente fixa em `focal` pixels, ampliar `zoom`
 * vezes no chão é pôr o olho a `focal / zoom` unidades do alvo. Por isso
 * aproximar abre a perspectiva sozinho, como abre numa mesa de verdade. E tem de
 * ser 3D -- um `scale` chapado deixaria a altura das paredes de fora.
 *
 * Todas as contas abaixo seguem a MESMA ordem do `transform`, e são elas que
 * dizem onde o cursor caiu no chão: o motor não é consultado, então a câmera e
 * o gesto não dependem de `offsetX` sob perspectiva.
 */
export type CameraOrbital = {
  /** O ponto do chão no centro da tela, em unidades de cena. */
  alvo: Vec;
  /** Pixels de tela por unidade de cena NO ALVO. Mais zoom = olho mais perto. */
  zoom: number;
  /** De onde se olha, em graus. A mesma régua de `Vista.giro`. */
  giro: number;
  /** Quanto o chão deita, em graus. 0 = de prumo, visto de cima. */
  inclinacao: number;
};

/** A janela por onde se olha, em pixels de tela. */
export type Tela = {
  largura: number;
  altura: number;
  /** A distância do olho à tela, em pixels: o `perspective` do CSS. */
  focal: number;
};

/**
 * Uma câmera que outros desenham: a corrente de agora, e o aviso de quando ela
 * muda.
 *
 * É a forma em que a câmera chega a quem desenha o chão -- `ChaoInclinado` e a
 * `SceneLayer` deitada. Por assinatura, e não por prop nem por variável CSS:
 * andar e aproximar mudam a corrente a cada quadro, e quem desenha a escreve
 * direto no `style.transform` dos próprios elementos. Ver `orbital` em
 * `ChaoInclinado`, onde está a medida que decidiu isso.
 */
export type CameraAssinavel = {
  corrente: () => string;
  assinar: (aviso: () => void) => () => void;
  /** A focal, em pixels da caixa onde o chão é desenhado. */
  perspectiva: number;
};

const GRAU = Math.PI / 180;

/**
 * A lente da mesa, em graus na vertical.
 *
 * 45 é a de uma câmera de celular deitada, que é o olho que uma mesa de verdade
 * costuma ter na frente. Escolhida olhando a bancada, e a mesma nela e na TV:
 * uma lente diferente entre as duas faria o mestre ajustar uma cena que a mesa
 * vê de outro jeito.
 */
export const LENTE_DA_MESA = 45;

/**
 * De onde o mestre olha quando entra no 2.5D pela primeira vez.
 *
 * 52 graus é o que a bancada mostrou ler como sala sem virar maquete, e giro
 * em zero é olhar o mapa do mesmo lado em que ele foi desenhado.
 */
export const OLHAR_PADRAO = { giro: 0, inclinacao: 52 } as const;

/**
 * A distância do olho para uma lente de `graus` na vertical.
 *
 * Abertura VERTICAL, e não diagonal: a altura é a medida da tela que menos muda
 * entre um monitor e uma TV, e a sensação de lente que se ajusta olhando é a de
 * cima para baixo -- é nela que o chão encurta.
 */
export function focalDaLente(alturaDaTela: number, graus: number): number {
  const meia = (Math.min(Math.max(graus, 1), 170) * GRAU) / 2;
  return alturaDaTela / 2 / Math.tan(meia);
}

/**
 * A corrente CSS desta câmera, para ir na frente da de cada elemento do chão.
 *
 * Arredondada: ela vai para uma variável CSS a cada quadro do gesto, e doze
 * casas decimais por número só incham a string que o motor reinterpreta.
 */
export function correnteDaCamera(camera: CameraOrbital, tela: Tela): string {
  const { alvo, zoom, giro, inclinacao } = camera;

  return `translate(${r(tela.largura / 2)}px, ${r(tela.altura / 2)}px) rotateX(${r(inclinacao)}deg) rotateZ(${r(giro)}deg) scale3d(${r(zoom, 5)}, ${r(zoom, 5)}, ${r(zoom, 5)}) translate(${r(-alvo.x)}px, ${r(-alvo.y)}px)`;
}

/**
 * Onde um ponto da cena cai na tela, ou `null` se ele está atrás do olho.
 *
 * `altura` sobe do chão, na régua das paredes. Os passos são os do `transform`,
 * de dentro para fora: tira o alvo, amplia, gira no plano, deita, centraliza e
 * projeta.
 */
export function projetar(
  camera: CameraOrbital,
  tela: Tela,
  ponto: Vec,
  altura = 0,
): Vec | null {
  const { alvo, zoom } = camera;
  const g = camera.giro * GRAU;
  const t = camera.inclinacao * GRAU;

  const u = (ponto.x - alvo.x) * zoom;
  const v = (ponto.y - alvo.y) * zoom;
  const w = altura * zoom;

  const u1 = u * Math.cos(g) - v * Math.sin(g);
  const v1 = u * Math.sin(g) + v * Math.cos(g);

  const y = v1 * Math.cos(t) - w * Math.sin(t);
  const z = v1 * Math.sin(t) + w * Math.cos(t);

  if (z >= tela.focal) return null;
  const s = tela.focal / (tela.focal - z);

  return {
    x: tela.largura / 2 + u1 * s,
    y: tela.altura / 2 + y * s,
  };
}

/**
 * O ponto do chão sob um pixel da tela, ou `null` se o pixel está no céu.
 *
 * É a conta que faz o chão ficar sob a mão: agarrar, aproximar no cursor e
 * traçar parede saem todos daqui. Inversa exata de `projetar` com altura zero
 * -- o raio do olho pelo pixel cortado no plano do chão.
 */
export function daTelaAoChao(
  camera: CameraOrbital,
  tela: Tela,
  pixel: Vec,
): Vec | null {
  const t = camera.inclinacao * GRAU;
  const sx = pixel.x - tela.largura / 2;
  const sy = pixel.y - tela.altura / 2;

  // Abaixo de zero o raio sobe: o pixel está acima do horizonte.
  const denominador = tela.focal * Math.cos(t) + sy * Math.sin(t);
  if (denominador <= 1e-6) return null;

  const v1 = (sy * tela.focal) / denominador;
  return voltarAoChao(camera, tela, sx, v1);
}

/** Desfaz a escala da perspectiva, o giro e o zoom de um ponto já deitado. */
function voltarAoChao(
  camera: CameraOrbital,
  tela: Tela,
  sx: number,
  v1: number,
): Vec {
  const g = camera.giro * GRAU;
  const t = camera.inclinacao * GRAU;

  const u1 = (sx * (tela.focal - v1 * Math.sin(t))) / tela.focal;

  const u = u1 * Math.cos(g) + v1 * Math.sin(g);
  const v = -u1 * Math.sin(g) + v1 * Math.cos(g);

  return {
    x: camera.alvo.x + u / camera.zoom,
    y: camera.alvo.y + v / camera.zoom,
  };
}

/** Até onde a câmera vai. O alvo fica no mapa, e o zoom numa faixa. */
export type LimitesDaCamera = {
  x: number;
  y: number;
  width: number;
  height: number;
  zoomMin: number;
  zoomMax: number;
};

/** A câmera presa aos limites: o alvo sobre o mapa e o zoom na faixa. */
export function prender(
  camera: CameraOrbital,
  limites: LimitesDaCamera,
): CameraOrbital {
  return {
    ...camera,
    alvo: {
      x: Math.min(limites.x + limites.width, Math.max(limites.x, camera.alvo.x)),
      y: Math.min(
        limites.y + limites.height,
        Math.max(limites.y, camera.alvo.y),
      ),
    },
    zoom: Math.min(limites.zoomMax, Math.max(limites.zoomMin, camera.zoom)),
  };
}

/**
 * Leva a câmera para que `agarrado` fique sob o pixel.
 *
 * É o "agarrar o chão": o ponto pego no começo do gesto acompanha o cursor, com
 * a perspectiva e tudo. Exato, e não aproximado, porque o alvo é o último passo
 * da corrente -- andar o alvo anda o chão inteiro pela mesma distância, e a
 * diferença entre onde o cursor está e onde o ponto deveria estar é exatamente
 * o quanto o alvo tem de andar.
 */
export function agarrarAte(
  camera: CameraOrbital,
  tela: Tela,
  agarrado: Vec,
  pixel: Vec,
): CameraOrbital {
  const agora = daTelaAoChao(camera, tela, pixel);
  if (!agora) return camera;

  return {
    ...camera,
    alvo: {
      x: camera.alvo.x + (agarrado.x - agora.x),
      y: camera.alvo.y + (agarrado.y - agora.y),
    },
  };
}

/**
 * Aproxima `fator` vezes, com o ponto sob o cursor parado onde está.
 *
 * Mesma conta do agarrar: muda a distância, vê para onde o ponto do cursor
 * escorregou e devolve o alvo pela diferença. Com o cursor no céu, aproxima em
 * volta do centro -- não há chão ali para segurar.
 */
export function aproximar(
  camera: CameraOrbital,
  tela: Tela,
  fator: number,
  pixel: Vec,
  limites: LimitesDaCamera,
): CameraOrbital {
  const antes = daTelaAoChao(camera, tela, pixel);
  const perto = prender({ ...camera, zoom: camera.zoom * fator }, limites);
  if (!antes) return perto;

  return prender(agarrarAte(perto, tela, antes, pixel), limites);
}

/**
 * A câmera que mostra o mesmo pedaço que um recorte do palco mostrava.
 *
 * Para a bancada trocar de câmera sem perder o lugar: o centro do recorte vira
 * o alvo, e o zoom é o que faz o recorte caber na tela olhando de cima.
 */
export function cameraDoRecorte(
  recorte: { x: number; y: number; width: number; height: number },
  tela: Pick<Tela, "largura" | "altura">,
  giro: number,
  inclinacao: number,
): CameraOrbital {
  return {
    alvo: {
      x: recorte.x + recorte.width / 2,
      y: recorte.y + recorte.height / 2,
    },
    zoom: Math.min(
      tela.largura / Math.max(recorte.width, 1),
      tela.altura / Math.max(recorte.height, 1),
    ),
    giro,
    inclinacao,
  };
}

/**
 * Uma curva `cubic-bezier` do CSS, como função do tempo.
 *
 * A TV já suavizava a câmera com transição de CSS, e a orbital não pode usar
 * transição -- quem anda é uma corrente escrita a cada quadro, e não uma
 * propriedade. Então a curva vem para cá, com os MESMOS pontos, para o salto
 * de câmera continuar chegando à mesa com a desaceleração de sempre.
 *
 * O `x` do CSS é o tempo e o `y` é o andamento: acha-se o parâmetro da curva
 * cujo `x` é o tempo pedido (Newton, com bisseção de reserva) e devolve-se o
 * `y` dele.
 */
export function curvaBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (tempo: number) => number {
  const bx = (u: number) =>
    3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
  const by = (u: number) =>
    3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
  const dbx = (u: number) =>
    3 * (1 - u) * (1 - u) * x1 +
    6 * (1 - u) * u * (x2 - x1) +
    3 * u * u * (1 - x2);

  return (tempo) => {
    if (tempo <= 0) return 0;
    if (tempo >= 1) return 1;

    let u = tempo;
    for (let i = 0; i < 8; i += 1) {
      const erro = bx(u) - tempo;
      if (Math.abs(erro) < 1e-6) return by(u);
      const d = dbx(u);
      if (Math.abs(d) < 1e-6) break;
      u -= erro / d;
    }

    let baixo = 0;
    let alto = 1;
    u = tempo;
    for (let i = 0; i < 30; i += 1) {
      if (bx(u) < tempo) baixo = u;
      else alto = u;
      u = (baixo + alto) / 2;
    }
    return by(u);
  };
}

function r(valor: number, casas = 3): number {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

/**
 * A corrente CSS de um tripé, para ir na frente da de cada elemento do chão.
 *
 * É a corrente da orbital generalizada: em vez de tirar o ALVO e ampliar, tira
 * a POSIÇÃO do olho e o empurra para a distância `focal` da tela, onde o
 * `perspective` do CSS põe quem olha. A orbital é o caso particular de um tripé
 * apontado para o alvo -- ver `tripeDaOrbital`, e o teste que confere que as
 * duas projetam igual.
 *
 * A lente entra como ESCALA da imagem (`scale3d(s, s, 1)`, sem tocar a
 * profundidade), e não como `perspective`: numa câmera de furo, trocar a lente
 * é ampliar a imagem projetada, e assim o `perspective` da caixa fica o mesmo
 * para todo tripé. A troca de lente vira uma corrente nova como qualquer outra,
 * escrita no DOM sem render -- e o voo de um tripé a outro anima a lente junto.
 */
export function correnteDoTripe(tripe: Tripe, tela: Tela): string {
  const escala = focalDaLente(tela.altura, tripe.lente) / tela.focal;

  return `translate(${r(tela.largura / 2)}px, ${r(tela.altura / 2)}px) translateZ(${r(tela.focal)}px) scale3d(${r(escala, 5)}, ${r(escala, 5)}, 1) rotateZ(${r(tripe.rolagem)}deg) rotateX(${r(tripe.inclinacao)}deg) rotateZ(${r(tripe.giro)}deg) translate3d(${r(-tripe.x)}px, ${r(-tripe.y)}px, ${r(-tripe.altura)}px)`;
}

/** Um ponto da cena no espaço do olho do tripé: lado, cima e profundidade. */
function noOlho(tripe: Tripe, ponto: Vec, altura: number) {
  const g = tripe.giro * GRAU;
  const t = tripe.inclinacao * GRAU;
  const rr = tripe.rolagem * GRAU;

  const u = ponto.x - tripe.x;
  const v = ponto.y - tripe.y;
  const w = altura - tripe.altura;

  const u1 = u * Math.cos(g) - v * Math.sin(g);
  const v1 = u * Math.sin(g) + v * Math.cos(g);

  const y2 = v1 * Math.cos(t) - w * Math.sin(t);
  const z2 = v1 * Math.sin(t) + w * Math.cos(t);

  return {
    lado: u1 * Math.cos(rr) - y2 * Math.sin(rr),
    cima: u1 * Math.sin(rr) + y2 * Math.cos(rr),
    // O olho olha para -z: profundidade positiva é o que está À FRENTE.
    profundidade: -z2,
  };
}

/**
 * Quão à frente do tripé um ponto está, em unidades de cena. Negativo = atrás.
 *
 * É o que decide o que sai da lista do chão de esguelha: no WebKit, um
 * elemento que cruza o plano do olho é desenhado quebrado, e com o tripé baixo,
 * dentro de um cômodo, a parede de trás cruza sempre.
 */
export function profundidadeNoTripe(
  tripe: Tripe,
  ponto: Vec,
  altura = 0,
): number {
  return noOlho(tripe, ponto, altura).profundidade;
}

/**
 * Onde um ponto da cena cai na tela do tripé, ou `null` se está atrás do olho.
 *
 * A mesma conta da corrente, passo a passo. Serve aos testes -- é ela que
 * prova que tripé e orbital concordam -- e a quem desenha sobre a tela.
 */
export function projetarNoTripe(
  tripe: Tripe,
  tela: Tela,
  ponto: Vec,
  altura = 0,
): Vec | null {
  const olho = noOlho(tripe, ponto, altura);
  if (olho.profundidade <= 0) return null;

  const focal = focalDaLente(tela.altura, tripe.lente);
  return {
    x: tela.largura / 2 + (olho.lado * focal) / olho.profundidade,
    y: tela.altura / 2 + (olho.cima * focal) / olho.profundidade,
  };
}

/**
 * O tripé que vê exatamente o que a câmera orbital está vendo.
 *
 * É o "nova câmera daqui": o mestre enquadra no 2.5D, e o tripé nasce onde o
 * olho dele está. O olho da orbital fica a `focal / zoom` unidades do alvo,
 * para trás pela direção em que ela olha; desfazer o giro e a inclinação dessa
 * distância dá a posição no mundo.
 */
export function tripeDaOrbital(
  camera: CameraOrbital,
  tela: Tela,
  lente = LENTE_DA_MESA,
): Tripe {
  const distancia = tela.focal / camera.zoom;
  const g = camera.giro * GRAU;
  const t = camera.inclinacao * GRAU;

  return {
    x: camera.alvo.x + distancia * Math.sin(t) * Math.sin(g),
    y: camera.alvo.y + distancia * Math.sin(t) * Math.cos(g),
    altura: distancia * Math.cos(t),
    giro: camera.giro,
    inclinacao: camera.inclinacao,
    rolagem: 0,
    lente,
  };
}

/**
 * O caminho entre dois tripés, no andamento `t` de 0 a 1.
 *
 * Posição, altura, inclinação, rolagem e lente em linha reta. O giro pelo
 * caminho CURTO: de 350 a 10 são vinte graus, e não trezentos e quarenta -- a
 * mesa veria o tripé dar a volta inteira para olhar quase o mesmo lugar.
 */
export function misturarTripe(de: Tripe, para: Tripe, t: number): Tripe {
  const entre = (a: number, b: number) => a + (b - a) * t;
  const volta = ((((para.giro - de.giro) % 360) + 540) % 360) - 180;

  return {
    x: entre(de.x, para.x),
    y: entre(de.y, para.y),
    altura: entre(de.altura, para.altura),
    giro: (((de.giro + volta * t) % 360) + 360) % 360,
    inclinacao: entre(de.inclinacao, para.inclinacao),
    rolagem: entre(de.rolagem, para.rolagem),
    lente: entre(de.lente, para.lente),
  };
}

