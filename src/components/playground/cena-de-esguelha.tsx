"use client";

import { useMemo, type ReactNode } from "react";

import { useChamasDePe } from "@/components/playground/area-de-efeito-layer";
import { ChaoInclinado } from "@/components/playground/chao-inclinado";
import {
  DeitadosNaTela,
  type Deitado,
} from "@/components/playground/deitados-na-tela";
import { InfoDeEsguelha } from "@/components/playground/info-de-esguelha";
import { SceneLayer } from "@/components/playground/scene-layer";
import { useCameraSuave } from "@/hooks/use-camera-suave";
import {
  focalDaLente,
  LENTE_DA_MESA,
  OLHAR_PADRAO,
  vistoPeloTripe,
  type CameraAssinavel,
  type Tela,
} from "@/lib/geometry/camera-orbital";
import { olharDe } from "@/lib/geometry/peca-de-esguelha";
import { UNIDADES_POR_METRO } from "@/lib/geometry/sombra";
import { efeitosDoObjeto, type EfeitosDoPersonagem } from "@/lib/condicao";
import type { Variante } from "@/lib/vault/assets";
import { useAssetUrl } from "@/hooks/use-asset-url";
import type { RolagemDaMesa } from "@/types/dado";
import type { LaserNaMesa } from "@/types/laser";
import type { Ping } from "@/types/ping";
import {
  itensVisiveis,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type FichaNaCena,
  type Portrait,
  type Scene,
  type Tripe,
} from "@/types/scene";

/**
 * A janela do tripé na mesa: o próprio plano.
 *
 * O palco do Espectador fica parado no plano inteiro quando um tripé está no
 * ar, e o tripé olha DENTRO dele -- em unidades de plano, que ali são unidades
 * de cena. É o que mantém de pé tudo o que a `SceneLayer` pede ao palco
 * (escala, camada da tela, retrato), sem um segundo palco.
 *
 * A focal é a da lente da mesa, e é fixa: a lente de cada tripé entra como
 * escala dentro da corrente. Ver `correnteDoTripe`.
 */
const TELA_DO_PLANO: Tela = {
  largura: SCENE_WIDTH,
  altura: SCENE_HEIGHT,
  focal: focalDaLente(SCENE_HEIGHT, LENTE_DA_MESA),
};

/** O tripé que ninguém vê: hooks não pulam, e sem tripé no ar algum vai. */
const SEM_TRIPE: Tripe = {
  x: SCENE_WIDTH / 2,
  y: SCENE_HEIGHT / 2,
  altura: 1000,
  giro: 0,
  inclinacao: 0,
  rolagem: 0,
  lente: LENTE_DA_MESA,
};

/** Quem sai do piso para ficar em pé no chão inclinado. Ver `CanvasItem.deitado`. */
function emPe(item: { deitado?: boolean }): boolean {
  return !item.deitado;
}

/**
 * A cena vista de esguelha: o chão da `SceneLayer` e o que se ergue dele.
 *
 * ## Por que duas árvores, e não uma
 *
 * Porque cada uma sabe uma metade, e nenhuma sabe a outra.
 *
 * A `SceneLayer` desenha o PISO -- mapa, grade, sombra, névoa, riscos, medidor
 * --, e desenha tudo isso há muito tempo, com os casos de borda já resolvidos.
 * Deitá-la inteira por um envelope é reaproveitar as onze camadas dela de
 * graça; portá-las uma a uma para dentro do chão inclinado seria reescrever
 * onze coisas que já funcionam.
 *
 * O `ChaoInclinado` desenha o que SOBE: as faces das paredes, as lajes e as
 * peças em pé. E precisa desenhá-las numa lista só, ordenada por profundidade,
 * porque sem `preserve-3d` nesta webview não há motor ordenando nada -- é essa
 * lista que põe o token atrás do muro atrás do muro.
 *
 * Então a divisão não é arbitrária: é chão contra volume, e cada lado fica com
 * quem já sabia fazer aquilo.
 *
 * ## O que as mantém coladas
 *
 * A câmera é UMA, e as duas a assinam. Não é preciosismo: a `SceneLayer` se
 * entrega por PORTAL ao plano de conteúdo e escapa de qualquer `div` posto em
 * volta dela, então as duas chegam ao mesmo plano por caminhos diferentes. Um
 * décimo de grau de diferença entre elas põe a parede fora do próprio rastro, e
 * o erro seria daqueles que se olha por uma hora sem achar.
 *
 * ## Quem olha
 *
 * Um olho sobre a mesa, e não a foto dela -- ver `camera-orbital.ts`. Na janela
 * do espectador é o TRIPÉ no ar (`tripe`), e entre uma amostra e outra quem
 * suaviza é `useCameraSuave`, com as mesmas curvas que a transição do palco
 * usava na foto. Por isso o palco em volta fica PARADO no plano inteiro: quem
 * anda é o olho. No Mestre é o olhar dele (`olhar`), com os gestos da câmera de
 * mesa. Sem nenhum dos dois, é o mapa de prumo de sempre.
 *
 * ## Os itens trocam de lado
 *
 * `semItens` na `SceneLayer` e a mesma lista virando `pecas` aqui. Deitados com
 * o chão, os tokens ficariam estampados no piso; de esguelha eles se erguem e
 * encaram quem olha, como miniatura numa mesa. E precisam estar na lista do
 * volume para a oclusão valer para eles.
 *
 * O que NÃO troca de lado é o retrato: ele já é overlay de tela na mesa, por
 * MOVIMENTO e não por transbordo -- ninguém o manipula ali, e o que se pede
 * dele é que fique parado enquanto a câmera passa por baixo. Deitá-lo seria
 * colar no chão um cartaz que é da tela.
 */
export function CenaDeEsguelha({
  scene,
  portraits,
  fichas,
  efeitos,
  rolagens,
  pings,
  laser,
  variante,
  smooth,
  tripe,
  corte = 0,
  olhar,
  animarSo,
  naMao,
  sobre,
}: {
  scene: Scene;
  portraits?: Portrait[];
  fichas?: FichaNaCena[];
  efeitos?: EfeitosDoPersonagem[];
  rolagens?: RolagemDaMesa[];
  pings?: Ping[];
  /** O laser do mestre. Ver `SceneLayer`. */
  laser?: LaserNaMesa | null;
  variante?: Variante;
  smooth?: boolean;
  /** O tripé no ar, na janela do espectador. Ver `Tripe`. */
  tripe?: Tripe;
  /** Só estes animam os efeitos. Ausente = todos. Ver `animarSo` em `SceneLayer`. */
  animarSo?: ReadonlySet<string>;
  /** Muda a cada corte de câmera: o tripé entra seco, sem voar até lá. */
  corte?: number;
  /**
   * O olhar do Mestre, no lugar do tripé.
   *
   * Lá quem anda é a mão dele, com os gestos da câmera de mesa
   * (`useCameraOrbital`), e não as amostras de uma câmera no ar. O giro e a
   * inclinação vêm à parte porque a ordem do pintor e as peças em pé dependem
   * deles, e a câmera só os escreve no DOM. A caixa onde a cena se desenha é
   * quem a recebe -- ver o envelope orbital da `SceneLayer`.
   */
  olhar?: { camera: CameraAssinavel; giro: number; inclinacao: number };
  /** O item que o dedo do jogador segura. Ver `naMao` em `SceneLayer`. */
  naMao?: string;
  /**
   * O que vai por cima de tudo, com a câmera em mãos: as alças do celular, que
   * precisam do olho do VOO para ficar sobre a figura, e não do tripé de
   * destino. Só de esguelha; de prumo quem chama desenha as suas.
   */
  sobre?: (camera: CameraAssinavel) => ReactNode;
}) {

  /**
   * O mapa, resolvido aqui mesmo.
   *
   * Não para desenhar o piso -- quem o desenha é a `SceneLayer` --, mas para a
   * COR das faces: elas sobem com a cor dominante do topo da própria parede,
   * lida do arquivo do mapa. Ver `useCoresDasParedes`.
   *
   * O arquivo INTEIRO e não a variante de tela: o que se lê dele é cor, e uma
   * miniatura já a tem. Pedir a variante seria um segundo download do mesmo
   * mapa que o piso acabou de baixar.
   */
  const mapaUrl = useAssetUrl(scene.backgroundAssetId, variante);

  // O voo do tripé, montado sempre -- hooks não pulam. Sem tripé, voa para
  // lugar nenhum e ninguém assina.
  const { corrente, assinar, vista } = useCameraSuave(
    tripe ?? SEM_TRIPE,
    TELA_DO_PLANO,
    corte,
  );
  // Com o olho do voo: é por ele que a figura em pé fica de prumo na tela e o
  // nome vai sobre a cabeça dela, no meio do voo também. Ver `olho` em
  // `CameraAssinavel`.
  const doTripe = useMemo<CameraAssinavel>(
    () => ({ corrente, assinar, perspectiva: TELA_DO_PLANO.focal, olho: vista }),
    [assinar, corrente, vista],
  );
  const camera = olhar?.camera ?? doTripe;
  const giro = olhar?.giro ?? tripe?.giro ?? OLHAR_PADRAO.giro;
  const inclinacao =
    olhar?.inclinacao ?? tripe?.inclinacao ?? OLHAR_PADRAO.inclinacao;

  /**
   * O que está INTEIRO atrás do olho do tripé sai da lista.
   *
   * Inteiro, e não "um canto atrás": o que está todo atrás não aparece de
   * jeito nenhum, e tirá-lo não muda o desenho -- mas um elemento atrás do olho
   * ainda pode ser projetado espelhado à frente por um motor que não corta no
   * plano do olho. O que cruza o plano fica, e quem o corta é o motor.
   *
   * Só com tripé: o olhar do Mestre anda escrevendo a câmera no DOM sem
   * passar por aqui, e quem corta para ele é o próprio chão, a cada aviso da
   * câmera. Ver `olho` em `CameraAssinavel`.
   */
  const visivel = useMemo(
    () =>
      tripe && !olhar
        ? (pontos: ReadonlyArray<{ x: number; y: number; altura: number }>) =>
            vistoPeloTripe(tripe, pontos)
        : undefined,
    [olhar, tripe],
  );

  /**
   * Os itens da cena como peças do chão.
   *
   * `lado` é a largura -- a base que a peça ocupa no piso -- e `altura` vem da
   * caixa dela, que é onde a proporção da arte já está guardada. Um token
   * quadrado sobe quadrado; um sujeito desenhado de pé sobe de pé.
   *
   * Ordenados por `z` como a `SceneLayer` os ordena, e isso é só o desempate: a
   * ordem que vale de esguelha é a profundidade, e quem a calcula é o chão.
   */
  // O que as condições fazem com cada figura, por personagem. Ver
  // `FiguraComEfeitos`.
  const efeitosPorPersonagem = useMemo(
    () => new Map((efeitos ?? []).map((cada) => [cada.personagemId, cada.efeitos])),
    [efeitos],
  );
  const pecas = useMemo(
    () =>
      // Sem os escondidos, como a `SceneLayer` faz: a TV já os recebe sem
      // eles, e no Mestre esta é a mesa vista de esguelha. Ver `itensVisiveis`.
      // Sem os deitados: esses ficam no chão da `SceneLayer`. Ver
      // `CanvasItem.deitado`.
      [...itensVisiveis(scene.items, scene.grupos)]
        .filter((item) => !item.deitado)
        .sort((a, b) => a.z - b.z)
        .map((item) => ({
          id: item.id,
          x: item.x,
          y: item.y,
          lado: item.width,
          altura: item.height,
          assetId: item.assetId,
          espelhada: item.flipX,
          // Para onde ela olha, só de quem espelha pelo olhar: o lado da tela
          // depende do giro, e quem o sabe é o chão. Ver `espelhadaPeloOlhar`.
          ...(item.espelharPeloOlhar ? { olhaPara: olharDe(item) } : {}),
          efeitos: item.personagemId
            ? efeitosPorPersonagem.get(item.personagemId)
            : efeitosDoObjeto(item.condicoes),
          ...(animarSo && !animarSo.has(item.id) ? { parado: true } : {}),
        })),
    [efeitosPorPersonagem, scene.grupos, scene.items, animarSo],
  );
  const visiveis = useMemo(
    () => itensVisiveis(scene.items, scene.grupos),
    [scene.grupos, scene.items],
  );
  /**
   * As deitadas fora do piso, na resolução da tela: só no Mestre, e só com o
   * olho, que é o que põe a figura em pé de prumo. Ver `DeitadosNaTela`.
   */
  const deitadoNaTela = !smooth && Boolean(camera.olho);
  const deitados = useMemo<Deitado[]>(
    () =>
      deitadoNaTela
        ? visiveis
            .filter((item) => item.deitado)
            .sort((a, b) => a.z - b.z)
            .map((item) => ({
              item,
              efeitos: item.personagemId
                ? efeitosPorPersonagem.get(item.personagemId)
                : efeitosDoObjeto(item.condicoes),
              ...(animarSo && !animarSo.has(item.id) ? { parado: true } : {}),
            }))
        : [],
    [animarSo, deitadoNaTela, efeitosPorPersonagem, visiveis],
  );
  // O fogo das áreas, de pé: as chamas entram no chão com as peças, e a
  // profundidade as ordena junto com os tokens e as paredes.
  const chamas = useChamasDePe(scene.areasDeEfeito, scene.grid, animarSo);
  const pecasComChamas = useMemo(
    () => (chamas.length > 0 ? [...pecas, ...chamas] : pecas),
    [pecas, chamas],
  );

  // Sem quem olhe de esguelha, é o mapa de prumo de sempre -- e por este
  // caminho ele não paga nem um nó a mais, que é a propriedade que o modo tem
  // desde o começo.
  if (!tripe && !olhar) {
    return (
      <SceneLayer
        scene={scene}
        portraits={portraits}
        fichas={fichas}
        efeitos={efeitos}
        rolagens={rolagens}
        pings={pings}
        laser={laser}
        variante={variante}
        smooth={smooth}
        animarSo={animarSo}
        naMao={naMao}
      />
    );
  }

  return (
    <>
      <SceneLayer
        scene={scene}
        portraits={portraits}
        efeitos={efeitos}
        rolagens={rolagens}
        pings={pings}
        laser={laser}
        variante={variante}
        smooth={smooth}
        esguelha={camera}
        animarSo={animarSo}
        naMao={naMao}
        // Os em pé sobem no chão inclinado; o deitado fica no piso, ou sai
        // dele para a tela no Mestre. Ver `DeitadosNaTela`.
        semItens={deitadoNaTela ? true : emPe}
        // O nome e os medidores não vão deitados no piso: vão de prumo sobre
        // a cabeça, logo abaixo. Ver `InfoDeEsguelha`.
        fichas={undefined}
      />

      {deitadoNaTela ? (
        <DeitadosNaTela deitados={deitados} camera={camera} />
      ) : null}

      <ChaoInclinado
        paredes={scene.paredes ?? []}
        portas={scene.portas}
        // Não para desenhar o piso -- `semChao` cuida disso --, mas para a cor
        // das faces. Enquanto o daemon não responde a face cai na textura de
        // reserva, que é pior e não quebrada.
        mapaUrl={mapaUrl ?? ""}
        semChao
        giro={giro}
        inclinacao={inclinacao}
        perspectiva={0}
        orbital={camera}
        visivel={visivel}
        escurecer={0.42}
        sol={scene.sol}
        // A pegada é desenho de autoria -- o mestre conferindo se a parede está
        // em pé sobre o próprio rastro. A mesa não traça planta nenhuma, e o
        // rastro amarelo ali entregaria de graça onde estão os cômodos.
        pegadas={false}
        grade={false}
        passoDaGrade={Math.round(UNIDADES_POR_METRO)}
        // Sem `variante`: ela escolhe o tamanho do MAPA. A peça em pé fica na
        // `mini` dela -- ver `PecaEmPe` --, e a `tela` que a janela Mesa do
        // Mestre pede para o chão daria a cada peça uma camada de 1920px.
        pecas={pecasComChamas}
      />

      <InfoDeEsguelha
        itens={visiveis}
        fichas={fichas ?? []}
        objetos={Boolean(fichas) && Boolean(scene.infoDosTokens)}
        camera={camera}
        paredes={scene.paredes}
      />

      {sobre?.(camera)}
    </>
  );
}
