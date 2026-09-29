"use client";

import { createElement, useEffect } from "react";

import { BarreiraDeExtensao } from "@/components/mestre/barreira-de-extensao";
import { SecaoFicha } from "@/components/mestre/secao-ficha";
import { garantirCarregada } from "@/lib/extensoes/carregar";
import {
  chaveContribuicao,
  type Extensao,
  type SecaoDeclarada,
} from "@/lib/extensoes/manifesto";
import { useContribuicoesStore } from "@/lib/store/use-contribuicoes-store";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";

/**
 * As seções que os plugins puseram na ficha.
 *
 * Uma `SecaoFicha` por seção declarada, com a mesma moldura das de fábrica:
 * fecha, lembra que fechou, tem título. A chave é `ext:{plugin}/{id}`, e o
 * store de seções fechadas a aceita sem migração -- ele grava texto.
 *
 * Montar a seção importa o módulo, como o painel. Enquanto não chega, ou se
 * o módulo não registrou o corpo, a seção fica vazia com o aviso -- e não
 * some, porque o mestre a viu no manifesto e a procuraria.
 */
export function SecoesDeExtensao({ personagemId }: { personagemId: string }) {
  const extensoes = useExtensoesStore((state) => state.extensoes);

  const declaradas = extensoes
    .filter((extensao) => extensao.habilitada)
    .flatMap((extensao) =>
      (extensao.contribui?.secoes ?? [])
        .filter((secao) => secao.alvo === "ficha")
        .map((secao) => ({ extensao, secao })),
    );

  if (declaradas.length === 0) return null;

  return (
    <>
      {declaradas.map(({ extensao, secao }) => (
        <SecaoDeExtensao
          key={chaveContribuicao(extensao.id, secao.id)}
          extensao={extensao}
          secao={secao}
          personagemId={personagemId}
        />
      ))}
    </>
  );
}

function SecaoDeExtensao({
  extensao,
  secao,
  personagemId,
}: {
  extensao: Extensao;
  secao: SecaoDeclarada;
  personagemId: string;
}) {
  const chave = chaveContribuicao(extensao.id, secao.id);
  const carga = useContribuicoesStore((state) => state.carga[extensao.id]);
  const Corpo = useContribuicoesStore((state) => state.secoes[chave]);

  useEffect(() => {
    void garantirCarregada(extensao);
  }, [extensao]);

  return (
    <SecaoFicha secao={`ext:${chave}`} titulo={secao.titulo}>
      {Corpo ? (
        <BarreiraDeExtensao nome={extensao.nome} chave={carga?.estado}>
          {createElement(Corpo, { personagemId })}
        </BarreiraDeExtensao>
      ) : (
        <p className="text-muted-foreground text-xs">
          {carga?.estado === "falhou"
            ? `${extensao.nome} falhou ao carregar.`
            : carga?.estado === "pronta"
              ? `${extensao.nome} não registrou a seção ${secao.id}.`
              : `Carregando ${extensao.nome}…`}
        </p>
      )}
    </SecaoFicha>
  );
}
