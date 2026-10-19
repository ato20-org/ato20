"use client";

import { create } from "zustand";

import { chaveDe, type ConteudoJanela } from "@/lib/store/use-window-store";
import { call, isDesktop } from "@/lib/vault/bridge";

/**
 * As janelas SOLTAS abertas agora: as janelas do Mestre que foram para fora do
 * aplicativo, cada uma numa janela do sistema. Ver `janela-solta.tsx`, que as
 * abre e desenha.
 *
 * Uma terceira casa para uma janela, ao lado da pilha flutuante
 * (`useWindowStore`) e das colunas (`useLayoutStore`), e exclusiva como elas:
 * a janela que solta sai das outras duas, e a que volta sai desta.
 *
 * O `id` é da janela do sistema, e não do conteúdo: a condição que muda de
 * lista troca de chave, e a janela solta dela continua a mesma. É também o
 * rótulo dela no Tauri (`janela-{id}`).
 */
export type JanelaSolta = { id: string; conteudo: ConteudoJanela };

export const useJanelasSoltasStore = create<{ soltas: JanelaSolta[] }>(() => ({ soltas: [] }));

/**
 * A janela do navegador de cada solta, pelo id, e como desmontar o que o Mestre
 * desenha nela. Fora do store: nenhum dos dois é dado, e ninguém precisa
 * redesenhar quando eles mudam.
 */
const filhas = new Map<string, Window>();
const desmontadores = new Map<string, () => void>();

/** O rótulo da janela do sistema no Tauri. Ver `janelas.rs`. */
export function rotuloDaSolta(id: string): string {
  return `janela-${id}`;
}

export function registrarSolta(
  id: string,
  conteudo: ConteudoJanela,
  filha: Window,
  desmontar: () => void,
): void {
  filhas.set(id, filha);
  desmontadores.set(id, desmontar);
  useJanelasSoltasStore.setState((estado) => ({
    soltas: [...estado.soltas.filter((solta) => solta.id !== id), { id, conteudo }],
  }));
}

/**
 * A solta acabou: sai da lista, o Mestre desmonta o que desenhava nela e, se
 * `fechar`, a janela do sistema fecha. Pode vir mais de uma vez -- o botão de
 * voltar, a página indo embora, o aviso do Rust --, e só a primeira faz algo.
 *
 * Fechar é com o Tauri: o `window.close()` da página, na WebKitGTK, só pede, e
 * a janela ficava de pé, vazia e cinza.
 */
export function encerrarSolta(id: string, fechar = true): void {
  const desmontar = desmontadores.get(id);
  filhas.delete(id);
  desmontadores.delete(id);
  useJanelasSoltasStore.setState((estado) => ({
    soltas: estado.soltas.filter((solta) => solta.id !== id),
  }));

  desmontar?.();
  if (fechar && isDesktop()) {
    void call("janela_solta_fechar", { rotulo: rotuloDaSolta(id) }).catch(() => {});
  }
}

/** O id de uma solta pelo rótulo dela no Tauri. Ver `rotuloDaSolta`. */
export function idDoRotulo(rotulo: string): string | null {
  return rotulo.startsWith("janela-") ? rotulo.slice("janela-".length) : null;
}

export function soltaDaChave(chave: string): JanelaSolta | undefined {
  return useJanelasSoltasStore.getState().soltas.find((solta) => chaveDe(solta.conteudo) === chave);
}

export function janelaDaSolta(id: string): Window | undefined {
  const filha = filhas.get(id);
  return filha && !filha.closed ? filha : undefined;
}

/**
 * Traz a janela solta desta chave para a frente, se há uma. O `focus()` da
 * página não levanta uma janela do sistema na WebKitGTK; quem levanta é o
 * Tauri, pelo rótulo.
 */
export function focarSolta(chave: string): boolean {
  const solta = soltaDaChave(chave);
  if (!solta) return false;

  janelaDaSolta(solta.id)?.focus();
  if (isDesktop()) void call("janela_solta_focar", { rotulo: rotuloDaSolta(solta.id) }).catch(() => {});
  return true;
}

/** Fecha a janela solta desta chave, se há uma. */
export function fecharSolta(chave: string): boolean {
  const solta = soltaDaChave(chave);
  if (!solta) return false;

  encerrarSolta(solta.id);
  return true;
}

/**
 * A coisa da janela solta mudou de identidade -- a condição que foi do
 * Compêndio ao menu --, e a janela continua a mesma, mostrando a nova.
 */
export function trocarSolta(antiga: string, nova: ConteudoJanela): boolean {
  const solta = soltaDaChave(antiga);
  if (!solta) return false;

  useJanelasSoltasStore.setState((estado) => ({
    soltas: estado.soltas.map((atual) => (atual.id === solta.id ? { ...atual, conteudo: nova } : atual)),
  }));
  return true;
}

/** Fecha todas: a campanha fechou, e o que elas mostravam era dela. */
export function fecharTodasAsSoltas(): void {
  for (const { conteudo } of useJanelasSoltasStore.getState().soltas) fecharSolta(chaveDe(conteudo));
}

/**
 * A janela solta que está com o foco, ou `null` quando é o Mestre. Serve a quem
 * pergunta alguma coisa ao mestre -- o "Apagar?" -- para perguntar na janela
 * em que ele está, e não no outro monitor.
 */
export function soltaComFoco(): string | null {
  for (const [id, filha] of filhas) {
    if (!filha.closed && filha.document.hasFocus()) return id;
  }
  return null;
}

/** O documento com o foco: o de uma janela solta, ou o do Mestre. */
export function documentoComFoco(): Document {
  const id = soltaComFoco();
  return (id ? janelaDaSolta(id)?.document : undefined) ?? document;
}
