import { describe, expect, it } from "vitest";
import {
  converterUVTTParaCena,
  decodificarBase64,
  normalizarCorUVTT,
  parseUVTT,
} from "./uvtt";

describe("Universal VTT (.dd2vtt / .uvtt) Parser & Conversor", () => {
  const sampleUVTT = JSON.stringify({
    format: 0.2,
    resolution: {
      map_origin: { x: 0, y: 0 },
      map_size: { x: 20, y: 15 },
      pixels_per_grid: 100,
    },
    line_of_sight: [
      [
        { x: 1, y: 1 },
        { x: 5, y: 1 },
        { x: 5, y: 5 },
      ],
      [
        { x: 10, y: 2 },
        { x: 12, y: 4 },
      ],
    ],
    portals: [
      {
        position: { x: 3, y: 1 },
        bounds: [
          { x: 2, y: 1 },
          { x: 4, y: 1 },
        ],
        rotation: 0,
        closed: true,
        freestanding: false,
      },
      {
        position: { x: 10, y: 10 },
        bounds: [
          { x: 10, y: 9 },
          { x: 10, y: 11 },
        ],
        rotation: 90,
        closed: false,
        freestanding: false,
      },
    ],
    lights: [
      {
        position: { x: 5, y: 5 },
        range: 4,
        color: "ffaa00ff",
        intensity: 0.9,
      },
    ],
    image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  });

  it("converte cores hexadecimais de 8 dígitos para CSS hex", () => {
    expect(normalizarCorUVTT("ffaa00ff")).toBe("#ffaa00");
    expect(normalizarCorUVTT("#00ff00ff")).toBe("#00ff00");
    expect(normalizarCorUVTT(undefined)).toBe("#fb923c");
  });

  it("decodifica string base64 para Uint8Array", () => {
    const bytes = decodificarBase64("SGVsbG8=");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(bytes)).toBe("Hello");
  });

  it("valida e extrai estrutura UVTT", () => {
    const doc = parseUVTT(sampleUVTT);
    expect(doc.resolution.map_size.x).toBe(20);
    expect(doc.resolution.map_size.y).toBe(15);
    expect(doc.resolution.pixels_per_grid).toBe(100);

    expect(() => parseUVTT("invalido")).toThrow("JSON corrompido");
    expect(() => parseUVTT("{}")).toThrow("resolução ou tamanho do mapa ausentes");
  });

  it("converte UVTT para cena com paredes, portas, luzes e grade em pixels", () => {
    const doc = parseUVTT(sampleUVTT);
    const cena = converterUVTTParaCena(doc);

    // Grade configurada com pixels_per_grid
    expect(cena.grid.size).toBe(100);
    expect(cena.larguraPx).toBe(2000);
    expect(cena.alturaPx).toBe(1500);

    // 2 polylines: primeiro com 3 pontos (2 segmentos) + segundo com 2 pontos (1 segmento) = 3 paredes
    expect(cena.paredes).toHaveLength(3);
    expect(cena.paredes[0]).toMatchObject({
      x: 100,
      y: 100,
      width: 400,
      height: 0,
      formato: "linha",
    });

    // 2 portais: um fechado e um aberto
    expect(cena.portas).toHaveLength(2);
    expect(cena.portas[0]!.comprimento).toBe(200);
    expect(cena.portas[0]!.abertura).toBeUndefined(); // Fechada
    expect(cena.portas[1]!.comprimento).toBe(200);
    expect(cena.portas[1]!.abertura).toBe(90); // Aberta

    // 1 fonte de luz
    expect(cena.luzes).toHaveLength(1);
    expect(cena.luzes[0]).toMatchObject({
      x: 500,
      y: 500,
      raio: 400,
      cor: "#ffaa00",
      intensidade: 0.9,
    });

    // Escuridão dinâmica ligada
    expect(cena.escuridao).toBe(0.85);

    // Imagem decodificada
    expect(cena.imageBytes).toBeDefined();
    expect(cena.imageBytes!.length).toBeGreaterThan(0);
  });
});
