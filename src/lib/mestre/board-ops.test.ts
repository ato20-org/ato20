import { describe, expect, it } from "vitest";

import {
  appendScene,
  insertSceneAfter,
  moveSceneToIndex,
  removeScene,
} from "@/lib/mestre/board-ops";
import { createScene, type Board } from "@/types/scene";

const a = createScene("A");
const b = createScene("B");

const board = (): Board => ({
  scenes: [a, b],
  editingSceneId: a.id,
  liveSceneId: b.id,
  pastas: [{ id: "p1", nome: "Capítulo 1" }],
  notas: [{ id: "n1", titulo: "PNJs", arquivo: "pnjs.md" }],
});

/**
 * As pastas e as notas não são da cena: são da CAMPANHA, e moram no board ao
 * lado da lista de cenas. Toda operação daqui remonta o board, e a que
 * esquecer de levá-las apaga a árvore de Arquivos inteira -- no disco, porque
 * `ordem.json` é gravado a partir deste objeto.
 */
describe("o ciclo de vida das cenas não mexe no resto do board", () => {
  const c = createScene("C");

  it("criar uma cena mantém as pastas e as notas", () => {
    const depois = appendScene(board(), c);

    expect(depois.pastas).toEqual(board().pastas);
    expect(depois.notas).toEqual(board().notas);
    // E faz o que promete: a cena nova nasce no palco, a mesa não muda.
    expect(depois.editingSceneId).toBe(c.id);
    expect(depois.liveSceneId).toBe(b.id);
  });

  it("duplicar uma cena mantém as pastas e as notas", () => {
    const depois = insertSceneAfter(board(), a.id, c);

    expect(depois.pastas).toEqual(board().pastas);
    expect(depois.notas).toEqual(board().notas);
    expect(depois.scenes.map((scene) => scene.id)).toEqual([a.id, c.id, b.id]);
  });

  it("remover uma cena mantém as pastas e as notas", () => {
    const depois = removeScene(board(), b.id);

    expect(depois.pastas).toEqual(board().pastas);
    expect(depois.notas).toEqual(board().notas);
    // Apagar a cena no ar tira a mesa do ar.
    expect(depois.liveSceneId).toBeNull();
  });

  it("reordenar já mantinha, e continua mantendo", () => {
    const depois = moveSceneToIndex(board(), b.id, 0);

    expect(depois.pastas).toEqual(board().pastas);
    expect(depois.notas).toEqual(board().notas);
    expect(depois.scenes.map((scene) => scene.id)).toEqual([b.id, a.id]);
  });
});
