import { describe, expect, it } from "vitest";

import type { FichaPdfDeclarada } from "@/lib/extensoes/manifesto";
import {
  type CamposDoPdf,
  type FichaCandidata,
  fichasQueReconhecem,
  numeroDoTexto,
  traduzirFicha,
} from "@/lib/fichas-pdf/traduzir";

/**
 * Campos escritos à mão, com os nomes que as fichas de verdade usam. Nenhum
 * PDF entra aqui: o leitor é o pdf.js, e o que se testa é o que vem depois.
 */
const T20: CamposDoPdf = new Map<string, string | boolean>([
  ["NOME DO PERSONAGEM", "  Lyra Vento-Frio "],
  ["CLASSE", "Arcanista"],
  ["Lv", "3"],
  ["For", "-1"],
  ["ModFor", "0"],
  ["Int", "+4"],
  ["Car", ""],
  ["PVs Totais", "18"],
  ["PVs Atuais", "11"],
  ["PMs Totais", "12"],
  ["PMs Atuais", ""],
  ["Dado de Vida", "1d8"],
  ["Habilidade 1", "Magia"],
  ["Habilidade 1 Desc", "Lança magias arcanas.\r\nPrecisa de um foco."],
  ["arm pesa", true],
  ["POD1", true],
  ["POD2", true],
  ["POD3", false],
]);

const FICHA_T20: FichaPdfDeclarada = {
  id: "jogo-do-ano",
  titulo: "Tormenta20",
  reconhecer: ["NOME DO PERSONAGEM", "ModFor", "PMs Totais"],
  nome: "NOME DO PERSONAGEM",
  atributos: [
    { sigla: "FOR", campo: "For" },
    { sigla: "INT", campo: "Int" },
    { sigla: "CAR", campo: "Car" },
    { sigla: "POD", campo: { caixas: ["POD1", "POD2", "POD3"] } },
  ],
  medidores: [
    { nome: "PV", atual: "PVs Atuais", maximo: "PVs Totais", cor: "#ef4444" },
    { nome: "PM", atual: "PMs Atuais", maximo: "PMs Totais" },
    { nome: "SAN", maximo: "Sanidade" },
  ],
  detalhes: [
    { grupo: "Identidade", rotulo: "Classe", campo: "CLASSE" },
    { grupo: "Identidade", rotulo: "Nível", campo: "Lv", tipo: "numero" },
    { grupo: "Identidade", rotulo: "Divindade", campo: "DIVINDADE" },
    { grupo: "Poderes", rotulo: "Habilidade", campo: "Habilidade 1", descricao: "Habilidade 1 Desc" },
    { grupo: "Combate", rotulo: "Armadura pesada", campo: "arm pesa", tipo: "numero" },
  ],
};

const candidata = (extensaoId: string, ficha: FichaPdfDeclarada): FichaCandidata => ({
  extensaoId,
  extensaoNome: extensaoId,
  ficha,
});

describe("fichasQueReconhecem", () => {
  it("exige todos os campos do reconhecer", () => {
    const ordem = candidata("ordem", { ...FICHA_T20, id: "agente", reconhecer: ["untitled1", "untitled2"] });
    const achadas = fichasQueReconhecem(T20, [ordem, candidata("t20", FICHA_T20)]);

    expect(achadas.map((achada) => achada.extensaoId)).toEqual(["t20"]);
  });

  it("põe a mais específica primeiro", () => {
    const nucleo = candidata("livro", { ...FICHA_T20, reconhecer: ["ModFor"] });
    const fa = candidata("fa", { ...FICHA_T20, reconhecer: ["ModFor", "PMs Totais"] });

    expect(fichasQueReconhecem(T20, [nucleo, fa]).map((achada) => achada.extensaoId)).toEqual([
      "fa",
      "livro",
    ]);
  });
});

describe("traduzirFicha", () => {
  const importada = traduzirFicha(FICHA_T20, T20);

  it("lê o nome aparado", () => {
    expect(importada.nome).toBe("Lyra Vento-Frio");
  });

  it("lê os atributos, com sinal e contando caixas", () => {
    expect(importada.atributos).toEqual([
      { sigla: "FOR", valor: -1 },
      { sigla: "INT", valor: 4 },
      { sigla: "POD", valor: 2 },
    ]);
  });

  it("enche o medidor quando o atual está em branco", () => {
    expect(importada.medidores).toEqual([
      { nome: "PV", atual: 11, maximo: 18, cor: "#ef4444" },
      { nome: "PM", atual: 12, maximo: 12, cor: null },
    ]);
  });

  it("lê detalhe de texto, de número e com descrição", () => {
    expect(importada.detalhes).toEqual([
      { grupo: "Identidade", rotulo: "Classe", tipo: "texto", valor: "Arcanista" },
      { grupo: "Identidade", rotulo: "Nível", tipo: "numero", valor: 3 },
      {
        grupo: "Poderes",
        rotulo: "Habilidade",
        tipo: "texto",
        valor: "Magia",
        descricao: "Lança magias arcanas.\nPrecisa de um foco.",
      },
      { grupo: "Combate", rotulo: "Armadura pesada", tipo: "numero", valor: 1 },
    ]);
  });

  it("diz o que veio vazio ou não existe no PDF", () => {
    expect(importada.vazios).toEqual(["CAR", "SAN", "Divindade"]);
  });

  it("manda o texto longo demais para a descrição", () => {
    const longo = "a".repeat(81);
    const campos = new Map([...T20, ["CLASSE", longo]]);
    const classe = traduzirFicha(FICHA_T20, campos).detalhes[0];

    expect(classe).toEqual({ grupo: "Identidade", rotulo: "Classe", tipo: "texto", descricao: longo });
  });

  it("ficha em branco tem nome vazio", () => {
    const campos = new Map([...T20, ["NOME DO PERSONAGEM", "   "]]);

    expect(traduzirFicha(FICHA_T20, campos).nome).toBe("");
  });

  it("junta linhas: o valor numa linha só, a descrição uma por linha", () => {
    const campos = new Map<string, string | boolean>([
      ["n", "Lyra"],
      ["teste", "+5"],
      ["dano", ""],
      ["alcance", "curto"],
      ["hist1", "Nasceu em Valkaria."],
      ["hist2", ""],
      ["hist3", "Fugiu da Academia."],
    ]);
    const ficha: FichaPdfDeclarada = {
      ...FICHA_T20,
      atributos: [],
      medidores: [],
      detalhes: [
        { grupo: "Combate", rotulo: "Ataque", campo: { juntar: ["teste", "dano", "alcance"] } },
        { grupo: "Descrição", rotulo: "Histórico", descricao: { juntar: ["hist1", "hist2", "hist3"] } },
        { grupo: "Combate", rotulo: "Bônus", campo: { juntar: ["dano", "teste"] }, tipo: "numero" },
      ],
    };

    expect(traduzirFicha(ficha, campos).detalhes).toEqual([
      { grupo: "Combate", rotulo: "Ataque", tipo: "texto", valor: "+5 · curto" },
      {
        grupo: "Descrição",
        rotulo: "Histórico",
        tipo: "texto",
        descricao: "Nasceu em Valkaria.\nFugiu da Academia.",
      },
      { grupo: "Combate", rotulo: "Bônus", tipo: "numero", valor: 5 },
    ]);
  });

  it("lista vira um detalhe por linha usada, com o rótulo do jogador", () => {
    const campos = new Map<string, string | boolean>([
      ["h1", " Golpe   Pesado "],
      ["c1", "2 PE"],
      ["d1", "Mais dano."],
      ["h2", ""],
      ["c2", "1 PE"],
      ["h3", "Golpe Pesado"],
      ["h4", "Ocultista"],
    ]);
    const ficha: FichaPdfDeclarada = {
      ...FICHA_T20,
      atributos: [],
      medidores: [],
      detalhes: [],
      listas: [
        {
          grupo: "Habilidades",
          itens: [
            { nome: "h1", campo: "c1", descricao: "d1" },
            { nome: "h2", campo: "c2" },
            { nome: "h3", campo: "c1" },
            { nome: "h4" },
          ],
        },
      ],
    };
    const importada = traduzirFicha(ficha, campos);

    expect(importada.detalhes).toEqual([
      { grupo: "Habilidades", rotulo: "Golpe Pesado", tipo: "texto", valor: "2 PE", descricao: "Mais dano." },
      { grupo: "Habilidades", rotulo: "Ocultista", tipo: "texto" },
    ]);
    expect(importada.vazios).toEqual([]);
  });

  it("caixas que o PDF não tem são vazio, e não zero", () => {
    const ficha = { ...FICHA_T20, atributos: [{ sigla: "DES", campo: { caixas: ["DES1", "DES2"] } }] };

    expect(traduzirFicha(ficha, T20).vazios).toContain("DES");
  });
});

describe("numeroDoTexto", () => {
  it.each([
    ["10", 10],
    ["+2", 2],
    ["-1", -1],
    ["−3", -3],
    [" 12/15 ", 12],
    ["+ 4", 4],
    ["18 (+4)", 18],
  ])("%s é %d", (texto, numero) => {
    expect(numeroDoTexto(texto)).toBe(numero);
  });

  it.each(["", "d8", "1d8", "12D6", "dez"])("%s não é número", (texto) => {
    expect(numeroDoTexto(texto)).toBeNull();
  });
});
