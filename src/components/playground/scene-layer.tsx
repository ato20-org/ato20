"use client";

import { useMemo, type PointerEvent as ReactPointerEvent } from "react";

import { CanvasItemView } from "@/components/playground/canvas-item-view";
import { useSceneScale } from "@/components/playground/scene-stage";
import { FogLayer } from "@/components/playground/fog-layer";
import { FundoDaCena } from "@/components/playground/fundo-da-cena";
import { GridLayer } from "@/components/playground/grid-layer";
import { PortraitLayer } from "@/components/playground/portrait-layer";
import { TracoLayer } from "@/components/playground/traco-layer";
import type { Variante } from "@/lib/vault/assets";
import type { RolagemDaMesa } from "@/types/dado";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type CanvasItem,
  type FogRegion,
  type Portrait,
  type Scene,
} from "@/types/scene";

type SceneLayerProps = {
  scene: Scene;
  /**
   * Riscos que a borracha está tocando, translúcidos até o dedo soltar.
   *
   * Só o Mestre passa: a mesa não tem borracha, e ela nunca vê um risco
   * meio-apagado — a remoção chega pronta na publicação seguinte.
   */
  apagando?: ReadonlySet<string>;
  /** `mesa` é o que a mesa vê. `mestre` deixa o mestre atravessar a névoa. */
  variant?: "mestre" | "mesa";
  /**
   * Interpola o que muda entre as amostras recebidas.
   *
   * Ligado nas telas que só assistem. No Mestre fica desligado: lá o arrasto
   * é manipulação direta, e a imagem correndo atrás do cursor é o oposto de
   * suave.
   */
  smooth?: boolean;
  /**
   * Qual tamanho dos arquivos desenhar. Ausente = os arquivos -- com uma
   * exceção, o FUNDO, que passou a escolher sozinho entre a redução de palco e
   * o original conforme o zoom. Ver `useVarianteDoFundo`.
   *
   * `mini` é da prévia de cena. Medido no `scripts/perf/medir.mjs`, cenário
   * `lista`, com trinta cenas de mapa próprio enquanto o mestre arrasta um
   * token: 45,6 fps, pior quadro de 383 ms e 536 MB buscados, contra 60 fps,
   * 16,8 ms e 14,4 MB com miniatura. Um mapa de 3537x3750 são 51 MB de bitmap,
   * e a lista os decodificava um por linha para desenhar um quadrado de 56x32.
   * Não é o `SceneStage` por linha que pesa: as duas corridas têm os mesmos 409
   * nós no DOM.
   *
   * `tela` é do celular do jogador: mesma cena que a TV, numa tela de 400px.
   * Medido no mapa real, 8,0 MB e 51 MB decodificado contra 0,44 MB e 13 MB.
   *
   * O palco do mestre e a TV ficam sem variante de propósito: um é onde se
   * amplia para conferir detalhe, a outra é a tela grande da mesa. Isso vale
   * para os ITENS. O fundo dos dois é o que mais pesa, e ele tem regra própria:
   * com o plano cheio, um mapa de 8192x6144 derrubava o palco a 19,4 fps e um
   * quadro de 772 ms, e ampliado o mesmo arquivo entrega 57,8 fps -- ver
   * `useVarianteDoFundo` e o cabeçalho de `vault/variantes.rs`.
   */
  variante?: Variante;
  /**
   * Retratos da sessão. Não vêm de dentro da cena de propósito: eles ficam no
   * ar atravessando a troca de cena, e são ancorados na câmera dela.
   */
  portraits?: Portrait[];
  /**
   * Os dados que os jogadores jogaram há pouco. Ver `PortraitLayer`.
   *
   * Só as telas da mesa passam: no palco do mestre os dados de jogador têm
   * lugar próprio, fora do plano da cena.
   */
  rolagens?: RolagemDaMesa[];
  /** Ausente = camada só de leitura, que é o caso do Espectador. */
  onItemPointerDown?: (event: ReactPointerEvent, item: CanvasItem) => void;
  onFogPointerDown?: (event: ReactPointerEvent, region: FogRegion) => void;
  onPortraitPointerDown?: (
    event: ReactPointerEvent,
    portrait: Portrait,
  ) => void;
};

/**
 * Desenho da cena: fundo, itens empilhados e áreas escondidas por cima. É o
 * mesmo componente no Mestre, no Espectador e na miniatura — se cada visão
 * renderizasse por um caminho diferente, elas divergiriam no primeiro ajuste
 * de layout.
 */
export function SceneLayer({
  scene,
  variant = "mesa",
  smooth = false,
  variante,
  portraits,
  rolagens,
  onItemPointerDown,
  onFogPointerDown,
  onPortraitPointerDown,
  apagando,
}: SceneLayerProps) {
  const items = useMemo(
    () => [...scene.items].sort((a, b) => a.z - b.z),
    [scene.items],
  );

  const { scale, cameraParada } = useSceneScale();

  return (
    <div
      className="absolute inset-0"
      /**
       * Desenha o conteúdo GRANDE e o reduz de volta, quando a câmera para.
       *
       * O plano é ampliado por `transform: scale`, e o WebKitGTK rasteriza uma
       * camada transformada no tamanho de LAYOUT para esticar a textura depois.
       * Num mapa desenhado a 9200 pixels a partir de um plano de 1920, o que a
       * mesa vê é essa textura esticada quase cinco vezes -- ver `cameraParada`
       * no `SceneStage`, onde está o que foi medido e o que foi descartado.
       *
       * `zoom` é a única propriedade que põe a ampliação no LAYOUT: com ele o
       * `<img>` do mapa passa a ter 9200 de largura de verdade, e o motor o
       * rasteriza nesse tamanho. O `scale(1/scale)` desfaz o crescimento para a
       * caixa continuar ocupando as mesmas 1920 unidades do plano -- e reduzir
       * não custa nitidez, que é justamente a assimetria de que este conserto
       * vive: o caro é esticar.
       *
       * Aqui e não no plano do `SceneStage`, de propósito. `zoom` quebra a
       * conta dos controles, que convertem pixel de tela em unidade de cena com
       * `v / scale` -- sob `zoom` o erro cresce com a ampliação, e a 800% as
       * alças e os ícones do gizmo incham. O conteúdo não tem essa conta: ele é
       * medido em unidades de cena, que o `zoom` multiplica corretamente.
       */
      style={
        cameraParada
          ? {
              zoom: scale,
              width: SCENE_WIDTH,
              height: SCENE_HEIGHT,
              transform: `scale(${1 / scale})`,
              transformOrigin: "0 0",
            }
          : undefined
      }
    >
      <FundoDaCena assetId={scene.backgroundAssetId} variante={variante} />

      {/* Depois do fundo e ANTES dos itens: a grade é do mapa, e um token em
          cima dela é o que se conta. Por cima dos itens ela riscaria os
          personagens. */}
      {scene.grid ? <GridLayer grid={scene.grid} /> : null}

      {items.map((item) => (
        <CanvasItemView
          key={item.id}
          item={item}
          smooth={smooth}
          variante={variante}
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
          rolagens={rolagens}
          onPortraitPointerDown={onPortraitPointerDown}
        />
      ) : null}
    </div>
  );
}
