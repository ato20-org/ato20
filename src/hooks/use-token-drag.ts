"use client";

import { useCallback, type PointerEvent as ReactPointerEvent } from "react";

import {
  aceita,
  chaveDoAlvo,
  PASSO_DA_RODA,
  useTokenDragStore,
  type DestinoDoArrasto,
  type FonteDoArrasto,
} from "@/lib/store/use-token-drag-store";

/**
 * Quanto o ponteiro precisa andar para ser arrasto e não clique.
 *
 * A linha do personagem tem dois papéis no mesmo alvo: clicar abre a ficha,
 * arrastar leva o token ao mapa. O mesmo vale para a linha do acervo e para o
 * quadro do inventário, que abrem o que mostram. Sem esta folga, o tremor da
 * mão ao clicar num nome levantaria o token.
 */
const LIMIAR_PX = 6;

export type TokenParaArrastar = {
  fonte: FonteDoArrasto;
  /** O tamanho de nascença, em unidades de cena. Ver `fitInitialSize`. */
  largura: number;
  altura: number;
};

/**
 * Leva uma imagem ao mapa, com prévia e com a roda escolhendo o tamanho no ar.
 *
 * Serve às três origens que despejam imagem na mesa — a linha do personagem, a
 * linha do acervo e o quadro do inventário —, e também aos destinos que essas
 * listas têm entre si: pasta do acervo e a ficha de outro personagem. Um gesto
 * só, porque um `pointerdown` só pode iniciar um, e decidir qual antes de saber
 * para onde a mão vai é impossível.
 *
 * Irmão do `useScreenDrag` e do `useSceneDrag`, e não um parâmetro deles: este
 * gesto atravessa a tela inteira, da lista até o plano da cena, e o que ele
 * move não existe em lugar nenhum enquanto está no ar — ele mora no
 * `useTokenDragStore` até ser solto. Os outros dois movem algo que já está lá.
 *
 * Por que não é o arrasto do navegador está escrito no cabeçalho do store; o
 * resumo é que o arrasto nativo engole a roda e esconde o conteúdo do que está
 * sendo arrastado, que são as duas coisas que a prévia precisa.
 */
export function useTokenDrag() {
  return useCallback((event: ReactPointerEvent, token: TokenParaArrastar) => {
    if (event.button !== 0) return;

    // Sem `preventDefault` aqui, de propósito: enquanto não se sabe se é clique
    // ou arrasto, o clique tem de continuar possível — e `preventDefault` no
    // pointerdown mata os eventos de mouse de compatibilidade, o `click` entre
    // eles, que é o que abre a ficha do personagem.
    const alvo = event.currentTarget as HTMLElement;
    const { pointerId, clientX: startX, clientY: startY } = event;
    const { pegar, mover, ajustar, largar } = useTokenDragStore.getState();

    let pegou = false;
    /**
     * Desistiu no `Escape`, mas ainda com o botão pressionado.
     *
     * Marca em vez de desmontar tudo na hora: o clique do fim do gesto só nasce
     * quando a mão solta, e sem ficar de guarda até lá a ficha do personagem
     * abriria justamente na desistência.
     */
    let desistiu = false;
    let frame: number | undefined;
    let pending: PointerEvent | null = null;

    /**
     * Come o clique que o navegador dispara no fim do gesto.
     *
     * Só quando houve arrasto. Com a captura ativa o `click` cai na LINHA e não
     * no botão de dentro, então ele já não abriria a ficha na maioria dos
     * casos — mas "na maioria dos casos" aqui significa a ficha do personagem
     * abrindo sozinha toda vez que o mestre põe um token no mapa, e o cinto
     * custa quatro linhas.
     *
     * Vale também para a desistência por `Escape`: ali o botão continua
     * pressionado, e o clique vem quando a mão solta.
     */
    const comerClique = (native: MouseEvent) => {
      native.stopPropagation();
      native.preventDefault();
    };

    const comerOProximoClique = () => {
      window.addEventListener("click", comerClique, {
        capture: true,
        once: true,
      });
      // Se o clique não vier — solto fora da janela, gesto cancelado pelo
      // sistema —, o comedor ficaria de tocaia e engoliria o clique seguinte,
      // que é do mestre. O tempo zero basta: o `click` nasce do mesmo evento de
      // entrada do `pointerup` e chega antes de qualquer temporizador.
      window.setTimeout(() => {
        window.removeEventListener("click", comerClique, true);
      }, 0);
    };

    const posicao = (native: PointerEvent) => {
      mover(native.clientX, native.clientY, destinoSob(native, token.fonte));
    };

    /** A roda, enquanto o token está no ar: tamanho, não zoom do palco. */
    const handleWheel = (native: WheelEvent) => {
      // Na captura e com `stopPropagation` porque o palco também escuta a roda,
      // e lá ela é zoom. Sem barrar aqui, um entalhe faria as duas coisas: o
      // token cresceria e o mapa saltaria debaixo dele.
      native.preventDefault();
      native.stopPropagation();
      ajustar(native.deltaY < 0 ? PASSO_DA_RODA : 1 / PASSO_DA_RODA);
    };

    /** `Escape` desiste, como no arrasto do navegador. */
    const handleKey = (native: KeyboardEvent) => {
      if (native.key !== "Escape") return;

      native.preventDefault();
      desistiu = true;
      // A roda volta a ser o zoom do palco no mesmo instante: o gesto acabou
      // para todos os efeitos, o que falta é só a mão largar o botão.
      window.removeEventListener("wheel", handleWheel, true);
      window.removeEventListener("keydown", handleKey, true);
      largar();
    };

    const levantar = (native: PointerEvent) => {
      pegou = true;
      alvo.setPointerCapture(pointerId);
      window.addEventListener("wheel", handleWheel, {
        capture: true,
        passive: false,
      });
      window.addEventListener("keydown", handleKey, true);
      pegar({
        ...token,
        fator: 1,
        x: native.clientX,
        y: native.clientY,
        destino: destinoSob(native, token.fonte),
      });
    };

    /**
     * Um commit por quadro, no máximo. Mesma razão do `useScreenDrag`: mouse de
     * alta taxa reporta acima de 60 Hz, e cada evento entregue viraria uma
     * escrita no store — logo um redesenho da prévia.
     */
    const handleMove = (native: PointerEvent) => {
      if (native.pointerId !== pointerId) return;

      if (!pegou) {
        const andou = Math.hypot(
          native.clientX - startX,
          native.clientY - startY,
        );
        if (andou < LIMIAR_PX) return;

        levantar(native);
        return;
      }

      pending = native;
      if (frame !== undefined) return;

      frame = requestAnimationFrame(() => {
        frame = undefined;
        const ultimo = pending;
        pending = null;
        if (ultimo) posicao(ultimo);
      });
    };

    function desmontar() {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
      pending = null;

      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleCancel);
      window.removeEventListener("wheel", handleWheel, true);
      window.removeEventListener("keydown", handleKey, true);
      if (pegou && alvo.hasPointerCapture(pointerId)) {
        alvo.releasePointerCapture(pointerId);
      }
    }

    const handleCancel = (native: PointerEvent) => {
      if (native.pointerId !== pointerId) return;

      desmontar();
      largar();
    };

    const handleEnd = (native: PointerEvent) => {
      if (native.pointerId !== pointerId) return;

      // O último movimento pendente entra antes do fim: descartá-lo poria o
      // token um quadro atrás de onde a mão soltou.
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (pending) posicao(pending);

      const emMaos = desistiu ? null : useTokenDragStore.getState().arrasto;
      desmontar();

      if (!pegou) return;

      comerOProximoClique();
      largar();

      // Solto onde nada recebe — sobre uma janela da bancada, sobre a folga em
      // volta do mapa, sobre uma pasta que recusa item — não faz nada. É o que
      // a prévia prometeu ao sumir.
      const destino = emMaos?.destino;
      if (!emMaos || !destino) return;

      useTokenDragStore.getState().alvos[chaveDoAlvo(destino)]?.(
        emMaos,
        destino,
      );
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleCancel);
  }, []);
}

/**
 * Que alvo está sob o ponteiro, entre os que aceitam o que está na mão.
 *
 * Por consulta ao que está DESENHADO no ponto, e não por comparação com os
 * retângulos de cada alvo: as janelas da bancada ficam sobre o palco, e pelo
 * retângulo uma prévia escondida atrás da lista de personagens ainda contaria
 * como "sobre o mapa". A prévia não tem `pointer-events`, então ela nunca é a
 * resposta.
 *
 * Os alvos se anunciam por atributo no DOM, e não por registro de coordenadas
 * no store: o de cima ganha, que é o que `elementFromPoint` responde de graça —
 * e uma pasta rolada para fora da vista deixa de ser alvo sem ninguém precisar
 * avisar.
 */
function destinoSob(
  native: PointerEvent,
  fonte: FonteDoArrasto,
): DestinoDoArrasto | null {
  const sob = document.elementFromPoint(native.clientX, native.clientY);
  if (!sob) return null;

  const destino = ler(sob);
  if (!destino || !aceita(fonte, destino)) return null;

  // Ninguém registrado para receber é o mesmo que alvo nenhum: a ficha pode ter
  // fechado no meio do gesto, e acender uma borda que não vai receber nada é
  // justamente a promessa que este gesto existe para não quebrar.
  return useTokenDragStore.getState().alvos[chaveDoAlvo(destino)]
    ? destino
    : null;
}

function ler(sob: Element): DestinoDoArrasto | null {
  const pasta = sob.closest<HTMLElement>("[data-pasta-acervo]");
  // A pasta é lida ANTES do palco de propósito: o painel do acervo é uma janela
  // da bancada, e ela fica por cima do mapa. Quem está por cima é quem recebe.
  if (pasta) {
    return { tipo: "pasta", folderId: pasta.dataset.folderId || undefined };
  }

  // A bolinha do handout também fica por cima do mapa, e o painel dela idem.
  if (sob.closest("[data-handout]")) return { tipo: "handout" };

  // Antes do palco: o editor da nota ocupa o lugar dele e não é palco.
  if (sob.closest("[data-nota-editor]")) return { tipo: "nota" };

  const arquivos = sob.closest<HTMLElement>("[data-pasta-arquivos]");
  if (arquivos)
    return { tipo: "pasta-arquivos", pastaId: arquivos.dataset.pastaId || undefined };

  const inventario = sob.closest<HTMLElement>("[data-inventario]");
  if (inventario?.dataset.personagemId) {
    return {
      tipo: "inventario",
      personagemId: inventario.dataset.personagemId,
    };
  }

  return sob.closest("[data-palco]") ? { tipo: "palco" } : null;
}
