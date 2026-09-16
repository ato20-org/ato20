"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

/**
 * Reordenar uma lista arrastando a linha pela alça.
 *
 * O índice de destino sai da ALTURA DO CURSOR sobre a lista, e não de qual
 * linha recebeu o evento. É por causa do `setPointerCapture`: com a captura
 * ativa todos os eventos vão para a linha de origem, e ela nunca saberia por
 * cima de quem está passando. Sem a captura, arrastar rápido o bastante para o
 * cursor sair da linha encerraria o gesto no meio.
 *
 * Saiu do painel de camadas quando a lista de cenas passou a precisar do mesmo
 * gesto. Um laço de pointer capture é justamente o tipo de código que diverge
 * entre duas cópias — uma ganha o cancelamento por `pointercancel`, a outra
 * não —, e aqui as duas listas fazem exatamente a mesma coisa.
 *
 * `startReorder` é ESTÁVEL entre renders, e isso não é preciosismo: ele desce
 * como prop para cada linha da lista, e uma função nova por render faz o `memo`
 * da linha falhar em todas elas. Medido no cenário `camadas` do `/perf`: com o
 * painel aberto e sessenta itens na cena, arrastar um token custava 6737 ms de
 * JavaScript contra 394 ms do palco sozinho, porque as sessenta linhas
 * reconciliavam a cada quadro. Ver `LayerRow` e `SceneRow`.
 *
 * `onDrop` vive numa ref para isso ser possível: ele fecha sobre a cena do
 * chamador e muda a cada render, e prendê-lo nas dependências devolveria a
 * função nova que o `useCallback` existe para evitar. A ref é lida no FIM do
 * gesto, quando a versão mais recente é justamente o que se quer.
 *
 * Escrita num efeito, e não durante o render: `react-hooks/refs` recusa a
 * segunda forma, e aqui o efeito basta -- o gesto só lê a ref no `pointerup`,
 * muito depois de qualquer commit. `useEffectEvent` seria o invólucro natural
 * para isto, mas ele só pode ser chamado de dentro de um efeito, e quem chama
 * aqui é um ouvinte de ponteiro.
 */
/**
 * Como o índice de destino é lido do cursor.
 *
 * - `inserir`: entre linhas, pela metade de cada uma. É o de uma lista plana
 *   que só reordena: soltar abaixo do meio de uma linha é "depois dela".
 * - `sobre`: a linha que está SOB o cursor, inteira. É o de uma árvore em que
 *   soltar em cima de uma pasta significa "dentro dela" -- com o meio como
 *   divisor, a metade de baixo do cabeçalho caía na linha seguinte, e o item
 *   nunca entrava na pasta. Abaixo da última linha devolve `rows.length`: é
 *   "fora de tudo", e quem consome lê como raiz. Sem isso, com todos os itens
 *   em pastas, não havia onde soltar para tirar um de lá.
 */
export type ModoDeAlvo = "inserir" | "sobre";

export function useListReorder<T>(
  onDrop: (id: T, index: number) => void,
  modo: ModoDeAlvo = "inserir",
) {
  const listRef = useRef<HTMLUListElement>(null);
  /** Índice sob o cursor durante o arrasto, para a linha de inserção. */
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const onDropRef = useRef(onDrop);
  const modoRef = useRef(modo);
  useEffect(() => {
    onDropRef.current = onDrop;
    modoRef.current = modo;
  }, [onDrop, modo]);

  const startReorder = useCallback(function startReorder(
    event: ReactPointerEvent,
    id: T,
    /**
     * Pixels que o ponteiro tem de andar antes de o gesto virar arrasto.
     *
     * Ausente = arrasto desde o primeiro pixel, com o `click` suprimido: é a
     * alça, que só existe para isso. Presente = a linha INTEIRA é pegável, e
     * o clique continua sendo clique: sem andar, nada acontece aqui e o
     * `click` da linha segue o caminho de sempre. É como o Figma trata a
     * camada: pega em qualquer lugar dela, e um toque só seleciona.
     */
    limiar?: number,
  ) {
    if (event.button !== 0) return;

    // Evento de PORTAL: o menu de três pontos da linha desenha fora dela no
    // DOM, mas o React faz o pointerdown do item do menu borbulhar até aqui.
    // Armar o gesto por ele capturava o ponteiro na linha e roubava o `click`
    // do item -- nenhum botão do menu funcionava. O que não está dentro da
    // linha no DOM não é começo de arrasto.
    if (!(event.currentTarget as HTMLElement).contains(event.target as Node))
      return;

    // Sem `preventDefault` com limiar: ele mataria o `click` que a linha usa
    // para selecionar. A captura basta para o movimento continuar chegando.
    if (limiar === undefined) event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget as HTMLElement;
    const { pointerId, clientX: x0, clientY: y0 } = event;

    let arrastando = limiar === undefined;

    // Captura só quando é arrasto. Com a captura ativa desde o pointerdown, o
    // `click` do fim do gesto era redirecionado para a LINHA, e o botão de
    // dentro dela -- o nome que seleciona -- nunca o recebia: clicar numa
    // camada não selecionava nada. Antes do limiar, os eventos chegam por
    // borbulhar mesmo, porque o ponteiro ainda está sobre a linha.
    if (arrastando) target.setPointerCapture(pointerId);

    /**
     * Come o clique que o navegador dispara no fim do gesto.
     *
     * Só quando houve arrasto de verdade: sem isso, o clique que fecha o
     * gesto refaria a seleção para a linha arrastada. Mesmo cinto do
     * `useTokenDrag`, e pela mesma razão.
     *
     * O tempo zero basta para desarmar: o `click` nasce do mesmo evento de
     * entrada do `pointerup` e chega antes de qualquer temporizador. Sem isso,
     * um gesto solto fora da janela deixaria o comedor de tocaia e engoliria o
     * clique seguinte, que é do mestre.
     */
    const comerOProximoClique = () => {
      const comer = (native: MouseEvent) => {
        native.stopPropagation();
        native.preventDefault();
      };

      window.addEventListener("click", comer, { capture: true, once: true });
      window.setTimeout(() => {
        window.removeEventListener("click", comer, true);
      }, 0);
    };

    const indexFor = (clientY: number): number => {
      const rows = [...(listRef.current?.children ?? [])] as HTMLElement[];
      if (rows.length === 0) return 0;

      for (const [index, row] of rows.entries()) {
        const rect = row.getBoundingClientRect();
        const limite =
          modoRef.current === "sobre"
            ? rect.bottom
            : rect.top + rect.height / 2;
        if (clientY < limite) return index;
      }

      return modoRef.current === "sobre" ? rows.length : rows.length - 1;
    };

    const handleMove = (native: PointerEvent) => {
      if (native.pointerId !== pointerId) return;

      if (!arrastando) {
        if (Math.hypot(native.clientX - x0, native.clientY - y0) < (limiar ?? 0))
          return;
        arrastando = true;
        target.setPointerCapture(pointerId);
      }

      setDropIndex(indexFor(native.clientY));
    };

    const handleEnd = (native: PointerEvent) => {
      if (native.pointerId !== pointerId) return;

      if (target.hasPointerCapture(pointerId))
        target.releasePointerCapture(pointerId);
      target.removeEventListener("pointermove", handleMove);
      target.removeEventListener("pointerup", handleEnd);
      target.removeEventListener("pointercancel", handleEnd);

      // Soltou sem ter andado o limiar: foi clique, e clique não reordena.
      if (arrastando) {
        // O navegador dispara `click` no fim do gesto, e com a captura ativa
        // ele cai na LINHA -- onde mora o "selecionar". Sem comê-lo, arrastar
        // três linhas selecionadas terminava com uma só selecionada.
        comerOProximoClique();
        if (native.type === "pointerup")
          onDropRef.current(id, indexFor(native.clientY));
      }
      setDropIndex(null);
    };

    target.addEventListener("pointermove", handleMove);
    target.addEventListener("pointerup", handleEnd);
    target.addEventListener("pointercancel", handleEnd);
  }, []);

  return { listRef, dropIndex, startReorder };
}
