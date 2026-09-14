"use client";

import { createElement, useEffect } from "react";

import { garantirCarregada } from "@/lib/extensoes/carregar";
import { chaveContribuicao } from "@/lib/extensoes/manifesto";
import { useContribuicoesStore } from "@/lib/store/use-contribuicoes-store";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";

/**
 * O que as extensões desenham sobre o mapa.
 *
 * Do MESTRE, e não da mesa: plugin só alcança o Mestre nesta etapa, então o
 * que sai daqui é anotação da bancada — como o alfinete e o postit, que vivem
 * fora do `SceneLayer` pela mesma razão.
 *
 * **Camada é o único ponto de contribuição que carrega cedo.** Painel e comando
 * esperam alguém abrir ou teclar; uma camada não tem gesto de abertura — ela
 * simplesmente está no mapa ou não está. Esperar um gesto que não existe
 * significaria nunca carregar.
 *
 * É uma exceção pequena e contida: só as extensões que DECLARAM camada pagam
 * por ela, e quem só traz painel continua sendo importado tarde.
 */
export function CamadasDeExtensoes() {
  const extensoes = useExtensoesStore((state) => state.extensoes);
  const camadas = useContribuicoesStore((state) => state.camadas);

  const comCamada = extensoes.filter(
    (extensao) =>
      extensao.habilitada && (extensao.contribui?.camadas.length ?? 0) > 0,
  );

  useEffect(() => {
    for (const extensao of comCamada) void garantirCarregada(extensao);
    // `comCamada` é recalculado a cada render; a lista de extensões é o que de
    // fato muda, e `garantirCarregada` já é idempotente para as repetições.
  }, [comCamada]);

  return (
    <>
      {comCamada.flatMap((extensao) =>
        extensao.contribui.camadas
          .map((camada) => ({
            chave: chaveContribuicao(extensao.id, camada.id),
            Corpo: camadas[chaveContribuicao(extensao.id, camada.id)],
          }))
          // Declarada e ainda não registrada: nada. Uma camada não tem moldura
          // nem lugar reservado no mapa, então não há onde pôr um aviso de
          // "carregando" que não fosse sujeira sobre a cena do mestre.
          .filter(({ Corpo }) => Boolean(Corpo))
          .map(({ chave, Corpo }) => (
            // `pointer-events: none` na moldura, e a camada liga onde precisar:
            // o padrão tem de ser não roubar o clique do mapa, que é o que o
            // mestre faz o tempo todo.
            <div key={chave} className="pointer-events-none absolute inset-0">
              {/* Referência do registro, posta uma vez quando a extensão
                  ativou -- ver a nota em `PainelDeExtensao`. */}
              {createElement(Corpo)}
            </div>
          )),
      )}
    </>
  );
}
