import type { PointerEvent as ReactPointerEvent } from "react";

/** O atributo que marca um botão de menção -- chip ou prévia -- no DOM. */
export const MARCA_MENCAO = "data-mencao";

/**
 * Até onde o ponteiro anda e o gesto ainda é CLIQUE, em pixel de tela. Acima
 * disso é arrasto do papel, e abrir a ficha no fim de um arrasto seria abrir
 * sem ninguém pedir.
 */
const TOLERANCIA = 4;

/**
 * Devolve à menção o clique que o arrasto do palco tirou dela.
 *
 * O postit e o cartão de nota arrastam pelo palco -- `useSceneDrag` --, e o
 * palco faz duas coisas no pointerdown que matam o clique de quem está dentro:
 * `preventDefault`, que suprime o `click` de compatibilidade, e
 * `setPointerCapture`, que entrega o resto dos eventos ao papel. O `@Thalor`
 * de um postit mostrava a prévia no hover e não abria nada no clique.
 *
 * Chamado no pointerdown do papel, ANTES de o palco capturar: é a última vez
 * que `event.target` ainda é o que está sob o dedo. Se o gesto termina onde
 * começou, e em cima da mesma menção, ela é clicada -- o `onClick` dela é o
 * de sempre, e o que ele abre é decisão dela.
 */
export function repassarCliqueDaMencao(event: ReactPointerEvent): void {
  if (event.button !== 0) return;

  const achada =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>(`[${MARCA_MENCAO}]`)
      : null;
  if (!achada) return;
  const mencao: HTMLElement = achada;

  const { clientX: x, clientY: y, pointerId } = event;

  function soltar(fim: PointerEvent) {
    if (fim.pointerId !== pointerId) return;
    parar();

    if (fim.type !== "pointerup") return;
    if (Math.hypot(fim.clientX - x, fim.clientY - y) > TOLERANCIA) return;

    // O que está sob o ponteiro na SUBIDA, e não o alvo do evento: com a
    // captura no papel, o alvo é o papel.
    const sob = document.elementFromPoint(fim.clientX, fim.clientY);
    if (sob?.closest(`[${MARCA_MENCAO}]`) !== mencao) return;

    mencao.click();
  }

  function parar() {
    window.removeEventListener("pointerup", soltar, true);
    window.removeEventListener("pointercancel", soltar, true);
  }

  // Na captura do `window`: o palco solta a captura no pointerup do papel, e
  // a ordem entre os dois não pode decidir se a menção abre.
  window.addEventListener("pointerup", soltar, true);
  window.addEventListener("pointercancel", soltar, true);
}
