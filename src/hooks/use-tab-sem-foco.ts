"use client";

import { useEffect } from "react";

/**
 * O Tab não passeia o foco pelo Mestre.
 *
 * O Tab do navegador anda de botão em botão, e numa tela feita de ícones isso
 * é um anel de foco pulando pela barra, pelas abas e pelo dock sem ninguém ter
 * pedido -- e um Espaço depois disso aperta o botão que o Tab deixou marcado. A
 * mesa é operada com o mouse, como diz o `select-none` da raiz em
 * `globals.css`, e o teclado dela são os atalhos de `atalhos.ts`.
 *
 * Em lugar nenhum, campo de texto incluso: num formulário o próximo campo é com
 * o clique. Quem dá ao Tab um uso próprio continua dando -- o recuo da nota, a
 * sugestão de menção no fio e no postit --, porque o `preventDefault` daqui não
 * para a tecla, e nenhum deles confere `defaultPrevented`.
 *
 * Na captura do documento, e não no `keydown` dos atalhos: aquele cala dentro de
 * campo de texto e só monta com a campanha aberta, e este vale para a porta e
 * para o splash também. Com Ctrl, Alt ou Super a tecla passa: é combinação, não
 * navegação.
 *
 * Só no Mestre. O celular do jogador com teclado ainda anda de campo em campo
 * pela ficha, e a TV não tem teclado.
 */
export function useTabSemFoco(): void {
  useEffect(() => {
    const barrar = (evento: KeyboardEvent) => {
      // O `code` também: com Shift, o X manda `ISO_Left_Tab`, e o WebKitGTK o
      // entrega como `key: "Unidentified"`. Medido numa webview 4.1 em Xvfb --
      // só pelo `key`, o Shift+Tab escapava e andava o foco para trás.
      if (evento.key !== "Tab" && evento.code !== "Tab") return;
      if (evento.ctrlKey || evento.altKey || evento.metaKey) return;

      evento.preventDefault();
    };

    document.addEventListener("keydown", barrar, true);

    return () => document.removeEventListener("keydown", barrar, true);
  }, []);
}
