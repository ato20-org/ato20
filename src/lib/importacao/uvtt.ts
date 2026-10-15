import { novoId } from "@/lib/id";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { importarBytes } from "@/lib/vault/assets";
import { DEFAULT_GRID, type Luz, type Parede, type Porta, type SceneGrid } from "@/types/scene";

export interface UVTTPoint {
  x: number;
  y: number;
}

export interface UVTTPortal {
  position: UVTTPoint;
  bounds: [UVTTPoint, UVTTPoint] | UVTTPoint[];
  rotation?: number;
  closed: boolean;
  freestanding?: boolean;
}

export interface UVTTLight {
  position: UVTTPoint;
  range: number;
  color?: string;
  intensity?: number;
}

export interface UVTTData {
  format?: number;
  resolution: {
    map_origin?: UVTTPoint;
    map_size: UVTTPoint;
    pixels_per_grid: number;
  };
  line_of_sight?: UVTTPoint[][];
  portals?: UVTTPortal[];
  lights?: UVTTLight[];
  image?: string; // Base64 png/jpeg data
}

export interface ConversaoUVTT {
  grid: SceneGrid;
  paredes: Parede[];
  portas: Porta[];
  luzes: Luz[];
  escuridao: number;
  larguraPx: number;
  alturaPx: number;
  imageBytes?: Uint8Array;
}

/**
 * Lê e valida um texto JSON no formato Universal VTT (.dd2vtt / .uvtt).
 */
export function parseUVTT(jsonStr: string): UVTTData {
  let doc: unknown;
  try {
    doc = JSON.parse(jsonStr);
  } catch {
    throw new Error("Arquivo UVTT inválido: JSON corrompido");
  }

  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("Arquivo UVTT inválido: conteúdo não é um objeto");
  }

  const uvtt = doc as Partial<UVTTData>;
  if (!uvtt.resolution || !uvtt.resolution.map_size) {
    throw new Error("Arquivo UVTT inválido: resolução ou tamanho do mapa ausentes");
  }

  if (
    typeof uvtt.resolution.map_size.x !== "number" ||
    typeof uvtt.resolution.map_size.y !== "number" ||
    uvtt.resolution.map_size.x <= 0 ||
    uvtt.resolution.map_size.y <= 0
  ) {
    throw new Error("Arquivo UVTT inválido: dimensões do mapa inválidas");
  }

  return uvtt as UVTTData;
}

/** Converte cor no formato UVTT (RGBA hex de 8 dígitos ou CSS hex) para cor CSS hex de 6 dígitos. */
export function normalizarCorUVTT(raw?: string): string {
  if (!raw) return "#fb923c"; // Laranja clássico de tocha do ATO20
  const limpa = raw.replace(/^#/, "");
  if (limpa.length === 8 || limpa.length === 6) {
    return `#${limpa.slice(0, 6)}`;
  }
  if (limpa.length === 3) {
    return `#${limpa[0]}${limpa[0]}${limpa[1]}${limpa[1]}${limpa[2]}${limpa[2]}`;
  }
  return "#fb923c";
}

/** Decodifica a string Base64 da imagem para bytes Uint8Array. */
export function decodificarBase64(base64: string): Uint8Array {
  const limpo = base64
    .replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "")
    .replace(/\s+/g, "")
    .trim();
  const binario = atob(limpo);
  const len = binario.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binario.charCodeAt(i);
  }
  return bytes;
}

/**
 * Converte os dados do Universal VTT para as entidades nativas do ATO20.
 *
 * No UVTT, as coordenadas são fornecidas em unidades de GRADE (células).
 * No ATO20, a geometria (paredes, portas, luzes) vive em coordenadas contínuas de cena (pixels).
 * A escala multiplicadora é `pixels_per_grid`.
 */
export function converterUVTTParaCena(doc: UVTTData): ConversaoUVTT {
  const escala = Math.max(1, Math.round(Number(doc.resolution?.pixels_per_grid) || 70));
  const larguraPx = Math.round(Number(doc.resolution.map_size.x) * escala);
  const alturaPx = Math.round(Number(doc.resolution.map_size.y) * escala);

  const paredes: Parede[] = [];
  const portas: Porta[] = [];
  const luzes: Luz[] = [];

  // 1. Linhas de Visão / Paredes (Polylines)
  if (Array.isArray(doc.line_of_sight)) {
    for (const linha of doc.line_of_sight) {
      if (!Array.isArray(linha) || linha.length < 2) continue;

      for (let i = 0; i < linha.length - 1; i += 1) {
        const p1 = linha[i]!;
        const p2 = linha[i + 1]!;

        const x1 = Math.round(p1.x * escala);
        const y1 = Math.round(p1.y * escala);
        const x2 = Math.round(p2.x * escala);
        const y2 = Math.round(p2.y * escala);

        if (x1 === x2 && y1 === y2) continue;

        const minX = Math.min(x1, x2);
        const minY = Math.min(y1, y2);
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);
        const diagonal =
          (x1 < x2 && y1 > y2) || (x1 > x2 && y1 < y2) ? "secundaria" : undefined;

        paredes.push({
          id: novoId(),
          x: minX,
          y: minY,
          width,
          height,
          formato: "linha",
          diagonal,
        });
      }
    }
  }

  // 2. Portais / Portas
  if (Array.isArray(doc.portals)) {
    for (const portal of doc.portals) {
      if (!Array.isArray(portal.bounds) || portal.bounds.length < 2) continue;

      const p1 = portal.bounds[0]!;
      const p2 = portal.bounds[1]!;

      const x1 = p1.x * escala;
      const y1 = p1.y * escala;
      const x2 = p2.x * escala;
      const y2 = p2.y * escala;

      const dx = x2 - x1;
      const dy = y2 - y1;
      const comprimento = Math.round(Math.hypot(dx, dy));
      if (comprimento <= 0) continue;

      const angulo = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);

      portas.push({
        id: novoId(),
        x: Math.round(x1),
        y: Math.round(y1),
        comprimento,
        angulo,
        // Porta aberta se portal.closed for falso (ou seja, já vem aberta no editor)
        abertura: portal.closed ? undefined : 90,
      });
    }
  }

  // 3. Luzes dinâmicas
  if (Array.isArray(doc.lights)) {
    for (const l of doc.lights) {
      if (!l.position) continue;

      const x = Math.round(l.position.x * escala);
      const y = Math.round(l.position.y * escala);
      const raio = Math.round(Math.max(1, l.range * escala));
      const cor = normalizarCorUVTT(l.color);
      const intensidade =
        typeof l.intensity === "number" && l.intensity >= 0 && l.intensity <= 1
          ? l.intensity
          : undefined;

      luzes.push({
        id: novoId(),
        x,
        y,
        raio,
        cor,
        intensidade,
      });
    }
  }

  // Configuração de grade nativa do ATO20
  const grid: SceneGrid = {
    ...DEFAULT_GRID,
    size: escala,
    offsetX: 0,
    offsetY: 0,
    snap: true,
  };

  let imageBytes: Uint8Array | undefined;
  if (doc.image) {
    try {
      imageBytes = decodificarBase64(doc.image);
    } catch {
      // Falha silenciosa de decodificação de imagem: o restante da cena é preservado
    }
  }

  return {
    grid,
    paredes,
    portas,
    luzes,
    escuridao: luzes.length > 0 || paredes.length > 0 ? 0.85 : 0,
    larguraPx,
    alturaPx,
    imageBytes,
  };
}

/**
 * Aplica os dados convertidos do Universal VTT a uma cena existente no ATO20:
 * - Importa a imagem como asset e define como fundo.
 * - Ajusta a grade com a resolução nativa.
 * - Adiciona paredes, portas e fontes de luz.
 * - Ativa a escuridão dinâmica.
 */
export async function aplicarUVTTCena(
  sceneId: string,
  jsonStr: string,
  nomeArquivo?: string,
): Promise<{ paredes: number; portas: number; luzes: number }> {
  const doc = parseUVTT(jsonStr);
  const conversao = converterUVTTParaCena(doc);

  if (conversao.imageBytes && conversao.imageBytes.length > 0) {
    const nomeBase = (nomeArquivo ?? "mapa-uvtt").replace(/\.[^/.]+$/, "");
    try {
      const res = await importarBytes(`${nomeBase}.png`, conversao.imageBytes, "cena");
      if (res.aceitos[0]) {
        useSceneStore.getState().setBackground(sceneId, res.aceitos[0].id);
      }
    } catch (e) {
      console.warn("Não foi possível importar imagem do UVTT como asset:", e);
    }
  }

  useSceneStore.getState().setSceneGrid(sceneId, conversao.grid);
  useSceneStore.getState().updateScene(sceneId, (scene) => ({
    ...scene,
    paredes: [...(scene.paredes ?? []), ...conversao.paredes],
    portas: [...(scene.portas ?? []), ...conversao.portas],
    luzes: [...(scene.luzes ?? []), ...conversao.luzes],
    escuridao: conversao.escuridao,
  }));

  return {
    paredes: conversao.paredes.length,
    portas: conversao.portas.length,
    luzes: conversao.luzes.length,
  };
}
