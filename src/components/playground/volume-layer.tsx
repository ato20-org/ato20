"use client";

import { memo, useId, useMemo } from "react";

import { volumeDasParedes, type VistaDoRelevo } from "@/lib/geometry/volume";
import { SCENE_HEIGHT, SCENE_WIDTH, type Parede } from "@/types/scene";

/**
 * Quão escura fica a face de uma parede, de 0 a 1.
 *
 * A face é pintada com a MESMA imagem do mapa, e sem escurecer ela some: o
 * pedaço de chão que sobe tem a cor do pedaço de chão que ficou, e o olho lê
 * borrão em vez de relevo. Escurecida, a mesma textura vira o lado sombreado
 * de um volume -- que é o que ela é.
 *
 * Um retângulo de `rgba` por cima, e NÃO um filtro. A tabela que reprovou
 * filtro está em `ManchaDaSombra`: 37,3 fps contra 59,4, e pelo mesmo motivo
 * que vale aqui -- o palco re-rasteriza a cada quadro em que a câmera anda, e
 * um filtro por parede é um passe por parede por quadro.
 */
const ESCURECER_FACE = 0.42;

/**
 * O relevo das paredes: elas erguidas, pintadas com a textura do próprio mapa.
 *
 * ## De onde vem a textura da face
 *
 * Da imagem do mapa, deslocada pelo empurrão. É a ideia inteira do modo: a
 * parede já está PINTADA no mapa, com a pedra, o musgo e a luz que o autor
 * desenhou, e o que falta é ela subir. Um `<pattern>` com a mesma imagem
 * resolve isso sem amostrar pixel nenhum, sem `canvas`, sem segundo download --
 * mesma URL, mesmo bitmap já decodificado que o chão está usando.
 *
 * O topo usa a mesma textura por um caminho mais curto: ele mora dentro de um
 * `<g transform>`, e um `<pattern>` de `userSpaceOnUse` anda junto com o
 * sistema de coordenadas em que é referenciado. Geometria e textura sobem
 * juntas, e o pedaço de mapa que estava sob a parede aparece em cima dela.
 *
 * ## Uma textura por ALTURA, não por parede
 *
 * O deslocamento é `direção × altura × inclinação`, e num mapa há duas ou três
 * alturas. `volumeDasParedes` já entrega agrupado. A mesma economia que a
 * hachura da `ParedeLayer` faz com o padrão dela, e pelo mesmo motivo: um
 * padrão por parede seria uma textura por parede para mostrar a mesma imagem.
 *
 * ## Nada sai da caixa
 *
 * Um SVG só, do tamanho exato do plano, como a `ParedeLayer` e a
 * `SombraLayer`. Uma parede colada na borda de cima tem a face cortada pelo
 * `viewBox`, e está certo: o chão acaba ali. Filho que transborda um plano
 * infla a camada composta do WebKitGTK e faz o mapa ser pintado deslocado e
 * ficar preto ampliado -- três vezes já. Ver `debug-do-palco` §3.
 */
export const VolumeLayer = memo(function VolumeLayer({
  paredes,
  vista,
  mapaUrl,
  escurecer = ESCURECER_FACE,
  contorno = true,
}: {
  paredes: Parede[];
  vista: VistaDoRelevo;
  /** A imagem do chão. Sem ela as faces saem lisas, na cor do contorno. */
  mapaUrl?: string;
  escurecer?: number;
  /** O fio no alto da parede. É ele que separa o topo do chão atrás dele. */
  contorno?: boolean;
}) {
  // `useId` traz dois-pontos, e dois-pontos dentro de um `url(#...)` não é
  // seletor válido. Mesma correção da `ParedeLayer`.
  const base = useId().replace(/:/g, "");

  const faixas = useMemo(
    () => volumeDasParedes(paredes, vista),
    [paredes, vista],
  );

  if (faixas.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute top-0 left-0"
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
      viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}
    >
      <defs>
        {mapaUrl ? (
          <>
            {/* O padrão do TOPO: sem deslocamento nenhum. Quem o desloca é o
                `<g transform>` que o referencia. */}
            <pattern
              id={`${base}-chao`}
              patternUnits="userSpaceOnUse"
              width={SCENE_WIDTH}
              height={SCENE_HEIGHT}
            >
              <image
                href={mapaUrl}
                width={SCENE_WIDTH}
                height={SCENE_HEIGHT}
                preserveAspectRatio="none"
              />
            </pattern>

            {/* E um por faixa para as FACES, que vivem em coordenadas
                absolutas e não podem entrar no grupo deslocado -- elas ligam o
                chão ao topo, e por isso atravessam os dois espaços. */}
            {faixas.map((faixa) => (
              <pattern
                key={`${faixa.empurrao.x},${faixa.empurrao.y}`}
                id={`${base}-face-${faixa.empurrao.x}-${faixa.empurrao.y}`}
                patternUnits="userSpaceOnUse"
                width={SCENE_WIDTH}
                height={SCENE_HEIGHT}
                patternTransform={`translate(${faixa.empurrao.x},${faixa.empurrao.y})`}
              >
                <image
                  href={mapaUrl}
                  width={SCENE_WIDTH}
                  height={SCENE_HEIGHT}
                  preserveAspectRatio="none"
                />
              </pattern>
            ))}
          </>
        ) : null}
      </defs>

      {/* Na ordem que `volumeDasParedes` devolveu: da mais longe para a mais
          perto. Sem isso, a torre do fundo era pintada por cima do muro da
          frente e o relevo lia ao contrário. */}
      {faixas.map((faixa) => {
        const face = `${base}-face-${faixa.empurrao.x}-${faixa.empurrao.y}`;

        return (
          <g key={`${faixa.empurrao.x},${faixa.empurrao.y}`}>
            {/* A face, com a textura do mapa deslocada e escurecida por cima.
                Dois caminhos iguais e não um com filtro -- ver `ESCURECER_FACE`. */}
            <path
              d={faixa.faces}
              fill={mapaUrl ? `url(#${face})` : "#3f3f46"}
            />
            <path d={faixa.faces} fill={`rgba(0,0,0,${escurecer})`} />

            {/* O topo: a laje. Dentro do grupo deslocado, então a textura sobe
                com ele -- é aqui que a parede pintada no mapa aparece em cima
                da parede. */}
            <g
              transform={`translate(${faixa.empurrao.x},${faixa.empurrao.y})`}
            >
              <path
                d={faixa.topos}
                fill={mapaUrl ? `url(#${base}-chao)` : "#52525b"}
              />
              {contorno ? (
                <path
                  d={faixa.topos}
                  fill="none"
                  stroke="rgba(0,0,0,0.55)"
                  strokeWidth={2}
                />
              ) : null}
            </g>
          </g>
        );
      })}
    </svg>
  );
});
