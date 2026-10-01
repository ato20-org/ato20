import { describe, expect, it } from "vitest";

import {
  aplicarNoFio,
  avisoDoSussurro,
  continuaAnterior,
  FIO_VAZIO,
  gravadoDoValor,
  LINHAS_NA_TELA,
  parseDoChat,
  recomecarFio,
  textoDaRolagem,
  totalDaRolagem,
} from "./fio";
import type { RegistroDoFio } from "@/types/fio";

function fala(id: string, texto = `frase ${id}`): RegistroDoFio {
  return { tipo: "linha", id, quando: 1, autor: { tipo: "mestre" }, texto };
}

describe("aplicarNoFio", () => {
  it("o replay só aparece no pronto, e a reconexão não duplica", () => {
    let estado = aplicarNoFio(FIO_VAZIO, fala("a"));
    expect(estado.linhas).toHaveLength(0);

    estado = aplicarNoFio(estado, { tipo: "pronto" });
    expect(estado.linhas.map((linha) => linha.id)).toEqual(["a"]);

    // O que chega depois do pronto entra direto.
    estado = aplicarNoFio(estado, fala("b"));
    expect(estado.linhas.map((linha) => linha.id)).toEqual(["a", "b"]);

    // Reentrega da mesma linha não mexe em nada.
    expect(aplicarNoFio(estado, fala("b"))).toBe(estado);
  });

  it("na reconexão a lista antiga fica até o replay novo a substituir", () => {
    let estado = aplicarNoFio(aplicarNoFio(FIO_VAZIO, fala("a")), fala("b"));
    estado = aplicarNoFio(estado, { tipo: "pronto" });

    estado = recomecarFio(estado);
    // O Mestre apagou "a" enquanto o celular estava fora: o replay não traz.
    estado = aplicarNoFio(estado, fala("b"));
    estado = aplicarNoFio(estado, fala("c"));
    expect(estado.linhas.map((linha) => linha.id)).toEqual(["a", "b"]);

    estado = aplicarNoFio(estado, { tipo: "pronto" });
    expect(estado.linhas.map((linha) => linha.id)).toEqual(["b", "c"]);
  });

  it("a lápide tira a linha, e a lápide de linha ausente não mexe em nada", () => {
    let estado = aplicarNoFio(aplicarNoFio(FIO_VAZIO, fala("a")), fala("b"));
    estado = aplicarNoFio(estado, { tipo: "pronto" });

    const sem = aplicarNoFio(estado, { tipo: "apagada", alvo: "a", quando: 2 });
    expect(sem.linhas.map((linha) => linha.id)).toEqual(["b"]);

    expect(aplicarNoFio(sem, { tipo: "apagada", alvo: "x", quando: 3 })).toBe(sem);
  });

  it("guarda a linha sem o envelope", () => {
    const estado = aplicarNoFio(aplicarNoFio(FIO_VAZIO, fala("a")), { tipo: "pronto" });

    expect(estado.linhas[0]).not.toHaveProperty("tipo");
  });

  it("a tela não passa do teto, e quem sai é a mais velha", () => {
    let estado = aplicarNoFio(FIO_VAZIO, { tipo: "pronto" });
    for (let i = 0; i <= LINHAS_NA_TELA; i++) estado = aplicarNoFio(estado, fala(String(i)));

    expect(estado.linhas).toHaveLength(LINHAS_NA_TELA);
    expect(estado.linhas[0].id).toBe("1");
  });
});

describe("a rolagem no fio", () => {
  it("lê o d10 no zero como dez, e soma o modificador", () => {
    const rolagem = { dados: [{ faces: 10 as const, valor: 0 }], modificador: 3, rotulo: "Dano" };

    expect(totalDaRolagem(rolagem)).toBe(13);
    expect(textoDaRolagem(rolagem)).toBe("Dano: 1d10+3 = 13");
  });

  it("um dado sozinho escreve o resultado dele, e a moeda lê a face", () => {
    expect(textoDaRolagem({ dados: [{ faces: 20, valor: 17 }] })).toBe("1d20 = 17");
    expect(textoDaRolagem({ dados: [{ faces: 2, valor: 1 }] })).toBe("Moeda = Cara");
  });

  it("junta os dados iguais na notação", () => {
    const rolagem = {
      dados: [
        { faces: 6 as const, valor: 2 },
        { faces: 6 as const, valor: 5 },
        { faces: 4 as const, valor: 1 },
      ],
      modificador: -1,
    };

    expect(textoDaRolagem(rolagem)).toBe("2d6+1d4-1 = 7");
  });

  it("a moeda não entra na soma", () => {
    expect(totalDaRolagem({ dados: [{ faces: 2, valor: 2 }] })).toBeNull();
  });

  it("o valor de soma do plugin volta a ser gravado", () => {
    expect(gravadoDoValor(10, 10)).toBe(0);
    expect(gravadoDoValor(10, 7)).toBe(7);
    expect(gravadoDoValor(100, 0)).toBe(0);
  });
});

describe("o sussurro e a fala", () => {
  const bia = { tipo: "jogador" as const, id: "bia", nome: "Bia" };

  it("o aviso muda com quem lê", () => {
    const aBia = { id: "1", quando: 0, autor: { tipo: "mestre" as const }, para: bia, texto: "x" };

    expect(avisoDoSussurro(aBia, { tipo: "jogador", id: "bia" })).toBe("só para você");
    expect(avisoDoSussurro(aBia, { tipo: "mestre" })).toBe("para Bia");

    const aoMestre = { ...aBia, para: { tipo: "mestre" as const } };
    expect(avisoDoSussurro(aoMestre, { tipo: "jogador", id: "bia" })).toBe("só o Mestre");

    const aberta = { ...aBia, para: undefined };
    expect(avisoDoSussurro(aberta, { tipo: "mestre" })).toBeNull();
  });

  it("a mesma pessoa em seguida divide o cabeçalho, e o sussurro não junta com a aberta", () => {
    const a = { id: "1", quando: 0, autor: bia, texto: "a" };
    const b = { id: "2", quando: 60_000, autor: bia, texto: "b" };

    expect(continuaAnterior(b, a)).toBe(true);
    expect(continuaAnterior(b, undefined)).toBe(false);
    expect(continuaAnterior({ ...b, quando: 10 * 60_000 }, a)).toBe(false);
    expect(continuaAnterior({ ...b, para: { tipo: "mestre" } }, a)).toBe(false);
    expect(continuaAnterior({ ...b, autor: { tipo: "mestre" } }, a)).toBe(false);
  });
});

describe("a menção no chat", () => {
  it("marca o personagem, com aspas para nome composto, e deixa o resto texto", () => {
    expect(parseDoChat('@Thalor e @"Chapéu-de-Sapo" vão na frente')).toEqual([
      { tipo: "personagem", valor: "Thalor", bruto: "@Thalor" },
      { tipo: "texto", valor: " e " },
      { tipo: "personagem", valor: "Chapéu-de-Sapo", bruto: '@"Chapéu-de-Sapo"' },
      { tipo: "texto", valor: " vão na frente" },
    ]);
  });

  it("não marca e-mail nem arquivo e nota, que o chat não tem", () => {
    expect(parseDoChat("manda para ana@casa.com /mapa #porão")).toEqual([
      { tipo: "texto", valor: "manda para ana@casa.com /mapa #porão" },
    ]);
  });
});
