"use client";

import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";

import type { NoSvg } from "@/lib/extensoes/svg-modelo";
import {
  buscarDeclarativo,
  DECLARATIVO_VAZIO,
  type Declarativo,
} from "@/lib/sync/declarativo";

/**
 * O que os plugins declaram, onde quem desenha alcança.
 *
 * Contexto e não prop: o medidor é desenhado seis camadas abaixo de quem tem
 * o quadro, em três telas, e passar o conjunto por prop obrigaria cada camada
 * a conhecê-lo. O padrão é o VAZIO, e é o que mantém o custo zero para quem
 * não tem plugin: `DesenhoDoMedidor` só consulta o contexto quando o medidor
 * pede um estilo de plugin.
 */
export const DeclarativoContext = createContext<Declarativo>(DECLARATIVO_VAZIO);

/**
 * O conjunto atual, do lado de quem assiste.
 *
 * Busca quando a `versao` do quadro muda -- e só então. O quadro sai dez vezes
 * por segundo; o conjunto muda quando o mestre instala um plugin.
 */
export function useDeclarativoDaMesa(
  codigo: string,
  versao: number,
  base = "",
): Declarativo {
  const [declarativo, setDeclarativo] = useState<Declarativo>(DECLARATIVO_VAZIO);

  useEffect(() => {
    if (versao === 0 || versao === declarativo.versao) return;

    let ativo = true;
    void buscarDeclarativo(codigo, base).then((novo) => {
      if (ativo) setDeclarativo(novo);
    });

    return () => {
      ativo = false;
    };
    // `declarativo.versao` de propósito fora: a busca é disparada pela versão
    // do QUADRO, e o estado local só diz se ela já foi atendida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo, base, versao]);

  return declarativo;
}

export function DeclarativoProvider({
  valor,
  children,
}: {
  valor: Declarativo;
  children: ReactNode;
}) {
  return <DeclarativoContext.Provider value={valor}>{children}</DeclarativoContext.Provider>;
}

/**
 * Os nomes que o filtro baixou e o SVG exige em camelCase.
 *
 * O filtro compara em minúsculas para a lista fechada não depender de como o
 * autor escreveu; o React passa o atributo como está, e `viewbox` não é
 * `viewBox` para o SVG. A volta acontece aqui, na hora de desenhar.
 */
const NOMES: Record<string, string> = {
  viewbox: "viewBox",
  preserveaspectratio: "preserveAspectRatio",
  gradientunits: "gradientUnits",
  gradienttransform: "gradientTransform",
  attributename: "attributeName",
  repeatcount: "repeatCount",
  keytimes: "keyTimes",
  calcmode: "calcMode",
  lineargradient: "linearGradient",
  radialgradient: "radialGradient",
  clippath: "clipPath",
  animatetransform: "animateTransform",
};

const nome = (chave: string) => NOMES[chave] ?? chave;

/** Uma árvore filtrada, como elementos React. Só `createElement`, nunca HTML. */
export function DesenhoSvg({ no, chave }: { no: NoSvg; chave?: string }) {
  return desenhar(no, chave ?? "raiz");
}

function desenhar(no: NoSvg, chave: string): ReactNode {
  const props: Record<string, unknown> = { key: chave };
  for (const [atributo, valor] of Object.entries(no.atributos)) props[nome(atributo)] = valor;

  return createElement(
    nome(no.tag),
    props,
    ...no.filhos.map((filho, indice) =>
      typeof filho === "string" ? filho : desenhar(filho, `${chave}.${indice}`),
    ),
  );
}

export function useDeclarativo(): Declarativo {
  return useContext(DeclarativoContext);
}
