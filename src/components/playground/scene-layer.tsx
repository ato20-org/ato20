"use client";

import { useMemo, type PointerEvent as ReactPointerEvent } from "react";

import { CanvasItemView } from "@/components/playground/canvas-item-view";
import { FogLayer } from "@/components/playground/fog-layer";
import { GridLayer } from "@/components/playground/grid-layer";
import { PortraitLayer } from "@/components/playground/portrait-layer";
import { TracoLayer } from "@/components/playground/traco-layer";
import { useAssetUrl } from "@/hooks/use-asset-url";
import type { CanvasItem, FogRegion, Portrait, Scene } from "@/types/scene";

type SceneLayerProps = {
  scene: Scene;
  /**
   * Riscos que a borracha está tocando, translúcidos até o dedo soltar.
   *
   * Só o Operador passa: a mesa não tem borracha, e ela nunca vê um risco
   * meio-apagado — a remoção chega pronta na publicação seguinte.
   */
  apagando?: ReadonlySet<string>;
  /** `viewer` é o que a mesa vê. `operator` deixa o mestre atravessar a névoa. */
  variant?: "operator" | "viewer";
  /**
   * Interpola o que muda entre as amostras recebidas.
   *
   * Ligado nas telas que só assistem. No Operador fica desligado: lá o arrasto
   * é manipulação direta, e a imagem correndo atrás do cursor é o oposto de
   * suave.
   */
  smooth?: boolean;
  /**
   * Retratos da sessão. Não vêm de dentro da cena de propósito: eles ficam no
   * ar atravessando a troca de cena, e são ancorados na câmera dela.
   */
  portraits?: Portrait[];
  /** Ausente = camada só de leitura, que é o caso do Assistir. */
  onItemPointerDown?: (event: ReactPointerEvent, item: CanvasItem) => void;
  onFogPointerDown?: (event: ReactPointerEvent, region: FogRegion) => void;
  onPortraitPointerDown?: (event: ReactPointerEvent, portrait: Portrait) => void;
};

/**
 * Desenho da cena: fundo, itens empilhados e áreas escondidas por cima. É o
 * mesmo componente no Operador, no Assistir e na miniatura — se cada visão
 * renderizasse por um caminho diferente, elas divergiriam no primeiro ajuste
 * de layout.
 */
export function SceneLayer({
  scene,
  variant = "viewer",
  smooth = false,
  portraits,
  onItemPointerDown,
  onFogPointerDown,
  onPortraitPointerDown,
  apagando,
}: SceneLayerProps) {
  const backgroundUrl = useAssetUrl(scene.backgroundAssetId);
  const items = useMemo(() => [...scene.items].sort((a, b) => a.z - b.z), [scene.items]);

  return (
    <>
      {backgroundUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={backgroundUrl}
          alt=""
          draggable={false}
          // `object-contain`: mapa nenhum deve ser cortado por não ser 16:9.
          className="absolute inset-0 size-full object-contain select-none"
        />
      ) : null}

      {/* Depois do fundo e ANTES dos itens: a grade é do mapa, e um token em
          cima dela é o que se conta. Por cima dos itens ela riscaria os
          personagens. */}
      {scene.grid ? <GridLayer grid={scene.grid} /> : null}

      {items.map((item) => (
        <CanvasItemView
          key={item.id}
          item={item}
          smooth={smooth}
          onPointerDown={onItemPointerDown}
        />
      ))}

      {/* Depois dos itens e ANTES da névoa: o risco marca o mapa e o que está
          nele, então passar por cima de um token é o certo -- circular um
          inimigo é justamente o gesto. Mas atrás da névoa, porque o que está
          escondido não pode ser denunciado por uma marca que o mestre riscou
          antes de esconder. */}
      <TracoLayer tracos={scene.tracos ?? []} apagando={apagando} />

      <FogLayer
        fog={scene.fog}
        variant={variant}
        smooth={smooth}
        onFogPointerDown={onFogPointerDown}
      />

      {portraits && portraits.length > 0 ? (
        <PortraitLayer
          portraits={portraits}
          camera={scene.camera}
          variant={variant}
          smooth={smooth}
          onPortraitPointerDown={onPortraitPointerDown}
        />
      ) : null}
    </>
  );
}
