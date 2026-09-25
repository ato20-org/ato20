import { describe, expect, it } from "vitest";

import { donosPorPersonagem } from "./vinculos";
import type { Player } from "@/lib/vault/players";

function jogador(id: string, nome: string): Player {
  return { id, nome, entrouEm: 0, vistoEm: 0 };
}

describe("donosPorPersonagem", () => {
  it("devolve o nome de quem joga cada personagem", () => {
    const donos = donosPorPersonagem(
      [
        ["j1", "edgar"],
        ["j2", "mirna"],
      ],
      [jogador("j1", "Ana"), jogador("j2", "Bia")],
    );

    expect(donos.get("edgar")).toEqual(["Ana"]);
    expect(donos.get("mirna")).toEqual(["Bia"]);
  });

  it("junta os dois nomes quando duas pessoas jogam o mesmo personagem", () => {
    const donos = donosPorPersonagem(
      [
        ["j1", "edgar"],
        ["j2", "edgar"],
      ],
      [jogador("j1", "Ana"), jogador("j2", "Bia")],
    );

    expect(donos.get("edgar")).toEqual(["Ana", "Bia"]);
  });

  it("descarta o vínculo do jogador que saiu da mesa", () => {
    // O caso que trouxe este módulo: o mestre removeu o jogador e o vínculo
    // ficou no banco. O personagem é do mestre agora, e tem de sair da conta
    // inteiro -- nem dono, nem contorno azul.
    const donos = donosPorPersonagem([["fantasma", "bruno"]], [jogador("j1", "Ana")]);

    expect(donos.has("bruno")).toBe(false);
    expect(donos.size).toBe(0);
  });

  it("mantém o personagem quando um dos dois donos saiu", () => {
    const donos = donosPorPersonagem(
      [
        ["fantasma", "edgar"],
        ["j1", "edgar"],
      ],
      [jogador("j1", "Ana")],
    );

    expect(donos.get("edgar")).toEqual(["Ana"]);
  });

  it("mesa vazia não deixa dono nenhum de pé", () => {
    const donos = donosPorPersonagem([["j1", "edgar"]], []);

    expect(donos.size).toBe(0);
  });
});
