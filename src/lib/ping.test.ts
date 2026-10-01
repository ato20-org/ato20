import { describe, expect, it } from "vitest";

import {
  anguloDaOpcao,
  ehTeclaDoPing,
  ehTipoDePing,
  MIOLO_DA_RODA_PX,
  opcaoNaDirecao,
} from "@/lib/ping";
import { TIPOS_DE_PING } from "@/types/ping";

describe("opcaoNaDirecao", () => {
  it("no miolo não escolhe nada", () => {
    expect(opcaoNaDirecao(0, 0)).toBeNull();
    expect(opcaoNaDirecao(MIOLO_DA_RODA_PX - 1, 0)).toBeNull();
  });

  it("para cima é a primeira opção, e o y da tela cresce para baixo", () => {
    expect(opcaoNaDirecao(0, -60)).toBe(TIPOS_DE_PING[0]);
    expect(opcaoNaDirecao(0, 60)).toBe(TIPOS_DE_PING[3]);
  });

  it("cada opção é dona da direção em que a roda a desenha", () => {
    TIPOS_DE_PING.forEach((tipo, indice) => {
      const radianos = (anguloDaOpcao(indice) * Math.PI) / 180;
      // A mesma conta da roda: seno no x, menos cosseno no y.
      const dx = Math.sin(radianos) * 60;
      const dy = -Math.cos(radianos) * 60;

      expect(opcaoNaDirecao(dx, dy)).toBe(tipo);
    });
  });

  it("perto da divisa entre duas fatias, vence a mais próxima", () => {
    const fatia = 360 / TIPOS_DE_PING.length;
    const quase = ((fatia / 2 - 1) * Math.PI) / 180;

    expect(opcaoNaDirecao(Math.sin(quase) * 60, -Math.cos(quase) * 60)).toBe(
      TIPOS_DE_PING[0],
    );
    // Do outro lado do topo, um grau antes da divisa: ainda a primeira, e não
    // a última -- o ângulo negativo dá a volta.
    expect(opcaoNaDirecao(-Math.sin(quase) * 60, -Math.cos(quase) * 60)).toBe(
      TIPOS_DE_PING[0],
    );
  });
});

describe("ehTipoDePing", () => {
  it("aceita só os tipos que a roda tem", () => {
    expect(ehTipoDePing("perigo")).toBe(true);
    expect(ehTipoDePing("foguete")).toBe(false);
    expect(ehTipoDePing(undefined)).toBe(false);
  });
});

describe("ehTeclaDoPing", () => {
  it("o apóstrofo do ABNT2, com e sem Shift", () => {
    expect(ehTeclaDoPing({ key: "'", code: "Backquote" })).toBe(true);
    expect(ehTeclaDoPing({ key: '"', code: "Backquote" })).toBe(true);
  });

  it("a tecla morta do americano internacional, pelo código", () => {
    expect(ehTeclaDoPing({ key: "Dead", code: "Quote" })).toBe(true);
    // O acento agudo do ABNT2 também é tecla morta, e mora noutro lugar.
    expect(ehTeclaDoPing({ key: "Dead", code: "BracketLeft" })).toBe(false);
  });

  it("outra tecla não é ping", () => {
    expect(ehTeclaDoPing({ key: "p", code: "KeyP" })).toBe(false);
  });
});
