import { describe, expect, it } from "vitest";

import { dicionarios } from "@/lib/i18n/desktop";
import { presencaDe, SITE_DO_ATO20, type EntradaDaPresenca } from "@/lib/presenca";

const textos = dicionarios["pt-BR"].presenca;

type Mesa = NonNullable<EntradaDaPresenca["mesa"]>;

function mesa(parcial: Partial<Mesa> = {}): Mesa {
  return {
    campanha: "Segredo na Floresta",
    cena: "mapa",
    esguelha: false,
    lendoRegras: false,
    presentes: 0,
    total: 4,
    inicio: null,
    ...parcial,
  };
}

describe("presencaDe", () => {
  it("na porta diz só que está no menu", () => {
    const { titulo, atividade } = presencaDe({ mesa: null, mostrarCampanha: true }, textos);

    expect(titulo).toBe("ATO20 · No menu");
    expect(atividade.detalhes).toBe("No menu");
    expect(atividade.estado).toBeNull();
    expect(atividade.botao?.url).toBe(SITE_DO_ATO20);
  });

  it("sozinho, a primeira linha é o que se edita", () => {
    const quadro = presencaDe({ mesa: mesa({ cena: "quadro" }), mostrarCampanha: false }, textos);
    const fundo = presencaDe({ mesa: mesa({ cena: "fundo" }), mostrarCampanha: false }, textos);

    expect(quadro.titulo).toBe("ATO20 · Editando quadro");
    expect(quadro.atividade.detalhes).toBe("Editando quadro");
    expect(fundo.atividade.detalhes).toBe("Editando cena");
    expect(quadro.atividade.grupo).toBeNull();
    expect(quadro.atividade.inicio).toBeNull();
  });

  it("o nome da campanha só sai liberado, e nunca no título", () => {
    const fechado = presencaDe({ mesa: mesa(), mostrarCampanha: false }, textos);
    const aberto = presencaDe({ mesa: mesa(), mostrarCampanha: true }, textos);

    expect(fechado.atividade.estado).toBeNull();
    expect(aberto.atividade.estado).toBe("Segredo na Floresta");
    expect(aberto.titulo).toBe("ATO20 · Editando mapa");
  });

  it("com jogador presente vira mestrando, com grupo e cronômetro", () => {
    const { titulo, atividade } = presencaDe(
      { mesa: mesa({ presentes: 2, inicio: 1_000 }), mostrarCampanha: false },
      textos,
    );

    expect(titulo).toBe("ATO20 · Mestrando campanha");
    expect(atividade.detalhes).toBe("Mestrando campanha");
    expect(atividade.estado).toBe("No mapa");
    expect(atividade.grupo).toEqual([2, 4]);
    expect(atividade.inicio).toBe(1_000);
  });

  it("mestrando com a campanha liberada leva o nome na primeira linha", () => {
    const { titulo, atividade } = presencaDe(
      { mesa: mesa({ presentes: 1 }), mostrarCampanha: true },
      textos,
    );

    expect(atividade.detalhes).toBe("Mestrando Segredo na Floresta");
    expect(titulo).toBe("ATO20 · Mestrando campanha");
  });

  it("o total nunca fica abaixo dos presentes", () => {
    const { atividade } = presencaDe(
      { mesa: mesa({ presentes: 3, total: 1 }), mostrarCampanha: false },
      textos,
    );

    expect(atividade.grupo).toEqual([3, 3]);
  });

  it("o livro vence a esguelha, e a esguelha vence o mapa", () => {
    const lendo = presencaDe(
      { mesa: mesa({ esguelha: true, lendoRegras: true }), mostrarCampanha: false },
      textos,
    );
    const esguelha = presencaDe({ mesa: mesa({ esguelha: true }), mostrarCampanha: false }, textos);

    expect(lendo.atividade.detalhes).toBe("Lendo as regras");
    expect(esguelha.atividade.detalhes).toBe("Mesa 2.5D");
  });

  it("sem cena nenhuma, preparando; mestrando fica sem segunda linha", () => {
    const sozinho = presencaDe({ mesa: mesa({ cena: null }), mostrarCampanha: false }, textos);
    const comMesa = presencaDe(
      { mesa: mesa({ cena: null, presentes: 1 }), mostrarCampanha: false },
      textos,
    );

    expect(sozinho.atividade.detalhes).toBe("Preparando campanha");
    expect(comMesa.atividade.estado).toBeNull();
  });

  it("nome de campanha em branco não vira segunda linha", () => {
    const { atividade } = presencaDe(
      { mesa: mesa({ campanha: "   " }), mostrarCampanha: true },
      textos,
    );

    expect(atividade.estado).toBeNull();
  });
});
