"use client";

import { useSyncExternalStore } from "react";

/**
 * Que motor de navegador está desenhando esta tela.
 *
 * O ATO20 não perguntava isso, e passou a perguntar por uma razão medida: o
 * retrato ao vivo embute a página de um serviço externo, e essa página pode
 * simplesmente não funcionar aqui. É diferente de tudo o que o projeto desenha,
 * porque o conteúdo não é nosso e não há como testá-lo antes de mostrá-lo.
 */

/**
 * Este motor é WebKit — Safari e parentes?
 *
 * `AppleWebKit` sem `Chrome`/`Chromium`. Chrome e Edge carregam os dois na
 * marca, então a segunda metade é o que os separa; o Firefox não tem a
 * primeira.
 *
 * O caso que faz esta conta valer a pena é o iPhone: a Apple obriga todo
 * navegador de iOS a usar o WebKit dela, e eles se anunciam `CriOS` (Chrome),
 * `FxiOS` (Firefox) e `EdgiOS` — nenhum casa com `Chrom(e|ium)`. Então os três
 * caem aqui como WebKit, que é o que eles de fato são.
 *
 * Medido no motor do aplicativo, o webkit2gtk-4.1 2.52.5:
 * `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko)
 *  Version/60.5 Safari/605.1.15`
 *
 * Farejar `userAgent` é o que é: uma aposta que envelhece. Está aqui porque a
 * alternativa é pior — ver a página de erro de um serviço no lugar do rosto de
 * um personagem, na TV, no meio da sessão. E porque não há outra: o quadro é de
 * outra origem, o evento de carga dispara igual quando o conteúdo é um erro, e
 * nada dentro dele é legível daqui.
 */
export function motorWebKit(): boolean {
  if (typeof navigator === "undefined") return false;

  const marca = navigator.userAgent;

  return /AppleWebKit/.test(marca) && !/Chrom(e|ium)/.test(marca);
}

/**
 * Esta tela consegue desenhar uma página viva embutida?
 *
 * Hoje a resposta é "qualquer motor menos o WebKit", e o motivo é do lado de
 * fora. Medido no C.R.I.S., que é a primeira fonte que existe: a aplicação dele
 * não resolve a própria rota no WebKit e redireciona para a raiz do site —
 * dentro de quadro OU aberta direto, o que descarta o embutimento como causa.
 * O que aparece no lugar do retrato é a página de "não encontrado" DELES.
 *
 * Testado e descartado, um a um: o `sandbox`, o `referrerPolicy`, cookie de
 * terceiro (`--cookies-policy=always`), ITP (já vem desligada) e suporte de JS
 * moderno — `structuredClone`, lookbehind, `Object.hasOwn`, `IndexedDB` e mais
 * seis passam no motor do aplicativo.
 *
 * Vale para TODA fonte, e não só para o C.R.I.S., de propósito: uma lista de
 * serviços quebrados por motor seria uma tabela para alguém manter, e o que se
 * sabe hoje é que este motor não dá conta da única fonte que existe.
 *
 * A consequência boa é que a mesa continua vendo: Espectador e Jogador rodam no
 * navegador de verdade da TV e do celular. A ruim é o iPhone, onde não há
 * escapatória — e a bancada do mestre no Linux, que é WebKitGTK.
 */
export function usePaginaVivaSuportada(): boolean {
  return useSyncExternalStore(
    // Nunca muda durante a vida da aba: a inscrição não tem o que observar.
    () => () => {},
    () => !motorWebKit(),
    // O HTML pré-renderizado não sabe onde vai rodar, e `false` é o que ele
    // contém. Desenhar o quadro só depois da hidratação é o lado seguro: o
    // contrário faria o primeiro quadro trazer um retrato que some.
    () => false,
  );
}
