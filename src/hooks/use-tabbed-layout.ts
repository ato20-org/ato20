"use client";

import { useSyncExternalStore } from "react";

/**
 * Quando o Jogador precisa de abas em vez de tudo empilhado.
 *
 * O critério é **proporção**, não altura absoluta. A cena presa no topo pede
 * `largura * 9/16` de altura. Numa tela mais alta que larga isso é no máximo
 * 56% da altura, e sempre resta espaço para a ficha embaixo. Numa tela mais
 * larga que alta a conta inverte e a cena come tudo — foi assim que 970x664
 * sobrou 40px para o conteúdo.
 *
 * A segunda condição pega a tela baixa mesmo em retrato, onde empilhar também
 * não caberia.
 */
const QUERY = "(min-aspect-ratio: 1/1), (max-height: 520px)";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);

  return () => media.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

/** No servidor não há viewport; retrato é o caso mais comum num celular. */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * Usa `useSyncExternalStore` em vez de `useEffect` + `setState`: o React lê o
 * valor no próprio render do cliente, sem o quadro intermediário com o valor
 * errado e sem divergência de hidratação.
 */
export function useTabbedLayout(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
