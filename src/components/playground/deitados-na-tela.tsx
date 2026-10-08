"use client";

import { memo, useLayoutEffect, useRef } from "react";

import { FiguraComEfeitos } from "@/components/playground/figura-com-efeitos";
import { useAssetUrl } from "@/hooks/use-asset-url";
import type { EfeitoPedido } from "@/lib/condicao";
import {
  deitadoNoTripe,
  type CameraAssinavel,
} from "@/lib/geometry/camera-orbital";
import { cantosDeitado } from "@/lib/geometry/peca-de-esguelha";
import type { Vec } from "@/lib/geometry/transform";
import type { CanvasItem } from "@/types/scene";

/** Uma figura deitada, com o que as condições fazem com ela. */
export type Deitado = {
  item: CanvasItem;
  efeitos?: ReadonlyArray<EfeitoPedido>;
  /** O efeito pausado: o Mestre só anima o selecionado. Ver `animarSo`. */
  parado?: boolean;
};

/**
 * O relevo do `SceneLayer` deitado, em unidades de cena: a borda escura que
 * descola a figura do piso e a sombra curta que diz que ela tem corpo. Aqui a
 * caixa está em pixels de tela e gira com a figura, então os números são
 * escalados e a sombra é desgirada a cada quadro. Ver `RELEVO_DO_DEITADO`.
 */
const SOMBRA = { x: 2, y: 4, borrao: 3 };

/** Os cantos no `data-deitada`, lidos uma vez por commit. Ver `escrever`. */
function cantosEmTexto(item: CanvasItem): string {
  return cantosDeitado(item)
    .map(({ x, y }) => `${x},${y}`)
    .join(";");
}

function lerCantos(texto: string | undefined): Vec[] | null {
  if (!texto) return null;
  return texto.split(";").map((par) => {
    const [x = 0, y = 0] = par.split(",").map(Number);
    return { x, y };
  });
}

/**
 * As figuras DEITADAS do 2.5D do Mestre, fora do piso.
 *
 * No piso elas eram pintadas na textura do chão, que o WebKitGTK rasteriza no
 * tamanho do plano e estica: um token de dez unidades eram dez pixels de
 * textura, borrados de perto, enquanto a figura em pé ao lado saía nítida.
 * Aqui cada uma é uma caixa do tamanho em que aparece na tela, levada ao
 * quadrilátero dela no chão por `deitadoNoTripe` -- o mesmo caminho da figura
 * em pé (`figuraNoTripe`), e a mesma variante `mini` que ela pede.
 *
 * Por cima do piso, e por isso por cima do escuro e da névoa, como a figura em
 * pé. Só no Mestre, onde os dois são translúcidos: na mesa a névoa tem de
 * cobrir o que esconde, e lá a figura deitada continua no piso.
 *
 * Abaixo do `ChaoInclinado` no DOM: parede e figura em pé a cobrem, que é o
 * que o chão sempre fez com ela.
 */
export const DeitadosNaTela = memo(function DeitadosNaTela({
  deitados,
  camera,
}: {
  deitados: ReadonlyArray<Deitado>;
  camera: CameraAssinavel;
}) {
  const raiz = useRef<HTMLDivElement | null>(null);

  /**
   * Escreve cada caixa a cada aviso da câmera, como o `ChaoInclinado` escreve
   * as figuras em pé: direto no `style`, sem render.
   *
   * Sem lista de dependências: um commit pode trazer uma figura nova, ou a
   * mesma em outro lugar -- arrastada --, e ela tem de estar no lugar antes da
   * pintura. Só escreve a visibilidade quando ela muda.
   */
  useLayoutEffect(() => {
    if (!raiz.current) return;

    const elementos = [
      ...raiz.current.querySelectorAll<HTMLElement>("[data-deitada]"),
    ];
    const cantos = elementos.map((elemento) =>
      lerCantos(elemento.dataset.deitada),
    );
    const giros = elementos.map(
      (elemento) => (Number(elemento.dataset.giro) * Math.PI) / 180,
    );
    const lados = elementos.map((elemento) => Number(elemento.dataset.lado));
    const escondido = elementos.map(
      (elemento) => elemento.style.visibility === "hidden",
    );

    function escrever() {
      const vista = camera.olho?.() ?? null;
      elementos.forEach((elemento, i) => {
        const pontos = cantos[i];
        const naTela =
          vista && pontos ? deitadoNoTripe(vista.tripe, vista.tela, pontos) : null;

        if (naTela) {
          const { largura, altura, matriz } = naTela;
          elemento.style.width = `${largura}px`;
          elemento.style.height = `${altura}px`;
          elemento.style.transform = matriz;

          // A sombra em pixels da caixa, e na direção da CENA: a caixa gira
          // com a figura, e o relevo do piso não girava.
          const escala = largura / (lados[i] || 1);
          const cos = Math.cos(giros[i] ?? 0);
          const sen = Math.sin(giros[i] ?? 0);
          const x = (SOMBRA.x * cos + SOMBRA.y * sen) * escala;
          const y = (SOMBRA.y * cos - SOMBRA.x * sen) * escala;
          elemento.style.filter = `drop-shadow(0 0 ${escala}px rgba(0,0,0,0.9)) drop-shadow(${x}px ${y}px ${SOMBRA.borrao * escala}px rgba(0,0,0,0.6))`;
        }

        const atras = !naTela;
        if (atras === escondido[i]) return;
        escondido[i] = atras;
        elemento.style.visibility = atras ? "hidden" : "";
      });
    }

    escrever();
    return camera.assinar(escrever);
  });

  return (
    <div
      ref={raiz}
      // Inerte, como a caixa do `ChaoInclinado`: quem recebe clique é a figura.
      // O corte na caixa: nada transborda o plano em que ela mora.
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {deitados.map((deitado) => (
        <DeitadoNaTela key={deitado.item.id} {...deitado} />
      ))}
    </div>
  );
});

/**
 * Uma figura deitada. `data-item-id` é o que o `MestreDeEsguelha` procura para
 * marcar e arrastar -- o mesmo atributo que ela tinha no piso.
 */
function DeitadoNaTela({ item, efeitos, parado }: Deitado) {
  const url = useAssetUrl(item.assetId, "mini");
  const espelho =
    item.flipX || item.flipY
      ? `scale(${item.flipX ? -1 : 1}, ${item.flipY ? -1 : 1})`
      : undefined;

  return (
    <div
      hidden={!url}
      data-item-id={item.id}
      data-efeito-parado={parado ? "" : undefined}
      data-deitada={cantosEmTexto(item)}
      data-giro={item.rotation}
      data-lado={item.width}
      className="pointer-events-auto absolute top-0 left-0 select-none"
      // Sem `zIndex`: a raiz não isola o empilhamento, e um `z` alto subiria
      // por cima das paredes. Quem empilha é a ordem da lista. Ver `deitados`.
      style={{ transformOrigin: "0 0", opacity: item.opacity }}
    >
      {url ? (
        <FiguraComEfeitos
          efeitos={efeitos}
          url={url}
          semente={item.id}
          espelho={espelho}
          alcance={{ livre: true, largura: item.width }}
        >
          {(fonte) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fonte ?? url}
              alt=""
              draggable={false}
              className="pointer-events-none relative size-full object-fill select-none"
              style={espelho ? { transform: espelho } : undefined}
            />
          )}
        </FiguraComEfeitos>
      ) : null}
    </div>
  );
}
