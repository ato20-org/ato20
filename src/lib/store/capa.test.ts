import { describe, expect, it } from "vitest";

import { selectCapa, selectCenaParaMesa, soConteudo } from "@/lib/store/use-scene-store";
import { cloneScene, createScene, type Board, type Scene } from "@/types/scene";

/** O mínimo que os seletores leem: eles só olham o board. */
const store = (board: Board) => ({ board }) as Parameters<typeof selectCapa>[0];

const board = (scenes: Scene[], liveSceneId: string | null = null): Board => ({
  scenes,
  editingSceneId: null,
  liveSceneId,
});

describe("a capa da campanha", () => {
  it("sobe para a mesa quando não há nada no ar", () => {
    const mapa = createScene("Porão");
    const capa = { ...createScene("Taverna", "fundo"), capa: true } as Scene;

    expect(selectCenaParaMesa(store(board([mapa, capa])))?.id).toBe(capa.id);
    expect(selectCapa(store(board([mapa, capa])))?.id).toBe(capa.id);
  });

  it("some assim que o mestre põe uma cena no ar", () => {
    const mapa = createScene("Porão");
    const capa = { ...createScene("Taverna", "fundo"), capa: true } as Scene;

    expect(selectCenaParaMesa(store(board([mapa, capa], mapa.id)))?.id).toBe(mapa.id);
  });

  it("deixa a mesa sem nada quando nenhuma cena foi marcada", () => {
    expect(selectCenaParaMesa(store(board([createScene("Porão")])))).toBeNull();
  });

  it("não se copia junto com a cena: duas capas não existem", () => {
    const capa = { ...createScene("Taverna", "fundo"), capa: true } as Scene;

    expect(cloneScene(capa, "Taverna (cópia)").capa).toBeUndefined();
  });

  it("sobrevive ao desfazer, que é só do conteúdo da cena", () => {
    const antes = createScene("Taverna", "fundo");
    const agora = { ...antes, capa: true } as Scene;

    const volta = soConteudo(board([agora]), board([antes]));

    expect(volta.scenes[0]!.capa).toBe(true);
  });

  it("e o desfazer também não ressuscita uma capa já tirada", () => {
    const antes = { ...createScene("Taverna", "fundo"), capa: true } as Scene;
    const agora = { ...antes };
    delete agora.capa;

    const volta = soConteudo(board([agora]), board([antes]));

    expect(volta.scenes[0]!.capa).toBeUndefined();
  });
});
