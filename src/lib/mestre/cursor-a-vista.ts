/**
 * O cursor à vista enquanto se escreve.
 *
 * O editor da nota é feito de campos que CRESCEM com o texto -- um por linha
 * no modo ao vivo, um só no texto cru --, dentro de uma área que rola. O campo
 * nunca rola por dentro, então o navegador não tem o que rolar para mostrar o
 * cursor: Enter na última linha visível, ou a linha que dobra para baixo, e o
 * que se digita some embaixo da borda. Quem rola é a área de fora, e é ela que
 * isto move.
 */

/** A folga entre o cursor e a borda, em pixel: o bastante para ver a linha seguinte chegar. */
const FOLGA = 48;

/** A área que rola mais perto, subindo do elemento. */
function areaQueRola(elemento: HTMLElement): HTMLElement | null {
  for (let atual = elemento.parentElement; atual; atual = atual.parentElement) {
    const { overflowY } = getComputedStyle(atual);
    if ((overflowY === "auto" || overflowY === "scroll") && atual.scrollHeight > atual.clientHeight)
      return atual;
  }
  return null;
}

/**
 * Rola a área de `elemento` o mínimo para a faixa `[topo, base]` -- em
 * coordenadas da tela -- caber com folga. À vista, não mexe: é por tecla, e a
 * página não pode andar enquanto o cursor já está onde o olho está.
 */
export function trazerParaAVista(elemento: HTMLElement, topo: number, base: number): void {
  const area = areaQueRola(elemento);
  if (!area) return;

  const caixa = area.getBoundingClientRect();
  if (base + FOLGA > caixa.bottom) area.scrollTop += base + FOLGA - caixa.bottom;
  else if (topo - FOLGA < caixa.top) area.scrollTop -= caixa.top - (topo - FOLGA);
}

/** O que o espelho copia do campo para quebrar as linhas no mesmo lugar. */
const COPIADOS = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "wordSpacing",
  "lineHeight",
  "textTransform",
  "tabSize",
  "paddingTop",
  "paddingRight",
  "paddingLeft",
  "boxSizing",
  "wordBreak",
] as const;

/**
 * Onde está o cursor de um `<textarea>`, em coordenadas da tela.
 *
 * O campo não diz: o jeito é um espelho -- uma caixa fora da vista com a mesma
 * letra e a mesma largura, o texto até o cursor e uma marca no fim -- e medir
 * a marca. É o desenho que o editor ao vivo já usa para pendurar a lista de
 * sugestões, feito aqui para o campo único do texto cru.
 */
export function cursorDoCampo(campo: HTMLTextAreaElement): { topo: number; base: number } {
  const estilo = getComputedStyle(campo);
  const espelho = document.createElement("div");
  for (const propriedade of COPIADOS) espelho.style[propriedade] = estilo[propriedade];
  espelho.style.position = "absolute";
  espelho.style.visibility = "hidden";
  espelho.style.top = "0";
  espelho.style.left = "-9999px";
  espelho.style.whiteSpace = "pre-wrap";
  espelho.style.overflowWrap = "break-word";
  espelho.style.width = `${campo.getBoundingClientRect().width}px`;
  espelho.textContent = campo.value.slice(0, campo.selectionEnd);

  const marca = document.createElement("span");
  // Largura zero, mas com altura de linha: um `<span>` vazio não teria caixa.
  marca.textContent = "​";
  espelho.appendChild(marca);

  document.body.appendChild(espelho);
  const y = marca.offsetTop;
  const altura = marca.offsetHeight;
  espelho.remove();

  const { top } = campo.getBoundingClientRect();
  return { topo: top + y, base: top + y + altura };
}
