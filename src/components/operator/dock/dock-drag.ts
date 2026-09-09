"use client";

import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";

import { useScreenDrag } from "@/hooks/use-screen-drag";
import { useDockDragStore, type Retangulo } from "@/lib/store/use-dock-drag-store";
import { useLayoutStore, type AlvoDock, type Lado } from "@/lib/store/use-layout-store";
import { chaveDe, useWindowStore, type ConteudoJanela } from "@/lib/store/use-window-store";

/**
 * Onde a borda deixa de dividir e passa a fundir.
 *
 * Um quarto de cada ponta. Menos que isso e acertar "divide" numa região baixa
 * — a de camadas, com 40% de uma coluna — exigiria pontaria; mais que isso e o
 * meio, que é o gesto mais comum, ficaria com uma faixa estreita.
 */
const BORDA = 0.25;

/** Quanto da beirada da linha atraca numa coluna que está vazia. */
const BANDA_PX = 72;

/**
 * O quanto a etiqueta fica adiantada do cursor.
 *
 * Abaixo e à direita, para o ponteiro não ficar em cima do texto dela — é o
 * ponteiro que decide a zona de encaixe, e cobri-lo esconderia justamente o que
 * o mestre está mirando.
 */
const FANTASMA_OFFSET = 14;

/**
 * Quanto o ponteiro precisa andar para ser arrasto e não clique.
 *
 * Existe por causa da aba: pressionar já a escolhe, e sem esta folga o tremor
 * da mão ao clicar tiraria a aba do grupo.
 */
const LIMIAR_PX = 6;

type Regiao = {
  lado: Lado;
  grupoId: string;
  indice: number;
  rect: DOMRect;
};

type Medida = {
  camada: DOMRect | null;
  regioes: Regiao[];
  /** Lados que estão à vista e sem região nenhuma. Ver `BANDA_PX`. */
  vazios: Lado[];
};

/**
 * Mede a bancada UMA vez, no começo do gesto.
 *
 * Por consulta ao DOM, e não por um registro de refs no store: as colunas não
 * se movem durante o arrasto — atracar só acontece ao soltar —, então uma
 * medida serve para o gesto inteiro. Um registro precisaria ser mantido
 * atualizado e limpo quando um grupo desaparece, para dar exatamente estes
 * mesmos retângulos.
 */
function medir(vazios: Lado[]): Medida {
  const camada = document.querySelector("[data-dock-camada]")?.getBoundingClientRect() ?? null;

  const regioes: Regiao[] = [];
  const contagem: Record<string, number> = { esquerda: 0, direita: 0 };

  for (const elemento of document.querySelectorAll("[data-dock-grupo]")) {
    const grupoId = elemento.getAttribute("data-dock-grupo");
    const lado = elemento.getAttribute("data-dock-lado") as Lado | null;
    if (!grupoId || (lado !== "esquerda" && lado !== "direita")) continue;

    regioes.push({ lado, grupoId, indice: contagem[lado]++, rect: elemento.getBoundingClientRect() });
  }

  return { camada, regioes, vazios };
}

/** O retângulo do alvo, em coordenadas da camada. */
function relativo(rect: DOMRect, camada: DOMRect | null, fatia?: "topo" | "base"): Retangulo {
  const left = rect.left - (camada?.left ?? 0);
  const top = rect.top - (camada?.top ?? 0);

  if (!fatia) return { left, top, width: rect.width, height: rect.height };

  const altura = rect.height * BORDA;

  return {
    left,
    top: fatia === "topo" ? top : top + rect.height - altura,
    width: rect.width,
    height: altura,
  };
}

/**
 * A identidade de um alvo, para saber se ele mudou.
 *
 * O retângulo é derivado do alvo, então comparar o alvo basta — e é o que evita
 * uma escrita no store por quadro do arrasto quando o ponteiro se move DENTRO da
 * mesma zona, que é a maior parte do gesto.
 */
function identidade(alvo: AlvoDock | null): string {
  if (!alvo) return "";
  if (alvo.onde === "aba") return `${alvo.lado}:aba:${alvo.grupoId}`;
  if (alvo.onde === "coluna") return `${alvo.lado}:coluna`;

  return `${alvo.lado}:${alvo.onde}:${alvo.indice}`;
}

/** Que alvo está sob o ponteiro, se algum. */
function alvoEm(medida: Medida, x: number, y: number): { alvo: AlvoDock; retangulo: Retangulo } | null {
  for (const regiao of medida.regioes) {
    const { rect } = regiao;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;

    const proporcao = (y - rect.top) / rect.height;

    if (proporcao < BORDA) {
      return {
        alvo: { lado: regiao.lado, onde: "antes", indice: regiao.indice },
        retangulo: relativo(rect, medida.camada, "topo"),
      };
    }

    if (proporcao > 1 - BORDA) {
      return {
        alvo: { lado: regiao.lado, onde: "depois", indice: regiao.indice },
        retangulo: relativo(rect, medida.camada, "base"),
      };
    }

    return {
      alvo: { lado: regiao.lado, onde: "aba", grupoId: regiao.grupoId },
      retangulo: relativo(rect, medida.camada),
    };
  }

  // Coluna que ficou sem nenhuma região não tem retângulo para medir: o alvo
  // dela é uma faixa na beirada da linha. Sem isso, tirar a última aba de um
  // lado deixaria aquele lado inalcançável para sempre.
  const { camada } = medida;
  if (camada) {
    for (const lado of medida.vazios) {
      const dentroX =
        lado === "esquerda" ? x <= camada.left + BANDA_PX : x >= camada.right - BANDA_PX;

      if (dentroX && y >= camada.top && y <= camada.bottom) {
        return {
          alvo: { lado, onde: "coluna" },
          retangulo: {
            left: lado === "esquerda" ? 0 : camada.width - BANDA_PX,
            top: 0,
            width: BANDA_PX,
            height: camada.height,
          },
        };
      }
    }
  }

  return null;
}

/**
 * Arrastar uma janela procurando lugar.
 *
 * Um hook para as duas origens do gesto — o cabeçalho de uma janela flutuante e
 * a aba de uma atracada — porque o que acontece no meio é idêntico: mede a
 * bancada, acende o alvo sob o ponteiro, e ao soltar atraca ali. O que difere é
 * só o que fazer enquanto arrasta (a flutuante se move) e o que fazer quando
 * não há alvo (a flutuante fica onde parou; a atracada se solta).
 */
export function useDockDrag() {
  const startDrag = useScreenDrag();

  const mirar = useDockDragStore((state) => state.mirar);
  const pegar = useDockDragStore((state) => state.pegar);
  const limpar = useDockDragStore((state) => state.limpar);

  const atracar = useLayoutStore((state) => state.atracar);
  const layout = useLayoutStore((state) => state.layout);

  const fecharFlutuante = useWindowStore((state) => state.fechar);

  const medida = useRef<Medida | null>(null);
  const alvo = useRef<{ alvo: AlvoDock; retangulo: Retangulo } | null>(null);
  const mexeu = useRef(false);

  return useCallback(
    (
      event: ReactPointerEvent,
      opcoes: {
        conteudo: ConteudoJanela;
        /** Enquanto arrasta. A flutuante se move; a aba não faz nada. */
        aoMover?: (delta: { x: number; y: number }) => void;
        /** Soltou fora de qualquer alvo, tendo mesmo arrastado. */
        aoSoltarSolto?: (ponto: { x: number; y: number }) => void;
        /**
         * O título da etiqueta que segue o cursor, quando faz sentido ter uma.
         *
         * A aba passa; o cabeçalho de janela flutuante não, porque ali quem
         * segue o cursor é a janela inteira.
         */
        fantasma?: string;
        /**
         * O gesto acabou, qualquer que seja o desfecho.
         *
         * Existe para o que é só aparência — a janela deixar de parecer
         * levantada. Pendurar isso no `aoSoltarSolto` a deixaria pálida para
         * sempre quando ela atracasse, e num `pointerup` à mão não cobriria o
         * `pointercancel`, que é o que acontece quando o sistema rouba o
         * ponteiro no meio do arrasto.
         */
        aoTerminar?: () => void;
      },
    ) => {
      const vazios = (["esquerda", "direita"] as const).filter(
        (lado) => layout[lado].grupos.length === 0,
      );

      medida.current = medir(vazios);
      alvo.current = null;
      mexeu.current = false;

      startDrag(event, {
        onMove: (delta, nativo) => {
          const passou = Math.abs(delta.x) > LIMIAR_PX || Math.abs(delta.y) > LIMIAR_PX;

          // A etiqueta nasce no quadro em que o gesto deixa de ser clique: mais
          // cedo, um toque na aba faria um fantasma piscar sem ninguém ter
          // arrastado nada.
          if (passou && !mexeu.current && opcoes.fantasma) {
            pegar(
              opcoes.fantasma,
              nativo.clientX - (medida.current?.camada?.left ?? 0) + FANTASMA_OFFSET,
              nativo.clientY - (medida.current?.camada?.top ?? 0) + FANTASMA_OFFSET,
            );
          }

          if (passou) mexeu.current = true;
          if (!mexeu.current) return;

          opcoes.aoMover?.(delta);

          // Direto no DOM, como o resto dos gestos: a etiqueta acompanha o
          // cursor a cada quadro, e pelo store isso seria um render por quadro.
          const etiqueta = document.querySelector<HTMLElement>("[data-dock-fantasma]");
          if (etiqueta) {
            const camada = medida.current?.camada;
            etiqueta.style.left = `${nativo.clientX - (camada?.left ?? 0) + FANTASMA_OFFSET}px`;
            etiqueta.style.top = `${nativo.clientY - (camada?.top ?? 0) + FANTASMA_OFFSET}px`;
          }

          const achado = medida.current
            ? alvoEm(medida.current, nativo.clientX, nativo.clientY)
            : null;

          if (identidade(achado?.alvo ?? null) === identidade(alvo.current?.alvo ?? null)) return;

          alvo.current = achado;
          mirar(achado?.alvo ?? null, achado?.retangulo ?? null);
        },
        onEnd: (nativo) => {
          limpar();
          opcoes.aoTerminar?.();

          if (!mexeu.current) return;

          if (alvo.current) {
            // Sai da pilha flutuante antes de entrar na bancada: a mesma chave
            // nos dois lugares desenharia a janela duas vezes.
            fecharFlutuante(chaveDe(opcoes.conteudo));
            atracar(alvo.current.alvo, opcoes.conteudo);
            return;
          }

          opcoes.aoSoltarSolto?.({ x: nativo.clientX, y: nativo.clientY });
        },
      });
    },
    [startDrag, mirar, pegar, limpar, atracar, fecharFlutuante, layout],
  );
}
