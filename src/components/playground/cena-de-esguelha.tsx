"use client";

import { useMemo } from "react";

import { ChaoInclinado } from "@/components/playground/chao-inclinado";
import { SceneLayer } from "@/components/playground/scene-layer";
import { useCameraSuave } from "@/hooks/use-camera-suave";
import {
  cameraDoRecorte,
  focalDaLente,
  LENTE_DA_MESA,
  type CameraAssinavel,
  type Tela,
} from "@/lib/geometry/camera-orbital";
import { UNIDADES_POR_METRO } from "@/lib/geometry/sombra";
import { FULL_VIEWPORT } from "@/lib/geometry/viewport";
import type { EfeitosDoPersonagem } from "@/lib/condicao";
import type { Variante } from "@/lib/vault/assets";
import { useAssetUrl } from "@/hooks/use-asset-url";
import type { RolagemDaMesa } from "@/types/dado";
import type { Ping } from "@/types/ping";
import {
  itensVisiveis,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type FichaNaCena,
  type Portrait,
  type Scene,
  type Viewport,
} from "@/types/scene";

/**
 * A janela da orbital na TV: o próprio plano.
 *
 * O palco do Espectador fica parado no plano inteiro quando a cena está de
 * esguelha, e a orbital olha DENTRO dele -- em unidades de plano, que ali são
 * unidades de cena. É o que mantém de pé tudo o que a `SceneLayer` pede ao
 * palco (escala, camada da tela, retrato), sem um segundo palco.
 */
const TELA_DO_PLANO: Tela = {
  largura: SCENE_WIDTH,
  altura: SCENE_HEIGHT,
  focal: focalDaLente(SCENE_HEIGHT, LENTE_DA_MESA),
};


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
 * ## A câmera é a orbital
 *
 * Um olho sobre a mesa, e não a foto dela -- ver `camera-orbital.ts`. Ela
 * segue a câmera que o mestre pôs no ar (`camera`): o centro do recorte vira o
 * ponto que se olha, e a largura dele vira a distância. Entre uma amostra e
 * outra quem suaviza é `useCameraSuave`, com as mesmas curvas que a transição
 * do palco usava na foto. Por isso o palco em volta fica PARADO no plano
 * inteiro: quem anda é o olho.
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
  variante,
  smooth,
  camera,
  corte = 0,
  orbital: deFora,
}: {
  scene: Scene;
  portraits?: Portrait[];
  fichas?: FichaNaCena[];
  efeitos?: EfeitosDoPersonagem[];
  rolagens?: RolagemDaMesa[];
  pings?: Ping[];
  variante?: Variante;
  smooth?: boolean;
  /** O recorte que a câmera no ar mostra. Ausente = o plano inteiro. */
  camera?: Viewport;
  /** Muda a cada corte de câmera: a câmera entra seca, sem voar até lá. */
  corte?: number;
  /**
   * A câmera já pronta, no lugar da que segue `camera`.
   *
   * É o Mestre: lá quem anda é a mão dele, com os gestos da câmera de mesa
   * (`useCameraOrbital`), e não as amostras de uma câmera no ar. A caixa onde a
   * cena se desenha é quem a recebe -- ver o envelope orbital da `SceneLayer`.
   */
  orbital?: CameraAssinavel;
}) {
  const vista = scene.vista;

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

  /**
   * Para onde o olho deve ir, pela câmera no ar.
   *
   * Montado sempre -- hooks não pulam --, e só usado com a cena de esguelha.
   */
  const destino = useMemo(
    () =>
      cameraDoRecorte(
        camera ?? FULL_VIEWPORT,
        TELA_DO_PLANO,
        vista?.giro ?? 0,
        vista?.inclinacao ?? 0,
      ),
    [camera, vista],
  );
  const { corrente, assinar } = useCameraSuave(destino, TELA_DO_PLANO, corte);
  const daTv = useMemo<CameraAssinavel>(
    () => ({ corrente, assinar, perspectiva: TELA_DO_PLANO.focal }),
    [assinar, corrente],
  );
  const orbital = deFora ?? daTv;

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
  const pecas = useMemo(
    () =>
      // Sem os escondidos, como a `SceneLayer` faz: a TV já os recebe sem
      // eles, e no Mestre esta é a mesa vista de esguelha. Ver `itensVisiveis`.
      [...itensVisiveis(scene.items, scene.grupos)]
        .sort((a, b) => a.z - b.z)
        .map((item) => ({
          id: item.id,
          x: item.x,
          y: item.y,
          lado: item.width,
          altura: item.height,
          assetId: item.assetId,
        })),
    [scene.grupos, scene.items],
  );

  // Sem vista, é o mapa de prumo de sempre -- e por este caminho ele não paga
  // nem um nó a mais, que é a propriedade que o modo tem desde o começo.
  if (!vista) {
    return (
      <SceneLayer
        scene={scene}
        portraits={portraits}
        fichas={fichas}
        efeitos={efeitos}
        rolagens={rolagens}
        pings={pings}
        variante={variante}
        smooth={smooth}
      />
    );
  }

  return (
    <>
      <SceneLayer
        scene={scene}
        portraits={portraits}
        fichas={fichas}
        efeitos={efeitos}
        rolagens={rolagens}
        pings={pings}
        variante={variante}
        smooth={smooth}
        esguelha={orbital}
        semItens
      />

      <ChaoInclinado
        paredes={scene.paredes ?? []}
        // Não para desenhar o piso -- `semChao` cuida disso --, mas para a cor
        // das faces. Enquanto o daemon não responde a face cai na textura de
        // reserva, que é pior e não quebrada.
        mapaUrl={mapaUrl ?? ""}
        semChao
        giro={vista.giro}
        inclinacao={vista.inclinacao}
        perspectiva={0}
        orbital={orbital}
        escurecer={0.42}
        sol={scene.sol}
        // A pegada é desenho de autoria -- o mestre conferindo se a parede está
        // em pé sobre o próprio rastro. A mesa não traça planta nenhuma, e o
        // rastro amarelo ali entregaria de graça onde estão os cômodos.
        pegadas={false}
        grade={false}
        passoDaGrade={Math.round(UNIDADES_POR_METRO)}
        pecas={pecas}
        variante={variante}
      />
    </>
  );
}
