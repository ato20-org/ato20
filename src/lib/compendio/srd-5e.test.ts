import { describe, expect, it } from "vitest";
import { MONSTROS_SRD_5E, monstroParaPersonagem, obterMonstroPorSlug } from "./srd-5e";

describe("Compêndio SRD 5.1 & Conversor de Personagem", () => {
  it("contém lista básica de monstros com atributos e ações válidas", () => {
    expect(MONSTROS_SRD_5E.length).toBeGreaterThanOrEqual(8);

    const goblin = MONSTROS_SRD_5E.find((m) => m.slug === "goblin")!;
    expect(goblin).toBeDefined();
    expect(goblin.hp).toBe(7);
    expect(goblin.ac).toBe(15);
    expect(goblin.abilities.dex).toBe(14);
    expect(goblin.actions).toHaveLength(2);

    const dragao = MONSTROS_SRD_5E.find((m) => m.slug === "dragao-vermelho-jovem")!;
    expect(dragao).toBeDefined();
    expect(dragao.hp).toBe(178);
    expect(dragao.ac).toBe(18);
  });

  it("converte SrdCreature para ficha de Personagem do ATO20 com PV e Atributos", () => {
    const ogro = MONSTROS_SRD_5E.find((m) => m.slug === "ogro")!;
    const personagem = monstroParaPersonagem(ogro, "ogro-id-1");

    expect(personagem.id).toBe("ogro-id-1");
    expect(personagem.nome).toBe("Ogro");

    // Medidor de PV
    expect(personagem.medidores).toHaveLength(1);
    const pv = personagem.medidores![0]!;
    expect(pv.nome).toBe("PV");
    expect(pv.atual).toBe(59);
    expect(pv.maximo).toBe(59);
    expect(pv.estilo).toBe("barra");

    // Atributos CA, FOR, DES, CON, INT, SAB, CAR
    expect(personagem.atributos).toHaveLength(7);
    const ca = personagem.atributos!.find((a) => a.sigla === "CA")!;
    expect(ca.valor).toBe(11);

    const forca = personagem.atributos!.find((a) => a.sigla === "FOR")!;
    expect(forca.valor).toBe(19);

    const destreza = personagem.atributos!.find((a) => a.sigla === "DES")!;
    expect(destreza.valor).toBe(8);
  });

  it("busca monstros por slug corretamente", () => {
    const esqueleto = obterMonstroPorSlug("esqueleto");
    expect(esqueleto).toBeDefined();
    expect(esqueleto?.name).toBe("Esqueleto");

    const inexistente = obterMonstroPorSlug("beholder");
    expect(inexistente).toBeUndefined();
  });
});

