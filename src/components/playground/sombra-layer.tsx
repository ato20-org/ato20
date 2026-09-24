"use client";

import { memo, useMemo } from "react";

import { useAssetUrl } from "@/hooks/use-asset-url";
import { useSilhueta } from "@/hooks/use-silhueta";
import {
  caixaDoSol,
  manchaDaFigura,
  matrizDoVulto,
  peDaFigura,
  umbrasDoSol,
  vultoDaFigura,
} from "@/lib/geometry/sombra";
import type { Variante } from "@/lib/vault/assets";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type CanvasItem,
  type Parede,
  type Sol,
} from "@/types/scene";

/**
 * Debaixo de TODO item: o `z` de um item começa em 1 (ver `normalizeZ`), e a
 * sombra de uma parede é chão. Acima da grade e do fundo, que vêm antes dela na
 * árvore e não têm `z`.
 */
const SOMBRA_Z = 0;

/**
 * Uma lista vazia COMPARTILHADA, e não `?? []` na hora de usar: `?? []` devolve
 * um array novo a cada render, e array novo é dependência nova -- o `useMemo`
 * daqui recalcularia as umbras a cada quadro de um arrasto que não mexeu em
 * parede nenhuma.
 */
const SEM_PAREDES: Parede[] = [];

/**
 * A sombra que UMA figura deita: ela mesma, preta, deitada a partir dos pés.
 *
 * A conta mora aqui dentro, e não numa lista pronta no componente de cima. É a
 * diferença entre a sombra custar nada e custar o dobro: arrastar um token muda
 * UM item, e `updateItems` preserva a identidade dos outros (ver
 * `CanvasItemView`). Com a conta no filho, os trinta e nove parados não
 * re-renderizam -- o `memo` os corta na porta. Com a conta no pai, um `useMemo`
 * dependente da lista inteira produziria quarenta objetos novos a cada quadro.
 *
 * ## A silhueta, e a mancha atrás dela
 *
 * O desenho é a FIGURA: a mesma imagem do token, pintada de preto e assada uma
 * vez fora do quadro (ver `silhuetaDaImagem`), girada até a direção da sombra e
 * encurtada. É o que a mesa lê como sombra -- o cajado, a capa e a montaria
 * aparecem nela.
 *
 * A mancha oval continua existindo, e é o que se vê enquanto o forno trabalha,
 * no item cuja imagem não pôde ser lida e no que não tem arquivo nenhum. Ela
 * nunca foi o desenho certo; era o desenho barato, e continua sendo o que
 * segura a cena enquanto o certo não chega.
 *
 * ## Nenhum filtro, nos dois casos
 *
 * A tabela que reprovou `drop-shadow` está em `ManchaDaSombra`: 37,3 fps contra
 * 59,4 sem sombra. A silhueta não filtra nada em tempo de quadro -- é uma
 * imagem no compositor, como o token, e o desfoque dela já é pixel assado.
 */
const SombraDaFigura = memo(function SombraDaFigura({
  item,
  sol,
  variante,
}: {
  item: CanvasItem;
  sol?: Sol;
  variante?: Variante;
}) {
  // A MESMA url do token, e por isso a mesma variante: o arquivo já foi
  // buscado para desenhar a figura, e pedir outro tamanho aqui seria um
  // segundo download do mesmo desenho.
  const url = useAssetUrl(item.assetId, variante);
  const silhueta = useSilhueta(url);

  const vulto = useMemo(() => vultoDaFigura(item, sol), [item, sol]);

  const mancha = useMemo(
    () => (silhueta ? null : manchaDaFigura(item, sol)),
    [item, sol, silhueta],
  );

  if (vulto && silhueta) {
    return (
      <div
        className="absolute top-0 left-0"
        style={{
          width: vulto.largura,
          height: vulto.altura,
          opacity: vulto.forca,
          // A matriz já carrega a translação do cisalhamento, então a origem
          // fica no canto: pôr o pé na origem seria contá-lo duas vezes.
          transformOrigin: "0 0",
          // `transform` e não `left/top`: mover um token não pode refazer o
          // layout do plano inteiro a cada quadro do gesto. Mesma regra do
          // próprio item.
          //
          // A matriz deixa o PÉ parado e corre o resto na direção do sol, na
          // medida da altura de cada ponto -- ver `matrizDoVulto`. O pé sai do
          // recorte que o forno mediu, já contando o giro do item: ver
          // `peDaFigura`.
          transform:
            `translate(${vulto.x}px, ${vulto.y}px) ` +
            matrizDoVulto(
              vulto,
              peDaFigura(
                silhueta.recorte,
                vulto.largura,
                vulto.altura,
                item.rotation,
              ),
            ),
        }}
      >
        {/* O giro do item, na mesma ordem em que o token o aplica: a caixa gira
            em torno do centro e a imagem espelha dentro dela (ver
            `CanvasItemView`). É por estar AQUI, debaixo do cisalhamento, que a
            sombra obedece à rotação sem virar caso especial: o que escorre no
            chão é a figura já na posição em que a mesa a vê.

            O espelhamento acompanha pela mesma razão -- a sombra é da figura
            virada, não da original. */}
        <div
          className="absolute inset-0"
          style={
            item.rotation
              ? { transform: `rotate(${item.rotation}deg)` }
              : undefined
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={silhueta.desenho}
            alt=""
            aria-hidden
            draggable={false}
            // `max-w-none` pela mesma razão do traço do token: o preflight do
            // Tailwind põe `max-width: 100%` em toda imagem, e esta PRECISA
            // passar da caixa -- a margem é onde o desfoque mora. Ver
            // `ContornoDoItem`.
            className="absolute max-w-none select-none"
            style={{
              left: porcento(-silhueta.margemX),
              top: porcento(-silhueta.margemY),
              width: porcento(1 + 2 * silhueta.margemX),
              height: porcento(1 + 2 * silhueta.margemY),
              transform:
                item.flipX || item.flipY
                  ? `scale(${item.flipX ? -1 : 1}, ${item.flipY ? -1 : 1})`
                  : undefined,
            }}
          />
        </div>
      </div>
    );
  }

  if (!mancha) return null;

  return (
    <div
      className="absolute top-0 left-0 rounded-[50%]"
      style={{
        width: mancha.largura,
        height: mancha.altura,
        transform: `translate(${mancha.x - mancha.largura / 2}px, ${mancha.y - mancha.altura / 2}px)`,
        // `closest-side` prende o degradê à borda da elipse, então ele
        // acompanha qualquer tamanho de item sem recontar parada nenhuma.
        background: `radial-gradient(closest-side, rgb(0 0 0 / ${mancha.forca}), rgb(0 0 0 / 0))`,
      }}
    />
  );
});

/** Arredondado porque `1.06 * 100` em ponto flutuante é `106.00000000000001`. */
function porcento(fracao: number): string {
  return `${(fracao * 100).toFixed(3)}%`;
}

/**
 * A sombra da cena: a mancha que cada figura deita no chão e o vulto que as
 * paredes jogam atrás de si.
 *
 * O mapa continua com o brilho cheio -- não há escuridão de ambiente aqui. O
 * sol não ACENDE nada: ele diz de onde a sombra sai, e a sombra é o único
 * desenho. É o que mantém a feature barata o bastante para a TV, e é o que
 * permite ligá-la num mapa que já veio bonito sem apagá-lo.
 *
 * O SVG tem o tamanho EXATO do plano, e nada aqui passa da caixa dele: filho
 * que transborda um plano infla a camada composta do WebKitGTK, e o mapa passa
 * a ser pintado deslocado e fica preto ampliado. Esse bug já derrubou o Mestre
 * três vezes. Ver a skill `debug-do-palco`, §3.
 */
export function SombraLayer({
  items,
  paredes = SEM_PAREDES,
  sol,
  variante,
}: {
  items: CanvasItem[];
  paredes?: Parede[];
  sol?: Sol;
  /** O tamanho de arquivo que os itens desta tela desenham. Ver `Variante`. */
  variante?: Variante;
}) {
  /**
   * Parede não se mexe durante um arrasto de token, então este `useMemo` não
   * recalcula nada no quadro em que a figura anda -- que é o quadro que não
   * pode custar.
   */
  const umbra = useMemo(() => {
    if (!sol || paredes.length === 0) return null;

    const caminho = umbrasDoSol(paredes, sol);
    const caixa = caixaDoSol(paredes, sol);
    if (!caminho || !caixa) return null;

    return { caminho, caixa };
  }, [paredes, sol]);

  const figuras = useMemo(
    () => (sol ? items.filter((item) => !item.semSombra) : []),
    [items, sol],
  );

  if (figuras.length === 0 && !umbra) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 overflow-hidden"
      style={{ width: SCENE_WIDTH, height: SCENE_HEIGHT, zIndex: SOMBRA_Z }}
    >
      {figuras.map((item) => (
        <SombraDaFigura
          key={item.id}
          item={item}
          sol={sol}
          variante={variante}
        />
      ))}

      {umbra && sol ? (
        /* UM SVG, do tamanho do que as umbras de fato pintam -- e não do
           tamanho do plano. O plano inteiro são 2,07 milhões de pixels
           re-rasterizados a cada quadro em que a câmera anda. */
        <svg
          className="absolute top-0 left-0"
          width={umbra.caixa.width}
          height={umbra.caixa.height}
          viewBox={`${umbra.caixa.x} ${umbra.caixa.y} ${umbra.caixa.width} ${umbra.caixa.height}`}
          // `transform` e não `left/top` pela mesma razão do item: mover o sol
          // não pode refazer o layout do plano.
          style={{
            transform: `translate(${umbra.caixa.x}px, ${umbra.caixa.y}px)`,
          }}
        >
          {/* Um `path` só, com todas as paredes dentro: sombras que se cruzam
              não podem escurecer duas vezes. Ver `umbrasDoSol`.

              Nada aqui entra na pedra das paredes, e não é máscara que faz
              isso: só as bordas que jogam para FORA da parede projetam. Ver
              `segmentosQueProjetam`, onde está a medida que reprovou a
              máscara. */}
          <path d={umbra.caminho} fill="#000" fillOpacity={sol.forca} />
        </svg>
      ) : null}
    </div>
  );
}
