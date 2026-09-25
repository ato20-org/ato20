"use client";

import {
  useCallback,
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
import { LuzLayer } from "@/components/playground/luz-layer";
import {
  ReguaLayer,
  type PontaDoMedidor,
} from "@/components/playground/regua-layer";
import { InfoDoToken } from "@/components/playground/info-do-token";
import { PingLayer } from "@/components/playground/ping-layer";
import { PortraitLayer } from "@/components/playground/portrait-layer";
import { SombraLayer } from "@/components/playground/sombra-layer";
import {
  FormasDaMesa,
  QuadroMesaLayer,
  TextosDaMesa,
} from "@/components/playground/quadro-mesa-layer";
import { TracoLayer } from "@/components/playground/traco-layer";
import type { EfeitoPedido, EfeitosDoPersonagem } from "@/lib/condicao";
import { quadroDaMesa } from "@/lib/geometry/viewport";
import type { Variante } from "@/lib/vault/assets";
import type { CorrenteDeEsguelha } from "@/lib/geometry/volume";
import { useChaoStore } from "@/lib/store/use-chao-store";
import type { RolagemDaMesa } from "@/types/dado";
import type { Ping } from "@/types/ping";
import {
  ehQuadro,
  itensVisiveis,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type CanvasItem,
  type FichaNaCena,
  type FogRegion,
  type Regua,
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
   * O item que o dedo do jogador está segurando, por id.
   *
   * Só o celular passa. Ali a cena é `smooth` -- o resto do mapa só chega em
   * amostras --, mas o token que o próprio jogador arrasta é manipulação direta,
   * como o arrasto do mestre, e interpolado ele correria 150ms atrás do dedo.
   */
  naMao?: string;
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
  /**
   * Os pings da mesa. Vêm de TODAS as cenas -- quem filtra pela que está sendo
   * desenhada é esta camada, para nenhuma tela esquecer de filtrar. Ver
   * `Ping.cenaId`.
   */
  pings?: Ping[];
  /**
   * Nome e medidores para desenhar sobre a cabeça dos tokens.
   *
   * Vazia com o interruptor da cena desligado, e é assim que ela chega às telas
   * da mesa: quem a monta é `fichasDaCena`, e o nome de um PNJ que o mestre não
   * apresentou não atravessa a rede. Ver `Scene.infoDosTokens`.
   */
  fichas?: FichaNaCena[];
  /**
   * O que as condições fazem com cada figura. Ver `LiveState.efeitos`.
   *
   * Ao contrário das `fichas`, chega com o interruptor da cena desligado: o
   * efeito não tem nome, e é desenhado NA figura, no token e no retrato.
   */
  efeitos?: EfeitosDoPersonagem[];
  /** Ausente = camada só de leitura, que é o caso do Espectador. */
  onItemPointerDown?: (event: ReactPointerEvent, item: CanvasItem) => void;
  onFogPointerDown?: (event: ReactPointerEvent, region: FogRegion) => void;
  onPortraitPointerDown?: (
    event: ReactPointerEvent,
    portrait: Portrait,
  ) => void;
  /** Só o Mestre: o medidor selecionado e os gestos de mover e redimensionar. */
  medidorSelecionadoId?: string | null;
  onMedidorPointerDown?: (event: ReactPointerEvent, medidor: Regua) => void;
  onMedidorAlcaPointerDown?: (
    event: ReactPointerEvent,
    medidor: Regua,
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
  /**
   * A corrente que DEITA a cena inteira, no modo de esguelha.
   *
   * Uma superfície só, e não onze camadas portadas uma a uma. Tudo o que esta
   * camada desenha -- mapa, grade, sombra, névoa, risco, medidor -- é CHÃO, e
   * chão tomba junto: aplicar o tombo aqui em cima é dizer isso numa linha em
   * vez de ensinar a cada uma a se inclinar sozinha.
   *
   * E é o desenho barato. Medido em `chao-25d` na webview, o que pesa no modo
   * não é o tombo -- é quantas SUPERFÍCIES o compositor recebe. Um envelope
   * tombado é uma; onze camadas tombadas por conta própria seriam onze.
   *
   * As TRÊS peças, e não só o tombo, porque a corrente tem três níveis e
   * empilhá-los diferente muda o desenho -- ver `CorrenteDeEsguelha`. E ela vem
   * pronta de fora porque quem ergue as paredes usa a mesma: as duas árvores
   * chegam ao plano por caminhos diferentes, e um décimo de grau entre elas põe
   * a parede fora do próprio rastro.
   *
   * Ausente = de prumo, que é o mapa de sempre e não custa um nó a mais.
   */
  esguelha?: CorrenteDeEsguelha;
  /**
   * Não desenhe os itens: quem os desenha é o chão inclinado.
   *
   * Existe por causa do tombo. Deitados com o chão, os tokens ficariam
   * estampados no piso; no modo de esguelha eles se ERGUEM e encaram quem olha,
   * e para isso precisam entrar na mesma lista ordenada das paredes -- é essa
   * lista que põe o token atrás do muro atrás do muro. Desenhá-los aqui
   * também os mostraria duas vezes, um em pé e outro deitado.
   */
  semItens?: boolean;
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
  naMao,
  variante,
  portraits,
  rolagens,
  pings,
  fichas,
  efeitos,
  onItemPointerDown,
  onFogPointerDown,
  onPortraitPointerDown,
  medidorSelecionadoId,
  onMedidorPointerDown,
  onMedidorAlcaPointerDown,
  apagando,
  contornos,
  palco,
  esguelha,
  semItens,
}: SceneLayerProps) {
  // Sem os escondidos, que a mesa já recebe sem eles: aqui é o palco do
  // mestre e a miniatura da lista, que têm a cena inteira. Ver `itensVisiveis`.
  const items = useMemo(
    () => [...itensVisiveis(scene.items, scene.grupos)].sort((a, b) => a.z - b.z),
    [scene.items, scene.grupos],
  );

  /**
   * Os efeitos por personagem, montados uma vez por lista recebida.
   *
   * O token recebe o array DO PERSONAGEM, o mesmo objeto para toda a horda:
   * o `CanvasItemView` é `memo`, e um array novo por token a cada quadro
   * redesenharia os quarenta.
   */
  const efeitosPorPersonagem = useMemo(
    () =>
      new Map<string, ReadonlyArray<EfeitoPedido>>(
        (efeitos ?? []).map((atual) => [atual.personagemId, atual.efeitos]),
      ),
    [efeitos],
  );

  const pingsDaCena = useMemo(
    () => (pings ?? []).filter((ping) => ping.cenaId === scene.id),
    [pings, scene.id],
  );

  /**
   * O espaço do retrato: o 16:9 da tela da mesa em volta da câmera, e não o
   * recorte dela. Ver `quadroDaMesa`. Memoizado porque a `PortraitView` é
   * `memo`, e uma caixa nova por render a redesenharia a cada quadro.
   */
  const telaDaMesa = useMemo(
    () => (scene.camera ? quadroDaMesa(scene.camera) : undefined),
    [scene.camera],
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

  /**
   * Anuncia o chão enquanto esta camada estiver deitada, e o apaga ao sair.
   *
   * Por `ref` de função e não por efeito: a ref roda na montagem e na
   * desmontagem do nó, que é exatamente a vida do chão. Num efeito, o primeiro
   * gesto depois de ligar o modo poderia pegar o store ainda vazio.
   */
  const anunciarChao = useCallback((no: HTMLDivElement | null) => {
    useChaoStore.getState().anunciarChao(no);
  }, []);

  const conteudo = (
    <>
      <FundoDaCena assetId={scene.backgroundAssetId} variante={variante} />

      {/* Depois do fundo e ANTES dos itens: a grade é do mapa, e um token em
          cima dela é o que se conta. Por cima dos itens ela riscaria os
          personagens. */}
      {scene.grid ? (
        <GridLayer grid={scene.grid} items={items} />
      ) : null}

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

      {(semItens ? [] : items).map((item) => (
        <CanvasItemView
          key={item.id}
          item={item}
          smooth={smooth}
          naMao={item.id === naMao}
          variante={variante}
          // Uma string, e não o mapa: o `CanvasItemView` é `memo`, e passar o
          // mapa inteiro faria os quarenta itens redesenharem a cada quadro em
          // que qualquer um deles muda.
          contorno={contornos?.get(item.id)}
          efeitos={
            item.personagemId
              ? efeitosPorPersonagem.get(item.personagemId)
              : undefined
          }
          onPointerDown={onItemPointerDown}
        />
      ))}

      {/* Depois dos itens e ANTES da névoa: o risco marca o mapa e o que está
          nele, então passar por cima de um token é o certo -- circular um
          inimigo é justamente o gesto. Mas atrás da névoa, porque o que está
          escondido não pode ser denunciado por uma marca que o mestre riscou
          antes de esconder. */}
      <TracoLayer tracos={scene.tracos ?? []} apagando={apagando} />

      {/* O escuro e a luz, por cima de todo item e embaixo da névoa. Ver
          `LuzLayer` para o porquê do lugar e do canvas.

          Fora da prévia, pela razão da sombra: trinta cenas num quadrado de
          56x32 cada uma com um canvas do plano é textura que ninguém olha. */}
      {variante === "mini" ? null : (
        <LuzLayer
          items={items}
          luzes={scene.luzes}
          paredes={scene.paredes}
          escuridao={scene.escuridao}
          corDoEscuro={scene.corDoEscuro}
          variant={variant}
          smooth={smooth}
          naMao={naMao}
          // A mesma dos itens e da sombra do sol: a silhueta sai do arquivo
          // que o token já baixou. Ver `useSilhuetasDosTokens`.
          variante={variante}
        />
      )}

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
        <ReguaLayer
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

      {/* Depois dos itens e antes do retrato: ela desenha SOBRE as peças, e o
          retrato é HUD e fica acima de tudo. Ver `INFO_Z`. */}
      {fichas && fichas.length > 0 ? (
        <InfoDoToken itens={items} fichas={fichas} />
      ) : null}

      {/* Por cima de tudo que é do mapa -- névoa, medidor, nome --, e embaixo
          do retrato, que é HUD. Ver `PingLayer`. */}
      <PingLayer pings={pingsDaCena} />

      {portraits && portraits.length > 0 ? (
        <PortraitLayer
          portraits={portraits}
          camera={telaDaMesa}
          variant={variant}
          smooth={smooth}
          // Na mesa o retrato é OVERLAY: ninguém o manipula ali, e o que se
          // pede dele é que fique parado enquanto a câmera passa por baixo.
          // No Mestre ele continua no plano, porque lá ele é arrastado,
          // escalado e enfileirado -- tudo em coordenada de cena. Ver `espaco`.
          espaco={variant === "mesa" ? "tela" : "cena"}
          rolagens={rolagens}
          efeitos={efeitosPorPersonagem}
          onPortraitPointerDown={onPortraitPointerDown}
        />
      ) : null}
    </>
  );

  const envelopado = palco ? <div {...palco}>{conteudo}</div> : conteudo;

  /**
   * O tombo vai POR FORA do envelope do mestre, e não por dentro.
   *
   * Por dentro, o envelope ficaria de prumo sobre uma cena deitada: o clique no
   * vazio cairia numa régua e o desenho em outra. Por fora, o gesto e o desenho
   * tombam juntos -- e o `div` do tombo vira o elemento de cujo sistema de
   * coordenadas o motor devolve `offsetX/offsetY`, que é o que dá a posição de
   * chão exata sem inverter homografia nenhuma. Ver `ChaoInclinado`.
   */
  const deitado = esguelha ? (
    // Três níveis, na ordem que `CorrenteDeEsguelha` documenta: o encaixe por
    // FORA, porque ele age sobre o resultado já projetado; a perspectiva no
    // meio, porque é o pai que cria o contexto 3D; e a corrente da cena em cada
    // elemento, que aqui é o envelope inteiro.
    <div
      className="absolute top-0 left-0"
      style={{
        width: SCENE_WIDTH,
        height: SCENE_HEIGHT,
        transformOrigin: `${SCENE_WIDTH / 2}px ${SCENE_HEIGHT / 2}px`,
        transform: esguelha.encaixe,
      }}
    >
      <div
        className="absolute top-0 left-0"
        style={{
          width: SCENE_WIDTH,
          height: SCENE_HEIGHT,
          perspective:
            esguelha.perspectiva > 0 ? `${esguelha.perspectiva}px` : "none",
          perspectiveOrigin: "50% 50%",
        }}
      >
        <div
          // O CHÃO, e é por isso que ele se anuncia: o sistema de coordenadas
          // deste `div` é o da cena deitada, e um evento que cai nele traz
          // `offsetX/offsetY` já com a rotação, a inclinação e a perspectiva
          // desfeitas pelo motor. É o que faz um arrasto continuar valendo
          // quando o mapa tomba, sem inverter homografia nenhuma. Ver
          // `useChaoStore`.
          ref={anunciarChao}
          className="absolute top-0 left-0"
          style={{
            width: SCENE_WIDTH,
            height: SCENE_HEIGHT,
            transformOrigin: "0 0",
            transform: esguelha.cena,
          }}
        >
          {envelopado}
        </div>
      </div>
    </div>
  ) : (
    envelopado
  );

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
      {planoDeConteudo ? createPortal(deitado, planoDeConteudo) : deitado}
    </>
  );
}
