"use client";

import { useEffect, useMemo, useState } from "react";

import { DeclarativoProvider } from "@/components/playground/declarativo";
import { DisparoLayer } from "@/components/playground/disparo-layer";
import { disparoDoEfeito, novoDisparo, vidaDoDisparo } from "@/lib/disparo-de-efeito";
import type { Vec } from "@/lib/geometry/transform";
import { DECLARATIVO_VAZIO, type Declarativo } from "@/lib/sync/declarativo";
import type { DefinicaoDeEfeito } from "@/types/efeito";

/**
 * Um DISPARO repetindo sozinho: a prévia do editor e o card do Compêndio. Um
 * tiro novo a cada fim, com outro id, que é o que faz a camada desenhá-lo de
 * novo -- ver `DisparoLayer`.
 *
 * Num mundo de cena de quem monta, em unidades de cena: quem chama o põe na
 * caixa e na escala dele. A definição é a DA TELA, por um declarativo só dela,
 * como na prévia da área: o disparo guardado no Compêndio não vai à mesa, e o
 * da janela tem de mudar a cada ajuste.
 *
 * A linha e o cone pedem lugares diferentes do mesmo mundo, e por isso vêm os
 * dois pares de pontos.
 */
export function TiroEmLaco({
  efeito,
  linha,
  cone,
}: {
  efeito: DefinicaoDeEfeito;
  linha: { de: Vec; para: Vec };
  cone: { de: Vec; para: Vec };
}) {
  const declarativo = useMemo<Declarativo>(
    () => ({
      ...DECLARATIVO_VAZIO,
      efeitos: { [efeito.id]: { ...efeito, origem: efeito.origem ?? { acervo: true } } },
    }),
    [efeito],
  );
  const [volta, setVolta] = useState(0);
  const pontos = disparoDoEfeito(efeito).forma === "cone" ? cone : linha;
  const disparo = useMemo(
    () =>
      novoDisparo({
        id: `tiro-em-laco-${volta}`,
        cenaId: "previa",
        efeito: efeito.id,
        definicao: efeito,
        grid: undefined,
        de: pontos.de,
        para: pontos.para,
        quando: 0,
      }),
    [efeito, pontos, volta],
  );
  const vida = disparo ? vidaDoDisparo(disparo) : 0;

  useEffect(() => {
    if (!vida) return;
    // Um respiro curto entre um tiro e o próximo: longo, a faixa parecia vazia.
    const proxima = setTimeout(() => setVolta((atual) => atual + 1), vida + 350);
    return () => clearTimeout(proxima);
  }, [vida, volta]);

  return (
    <DeclarativoProvider valor={declarativo}>
      <DisparoLayer disparos={disparo ? [disparo] : []} grid={undefined} />
    </DeclarativoProvider>
  );
}
