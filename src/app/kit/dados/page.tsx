"use client";

import { useSyncExternalStore } from "react";

import { KitDeDados } from "@/components/kit/kit-de-dados";

/**
 * O kit de dados, para a página de um plugin embutir num `<iframe>`.
 *
 * Genérico: não sabe de quem é o dado nem por quanto tempo ele fica -- isso é
 * da página do plugin, que manda pelo `postMessage`. Ver `lib/kit-de-dados.ts`.
 *
 * O fundo é transparente, e é o ponto da página: o que não é dado tem de
 * deixar aparecer o que estiver por baixo -- a página do plugin, e embaixo
 * dela a live. O `body` do aplicativo pinta o fundo do tema; aqui ele sai.
 */
export default function KitDeDadosPage() {
  const busca = useSyncExternalStore(
    () => () => {},
    () => window.location.search,
    () => null,
  );

  return (
    <>
      <style>{"html,body{background:transparent!important}"}</style>
      {busca === null ? null : <KitDeDados escala={escalaDe(busca)} />}
    </>
  );
}

/** `?escala=`, entre metade e o triplo. Fora disso, o de fábrica. */
function escalaDe(busca: string): number {
  const valor = Number(new URLSearchParams(busca).get("escala") ?? "1");
  if (!Number.isFinite(valor) || valor <= 0) return 1;

  return Math.min(3, Math.max(0.5, valor));
}
