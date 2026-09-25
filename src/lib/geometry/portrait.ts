import { canvasDaUrl, type FonteRetrato } from "@/lib/extensoes/fontes";
import { boxBounds, unionBounds, type Bounds } from "@/lib/geometry/bounds";
import { FULL_VIEWPORT } from "@/lib/geometry/viewport";
import { medidoresVisiveis } from "@/lib/medidor";
import type { Medidor } from "@/types/character";
import {
  LAYOUT_PADRAO,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type AncoraRetrato,
  type LayoutDoRetrato,
  type Portrait,
  type UniaoDeRetratos,
  type Viewport,
} from "@/types/scene";
import type { ItemBox } from "@/lib/geometry/transform";

/** Proporção do plano. A câmera sempre a respeita, então vale para o recorte. */
const PLANE_ASPECT = SCENE_HEIGHT / SCENE_WIDTH;

/** Altura inicial do retrato, em fração da câmera. Cabe três lado a lado. */
const INITIAL_HEIGHT = 0.34;

/** Folga da borda, para o retrato não encostar no limite da tela. */
const MARGIN = 0.02;

/** Usado quando a medida do arquivo não veio — arquivo antigo ou corrompido. */
const FALLBACK_ASPECT = 3 / 4;

/**
 * Onde o retrato cai no plano de cena, dado o recorte atual da câmera.
 *
 * É a única ponte entre os dois espaços, e existe para as três visões
 * desenharem pelo mesmo caminho: no Espectador a câmera é a tela inteira, no
 * Mestre ela é o retângulo da moldura, e a conta é a mesma.
 */
export function portraitBox(
  portrait: Portrait,
  camera: Viewport = FULL_VIEWPORT,
): ItemBox {
  return {
    x: camera.x + portrait.x * camera.width,
    y: camera.y + portrait.y * camera.height,
    width: portrait.width * camera.width,
    height: portrait.height * camera.height,
  };
}

/** Volta de coordenadas de cena para fração da câmera. */
export function portraitFraction(
  box: ItemBox,
  camera: Viewport = FULL_VIEWPORT,
): Pick<Portrait, "x" | "y" | "width" | "height"> {
  return {
    x: (box.x - camera.x) / camera.width,
    y: (box.y - camera.y) / camera.height,
    width: box.width / camera.width,
    height: box.height / camera.height,
  };
}

/**
 * Retrato novo, no canto inferior esquerdo e já no ar.
 *
 * A largura sai da proporção natural do arquivo: `width` e `height` são
 * frações de eixos diferentes, então a proporção do plano entra na conta —
 * sem ela, todo retrato nasceria achatado.
 */
export function createPortrait(
  personagemId: string,
  assetId: string,
  naturalWidth?: number,
  naturalHeight?: number,
): Portrait {
  const aspect =
    naturalWidth && naturalHeight
      ? naturalWidth / naturalHeight
      : FALLBACK_ASPECT;
  const width = INITIAL_HEIGHT * aspect * PLANE_ASPECT;

  return {
    // O id É o personagem. Um uuid próprio obrigaria a manter um mapa de
    // "qual retrato é do Edgar", e duas aberturas do mesmo personagem
    // criariam dois registros para a mesma figura.
    id: personagemId,
    personagemId,
    assetId,
    x: MARGIN,
    y: 1 - MARGIN - INITIAL_HEIGHT,
    width,
    height: INITIAL_HEIGHT,
    visible: true,
  };
}

/** Caixa que envolve os retratos, em coordenadas de cena. */
export function portraitsBounds(
  portraits: Portrait[],
  camera?: Viewport,
): Bounds | null {
  return unionBounds(
    portraits.map((portrait) => boxBounds(portraitBox(portrait, camera))),
  );
}

/**
 * Escala vários retratos de uma vez, mantendo a proporção entre eles.
 *
 * Cada retrato guarda a posição relativa dentro do grupo: o que era um terço
 * da largura continua um terço depois de arrastar a alça. Um fator só, tirado
 * da largura, porque o gizmo do grupo trava a proporção — dois fatores
 * deformariam os retratos, que é o que ninguém quer num rosto.
 *
 * A conta acontece em coordenadas de cena e volta para fração no fim: é o
 * mesmo espaço em que o gizmo trabalha, e converter antes exigiria refazer a
 * geometria do gizmo em fração.
 */
export function scalePortraitGroup(
  portraits: Portrait[],
  from: Bounds,
  to: Bounds,
  camera?: Viewport,
): Array<{
  id: string;
  patch: Pick<Portrait, "x" | "y" | "width" | "height">;
}> {
  const width = from.maxX - from.minX;
  const height = from.maxY - from.minY;
  // Grupo sem área não define fator; devolver vazio é melhor que espalhar NaN.
  if (width <= 0 || height <= 0) return [];

  const factor = (to.maxX - to.minX) / width;

  return portraits.map((portrait) => {
    const box = portraitBox(portrait, camera);

    return {
      id: portrait.id,
      patch: portraitFraction(
        {
          x: to.minX + (box.x - from.minX) * factor,
          y: to.minY + (box.y - from.minY) * factor,
          width: box.width * factor,
          height: box.height * factor,
        },
        camera,
      ),
    };
  });
}

/**
 * Os retratos de uma cena: quem tem token nela, e tem Retrato na ficha.
 *
 * UM lugar que decide isso, porque tres consumidores fazem a mesma pergunta e
 * teriam de concordar: o painel lista, o palco desenha, e o publicador manda
 * para a mesa. Cada um com o seu filtro divergiria no primeiro caso de borda --
 * e o caso de borda aqui e a cena EM EDICAO nao ser a cena NO AR.
 *
 * A ordem sai dos tokens, e nao do registro guardado: e a ordem em que os
 * personagens entraram na cena, que e a que o mestre acabou de construir.
 *
 * `assetId` vem do campo Retrato do personagem, sobrescrevendo o que estiver
 * guardado -- ver `Portrait.assetId`. O mesmo vale para `url`, que vem do campo
 * Retrato ao vivo e e resolvida aqui pela mesma razao: crava-la no registro
 * guardado deixaria a mesa vendo a pagina antiga depois de o mestre trocar o
 * link.
 *
 * `fontes` sao as fontes de retrato das extensoes habilitadas, e entram so para
 * responder em que CANVAS a pagina foi desenhada. Lista vazia e estado valido --
 * quem colou a URL a mao, sem extensao nenhuma, cai no `CANVAS_PADRAO`.
 *
 * Os `medidores` vem pelo mesmo caminho, e por isso o quinto parametro. Eles
 * saem FILTRADOS por padrao: dos tres consumidores, um publica na rede, e o
 * default seguro e o que faz um chamador novo nascer certo. `incluirOcultos` e
 * do palco do Mestre, o unico que precisa ver o que a mesa nao ve -- ele
 * desenha os escondidos apagados, para o mestre saber que estao la.
 *
 * `layoutPadrao` e o da SESSAO, e aqui os dois niveis viram um: o que sai tem
 * `layout` inteiro, com o que o retrato escolheu por cima do que a mesa
 * escolheu. E o mesmo servico que a funcao ja presta ao `assetId` -- quem
 * recebe o quadro nao precisa saber que havia dois lugares onde procurar.
 */
export function retratosDaCena(
  guardados: Portrait[],
  itens: ReadonlyArray<{ personagemId?: string }>,
  personagens: ReadonlyArray<{
    id: string;
    retrato?: string;
    retratoUrl?: string;
    medidores?: Medidor[];
  }>,
  fontes: FonteRetrato[] = [],
  incluirOcultos = false,
  layoutPadrao: LayoutDoRetrato = LAYOUT_PADRAO,
): Portrait[] {
  const porId = new Map(
    guardados.map((retrato) => [retrato.personagemId, retrato]),
  );
  const fichas = new Map(
    personagens.map((personagem) => [personagem.id, personagem]),
  );

  const vistos = new Set<string>();
  const saida: Portrait[] = [];

  for (const item of itens) {
    const personagemId = item.personagemId;
    if (!personagemId || vistos.has(personagemId)) continue;

    vistos.add(personagemId);

    // Sem ficha, o token e de um personagem apagado. Sem NENHUM dos dois
    // retratos, nao ha o que desenhar -- o painel ainda mostra a linha, com o
    // motivo, mas ela nao gera retrato nenhum.
    const ficha = fichas.get(personagemId);
    const retratoAsset = ficha?.retrato;
    const url = ficha?.retratoUrl;
    if (!retratoAsset && !url) continue;

    const guardado = porId.get(personagemId);
    if (!guardado) continue;

    const canvas = url ? canvasDaUrl(url, fontes) : null;

    saida.push({
      ...guardado,
      // Vazio e nao `undefined`: o campo e obrigatorio no tipo, e quem so tem
      // pagina viva nao tem asset nenhum para apontar. `useAssetUrl` devolve
      // nada para id vazio, que e o que faz a imagem de tras nao existir.
      assetId: retratoAsset ?? "",
      // Resolvidos da ficha como o resto, e nao do registro guardado: o
      // medidor muda a cada golpe, e uma copia cravada no retrato mostraria a
      // vida de quando ele foi armado.
      //
      // O filtro e o PADRAO, e nao uma opcao que cada chamador lembra de
      // ligar: tres telas leem esta funcao e uma delas publica na rede. O
      // default seguro e o que faz um chamador novo nascer certo.
      medidores: incluirOcultos
        ? (ficha?.medidores ?? [])
        : medidoresVisiveis(ficha?.medidores),
      layout: { ...layoutPadrao, ...guardado.layout },
      ...(url && canvas
        ? { url, urlLargura: canvas.largura, urlAltura: canvas.altura }
        : {}),
    });
  }

  return saida;
}

/**
 * Folga entre a fila e a borda da câmera, em fração.
 *
 * Maior que a `MARGIN` de um retrato solto lá em cima, e com nome diferente de
 * propósito: as duas em inglês e português no mesmo arquivo eram um convite a
 * trocar uma pela outra.
 */
const MARGEM_FILA = 0.03;

/**
 * Espaço entre dois retratos da fila, em fração da câmera.
 *
 * É o padrão, e não o valor: o mestre ajusta, e o ajuste mora em cada união --
 * ver `UniaoDeRetratos.folga`. Continua existindo como constante porque é com
 * ele que toda união nasce, e porque `filaDeRetratos` precisa de um número
 * quando ninguém escolheu nenhum.
 */
export const FOLGA_PADRAO = 0.015;

/**
 * Os limites do ajuste, e por que o negativo está entre eles.
 *
 * Sobrepor a fila é um pedido de verdade: retrato com borda transparente nasce
 * com um vão que não está no desenho, e elenco ombro a ombro é uma imagem que
 * fila espaçada não produz. A sobreposição já existia no algoritmo como saída
 * de emergência -- aqui ela vira escolha.
 *
 * Simétricos e pequenos: a fila ocupa uma faixa da tela, e um dezesseis avos
 * dela de respiro entre duas figuras já é muito. Quem quer mais que isso não
 * quer uma fila, quer os retratos soltos.
 */
export const FOLGA_MIN = -0.06;
export const FOLGA_MAX = 0.06;

/**
 * A largura da coluna de medidores, em fração da ALTURA do retrato.
 *
 * Da altura e não da largura, com a proporção do plano na conta — o mesmo
 * caminho de `createPortrait`. Retrato deitado e retrato em pé têm larguras
 * muito diferentes e alturas parecidas, porque a fila alinha rostos: medida
 * pela largura, a coluna de uma figura panorâmica ficaria três vezes maior que
 * a da vizinha, para escrever as mesmas duas palavras.
 *
 * O número saiu da TELA, em duas correções. 0,4 dava uma tira de uns 70px num
 * palco de mil, e o nome era cortado em "Vi…". 0,6 não consertou: o corpo do
 * texto é derivado DESTA largura, então os dois cresciam juntos e a proporção
 * ficava a mesma -- "Medidor 10/10" continuava virando "Med… 10/10". Quem
 * conserta é o par: esta sobe e a razão do corpo desce, em `MedidoresDoRetrato`.
 *
 * 0,8 põe a coluna um pouco acima da largura de um retrato em pé. É o teto
 * útil: a fila promete três personagens lado a lado (ver `INITIAL_HEIGHT`), e
 * com a coluna somada eles ocupam 0,92 da faixa contra os 0,94 disponíveis.
 * Passando disso, a folga entre os vizinhos começa a ser comida.
 */
export const LARGURA_DOS_MEDIDORES = 0.8;

/**
 * Quanto um retrato ocupa NA FILA, contando a coluna de medidores.
 *
 * Separado de `width` de propósito: são duas perguntas diferentes sobre o mesmo
 * retrato. `width` é o tamanho da FIGURA — é dela que o gizmo pega, é ela que o
 * mestre estica, e a coluna não pode entrar aí ou arrastar a alça esticaria as
 * barras junto. Esta é o tamanho do LUGAR que o retrato pede na fileira, e é o
 * que impede o vizinho de encostar em cima das barras.
 *
 * Sem medidor não há coluna, e a conta volta a ser a largura de sempre: uma
 * fila de retratos sem barra nenhuma se enfileira exatamente como antes.
 *
 * Retrato que só tem medidor ESCONDIDO não reserva coluna para a mesa, e
 * reserva no palco do Mestre — que é quem recebe a lista inteira. A divergência
 * é um VÃO a mais na TV, nunca uma sobreposição, que é o lado certo de errar:
 * é a mesma preferência que `folgaAplicada` já tem.
 */
export function larguraNaFila(
  retrato: Pick<Portrait, "width" | "height" | "medidores" | "layout">,
): number {
  return caixaDaComposicao(retrato).largura;
}

/**
 * A largura da coluna de medidores de um retrato desta altura.
 *
 * Exportada porque duas peças precisam do MESMO número: a fila, que reserva o
 * lugar, e a coluna, que se desenha nele. Divergindo, o vizinho encosta por um
 * fio ou sobra um vão que ninguém pediu.
 *
 * O número de medidores não entra: eles empilham para baixo, e é isso que faz
 * a largura não depender de quantos são -- nem da lista que cada tela recebeu.
 */
export function larguraDaColuna(altura: number, escala = 1): number {
  return altura * LARGURA_DOS_MEDIDORES * PLANE_ASPECT * limitarEscala(escala);
}

/**
 * Os limites do ajuste de tamanho da coluna.
 *
 * Metade e o dobro. Abaixo de metade o nome não se lê nem de perto; acima do
 * dobro a coluna fica mais larga que dois retratos, e a fila deixa de caber --
 * `LARGURA_DOS_MEDIDORES` já está no teto do que os três personagens lado a
 * lado permitem, e a escala multiplica justamente aquilo.
 */
export const ESCALA_MIN = 0.5;
export const ESCALA_MAX = 2;

/**
 * Prende a escala aos limites, ou devolve 1 para o que não é número.
 *
 * Irmã de `limitarFolga`, e existe pelo mesmo motivo: o valor entra por dois
 * caminhos que ninguém controla -- o `retratos.json` de uma versão futura ou
 * corrompido, e o quadro que chega pelo canal. A régua da tela já não deixa
 * sair do intervalo; é dos outros dois que este guarda protege.
 */
export function limitarEscala(escala: unknown): number {
  return typeof escala === "number" && Number.isFinite(escala)
    ? Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, escala))
    : 1;
}

/**
 * A largura da fileira de dados, em fração da LARGURA do retrato.
 *
 * A fileira é a coluna do histórico mais o dado de agora, e os dois saem da
 * largura do retrato em `RolagensDoRetrato`: o dado grande vale 0,34, o
 * histórico com o número ao lado fica perto de 0,26, e o vão entre eles 0,05.
 *
 * Só entra na conta da fila quando o mestre deu um LUGAR aos dados. No
 * automático eles caem embaixo da figura, e reservar largura para um dado que
 * não está rolando deixaria um vão permanente ao lado de todo retrato da mesa.
 */
const LARGURA_DOS_DADOS = 0.65;

/** A largura da fileira de dados de um retrato desta largura, já com a escala. */
export function larguraDosDados(largura: number, escala = 1): number {
  return largura * LARGURA_DOS_DADOS * limitarEscala(escala);
}

/**
 * A caixa que envolve o retrato e as peças dele, em fração da câmera.
 *
 * Devolve o quanto ela passa da figura para cada lado, e não um retângulo: quem
 * chama é a fila, e o que ela precisa saber é onde o vizinho pode encostar. O
 * `recuo` é o que sobra à ESQUERDA da figura, e entra como deslocamento; a
 * `largura` é a da composição inteira.
 *
 * Só o eixo horizontal. A fila alinha pela base ou pelo topo e empilha uniões
 * pela altura do maior membro -- é conta de largura que decide se um rosto
 * encosta no outro, e é ela que a coluna de medidores mudou.
 *
 * Peça DESLIGADA não ocupa nada, e peça no automático ocupa do lado em que o
 * automático a põe: a coluna de medidores conta sempre (ela cabe de um lado ou
 * do outro, e nos dois casos rouba a mesma largura do vizinho), e os dados não
 * contam, porque embaixo eles não disputam largura com ninguém.
 */
export function caixaDaComposicao(
  retrato: Pick<Portrait, "width" | "height" | "medidores" | "layout">,
): { recuo: number; largura: number } {
  const layout = { ...LAYOUT_PADRAO, ...retrato.layout };

  let esquerda = 0;
  let direita = retrato.width;

  const temMedidor = (retrato.medidores?.length ?? 0) > 0;
  if (layout.medidores && temMedidor) {
    const coluna = larguraDaColuna(retrato.height, layout.escalaMedidores);
    const lugar = layout.lugarDosMedidores;

    if (lugar) {
      // Em fração da CAIXA: `x: 1.08` é logo depois da borda direita dela.
      const inicio = lugar.x * retrato.width;
      esquerda = Math.min(esquerda, inicio);
      direita = Math.max(direita, inicio + coluna);
    } else {
      // No automático ela fica de um lado ou do outro, conforme o recorte.
      // Reservar do lado direito é arbitrário e é o certo: o que a fila precisa
      // é que a largura roubada do vizinho seja a mesma nos dois casos.
      direita += coluna;
    }
  }

  const lugarDosDados = layout.lugarDosDados;
  if (layout.dados && lugarDosDados) {
    const largura = larguraDosDados(retrato.width, layout.escalaDados);
    const inicio = lugarDosDados.x * retrato.width;

    esquerda = Math.min(esquerda, inicio);
    direita = Math.max(direita, inicio + largura);
  }

  // `esquerda < 0` e nao `-esquerda`: sem peca para fora, a negacao de zero e
  // `-0`, que passa em `===` e falha em `toEqual` -- e um dia vira um `-0px`
  // num estilo. `esquerda` nunca e positiva, entao o ramo cobre os dois casos.
  return {
    recuo: esquerda < 0 ? -esquerda : 0,
    largura: direita - esquerda,
  };
}

/**
 * Onde uma peça do retrato começa, garantido dentro do recorte.
 *
 * Tudo na unidade de quem chama, com a origem no canto do retrato: o recorte
 * vai de `-folgaEsquerda` a `largura + folgaDireita`. É a mesma função no plano
 * do Mestre, em unidade de cena, e no overlay da mesa, em pixel.
 *
 * ## Por que ela existe
 *
 * Porque **filho que transborda a caixa de um plano infla a camada composta**,
 * e o WebKitGTK então pinta o mapa deslocado e depois preto -- só no Mestre, só
 * com a câmera parada, só ao dar zoom. Já derrubou o palco três vezes, sempre
 * com alguém pondo elemento novo dentro de um plano, e o sintoma lê como bug de
 * câmera. Ver a skill `debug-do-palco`, §3.
 *
 * Escolher o lado com mais espaço resolve o caso comum, e esta prende o que
 * sobra dele: com o retrato ampliado até ocupar a câmera inteira não há lado
 * bom, e sem a trava a coluna sairia do recorte dos dois jeitos. Encostar sobre
 * a borda da figura é o pior que acontece aqui, e é melhor que o que acontece
 * lá fora.
 *
 * O feed de dados aceita sumir nesse caso ("trocar de lado só trocaria qual
 * metade some"), e a diferença é de EIXO: o que sai por baixo do retrato sai
 * pela borda de baixo do plano, e o que sai pelo lado sai justamente pela borda
 * em que o mestre encosta a fila de propósito -- a posição mais comum da tela,
 * não a exceção.
 */
export function pecaNoRecorte({
  desejado,
  coluna,
  largura,
  folgaDireita,
  folgaEsquerda,
}: {
  /** Onde ela ficaria sem trava nenhuma. */
  desejado: number;
  /** A largura da peça. */
  coluna: number;
  /** A largura da caixa do retrato. */
  largura: number;
  folgaDireita: number;
  folgaEsquerda: number;
}): number {
  const minimo = -folgaEsquerda;
  const maximo = largura + folgaDireita - coluna;

  // Coluna mais larga que o recorte inteiro: não há posição que caiba, e
  // encostar na borda esquerda ao menos mantém o começo do nome legível.
  if (maximo < minimo) return minimo;

  return Math.min(Math.max(desejado, minimo), maximo);
}

/**
 * Prende a folga aos limites, ou devolve o padrão para o que não é número.
 *
 * Existe porque o valor entra por dois caminhos que ninguém controla: o
 * `retratos.json` de uma versão futura ou corrompido, e o estado que chega pelo
 * canal. O slider já não deixa sair do intervalo -- é dos outros dois que este
 * guarda protege.
 */
export function limitarFolga(folga: unknown): number {
  return typeof folga === "number" && Number.isFinite(folga)
    ? Math.min(FOLGA_MAX, Math.max(FOLGA_MIN, folga))
    : FOLGA_PADRAO;
}

/**
 * Onde cada área de encaixe fica, em fração da câmera.
 *
 * Tabela e não `if`: as seis são as combinações de dois eixos, e escrever a
 * tabela deixa óbvio que nenhuma combinação foi esquecida.
 */
const AREAS: Record<
  AncoraRetrato,
  { horizontal: "esquerda" | "centro" | "direita"; vertical: "cima" | "baixo" }
> = {
  "cima-esquerda": { horizontal: "esquerda", vertical: "cima" },
  "cima-centro": { horizontal: "centro", vertical: "cima" },
  "cima-direita": { horizontal: "direita", vertical: "cima" },
  "baixo-esquerda": { horizontal: "esquerda", vertical: "baixo" },
  "baixo-centro": { horizontal: "centro", vertical: "baixo" },
  "baixo-direita": { horizontal: "direita", vertical: "baixo" },
};

/**
 * Onde cada retrato da fila deve estar, na ordem em que eles vêm.
 *
 * Em fração da câmera, como o resto do retrato. Devolve só `x` e `y`: o tamanho
 * é de cada um, e a fila não mexe nele — o mestre pode querer o chefe maior que
 * os capangas.
 *
 * Alinhados pela BASE nas áreas de baixo e pelo TOPO nas de cima: figuras de
 * alturas diferentes lado a lado precisam de uma linha comum, e no chão é onde
 * uma pessoa em pé encosta.
 *
 * `deslocamento` afasta a fila inteira da borda em que ela encosta, e é o que
 * empilha duas uniões na mesma área -- ver `filasDeUnioes`. Zero é a fila
 * encostada, que é o caso de quem chegou primeiro naquela área.
 *
 * `escolhida` é o espaço entre dois vizinhos, e pode ser NEGATIVO -- ver
 * `FOLGA_MIN`. Não cabendo, a folga positiva encolhe até zero; ainda não
 * cabendo, eles se sobrepõem o necessário para a fila terminar dentro da
 * margem. Fila sobreposta sem querer é feia; fila fora da tela é inútil, e é a
 * única tela em que o retrato aparece. Ver `folgaAplicada`.
 */
export function filaDeRetratos(
  fila: ReadonlyArray<
    Pick<Portrait, "id" | "width" | "height" | "medidores" | "layout">
  >,
  ancora: AncoraRetrato,
  escolhida: number = FOLGA_PADRAO,
  deslocamento: number = 0,
): Array<{ id: string; x: number; y: number }> {
  if (fila.length === 0) return [];

  const area = AREAS[ancora];
  const disponivel = 1 - 2 * MARGEM_FILA;

  // `larguraNaFila` e nao `width`: o que se enfileira e a COMPOSICAO -- o
  // retrato mais as pecas que passam da borda dele. Ver `caixaDaComposicao`.
  const larguras = fila.reduce(
    (soma, retrato) => soma + larguraNaFila(retrato),
    0,
  );
  const vaos = fila.length - 1;

  const folga =
    vaos > 0 ? folgaAplicada(escolhida, disponivel - larguras, vaos, fila) : 0;
  const total = larguras + folga * vaos;

  /**
   * O passo entre os cantos esquerdos.
   *
   * Cabendo, é a largura de cada um mais a folga -- e aí o passo varia de item
   * para item. Não cabendo, os cantos se distribuem por igual no espaço que há,
   * o que produz a sobreposição mínima que faz o último terminar na margem.
   */
  const passoFixo =
    total > disponivel
      ? (disponivel - ultima(fila)) / Math.max(1, vaos)
      : null;

  const inicio =
    area.horizontal === "esquerda"
      ? MARGEM_FILA
      : area.horizontal === "direita"
        ? 1 - MARGEM_FILA - Math.min(total, disponivel)
        : (1 - Math.min(total, disponivel)) / 2;

  let x = inicio;

  return fila.map((retrato, indice) => {
    // O passo anda pela CAIXA, e a figura fica dentro dela: peca jogada para a
    // esquerda empurra o retrato para a direita, e e isso que impede a barra de
    // um sair por baixo do vizinho. Sem o recuo, o `x` da fila seria o canto da
    // figura e a caixa comecaria antes dela.
    const posicao = {
      id: retrato.id,
      x: x + caixaDaComposicao(retrato).recuo,
      y:
        area.vertical === "cima"
          ? MARGEM_FILA + deslocamento
          : 1 - MARGEM_FILA - retrato.height - deslocamento,
    };

    x =
      passoFixo === null
        ? x + larguraNaFila(retrato) + folga
        : inicio + passoFixo * (indice + 1);

    return posicao;
  });
}

/** A largura de fila do ultimo da fileira, zero se ela estiver vazia. */
function ultima(
  fila: ReadonlyArray<
    Pick<Portrait, "width" | "height" | "medidores" | "layout">
  >,
): number {
  const fim = fila[fila.length - 1];

  return fim ? larguraNaFila(fim) : 0;
}

/**
 * A folga que a fila usa de verdade, dada a que o mestre escolheu.
 *
 * Assimétrica de propósito, e é a única regra nova do ajuste.
 *
 * Folga POSITIVA é respiro, e respiro é o primeiro a sair quando falta espaço:
 * ela encolhe até zero antes de a fila começar a se sobrepor.
 *
 * Folga NEGATIVA é a sobreposição PEDIDA, e falta de espaço não é motivo para
 * desfazê-la. O clamp de antes -- um `Math.max(0, ...)` sobre a sobra -- zerava
 * justamente o valor negativo quando a fila está cheia, que é quando se quer
 * sobrepor.
 *
 * O piso é METADE da largura do menor retrato, e não a largura inteira: com a
 * largura inteira o passo entre dois vizinhos chega a zero e a fila empilha
 * tudo no mesmo ponto -- oito retratos de 4% da tela com -6% pedido faziam
 * exatamente isso. Metade garante que sempre sobre meia figura à mostra, que é
 * o mínimo para ainda ser uma fila e não um retrato perdido.
 *
 * É também o que garante que a fila não some: com N retratos e N-1 vãos, o pior
 * caso deixa `menor * (N + 1) / 2` de largura total, sempre positiva -- é o que
 * mantém o cálculo do início dentro da tela.
 */
function folgaAplicada(
  escolhida: number,
  sobra: number,
  vaos: number,
  fila: ReadonlyArray<Pick<Portrait, "width" | "height" | "medidores" | "layout">>,
): number {
  if (escolhida >= 0) return Math.min(escolhida, Math.max(0, sobra / vaos));

  const menor = fila.reduce(
    (menor, retrato) => Math.min(menor, larguraNaFila(retrato)),
    Infinity,
  );

  return Math.max(escolhida, -menor / 2);
}

/**
 * O vão entre duas uniões empilhadas na mesma área, em fração da câmera.
 *
 * Constante, e não a `folga` de nenhuma das duas: a folga é o respiro DENTRO de
 * uma união, e duas uniões vizinhas teriam duas opiniões sobre o mesmo vão --
 * o mesmo motivo que fazia a folga ser global quando havia uma fila só.
 *
 * Maior que a folga padrão de propósito: o que separa duas linhas tem de ler
 * como separação, e não como um espaço um pouco maior entre dois retratos da
 * mesma linha.
 */
export const FOLGA_ENTRE_LINHAS = 0.03;

/** O que a pilha precisa saber de um retrato: tamanho e se está no ar. */
type MembroDaFila = Pick<
  Portrait,
  "id" | "width" | "height" | "visible" | "medidores" | "layout"
>;

/**
 * Onde cada retrato de cada união deve estar.
 *
 * Uniões que dividem a mesma área EMPILHAM: a primeira encosta na margem, a
 * seguinte se afasta a altura da anterior mais `FOLGA_ENTRE_LINHAS`, e assim
 * por diante. É o que permite heróis embaixo e inimigos logo atrás, no mesmo
 * canto, sem que uma escolha do mestre seja recusada.
 *
 * A ordem do empilhamento é a ordem da lista de uniões, que é a ordem em que
 * elas foram criadas. Nas áreas de baixo a primeira fica mais perto do chão;
 * nas de cima, mais perto do topo -- nos dois casos, quem chegou primeiro fica
 * colado na borda, e quem chegou depois fica atrás.
 *
 * Só conta quem está NO AR. Fora do ar não ocupa vaga na linha nem altura na
 * pilha -- é o que faz tirar alguém do meio fechar o buraco, e o que faz uma
 * união inteira apagada não empurrar a união de baixo para o meio da tela.
 *
 * Retrato que não está em união nenhuma não aparece aqui: solto não tem regra.
 */
export function filasDeUnioes(
  unioes: ReadonlyArray<UniaoDeRetratos>,
  retratos: ReadonlyArray<MembroDaFila>,
): Array<{ id: string; x: number; y: number }> {
  const porId = new Map(retratos.map((retrato) => [retrato.id, retrato]));
  const saida: Array<{ id: string; x: number; y: number }> = [];

  /** Quanto cada área já tem de pilha, medido a partir da borda. */
  const ocupado = new Map<AncoraRetrato, number>();

  for (const uniao of unioes) {
    const membros = uniao.retratos
      .map((id) => porId.get(id))
      .filter((membro): membro is MembroDaFila => Boolean(membro?.visible));

    if (membros.length === 0) continue;

    const deslocamento = ocupado.get(uniao.ancora) ?? 0;

    saida.push(
      ...filaDeRetratos(membros, uniao.ancora, uniao.folga, deslocamento),
    );

    // A altura da linha é a do MAIOR membro: o chefe é mais alto que os
    // capangas, e medir pelo menor faria a união de cima passar por dentro
    // dele.
    const altura = membros.reduce(
      (maior, membro) => Math.max(maior, membro.height),
      0,
    );

    ocupado.set(uniao.ancora, deslocamento + altura + FOLGA_ENTRE_LINHAS);
  }

  return saida;
}

/**
 * A área das seis mais perto de onde os retratos já estão.
 *
 * É o que uma união nova usa ao nascer. Unir três figuras que já estavam no
 * canto de baixo à direita as enfileira ali mesmo: o gesto de unir não pode
 * atravessar a tela com o elenco, porque é justamente essa tela que a mesa está
 * olhando.
 *
 * Mede pelo CENTRO da caixa que envolve os unidos, e não pela média dos
 * centros: dois pequenos de um lado e um grande do outro não devem mudar o
 * resultado pelo número de figuras.
 *
 * Em fração da câmera, então a resposta não depende do enquadramento. Lista
 * vazia devolve o padrão -- não há onde ela esteja.
 */
export function areaMaisProxima(
  retratos: ReadonlyArray<Pick<Portrait, "x" | "y" | "width" | "height">>,
): AncoraRetrato {
  if (retratos.length === 0) return "baixo-centro";

  const xs = retratos.flatMap((retrato) => [retrato.x, retrato.x + retrato.width]);
  const ys = retratos.flatMap((retrato) => [retrato.y, retrato.y + retrato.height]);

  const x = (Math.min(...xs) + Math.max(...xs)) / 2;
  const y = (Math.min(...ys) + Math.max(...ys)) / 2;

  // Os limites são o meio do caminho entre os centros das faixas: as três
  // colunas têm centro em 1/6, 1/2 e 5/6, então a troca acontece em 1/3 e 2/3.
  // As duas linhas têm centro em 1/6 e 5/6, e a troca em 1/2.
  const horizontal = x < 1 / 3 ? "esquerda" : x < 2 / 3 ? "centro" : "direita";
  const vertical = y < 1 / 2 ? "cima" : "baixo";

  return `${vertical}-${horizontal}`;
}

/**
 * Os retângulos das seis áreas, em coordenadas de cena.
 *
 * Para acender durante o arrasto e para saber qual está sob o ponteiro. Um
 * terço da câmera em cada eixo, com a faixa do meio vertical de fora: arrastar
 * a fila para o meio da tela cobriria o mapa, que é o que a mesa está olhando.
 */
export function areasDeRetrato(
  camera: Viewport = FULL_VIEWPORT,
): Array<{ ancora: AncoraRetrato; box: ItemBox }> {
  const largura = camera.width / 3;
  const altura = camera.height / 3;

  const colunas = { esquerda: 0, centro: 1, direita: 2 } as const;

  return (Object.keys(AREAS) as AncoraRetrato[]).map((ancora) => {
    const area = AREAS[ancora];

    return {
      ancora,
      box: {
        x: camera.x + colunas[area.horizontal] * largura,
        y: camera.y + (area.vertical === "cima" ? 0 : camera.height - altura),
        width: largura,
        height: altura,
      },
    };
  });
}
