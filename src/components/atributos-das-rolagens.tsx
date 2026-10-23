"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { AtributoDaConta } from "@/lib/mestre/expressao-de-rolagem";

const NENHUM: ReadonlyArray<AtributoDaConta> = [];

const Contexto = createContext<ReadonlyArray<AtributoDaConta>>(NENHUM);

const Dono = createContext<string | undefined>(undefined);

/**
 * Os atributos da ficha onde o texto mora, para as siglas dentro das chaves:
 * "Ataque: {AGId20>+5}" lê a AGI DESTA ficha. Ver `pedacosComRolagens`.
 *
 * Por contexto, e não por prop: quem lê é o texto, lá no fundo do cartão, e
 * os cartões da ficha são `memo` -- uma prop nova em cada um os redesenharia
 * todos para mudar meia dúzia de botões. Fora de uma ficha não há atributo, e
 * a sigla fica texto.
 *
 * `personagemId` é de quem é a ficha, para a régua entre chaves: "Deslocamento:
 * {9m}" nasce no token DELE. A ficha do bestiário não é de ninguém na cena, e
 * a régua dela nasce onde o mestre está olhando. Ver `colocarReguaDaFicha`.
 */
export function AtributosDasRolagens({
  atributos,
  personagemId,
  children,
}: {
  atributos: ReadonlyArray<AtributoDaConta> | undefined;
  personagemId?: string;
  children: ReactNode;
}) {
  // Pelo CONTEÚDO, e não pela lista: a ficha relê o personagem a cada edição
  // (ver a #239), e uma lista nova com os mesmos números não pode redesenhar
  // cada rolagem do texto.
  const chave = (atributos ?? [])
    .map(({ sigla, valor, rolagem }) => `${sigla}\u0000${valor}\u0000${rolagem ?? ""}`)
    .join("\u0001");
  const valor = useMemo(
    () =>
      atributos && atributos.length > 0
        ? atributos.map(({ sigla, valor, rolagem }) => ({ sigla, valor, ...(rolagem && { rolagem }) }))
        : NENHUM,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a chave É a lista: muda quando, e só quando, uma sigla ou um valor muda
    [chave],
  );

  return (
    <Contexto.Provider value={valor}>
      <Dono.Provider value={personagemId}>{children}</Dono.Provider>
    </Contexto.Provider>
  );
}

/** Os atributos da ficha em volta. Nenhum, fora de uma. */
export function useAtributosDasRolagens(): ReadonlyArray<AtributoDaConta> {
  return useContext(Contexto);
}

/** De quem é a ficha em volta. Ninguém, fora de uma, e no bestiário. */
export function useDonoDasRolagens(): string | undefined {
  return useContext(Dono);
}
