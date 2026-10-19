"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { Fragment, useMemo, type PointerEvent as ReactPointerEvent } from "react";

import { DadoEmImagem } from "@/components/mestre/saquinho-dados";
import { t } from "@/lib/i18n/personagens";
import { rolarExpressao } from "@/lib/mestre/dados-actions";
import {
  textoDaExpressao,
  textoDoModificador,
  type ExpressaoDeRolagem,
} from "@/lib/mestre/expressao-de-rolagem";
import { pedacosComRolagens } from "@/lib/mestre/rolagens-no-texto";
import { tipoDado } from "@/types/dado";

/**
 * Um texto da ficha com as rolagens entre chaves viradas no botão de rolar:
 * "Dano: {2d10+50} Sangue" mostra o dado do d10 no lugar das chaves, e o
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

/** O `+` entre dois termos: notação de dado, e não texto de interface. */
const SINAL_DA_SOMA = "+";

/**
 * O botão de uma rolagem no meio do texto: o dado de cada termo com a
 * quantidade, a seta de quem fica (`↑` o maior, `↓` o menor) e o modificador.
 *
 * O `pointerdown` não sobe: a linha da ficha começa o arrasto de reordenar
 * nele, e rolar não é arrastar.
 */
function RolagemNoTexto({ expressao, rotulo }: { expressao: ExpressaoDeRolagem; rotulo: string }) {
  const texto = textoDaExpressao(expressao);
  const rolar = t.detalhes.rolar(rotulo, texto);
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
      className="bg-muted/60 hover:bg-accent focus-visible:ring-ring text-foreground mx-0.5 inline-flex items-center gap-0.5 rounded border px-1 align-middle leading-tight font-medium tabular-nums outline-none focus-visible:ring-2"
    >
      {expressao.dados.map((termo, i) => (
        <span key={i} className="inline-flex items-center gap-px">
          {i > 0 ? <span className="text-muted-foreground">{SINAL_DA_SOMA}</span> : null}
          <DadoEmImagem tipo={tipoDado(termo.faces)} tamanho={13} />
          <span>{`${termo.quantidade}d${termo.faces}`}</span>
          {termo.manter === "maior" ? (
            <ArrowUp aria-hidden className="size-3" />
          ) : termo.manter === "menor" ? (
            <ArrowDown aria-hidden className="size-3" />
          ) : null}
        </span>
      ))}
      {expressao.modificador !== 0 ? <span>{textoDoModificador(expressao.modificador)}</span> : null}
    </button>
  );
}
