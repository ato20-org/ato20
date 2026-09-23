"use client";

import { memo, useId, useMemo } from "react";

import {
  caixaDaLuz,
  caixaDoSol,
  manchasDaFigura,
  umbrasDaLuz,
  umbrasDoSol,
  uniaoDasCaixas,
  type CaixaDaUmbra,
} from "@/lib/geometry/sombra";
import {
  FORCA_DA_SOMBRA,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type CanvasItem,
  type Luz,
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
 * Listas vazias COMPARTILHADAS, e não `?? []` na hora de usar: `?? []` devolve
 * um array novo a cada render, e array novo é dependência nova -- o `useMemo`
 * daqui recalcularia todas as umbras a cada quadro de um arrasto que não mexeu
 * em parede nenhuma.
 */
const SEM_LUZES: Luz[] = [];
const SEM_PAREDES: Parede[] = [];

/**
 * As manchas que UMA figura deita -- uma por luz que a alcança, mais a do sol.
 *
 * A conta mora aqui dentro, e não numa lista pronta no componente de cima. É a
 * diferença entre a sombra custar nada e custar o dobro: arrastar um token muda
 * UM item, e `updateItems` preserva a identidade dos outros (ver
 * `CanvasItemView`). Com a conta no filho, os trinta e nove parados não
 * re-renderizam -- o `memo` os corta na porta. Com a conta no pai, um `useMemo`
 * dependente da lista inteira produziria quarenta objetos novos a cada quadro.
 *
 * Um degradê de fundo, e nenhum filtro: ver `ManchaDaSombra`, onde está a
 * tabela que reprovou as duas versões com filtro.
 */
const ManchaDaFigura = memo(function ManchaDaFigura({
  item,
  luzes,
  sol,
}: {
  item: CanvasItem;
  luzes: Luz[];
  sol?: Sol;
}) {
  const manchas = useMemo(
    () => manchasDaFigura(item, sol, luzes),
    [item, luzes, sol],
  );

  return (
    <>
      {manchas.map((mancha, indice) => (
        <div
          key={indice}
          className="absolute top-0 left-0 rounded-[50%]"
          style={{
            width: mancha.largura,
            height: mancha.altura,
            // `transform` e não `left/top`: mover um token não pode refazer o
            // layout do plano inteiro a cada quadro do gesto. Mesma regra do
            // próprio item.
            transform: `translate(${mancha.x - mancha.largura / 2}px, ${mancha.y - mancha.altura / 2}px)`,
            // `closest-side` prende o degradê à borda da elipse, então ele
            // acompanha qualquer tamanho de item sem recontar parada nenhuma.
            background: `radial-gradient(closest-side, rgb(0 0 0 / ${mancha.forca}), rgb(0 0 0 / 0))`,
          }}
        />
      ))}
    </>
  );
});

/**
 * A sombra da cena: a mancha que cada figura deita no chão e o vulto que as
 * paredes jogam atrás de si.
 *
 * O mapa continua com o brilho cheio -- não há escuridão de ambiente aqui. A
 * luz não ACENDE nada: ela diz de onde a sombra sai, e a sombra é o único
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
  luzes = SEM_LUZES,
  sol,
}: {
  items: CanvasItem[];
  paredes?: Parede[];
  luzes?: Luz[];
  sol?: Sol;
}) {
  // `useId` traz dois-pontos, e dois-pontos dentro de um `url(#...)` não é um
  // seletor válido. Duas cenas na mesma página -- a lista de prévias -- não
  // podem compartilhar id de degradê: a segunda roubaria o da primeira.
  const base = useId().replace(/:/g, "");

  /**
   * Parede não se mexe durante um arrasto de token, então este `useMemo` não
   * recalcula nada no quadro em que a figura anda -- que é o quadro que não
   * pode custar.
   */
  const { todas: umbras, caixa } = useMemo(() => {
    if (paredes.length === 0)
      return { todas: [], caixa: null as CaixaDaUmbra | null };

    const todas: {
      chave: string;
      caminho: string;
      forca: number;
      /** `null` é o SOL: ele não tem posição, e por isso não tem desmaio. */
      luz: Luz | null;
    }[] = [];

    /** A caixa de TODAS elas: é ela que dimensiona o SVG. Ver `CaixaDaUmbra`. */
    let caixa: CaixaDaUmbra | null = null;

    for (const luz of luzes) {
      const caminho = umbrasDaLuz(paredes, luz);
      const daLuz = caixaDaLuz(luz);
      if (!caminho || !daLuz) continue;

      caixa = uniaoDasCaixas(caixa, daLuz);
      todas.push({
        chave: luz.id,
        caminho,
        forca: luz.forca ?? FORCA_DA_SOMBRA,
        luz,
      });
    }

    if (sol) {
      const caminho = umbrasDoSol(paredes, sol);
      const doSol = caixaDoSol(paredes, sol);
      if (caminho && doSol) {
        caixa = uniaoDasCaixas(caixa, doSol);
        todas.push({ chave: "sol", caminho, forca: sol.forca, luz: null });
      }
    }

    return { todas, caixa };
  }, [paredes, luzes, sol]);

  const figuras = useMemo(
    () =>
      sol || luzes.length > 0 ? items.filter((item) => !item.semSombra) : [],
    [items, luzes, sol],
  );

  if (figuras.length === 0 && umbras.length === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 overflow-hidden"
      style={{ width: SCENE_WIDTH, height: SCENE_HEIGHT, zIndex: SOMBRA_Z }}
    >
      {figuras.map((item) => (
        <ManchaDaFigura key={item.id} item={item} luzes={luzes} sol={sol} />
      ))}

      {caixa ? (
        /* UM SVG, do tamanho do que as umbras de fato pintam -- e não do
           tamanho do plano. O plano inteiro são 2,07 milhões de pixels
           re-rasterizados a cada quadro em que a câmera anda. Um SVG por umbra
           mediu pior que um só: ver `uniaoDasCaixas`. */
        <svg
          className="absolute top-0 left-0"
          width={caixa.width}
          height={caixa.height}
          viewBox={`${caixa.x} ${caixa.y} ${caixa.width} ${caixa.height}`}
          // `transform` e não `left/top` pela mesma razão do item: arrastar uma
          // luz não pode refazer o layout do plano.
          style={{ transform: `translate(${caixa.x}px, ${caixa.y}px)` }}
        >
          {/* O desmaio é a PINTURA da umbra, e não uma máscara por cima dela.

              A máscara era o desenho óbvio -- recorta a sombra no alcance da
              luz -- e custava caro: mascarar obriga o motor a compor duas
              camadas a cada re-raster. O mesmo desenho sai de um degradê no
              `fill`, que é um passe só -- e ainda fica mais certo, porque aí a
              sombra enfraquece com a distância, como uma sombra de verdade. */}
          <defs>
            {umbras.map(({ luz, forca }) =>
              luz ? (
                <radialGradient
                  key={luz.id}
                  id={`${base}-desmaio-${luz.id}`}
                  gradientUnits="userSpaceOnUse"
                  cx={luz.x}
                  cy={luz.y}
                  r={luz.raio}
                >
                  <stop offset="0" stopColor="#000" stopOpacity={forca} />
                  <stop offset="0.6" stopColor="#000" stopOpacity={forca} />
                  <stop offset="1" stopColor="#000" stopOpacity={0} />
                </radialGradient>
              ) : null,
            )}
          </defs>

          {/* Um `path` por luz, com todas as paredes dentro: sombras que se
              cruzam não podem escurecer duas vezes. Ver `umbrasDaLuz`. */}
          {umbras.map(({ chave, caminho, forca, luz }) => (
            <path
              key={chave}
              d={caminho}
              fill={luz ? `url(#${base}-desmaio-${luz.id})` : "#000"}
              fillOpacity={luz ? undefined : forca}
            />
          ))}
        </svg>
      ) : null}
    </div>
  );
}
