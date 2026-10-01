"use client";

import { useId } from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import {
  contornoDaParede,
  corpoDaParede,
  type FormaDaParede,
} from "@/lib/geometry/sombra";
import { SCENE_HEIGHT, SCENE_WIDTH, type Scene } from "@/types/scene";

/**
 * Tudo aqui em pixels de TELA, dividido pelo `scale` na hora de desenhar.
 *
 * É a mesma regra das alças de transformação e do alfinete: um traço em
 * unidades de cena engrossaria com o zoom, e a 400% a parede viraria uma faixa
 * cobrindo o corredor que ela contorna.
 */
const TRACO_PX = 1.5;

/**
 * O passo e a espessura da hachura, em pixels de tela.
 *
 * Esparsa, e isso foi correção: a 9px a faixa virava um bloco listrado, e numa
 * parede que corre perto dos 45° da tela os riscos ficavam quase paralelos às
 * bordas dela -- o olho lia meia dúzia de paredes finas em vez de uma grossa.
 * Hachura de planta é rala: ela diz "isto é maciço" com três riscos, não
 * preenche o desenho.
 */
const HACHURA_PASSO_PX = 26;
const HACHURA_TRACO_PX = 1;

const COR_DA_PAREDE = "#facc15";

/**
 * Quanto da pintura a parede PARADA mostra, contra a selecionada.
 *
 * Metade, e não a inteira: uma parede coberta que o mestre desenha sobre o
 * prédio todo pintava de amarelo e riscava cada token lá dentro, e o mapa que
 * ele prepara ficava atrás de uma grade. A borda continua firme -- é ela que
 * diz onde a pedra acaba -- e a selecionada volta à pintura cheia, porque é
 * nela que o mestre está mexendo.
 */
const PINTURA_PARADA = 0.5;
/**
 * As paredes, do jeito que só o Mestre as vê.
 *
 * Mora aqui e NÃO no `SceneLayer`, pela mesma razão do `PinLayer`: o
 * `SceneLayer` é o mesmo componente do Espectador e do Jogador, e uma parede
 * desenhada lá apareceria na TV virada para a mesa -- entregando de graça onde
 * estão os cômodos que ninguém abriu. A mesa recebe a geometria, porque é ela
 * que calcula a própria sombra, mas o DESENHO dela é do palco do mestre.
 *
 * Chamou-se `LuzLayer` enquanto desenhava também as tochas, que eram luz com
 * posição e alcance. Elas saíram: a fonte da cena é o sol, e sol não se crava
 * no chão -- ele se aponta no painel do mapa. Ver `CeuDoSol`.
 *
 * Um SVG só, do tamanho exato do plano: nada aqui sai da caixa, que é a regra
 * que o palco cobra de todo mundo (ver `debug-do-palco` §3).
 */
export function ParedeLayer({
  scene,
  fantasma,
}: {
  scene: Scene;
  /**
   * A parede que o arrasto está desenhando agora, antes de existir na cena.
   *
   * Desenhada AQUI e não numa camada própria porque a hachura mora nos `defs`
   * deste SVG: uma prévia noutro lugar precisaria de um segundo padrão idêntico
   * -- e ela tem de sair exatamente igual ao que vai ficar, senão não é prévia.
   */
  fantasma?: FormaDaParede | null;
}) {
  const { scale } = useSceneScale();
  // `useId` traz dois-pontos, e dois-pontos dentro de um `url(#...)` não é
  // seletor válido.
  const base = useId().replace(/:/g, "");

  const selectedParedeId = useSelectionStore((state) => state.selectedParedeId);

  const paredes = scene.paredes ?? [];

  if (paredes.length === 0 && !fantasma) return null;

  return (
    <svg
      // `overflow-visible`: o SVG tem o tamanho do plano, e cortava o que
      // passasse da borda. A parede pode ser levada para fora do mapa, e lá
      // ela sumia inteira, sem onde clicar para trazê-la de volta. A que cruza
      // a borda também perdia o pedaço de fora.
      className="pointer-events-none absolute top-0 left-0 overflow-visible"
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
      viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}
    >
      {/* A hachura é UMA, compartilhada por todas as paredes: um padrão por
          parede seria uma textura por parede para desenhar o mesmo risco. Em
          pixel de tela, como o resto deste desenho -- a GROSSURA é do mundo e
          acompanha o zoom, mas o risco que enche a faixa é instrumento, e
          instrumento se mede na tela. */}
      <defs>
        <pattern
          id={`${base}-hachura`}
          patternUnits="userSpaceOnUse"
          width={HACHURA_PASSO_PX / scale}
          height={HACHURA_PASSO_PX / scale}
          patternTransform="rotate(45)"
        >
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={HACHURA_PASSO_PX / scale}
            stroke={COR_DA_PAREDE}
            strokeWidth={HACHURA_TRACO_PX / scale}
            strokeOpacity={0.5}
          />
        </pattern>
      </defs>

      {paredes.map((parede) => {
        const selecionada = parede.id === selectedParedeId;
        const corpo = corpoDaParede(parede);
        const contorno = contornoDaParede(parede);
        const traco = TRACO_PX / scale;
        const pintura = selecionada ? 1 : PINTURA_PARADA;

        if (!corpo) return null;

        return (
          <g key={parede.id}>
            {/* O corpo, num amarelo quase transparente: é ele que diz que a
                parede é MACIÇA -- ela é a massa que o mestre desenhou, e não um
                contorno com borda grossa. A hachura rala sozinha não diz isso.

                NÃO recebe o gesto, e recebia: com `pointer-events: all` o corpo
                inteiro ficava por cima dos tokens, e o boneco dentro de uma sala
                coberta não se mexia mais. O clique atravessa, e é o clique no
                vazio do palco que pergunta se caiu numa parede -- depois de os
                tokens e as áreas terem tido a vez deles. Ver `pontoNaParede`. */}
            <path
              d={corpo}
              fill={COR_DA_PAREDE}
              fillOpacity={0.1 * pintura}
              pointerEvents="none"
            />
            {/* `fillOpacity` e não `opacity` num grupo: opacidade de grupo
                pede ao motor uma camada fora da tela por parede, e o mapa tem
                dezenas delas. A do preenchimento multiplica o padrão direto. */}
            <path
              d={corpo}
              fill={`url(#${base}-hachura)`}
              fillOpacity={pintura}
              pointerEvents="none"
            />

            {/* A borda do corpo, fina: é ela que separa a pedra do mapa por
                baixo, e é o que o olho segue para ver onde a parede acaba.
                Sólida parada, tracejada selecionada -- o tracejado é o que diz
                "esta é a que está na mão". */}
            <path
              d={contorno}
              fill="none"
              stroke={COR_DA_PAREDE}
              strokeWidth={selecionada ? traco * 1.8 : traco}
              strokeOpacity={selecionada ? 0.95 : 0.55}
              strokeDasharray={
                selecionada ? `${traco * 5} ${traco * 4}` : undefined
              }
              pointerEvents="none"
            />
          </g>
        );
      })}

      {/* A prévia: a mesma pintura da parede pronta, esmaecida. Igual de
          propósito -- o mestre precisa ver o formato que vai ficar, e uma
          caixa de seleção retangular não conta isso de um círculo nem de um
          contorno à mão. */}
      {fantasma && corpoDaParede(fantasma) ? (
        <g opacity={0.65} pointerEvents="none">
          <path
            d={corpoDaParede(fantasma)}
            fill={COR_DA_PAREDE}
            fillOpacity={0.1}
          />
          <path d={corpoDaParede(fantasma)} fill={`url(#${base}-hachura)`} />
          <path
            d={contornoDaParede(fantasma)}
            fill="none"
            stroke={COR_DA_PAREDE}
            strokeWidth={(TRACO_PX * 1.8) / scale}
            strokeOpacity={0.95}
            strokeDasharray={`${(TRACO_PX * 5) / scale} ${(TRACO_PX * 4) / scale}`}
          />
        </g>
      ) : null}
    </svg>
  );
}
