"use client";

import {
  useMemo,
  type ComponentProps,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import { CanvasItemView } from "@/components/playground/canvas-item-view";
import { useSceneScale } from "@/components/playground/scene-stage";
import { FogLayer } from "@/components/playground/fog-layer";
import { FundoDaCena } from "@/components/playground/fundo-da-cena";
import { GridLayer } from "@/components/playground/grid-layer";
import {
  MedidorLayer,
  type PontaDoMedidor,
} from "@/components/playground/medidor-layer";
import { PortraitLayer } from "@/components/playground/portrait-layer";
import { SombraLayer } from "@/components/playground/sombra-layer";
import {
  FormasDaMesa,
  QuadroMesaLayer,
  TextosDaMesa,
} from "@/components/playground/quadro-mesa-layer";
import { TracoLayer } from "@/components/playground/traco-layer";
import type { Variante } from "@/lib/vault/assets";
import type { RolagemDaMesa } from "@/types/dado";
import {
  ehQuadro,
  type CanvasItem,
  type FogRegion,
  type Medidor,
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
  /**
   * A cor do contorno de cada item que deve ter um, por id de item.
   *
   * Só o palco do MESTRE passa, e passa sempre -- seleção não apaga o traço de
   * ninguém. A mesa nunca recebe: o contorno responde "de quem é esta figura",
   * e para a mesa saber de fora do jogo quem é NPC é justamente o que não se
   * quer contar. Ver `contornoDosItens`.
   */
  contornos?: ReadonlyMap<string, string>;
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
  /** Só o Mestre: o medidor selecionado e os gestos de mover e redimensionar. */
  medidorSelecionadoId?: string | null;
  onMedidorPointerDown?: (event: ReactPointerEvent, medidor: Medidor) => void;
  onMedidorAlcaPointerDown?: (
    event: ReactPointerEvent,
    medidor: Medidor,
    ponta: PontaDoMedidor,
  ) => void;
  /**
   * O envelope que o Mestre põe em volta do conteúdo: a marca `data-palco`, o
   * cursor da ferramenta, o clique no vazio e o `drop` do acervo.
   *
   * Vem por prop, e não continua sendo um `<div>` em volta do `<SceneLayer>` lá
   * no Mestre, porque o conteúdo desceu para o plano de baixo -- ver o portal
   * abaixo. Ficando em cima, este envelope cobriria os tokens e engoliria o
   * clique que deveria pegá-los; ficando de fora, não haveria onde tratar o
   * clique no vazio. Ele desce junto.
   */
  palco?: ComponentProps<"div"> & Record<`data-${string}`, unknown>;
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
  medidorSelecionadoId,
  onMedidorPointerDown,
  onMedidorAlcaPointerDown,
  apagando,
  contornos,
  palco,
}: SceneLayerProps) {
  const items = useMemo(
    () => [...scene.items].sort((a, b) => a.z - b.z),
    [scene.items],
  );

  /**
   * O conteúdo desenha no plano DE BAIXO, e não onde ele foi escrito.
   *
   * Os dois planos existem para separar o que precisa de resolução -- mapa,
   * token, retrato -- do que precisa de tamanho exato: os controles do mestre,
   * que se medem em pixel de tela. Só o de baixo troca de forma de ampliar, e
   * só ele fica nítido ampliado. O porquê inteiro está em `conteudoNoLayout`,
   * no `SceneStage`.
   *
   * Por portal, e não por uma prop lá em cima: quem monta o conteúdo é cada
   * tela, no fundo da árvore, e levá-lo até o `SceneStage` faria as cinco
   * mudarem de forma. O portal move só o DOM -- a árvore do React continua a
   * mesma, e com ela os eventos, o `stopPropagation` e os handlers que o Mestre
   * pendura em volta.
   *
   * Sem o nó -- primeiro paint -- desenha onde está. É um quadro, e o quadro
   * seguinte já vai para o lugar certo.
   */
  const { planoDeConteudo, fundoDoPalco } = useSceneScale();

  const conteudo = (
    <>
      <FundoDaCena assetId={scene.backgroundAssetId} variante={variante} />

      {/* Depois do fundo e ANTES dos itens: a grade é do mapa, e um token em
          cima dela é o que se conta. Por cima dos itens ela riscaria os
          personagens. */}
      {scene.grid ? <GridLayer grid={scene.grid} /> : null}

      {/* Depois da grade e ANTES dos itens: a sombra de parede é chão. Ela
          cobre a grade -- um quadrado atrás da parede tem de escurecer junto --
          e passa por baixo de todo mundo.

          Fora da prévia: a lista desenha trinta cenas num quadrado de 56x32, e
          um SVG de plano inteiro por linha é raster que ninguém está olhando.
          Ver `variante`. */}
      {variante === "mini" ? null : (
        <SombraLayer
          items={items}
          paredes={scene.paredes}
          sol={scene.sol}
          // A mesma dos itens: a sombra de uma figura é a figura, e ela lê o
          // arquivo que o token já baixou. Ver `SombraDaFigura`.
          variante={variante}
        />
      )}

      {items.map((item) => (
        <CanvasItemView
          key={item.id}
          item={item}
          smooth={smooth}
          variante={variante}
          // Uma string, e não o mapa: o `CanvasItemView` é `memo`, e passar o
          // mapa inteiro faria os quarenta itens redesenharem a cada quadro em
          // que qualquer um deles muda.
          contorno={contornos?.get(item.id)}
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

      {/* Depois da névoa: o medidor é instrumento sobre o mapa, e medir por
          cima da névoa é justamente o caso -- "quantos metros até a porta que
          eles ainda não viram". Só com a grade: é ela que dá o metro. */}
      {scene.grid && scene.medidores && scene.medidores.length > 0 ? (
        <MedidorLayer
          medidores={scene.medidores}
          grid={scene.grid}
          selecionadoId={medidorSelecionadoId}
          onMedidorPointerDown={onMedidorPointerDown}
          onAlcaPointerDown={onMedidorAlcaPointerDown}
        />
      ) : null}

      {/* O quadro no ar mostra TUDO: postit, alfinete, texto e seta são o
          conteúdo dele. Só na mesa -- o mestre tem as camadas dele, com
          arrasto e edição, fora deste componente.

          Num MAPA passam DUAS das seis: a letra solta e a forma. As outras
          quatro continuam sendo anotação que a mesa nunca vê, e `sceneForTable`
          nem as manda. E o que chega destas duas já veio filtrado por `naMesa`
          -- num mapa elas nascem fechadas, e é o mestre quem abre uma a uma.
          Duas barreiras, como no postit: aqui não se decide nada, só se
          desenha o que chegou. */}
      {variant !== "mesa" ? null : ehQuadro(scene) ? (
        <QuadroMesaLayer scene={scene} />
      ) : (
        <>
          <FormasDaMesa scene={scene} />
          <TextosDaMesa scene={scene} />
        </>
      )}

      {portraits && portraits.length > 0 ? (
        <PortraitLayer
          portraits={portraits}
          camera={scene.camera}
          variant={variant}
          smooth={smooth}
          // Na mesa o retrato é OVERLAY: ninguém o manipula ali, e o que se
          // pede dele é que fique parado enquanto a câmera passa por baixo.
          // No Mestre ele continua no plano, porque lá ele é arrastado,
          // escalado e enfileirado -- tudo em coordenada de cena. Ver `espaco`.
          espaco={variant === "mesa" ? "tela" : "cena"}
          rolagens={rolagens}
          onPortraitPointerDown={onPortraitPointerDown}
        />
      ) : null}
    </>
  );

  const envelopado = palco ? <div {...palco}>{conteudo}</div> : conteudo;

  /**
   * O mesmo envelope, sem filhos, no FUNDO do palco.
   *
   * O envelope cobre o plano e só ele, porque é o plano que ele emoldura. Mas
   * a área cresce com o que o mestre coloca, e sem isto o lado de fora vira uma
   * vidraça: dá para ver, dá para navegar, e nada pega -- não dava para soltar
   * uma imagem fora da borda, cravar um ponto ali nem começar um risco de lá.
   *
   * Uma cópia no fundo da moldura, e não um filho transbordando dentro do
   * plano: um filho de 3x3 planos em coordenadas negativas inflava a camada
   * composta do plano de conteúdo, e o WebKitGTK passou a pintá-lo deslocado a
   * cada troca de forma e a deixá-lo preto ampliado. O fundo tem o tamanho da
   * moldura, nunca transborda, e recebe exatamente o que sobra: o gesto no
   * vazio, que é o que o envelope trata. Ver `fundoDoPalco`.
   */
  const fundo =
    palco && fundoDoPalco
      ? createPortal(<div aria-hidden {...palco} />, fundoDoPalco)
      : null;

  return (
    <>
      {fundo}
      {planoDeConteudo ? createPortal(envelopado, planoDeConteudo) : envelopado}
    </>
  );
}
