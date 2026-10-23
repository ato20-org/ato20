import { describe, expect, it } from "vitest";

import {
  doNumpad,
  rotuloDaTecla,
  soModificador,
  teclaDoEvento,
} from "@/lib/mestre/tecla-de-som";

const sem = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };

describe("teclaDoEvento", () => {
  it("letra, número da fileira de cima e F1 a F12 servem", () => {
    expect(teclaDoEvento({ ...sem, code: "KeyQ" })).toBe("KeyQ");
    expect(teclaDoEvento({ ...sem, code: "Digit7" })).toBe("Digit7");
    expect(teclaDoEvento({ ...sem, code: "F1" })).toBe("F1");
    expect(teclaDoEvento({ ...sem, code: "F12" })).toBe("F12");
  });

  it("os modificadores entram na frente, sempre na mesma ordem", () => {
    const tudo = { ctrlKey: true, metaKey: false, altKey: true, shiftKey: true };

    expect(teclaDoEvento({ ...tudo, code: "KeyQ" })).toBe("Ctrl+Alt+Shift+KeyQ");
    expect(teclaDoEvento({ ...sem, altKey: true, code: "Digit1" })).toBe("Alt+Digit1");
  });

  it("Cmd é o mesmo que Ctrl: a campanha gravada no Linux vale no Mac", () => {
    expect(teclaDoEvento({ ...sem, metaKey: true, code: "KeyK" })).toBe(
      teclaDoEvento({ ...sem, ctrlKey: true, code: "KeyK" }),
    );
  });

  it("o Shift não muda a tecla: Shift+1 é o 1 com Shift, e não o !", () => {
    // É a razão de gravar `code`: o `key` aqui seria "!".
    expect(teclaDoEvento({ ...sem, shiftKey: true, code: "Digit1" })).toBe(
      "Shift+Digit1",
    );
  });

  it("recusa o que não serve: numpad, pontuação, espaço, F13", () => {
    for (const code of ["Numpad5", "Comma", "Semicolon", "Space", "Enter", "Tab", "F13"]) {
      expect(teclaDoEvento({ ...sem, code }), code).toBeNull();
    }
  });

  it("modificador sozinho não é tecla", () => {
    expect(teclaDoEvento({ ...sem, altKey: true, code: "AltLeft" })).toBeNull();
  });
});

describe("soModificador e doNumpad", () => {
  it("o Alt que chega antes do 1 é só espera", () => {
    expect(soModificador({ code: "AltLeft" })).toBe(true);
    expect(soModificador({ code: "MetaRight" })).toBe(true);
    expect(soModificador({ code: "KeyA" })).toBe(false);
  });

  it("o numpad inteiro é dos pads, com NumLock ou sem", () => {
    expect(doNumpad({ code: "Numpad5" })).toBe(true);
    expect(doNumpad({ code: "NumpadAdd" })).toBe(true);
    expect(doNumpad({ code: "Digit5" })).toBe(false);
  });
});

describe("rotuloDaTecla", () => {
  it("tira o prefixo do código e deixa o resto", () => {
    expect(rotuloDaTecla("KeyQ")).toBe("Q");
    expect(rotuloDaTecla("Alt+Digit1")).toBe("Alt+1");
    expect(rotuloDaTecla("Ctrl+Shift+F5")).toBe("Ctrl+Shift+F5");
  });
});
