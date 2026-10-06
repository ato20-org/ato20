"use client";

import { useEffect, useMemo, useRef } from "react";

import { useDeclarativo } from "@/components/playground/declarativo";
import {
  corDaArea,
  densidadeDoEfeito,
  divisoesDoEfeito,
  fontesDaArea,
  ladoDaCasa,
  segmentosDaArea,
} from "@/lib/area-de-efeito";
import type { EfeitoPedido } from "@/lib/condicao";
import { definicaoDoEfeito, luzDosEfeitos } from "@/lib/efeitos";
import {
  useSilhuetasDosTokens,
  type SilhuetaPronta,
} from "@/hooks/use-silhuetas-dos-tokens";
import {
  alcancaOclusor,
  anguloEntre,
  caixaDaFonte,
  caixaDaMatriz,
  chaveDasFontes,
  chaveDosOclusores,
  cisalhamentoDaLuz,
  corDoEscuroDe,
  fatorDoEfeito,
  FORCA_DO_LADO_ESCURO,
  FORCA_DA_SOMBRA_DA_FIGURA,
  fontesDaCena,
  inicioDoCone,
  ladoDaLuz,
  matrizDaFigura,
  oclusoresDosItens,
  retanguloDaSilhueta,
  sombraDoToken,
  limitarEscuridao,
  paradasDaLuz,
  paradasDoCone,
  segmentosDasParedes,
  sementeDaLuz,
  tremorSoDe,
  umbrasDaLuz,
  donoDaFonte,
  type Afim,
  type CaixaDaLuz,
  type FonteDeLuz,
  type Oclusor,
} from "@/lib/geometry/luz";
import { usePortasNoGiro } from "@/hooks/use-portas-no-giro";
import { folhasNaCaixa, segmentosDasPortas } from "@/lib/geometry/porta";
import { deitarDaFigura, type Segmento } from "@/lib/geometry/sombra";
import type { Variante } from "@/lib/vault/assets";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type CanvasItem,
  type AreaDeEfeito,
  type EfeitoDaLuz,
  type Luz,
  type Parede,
  type Porta,
  type SceneGrid,
} from "@/types/scene";

/**
 * Acima de todo item e do nome sobre ele, e abaixo da névoa.
 *
 * Acima porque é o escuro que esconde: um token no breu some, e o nome dele
 * junto -- um rótulo flutuando no escuro entregaria que há alguém ali. Abaixo
 * da névoa porque ela é preta de qualquer jeito, e o que ela esconde não pode
 * ser denunciado por uma luz que vaza por cima dela.
 */
const LUZ_Z = 4_500;

/**
 * A resolução do canvas, em fração do plano.
 *
 * Metade. O escuro e a luz são degradês largos, e a metade dos pixels não se
 * vê -- a borda da sombra de parede sai um pouco mais macia, que é como a
 * sombra de uma tocha é. Um quarto dos pixels a pintar a cada redesenho, e um
 * quarto da memória da textura.
 */
const RESOLUCAO = 0.5;

/**
 * O quanto da escuridão o mestre vê. A mesa vê inteira.
 *
 * O mestre trabalha NO escuro -- arrasta o goblin que está no breu, confere o
 * que a tocha alcança --, e breu de verdade no palco dele esconderia justo o
 * que ele veio mexer. É o que a névoa já faz, preta na mesa e translúcida aqui.
 */
const ESCURIDAO_DO_MESTRE = 0.6;

/**
 * O quanto a cor da luz tinge o que ela alcança, no centro.
 *
 * Um véu, e não uma tinta: a luz de uma tocha deixa o chão laranja, não o
 * cobre de laranja. Sem escuridão nenhuma, é esse véu que se vê -- o brilho
 * da luz num mapa claro.
 */
const FORCA_DA_COR = 0.3;

/**
 * O tempo que a luz leva para chegar onde a amostra nova diz, na TV.
 *
 * O mesmo do token (`.scene-smooth-item`): a TV recebe dez amostras por
 * segundo e o token desliza entre elas. A lanterna dele pulando a cada amostra
 * enquanto ele desliza seria a luz se descolando de quem a carrega.
 */
const DURACAO_DA_CHEGADA = 150;

/**
 * De quanto em quanto tempo a luz que tem efeito é recomposta, em ms.
 *
 * Trinta quadros por segundo, e não os do monitor: a chama tremula a poucos
 * hertz e ninguém distingue 30 de 60 nela, e cada quadro é uma textura do
 * plano subindo de novo para o compositor -- na TV e no celular, a noite
 * inteira. A folga de 4 ms é o que faz um monitor de 60 Hz pintar um quadro
 * sim, outro não, em vez de pular dois de vez em quando.
 */
const INTERVALO_DA_ANIMACAO = 1000 / 30 - 4;

/**
 * A luz e a escuridão da cena.
 *
 * ## Um canvas, e não SVG
 *
 * As saídas que o palco já mediu estão todas fechadas para isto: máscara SVG
 * deu 25,9 fps, filtro por item 37,3, e um SVG do tamanho do plano 49,2 --
 * vetor re-rasterizado a cada quadro em que a câmera anda. O escuro com furos
 * de luz é justamente uma máscara do plano inteiro.
 *
 * O canvas é pintado aqui, só quando a luz muda, e depois é textura: a câmera
 * anda, o plano se move, e o compositor leva o bitmap junto sem pintar nada.
 * Durante o arrasto de um token SEM lanterna nada é repintado -- ver
 * `chaveDasFontes`.
 *
 * ## A luz que se mexe
 *
 * O fogo, o pulso e o pisca (`EfeitoDaLuz`) repintam a cada quadro, mas só a
 * parte barata. O desenho tem dois tempos: FORMAR cada luz -- o degradê, o
 * cone, as sombras das paredes e dos tokens --, cada uma no seu rascunho, e
 * COMPOR os rascunhos no canvas. O efeito muda só a força com que cada
 * rascunho entra (`globalAlpha`), então o laço da animação só compõe: o
 * escuro e dois `drawImage` por luz. Formar de novo, só quando a chave muda.
 *
 * ## Como se pinta
 *
 * O escuro primeiro, o plano inteiro. Cada luz é desenhada num rascunho do
 * tamanho do alcance dela: o degradê do alcance, menos as sombras das paredes
 * vistas daquela luz. O rascunho APAGA o escuro (`destination-out`), e depois
 * entra de novo, na cor da luz, como véu. Rascunho por luz porque a sombra de
 * uma parede não pode apagar a luz de OUTRA tocha que a alcança por trás.
 *
 * Nenhum `mix-blend-mode`: o palco nunca usou um, e blend sobre a cena pede ao
 * motor que leia o que está embaixo a cada quadro. Aqui tudo acontece dentro
 * do canvas, e o que sai é uma imagem comum.
 *
 * Nada passa da caixa do plano: o canvas tem o tamanho exato dele. Filho que
 * transborda um plano infla a camada composta do WebKitGTK. Ver `SombraLayer`.
 */
export function LuzLayer({
  items,
  luzes,
  paredes,
  portas,
  portaNaMao,
  escuridao,
  corDoEscuro,
  variant,
  smooth = false,
  naMao,
  variante,
  efeitosDoItem,
  areasDeEfeito,
  grid,
  animarSo,
}: {
  items: CanvasItem[];
  luzes?: Luz[];
  paredes?: Parede[];
  /**
   * As portas, à parte das paredes: a folha gira no gesto, e misturada a elas
   * trocaria a lista de segmentos a cada quadro -- o que refaz TODAS as luzes.
   * À parte, ela só refaz as que alcança. Ver `formarLuzes`.
   */
  portas?: Porta[];
  /** A porta que a mão do mestre gira: vai direto. Ver `usePortasNoGiro`. */
  portaNaMao?: string;
  escuridao?: number;
  /** Ausente = o breu. Ver `Scene.corDoEscuro`. */
  corDoEscuro?: string;
  variant: "mestre" | "mesa";
  smooth?: boolean;
  /**
   * O tamanho de arquivo que os tokens desta tela desenham. A silhueta sai da
   * MESMA url -- ver `useSilhuetasDosTokens`.
   */
  variante?: Variante;
  /**
   * O token que o dedo do jogador segura. Ver `SceneLayer`.
   *
   * A lanterna DELE vai direto, como o token: interpolada, ela correria 150ms
   * atrás do dedo. As outras continuam deslizando.
   */
  naMao?: string;
  /**
   * Os efeitos de condição de cada item, para a luz que eles emanam -- o
   * goblin em chamas clareia o corredor. Ausente = só as luzes de sempre.
   * Ver `luzDosEfeitos`.
   */
  efeitosDoItem?: (item: CanvasItem) => ReadonlyArray<EfeitoPedido> | undefined;
  /** As áreas de efeito, que acendem as luzes delas. Ver `fontesDaArea`. */
  areasDeEfeito?: AreaDeEfeito[];
  /** A grade, que dá o segmento das áreas. */
  grid?: SceneGrid;
  /**
   * Só a luz de efeito destes donos tremula; a dos outros fica parada na força
   * cheia. Ausente = todas tremulam. É o Mestre, que só anima o efeito do
   * selecionado: sem nenhuma luz tremulando, o laço da animação nem roda. A
   * luz cravada e a lanterna não são efeito, e seguem como estão.
   */
  animarSo?: ReadonlySet<string>;
}) {
  const { efeitos: deFora } = useDeclarativo();
  // Fora do quadro do arrasto: a área não anda quando um token anda, e os
  // segmentos só mudam quando ela ou a grade mudam.
  const dasAreas = useMemo(
    () =>
      (areasDeEfeito ?? []).flatMap((area) => {
        if (!area.efeito) return [];
        const definicao = definicaoDoEfeito(area.efeito, deFora);
        const luz = luzDosEfeitos(
          [{ efeito: area.efeito, cor: corDaArea(area, definicao) }],
          deFora,
        );
        if (!luz) return [];
        const segmentos = segmentosDaArea(
          area,
          grid,
          divisoesDoEfeito(definicao),
          densidadeDoEfeito(definicao),
        );
        return fontesDaArea(area, segmentos, luz, ladoDaCasa(grid));
      }),
    [areasDeEfeito, grid, deFora],
  );
  const todas = fontesDaCena(
    luzes,
    items,
    efeitosDoItem ? (item) => luzDosEfeitos(efeitosDoItem(item), deFora) : undefined,
    dasAreas,
  );
  const fontes = tremorSoDe(todas, animarSo);
  // Os tokens tapam luz. Entram na chave só os que alguma luz alcança: o
  // goblin arrastado do outro lado do mapa não repinta nada. Ver
  // `chaveDosOclusores`.
  const oclusores = oclusoresDosItens(items);
  const chave = `${chaveDasFontes(fontes)}#${chaveDosOclusores(fontes, oclusores)}`;
  const escuro =
    limitarEscuridao(escuridao) *
    (variant === "mestre" ? ESCURIDAO_DO_MESTRE : 1);
  const cor = corDoEscuroDe(corDoEscuro);

  // Parede não se mexe quando um token anda: o quadro do arrasto não
  // recalcula segmento nenhum.
  const segmentos = useMemo(() => segmentosDasParedes(paredes), [paredes]);
  // A folha gira até a abertura nova; só as luzes que ela alcança se formam
  // de novo a cada quadro do giro. Ver `formarLuzes`.
  const portasNoGiro = usePortasNoGiro(portas, portaNaMao);
  const folhas = useMemo(
    () => segmentosDasPortas(portasNoGiro),
    [portasNoGiro],
  );

  // As silhuetas só de quem alguma luz alcança: o resto do mapa não precisa
  // de forno nenhum para isto.
  const silhuetas = useSilhuetasDosTokens(
    oclusores
      .filter((oclusor) =>
        fontes.some((fonte) => !fonte.semTokens && alcancaOclusor(fonte, oclusor)),
      )
      .map((oclusor) => oclusor.assetId),
    variante,
  );

  if (fontes.length === 0 && escuro === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 overflow-hidden"
      style={{ width: SCENE_WIDTH, height: SCENE_HEIGHT, zIndex: LUZ_Z }}
    >
      {fontes.length === 0 ? (
        // Escuro sem luz nenhuma: uma cor chapada, e não um canvas. É o mapa
        // no breu esperando a primeira tocha, e cor chapada é o mais barato
        // que o compositor sabe desenhar.
        <div
          className="absolute inset-0"
          style={{ backgroundColor: cor, opacity: escuro }}
        />
      ) : (
        <CanvasDaLuz
          fontes={fontes}
          oclusores={oclusores}
          silhuetas={silhuetas}
          chave={chave}
          segmentos={segmentos}
          folhas={folhas}
          escuro={escuro}
          cor={cor}
          smooth={smooth}
          naMao={naMao}
        />
      )}
    </div>
  );
}

function CanvasDaLuz({
  fontes,
  oclusores,
  silhuetas,
  chave,
  segmentos,
  folhas,
  escuro,
  cor,
  smooth,
  naMao,
}: {
  fontes: FonteDeLuz[];
  oclusores: Oclusor[];
  /** Muda quando uma silhueta fica pronta, e é o que repinta com ela. */
  silhuetas: ReadonlyMap<string, SilhuetaPronta>;
  /**
   * Muda quando, e só quando, o desenho muda: as fontes e os tokens que elas
   * alcançam. Ver `chaveDasFontes` e `chaveDosOclusores`.
   */
  chave: string;
  segmentos: Segmento[];
  /** As folhas das portas. Ver `LuzLayer`. */
  folhas: Segmento[];
  escuro: number;
  /** A cor do escuro, já validada. Ver `corDoEscuroDe`. */
  cor: string;
  smooth: boolean;
  naMao?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Os rascunhos, reaproveitados entre os redesenhos. Ver `luzRecortada`. */
  const rascunhos = useRef<Rascunhos | null>(null);
  /** Onde cada luz foi desenhada por último. É de onde a próxima chegada parte. */
  const desenhadas = useRef<Map<string, FonteDeLuz>>(new Map());
  /** E cada token que tapa luz, pela mesma razão: a sombra desliza com ele. */
  const tapados = useRef<Map<string, Oclusor>>(new Map());

  useEffect(() => {
    const canvas = canvasRef.current;
    const contexto = canvas?.getContext("2d");
    if (!canvas || !contexto) return;

    rascunhos.current ??= criarRascunhos();
    const papel = rascunhos.current;
    // Quem pediu menos movimento no sistema recebe a luz parada, na força
    // inteira -- a mesma regra do deslizar dos tokens, em `globals.css`.
    const anima =
      fontes.some((fonte) => fonte.efeito !== undefined) && !menosMovimento();

    let prontas: LuzPronta[] = [];
    const formar = (quais: FonteDeLuz[], corpos: Oclusor[]) => {
      prontas = formarLuzes(quais, corpos, silhuetas, segmentos, folhas, papel);
      desenhadas.current = new Map(quais.map((fonte) => [fonte.id, fonte]));
      tapados.current = new Map(corpos.map((corpo) => [corpo.id, corpo]));
    };
    const compor = (agora: number) =>
      comporLuzes(contexto, prontas, escuro, cor, anima ? agora / 1000 : null);

    // No Mestre a luz vai direto: é manipulação direta, e ela correndo atrás
    // do token seria o contrário. O mesmo vale para a do token na mão do
    // jogador -- ela chega de uma vez, e só as outras deslizam. A sombra de
    // um token desliza junto com ele, pela mesma regra.
    const partida = desenhadas.current;
    const partidaDosCorpos = tapados.current;
    const desliza = (fonte: FonteDeLuz) =>
      donoDaFonte(fonte) !== naMao && mudou(partida.get(fonte.id), fonte);
    const deslizaCorpo = (corpo: Oclusor) =>
      corpo.id !== naMao && corpoMudou(partidaDosCorpos.get(corpo.id), corpo);
    const anda =
      smooth && (fontes.some(desliza) || oclusores.some(deslizaCorpo));
    if (!anda) {
      formar(fontes, oclusores);
      compor(performance.now());
      if (!anima) return;
    }

    let quadro = 0;
    const inicio = performance.now();
    // Enquanto a luz desliza até a amostra nova, cada quadro forma de novo;
    // depois que chega, e só se alguma tem efeito, cada quadro só compõe.
    let chegou = !anda;
    let ultimo = inicio;

    const passo = (agora: number) => {
      if (!chegou) {
        const t = Math.min(1, (agora - inicio) / DURACAO_DA_CHEGADA);
        formar(
          fontes.map((fonte) =>
            donoDaFonte(fonte) === naMao ? fonte : entre(partida.get(fonte.id), fonte, t),
          ),
          oclusores.map((corpo) =>
            corpo.id === naMao
              ? corpo
              : corpoEntre(partidaDosCorpos.get(corpo.id), corpo, t),
          ),
        );
        compor(agora);
        ultimo = agora;
        chegou = t >= 1;
      } else if (agora - ultimo >= INTERVALO_DA_ANIMACAO) {
        compor(agora);
        ultimo = agora;
      }

      if (!chegou || anima) quadro = requestAnimationFrame(passo);
    };

    quadro = requestAnimationFrame(passo);

    return () => cancelAnimationFrame(quadro);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a chave É a lista: ela muda quando, e só quando, alguma fonte muda
  }, [chave, silhuetas, segmentos, folhas, escuro, cor, smooth, naMao]);

  return (
    <canvas
      ref={canvasRef}
      width={SCENE_WIDTH * RESOLUCAO}
      height={SCENE_HEIGHT * RESOLUCAO}
      className="absolute top-0 left-0"
      style={{ width: SCENE_WIDTH, height: SCENE_HEIGHT }}
    />
  );
}

/** O sistema pediu menos movimento? Ver `prefers-reduced-motion`. */
function menosMovimento(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** A luz andou desde o último desenho? Uma que acabou de acender não anda. */
function mudou(antes: FonteDeLuz | undefined, agora: FonteDeLuz): boolean {
  return (
    antes !== undefined &&
    (antes.x !== agora.x ||
      antes.y !== agora.y ||
      antes.raio !== agora.raio ||
      antes.raioIntenso !== agora.raioIntenso ||
      antes.cone?.angulo !== agora.cone?.angulo ||
      antes.cone?.abertura !== agora.cone?.abertura)
  );
}

/** O token andou desde o último desenho? */
function corpoMudou(antes: Oclusor | undefined, agora: Oclusor): boolean {
  return (
    antes !== undefined &&
    (antes.x !== agora.x || antes.y !== agora.y || antes.raio !== agora.raio)
  );
}

/** O token no meio do caminho entre dois desenhos, para a sombra dele. */
function corpoEntre(
  antes: Oclusor | undefined,
  depois: Oclusor,
  t: number,
): Oclusor {
  if (!antes) return depois;

  const x = antes.x + (depois.x - antes.x) * t;
  const y = antes.y + (depois.y - antes.y) * t;

  // A caixa anda junto com o pé, e é dela que a silhueta sai.
  return {
    ...depois,
    x,
    y,
    raio: antes.raio + (depois.raio - antes.raio) * t,
    caixa: {
      ...depois.caixa,
      x: depois.caixa.x + (x - depois.x),
      y: depois.caixa.y + (y - depois.y),
    },
  };
}

/** A luz no meio do caminho entre dois desenhos. `t` de 0 a 1. */
function entre(
  antes: FonteDeLuz | undefined,
  depois: FonteDeLuz,
  t: number,
): FonteDeLuz {
  if (!antes) return depois;

  return {
    ...depois,
    x: antes.x + (depois.x - antes.x) * t,
    y: antes.y + (depois.y - antes.y) * t,
    raio: antes.raio + (depois.raio - antes.raio) * t,
    raioIntenso:
      antes.raioIntenso + (depois.raioIntenso - antes.raioIntenso) * t,
    // O cone gira pela volta curta. O que acabou de virar cone, ou de deixar
    // de ser, chega de uma vez: não há meio caminho entre um e outro.
    ...(antes.cone && depois.cone
      ? {
          cone: {
            angulo: anguloEntre(antes.cone.angulo, depois.cone.angulo, t),
            abertura:
              antes.cone.abertura +
              (depois.cone.abertura - antes.cone.abertura) * t,
          },
        }
      : {}),
  };
}

/** Os dois rascunhos de uma luz: a forma dela, e a mesma forma na cor dela. */
type PapeisDaLuz = {
  forma: HTMLCanvasElement;
  tinta: HTMLCanvasElement;
  /** O que formou estes rascunhos da última vez. Ver `assinaturaDaLuz`. */
  assinatura?: string;
};

/**
 * Os papéis de rascunho: os de cada luz, e o vulto de um token, do tamanho só
 * dele. Ver `vultoNaLuz`.
 *
 * Um par POR LUZ, e não um par que todas reusam: é o que deixa o laço da
 * animação compor sem formar de novo. Ver `LuzLayer`, "A luz que se mexe".
 *
 * As paredes e as silhuetas com que as luzes foram formadas ficam aqui: elas
 * valem para todas, e trocar uma refaz todas.
 */
type Rascunhos = {
  porLuz: Map<string, PapeisDaLuz>;
  vulto: HTMLCanvasElement;
  segmentos?: ReadonlyArray<Segmento>;
  silhuetas?: ReadonlyMap<string, SilhuetaPronta>;
};

function criarRascunhos(): Rascunhos {
  return {
    porLuz: new Map(),
    vulto: document.createElement("canvas"),
  };
}

/** Uma luz formada, pronta para entrar no canvas. */
type LuzPronta = PapeisDaLuz & {
  caixa: CaixaDaLuz;
  efeito?: EfeitoDaLuz;
  semente: number;
};

/**
 * Forma cada luz no rascunho dela: o degradê, o cone, as sombras. É a parte
 * cara do desenho, e só roda quando a luz muda.
 *
 * SÓ a luz que mudou: a chave do canvas é a cena inteira, e um token andando
 * a mudava para as quarenta tochas do mapa. Cada luz guarda a assinatura do
 * que a formou -- ela, e os tokens que ela alcança --, e a que bate com a de
 * agora fica com os rascunhos que tem. Medido na TV, quarenta goblins em
 * chamas e um andando: 3,8 fps formando todas a cada quadro do deslize, 17
 * formando só a dele e as das tochas cujos tokens ele tapa.
 *
 * As portas entram pela mesma porta dos tokens, e não pela das paredes: a
 * folha que gira só refaz a luz em cuja caixa ela cai. Abrir a porta da cela
 * não forma de novo as tochas do outro lado do mapa.
 *
 * O rascunho de uma luz que saiu da cena -- removida ou desligada -- sai
 * junto: sem isso, cada tocha cravada e removida numa sessão deixaria dois
 * canvas para trás.
 */
function formarLuzes(
  fontes: ReadonlyArray<FonteDeLuz>,
  oclusores: ReadonlyArray<Oclusor>,
  silhuetas: ReadonlyMap<string, SilhuetaPronta>,
  segmentos: ReadonlyArray<Segmento>,
  folhas: ReadonlyArray<Segmento>,
  papel: Rascunhos,
): LuzPronta[] {
  const prontas: LuzPronta[] = [];
  const vistas = new Set<string>();
  const mesmoMundo = papel.segmentos === segmentos && papel.silhuetas === silhuetas;
  papel.segmentos = segmentos;
  papel.silhuetas = silhuetas;

  for (const fonte of fontes) {
    const caixa = caixaDaFonte(fonte);
    if (!caixa) continue;

    let papeis = papel.porLuz.get(fonte.id);
    if (!papeis) {
      papeis = {
        forma: document.createElement("canvas"),
        tinta: document.createElement("canvas"),
      };
      papel.porLuz.set(fonte.id, papeis);
    }
    vistas.add(fonte.id);

    const portas = folhasNaCaixa(caixa, folhas);
    const assinatura =
      assinaturaDaLuz(fonte, oclusores) + assinaturaDasFolhas(portas);
    if (!mesmoMundo || papeis.assinatura !== assinatura) {
      luzRecortada(
        papeis.forma,
        papel.vulto,
        fonte,
        caixa,
        portas.length > 0 ? [...segmentos, ...portas] : segmentos,
        oclusores,
        silhuetas,
      );
      naCorDaLuz(papeis.tinta, papeis.forma, fonte.cor);
      papeis.assinatura = assinatura;
    }

    prontas.push({
      ...papeis,
      caixa,
      efeito: fonte.efeito,
      semente: sementeDaLuz(fonte.id),
    });
  }

  for (const id of papel.porLuz.keys()) {
    if (!vistas.has(id)) papel.porLuz.delete(id);
  }

  return prontas;
}

/** As folhas de porta que caem numa luz, na forma de um pedaço da assinatura dela. */
function assinaturaDasFolhas(folhas: ReadonlyArray<Segmento>): string {
  let assinatura = "";
  for (const folha of folhas) {
    assinatura += `#${folha.x1},${folha.y1},${folha.x2},${folha.y2}`;
  }
  return assinatura;
}

/**
 * Tudo o que entra na forma de UMA luz: ela inteira, menos o efeito -- que só
 * muda a força com que ela é composta --, e cada token que ela alcança, com a
 * caixa de onde a silhueta sai. O que `luzRecortada` não lê não entra, e o que
 * ela lê de todas as luzes (paredes, silhuetas) fica em `Rascunhos`.
 *
 * Os tokens pela mesma conta que as sombras usam (`alcancaOclusor`): um token
 * fora do alcance não tapa nada, e andar com ele não refaz esta luz.
 */
function assinaturaDaLuz(fonte: FonteDeLuz, oclusores: ReadonlyArray<Oclusor>): string {
  let assinatura = JSON.stringify(fonte, (campo, valor) => (campo === "efeito" ? undefined : valor));
  if (fonte.semTokens) return assinatura;

  const dono = donoDaFonte(fonte);
  for (const oclusor of oclusores) {
    if (oclusor.id === dono || !alcancaOclusor(fonte, oclusor)) continue;
    assinatura += `|${oclusor.id},${oclusor.x},${oclusor.y},${oclusor.raio},${oclusor.assetId},${JSON.stringify(oclusor.caixa)}`;
  }
  return assinatura;
}

/**
 * Pinta o canvas inteiro: o escuro, e cada luz abrindo o seu buraco nele.
 *
 * `segundos` é o relógio da animação, ou `null` para a luz parada -- sem
 * efeito nenhum, ou com o sistema pedindo menos movimento. O efeito entra só
 * aqui, na força com que cada luz entra: é por isso que animar não forma
 * nada de novo.
 */
function comporLuzes(
  contexto: CanvasRenderingContext2D,
  prontas: ReadonlyArray<LuzPronta>,
  escuro: number,
  cor: string,
  segundos: number | null,
) {
  contexto.setTransform(1, 0, 0, 1, 0, 0);
  contexto.globalCompositeOperation = "source-over";
  contexto.globalAlpha = 1;
  contexto.clearRect(0, 0, contexto.canvas.width, contexto.canvas.height);
  // Daqui para baixo tudo em unidade de cena.
  contexto.setTransform(RESOLUCAO, 0, 0, RESOLUCAO, 0, 0);

  if (escuro > 0) {
    // A cor pelo `fillStyle` e a força pelo alfa global: a cor chega em
    // `#rrggbb`, e montar um `rgba` dela a cada quadro da animação seria
    // converter a mesma string trinta vezes por segundo.
    contexto.globalAlpha = escuro;
    contexto.fillStyle = cor;
    contexto.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
    contexto.globalAlpha = 1;
  }

  for (const luz of prontas) {
    const fator =
      segundos === null ? 1 : fatorDoEfeito(luz.efeito, segundos, luz.semente);
    // O pisca no fundo do compasso: apagada, e não há o que pintar.
    if (fator <= 0) continue;

    const { caixa } = luz;
    // A força multiplica o buraco e o véu juntos, como a intensidade: o
    // `destination-out` com alfa pela metade tira metade do escuro.
    contexto.globalAlpha = fator;

    if (escuro > 0) {
      contexto.globalCompositeOperation = "destination-out";
      contexto.drawImage(
        luz.forma,
        caixa.x,
        caixa.y,
        caixa.width,
        caixa.height,
      );
    }

    contexto.globalCompositeOperation = "source-over";
    contexto.drawImage(luz.tinta, caixa.x, caixa.y, caixa.width, caixa.height);
  }

  contexto.globalAlpha = 1;
  contexto.globalCompositeOperation = "source-over";
}

/**
 * A forma de UMA luz: o degradê do alcance, menos o que as paredes e os
 * tokens tapam.
 *
 * Opaca no meio e sumindo na borda, e não um degradê linear: a tocha ilumina a
 * sala por igual e esmaece só perto de onde acaba. Com a queda começando no
 * centro, o personagem com a lanterna já estaria na penumbra a um passo dela.
 */
function luzRecortada(
  rascunho: HTMLCanvasElement,
  rascunhoDoVulto: HTMLCanvasElement,
  fonte: FonteDeLuz,
  caixa: CaixaDaLuz,
  segmentos: ReadonlyArray<Segmento>,
  oclusores: ReadonlyArray<Oclusor>,
  silhuetas: ReadonlyMap<string, SilhuetaPronta>,
) {
  const contexto = prepararRascunho(rascunho, caixa);

  if (fonte.forma && fonte.forma.length >= 3) {
    luzDaForma(contexto, fonte, fonte.forma);
  } else {
    const degrade = contexto.createRadialGradient(
      fonte.x,
      fonte.y,
      0,
      fonte.x,
      fonte.y,
      fonte.raio,
    );
    // O raio forte e a área, e a intensidade multiplicando tudo: a brasa fraca
    // é fraca de ponta a ponta, e o véu da cor, que sai desta forma, enfraquece
    // junto. Ver `paradasDaLuz`.
    for (const [onde, forca] of paradasDaLuz(fonte)) {
      degrade.addColorStop(onde, `rgba(255,255,255,${forca})`);
    }

    contexto.fillStyle = degrade;
    contexto.fillRect(caixa.x, caixa.y, caixa.width, caixa.height);
  }

  // O cone: um degradê que dá a volta no centro, inteiro dentro do facho e
  // zero fora, multiplicado pela forma. Depois as paredes e os tokens tapam
  // o que sobrou, como no círculo -- a ordem não importa, as três contas
  // multiplicam. Ver `paradasDoCone`.
  if (fonte.cone) {
    const mascara = contexto.createConicGradient(
      inicioDoCone(fonte.cone),
      fonte.x,
      fonte.y,
    );
    for (const [onde, forca] of paradasDoCone(fonte.cone.abertura)) {
      mascara.addColorStop(onde, `rgba(0,0,0,${forca})`);
    }
    contexto.globalCompositeOperation = "destination-in";
    contexto.fillStyle = mascara;
    contexto.fillRect(caixa.x, caixa.y, caixa.width, caixa.height);
    contexto.globalCompositeOperation = "source-over";
  }

  // A luz com forma alcança do contorno, e não do meio: as paredes que ela
  // pega são as até o canto mais longe da caixa. Ver `alcanceDaForma`.
  const umbras = umbrasDaLuz(
    segmentos,
    fonte.forma ? { ...fonte, raio: alcanceDaForma(fonte, fonte.forma) } : fonte,
  );
  if (umbras.length > 0) {
    // Um caminho só, com todas as sombras: todas no mesmo sentido de giro,
    // então o cruzamento de duas não abre buraco. Ver `umbraDoSegmento`.
    contexto.globalCompositeOperation = "destination-out";
    contexto.beginPath();
    for (const umbra of umbras) {
      const [primeiro, ...resto] = umbra;
      if (!primeiro) continue;
      contexto.moveTo(primeiro.x, primeiro.y);
      for (const ponto of resto) contexto.lineTo(ponto.x, ponto.y);
      contexto.closePath();
    }
    contexto.fillStyle = "#000";
    contexto.fill();
    contexto.globalCompositeOperation = "source-over";
  }

  // As sombras dos tokens. A SILHUETA quando o forno já a entregou -- a mesma
  // figura que o sol deita, agora deitada para longe desta luz -- e, enquanto
  // não entregou, a sombra curta do pé. O token que CARREGA esta luz não tapa
  // a si mesmo: as duas contas devolvem `null` com a luz dentro do pé.
  contexto.globalCompositeOperation = "destination-out";
  for (const oclusor of fonte.semTokens ? [] : oclusores) {
    if (oclusor.id === donoDaFonte(fonte)) continue;

    const pronta = silhuetas.get(oclusor.assetId);
    if (pronta) {
      const cisalhamento = cisalhamentoDaLuz(oclusor, fonte);
      if (cisalhamento) {
        vultoNaLuz(contexto, rascunhoDoVulto, oclusor, pronta, cisalhamento);
      }
      ladoNaLuz(contexto, rascunhoDoVulto, oclusor, pronta, fonte);
      continue;
    }

    // A do pé: cada uma com o próprio degradê, que a faz sumir na ponta em
    // vez de terminar num corte reto. Nada no centro do pé e o máximo nas
    // costas dele. Ver `sombraDoToken`.
    const sombra = sombraDoToken(oclusor, fonte);
    if (!sombra) continue;

    const degradeDaSombra = contexto.createLinearGradient(
      sombra.de.x,
      sombra.de.y,
      sombra.ate.x,
      sombra.ate.y,
    );
    const forca = FORCA_DA_SOMBRA_DA_FIGURA;
    // Zero no centro do pé, e não já escuro: o quadrilátero começa numa
    // corda que atravessa o personagem, e força ali desenharia um risco reto
    // cortando a figura ao meio. Subindo do zero, a metade de trás escurece
    // aos poucos, que é como a luz de lado cai num corpo redondo.
    degradeDaSombra.addColorStop(0, "rgba(0,0,0,0)");
    degradeDaSombra.addColorStop(sombra.costas, `rgba(0,0,0,${forca})`);
    degradeDaSombra.addColorStop(1, "rgba(0,0,0,0)");

    const [primeiro, ...resto] = sombra.pontos;
    if (!primeiro) continue;
    contexto.beginPath();
    contexto.moveTo(primeiro.x, primeiro.y);
    for (const ponto of resto) contexto.lineTo(ponto.x, ponto.y);
    contexto.closePath();
    contexto.fillStyle = degradeDaSombra;
    contexto.fill();
  }
  contexto.globalCompositeOperation = "source-over";
}

/**
 * A silhueta de um token deitada para longe desta luz, tirando luz da forma.
 *
 * No rascunho do tamanho do VULTO, e não da luz: a figura deitada, preta, e
 * dela se recorta a figura EM PÉ. É o que o sol não precisa fazer -- a sombra
 * dele é desenhada embaixo do token --, e aqui ela sai num canvas POR CIMA
 * dele: sem o recorte, o vulto que nasce nos pés cobriria as pernas do próprio
 * personagem. Um token parado na sombra de OUTRO continua escurecendo, porque
 * o recorte é só da figura que projeta.
 *
 * A força entra no fim, no `globalAlpha`: o vulto tira quase toda a luz, e não
 * toda, pela razão de `FORCA_DA_SOMBRA_DA_FIGURA`.
 */
function vultoNaLuz(
  forma: CanvasRenderingContext2D,
  rascunho: HTMLCanvasElement,
  oclusor: Oclusor,
  pronta: SilhuetaPronta,
  cisalhamento: { kx: number; ky: number },
) {
  const { caixa } = oclusor;
  // Em pé ou vista de cima, como debaixo do sol: a mesma conta, com a direção
  // saindo desta luz. Ver `deitarDaFigura`.
  const deitada = matrizDaFigura(
    caixa,
    deitarDaFigura(
      caixa,
      pronta.silhueta.recorte,
      cisalhamento.kx,
      cisalhamento.ky,
    ),
  );
  const emPe = matrizDaFigura(caixa, null);
  const retangulo = retanguloDaSilhueta(caixa, pronta.silhueta);
  const area = caixaDaMatriz(deitada, retangulo);

  const { contexto, largura, altura } = prepararRascunhoDoVulto(rascunho, area);
  const pintar = (matriz: Afim) => {
    contexto.save();
    contexto.transform(...matriz);
    contexto.drawImage(
      pronta.imagem,
      retangulo.x,
      retangulo.y,
      retangulo.width,
      retangulo.height,
    );
    contexto.restore();
  };

  pintar(deitada);
  contexto.globalCompositeOperation = "destination-out";
  pintar(emPe);
  contexto.globalCompositeOperation = "source-over";

  forma.globalAlpha = FORCA_DA_SOMBRA_DA_FIGURA;
  forma.drawImage(
    rascunho,
    0,
    0,
    largura,
    altura,
    area.x,
    area.y,
    area.width,
    area.height,
  );
  forma.globalAlpha = 1;
}

/**
 * O VOLUME do token nesta luz: o lado virado para ela fica aceso, e o oposto
 * perde parte dela. Ver `ladoDaLuz` e `FORCA_DO_LADO_ESCURO`.
 *
 * A figura EM PÉ, preta, no rascunho do tamanho dela, e por cima um degradê
 * que só guarda o que cai dentro da figura (`source-in`): transparente do
 * lado da luz, até a força inteira do outro. Tirado da forma
 * (`destination-out`, que é o modo em que ela está), ele apaga menos escuro
 * no lado de trás, e o véu da cor da luz vem mais fraco junto.
 *
 * Sem silhueta pronta, nada: o degradê sem a figura escureceria o chão em
 * volta do token, e é justamente o recorte que dá a ele um lado.
 */
function ladoNaLuz(
  forma: CanvasRenderingContext2D,
  rascunho: HTMLCanvasElement,
  oclusor: Oclusor,
  pronta: SilhuetaPronta,
  fonte: FonteDeLuz,
) {
  const lado = ladoDaLuz(oclusor, fonte);
  if (!lado) return;

  const { caixa } = oclusor;
  const emPe = matrizDaFigura(caixa, null);
  const retangulo = retanguloDaSilhueta(caixa, pronta.silhueta);
  const area = caixaDaMatriz(emPe, retangulo);

  const { contexto, largura, altura } = prepararRascunhoDoVulto(rascunho, area);
  contexto.save();
  contexto.transform(...emPe);
  contexto.drawImage(
    pronta.imagem,
    retangulo.x,
    retangulo.y,
    retangulo.width,
    retangulo.height,
  );
  contexto.restore();

  const degrade = contexto.createLinearGradient(
    lado.de.x,
    lado.de.y,
    lado.ate.x,
    lado.ate.y,
  );
  // A metade virada para a luz fica inteira até pouco antes do meio, e a
  // passagem para o lado de trás é suave: um corte no meio da figura leria
  // como costura, e não como a luz virando a esquina de um corpo.
  degrade.addColorStop(0, "rgba(0,0,0,0)");
  degrade.addColorStop(0.35, "rgba(0,0,0,0)");
  degrade.addColorStop(0.7, `rgba(0,0,0,${FORCA_DO_LADO_ESCURO * 0.6})`);
  degrade.addColorStop(1, `rgba(0,0,0,${FORCA_DO_LADO_ESCURO})`);

  contexto.globalCompositeOperation = "source-in";
  contexto.fillStyle = degrade;
  contexto.fillRect(area.x, area.y, area.width, area.height);
  contexto.globalCompositeOperation = "source-over";

  forma.drawImage(
    rascunho,
    0,
    0,
    largura,
    altura,
    area.x,
    area.y,
    area.width,
    area.height,
  );
}

/** A forma da luz, pintada na cor dela com a força do véu. */
function naCorDaLuz(
  rascunho: HTMLCanvasElement,
  forma: HTMLCanvasElement,
  cor: string,
) {
  rascunho.width = forma.width;
  rascunho.height = forma.height;

  const contexto = rascunho.getContext("2d")!;
  contexto.globalAlpha = FORCA_DA_COR;
  contexto.fillStyle = cor;
  contexto.fillRect(0, 0, rascunho.width, rascunho.height);
  contexto.globalAlpha = 1;
  contexto.globalCompositeOperation = "destination-in";
  contexto.drawImage(forma, 0, 0);
  contexto.globalCompositeOperation = "source-over";
}

/**
 * Deixa o rascunho do tamanho da caixa, limpo, e com a origem na cena.
 *
 * Trocar `width` já limpa o canvas e zera o estado do contexto, que é o que se
 * quer entre uma luz e a próxima: nenhum degradê nem modo de composição da
 * anterior sobrevive.
 */
/**
 * O rascunho do VULTO pronto para uma figura: limpo no pedaço que ela ocupa, e
 * com a origem na cena. Devolve o tamanho usado, em pixels, para quem copia
 * copiar só esse pedaço.
 *
 * Reaproveitado, e não redimensionado a cada figura como o da luz: trocar
 * `width` aloca outra textura, e este rascunho é pedido duas vezes por token
 * por luz -- a sombra e o volume --, a cada quadro do arrasto de uma lanterna.
 * Medido na webview com o volume ligado: alocando a cada figura, o arrasto e a
 * TV perdiam 2,8% e 3,8% dos quadros; reaproveitando, 0% e 0,9%, que é onde
 * estavam sem o volume. Ele só cresce: a figura seguinte, menor, usa o canto
 * dele.
 */
function prepararRascunhoDoVulto(
  rascunho: HTMLCanvasElement,
  caixa: CaixaDaLuz,
): { contexto: CanvasRenderingContext2D; largura: number; altura: number } {
  const largura = Math.max(1, Math.ceil(caixa.width * RESOLUCAO));
  const altura = Math.max(1, Math.ceil(caixa.height * RESOLUCAO));

  if (rascunho.width < largura || rascunho.height < altura) {
    rascunho.width = Math.max(rascunho.width, largura);
    rascunho.height = Math.max(rascunho.height, altura);
  }

  const contexto = rascunho.getContext("2d")!;
  // O que trocar `width` zerava sozinho, agora à mão: o modo e o alfa da
  // figura anterior não podem vazar para esta.
  contexto.setTransform(1, 0, 0, 1, 0, 0);
  contexto.globalCompositeOperation = "source-over";
  contexto.globalAlpha = 1;
  contexto.clearRect(0, 0, largura, altura);
  contexto.setTransform(
    RESOLUCAO,
    0,
    0,
    RESOLUCAO,
    -caixa.x * RESOLUCAO,
    -caixa.y * RESOLUCAO,
  );

  return { contexto, largura, altura };
}

/**
 * A luz com a FORMA de uma área: o contorno cheio, e a queda para fora em
 * `raio` -- o chão em chamas clareia em retângulo, em círculo, em laço, e não
 * em manchas redondas.
 *
 * A queda é a SOMBRA desfocada do contorno, pintada uma vez quando a luz se
 * forma (e não a cada quadro: o laço da animação só compõe os rascunhos). O
 * contorno é desenhado longe, fora do rascunho, e só a sombra dele cai no
 * lugar. O `shadowBlur` e o deslocamento são em pixels do canvas, que a
 * transformação não escala: daí o `RESOLUCAO`.
 */
function luzDaForma(
  contexto: CanvasRenderingContext2D,
  fonte: FonteDeLuz,
  forma: ReadonlyArray<{ x: number; y: number }>,
) {
  const contorno = (dx: number) => {
    contexto.beginPath();
    forma.forEach((ponto, i) =>
      i === 0 ? contexto.moveTo(ponto.x + dx, ponto.y) : contexto.lineTo(ponto.x + dx, ponto.y),
    );
    contexto.closePath();
  };
  const longe = SCENE_WIDTH * 4;

  // A sombra DUAS vezes, e não o contorno cheio por cima: cheio, ele fazia um
  // degrau na borda -- inteiro dentro, metade logo fora -- e a área virava um
  // vidro aceso. Duas sombras chegam à força cheia no miolo e caem sem degrau.
  contexto.save();
  contexto.shadowColor = `rgba(255,255,255,${fonte.intensidade})`;
  contexto.shadowBlur = fonte.raio * RESOLUCAO;
  contexto.shadowOffsetX = longe * RESOLUCAO;
  contexto.fillStyle = "#fff";
  for (let vez = 0; vez < 2; vez++) {
    contorno(-longe);
    contexto.fill();
  }
  contexto.restore();
}

/** Até onde a luz com forma alcança, a partir do meio: o contorno mais longe, mais o raio. */
function alcanceDaForma(fonte: FonteDeLuz, forma: ReadonlyArray<{ x: number; y: number }>): number {
  return (
    Math.max(...forma.map((ponto) => Math.hypot(ponto.x - fonte.x, ponto.y - fonte.y))) + fonte.raio
  );
}

function prepararRascunho(
  rascunho: HTMLCanvasElement,
  caixa: CaixaDaLuz,
): CanvasRenderingContext2D {
  rascunho.width = Math.max(1, Math.ceil(caixa.width * RESOLUCAO));
  rascunho.height = Math.max(1, Math.ceil(caixa.height * RESOLUCAO));

  const contexto = rascunho.getContext("2d")!;
  contexto.setTransform(
    RESOLUCAO,
    0,
    0,
    RESOLUCAO,
    -caixa.x * RESOLUCAO,
    -caixa.y * RESOLUCAO,
  );

  return contexto;
}
