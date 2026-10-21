"use client";

import { Fragment, useMemo, type PointerEvent as ReactPointerEvent } from "react";

import { useAtributosDasRolagens } from "@/components/atributos-das-rolagens";
import { DadosDaExpressao } from "@/components/mestre/rolagem-do-detalhe";
import { t } from "@/lib/i18n/personagens";
import { rolarExpressao } from "@/lib/mestre/dados-actions";
import { textoDaExpressao, textoDoModificador } from "@/lib/mestre/expressao-de-rolagem";
import { pedacosComRolagens, type PedacoDoTexto } from "@/lib/mestre/rolagens-no-texto";
import { textoDoValor } from "@/lib/mestre/valor-do-atributo";

/**
 * Um texto da ficha com as rolagens entre chaves viradas no botão de rolar:
 * "Dano: {2d10+50} Sangue" mostra os dois d10 no lugar das chaves, e o
 * clique joga na mesa e anuncia no fio com `rotulo` ("Dante · Ataque"). O
 * resto do texto é texto, como o autor escreveu. Ver `pedacosComRolagens`.
 *
 * Inline, e no tamanho da letra: o botão mora no meio da frase, e uma frase
 * com três rolagens não pode virar três linhas.
 *
 * As siglas dentro das chaves leem os atributos da ficha em volta -- "Ataque:
 * {AGId20>+5}" rola tantos d20 quanto a AGI. Ver `AtributosDasRolagens`.
 */
export function TextoComRolagens({ texto, rotulo }: { texto: string; rotulo: string }) {
  const atributos = useAtributosDasRolagens();
  const pedacos = useMemo(() => pedacosComRolagens(texto, atributos), [texto, atributos]);

  return pedacos.map((pedaco, i) =>
    pedaco.tipo === "texto" ? (
      <Fragment key={i}>{pedaco.texto}</Fragment>
    ) : (
      <RolagemNoTexto key={i} rolagem={pedaco} rotulo={rotulo} />
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
 *
 * Com sigla, a dica diz a conta resolvida -- a que vai à mesa e ao fio -- e,
 * embaixo, como ela foi escrita e quanto cada sigla valeu: "AGId20>+5, com AGI
 * 3". É o que deixa o mestre conferir que a AGI que rolou é a de agora.
 */
function RolagemNoTexto({
  rolagem,
  rotulo,
}: {
  rolagem: Extract<PedacoDoTexto, { tipo: "rolagem" }>;
  rotulo: string;
}) {
  const { expressao, siglas } = rolagem;
  const rolar = t.detalhes.rolar(rotulo, textoDaExpressao(expressao));
  const ficam = expressao.dados.some((termo) => termo.manter);
  const dica = [
    rolar,
    siglas
      ? t.detalhes.comAtributos(
          rolagem.texto,
          siglas.map((atributo) => `${atributo.sigla} ${textoDoValor(atributo)}`).join(", "),
        )
      : null,
    ficam ? t.detalhes.ficaOMaior : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <button
      type="button"
      aria-label={rolar}
      title={dica}
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
