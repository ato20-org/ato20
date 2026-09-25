"use client";

import { useMemo } from "react";

import { ChaoInclinado } from "@/components/playground/chao-inclinado";
import { SceneLayer } from "@/components/playground/scene-layer";
import { UNIDADES_POR_METRO } from "@/lib/geometry/sombra";
import { correnteDeEsguelha } from "@/lib/geometry/volume";
import type { EfeitosDoPersonagem } from "@/lib/condicao";
import type { Variante } from "@/lib/vault/assets";
import { useAssetUrl } from "@/hooks/use-asset-url";
import type { RolagemDaMesa } from "@/types/dado";
import type { Ping } from "@/types/ping";
import type { FichaNaCena, Portrait, Scene } from "@/types/scene";

/**
 * A distância do olho, em pixels de cena.
 *
 * Fixa, e não um campo da cena: a `Vista` guarda de ONDE se olha, que é a
 * pergunta que quem mestra faz. A abertura da lente é decisão de desenho, e uma
 * decisão que a bancada respondeu olhando -- 2600 é o que faz a sala ler como
 * sala sem a borda de perto engordar. Um mostrador a mais no painel seria um
 * botão para piorar o enquadramento.
 */
const PERSPECTIVA = 2600;

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
 * A corrente vem de `correnteDeEsguelha`, UMA vez, e as duas a recebem pronta.
 * Não é preciosismo: a `SceneLayer` se entrega por PORTAL ao plano de conteúdo
 * e escapa de qualquer `div` posto em volta dela, então as duas chegam ao mesmo
 * plano por caminhos diferentes. Um décimo de grau de diferença entre elas põe
 * a parede fora do próprio rastro, e o erro seria daqueles que se olha por uma
 * hora sem achar.
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
}: {
  scene: Scene;
  portraits?: Portrait[];
  fichas?: FichaNaCena[];
  efeitos?: EfeitosDoPersonagem[];
  rolagens?: RolagemDaMesa[];
  pings?: Ping[];
  variante?: Variante;
  smooth?: boolean;
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

  const corrente = useMemo(
    () =>
      vista
        ? correnteDeEsguelha(vista.giro, vista.inclinacao, PERSPECTIVA)
        : null,
    [vista],
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
  const pecas = useMemo(
    () =>
      [...scene.items]
        .sort((a, b) => a.z - b.z)
        .map((item) => ({
          id: item.id,
          x: item.x,
          y: item.y,
          lado: item.width,
          altura: item.height,
          assetId: item.assetId,
        })),
    [scene.items],
  );

  // Sem vista, é o mapa de prumo de sempre -- e por este caminho ele não paga
  // nem um nó a mais, que é a propriedade que o modo tem desde o começo.
  if (!vista || !corrente) {
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
        esguelha={corrente}
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
        perspectiva={PERSPECTIVA}
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
