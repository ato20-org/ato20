import { describe, expect, it } from "vitest";

import type { Condicao } from "@/types/character";

import {
  condicoesVisiveis,
  efeitosDaCena,
  efeitosDaFigura,
  faseDaFigura,
  temCondicao,
} from "./condicao";

function condicao(extra: Partial<Condicao> = {}): Condicao {
  return {
    id: "c1",
    nome: "Envenenado",
    cor: "#22c55e",
    icone: "frasco",
    efeito: "tingido",
    escondido: false,
    ...extra,
  };
}

describe("condicoesVisiveis", () => {
  it("tira as escondidas e mantém a ordem", () => {
    const lista = [
      condicao({ id: "a" }),
      condicao({ id: "b", escondido: true }),
      condicao({ id: "c" }),
    ];

    expect(condicoesVisiveis(lista).map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("lê a ausência como lista vazia", () => {
    expect(condicoesVisiveis(undefined)).toEqual([]);
  });
});

describe("efeitosDaFigura", () => {
  it("vale só o último efeito da lista", () => {
    // Veneno, fogo e medo empilhados seriam uma bagunça. Fica o último a
    // entrar -- as condições novas vão para o fim da ficha.
    const efeitos = efeitosDaFigura([
      condicao({ id: "veneno", cor: "#22c55e", efeito: "tingido" }),
      condicao({ id: "medo", cor: "#a855f7", efeito: "tremendo" }),
      condicao({ id: "caido", cor: "#ef4444", efeito: undefined }),
    ]);

    expect(efeitos).toEqual([{ efeito: "tremendo", cor: "#a855f7" }]);
  });

  it("nunca desenha o efeito de uma condição escondida", () => {
    // Nem no palco do Mestre: a figura tingida lá diria que a mesa está vendo.
    expect(efeitosDaFigura([condicao({ escondido: true })])).toEqual([]);
  });

  it("a escondida não tampa o efeito de quem veio antes", () => {
    // Trocar o verde pelo nada contaria que há um segredo por cima.
    const efeitos = efeitosDaFigura([
      condicao({ id: "veneno" }),
      condicao({ id: "maldicao", efeito: "aura", escondido: true }),
    ]);

    expect(efeitos).toEqual([{ efeito: "tingido", cor: "#22c55e" }]);
  });

  it("condição sem efeito é só o selo", () => {
    expect(efeitosDaFigura([condicao({ efeito: undefined })])).toEqual([]);
  });

  it("o efeito que esta tela não conhece vence do mesmo jeito", () => {
    // O catálogo é de quem desenha. Escolher outro aqui faria a TV e o Mestre
    // mostrarem efeitos diferentes para a mesma ficha.
    const efeitos = efeitosDaFigura([
      condicao({ id: "veneno" }),
      condicao({ id: "sangue", cor: "#ef4444", efeito: "ordem-paranormal/sangue" }),
    ]);

    expect(efeitos).toEqual([{ efeito: "ordem-paranormal/sangue", cor: "#ef4444" }]);
  });
});

describe("efeitosDaCena", () => {
  it("só entra quem tem token na cena e algum efeito", () => {
    const personagens = [
      { id: "goblin", condicoes: [condicao()] },
      { id: "edgar", condicoes: [condicao({ efeito: undefined })] },
      { id: "fora", condicoes: [condicao()] },
    ];
    const itens = [
      { personagemId: "goblin" },
      // A horda: dois tokens do mesmo personagem dão uma entrada só.
      { personagemId: "goblin" },
      { personagemId: "edgar" },
      {},
    ];

    expect(efeitosDaCena(itens, personagens)).toEqual([
      { personagemId: "goblin", efeitos: [{ efeito: "tingido", cor: "#22c55e" }] },
    ]);
  });
});

describe("temCondicao", () => {
  it("compara pelo nome, sem caixa e sem espaço nas pontas", () => {
    // A mesma conta do Rust. Divergir faria o menu marcar o que o disco não
    // reconhece.
    expect(temCondicao([condicao({ nome: "  envenenado " })], "Envenenado")).toBe(true);
    expect(temCondicao([condicao()], "Caído")).toBe(false);
  });
});

describe("faseDaFigura", () => {
  it("é negativa, cabe no período e muda de figura para figura", () => {
    const a = parseFloat(faseDaFigura("goblin-1", 2));
    const b = parseFloat(faseDaFigura("goblin-2", 2));

    expect(a).toBeLessThanOrEqual(0);
    expect(a).toBeGreaterThan(-2);
    expect(a).not.toBe(b);
    expect(faseDaFigura("goblin-1", 2)).toBe(faseDaFigura("goblin-1", 2));
  });
});
