import { describe, expect, it } from "vitest";

import {
  afimDoTriangulo,
  assinaturaDaFoto,
  assinaturaDoTripe,
} from "@/lib/mestre/foto-da-camera";
import {
  dentroDoTeto,
  type FotoDaCamera,
} from "@/lib/store/use-fotos-das-cameras-store";

const recorte = { x: 0, y: 0, width: 960, height: 540 };

describe("assinaturaDaFoto", () => {
  it("a mesma cena e o mesmo recorte dão a mesma assinatura", () => {
    const cena = { updatedAt: 10, backgroundAssetId: "mapa" };
    expect(assinaturaDaFoto(cena, recorte)).toBe(assinaturaDaFoto(cena, recorte));
  });

  it("a câmera andou: a foto está velha", () => {
    const cena = { updatedAt: 10, backgroundAssetId: "mapa" };
    expect(assinaturaDaFoto(cena, { ...recorte, x: 5 })).not.toBe(
      assinaturaDaFoto(cena, recorte),
    );
  });

  it("a cena mudou (um token andou): a foto está velha", () => {
    expect(
      assinaturaDaFoto({ updatedAt: 11, backgroundAssetId: "mapa" }, recorte),
    ).not.toBe(
      assinaturaDaFoto({ updatedAt: 10, backgroundAssetId: "mapa" }, recorte),
    );
  });
});

describe("dentroDoTeto", () => {
  const foto = (quando: number): FotoDaCamera => ({
    url: "data:",
    assinatura: "",
    quando,
  });

  it("abaixo do teto, tudo fica", () => {
    expect(Object.keys(dentroDoTeto({ a: foto(1), b: foto(2) }, 3))).toHaveLength(2);
  });

  it("acima dele, saem as mais antigas", () => {
    const ficaram = dentroDoTeto(
      { velha: foto(1), media: foto(5), nova: foto(9) },
      2,
    );
    expect(Object.keys(ficaram).sort()).toEqual(["media", "nova"]);
  });
});

describe("afimDoTriangulo", () => {
  const aplicar = (
    [a, b, c, d, e, f]: [number, number, number, number, number, number],
    ponto: { x: number; y: number },
  ) => ({ x: a * ponto.x + c * ponto.y + e, y: b * ponto.x + d * ponto.y + f });

  it("leva cada canto ao canto correspondente", () => {
    const de: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    const para: typeof de = [
      { x: 5, y: 7 },
      { x: 25, y: 9 },
      { x: 3, y: 31 },
    ];
    const matriz = afimDoTriangulo(de, para)!;

    de.forEach((ponto, i) => {
      const levado = aplicar(matriz, ponto);
      expect(levado.x).toBeCloseTo(para[i]!.x);
      expect(levado.y).toBeCloseTo(para[i]!.y);
    });
  });

  it("triângulo sem área não tem transformação", () => {
    expect(
      afimDoTriangulo(
        [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: 1 },
        ],
      ),
    ).toBeNull();
  });
});

describe("assinaturaDoTripe", () => {
  const cena = { updatedAt: 10, backgroundAssetId: "mapa" };
  const tripe = {
    x: 960,
    y: 1380,
    altura: 700,
    giro: 0,
    inclinacao: 55,
    rolagem: 0,
    lente: 45,
  };

  it("o tripé virou: a foto está velha", () => {
    expect(assinaturaDoTripe(cena, { ...tripe, giro: 10 })).not.toBe(
      assinaturaDoTripe(cena, tripe),
    );
  });

  it("não se confunde com a de um recorte", () => {
    expect(assinaturaDoTripe(cena, tripe)).not.toBe(
      assinaturaDaFoto(cena, { x: 960, y: 1380, width: 700, height: 0 }),
    );
  });
});
