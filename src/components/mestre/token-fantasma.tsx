"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { useSceneScale } from "@/components/playground/scene-stage";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { boxAround } from "@/lib/geometry/transform";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import {
  assetIdDoArrasto,
  tamanhoDoArrasto,
  useTokenDragStore,
} from "@/lib/store/use-token-drag-store";
import { promoverImagemDoItem } from "@/lib/vault/inventory";
import type { SceneGrid } from "@/types/scene";

/**
 * Acima de tudo o que vive no plano, menos o gizmo.
 *
 * `z-index` explícito e alto porque os itens da cena carregam o `z` deles, que
 * cresce a cada coisa posta no mapa: numa cena com quarenta tokens, uma sombra
 * com z modesto nasceria atrás dos últimos. Ela dura um gesto e é justamente o
 * que o mestre está olhando -- ver a escala de camadas em `GIZMO_Z`,
 * `ALFINETE_Z` e `POSTIT_Z`.
 */
const FANTASMA_Z = 9_800;

type TokenFantasmaProps = {
  sceneId: string;
  /** A grade da cena, quando há uma. Ver o rótulo. */
  grid: SceneGrid | undefined;
};

/**
 * A sombra da imagem enquanto ela ainda está na mão.
 *
 * Existe porque, até aqui, arrastar algo para o mapa era um gesto às cegas: a
 * peça só aparecia depois de solta, e descobrir que ela caiu torta ou do
 * tamanho errado custava dois ajustes com o gizmo. A prévia responde as duas
 * perguntas ANTES de soltar — onde ela vai ficar e de que tamanho —, e a roda
 * do mouse escolhe o tamanho sem sair do gesto.
 *
 * Vale para as três origens: o personagem, a imagem do acervo e o item de
 * inventário. É o mesmo gesto e a mesma sombra -- ver `useTokenDrag`.
 *
 * Desenhada DENTRO do plano da cena, em unidades de cena, e não como um
 * fantasma em pixels de tela colado no cursor: o que o mestre precisa comparar
 * é a peça com o mapa embaixo e com o quadrado da grade, e isso só é honesto
 * se a sombra acompanhar o zoom como a peça acompanhará.
 *
 * Fora do `SceneLayer`, como o `PinLayer` e o `PostitLayer`, e pela mesma razão:
 * o `SceneLayer` é o componente que desenha na TV da mesa, e uma sombra de algo
 * que talvez nem seja solto não é assunto dos jogadores.
 */
export function TokenFantasma({ sceneId, grid }: TokenFantasmaProps) {
  const { scale, toScene } = useSceneScale();
  const arrasto = useTokenDragStore((state) => state.arrasto);

  // A URL do acervo resolve por id; a do item já vem pronta no arrasto, porque
  // a imagem dele pode ser um anexo, que não tem id de acervo.
  const doAcervo = useAssetUrl(
    arrasto ? assetIdDoArrasto(arrasto.fonte) : undefined,
  );
  const url =
    arrasto?.fonte.tipo === "item" ? arrasto.fonte.url : doAcervo;

  const addItem = useSceneStore((state) => state.addItem);
  const select = useSelectionStore((state) => state.select);

  /**
   * O que a inserção precisa saber, sempre atual.
   *
   * Por ref e não por dependência do efeito: a função registrada no store é a
   * mesma do começo ao fim do gesto — registrá-la de novo a cada mudança de
   * escala trocaria o alvo no meio de um arrasto em andamento.
   */
  const atual = useRef({ sceneId, toScene, addItem, select });
  useEffect(() => {
    atual.current = { sceneId, toScene, addItem, select };
  });

  useEffect(() => {
    const { registrarAlvo } = useTokenDragStore.getState();

    return registrarAlvo("palco", (solto) => {
      const { sceneId, toScene, addItem, select } = atual.current;
      const { largura, altura } = tamanhoDoArrasto(solto);
      const centro = toScene(solto.x, solto.y);

      const por = (assetId: string, personagemId?: string) => {
        // Já selecionado, como no `+` do acervo: o gesto seguinte é quase
        // sempre ajustar o que acabou de entrar.
        select([
          addItem(sceneId, {
            assetId,
            personagemId,
            ...boxAround(centro, largura, altura),
          }),
        ]);
      };

      if (solto.fonte.tipo === "item") {
        // A imagem do item pode ser um anexo, que não tem id de acervo. O
        // objeto de cena é GRAVADO e tem de resolver depois de reabrir o
        // aplicativo, então ele precisa de um asset de verdade — e é aqui,
        // depois do gesto, que dá para esperar o disco.
        //
        // O tamanho NÃO vem do asset promovido, e sim do que a sombra mostrou:
        // o mestre acabou de escolhê-lo na roda, e trocá-lo agora pela medida
        // natural do arquivo desmentiria a prévia que ele estava olhando.
        const { personagemId, itemId } = solto.fonte;

        void promoverImagemDoItem(personagemId, itemId).then(
          (asset) => por(asset.id),
          (cause: unknown) =>
            toast.error(
              cause instanceof Error
                ? cause.message
                : "Não deu para pôr o item na mesa.",
            ),
        );

        return;
      }

      // Do acervo ou do handout, o mesmo caminho: o handout guarda ids de
      // acervo, e a imagem entra na mesa como qualquer outra. Ela continua no
      // handout, só esmaecida -- ver `HandoutMestre`.
      por(
        solto.fonte.assetId,
        solto.fonte.tipo === "personagem" ? solto.fonte.personagemId : undefined,
      );
    });
  }, []);

  if (!arrasto || arrasto.destino?.tipo !== "palco" || scale === 0) return null;

  const { largura, altura } = tamanhoDoArrasto(arrasto);
  const caixa = boxAround(toScene(arrasto.x, arrasto.y), largura, altura);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0"
      style={{
        transform: `translate(${caixa.x}px, ${caixa.y}px)`,
        width: caixa.width,
        height: caixa.height,
        zIndex: FANTASMA_Z,
      }}
    >
      <div
        className="border-primary/80 absolute inset-0 border-dashed"
        // Dividido pela escala como toda linha de interface desenhada dentro do
        // plano: em espessura fixa, o tracejado engrossaria junto com o zoom até
        // virar uma moldura que esconde o token.
        style={{ borderWidth: 2 / scale }}
      />

      {url ? (
        // next/image não serve aqui: a fonte é uma URL do daemon do acervo.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          draggable={false}
          // `object-fill` porque é exatamente o que o item fará depois de solto
          // — ver `CanvasItemView`. Uma prévia que respeita a proporção e um
          // token que não respeita mostrariam coisas diferentes.
          className="size-full object-fill opacity-50 select-none"
        />
      ) : null}

      {/* Acima da caixa e no tamanho da TELA: o rótulo é interface, e encolher
          junto com o zoom o tornaria ilegível justamente no mapa afastado, que é
          quando a dúvida sobre o tamanho aparece. */}
      <div className="absolute top-0 left-1/2">
        <div
          className="origin-top-left"
          style={{ transform: `scale(${1 / scale}) translate(-50%, -100%)` }}
        >
          {/* O respiro sai do padding, e não de uma margem: o `-100%` mede o
              border-box, então o padding é o que separa o rótulo da borda. */}
          <div className="pb-1.5">
            <span className="bg-popover text-popover-foreground rounded-md border px-1.5 py-0.5 text-[11px] whitespace-nowrap shadow-md">
              {medida(largura, altura, grid)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * O tamanho escrito de um jeito que responda a pergunta que o mestre faz.
 *
 * Com grade, a pergunta é "quantos quadrados ele ocupa": um token de pessoa
 * quer um, um ogro quer dois, e a unidade de cena não diz nada sobre isso. Sem
 * grade não há régua nenhuma no mapa, e aí o que sobra é a medida do item — a
 * mesma que o painel de camadas mostra.
 */
function medida(
  largura: number,
  altura: number,
  grid: SceneGrid | undefined,
): string {
  if (!grid || grid.size <= 0) return `${largura} × ${altura}`;

  const quadrados = (medida: number) =>
    (medida / grid.size).toFixed(1).replace(".", ",");

  return `${quadrados(largura)} × ${quadrados(altura)} na grade`;
}
