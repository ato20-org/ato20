import { describe, expect, it } from "vitest";

import {
  comAAparencia,
  comAsAparenciasAtivas,
  soConteudo,
} from "@/lib/store/use-scene-store";
import type { Board, CanvasItem, Scene } from "@/types/scene";

const item = (id: string, assetId: string, personagemId?: string): CanvasItem =>
  ({ id, assetId, personagemId }) as unknown as CanvasItem;

const cena = (id: string, items: CanvasItem[]): Scene =>
  ({ id, name: id, items, fog: [] }) as unknown as Scene;

const board = (scenes: Scene[]): Board =>
  ({
    scenes,
    editingSceneId: scenes[0]?.id ?? null,
    liveSceneId: null,
  }) as unknown as Board;

describe("comAAparencia", () => {
  it("troca a imagem dos tokens daquele personagem em TODAS as cenas", () => {
    const antes = board([
      cena("taverna", [
        item("t1", "cara-velha", "edgar"),
        item("t2", "barril"),
        item("t3", "cara-velha", "mira"),
      ]),
      cena("porao", [item("p1", "cara-velha", "edgar")]),
    ]);

    const depois = comAAparencia(antes, "edgar", "cara-ferida");

    expect(depois.scenes[0]!.items[0]!.assetId).toBe("cara-ferida");
    expect(depois.scenes[1]!.items[0]!.assetId).toBe("cara-ferida");
    // Móvel sem dono e token de outro personagem não são tocados.
    expect(depois.scenes[0]!.items[1]!.assetId).toBe("barril");
    expect(depois.scenes[0]!.items[2]!.assetId).toBe("cara-velha");
  });

  it("devolve a MESMA referência quando não há o que trocar", () => {
    const antes = board([cena("taverna", [item("t1", "barril")])]);

    // Referência igual é o sinal de "não grave": um board novo idêntico
    // acordaria o `subscribe` e escreveria o disco por nada.
    expect(comAAparencia(antes, "edgar", "cara-ferida")).toBe(antes);
    // Já está com a imagem certa.
    const posto = board([cena("taverna", [item("t1", "cara-ferida", "edgar")])]);
    expect(comAAparencia(posto, "edgar", "cara-ferida")).toBe(posto);
  });

  it("aparência sem miniatura não apaga o token", () => {
    const antes = board([cena("taverna", [item("t1", "cara-velha", "edgar")])]);

    // Escolher uma linha ainda em branco faria o personagem sumir do mapa, e o
    // mestre não pediu isso -- pediu para trocar a cara.
    expect(comAAparencia(antes, "edgar", undefined)).toBe(antes);
  });
});

describe("comAsAparenciasAtivas", () => {
  /**
   * O desfazer é a razão de esta função existir.
   *
   * A troca de aparência fica fora do histórico, mas o histórico guarda cenas
   * INTEIRAS: um Ctrl+Z de um gesto ANTERIOR à troca restaura `scene.items` de
   * um retrato em que o token ainda tinha a imagem velha. Sem a reconciliação,
   * "fora do histórico" valeria só até o primeiro desfazer -- a ficha diria
   * "Ferido" e o mapa mostraria a cara de antes.
   */
  it("repõe a cara ativa depois de um desfazer restaurar a cena antiga", () => {
    const passo = board([
      cena("taverna", [item("t1", "cara-velha", "edgar"), item("t2", "barril")]),
    ]);
    const agora = board([
      cena("taverna", [
        item("t1", "cara-ferida", "edgar"),
        item("t2", "barril"),
        item("t3", "mesa"),
      ]),
    ]);

    const restaurado = soConteudo(agora, passo);
    // O desfazer sozinho traz a imagem velha de volta.
    expect(restaurado.scenes[0]!.items[0]!.assetId).toBe("cara-velha");

    const emDia = comAsAparenciasAtivas(restaurado, [
      { id: "edgar", miniatura: "cara-ferida" },
    ]);

    expect(emDia.scenes[0]!.items[0]!.assetId).toBe("cara-ferida");
    // O resto do desfazer continua desfeito: o item que nasceu depois do passo
    // não voltou.
    expect(emDia.scenes[0]!.items).toHaveLength(2);
  });

  it("personagem sem miniatura não mexe em nada", () => {
    const antes = board([cena("taverna", [item("t1", "cara-velha", "edgar")])]);

    expect(comAsAparenciasAtivas(antes, [{ id: "edgar" }])).toBe(antes);
  });
});
