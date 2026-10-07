"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import { AreaDeEfeitoLayer } from "@/components/playground/area-de-efeito-layer";
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
import {
  efeitosDoObjeto,
  type EfeitoPedido,
  type EfeitosDoPersonagem,
} from "@/lib/condicao";
import { quadroDaMesa } from "@/lib/geometry/viewport";
import type { Variante } from "@/lib/vault/assets";
import type { CameraAssinavel } from "@/lib/geometry/camera-orbital";
import type { CorrenteDeEsguelha } from "@/lib/geometry/volume";
import { useChaoStore } from "@/lib/store/use-chao-store";
import type { RolagemDaMesa } from "@/types/dado";
import type { Ping } from "@/types/ping";
import {
  ehQuadro,
  itensVisiveis,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type AreaDeEfeito,
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
   * A porta que a mão do mestre está girando, por id. Ela vai direto, e as
   * outras giram até a abertura nova. Ver `usePortasNoGiro`.
   */
  portaNaMao?: string;
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
  /** O clique no contorno de uma área de efeito. Só o Mestre passa. */
  onAreaDeEfeitoPointerDown?: (event: ReactPointerEvent, area: AreaDeEfeito) => void;
  /**
   * Só os efeitos destes donos ANIMAM -- tokens, áreas e retratos, pelo id;
   * os outros pausam no quadro em que estão, e a luz deles para de tremular.
   * Ausente = tudo anda.
   *
   * É o Mestre, que passa a seleção: lá o efeito serve para o mestre SABER
   * que o goblin está em chamas, e o fogo de quarenta figuras tremulando é
   * compositor trabalhando para quem está montando a cena. A mesa -- a janela
   * do espectador e o celular -- não passa nada: lá o efeito é o espetáculo.
   */
  animarSo?: ReadonlySet<string>;
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
   *
   * Com uma `CameraAssinavel` é a câmera ORBITAL (ver `camera-orbital.ts`): o
   * envelope tem a caixa do plano e corta o que passa dela, o olho fica no meio
   * dele, e a corrente é escrita direto no `div` do chão a cada aviso da
   * câmera -- sem render, e sem variável CSS, que no WebKit repinta tudo.
   */
  esguelha?: CorrenteDeEsguelha | CameraAssinavel;
  /**
   * Não desenhe os itens: quem os desenha é o chão inclinado.
   *
   * Existe por causa do tombo. Deitados com o chão, os tokens ficariam
   * estampados no piso; no modo de esguelha eles se ERGUEM e encaram quem olha,
   * e para isso precisam entrar na mesma lista ordenada das paredes -- é essa
   * lista que põe o token atrás do muro atrás do muro. Desenhá-los aqui
   * também os mostraria duas vezes, um em pé e outro deitado.
   *
   * Uma função diz QUAIS ficam de fora: os em pé saem, e o deitado (ver
   * `CanvasItem.deitado`) fica aqui, no chão -- com um relevo curto para se ler
   * que há algo sobre o piso, e não pintado nele.
   */
  semItens?: boolean | ((item: CanvasItem) => boolean);
};

/**
 * O relevo da figura deitada de esguelha, em unidades de cena: a borda escura
 * que a descola do piso e a sombra curta que diz que ela tem corpo.
 */
const RELEVO_DO_DEITADO =
  "drop-shadow(0 0 1px rgba(0,0,0,0.9)) drop-shadow(2px 4px 3px rgba(0,0,0,0.6))";

/**
 * Desenho da cena: fundo, itens empilhados e áreas escondidas por cima. É o
 * mesmo componente no Mestre, no Espectador e na miniatura — se cada visão
 * renderizasse por um caminho diferente, elas divergiriam no primeiro ajuste
 * de layout.
 */
/** Ninguém anima: a miniatura. Identidade estável, para o `memo` de cada item. */
const NINGUEM: ReadonlySet<string> = new Set<string>();

export function SceneLayer({
  scene,
  variant = "mesa",
  smooth = false,
  naMao,
  portaNaMao,
  variante,
  portraits,
  rolagens,
  pings,
  fichas,
  efeitos,
  onItemPointerDown,
  onFogPointerDown,
  onAreaDeEfeitoPointerDown,
  animarSo: animarSoPedido,
  onPortraitPointerDown,
  medidorSelecionadoId,
  onMedidorPointerDown,
  onMedidorAlcaPointerDown,
  apagando,
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

  /** O que as condições pedem de cada item: do personagem, ou do próprio objeto. */
  const efeitosDoItem = useCallback(
    (item: CanvasItem) =>
      item.personagemId
        ? efeitosPorPersonagem.get(item.personagemId)
        : efeitosDoObjeto(item.condicoes),
    [efeitosPorPersonagem],
  );

  // Na miniatura da lista, NINGUÉM anima: trinta cenas num quadrado de 56x32,
  // e fogo nenhum ali é para ser visto andando.
  const animarSo = variante === "mini" ? NINGUEM : animarSoPedido;
  const parado = (id: string) => (animarSo ? !animarSo.has(id) : undefined);

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
  const chaoNo = useRef<HTMLDivElement | null>(null);
  const anunciarChao = useCallback((no: HTMLDivElement | null) => {
    chaoNo.current = no;
    useChaoStore.getState().anunciarChao(no);
  }, []);

  const orbital = esguelha && "corrente" in esguelha ? esguelha : null;
  const foto = esguelha && "encaixe" in esguelha ? esguelha : null;

  /**
   * Onde o mapa caiu no plano, para o chão da orbital acabar nele.
   *
   * De esguelha a mesa é o MAPA: as faixas vazias que um mapa que não é 16:9
   * deixa no plano girariam com a cena como uma barra escurecida. O corte é
   * no espaço do próprio chão (`clip-path` antes do `transform`), então ele
   * gira e deita junto, e só muda quando o mapa muda -- nada a refazer por
   * quadro de gesto. Sem mapa, sem corte: o plano inteiro é o chão.
   */
  const [lugarDoFundo, setLugarDoFundo] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const corteDoChao =
    orbital && lugarDoFundo && scene.backgroundAssetId
      ? `inset(${lugarDoFundo.y}px ${SCENE_WIDTH - lugarDoFundo.x - lugarDoFundo.width}px ${SCENE_HEIGHT - lugarDoFundo.y - lugarDoFundo.height}px ${lugarDoFundo.x}px)`
      : undefined;

  /**
   * Escreve a câmera orbital no chão, e reescreve a cada aviso dela.
   *
   * Sem lista de dependências: um commit pode trocar o `div` (ligar o modo,
   * trocar de cena), e a câmera tem de estar nele antes da pintura.
   */
  useLayoutEffect(() => {
    const no = chaoNo.current;
    if (!orbital || !no) return;

    const escrever = () => {
      no.style.transform = orbital.corrente();
    };
    escrever();
    return orbital.assinar(escrever);
  });

  const conteudo = (
    <>
      <FundoDaCena
        assetId={scene.backgroundAssetId}
        variante={variante}
        aoEncaixar={orbital ? setLugarDoFundo : undefined}
      />

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
          portas={scene.portas}
          portaNaMao={portaNaMao}
          sol={scene.sol}
          // A mesma dos itens: a sombra de uma figura é a figura, e ela lê o
          // arquivo que o token já baixou. Ver `SombraDaFigura`.
          variante={variante}
        />
      )}

      {/* Depois da sombra e ANTES dos itens: o fogo é do chão, e o token pisa
          nele. Fora da prévia, pela razão da sombra: trinta cenas num quadrado
          de 56x32, cada uma assando uma folha de fogo, é forno que ninguém
          olha. Ver `AreaDeEfeitoLayer`. */}
      {variante === "mini" ? null : (
        <AreaDeEfeitoLayer
          areas={scene.areasDeEfeito}
          grid={scene.grid}
          variant={variant}
          onAreaPointerDown={onAreaDeEfeitoPointerDown}
          animarSo={animarSo}
          // De esguelha, o fogo fica de pé, como as peças: no piso, só a base.
          // Ver `useChamasDePe`.
          soBase={Boolean(esguelha)}
        />
      )}

      {(semItens === true
        ? []
        : typeof semItens === "function"
          ? items.filter((item) => !semItens(item))
          : items
      ).map((item) =>
        esguelha ? (
          // O relevo do que está deitado: uma borda escura rente e a sombra
          // curta para um lado. Num envelope à parte, e não no item, para o
          // `CanvasItemView` continuar o mesmo do mapa de prumo.
          <div
            key={item.id}
            className="absolute top-0 left-0"
            style={{ filter: RELEVO_DO_DEITADO }}
          >
            <CanvasItemView
              item={item}
              smooth={smooth}
              naMao={item.id === naMao}
              variante={variante}
              efeitos={
                item.personagemId
                  ? efeitosPorPersonagem.get(item.personagemId)
                  : efeitosDoObjeto(item.condicoes)
              }
              efeitosParados={parado(item.id)}
              onPointerDown={onItemPointerDown}
            />
          </div>
        ) : (
        <CanvasItemView
          key={item.id}
          item={item}
          smooth={smooth}
          naMao={item.id === naMao}
          variante={variante}
          efeitos={
            item.personagemId
              ? efeitosPorPersonagem.get(item.personagemId)
              : efeitosDoObjeto(item.condicoes)
          }
          efeitosParados={parado(item.id)}
          onPointerDown={onItemPointerDown}
        />
        ),
      )}

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
          portas={scene.portas}
          portaNaMao={portaNaMao}
          escuridao={scene.escuridao}
          corDoEscuro={scene.corDoEscuro}
          variant={variant}
          smooth={smooth}
          naMao={naMao}
          // A mesma dos itens e da sombra do sol: a silhueta sai do arquivo
          // que o token já baixou. Ver `useSilhuetasDosTokens`.
          variante={variante}
          efeitosDoItem={efeitosDoItem}
          areasDeEfeito={scene.areasDeEfeito}
          grid={scene.grid}
          animarSo={animarSo}
        />
      )}

      {/* As lanternas abrem a névoa dinâmica, e as paredes e portas param a
          revelação como param a luz -- a mesma lista que a `LuzLayer` lê.
          Na prévia, o bloco de sempre: ver `simples`. */}
      <FogLayer
        fog={scene.fog}
        variant={variant}
        smooth={smooth}
        onFogPointerDown={onFogPointerDown}
        items={items}
        paredes={scene.paredes}
        portas={scene.portas}
        portaNaMao={portaNaMao}
        naMao={naMao}
        simples={variante === "mini"}
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
      {/* Os objetos seguem o interruptor da cena, e só onde quem monta pediu
          informação (`fichas` presente): a miniatura e o 2.5D, que desenha a
          sua, passam sem. */}
      {fichas && (fichas.length > 0 || scene.infoDosTokens) ? (
        <InfoDoToken itens={items} fichas={fichas} objetos={Boolean(scene.infoDosTokens)} />
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
          // O palco do Mestre não passa retrato nenhum -- ele é arrastado e
          // escalado no quadro da janela Retratos. Ver `QuadroDosRetratos`.
          espaco={variant === "mesa" ? "tela" : "cena"}
          rolagens={rolagens}
          efeitos={efeitosPorPersonagem}
          animarSo={animarSo}
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
  const deitado = orbital ? (
    // A orbital: a caixa de quem a recebe, cortando o que passa dela -- o chão
    // vai além da tela, e é isso que a faz ler como mesa. O olho fica no meio
    // da caixa. Na TV a caixa é o plano; no Mestre, a área do palco. A corrente
    // não está no `style`: quem a põe é o efeito lá em cima.
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          perspective: `${orbital.perspectiva}px`,
          perspectiveOrigin: "50% 50%",
        }}
      >
        <div
          ref={anunciarChao}
          className="absolute top-0 left-0"
          style={{
            width: SCENE_WIDTH,
            height: SCENE_HEIGHT,
            transformOrigin: "0 0",
            clipPath: corteDoChao,
          }}
        >
          {envelopado}
        </div>
      </div>
    </div>
  ) : foto ? (
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
        transform: foto.encaixe,
      }}
    >
      <div
        className="absolute top-0 left-0"
        style={{
          width: SCENE_WIDTH,
          height: SCENE_HEIGHT,
          perspective:
            foto.perspectiva > 0 ? `${foto.perspectiva}px` : "none",
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
            transform: foto.cena,
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
