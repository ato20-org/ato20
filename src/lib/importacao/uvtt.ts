import { caberEm } from "@/lib/geometry/caber";
import { novoId } from "@/lib/id";
import {
  CORES_DA_LUZ,
  DEFAULT_GRID,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type Luz,
  type Parede,
  type Porta,
  type SceneGrid,
} from "@/types/scene";

/**
 * Um mapa Universal VTT (`.dd2vtt`, `.df2vtt`, `.uvtt`) convertido para a cena:
 * a grade, as paredes, as portas e as luzes, nas coordenadas do palco.
 *
 * É o formato aberto que o Dungeondraft, o Dungeon Alchemist e o Arkenforge
 * exportam: a imagem do mapa e, junto dela, onde estão as paredes, as portas e
 * as luzes, em QUADRADOS. A imagem não passa por aqui -- o Rust a separa e a
 * grava no acervo antes, ver `uvtt.rs`.
 *
 * ## As coordenadas
 *
 * O formato conta em quadrados a partir de `map_origin`. O palco não conta em
 * pixel da imagem: o fundo é ENCAIXADO na cena de 1920 × 1080 e centralizado
 * (`caberEm`, em `FundoDaCena`), e um mapa de 4200 pixels de largura é desenhado
 * com 1620. Por isso tudo aqui passa pelo mesmo encaixe que o fundo vai ter -- o
 * quadrado vira `largura encaixada / quadrados na largura`, e a origem, o canto
 * da imagem encaixada. Sem isso as paredes sairiam do tamanho da imagem crua,
 * fora do desenho e fora da cena.
 *
 * O encaixe é calculado pela proporção do MAPA, e não pela da imagem: a imagem
 * do formato cobre exatamente `map_size × pixels_per_grid`, então as duas são a
 * mesma, e o JSON chega aqui sem ela.
 */

type PontoUVTT = { x: number; y: number };

export type DocumentoUVTT = {
  resolution: {
    map_origin?: PontoUVTT;
    map_size: PontoUVTT;
    pixels_per_grid?: number;
  };
  line_of_sight?: PontoUVTT[][];
  /** As sombras de pilar e de móvel, separadas das paredes desde o formato 0.3. */
  objects_line_of_sight?: PontoUVTT[][];
  portals?: Array<{ bounds?: PontoUVTT[]; closed?: boolean }>;
  lights?: Array<{
    position?: PontoUVTT;
    range?: number;
    intensity?: number;
    color?: string;
  }>;
  environment?: { baked_lighting?: boolean; ambient_light?: string };
};

export type ConversaoUVTT = {
  grid: SceneGrid;
  paredes: Parede[];
  portas: Porta[];
  luzes: Luz[];
  /** `undefined` deixa a escuridão da cena como está. Ver `escuridaoDoAmbiente`. */
  escuridao: number | undefined;
};

/**
 * O arquivo não é um mapa. O motivo vai para a tela escolher o texto -- este
 * módulo não fala com quem usa.
 */
export class ErroDeUVTT extends Error {
  constructor(readonly motivo: "json" | "tamanho") {
    super(`Universal VTT inválido: ${motivo}`);
  }
}

function numero(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor);
}

function pontoValido(ponto: unknown): ponto is PontoUVTT {
  return (
    typeof ponto === "object" &&
    ponto !== null &&
    numero((ponto as PontoUVTT).x) &&
    numero((ponto as PontoUVTT).y)
  );
}

/** Lê o JSON e confere o que a conversão não tem como adivinhar: o tamanho. */
export function lerUVTT(texto: string): DocumentoUVTT {
  let doc: unknown;
  try {
    doc = JSON.parse(texto);
  } catch {
    throw new ErroDeUVTT("json");
  }

  const tamanho = (doc as Partial<DocumentoUVTT> | null)?.resolution?.map_size;
  if (!pontoValido(tamanho) || tamanho.x <= 0 || tamanho.y <= 0)
    throw new ErroDeUVTT("tamanho");

  return doc as DocumentoUVTT;
}

/**
 * A cor no formato do arquivo, em CSS.
 *
 * O formato escreve a cor com o ALFA NA FRENTE -- `ffeccd8b` é a tocha amarela
 * `#eccd8b` --, como o importador do Foundry lê. Ler os seis primeiros daria
 * `#ffeccd`, quase branco. Seis dígitos passam como estão, e o que não se lê
 * vira a cor da chama, que é a luz que quase todo mapa acende.
 */
export function corDaUVTT(cor: string | undefined): string {
  const hex = (cor ?? "").replace(/^#/, "").toLowerCase();

  if (/^[0-9a-f]{8}$/.test(hex)) return `#${hex.slice(2)}`;
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`;
  return CORES_DA_LUZ[0];
}

/**
 * A escuridão da cena a partir da luz ambiente do arquivo, ou `undefined`.
 *
 * Só quando o mapa NÃO tem a luz assada na imagem. Com `baked_lighting`, o
 * desenho já veio com o canto escuro escuro e a tocha acesa; pôr a escuridão
 * do palco por cima escureceria duas vezes. Sem ambiente nenhum, a cena fica
 * como estava -- é o mestre que decide o escuro, pela régua de sempre.
 *
 * O escuro é o contrário do brilho da luz ambiente: ambiente branco é dia, e
 * ambiente quase preto é a cripta.
 */
export function escuridaoDoAmbiente(
  ambiente: DocumentoUVTT["environment"],
): number | undefined {
  if (!ambiente || ambiente.baked_lighting || !ambiente.ambient_light) return undefined;

  const hex = corDaUVTT(ambiente.ambient_light).slice(1);
  const [r, g, b] = [0, 2, 4].map((inicio) => parseInt(hex.slice(inicio, inicio + 2), 16) / 255);
  const brilho = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;

  return arredondar(Math.min(1, Math.max(0, 1 - brilho)));
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function mesmoPonto(a: PontoUVTT, b: PontoUVTT): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Um laço fechado como UMA parede `poligono`, ou `null` quando ele não tem
 * área (todos os pontos numa reta) e só cabe como segmentos.
 *
 * Uma parede só, e não um segmento por lado: o pilar de oito lados é uma peça
 * que o mestre move inteira, e um mapa grande tem centenas de laços -- em
 * segmentos soltos, a lista de camadas viraria uma parede de milhares.
 */
function poligono(pontos: readonly PontoUVTT[]): Parede | null {
  const xs = pontos.map((ponto) => ponto.x);
  const ys = pontos.map((ponto) => ponto.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const width = Math.max(...xs) - x;
  const height = Math.max(...ys) - y;
  if (width <= 0 || height <= 0) return null;

  return {
    id: novoId(),
    x: arredondar(x),
    y: arredondar(y),
    width: arredondar(width),
    height: arredondar(height),
    formato: "poligono",
    pontos: pontos.flatMap((ponto) => [(ponto.x - x) / width, (ponto.y - y) / height]),
  };
}

/** Um lado reto como parede `linha`, na convenção da diagonal da caixa. */
function segmento(de: PontoUVTT, para: PontoUVTT): Parede {
  const x = Math.min(de.x, para.x);
  const y = Math.min(de.y, para.y);
  // A `linha` corre do canto de cima à esquerda ao de baixo à direita; subindo
  // da esquerda para a direita, é a outra diagonal.
  const sobe = (para.x - de.x) * (para.y - de.y) < 0;

  return {
    id: novoId(),
    x: arredondar(x),
    y: arredondar(y),
    width: arredondar(Math.abs(para.x - de.x)),
    height: arredondar(Math.abs(para.y - de.y)),
    formato: "linha",
    ...(sobe ? { diagonal: "secundaria" as const } : {}),
  };
}

export function converterUVTT(doc: DocumentoUVTT): ConversaoUVTT {
  const { map_size: tamanho } = doc.resolution;
  const origem = pontoValido(doc.resolution.map_origin)
    ? doc.resolution.map_origin
    : { x: 0, y: 0 };
  const ppg = numero(doc.resolution.pixels_per_grid) ? doc.resolution.pixels_per_grid : 1;

  const encaixe = caberEm(
    { largura: tamanho.x * ppg, altura: tamanho.y * ppg },
    { width: SCENE_WIDTH, height: SCENE_HEIGHT },
  );
  const quadrado = encaixe.width / tamanho.x;
  const noPalco = (ponto: PontoUVTT): PontoUVTT => ({
    x: encaixe.x + (ponto.x - origem.x) * quadrado,
    y: encaixe.y + (ponto.y - origem.y) * quadrado,
  });
  const dentroDoMapa = (ponto: PontoUVTT) =>
    ponto.x >= origem.x &&
    ponto.y >= origem.y &&
    ponto.x <= origem.x + tamanho.x &&
    ponto.y <= origem.y + tamanho.y;

  // As paredes e as sombras dos objetos são a mesma coisa para a luz: o que a
  // para. Laço fechado vira um polígono; linha aberta, um segmento por lado --
  // a parede do palco não tem polilinha aberta.
  const paredes: Parede[] = [];
  for (const linha of [...(doc.line_of_sight ?? []), ...(doc.objects_line_of_sight ?? [])]) {
    if (!Array.isArray(linha)) continue;

    const pontos = linha.filter(pontoValido).map(noPalco);
    if (pontos.length < 2) continue;

    const fechada = pontos.length >= 4 && mesmoPonto(pontos[0]!, pontos[pontos.length - 1]!);
    const inteira = fechada ? poligono(pontos.slice(0, -1)) : null;
    if (inteira) {
      paredes.push(inteira);
      continue;
    }

    for (let i = 0; i + 1 < pontos.length; i += 1)
      if (!mesmoPonto(pontos[i]!, pontos[i + 1]!))
        paredes.push(segmento(pontos[i]!, pontos[i + 1]!));
  }

  // Só o portal FECHADO vira porta. O aberto é janela ou passagem -- deixa a luz
  // passar no mapa de origem --, e uma porta escancarada no lugar dele poria a
  // folha bloqueando a luz onde não há folha nenhuma.
  const portas: Porta[] = [];
  for (const portal of doc.portals ?? []) {
    if (portal.closed === false) continue;

    const limites = (portal.bounds ?? []).filter(pontoValido);
    if (limites.length < 2) continue;

    const dobradica = noPalco(limites[0]!);
    const ponta = noPalco(limites[1]!);
    const comprimento = Math.hypot(ponta.x - dobradica.x, ponta.y - dobradica.y);
    if (comprimento <= 0) continue;

    portas.push({
      id: novoId(),
      x: arredondar(dobradica.x),
      y: arredondar(dobradica.y),
      comprimento: arredondar(comprimento),
      angulo: arredondar(
        (Math.atan2(ponta.y - dobradica.y, ponta.x - dobradica.x) * 180) / Math.PI,
      ),
    });
  }

  // A intensidade do formato passa de 1 (o Dungeondraft exporta 1,3); a do palco
  // vai até 1, e acima disso é a luz inteira, que é o ausente.
  const luzes: Luz[] = [];
  for (const luz of doc.lights ?? []) {
    if (!pontoValido(luz.position) || !dentroDoMapa(luz.position) || !numero(luz.range)) continue;
    if (luz.range <= 0) continue;

    const centro = noPalco(luz.position);
    const intensidade =
      numero(luz.intensity) && luz.intensity < 1 ? Math.max(0, luz.intensity) : undefined;

    luzes.push({
      id: novoId(),
      x: arredondar(centro.x),
      y: arredondar(centro.y),
      raio: arredondar(luz.range * quadrado),
      cor: corDaUVTT(luz.color),
      ...(intensidade !== undefined ? { intensidade: arredondar(intensidade) } : {}),
    });
  }

  return {
    // A grade do próprio mapa: o quadrado do desenho, com as linhas saindo do
    // canto da imagem encaixada -- as linhas passam por `offset + k × size`.
    grid: {
      ...DEFAULT_GRID,
      size: quadrado,
      offsetX: encaixe.x,
      offsetY: encaixe.y,
      snap: true,
    },
    paredes,
    portas,
    luzes,
    escuridao: escuridaoDoAmbiente(doc.environment),
  };
}
