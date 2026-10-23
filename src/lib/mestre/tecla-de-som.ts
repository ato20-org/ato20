/**
 * A tecla que o mestre dá a um som da lista de macros: como se lê do evento,
 * como se grava e como se escreve na tela.
 *
 * Gravada pela tecla FÍSICA (`KeyboardEvent.code`), com os modificadores na
 * frente numa ordem fixa: `"Alt+Shift+KeyQ"`. Física pelo motivo do numpad e
 * das câmeras em `atalhos.ts` -- o Shift troca o `key` do 1 por "!", e o código
 * continua o mesmo; o Option do Mac troca o Q por "œ", e idem. Numa string só
 * porque é o que a pergunta "esta tecla já toca outro som?" precisa: igualdade.
 *
 * ## Só letras, números e F1 a F12
 *
 * Com ou sem Ctrl, Alt e Shift. As outras teclas ou já são da interface (Tab
 * anda pelo foco, Enter e Espaço apertam o botão focado, Esc fecha), ou mudam
 * de lugar e de nome entre o ABNT e o americano -- o `;` de um é o `ç` do
 * outro, e o rótulo da tela mentiria para metade dos mestres. E é nelas que
 * moram os atalhos da tabela que dependem de estado (os colchetes do pincel, o
 * `'` do ping, as setas): fora delas, conferir o conflito na hora de gravar
 * vale para sempre, e não só para o estado em que o mestre gravou.
 *
 * O teclado numérico fica de fora de propósito: é dos nove pads.
 */

/** O pedaço do `KeyboardEvent` que decide a tecla. */
export type EventoDeTecla = Pick<
  KeyboardEvent,
  "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
>;

const TECLA_QUE_SERVE = /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2]))$/;

const MODIFICADORES = new Set([
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
]);

/**
 * Só um modificador apertado: a combinação ainda não terminou.
 *
 * Quem grava espera a tecla seguinte em vez de recusar -- o Alt chega sozinho
 * um instante antes do 1 de "Alt+1".
 */
export function soModificador(evento: Pick<KeyboardEvent, "code">): boolean {
  return MODIFICADORES.has(evento.code);
}

/** A tecla do teclado numérico, que é dos pads. */
export function doNumpad(evento: Pick<KeyboardEvent, "code">): boolean {
  return evento.code.startsWith("Numpad");
}

/**
 * A tecla do evento na forma gravada, ou `null` quando ela não serve para som.
 *
 * Ctrl e Cmd são o mesmo modificador, como no resto da tabela de atalhos: a
 * campanha gravada num Linux tem de valer no Mac do outro mestre.
 */
export function teclaDoEvento(evento: EventoDeTecla): string | null {
  if (!TECLA_QUE_SERVE.test(evento.code)) return null;

  const partes: string[] = [];
  if (evento.ctrlKey || evento.metaKey) partes.push("Ctrl");
  if (evento.altKey) partes.push("Alt");
  if (evento.shiftKey) partes.push("Shift");
  partes.push(evento.code);

  return partes.join("+");
}

/** Como a tecla se escreve na tela: `"Alt+Shift+KeyQ"` vira `"Alt+Shift+Q"`. */
export function rotuloDaTecla(tecla: string): string {
  return tecla
    .split("+")
    .map((parte) => parte.replace(/^(Key|Digit)/, ""))
    .join("+");
}
