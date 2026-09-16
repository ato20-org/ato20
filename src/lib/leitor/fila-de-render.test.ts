import { describe, expect, it } from "vitest";

import { criarFila } from "./fila-de-render";

/** Uma promessa que so termina quando o teste manda. */
function porta() {
  let abrir: () => void = () => undefined;
  let fechar: (motivo: unknown) => void = () => undefined;
  const promessa = new Promise<void>((pronto, falhou) => {
    abrir = pronto;
    fechar = falhou;
  });

  return { promessa, abrir, fechar };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("fila de render", () => {
  it("sai pela prioridade, e nao pela chegada", async () => {
    const fila = criarFila(1);
    const saiu: string[] = [];
    const primeira = porta();

    // A primeira ocupa o worker; as outras chegam enquanto ele esta preso.
    fila.pedir("a", 5, () => primeira.promessa);
    fila.pedir("b", 3, async () => void saiu.push("b"));
    fila.pedir("c", 0, async () => void saiu.push("c"));
    fila.pedir("d", 3, async () => void saiu.push("d"));

    expect(fila.emVoo()).toBe(1);
    expect(fila.esperando()).toBe(3);

    primeira.abrir();
    await tick();
    await tick();

    // Zero primeiro; empate entre 3 e 3 pela chegada.
    expect(saiu).toEqual(["c", "b", "d"]);
    expect(fila.esperando()).toBe(0);
  });

  it("cancelar antes de comecar tira da fila; depois, so espera terminar", async () => {
    const fila = criarFila(1);
    const primeira = porta();
    let rodou = false;

    const cancelarPrimeira = fila.pedir("a", 0, () => primeira.promessa);
    const cancelarSegunda = fila.pedir("b", 1, async () => {
      rodou = true;
    });

    cancelarSegunda();
    expect(fila.esperando()).toBe(0);

    // A primeira ja esta em voo: cancelar aqui nao a interrompe -- isso e
    // trabalho da RenderTask -- e nao muda a contagem.
    cancelarPrimeira();
    expect(fila.emVoo()).toBe(1);

    primeira.abrir();
    await tick();

    expect(rodou).toBe(false);
    expect(fila.emVoo()).toBe(0);
  });

  it("rejeicao nao trava a fila", async () => {
    const fila = criarFila(1);
    const saiu: string[] = [];

    fila.pedir("a", 0, () => Promise.reject(new Error("RenderingCancelledException")));
    fila.pedir("b", 1, async () => void saiu.push("b"));

    await tick();
    await tick();

    expect(saiu).toEqual(["b"]);
    expect(fila.emVoo()).toBe(0);
  });

  it("repriorizar muda quem espera, nao quem ja saiu", async () => {
    const fila = criarFila(1);
    const saiu: string[] = [];
    const primeira = porta();

    fila.pedir("a", 0, () => primeira.promessa);
    fila.pedir("b", 1, async () => void saiu.push("b"));
    fila.pedir("c", 9, async () => void saiu.push("c"));

    // A pagina lida mudou: "c" passou a ser a mais proxima.
    fila.repriorizar("c", 0);
    fila.repriorizar("a", 99);

    primeira.abrir();
    await tick();
    await tick();

    expect(saiu).toEqual(["c", "b"]);
  });

  it("respeita a concorrencia", () => {
    const fila = criarFila(2);
    const a = porta();
    const b = porta();

    fila.pedir("a", 0, () => a.promessa);
    fila.pedir("b", 0, () => b.promessa);
    fila.pedir("c", 0, async () => undefined);

    expect(fila.emVoo()).toBe(2);
    expect(fila.esperando()).toBe(1);
  });
});
