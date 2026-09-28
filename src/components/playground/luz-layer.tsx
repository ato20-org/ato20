"use client";

import { useEffect, useMemo, useRef } from "react";

import {
  useSilhuetasDosTokens,
  type SilhuetaPronta,
} from "@/hooks/use-silhuetas-dos-tokens";
import {
  alcancaOclusor,
  caixaDaFonte,
  caixaDaMatriz,
  chaveDasFontes,
  chaveDosOclusores,
  cisalhamentoDaLuz,
  FORCA_DA_SOMBRA_DA_FIGURA,
  fontesDaCena,
  matrizDaFigura,
  oclusoresDosItens,
  retanguloDaSilhueta,
  sombraDoToken,
  limitarEscuridao,
  paradasDaLuz,
  segmentosDasParedes,
  umbrasDaLuz,
  type Afim,
  type CaixaDaLuz,
  type FonteDeLuz,
  type Oclusor,
} from "@/lib/geometry/luz";
import { peDaFigura, type Segmento } from "@/lib/geometry/sombra";
import type { Variante } from "@/lib/vault/assets";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type CanvasItem,
  type Luz,
  type Parede,
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
  escuridao,
  variant,
  smooth = false,
  naMao,
  variante,
}: {
  items: CanvasItem[];
  luzes?: Luz[];
  paredes?: Parede[];
  escuridao?: number;
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
}) {
  const fontes = fontesDaCena(luzes, items);
  // Os tokens tapam luz. Entram na chave só os que alguma luz alcança: o
  // goblin arrastado do outro lado do mapa não repinta nada. Ver
  // `chaveDosOclusores`.
  const oclusores = oclusoresDosItens(items);
  const chave = `${chaveDasFontes(fontes)}#${chaveDosOclusores(fontes, oclusores)}`;
  const escuro =
    limitarEscuridao(escuridao) *
    (variant === "mestre" ? ESCURIDAO_DO_MESTRE : 1);

  // Parede não se mexe quando um token anda: o quadro do arrasto não
  // recalcula segmento nenhum.
  const segmentos = useMemo(() => segmentosDasParedes(paredes), [paredes]);

  // As silhuetas só de quem alguma luz alcança: o resto do mapa não precisa
  // de forno nenhum para isto.
  const silhuetas = useSilhuetasDosTokens(
    oclusores
      .filter((oclusor) =>
        fontes.some((fonte) => alcancaOclusor(fonte, oclusor)),
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
          className="absolute inset-0 bg-black"
          style={{ opacity: escuro }}
        />
      ) : (
        <CanvasDaLuz
          fontes={fontes}
          oclusores={oclusores}
          silhuetas={silhuetas}
          chave={chave}
          segmentos={segmentos}
          escuro={escuro}
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
  escuro,
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
  escuro: number;
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

    const pintar = (quais: FonteDeLuz[], corpos: Oclusor[]) => {
      desenhar(contexto, quais, corpos, silhuetas, segmentos, escuro, papel);
      desenhadas.current = new Map(quais.map((fonte) => [fonte.id, fonte]));
      tapados.current = new Map(corpos.map((corpo) => [corpo.id, corpo]));
    };

    // No Mestre a luz vai direto: é manipulação direta, e ela correndo atrás
    // do token seria o contrário. O mesmo vale para a do token na mão do
    // jogador -- ela chega de uma vez, e só as outras deslizam. A sombra de
    // um token desliza junto com ele, pela mesma regra.
    const partida = desenhadas.current;
    const partidaDosCorpos = tapados.current;
    const desliza = (fonte: FonteDeLuz) =>
      fonte.id !== naMao && mudou(partida.get(fonte.id), fonte);
    const deslizaCorpo = (corpo: Oclusor) =>
      corpo.id !== naMao && corpoMudou(partidaDosCorpos.get(corpo.id), corpo);
    const anda =
      smooth && (fontes.some(desliza) || oclusores.some(deslizaCorpo));
    if (!anda) {
      pintar(fontes, oclusores);
      return;
    }

    let quadro = 0;
    const inicio = performance.now();

    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / DURACAO_DA_CHEGADA);
      pintar(
        fontes.map((fonte) =>
          fonte.id === naMao ? fonte : entre(partida.get(fonte.id), fonte, t),
        ),
        oclusores.map((corpo) =>
          corpo.id === naMao
            ? corpo
            : corpoEntre(partidaDosCorpos.get(corpo.id), corpo, t),
        ),
      );
      if (t < 1) quadro = requestAnimationFrame(passo);
    };

    quadro = requestAnimationFrame(passo);

    return () => cancelAnimationFrame(quadro);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a chave É a lista: ela muda quando, e só quando, alguma fonte muda
  }, [chave, silhuetas, segmentos, escuro, smooth, naMao]);

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

/** A luz andou desde o último desenho? Uma que acabou de acender não anda. */
function mudou(antes: FonteDeLuz | undefined, agora: FonteDeLuz): boolean {
  return (
    antes !== undefined &&
    (antes.x !== agora.x ||
      antes.y !== agora.y ||
      antes.raio !== agora.raio ||
      antes.raioIntenso !== agora.raioIntenso)
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
  };
}

/**
 * Os papéis de rascunho: a forma da luz, a mesma forma na cor dela, e o vulto
 * de um token, do tamanho só dele. Ver `vultoNaLuz`.
 */
type Rascunhos = {
  forma: HTMLCanvasElement;
  cor: HTMLCanvasElement;
  vulto: HTMLCanvasElement;
};

function criarRascunhos(): Rascunhos {
  return {
    forma: document.createElement("canvas"),
    cor: document.createElement("canvas"),
    vulto: document.createElement("canvas"),
  };
}

/** Pinta o canvas inteiro: o escuro, e cada luz abrindo o seu buraco nele. */
function desenhar(
  contexto: CanvasRenderingContext2D,
  fontes: ReadonlyArray<FonteDeLuz>,
  oclusores: ReadonlyArray<Oclusor>,
  silhuetas: ReadonlyMap<string, SilhuetaPronta>,
  segmentos: ReadonlyArray<Segmento>,
  escuro: number,
  papel: Rascunhos,
) {
  contexto.setTransform(1, 0, 0, 1, 0, 0);
  contexto.globalCompositeOperation = "source-over";
  contexto.clearRect(0, 0, contexto.canvas.width, contexto.canvas.height);
  // Daqui para baixo tudo em unidade de cena.
  contexto.setTransform(RESOLUCAO, 0, 0, RESOLUCAO, 0, 0);

  if (escuro > 0) {
    contexto.fillStyle = `rgba(0,0,0,${escuro})`;
    contexto.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
  }

  for (const fonte of fontes) {
    const caixa = caixaDaFonte(fonte);
    if (!caixa) continue;

    const forma = luzRecortada(
      papel,
      fonte,
      caixa,
      segmentos,
      oclusores,
      silhuetas,
    );

    if (escuro > 0) {
      contexto.globalCompositeOperation = "destination-out";
      contexto.drawImage(forma, caixa.x, caixa.y, caixa.width, caixa.height);
    }

    const tinta = naCorDaLuz(papel.cor, forma, fonte.cor);
    contexto.globalCompositeOperation = "source-over";
    contexto.drawImage(tinta, caixa.x, caixa.y, caixa.width, caixa.height);
  }

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
  papel: Rascunhos,
  fonte: FonteDeLuz,
  caixa: CaixaDaLuz,
  segmentos: ReadonlyArray<Segmento>,
  oclusores: ReadonlyArray<Oclusor>,
  silhuetas: ReadonlyMap<string, SilhuetaPronta>,
): HTMLCanvasElement {
  const rascunho = papel.forma;
  const contexto = prepararRascunho(rascunho, caixa);

  const degrade = contexto.createRadialGradient(
    fonte.x,
    fonte.y,
    0,
    fonte.x,
    fonte.y,
    fonte.raio,
  );
  // O raio forte e a área, e a intensidade multiplicando tudo: a brasa fraca é
  // fraca de ponta a ponta, e o véu da cor, que sai desta forma, enfraquece
  // junto. Ver `paradasDaLuz`.
  for (const [onde, forca] of paradasDaLuz(fonte)) {
    degrade.addColorStop(onde, `rgba(255,255,255,${forca})`);
  }

  contexto.fillStyle = degrade;
  contexto.fillRect(caixa.x, caixa.y, caixa.width, caixa.height);

  const umbras = umbrasDaLuz(segmentos, fonte);
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
  for (const oclusor of oclusores) {
    if (oclusor.id === fonte.id) continue;

    const pronta = silhuetas.get(oclusor.assetId);
    if (pronta) {
      const cisalhamento = cisalhamentoDaLuz(oclusor, fonte);
      if (cisalhamento) {
        vultoNaLuz(contexto, papel.vulto, oclusor, pronta, cisalhamento);
      }
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

  return rascunho;
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
  const pe = peDaFigura(
    pronta.silhueta.recorte,
    caixa.width,
    caixa.height,
    caixa.rotation,
  );
  const deitada = matrizDaFigura(caixa, { ...cisalhamento, pe });
  const emPe = matrizDaFigura(caixa, null);
  const retangulo = retanguloDaSilhueta(caixa, pronta.silhueta);
  const area = caixaDaMatriz(deitada, retangulo);

  const contexto = prepararRascunho(rascunho, area);
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
  forma.drawImage(rascunho, area.x, area.y, area.width, area.height);
  forma.globalAlpha = 1;
}

/** A forma da luz, pintada na cor dela com a força do véu. */
function naCorDaLuz(
  rascunho: HTMLCanvasElement,
  forma: HTMLCanvasElement,
  cor: string,
): HTMLCanvasElement {
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

  return rascunho;
}

/**
 * Deixa o rascunho do tamanho da caixa, limpo, e com a origem na cena.
 *
 * Trocar `width` já limpa o canvas e zera o estado do contexto, que é o que se
 * quer entre uma luz e a próxima: nenhum degradê nem modo de composição da
 * anterior sobrevive.
 */
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
