"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";
import type { Sugestao } from "@/lib/mencoes/sugestao";

/**
 * Como quem abriu a lista reconhece que o toque foi nela.
 *
 * A lista vive num portal no `body`, então ela NÃO está dentro do campo — e o
 * papel do mestre fecha a edição a qualquer toque fora de si. Sem esta marca,
 * clicar numa sugestão fecharia a edição antes de a escolha ser aplicada.
 *
 * Um atributo e não uma classe: classe é estilo, e alguém a trocaria numa
 * arrumação de CSS sem saber que ela também é contrato.
 */
export const MARCA_LISTA = "data-postit-lista";

/** Largura da lista, em pixels de TELA. Ver o comentário do componente. */
const LARGURA_PX = 224;

/** Folga entre o papel e a lista, em pixels de tela. */
const FOLGA_PX = 4;

/**
 * A lista de nomes possíveis, enquanto um marcador está sendo digitado.
 *
 * ## Em portal, e em pixels de tela
 *
 * Nasceu para o postit, que escala com o zoom — é o que o faz parecer papel colado no mapa —, e
 * a lista NÃO pode escalar com ele. A 40% de zoom, seis linhas de nome viradas
 * papel seriam alvos de sete pixels; a 300%, uma lista de arquivo cobriria a
 * cena inteira. Então ela sai do palco por `createPortal` e se posiciona por
 * `getBoundingClientRect` do campo — que já traz a escala aplicada, e é o que
 * a mantém encostada no papel certo em qualquer ampliação.
 *
 * ## Sem foco
 *
 * A lista nunca recebe o foco: quem fica com ele é o `<textarea>`, do primeiro
 * caractere até a escolha. É por isso que a escolha pelo mouse acontece no
 * `mousedown` com `preventDefault` — um clique comum tiraria o foco do campo,
 * e o `onBlur` dele fecharia a edição no meio do gesto de escolher.
 *
 * No celular não há `mousedown` antes do toque terminar, mas o gesto é o
 * mesmo: o navegador emite os eventos de mouse compatíveis depois do `touch`,
 * e o `preventDefault` continua segurando o foco onde ele estava.
 *
 * O teclado é o caminho principal, e ele mora no `onKeyDown` do campo: as setas
 * andam, Enter e Tab escolhem, Esc fecha a lista sem sair da edição.
 */
export function ListaDeSugestoes({
  titulo,
  itens,
  indice,
  ancora,
  onEscolher,
}: {
  /**
   * O que a lista está oferecendo, numa linha: "Personagens da campanha",
   * "Arquivos deste personagem", "Notas do caderno".
   *
   * Vem de fora porque só quem abriu a lista sabe o que ela está mostrando:
   * o mesmo `/` pinça o acervo inteiro no postit do mestre e só os arquivos do
   * próprio personagem no caderno do jogador, e a linha de título é o que
   * conta essa diferença a quem está digitando.
   */
  titulo: string;
  itens: Sugestao[];
  /** Qual item está sob as setas. Enter escolhe este. */
  indice: number;
  /**
   * A marca de largura zero na posição do cursor, por referência.
   *
   * Por referência porque o elemento só existe depois do render que o cria, e
   * ler `ref.current` durante o render de quem chama seria ler o DOM antes de
   * ele estar pintado — o que às vezes acerta, e às vezes entrega `null` ou o
   * elemento do render anterior. Aqui a leitura acontece no efeito de layout,
   * que é onde o DOM já existe e ainda não houve pintura.
   *
   * A marca vive dentro do palco, então o retângulo dela já vem escalado pelo
   * zoom: a lista encosta na linha certa a 40% e a 300% sem nenhuma conta.
   */
  ancora: RefObject<HTMLElement | null>;
  onEscolher: (nome: string) => void;
}) {
  const caixa = useRef<HTMLDivElement | null>(null);

  /**
   * Põe a lista encostada no cursor, escrevendo no estilo direto.
   *
   * No DOM e não em estado: a posição é consequência de uma medida do próprio
   * DOM, e passar por `setState` faria um render a mais a cada tecla só para
   * chegar ao mesmo lugar. Efeito de LAYOUT e não `useEffect` — ele roda antes
   * da pintura, então a lista nunca aparece num canto e salta para o outro.
   *
   * Sem lista de dependências de propósito: o que a posição depende é do
   * tamanho medido do próprio elemento, que muda com o número de itens, com a
   * largura dos nomes e com o zoom do palco. Enumerar isso erraria por
   * omissão; medir a cada render acerta sempre e custa uma leitura.
   */
  useLayoutEffect(() => {
    const cursor = ancora.current;
    const elemento = caixa.current;
    if (!cursor || !elemento) return;

    // A marca tem largura zero e a altura de uma linha, então este retângulo é
    // o caret: `bottom` é o pé da linha que está sendo escrita, e `left` é a
    // coluna em que o mestre parou de digitar.
    const rect = cursor.getBoundingClientRect();
    const altura = elemento.offsetHeight;

    // Abre para baixo por padrão, e para cima quando não cabe: um postit no pé
    // da tela é o caso comum — o mestre anota onde o mapa está —, e a lista
    // fora da janela seria uma lista que não existe.
    const abaixo = rect.bottom + FOLGA_PX;
    const cabeAbaixo = abaixo + altura < window.innerHeight;

    // Presa à janela também na horizontal: papel na borda direita jogaria a
    // lista para fora da tela.
    const left = Math.min(
      Math.max(rect.left, FOLGA_PX),
      window.innerWidth - LARGURA_PX - FOLGA_PX,
    );

    elemento.style.left = `${left}px`;
    elemento.style.top = `${cabeAbaixo ? abaixo : Math.max(rect.top - altura - FOLGA_PX, FOLGA_PX)}px`;
  });

  if (itens.length === 0) return null;

  return createPortal(
    <div
      ref={caixa}
      {...{ [MARCA_LISTA]: "" }}
      // Acima do cartão da nota de alfinete (12000), que é o teto da escada do
      // palco: a lista nasce de um campo de texto e nada pode cobri-la.
      className="bg-popover text-popover-foreground fixed z-13000 overflow-hidden rounded-md border shadow-md"
      // `left` e `top` entram no efeito acima. Aqui só o que não depende de
      // medida — e a lista começa fora da vista, para o primeiro quadro não
      // piscar no canto da janela antes de ser posicionada.
      style={{ left: -9999, top: -9999, width: LARGURA_PX }}
      // Não é `role="listbox"` com o campo apontando para ela por
      // `aria-activedescendant`: o campo é um `<textarea>` livre, e não um
      // combobox — o marcador é um pedaço do texto, não o valor do campo.
      // Anunciar isto como caixa de seleção mentiria sobre o que Enter faz com o
      // resto da frase.
      role="presentation"
    >
      <p className="text-muted-foreground bg-muted/50 px-2 py-1 text-[10px]">{titulo}</p>

      <ul>
        {itens.map((item, posicao) => (
          <li key={item.nome}>
            <button
              type="button"
              className={cn(
                "flex w-full items-baseline gap-2 px-2 py-1 text-left text-xs",
                posicao === indice ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
              )}
              // `mousedown` com `preventDefault`, e não `click`: é o que impede
              // o campo de perder o foco — e com ele a edição — antes de a
              // escolha ser aplicada.
              onMouseDown={(event) => {
                event.preventDefault();
                onEscolher(item.nome);
              }}
            >
              <span className="min-w-0 flex-1 truncate">{item.nome}</span>

              {item.detalhe ? (
                <span className="text-muted-foreground shrink-0 text-[10px]">{item.detalhe}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      <p className="text-muted-foreground border-t px-2 py-1 text-[10px]">
        ↑↓ escolhe · Enter confirma · Esc fecha
      </p>
    </div>,
    document.body,
  );
}
