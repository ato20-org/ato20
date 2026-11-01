"use client";

import { useEffect, useState } from "react";

import { useAssetUrl } from "@/hooks/use-asset-url";
import { useVarianteDoFundo } from "@/hooks/use-variante-do-fundo";
import { caberEm } from "@/lib/geometry/caber";
import {
  ajusteDeImagemDe,
  filtroDaImagem,
  type AjusteDeImagem,
} from "@/lib/imagem-do-espectador";
import { assarMapaComTom } from "@/lib/mapa-com-tom";
import type { Variante } from "@/lib/vault/assets";
import { SCENE_HEIGHT, SCENE_WIDTH } from "@/types/scene";

type FundoDaCenaProps = {
  assetId: string | undefined;
  /**
   * Tamanho fixo, quando quem desenha já sabe qual quer.
   *
   * É o caso da prévia de cena (`mini`) e do celular do jogador (`tela`): os
   * dois têm um tamanho de tela conhecido e uma câmera que eles não controlam.
   * Ausente é o palco do mestre e a TV, e aí o tamanho passa a depender do
   * zoom — ver `useVarianteDoFundo`.
   */
  variante?: Variante;
  /**
   * Onde a imagem caiu no plano, a cada vez que isso muda.
   *
   * Existe para o 2.5D: lá a mesa é o MAPA, e não o plano de 16:9 em volta
   * dele. Um mapa 4:3 deixa duas faixas vazias do lado, que de prumo viram a
   * tarja de sempre e de esguelha giram com a cena -- uma barra diagonal
   * escurecida pela névoa e pela escuridão, cortando a mesa. Quem deita o
   * chão corta nele. Ver o envelope orbital da `SceneLayer`.
   */
  aoEncaixar?: (lugar: { x: number; y: number; width: number; height: number }) => void;
  /**
   * O tom da cena (`Scene.imagem`), pintado no arquivo do mapa. Ausente ou
   * neutro = o mapa como ele é.
   *
   * Só o Mestre passa: a TV e o celular aplicam o tom no palco inteiro, por
   * fora dos planos, e aqui ele valeria duas vezes. Só no mapa, para o gizmo e
   * os tokens ficarem de fora. Pintado e não por `filter` de CSS: ver
   * `tom-do-mapa.ts`.
   */
  tom?: AjusteDeImagem;
};

/**
 * O mapa da cena.
 *
 * Existe separado do `SceneLayer` por uma razão só: aqui o endereço da imagem
 * muda SOZINHO no meio do gesto, quando o mestre amplia além do ponto em que a
 * redução deixa de bastar. Trocar o `src` de um `<img>` montado apaga o que
 * está na tela até o arquivo novo decodificar, e o mapa sumindo por trezentos
 * milissegundos no meio de um zoom é pior do que o quadro lento que a troca foi
 * feita para evitar.
 *
 * Então a troca é em duas partes: uma imagem fora da árvore busca e decodifica
 * o arquivo novo, e só depois disso o `<img>` da tela aponta para ele. O
 * `decode()` faz esse trabalho fora da thread que está desenhando, e quando o
 * `src` finalmente muda o arquivo já está no cache do browser — o que aparece
 * na tela é um quadro pronto, e não um buraco.
 *
 * Vale também para a PRIMEIRA imagem, e ali não custa nada: antes disto o
 * `<img>` ficava montado com um `src` que ainda não tinha chegado, o que na
 * tela é o mesmo preto.
 */
export function FundoDaCena({
  assetId,
  variante,
  aoEncaixar,
  tom,
}: FundoDaCenaProps) {
  // Sempre chamado, mesmo quando `variante` decide por fora: o palco é o único
  // lugar sem tamanho fixo, mas a regra dos hooks não admite o "só às vezes".
  const porZoom = useVarianteDoFundo();
  // Os quatro canais soltos, e não o objeto: são eles que decidem se o forno
  // roda de novo, e um objeto novo com os mesmos números não deve rodá-lo.
  const { brilho, contraste, saturacao, matiz } = ajusteDeImagemDe(tom);
  const comTom =
    filtroDaImagem({ brilho, contraste, saturacao, matiz }) !== undefined;
  // Com tom, nunca o arquivo original: ampliado além do palco, ele pode ter
  // oito mil pixels de lado, e o forno decodificaria e pintaria tudo isso de
  // novo a cada mudança. O `palco` tem até 4096, e é o que se vê até ali.
  const url = useAssetUrl(
    assetId,
    variante ?? (comTom ? (porZoom ?? "palco") : porZoom),
  );

  /**
   * O último endereço que TERMINOU de decodificar, com o asset a que ele
   * pertence.
   *
   * É este que a tela desenha, e nunca o `url` recém-chegado: são coisas
   * diferentes de propósito. Enquanto a variante nova não está pronta, quem
   * continua na tela é a ANTERIOR — que é o mapa certo, só com menos pixel do
   * que se vai precisar daqui a um quarto de segundo.
   *
   * Foi assim que nasceu a piscada: a primeira versão escondia a imagem até a
   * nova decodificar, e o mapa sumia por um quadro a cada troca de variante.
   * Trocar de arquivo no meio de um zoom não pode ter momento nenhum em que não
   * há mapa.
   *
   * O asset vai junto porque o raciocínio se inverte quando a CENA muda: aí o
   * que está na tela é o mapa de outra cena, e segurá-lo seria mostrar o lugar
   * errado. Conferir o id na saída é o mesmo cuidado do `useAssetUrl`.
   */
  const [pronta, setPronta] = useState<{
    assetId: string;
    url: string;
    /** Tamanho do arquivo. Zero quando ele não decodificou. Ver `caixa`. */
    largura: number;
    altura: number;
  } | null>(null);

  useEffect(() => {
    if (!assetId || !url) return;

    let vivo = true;
    let espera: ReturnType<typeof setTimeout> | undefined;
    const carga = new Image();
    carga.src = url;

    // As duas pontas entregam: um arquivo que não decodifica é melhor entregue
    // ao `<img>` da tela, que já sabe falhar em silêncio, do que segurado aqui
    // — segurar deixaria o palco com o mapa velho para sempre, sem nada dizendo
    // por quê.
    const entregar = (endereco: string) => {
      if (vivo)
        setPronta({
          assetId,
          url: endereco,
          largura: carga.naturalWidth,
          altura: carga.naturalHeight,
        });
    };

    // Com tom, o arquivo que vai à tela é o ASSADO, e o mapa sem tom não
    // aparece no meio: quem fica na tela enquanto o forno trabalha é o que já
    // estava -- o tom anterior, ao arrastar a régua. A espera curta junta os
    // passos do arrasto num forno só. Sem forno que preste, o mapa sem tom.
    const assarEEntregar = () => {
      espera = setTimeout(() => {
        void assarMapaComTom(url, { brilho, contraste, saturacao, matiz }).then(
          async (assado) => {
            if (!assado) return entregar(url);
            const pronto = new Image();
            pronto.src = assado;
            await pronto.decode().catch(() => undefined);
            entregar(assado);
          },
        );
      }, 120);
    };

    void carga
      .decode()
      .then(comTom ? assarEEntregar : () => entregar(url), () => entregar(url));

    return () => {
      vivo = false;
      clearTimeout(espera);
    };
  }, [assetId, url, comTom, brilho, contraste, saturacao, matiz]);

  // A conta do `contain` não pode ser do CSS aqui dentro: sob `zoom` ele a faz
  // com o tamanho natural do arquivo, e erra. O porquê inteiro, com as medidas,
  // está em `caberEm`.
  const valida = Boolean(assetId) && pronta?.assetId === assetId;
  const lugar = caberEm(
    { largura: pronta?.largura ?? 0, altura: pronta?.altura ?? 0 },
    { width: SCENE_WIDTH, height: SCENE_HEIGHT },
  );

  // Pelos NÚMEROS, e não pelo objeto: `caberEm` devolve um novo a cada render,
  // e avisar a cada render seria um estado novo no pai a cada quadro.
  const { x, y, width, height } = lugar;
  useEffect(() => {
    if (valida && width > 0 && height > 0) {
      aoEncaixar?.({ x, y, width, height });
    }
  }, [aoEncaixar, height, valida, width, x, y]);

  if (!valida || !pronta) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={pronta.url}
      alt=""
      draggable={false}
      // Mapa nenhum deve ser cortado por não ser 16:9, e é `caberEm` quem
      // cuida disso agora.
      className="absolute select-none"
      style={{
        left: lugar.x,
        top: lugar.y,
        width: lugar.width,
        height: lugar.height,
      }}
    />
  );
}
