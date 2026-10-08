"use client";

import { useEffect } from "react";

import { atalhos } from "@/lib/mestre/atalhos";
import { colarImagemDoSistema } from "@/lib/mestre/colar-imagem";
import { colarTextoDoSistema } from "@/lib/mestre/texto-actions";

function isTyping(target: EventTarget | null): boolean {
  return Boolean(
    (target as HTMLElement | null)?.closest(
      "input, textarea, [contenteditable='true']",
    ),
  );
}

/**
 * A tecla nasceu num painel de nota ou de livro, ao lado do mapa?
 *
 * O painel recebe o foco quando é clicado (ver `PainelDeAbas`), e é isso que
 * põe a tecla aqui dentro em vez de no `body`. Lendo o livro, o Delete não
 * pode apagar o token selecionado no mapa, nem a seta andar com a câmera.
 */
function noPainelLateral(target: EventTarget | null): boolean {
  return Boolean((target as HTMLElement | null)?.closest?.("[data-painel-lateral]"));
}

/**
 * Os grupos que agem sobre o PALCO, e por isso calam com o foco num painel.
 * Paleta, som e os comandos de plugin continuam valendo: são da sessão, e não
 * do mapa.
 */
const GRUPOS_DO_PALCO: ReadonlySet<string> = new Set([
  "Desfazer",
  "Área de transferência",
  "Câmera",
  "Camadas",
  "Seleção",
  "Mesa",
]);

/**
 * Atalhos do Mestre.
 *
 * O listener é um laço sobre a tabela de `atalhos.ts`, e não um encadeado de
 * `if` com o mapeamento embutido: a MESMA tabela é o que a lista de atalhos em
 * Configurações desenha, e é isso que impede a interface de anunciar uma tecla
 * que o listener não atende mais.
 *
 * O efeito roda uma única vez: as ações leem o estado atual por conta própria,
 * então o listener nunca precisa ser remontado.
 */
export function useMestreShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;

      // Quem casa primeiro executa, e mais ninguém é consultado -- a ordem da
      // tabela É a precedência. Ver a nota em `ATALHOS_BASE`. A tabela é
      // consultada a cada tecla e não capturada no efeito: os comandos dos
      // plugins entram e saem dela conforme extensões são ligadas.
      const doPainel = noPainelLateral(event.target);
      const atalho = atalhos().find(
        ({ combina, grupo }) =>
          !(doPainel && GRUPOS_DO_PALCO.has(grupo)) && combina(event),
      );
      if (!atalho) return;

      if (atalho.impedirPadrao) event.preventDefault();

      atalho.executar(event);
    };

    // O texto do sistema entra por aqui, e não pelo Ctrl+V da tabela: o
    // atalho deixa a tecla passar quando não tem nada interno, e o browser
    // dispara `paste` com o texto pronto. Ver `colarTextoDoSistema`.
    const handlePaste = (event: ClipboardEvent) => {
      if (isTyping(event.target) || noPainelLateral(event.target)) return;

      // Imagem ANTES do texto, e a ordem é a regra: um endereço de imagem
      // também é texto, e o ramo de baixo o transformaria numa nota no quadro
      // em vez de baixar a figura. Ver `colarImagemDoSistema`.
      if (colarImagemDoSistema(event)) {
        event.preventDefault();

        return;
      }

      const texto = event.clipboardData?.getData("text/plain");
      if (texto && colarTextoDoSistema(texto)) event.preventDefault();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("paste", handlePaste);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("paste", handlePaste);
    };
  }, []);
}
