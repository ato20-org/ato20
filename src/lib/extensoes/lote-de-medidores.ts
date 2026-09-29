"use client";

import { useCharactersStore } from "@/lib/store/use-characters-store";
import { aplicarMedidores, type MudancaDeMedidor } from "@/lib/vault/characters";
import type { PatchMedidor } from "@/types/character";

/**
 * Junta as mudanças de medidor que chegam juntas e grava uma vez.
 *
 * Cada gravação no índice de personagens é uma releitura, uma reescrita
 * inteira e um `fsync` na thread da janela, seguidos de uma releitura pelo
 * TypeScript -- que acorda cinco hooks -- e de uma republicação da cena. Um
 * plugin que percorre a horda chamando `ajustarMedidor` dez vezes num laço
 * pagaria isso dez vezes; aqui as dez entram na mesma fila, e no próximo
 * tique do relógio vão ao Rust como UM lote, com UMA releitura no fim.
 *
 * O prazo é zero: `setTimeout(0)` já junta tudo que o mesmo laço síncrono
 * pediu, que é o caso de sempre. Um prazo maior atrasaria o `+1` de um clique
 * isolado sem juntar nada a mais.
 */

const fila: MudancaDeMedidor[] = [];
let agendado: ReturnType<typeof setTimeout> | null = null;
let emVoo: Promise<void> | null = null;

/**
 * Duas mudanças no mesmo medidor viram uma, com o patch de depois vencendo
 * campo a campo. Pura, para o teste.
 */
export function juntar(mudancas: MudancaDeMedidor[]): MudancaDeMedidor[] {
  const porAlvo = new Map<string, MudancaDeMedidor>();

  for (const mudanca of mudancas) {
    const chave = `${mudanca.personagemId}/${mudanca.medidorId}`;
    const anterior = porAlvo.get(chave);

    porAlvo.set(
      chave,
      anterior
        ? { ...anterior, patch: { ...anterior.patch, ...mudanca.patch } }
        : mudanca,
    );
  }

  return [...porAlvo.values()];
}

/**
 * Só os campos do contrato. O `estilo` de fábrica fica de fora: o que o plugin
 * troca é o `estiloExtensao`, o dele.
 */
export type PatchDePlugin = Pick<
  PatchMedidor,
  "nome" | "cor" | "atual" | "maximo" | "escondido" | "estiloExtensao"
>;

/**
 * Enfileira uma mudança. Resolve quando o lote dela foi gravado e relido.
 *
 * `atual` e `maximo` são arredondados aqui: o Rust guarda inteiros, e um
 * plugin que soma 2.5 de dano não deve ver o pedido inteiro recusado.
 */
export function ajustarMedidorEmLote(
  personagemId: string,
  medidorId: string,
  patch: PatchDePlugin,
): Promise<void> {
  const { nome, cor, atual, maximo, escondido, estiloExtensao } = patch;
  fila.push({
    personagemId,
    medidorId,
    patch: {
      nome,
      cor,
      escondido,
      estiloExtensao,
      atual: atual === undefined ? undefined : Math.round(atual),
      maximo: maximo === undefined ? undefined : Math.round(maximo),
    },
  });

  if (!agendado) {
    agendado = setTimeout(() => {
      agendado = null;
      emVoo = despachar().finally(() => {
        emVoo = null;
      });
    }, 0);
  }

  return new Promise((resolver) => {
    // Resolve quando o lote em curso (ou o que vai sair) terminar. Uma
    // promessa por chamada, e não por lote: quem chamou espera a SUA.
    const esperar = () => (emVoo ?? Promise.resolve()).then(resolver);
    setTimeout(esperar, 0);
  });
}

async function despachar(): Promise<void> {
  const lote = juntar(fila.splice(0));
  if (lote.length === 0) return;

  try {
    await aplicarMedidores(lote);
  } finally {
    // Relê uma vez, aconteça o que aconteça: se a gravação falhou no meio, a
    // tela tem de mostrar o que está no disco, não o que o plugin pediu.
    useCharactersStore.getState().recarregar();
  }
}
