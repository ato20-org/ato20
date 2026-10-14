"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

/** Onde o aparelho lembra se o jogador quer a página em tela cheia. */
const CHAVE = "ato20:jogador:tela-cheia";

/**
 * A entrada automática já foi tentada nesta página.
 *
 * No módulo, e não num `ref`: é UMA por carregamento da página. Quem saiu da
 * tela cheia pelo Esc ou pelo gesto do sistema saiu porque quis, e o toque
 * seguinte não pode jogá-lo de volta -- nem se a casca remontar.
 */
let tentou = false;

/** Ligada, a não ser que o jogador a tenha desligado no botão. */
function querTelaCheia(): boolean {
  try {
    return window.localStorage.getItem(CHAVE) !== "nao";
  } catch {
    return true;
  }
}

function guardar(quer: boolean) {
  try {
    window.localStorage.setItem(CHAVE, quer ? "sim" : "nao");
  } catch {
    // Sem onde guardar, vale só nesta página.
  }
}

function pedir() {
  void document.documentElement
    .requestFullscreen?.({ navigationUI: "hide" })
    .catch(() => {});
}

function assinar(aviso: () => void) {
  document.addEventListener("fullscreenchange", aviso);
  return () => document.removeEventListener("fullscreenchange", aviso);
}

const nunca = () => () => {};

/**
 * A página inteira do jogador em tela cheia: some a barra do navegador, e a
 * mesa fica com a tela toda. Não é a tela cheia do MAPA (`useFullscreen`), que
 * estica só a cena; esta deixa a ficha, o chat e o saquinho onde estão.
 *
 * Ligada por padrão, mas o navegador só concede tela cheia a um GESTO do
 * usuário -- abrir a página não basta. Então ela entra no primeiro toque ou
 * tecla depois de `automatica` (o jogador já dentro da mesa), uma vez por
 * página. Antes disso a tela é o campo do nome, e entrar em tela cheia com o
 * teclado subindo só faria a página pular.
 *
 * O botão é o que guarda a preferência: desligar nele vale para as próximas
 * vezes. Sair pelo Esc ou pelo gesto do sistema vale só para agora.
 *
 * Sem a API (o Safari do iPhone só dá tela cheia a `<video>`), `suportada` é
 * falso e quem chama não mostra o botão: lá não há CSS que esconda a barra do
 * navegador, e a página já ocupa toda a viewport que existe.
 */
export function useTelaCheiaDaPagina(automatica: boolean): {
  suportada: boolean;
  ativa: boolean;
  alternar: () => void;
} {
  const suportada = useSyncExternalStore(
    nunca,
    () =>
      document.fullscreenEnabled &&
      typeof document.documentElement.requestFullscreen === "function",
    () => false,
  );
  const ativa = useSyncExternalStore(
    assinar,
    () => document.fullscreenElement !== null,
    () => false,
  );

  useEffect(() => {
    if (!automatica || !suportada || tentou || !querTelaCheia()) return;
    if (document.fullscreenElement) return;

    function entrar(evento: Event) {
      // O Esc não é gesto que conceda tela cheia, e gastaria a única tentativa.
      if (evento instanceof KeyboardEvent && evento.key === "Escape") return;
      tirar();
      if (tentou || document.fullscreenElement) return;
      tentou = true;
      pedir();
    }
    function tirar() {
      document.removeEventListener("pointerup", entrar, true);
      document.removeEventListener("keydown", entrar, true);
    }

    // Na captura: um alvo que pare a propagação não pode engolir o gesto.
    // `pointerup`, e não `pointerdown`: no toque é a soltura que conta como
    // gesto, e um arrasto que vira rolagem não solta -- cancela.
    document.addEventListener("pointerup", entrar, true);
    document.addEventListener("keydown", entrar, true);
    return tirar;
  }, [automatica, suportada]);

  const alternar = useCallback(() => {
    if (document.fullscreenElement) {
      guardar(false);
      void document.exitFullscreen().catch(() => {});
      return;
    }
    guardar(true);
    pedir();
  }, []);

  return { suportada, ativa, alternar };
}
