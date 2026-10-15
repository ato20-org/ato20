import { describe, expect, it } from "vitest";

import type { AnexoNaGaleria } from "@/lib/vault/galeria";
import type { Personagem } from "@/types/character";
import type { Item } from "@/types/inventory";
import type { AssetMeta, Scene } from "@/types/scene";

import {
  alvoDaImagem,
  filtrarGaleria,
  imagensDaGaleria,
  medidaDaImagem,
  usosDaImagem,
} from "./galeria";

const asset = (id: string, name: string, extra: Partial<AssetMeta> = {}): AssetMeta => ({
  id,
  kind: "image",
  name,
  mimeType: "image/png",
  size: 0,
  createdAt: 0,
  ...extra,
});

const anexo = (arquivo: string, extra: Partial<AnexoNaGaleria> = {}): AnexoNaGaleria => ({
  personagemId: "p1",
  personagem: "Edgar",
  arquivo,
  autor: "jogador",
  mimeType: "image/png",
  tamanho: 0,
  ...extra,
});

const acervo = [
  asset("1", "Taverna do Porto - noite.jpg", { escopo: "cena", createdAt: 30 }),
  asset("2", "Edgar.png", { escopo: "personagem", createdAt: 20 }),
  asset("3", "Salão dos Ossos.webp", { createdAt: 10 }),
  asset("4", "chuva.ogg", { kind: "audio", mimeType: "audio/ogg", createdAt: 40 }),
];

const ids = (imagens: ReturnType<typeof imagensDaGaleria>) => imagens.map((i) => i.chave);

describe("imagensDaGaleria", () => {
  it("junta acervo e anexos, da mais nova para a mais antiga, sem som", () => {
    const imagens = imagensDaGaleria(acervo, [anexo("espada.png", { modificadoEm: 25 })]);

    expect(ids(imagens)).toEqual(["asset:1", "anexo:p1/jogador/espada.png", "asset:2", "asset:3"]);
  });

  it("o mesmo nome em dois autores são duas imagens", () => {
    const imagens = imagensDaGaleria(
      [],
      [anexo("mapa.png"), anexo("mapa.png", { autor: "mestre" })],
    );

    expect(new Set(ids(imagens)).size).toBe(2);
  });
});

describe("filtrarGaleria", () => {
  const imagens = imagensDaGaleria(acervo, [anexo("Espada longa.png", { modificadoEm: 5 })]);

  it("sem busca, mostra tudo", () => {
    expect(filtrarGaleria(imagens, "   ")).toHaveLength(4);
  });

  it("acha o fundo de cena, que a árvore de Arquivos esconde", () => {
    expect(ids(filtrarGaleria(imagens, "taverna"))).toEqual(["asset:1"]);
  });

  it("acha o anexo do jogador pelo nome do arquivo", () => {
    expect(ids(filtrarGaleria(imagens, "espada"))).toEqual(["anexo:p1/jogador/Espada longa.png"]);
  });

  it("acha sem acento nem caixa", () => {
    expect(ids(filtrarGaleria(imagens, "SALAO"))).toEqual(["asset:3"]);
  });

  it("cada palavra à parte, todas no nome", () => {
    expect(ids(filtrarGaleria(imagens, "noite taverna"))).toEqual(["asset:1"]);
    expect(filtrarGaleria(imagens, "taverna ossos")).toEqual([]);
  });

  it("não acha pelo nome do personagem: a busca é do arquivo", () => {
    expect(filtrarGaleria(imagens, "edgar").map((i) => i.chave)).toEqual(["asset:2"]);
  });
});

describe("alvoDaImagem", () => {
  it("dá ao Rust o descritor, e não o caminho", () => {
    const [doAcervo, deAnexo] = imagensDaGaleria(
      [asset("a1", "x.png", { createdAt: 2 })],
      [anexo("y.png", { modificadoEm: 1 })],
    );

    expect(alvoDaImagem(doAcervo!)).toEqual({ tipo: "asset", id: "a1" });
    expect(alvoDaImagem(deAnexo!)).toEqual({
      tipo: "anexo",
      personagemId: "p1",
      autor: "jogador",
      arquivo: "y.png",
    });
  });
});

describe("medidaDaImagem", () => {
  it("só quando as duas medidas existem", () => {
    const [comMedida, semMedida] = imagensDaGaleria(
      [asset("a", "a.png", { naturalWidth: 4, naturalHeight: 3, createdAt: 2 })],
      [anexo("b.png", { largura: 4, modificadoEm: 1 })],
    );

    expect(medidaDaImagem(comMedida!)).toEqual({ largura: 4, altura: 3 });
    expect(medidaDaImagem(semMedida!)).toBeUndefined();
  });
});

describe("usosDaImagem", () => {
  const cena = (name: string, extra: Partial<Scene>): Scene =>
    ({ id: name, name, items: [], fog: [], createdAt: 0, updatedAt: 0, ...extra }) as Scene;
  const campanha = {
    cenas: [
      cena("Taverna", { backgroundAssetId: "m" }),
      cena("Floresta", { items: [{ id: "i", assetId: "m" }] as Scene["items"] }),
      cena("Vazia", {}),
    ],
    personagens: [{ id: "p1", nome: "Edgar", retrato: "m" } as Personagem],
    itens: [
      { id: "x", nome: "Mapa do tesouro", imagem: { tipo: "asset", id: "m" } } as Item,
      {
        id: "y",
        nome: "Espada",
        imagem: { tipo: "anexo", personagem: "p1", autor: "jogador", arquivo: "espada.png" },
      } as Item,
    ],
  };

  it("diz as cenas, os personagens e os itens pelo nome", () => {
    const [imagem] = imagensDaGaleria([asset("m", "mapa.png")], []);

    expect(usosDaImagem(imagem!, campanha)).toEqual({
      cenas: ["Taverna", "Floresta"],
      personagens: ["Edgar"],
      itens: ["Mapa do tesouro"],
    });
  });

  it("o anexo só pode ser foto de item, e do mesmo autor", () => {
    const [doJogador] = imagensDaGaleria([], [anexo("espada.png")]);
    const [doMestre] = imagensDaGaleria([], [anexo("espada.png", { autor: "mestre" })]);

    expect(usosDaImagem(doJogador!, campanha).itens).toEqual(["Espada"]);
    expect(usosDaImagem(doMestre!, campanha).itens).toEqual([]);
  });
});
