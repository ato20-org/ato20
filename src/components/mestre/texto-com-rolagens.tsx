"use client";

import { Fragment, useMemo, type PointerEvent as ReactPointerEvent } from "react";

import { DadosDaExpressao } from "@/components/mestre/rolagem-do-detalhe";
import { t } from "@/lib/i18n/personagens";
import { rolarExpressao } from "@/lib/mestre/dados-actions";
import {
  textoDaExpressao,
  textoDoModificador,
  type ExpressaoDeRolagem,
} from "@/lib/mestre/expressao-de-rolagem";
import { pedacosComRolagens } from "@/lib/mestre/rolagens-no-texto";

/**
 * Um texto da ficha com as rolagens entre chaves viradas no botão de rolar:
 * "Dano: {2d10+50} Sangue" mostra os dois d10 no lugar das chaves, e o
 * clique joga na mesa e anuncia no fio com `rotulo` ("Dante · Ataque"). O
 * resto do texto é texto, como o autor escreveu. Ver `pedacosComRolagens`.
 *
 * Inline, e no tamanho da letra: o botão mora no meio da frase, e uma frase
 * com três rolagens não pode virar três linhas.
 */
export function TextoComRolagens({ texto, rotulo }: { texto: string; rotulo: string }) {
  const pedacos = useMemo(() => pedacosComRolagens(texto), [texto]);

  return pedacos.map((pedaco, i) =>
    pedaco.tipo === "texto" ? (
      <Fragment key={i}>{pedaco.texto}</Fragment>
    ) : (
      <RolagemNoTexto key={i} expressao={pedaco.expressao} rotulo={rotulo} />
    ),
  );
}

/**
 * O botão de uma rolagem no meio do texto: o MESMO do detalhe rolável
 * (`RolagemDoDetalhe`) -- os dados desenhados como os da mesa, com a seta de
 * quem fica, e o modificador ao lado --, só que na linha da frase.
 *
 * O `pointerdown` não sobe: a linha da ficha começa o arrasto de reordenar
 * nele, e rolar não é arrastar.
 */
function RolagemNoTexto({ expressao, rotulo }: { expressao: ExpressaoDeRolagem; rotulo: string }) {
  const rolar = t.detalhes.rolar(rotulo, textoDaExpressao(expressao));
  const ficam = expressao.dados.some((termo) => termo.manter);

  return (
    <button
      type="button"
      aria-label={rolar}
      title={ficam ? `${rolar}\n${t.detalhes.ficaOMaior}` : rolar}
      onPointerDown={(evento: ReactPointerEvent) => evento.stopPropagation()}
      onClick={(evento) => {
        evento.stopPropagation();
        rolarExpressao(expressao, rotulo);
      }}
      className="hover:bg-accent focus-visible:ring-ring text-foreground inline-flex items-center gap-1 rounded px-1 py-0.5 align-middle outline-none focus-visible:ring-2"
    >
      <DadosDaExpressao expressao={expressao} />
      {expressao.modificador !== 0 ? (
        <span className="text-xs font-medium tabular-nums">{textoDoModificador(expressao.modificador)}</span>
      ) : null}
    </button>
  );
}
