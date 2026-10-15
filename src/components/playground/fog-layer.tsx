"use client";

import {
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { pintarAlcance } from "@/components/playground/alcance-da-luz";
import { useSceneScale } from "@/components/playground/scene-stage";
import { usePortasNoGiro } from "@/hooks/use-portas-no-giro";
import { paraCaixa, pontosNaCaixa } from "@/lib/geometry/area-escondida";
import {
  caixaDaFonte,
  chaveDasFontes,
  donoDaFonte,
  luzEntre,
  luzMudou,
  segmentosDasParedes,
  type CaixaDaLuz,
  type FonteDeLuz,
} from "@/lib/geometry/luz";
import {
  lanternasDaArea,
  lanternasDosTokens,
} from "@/lib/geometry/nevoa-dinamica";
import { folhasNaCaixa, segmentosDasPortas } from "@/lib/geometry/porta";
import type { Segmento } from "@/lib/geometry/sombra";
import type { Vec } from "@/lib/geometry/transform";
import {
  useBorrachaDaNevoaStore,
  type TracoDaBorracha,
} from "@/lib/store/use-borracha-da-nevoa-store";
import { cn } from "@/lib/utils";
import type { CanvasItem, FogRegion, Parede, Porta } from "@/types/scene";

/** Acima de todo item: a área escondida existe para cobrir o que está embaixo. */
const FOG_Z = 5_000;

/**
 * Quanto a lanterna leva para chegar à amostra nova na mesa: a mesma chegada
 * da luz (ver `LuzLayer`). Com outra, o buraco na névoa correria na frente da
 * luz que o abre, ou atrás dela.
 */
const DURACAO_DA_CHEGADA = 150;

/**
 * A resolução do canvas da área, em fração da caixa.
 *
 * Inteira na área parada: ela é pintada uma vez e vira textura, e a borda dela
 * tem de sair tão nítida quanto a da área sem furo, que é um `div`. Metade na
 * dinâmica, como a luz: ela repinta a cada passo de uma lanterna, e a borda do
 * buraco já é um degradê -- a metade dos pixels não se vê.
 */
const RESOLUCAO_PARADA = 1;
const RESOLUCAO_DINAMICA = 0.5;

const NENHUMA_LANTERNA: FonteDeLuz[] = [];
const NENHUM_SEGMENTO: Segmento[] = [];

type FogLayerProps = {
  fog: FogRegion[];
  /**
   * `mestre` deixa o mestre ver através da área; `mesa` é preto sólido.
   * A máscara é visual: o Jogador recebe a imagem inteira e o bloco cobre por
   * cima. Serve para a mesa, não contra um jogador que abra o devtools.
   */
  variant: "mestre" | "mesa";
  /** Interpola o desaparecer da área e o ajuste de caixa. */
  smooth?: boolean;
  onFogPointerDown?: (event: ReactPointerEvent, region: FogRegion) => void;
  /**
   * Os tokens, pelas lanternas que abrem a névoa dinâmica. Os mesmos que a
   * `LuzLayer` recebe: o buraco é aberto pela mesma luz que se vê.
   */
  items?: CanvasItem[];
  /** Onde a revelação para, como a luz. Ver `Scene.paredes`. */
  paredes?: Parede[];
  /** E as portas, que param quando fechadas. Ver `Scene.portas`. */
  portas?: Porta[];
  /** A porta que a mão do mestre gira. Ver `usePortasNoGiro`. */
  portaNaMao?: string;
  /** O token que o dedo do jogador segura: a lanterna dele vai direto. */
  naMao?: string;
  /**
   * A prévia da lista de cenas: toda área é o bloco de sempre, sem furo nem
   * lanterna. Trinta cenas num quadrado de 56x32, cada uma com um canvas do
   * tamanho da área, seriam textura que ninguém olha -- a área do plano
   * inteiro são 8 MB.
   */
  simples?: boolean;
};

/**
 * O recorte de um polígono, desenhado DENTRO da caixa da área.
 *
 * SVG e não `clip-path`: o recorte corta tudo que está no elemento, inclusive a
 * borda, e o mestre ficaria com um bloco escuro sem contorno -- justamente o
 * que ele usa para saber onde a área começa quando ela já está revelada. Aqui
 * o preenchimento e o traço são a MESMA figura.
 *
 * O `viewBox` é a caixa, então o desenho acompanha qualquer escala dela sem
 * recontar ponto, e nada aqui passa da caixa: um filho que transborda o plano
 * é o que já pintou o palco deslocado e preto no zoom três vezes.
 */
function PoligonoDaArea({
  region,
  preenchimento,
  contorno,
  espessura,
}: {
  region: FogRegion;
  preenchimento: string;
  contorno?: string;
  espessura: number;
}) {
  const pontos = pontosNaCaixa(region, region.pontos ?? [])
    .map((ponto) => `${ponto.x},${ponto.y}`)
    .join(" ");

  return (
    <svg
      className="pointer-events-none absolute top-0 left-0"
      width={region.width}
      height={region.height}
      viewBox={`0 0 ${region.width} ${region.height}`}
    >
      <polygon
        points={pontos}
        // O clique é do POLÍGONO, não da caixa: o envelope é retangular, e
        // deixá-lo pegar o gesto faria os cantos vazios de uma área recortada
        // roubarem o clique do token que está embaixo deles. Transparente
        // continua pegando: é tinta, e não `none`.
        className="pointer-events-auto"
        fill={preenchimento}
        stroke={contorno}
        strokeWidth={contorno ? espessura : undefined}
        strokeDasharray={contorno ? `${espessura * 4} ${espessura * 3}` : undefined}
      />
    </svg>
  );
}

export function FogLayer({
  fog,
  variant,
  smooth = false,
  onFogPointerDown,
  items,
  paredes,
  portas,
  portaNaMao,
  naMao,
  simples = false,
}: FogLayerProps) {
  const { scale } = useSceneScale();

  // Só com alguma área dinâmica fechada: sem ela, nenhuma conta de lanterna
  // roda, e o giro das portas não é acompanhado duas vezes -- a luz já o
  // acompanha, e `usePortasNoGiro` sem portas não anima nada.
  const comLanternas =
    !simples && fog.some((region) => region.dinamica && !region.revealed);
  const lanternas = useMemo(
    () => (comLanternas ? lanternasDosTokens(items ?? []) : NENHUMA_LANTERNA),
    [comLanternas, items],
  );
  // Parede não se mexe quando um token anda: o quadro do arrasto não
  // recalcula segmento nenhum.
  const segmentos = useMemo(
    () => (comLanternas ? segmentosDasParedes(paredes) : NENHUM_SEGMENTO),
    [comLanternas, paredes],
  );
  const portasNoGiro = usePortasNoGiro(
    comLanternas ? portas : undefined,
    portaNaMao,
  );
  const folhas = useMemo(
    () => segmentosDasPortas(portasNoGiro),
    [portasNoGiro],
  );

  return (
    <>
      {fog.map((region, index) => (
        <AreaDaNevoa
          key={region.id}
          region={region}
          numero={index + 1}
          variant={variant}
          smooth={smooth}
          scale={scale}
          onFogPointerDown={onFogPointerDown}
          lanternas={lanternas}
          segmentos={segmentos}
          folhas={folhas}
          naMao={naMao}
          simples={simples}
        />
      ))}
    </>
  );
}

function AreaDaNevoa({
  region,
  numero,
  variant,
  smooth,
  scale,
  onFogPointerDown,
  lanternas,
  segmentos,
  folhas,
  naMao,
  simples,
}: {
  region: FogRegion;
  numero: number;
  variant: "mestre" | "mesa";
  smooth: boolean;
  scale: number;
  onFogPointerDown?: (event: ReactPointerEvent, region: FogRegion) => void;
  lanternas: FonteDeLuz[];
  segmentos: Segmento[];
  folhas: Segmento[];
  naMao?: string;
  simples: boolean;
}) {
  const isOperator = variant === "mestre";
  // Só a área que a borracha está furando recebe o traço: as outras ficam com
  // `null` a cada amostra, e não renderizam de novo.
  const traco = useBorrachaDaNevoaStore((estado) =>
    estado.traco?.areaId === region.id ? estado.traco : null,
  );
  const fechada = !region.revealed;
  const daArea = useMemo(
    () =>
      region.dinamica && fechada
        ? lanternasDaArea(region, lanternas)
        : NENHUMA_LANTERNA,
    [region, fechada, lanternas],
  );

  // Revelada, a mesa não vê nada. O mestre continua vendo o contorno,
  // senão não teria como esconder a área de novo.
  //
  // Com suavização o bloco fica montado e transparente, em vez de sair
  // da árvore: desmontar mataria a transição, e o preto sumiria de um
  // frame para o outro — que é exatamente o corte que queremos evitar.
  const revealedToTable = region.revealed && !isOperator;
  if (revealedToTable && !smooth) return null;

  const formato = region.formato ?? "retangulo";
  const fio = 1.5 / scale;

  // O polígono pinta a si mesmo: o elemento continua sendo a caixa
  // inteira, e deixá-lo com fundo mostraria o retângulo por trás do
  // recorte. Aqui ele é só o envelope que carrega posição e giro.
  const recortado = formato === "poligono";

  // Com furo, dinâmica ou a borracha passando, a área é PINTADA num canvas:
  // o `div` não sabe ter buraco. Sem nenhum dos três ela continua o bloco de
  // sempre, que é o caso de quase toda área -- e não paga canvas nenhum.
  // Revelada no Mestre não pinta nada, só o contorno; na mesa o canvas fica,
  // e é ele que some na transição.
  const pintada =
    !simples &&
    !(region.revealed && isOperator) &&
    (Boolean(region.furos?.length) || Boolean(region.dinamica) || traco !== null);
  // Com vírgulas: é o `fillStyle` do canvas que lê esta, e não o CSS.
  const preenchimento = isOperator ? "rgba(0,0,0,0.7)" : "#000";
  const borda = isOperator && !recortado ? fio : 0;

  return (
    <div
      data-fog-id={region.id}
      className={cn(
        "absolute top-0 left-0",
        isOperator && "touch-none",
        formato === "elipse" && "rounded-[50%]",
        // Envelope sem clique: quem recebe o gesto de uma área recortada
        // é o polígono lá dentro, e o evento sobe daqui mesmo assim.
        recortado && "pointer-events-none",
        recortado
          ? null
          : region.revealed
            ? "border-dashed border-white/25"
            : isOperator
              ? cn("border-dashed border-white/40", !pintada && "bg-black/70")
              : !pintada && "bg-black",
        smooth && "scene-smooth-fog",
        revealedToTable &&
          (recortado || pintada ? "opacity-0" : "bg-black opacity-0"),
      )}
      // `transform` em vez de `left/top`, pelo mesmo motivo do item: mover
      // a área não deve refazer o layout do plano. O giro entra no mesmo
      // `transform`, e é o que permite cobrir um corredor torto sem
      // cobrir meio mapa junto.
      style={{
        transform: `translate(${region.x}px, ${region.y}px) rotate(${region.rotation ?? 0}deg)`,
        width: region.width,
        height: region.height,
        zIndex: FOG_Z,
        borderWidth: borda,
        cursor: onFogPointerDown ? "move" : undefined,
      }}
      onPointerDown={
        onFogPointerDown
          ? (event) => onFogPointerDown(event, region)
          : undefined
      }
    >
      {pintada ? (
        <CanvasDaArea
          region={region}
          borda={borda}
          preenchimento={preenchimento}
          lanternas={daArea}
          segmentos={segmentos}
          folhas={folhas}
          traco={traco}
          smooth={smooth}
          naMao={naMao}
          congelada={region.revealed}
        />
      ) : null}

      {recortado ? (
        <PoligonoDaArea
          region={region}
          preenchimento={
            pintada || (region.revealed && isOperator)
              ? "transparent"
              : isOperator
                ? "rgb(0 0 0 / 0.7)"
                : "#000"
          }
          contorno={
            isOperator
              ? region.revealed
                ? "rgb(255 255 255 / 0.25)"
                : "rgb(255 255 255 / 0.4)"
              : undefined
          }
          espessura={fio}
        />
      ) : null}

      {isOperator ? (
        <span
          className="absolute font-medium text-white/60"
          style={{
            left: 4 / scale,
            top: 2 / scale,
            fontSize: 11 / scale,
          }}
        >
          {numero}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A área pintada: a forma, menos os furos da borracha, menos o que cada
 * lanterna alcança.
 *
 * Um canvas do tamanho da CAIXA, e não do plano: a área pequena gasta textura
 * pequena, e nada passa da caixa -- `debug-do-palco` §3. Pintado só quando a
 * chave muda, e depois é textura que o compositor leva junto com a câmera,
 * como o da luz. Arrastar um token sem lanterna não repinta nada.
 *
 * `congelada` é a área revelada que a mesa ainda vê sumir: ela fica com o
 * último desenho até o fim da transição, em vez de fechar os buracos e sumir
 * preta.
 */
function CanvasDaArea({
  region,
  borda,
  preenchimento,
  lanternas,
  segmentos,
  folhas,
  traco,
  smooth,
  naMao,
  congelada,
}: {
  region: FogRegion;
  /**
   * A espessura da borda do `div`, que o canvas desfaz: ele é posicionado
   * dentro dela, e sem o recuo sobraria um fio do lado de fora da caixa.
   */
  borda: number;
  preenchimento: string;
  lanternas: FonteDeLuz[];
  segmentos: Segmento[];
  folhas: Segmento[];
  traco: TracoDaBorracha | null;
  smooth: boolean;
  naMao?: string;
  congelada: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** O rascunho em que cada lanterna é recortada, reaproveitado. */
  const rascunhoRef = useRef<HTMLCanvasElement | null>(null);
  /** Onde cada lanterna foi desenhada por último: de onde a chegada parte. */
  const desenhadas = useRef<Map<string, FonteDeLuz>>(new Map());

  const resolucao = region.dinamica ? RESOLUCAO_DINAMICA : RESOLUCAO_PARADA;
  const largura = Math.max(1, Math.ceil(region.width * resolucao));
  const altura = Math.max(1, Math.ceil(region.height * resolucao));

  const chave = [
    region.x,
    region.y,
    region.width,
    region.height,
    region.rotation ?? 0,
    region.formato ?? "",
    (region.pontos ?? []).join(","),
    JSON.stringify(region.furos ?? []),
    preenchimento,
    resolucao,
    chaveDasFontes(lanternas),
  ].join("|");

  useEffect(() => {
    if (congelada) return;

    const canvas = canvasRef.current;
    const contexto = canvas?.getContext("2d");
    if (!canvas || !contexto) return;

    rascunhoRef.current ??= document.createElement("canvas");
    const rascunho = rascunhoRef.current;
    const pintar = (fontes: ReadonlyArray<FonteDeLuz>) => {
      pintarArea(contexto, rascunho, {
        region,
        resolucao,
        preenchimento,
        fontes,
        segmentos,
        folhas,
        traco,
      });
      desenhadas.current = new Map(fontes.map((fonte) => [fonte.id, fonte]));
    };

    // Na mesa a lanterna desliza até a amostra nova, como a luz; a do token
    // na mão do jogador chega de uma vez. No Mestre, tudo vai direto.
    const partida = desenhadas.current;
    const desliza = (fonte: FonteDeLuz) =>
      donoDaFonte(fonte) !== naMao && luzMudou(partida.get(fonte.id), fonte);
    if (!smooth || !lanternas.some(desliza)) {
      pintar(lanternas);
      return;
    }

    let quadro = 0;
    const inicio = performance.now();
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / DURACAO_DA_CHEGADA);
      pintar(
        lanternas.map((fonte) =>
          donoDaFonte(fonte) === naMao
            ? fonte
            : luzEntre(partida.get(fonte.id), fonte, t),
        ),
      );
      if (t < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);

    return () => cancelAnimationFrame(quadro);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a chave É a área e as lanternas: muda quando, e só quando, o desenho muda
  }, [chave, segmentos, folhas, traco, smooth, naMao, congelada, largura, altura]);

  return (
    <canvas
      ref={canvasRef}
      width={largura}
      height={altura}
      className="pointer-events-none absolute"
      style={{
        left: -borda,
        top: -borda,
        width: region.width,
        height: region.height,
      }}
    />
  );
}

/** Tudo o que `pintarArea` desenha. */
type DesenhoDaArea = {
  region: FogRegion;
  resolucao: number;
  preenchimento: string;
  fontes: ReadonlyArray<FonteDeLuz>;
  segmentos: ReadonlyArray<Segmento>;
  folhas: ReadonlyArray<Segmento>;
  traco: TracoDaBorracha | null;
};

/**
 * Pinta a área inteira: a forma cheia, e cada furo e cada lanterna abrindo o
 * seu buraco nela (`destination-out`).
 *
 * A lanterna passa por um RASCUNHO, e não direto: a sombra de uma parede não
 * pode fechar o buraco que OUTRA lanterna abriu por trás dela. É a mesma razão
 * do rascunho por luz da `LuzLayer`. O rascunho é do tamanho do canvas, mas
 * cada lanterna limpa e copia só a janela que ela cobre.
 */
function pintarArea(
  contexto: CanvasRenderingContext2D,
  rascunho: HTMLCanvasElement,
  { region, resolucao, preenchimento, fontes, segmentos, folhas, traco }: DesenhoDaArea,
) {
  const { width: largura, height: altura } = contexto.canvas;

  contexto.setTransform(1, 0, 0, 1, 0, 0);
  contexto.globalCompositeOperation = "source-over";
  contexto.clearRect(0, 0, largura, altura);

  // A forma, nas coordenadas da caixa: o `div` já carrega o giro.
  contexto.setTransform(resolucao, 0, 0, resolucao, 0, 0);
  contornoDaArea(contexto, region);
  contexto.fillStyle = preenchimento;
  contexto.fill();

  contexto.globalCompositeOperation = "destination-out";
  contexto.lineCap = "round";
  contexto.lineJoin = "round";
  contexto.strokeStyle = "#000";
  contexto.fillStyle = "#000";
  for (const furo of region.furos ?? []) {
    passada(
      contexto,
      pontosNaCaixa(region, furo.pontos),
      furo.raio * region.width,
    );
  }
  if (traco) {
    passada(
      contexto,
      traco.pontos.map((ponto) => paraCaixa(region, ponto)),
      traco.raio,
    );
  }

  if (fontes.length > 0) {
    if (rascunho.width !== largura) rascunho.width = largura;
    if (rascunho.height !== altura) rascunho.height = altura;
    const papel = rascunho.getContext("2d");
    const matriz = daCenaParaOCanvas(region, resolucao);

    for (const fonte of papel ? fontes : []) {
      const caixa = caixaDaFonte(fonte);
      if (!caixa || !papel) continue;
      const janela = janelaNoCanvas(matriz, caixa, largura, altura);
      if (!janela) continue;

      papel.setTransform(1, 0, 0, 1, 0, 0);
      papel.globalCompositeOperation = "source-over";
      papel.clearRect(janela.x, janela.y, janela.width, janela.height);
      papel.setTransform(...matriz);
      const portas = folhasNaCaixa(caixa, folhas);
      pintarAlcance(
        papel,
        fonte,
        caixa,
        portas.length > 0 ? [...segmentos, ...portas] : segmentos,
        resolucao,
      );

      contexto.setTransform(1, 0, 0, 1, 0, 0);
      contexto.drawImage(
        rascunho,
        janela.x,
        janela.y,
        janela.width,
        janela.height,
        janela.x,
        janela.y,
        janela.width,
        janela.height,
      );
    }
  }

  contexto.globalCompositeOperation = "source-over";
  contexto.setTransform(1, 0, 0, 1, 0, 0);
}

/** O contorno da área em coordenadas da caixa, pronto para encher. */
function contornoDaArea(contexto: CanvasRenderingContext2D, region: FogRegion) {
  const formato = region.formato ?? "retangulo";
  contexto.beginPath();

  if (formato === "elipse") {
    contexto.ellipse(
      region.width / 2,
      region.height / 2,
      region.width / 2,
      region.height / 2,
      0,
      0,
      Math.PI * 2,
    );
    return;
  }

  const vertices =
    formato === "poligono" ? pontosNaCaixa(region, region.pontos ?? []) : [];
  if (vertices.length < 3) {
    contexto.rect(0, 0, region.width, region.height);
    return;
  }

  const [primeiro, ...resto] = vertices;
  contexto.moveTo(primeiro!.x, primeiro!.y);
  for (const ponto of resto) contexto.lineTo(ponto.x, ponto.y);
  contexto.closePath();
}

/** Uma passada do pincel redondo. Um ponto só é o clique: um círculo. */
function passada(
  contexto: CanvasRenderingContext2D,
  pontos: ReadonlyArray<Vec>,
  raio: number,
) {
  const [primeiro, ...resto] = pontos;
  if (!primeiro || raio <= 0) return;

  contexto.beginPath();
  if (resto.length === 0) {
    contexto.arc(primeiro.x, primeiro.y, raio, 0, Math.PI * 2);
    contexto.fill();
    return;
  }

  contexto.moveTo(primeiro.x, primeiro.y);
  for (const ponto of resto) contexto.lineTo(ponto.x, ponto.y);
  contexto.lineWidth = raio * 2;
  contexto.stroke();
}

type Matriz = [number, number, number, number, number, number];

/**
 * Da cena para o pixel do canvas da área: desfaz o giro em volta do centro,
 * leva a origem ao canto da caixa e aplica a resolução. É `paraCaixa` em forma
 * de matriz, para a lanterna, que vive em cena, cair no lugar certo.
 */
function daCenaParaOCanvas(region: FogRegion, resolucao: number): Matriz {
  const radianos = ((region.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(radianos);
  const sin = Math.sin(radianos);
  const cx = region.x + region.width / 2;
  const cy = region.y + region.height / 2;

  return [
    resolucao * cos,
    -resolucao * sin,
    resolucao * sin,
    resolucao * cos,
    resolucao * (-cos * cx - sin * cy + region.width / 2),
    resolucao * (sin * cx - cos * cy + region.height / 2),
  ];
}

/** O retângulo em pixels do canvas que a caixa de uma luz cobre. `null` se nenhum. */
function janelaNoCanvas(
  [a, b, c, d, e, f]: Matriz,
  caixa: CaixaDaLuz,
  largura: number,
  altura: number,
): { x: number; y: number; width: number; height: number } | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of [
    [caixa.x, caixa.y],
    [caixa.x + caixa.width, caixa.y],
    [caixa.x, caixa.y + caixa.height],
    [caixa.x + caixa.width, caixa.y + caixa.height],
  ] as const) {
    xs.push(a * x + c * y + e);
    ys.push(b * x + d * y + f);
  }

  const x1 = Math.max(0, Math.floor(Math.min(...xs)));
  const y1 = Math.max(0, Math.floor(Math.min(...ys)));
  const x2 = Math.min(largura, Math.ceil(Math.max(...xs)));
  const y2 = Math.min(altura, Math.ceil(Math.max(...ys)));

  if (x2 <= x1 || y2 <= y1) return null;

  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}
