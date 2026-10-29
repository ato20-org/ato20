/**
 * Perguntas ao DOM que valem também numa janela SOLTA.
 *
 * A janela solta é outro documento desenhado pelo mesmo JavaScript (ver
 * `janela-solta.tsx`). Os nós de lá são de outro "mundo": `no instanceof
 * HTMLElement` compara com a classe do Mestre e dá falso, e o `window` e o
 * `document` globais são os do Mestre -- quem ouve o `pointermove` no
 * `window` não ouve nada da solta, e o `elementFromPoint` do `document`
 * procura no monitor errado. Daqui sai a janela e o documento do próprio nó.
 */

/** É um elemento, venha de que janela vier? */
export function ehElemento(valor: unknown): valor is Element {
  return typeof valor === "object" && valor !== null && (valor as Node).nodeType === 1;
}

/** É um nó do DOM, venha de que janela vier? */
export function ehNo(valor: unknown): valor is Node {
  return (
    typeof valor === "object" &&
    valor !== null &&
    typeof (valor as Node).nodeType === "number" &&
    typeof (valor as Node).nodeName === "string"
  );
}

/** A janela em que o nó está: a do Mestre, ou a solta. */
export function janelaDe(no: Node | null | undefined): Window & typeof globalThis {
  return (no?.ownerDocument?.defaultView ?? window) as Window & typeof globalThis;
}

/** O documento em que o nó está. */
export function documentoDe(no: Node | null | undefined): Document {
  return no?.ownerDocument ?? document;
}
