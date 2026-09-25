/**
 * O volume de uma parede: a face que ela mostra quando o mapa é visto de
 * esguelha.
 *
 * É a MESMA conta da sombra, com o vetor trocado. `umbraAoSol` copia o segmento
 * e o empurra pela altura da parede na direção em que a luz anda; aqui o
 * segmento é copiado e empurrado pela altura na direção em que a VISTA anda. Os
 * dois quadriláteros são a mesma figura em sentidos diferentes -- a sombra cai
 * para longe do sol, a face sobe na direção de quem olha --, e é por isso que
 * este arquivo é curto: `segmentosQueProjetam` e `poligonoOrientado` já estavam
 * escritos, testados, e já tinham resolvido os dois problemas difíceis (quais
 * lados aparecem, e por que o sentido do polígono importa).
 *
 * ## O que este módulo NÃO faz, de propósito
 *
 * Não gira o chão. O plano continua 1920x1080 e alinhado ao eixo, e o `scale`,
 * o `offset`, o `clampViewport` e os treze lugares que convertem pixel de tela
 * em unidade de cena com `v / scale` continuam valendo sem saber que este
 * arquivo existe. Girar o plano obrigaria o palco a ficar em `transform` para
 * sempre -- `zoom` é layout e não gira --, o que devolveria o borrão que
 * `conteudoNoLayout` consertou, e a caixa girada de 1920x1080 tem um
 * envolvente de 2202: transbordo, que é a armadilha do `debug-do-palco` §3.
 *
 * O que gira é o VETOR. As paredes deitam para um lado ou para o outro e o
 * chão fica onde está. É 2.5D, e é o que cabe neste palco; o mapa que gira de
 * verdade é outro renderizador.
 *
 * Não ordena por profundidade item a item. As paredes se ordenam entre si (ver
 * `volumeDasParedes`), mas token atrás de parede continua aparecendo por cima
 * dela: oclusão de verdade é intercalar itens e paredes por `y`, e aí a parede
 * deixa de ser uma camada só. Fica para depois de a medida dizer que vale.
 */

import {
  alturaDaParede,
  pedraDasParedes,
  poligonoOrientado,
  segmentosDaParede,
  segmentosQueProjetam,
  type Segmento,
} from "@/lib/geometry/sombra";
import type { Vec } from "@/lib/geometry/transform";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type Parede,
  type Sol,
} from "@/types/scene";

const GRAU = Math.PI / 180;

/**
 * De onde a luz vem quando a cena não tem sol, em graus, na convenção da
 * `sombra.ts` -- o ângulo para onde a SOMBRA anda.
 *
 * 135° põe a luz no noroeste e a sombra correndo para sudeste, que é a
 * convenção do relevo impresso. Vale a pena ser a mesma de sempre: com a luz
 * vindo de baixo o olho lê o morro como buraco, e a parede como vala.
 */
const LUZ_SEM_SOL = 135;

/** Passo entre amostras de cor ao longo de um lado, em unidades de cena. */
const PASSO_DA_AMOSTRA = 48;

/** Teto de amostras por lado: um muro longo não precisa de trezentas leituras. */
const AMOSTRAS_MAX_POR_LADO = 16;

/**
 * Quanto a amostra recua para dentro da parede, em unidades de cena.
 *
 * Um fio. Ver `amostrasDaParede`: grande o bastante para sair da fronteira,
 * pequeno o bastante para não atravessar uma divisória fina.
 */
const RECUO_DA_AMOSTRA = 6;

/** Duas casas: o valor vai para o DOM, e o resto é ruído no atributo. */
function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * De onde o mapa é visto, quando ele é visto de esguelha.
 *
 * Dois números, e do mesmo formato que `Sol` -- que também é direção sem
 * posição. É de propósito: o sol já provou que a mesa entende um mostrador de
 * ângulo, e já provou que uma direção só, válida para o mapa inteiro, é o que
 * torna a conta barata o bastante para rodar em toda tela sem o canal
 * republicar nada.
 */
export type Vista = {
  /**
   * Para onde as paredes se inclinam, em graus, no sentido horário a partir da
   * direita.
   *
   * O ângulo da INCLINAÇÃO e não o da câmera, pela mesma razão que `Sol.angulo`
   * é o da sombra: é a inclinação que se vê na tela, e o mestre gira o
   * mostrador olhando o mapa, não fazendo trigonometria.
   */
  giro: number;
  /**
   * Quanto da altura vira face, de 0 a 1.
   *
   * 0 é o mapa chapado -- a parede não sobe, e o modo some sem nenhum caso
   * especial. 1 é a parede deitada inteira, do tamanho da própria altura. O
   * meio é o que parece mapa de mesa: relevo que se lê, sem virar maquete.
   */
  inclinacao: number;
};

/** Onde a vista começa quando o mestre liga o relevo. */
export const VISTA_PADRAO: Vista = { giro: 270, inclinacao: 0.45 };

/**
 * Uma faixa do volume: tudo o que se ergue pelo MESMO empurrão.
 *
 * Agrupado por empurrão, e não uma por parede, porque o empurrão é
 * `direção × altura × inclinação` -- só a altura muda entre duas paredes do
 * mesmo mapa, e um mapa tem duas ou três alturas. É o que decide quantas
 * texturas a tela vai montar: a face é pintada com a imagem do mapa deslocada
 * pelo empurrão, e uma textura por PAREDE seria uma textura por parede para
 * mostrar o mesmo pedaço de imagem. A mesma economia que a hachura da
 * `ParedeLayer` já faz.
 */
export type FaixaDoVolume = {
  /** O deslocamento desta faixa, em unidades de cena. */
  empurrao: Vec;
  /**
   * As faces verticais, num caminho SÓ.
   *
   * Um caminho e não um por parede pela razão de `umbrasDoSol`: faces que se
   * cruzam não podem escurecer duas vezes, e no mesmo `path` com a regra de
   * voltas a união é uma figura só.
   */
  faces: string;
  /**
   * Os topos desta faixa, num caminho só, e AINDA NO CHÃO.
   *
   * Sem o empurrão aplicado porque quem o aplica é um `<g transform>` na tela:
   * dentro dele, a textura de `userSpaceOnUse` anda junto com a geometria, e o
   * topo sai pintado com o pedaço de mapa que estava sob a parede -- que é
   * exatamente o efeito, a parede pintada no mapa subindo. Empurrar o caminho
   * aqui obrigaria a deslocar a textura por fora, com a conta escrita duas
   * vezes.
   */
  topos: string;
};

/**
 * O empurrão de uma altura, dada a vista. Exportado porque a tela precisa dele
 * para deslocar a textura das faces.
 */
export function empurraoDaVista(altura: number, vista: Vista): Vec {
  const angulo = vista.giro * GRAU;
  const alcance = altura * vista.inclinacao;

  return {
    x: arredondar(Math.cos(angulo) * alcance),
    y: arredondar(Math.sin(angulo) * alcance),
  };
}

/**
 * O volume de todas as paredes, em faixas de mesmo empurrão.
 *
 * Devolve vazio com `inclinacao` em zero: sem inclinação não há face, e o
 * chamador não precisa saber disso -- é o mesmo desligamento que
 * `umbrasDoSol` faz com `comprimento` zero.
 *
 * ## A ordem das faixas é a ordem de pintura
 *
 * Da mais longe para a mais perto, medida pela projeção do centro da parede no
 * vetor da vista. Sem isso, uma torre no fundo do mapa era pintada por cima de
 * um muro na frente dela e o relevo lia ao contrário. É uma ordenação por
 * parede e custa um `sort` por quadro em que a vista muda -- não é profundidade
 * de verdade, que precisaria intercalar os tokens, e é o suficiente para as
 * paredes concordarem entre si.
 */
export function volumeDasParedes(
  paredes: Parede[],
  vista: Vista,
): FaixaDoVolume[] {
  if (vista.inclinacao <= 0 || paredes.length === 0) return [];

  const angulo = vista.giro * GRAU;
  const direcao = { x: Math.cos(angulo), y: Math.sin(angulo) };

  // Mais longe primeiro: quem tem menos projeção no vetor da vista está atrás.
  const ordenadas = [...paredes].sort((a, b) => profundidade(a, direcao) - profundidade(b, direcao));

  const faixas = new Map<string, { empurrao: Vec; faces: string[]; paredes: Parede[] }>();

  for (const parede of ordenadas) {
    const empurrao = empurraoDaVista(alturaDaParede(parede), vista);
    if (empurrao.x === 0 && empurrao.y === 0) continue;

    const chave = `${empurrao.x},${empurrao.y}`;
    let faixa = faixas.get(chave);
    if (!faixa) {
      faixa = { empurrao, faces: [], paredes: [] };
      faixas.set(chave, faixa);
    }

    // A MESMA pergunta da sombra, com o vetor da vista: um lado só aparece se
    // a normal externa dele aponta a favor do empurrão. Numa sala vista de
    // cima e inclinada para baixo, os lados de baixo mostram a face e os de
    // cima ficam escondidos atrás da própria laje.
    for (const segmento of segmentosQueProjetam(parede, direcao)) {
      faixa.faces.push(
        poligonoOrientado([
          { x: segmento.x1, y: segmento.y1 },
          { x: segmento.x1 + empurrao.x, y: segmento.y1 + empurrao.y },
          { x: segmento.x2 + empurrao.x, y: segmento.y2 + empurrao.y },
          { x: segmento.x2, y: segmento.y2 },
        ]),
      );
    }

    faixa.paredes.push(parede);
  }

  return [...faixas.values()].map((faixa) => ({
    empurrao: faixa.empurrao,
    faces: faixa.faces.join(""),
    topos: pedraDasParedes(faixa.paredes),
  }));
}

/** Quão longe do observador esta parede está, na direção da vista. */
function profundidade(parede: Parede, direcao: Vec): number {
  const cx = parede.x + parede.width / 2;
  const cy = parede.y + parede.height / 2;

  return cx * direcao.x + cy * direcao.y;
}

/**
 * Quão perto do observador um ponto do chão está, na vista deitada.
 *
 * É a coordenada do ponto no eixo que corre da FUGA para quem olha, depois de a
 * cena girar. Maior quer dizer mais perto, e é só para isso que serve: ordenar.
 * Não é distância -- a inclinação e a perspectiva não entram, porque nenhuma
 * das duas troca a ordem de dois pontos no mesmo chão.
 *
 * É o que dá a oclusão de graça no chão inclinado. Sem `transform-style:
 * preserve-3d` -- que esta webview não honra para filhos girados, ver o
 * cabeçalho de `ChaoInclinado` --, o motor não ordena nada, e quem pinta por
 * último fica na frente. Pondo paredes e tokens na mesma lista ordenada por
 * isto, o token atrás do muro sai atrás do muro.
 */
export function profundidadeNaVista(
  x: number,
  y: number,
  giro: number,
): number {
  const g = giro * GRAU;

  // A componente em `y` depois do giro: é ela que vira a vertical da tela, e a
  // vertical da tela, num chão deitado, é a profundidade.
  return x * Math.sin(g) + y * Math.cos(g);
}

/**
 * Para onde as paredes deitam, dada a posição da câmera.
 *
 * Existe porque os dois modos medem o mesmo ângulo de lugares diferentes, e o
 * mestre só quer girar UM controle. No chão inclinado, `giro` é onde o
 * observador está. No relevo, o que se ajusta é para onde a parede tomba na
 * tela -- e ela tomba para LONGE de quem olha, que é um quarto de volta de
 * diferença.
 *
 * Sem esta conversão, trocar de modo com o mesmo número girava a cena: era o
 * que fazia o chão abrir de lado com o relevo apontando certo.
 */
export function leandoDaCamera(giroDaCamera: number): number {
  return (giroDaCamera + 270) % 360;
}

/**
 * O encaixe: quanto encolher a cena deitada para ela caber no plano.
 *
 * ## Por que isto não é enfeite
 *
 * Deitar o chão AUMENTA a caixa que ele ocupa. A borda de perto vem na direção
 * do olho e é ampliada pela perspectiva -- a 52° com o olho a 2600, o plano
 * passa de 1920 para 2296 de largura, vinte por cento para fora da caixa. E um
 * filho que passa da caixa de um plano infla a camada composta do WebKitGTK,
 * que é a armadilha que derrubou o Mestre três vezes: o mapa passa a ser
 * pintado deslocado e fica preto ampliado. Ver `debug-do-palco` §3.
 *
 * Encaixando, nada sai da caixa -- e de brinde o enquadramento fica certo, que
 * era o outro sintoma: a cena deitada abria para fora da tela e o que se via
 * era um pedaço ampliado do meio do mapa.
 *
 * ## A conta
 *
 * Os quatro cantos do plano passam pela mesma projeção que o motor vai aplicar
 * -- giro, inclinação, perspectiva -- e o que sai é a caixa que eles ocupam na
 * tela. A escala é a que faz essa caixa caber, e o deslocamento recentra o que
 * sobrou. Quatro pontos, e não uma amostragem: a projeção é uma homografia, e
 * homografia leva o retângulo nos quatro cantos dele.
 *
 * Nunca AMPLIA: `Math.min(..., 1)`. Um chão quase de prumo ocupa menos que o
 * plano, e esticá-lo para preencher seria dar zoom sem ninguém ter pedido.
 */
export function encaixeDoChao(
  inclinacao: number,
  giro: number,
  perspectiva: number,
): { escala: number; dx: number; dy: number } {
  const meiaLargura = SCENE_WIDTH / 2;
  const meiaAltura = SCENE_HEIGHT / 2;

  const t = inclinacao * GRAU;
  const g = giro * GRAU;
  const cosT = Math.cos(t);
  const senT = Math.sin(t);
  const cosG = Math.cos(g);
  const senG = Math.sin(g);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const [lx, ly] of [
    [-meiaLargura, -meiaAltura],
    [meiaLargura, -meiaAltura],
    [meiaLargura, meiaAltura],
    [-meiaLargura, meiaAltura],
  ] as const) {
    // Gira no plano, deita, e só então projeta: a mesma ordem do `transform`.
    const gx = lx * cosG - ly * senG;
    const gy = lx * senG + ly * cosG;

    const z = gy * senT;
    // Perspectiva zero é projeção paralela, e aí não há ampliação nenhuma.
    const f = perspectiva > 0 ? perspectiva / (perspectiva - z) : 1;

    const x = gx * f;
    const y = gy * cosT * f;

    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const largura = maxX - minX;
  const altura = maxY - minY;

  const escala = Math.min(
    SCENE_WIDTH / Math.max(largura, 1),
    SCENE_HEIGHT / Math.max(altura, 1),
    1,
  );

  return {
    escala: arredondar(escala),
    dx: arredondar((-(minX + maxX) / 2) * escala),
    dy: arredondar((-(minY + maxY) / 2) * escala),
  };
}

/**
 * Quão escura fica a face menos iluminada, de 0 a 1.
 *
 * Piso e não preto: uma face de costas para o sol continua sendo pedra num
 * cômodo com tocha acesa, e zerá-la recorta a parede contra o chão como se
 * alguém tivesse furado o mapa. É o mesmo motivo de a sombra ter `forca` e não
 * ser opaca.
 */
const PISO_DA_FACE = 0.38;

/** Uma face pronta para subir: o segmento, e quanto de luz ele pega. */
export type FaceDaParede = Segmento & {
  /**
   * Multiplicador da cor da face, de `PISO_DA_FACE` a 1.
   *
   * Existe porque cor CHAPADA não tem volume: com o mesmo tom nos quatro lados,
   * uma sala vira um vulto recortado -- o canto onde duas paredes se encontram
   * some, e o olho lê silhueta em vez de caixa. Um multiplicador por face
   * devolve o canto, e sai de um produto escalar que a sombra já calculava.
   */
  brilho: number;
};

/**
 * As faces de uma parede, cada uma já sabendo quanta luz pega.
 *
 * ## De onde vem a luz
 *
 * Do sol da cena, quando há um. `Sol.angulo` é o ângulo da SOMBRA -- é a
 * convenção de toda a `sombra.ts`, porque é a sombra que se vê --, então a luz
 * vem do sentido oposto, e é por isso que o vetor abaixo nasce negado.
 *
 * Sem sol, uma luz fixa do noroeste. Não é enfeite nem escolha de gosto: é a
 * convenção de relevo de mapa impresso, a mesma que faz uma curva de nível
 * parecer morro e não buraco. Sem nenhuma direção, todas as faces sairiam
 * iguais e o modo perderia o canto -- que é justamente o que ele veio mostrar.
 *
 * ## O sinal
 *
 * Com os vértices no sentido de área positiva, a normal externa de `a -> b` é
 * `(dy, -dx)` -- a mesma de `segmentosQueProjetam`, e pelo mesmo motivo. Uma
 * face está iluminada quando essa normal aponta PARA a luz.
 *
 * A `linha` não tem dentro, então não tem normal externa: os dois lados dela
 * são corredor, e o que sobra é o seno do ângulo com a luz. Uma divisória
 * paralela ao sol fica escura dos dois lados, uma de través fica clara dos
 * dois. É menos informação, e é toda a que existe -- inventar um lado de fora
 * para um traço seria escolher um por sorteio.
 */
export function facesDaParede(
  parede: Parede,
  sol: Sol | null,
  /**
   * De onde se olha, em graus. Dado, descarta as faces de costas.
   *
   * Descartar não é economia de enfeite: cada face é um `div` com transformação
   * 3D, e no WebKit toda transformação 3D ganha uma camada composta própria.
   * Quarenta paredes davam cento e sessenta camadas, e a medida na webview
   * cobrou 36 fps com 91,3% dos quadros perdidos contra 60 do mesmo mapa de
   * prumo. Metade delas está virada para o lado de lá e nunca foi vista.
   *
   * Ausente = devolve todas, que é o que a conta de oclusão quer quando ela
   * pergunta por uma parede específica.
   */
  giroDaVista?: number,
): FaceDaParede[] {
  const segmentos = segmentosDaParede(parede);
  if (segmentos.length === 0) return [];

  const angulo = (sol ? sol.angulo : LUZ_SEM_SOL) * GRAU;
  // Negado: `angulo` é para onde a sombra anda, e a luz vem de trás dela.
  const luzX = -Math.cos(angulo);
  const luzY = -Math.sin(angulo);

  const aberta = parede.formato === "linha";

  // Shoelace pelos inícios dos segmentos: eles vêm na ordem do contorno, então
  // o sinal da área diz se a lista está no sentido horário ou anti-horário.
  // Sem isto a normal externa aponta para dentro em metade dos laços, e a
  // parede sai iluminada pelo lado errado.
  let dobro = 0;
  if (!aberta) {
    for (let i = 0; i < segmentos.length; i += 1) {
      const atual = segmentos[i]!;
      const proximo = segmentos[(i + 1) % segmentos.length]!;
      dobro += atual.x1 * proximo.y1 - proximo.x1 * atual.y1;
    }
  }
  const sentido = dobro < 0 ? -1 : 1;

  /**
   * Para onde o observador está, como vetor.
   *
   * O mesmo par que `profundidadeNaVista` usa: ali a profundidade é
   * `x*sen(g) + y*cos(g)`, e maior quer dizer mais perto. Então este é o
   * sentido em que a cena se aproxima de quem olha.
   */
  const olhoX = giroDaVista === undefined ? 0 : Math.sin(giroDaVista * GRAU);
  const olhoY = giroDaVista === undefined ? 0 : Math.cos(giroDaVista * GRAU);

  /**
   * Só a parede FECHADA e COBERTA esconde as próprias costas.
   *
   * A `linha` não tem dentro -- os dois lados dela são corredor. E o pátio tem
   * o miolo à vista, então a face de dentro é parede que alguém vê de pé no
   * quintal. É a mesma ressalva que `segmentosQueProjetam` faz, e pelo mesmo
   * motivo.
   */
  const escondeCostas =
    giroDaVista !== undefined && !aberta && !parede.semTeto;

  return segmentos.flatMap((segmento) => {
    const dx = segmento.x2 - segmento.x1;
    const dy = segmento.y2 - segmento.y1;
    const comprimento = Math.hypot(dx, dy) || 1;

    const nx = (dy / comprimento) * sentido;
    const ny = (-dx / comprimento) * sentido;

    // De costas para quem olha: a massa da própria parede está na frente dela.
    if (escondeCostas && nx * olhoX + ny * olhoY <= 0) return [];

    const lambert = nx * luzX + ny * luzY;
    // Sem lado de fora, o que se sabe é o quanto a face está DE TRAVÉS para a
    // luz, e isso é o módulo.
    const luz = aberta ? Math.abs(lambert) : Math.max(0, lambert);

    return [
      {
        ...segmento,
        brilho: arredondar(PISO_DA_FACE + (1 - PISO_DA_FACE) * luz),
      },
    ];
  });
}

/**
 * Onde perguntar ao mapa de que cor esta parede é.
 *
 * Pontos sobre a MASSA da parede, para `corDominante` ler. Andam por cima do
 * contorno e não pelo miolo, e isso é o que faz a conta valer nos quatro
 * formatos: o miolo de um pátio (`semTeto`) é chão à vista -- grama, terra, o
 * que o autor pintou dentro do quintal --, e amostrar ali daria ao muro a cor
 * do jardim. A borda é pedra nos dois casos.
 *
 * Empurrados para DENTRO por um fio, porque o contorno é a fronteira: metade
 * de uma amostra posta exatamente em cima dele cai no chão do lado de fora. O
 * empurrão é pequeno de propósito -- uma divisória fina não tem dentro para
 * onde fugir, e um passo grande a atravessaria e leria a sala vizinha.
 *
 * A `linha` não leva empurrão nenhum: ela não tem dentro, e o que está sob o
 * traço já é a parede que o autor pintou.
 */
export function amostrasDaParede(parede: Parede): Vec[] {
  const segmentos = segmentosDaParede(parede);
  if (segmentos.length === 0) return [];

  const aberta = parede.formato === "linha";

  let dobro = 0;
  if (!aberta) {
    for (let i = 0; i < segmentos.length; i += 1) {
      const atual = segmentos[i]!;
      const proximo = segmentos[(i + 1) % segmentos.length]!;
      dobro += atual.x1 * proximo.y1 - proximo.x1 * atual.y1;
    }
  }
  const sentido = dobro < 0 ? -1 : 1;

  const pontos: Vec[] = [];

  for (const segmento of segmentos) {
    const dx = segmento.x2 - segmento.x1;
    const dy = segmento.y2 - segmento.y1;
    const comprimento = Math.hypot(dx, dy);
    if (comprimento < 1) continue;

    // Uma amostra a cada tanto, com teto: um muro de mil unidades não precisa
    // de trezentas leituras para dizer que é de pedra.
    const quantas = Math.min(
      AMOSTRAS_MAX_POR_LADO,
      Math.max(3, Math.round(comprimento / PASSO_DA_AMOSTRA)),
    );

    // Para dentro: o oposto da normal externa.
    const recuoX = aberta ? 0 : (-dy / comprimento) * sentido * RECUO_DA_AMOSTRA;
    const recuoY = aberta ? 0 : (dx / comprimento) * sentido * RECUO_DA_AMOSTRA;

    for (let i = 0; i < quantas; i += 1) {
      // Meio do intervalo, e não as pontas: o canto de uma parede é onde duas
      // faces se encontram, e uma amostra cravada nele pertence às duas.
      const t = (i + 0.5) / quantas;
      pontos.push({
        x: segmento.x1 + dx * t + recuoX,
        y: segmento.y1 + dy * t + recuoY,
      });
    }
  }

  return pontos;
}

/**
 * A coordenada HORIZONTAL da tela, no chão deitado.
 *
 * A irmã de `profundidadeNaVista`: aquela devolve o `y` do giro, que vira a
 * vertical da tela; esta devolve o `x`, que atravessa. Juntas dizem onde um
 * ponto do chão cai na tela antes da perspectiva.
 */
export function lateralNaVista(x: number, y: number, giro: number): number {
  const g = giro * GRAU;
  return x * Math.cos(g) - y * Math.sin(g);
}

/**
 * Onde uma coisa cai na tela, e a que profundidade.
 *
 * Caixa envolvente, e não a figura: um polígono exato custaria um recorte por
 * par, e o que se decide com isto é se uma parede fica transparente -- errar
 * para o lado de desbotar a mais é invisível, e errar para menos é o token
 * sumindo atrás do muro, que é justamente o que se veio consertar.
 *
 * Sem perspectiva de propósito. O `f` da projeção depende da profundidade, e as
 * duas coisas comparadas aqui estão sempre a profundidades VIZINHAS -- uma logo
 * atrás da outra, que é o que torna a pergunta interessante. O fator quase se
 * cancela, e carregá-lo custaria uma divisão por canto para mudar o resultado
 * na terceira casa.
 */
export type CaixaNaTela = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  profundidade: number;
};

/**
 * A caixa que a face de uma parede ocupa na tela.
 *
 * A face nasce no chão e sobe pela normal dele. Depois de deitar a cena, essa
 * normal aponta para cima da tela e encurta: uma parede de altura `h` num chão
 * a `t` graus sobe `h * sen(t)` pixels. A `t = 0` não sobe nada, e é assim que
 * o modo some sem nenhum caso especial.
 */
export function caixaDaFace(
  segmento: Segmento,
  altura: number,
  giro: number,
  inclinacao: number,
): CaixaNaTela {
  const t = inclinacao * GRAU;
  const cosT = Math.cos(t);
  const sobe = altura * Math.sin(t);

  const ax = lateralNaVista(segmento.x1, segmento.y1, giro);
  const bx = lateralNaVista(segmento.x2, segmento.y2, giro);
  const ay = profundidadeNaVista(segmento.x1, segmento.y1, giro);
  const by = profundidadeNaVista(segmento.x2, segmento.y2, giro);

  return {
    x1: Math.min(ax, bx),
    x2: Math.max(ax, bx),
    y1: Math.min(ay, by) * cosT - sobe,
    y2: Math.max(ay, by) * cosT,
    // A do MEIO, e não a da ponta mais perto: é ela que ordena a pintura, e o
    // que se pergunta aqui é exatamente quem foi pintado por cima de quem.
    profundidade: profundidadeNaVista(
      (segmento.x1 + segmento.x2) / 2,
      (segmento.y1 + segmento.y2) / 2,
      giro,
    ),
  };
}

/**
 * A caixa que uma peça ocupa na tela.
 *
 * A peça encara quem olha: o `transform` dela desfaz o giro e a inclinação, e o
 * que sobra é uma figura de pé, com o PÉ no ponto do chão. Por isso ela sobe a
 * `altura` INTEIRA na tela, e não `altura * sen(t)` como a parede -- ela não
 * deita junto com o chão, que é o ponto de ser miniatura e não decalque.
 *
 * `lado` é a largura, que é a base que a peça ocupa no chão; `altura` é quanto
 * a figura sobe, e vem da proporção da arte. Os dois são separados porque uma
 * miniatura em pé é alta e estreita: um sujeito de pé desenhado em 608x1696
 * ocupa um quadrado de chão e três quadrados de ar, e forçá-lo num quadrado é o
 * que o achatava.
 */
export function caixaDaPeca(
  centroX: number,
  pe: number,
  lado: number,
  altura: number,
  giro: number,
  inclinacao: number,
): CaixaNaTela {
  const t = inclinacao * GRAU;
  const x = lateralNaVista(centroX, pe, giro);
  const profundidade = profundidadeNaVista(centroX, pe, giro);
  const chao = profundidade * Math.cos(t);

  return {
    x1: x - lado / 2,
    x2: x + lado / 2,
    y1: chao - altura,
    y2: chao,
    profundidade,
  };
}

/**
 * `frente` tapa `atras`?
 *
 * Duas perguntas, e as duas baratas: quem está mais perto de quem, e as caixas
 * se cruzam na tela. A primeira usa a MESMA profundidade que ordena a pintura,
 * então a resposta bate com o que o olho vê -- se esta conta diz que tapa, é
 * porque aquela mandou pintar por cima.
 *
 * O empate não tapa. Uma peça em cima do próprio muro -- alguém na ameia --
 * divide a profundidade com ele, e desbotar a parede ali seria desbotar por
 * causa de quem está À VISTA.
 */
export function tapa(frente: CaixaNaTela, atras: CaixaNaTela): boolean {
  if (frente.profundidade <= atras.profundidade) return false;

  return (
    frente.x1 < atras.x2 &&
    frente.x2 > atras.x1 &&
    frente.y1 < atras.y2 &&
    frente.y2 > atras.y1
  );
}
