"use client";

import { Fragment } from "react";
import { Smartphone } from "lucide-react";

import {
  emPixelDeTela,
  tracoDoIcone,
  useSceneScale,
} from "@/components/playground/scene-stage";
import { itemBounds } from "@/lib/geometry/bounds";
import { t } from "@/lib/i18n/mestre";
import { useCharactersStore } from "@/lib/store/use-characters-store";
import { useQuemMoveStore } from "@/lib/store/use-quem-move-store";
import { SCENE_HEIGHT, SCENE_WIDTH, type Scene } from "@/types/scene";

/** A etiqueta, em pixel de tela: o nome trunca dentro disto. */
const LARGURA = 160;
const ALTURA = 22;
/** O vão entre o token e a etiqueta, também em pixel de tela. */
const VAO = 6;

function prender(valor: number, min: number, max: number): number {
  return Math.min(Math.max(valor, min), Math.max(min, max));
}

/**
 * Quem está movendo o token pelo celular, no palco do Mestre.
 *
 * O movimento do jogador já chegava e o token andava, mas sozinho: para o
 * mestre era um token se mexendo sem ninguém na mão, e ele só descobria quem
 * foi perguntando à mesa. Agora o token ganha o anel azul do personagem e uma
 * etiqueta com o nome de quem arrasta, enquanto as amostras chegam. Ver
 * `useQuemMoveStore`.
 *
 * Só no Mestre, no plano de controles, e nunca na TV: é aviso para quem mestra,
 * e a mesa já vê o token andar.
 *
 * Tudo PRESO dentro do plano. Um filho que passa da caixa do plano infla a
 * camada composta no WebKitGTK, e o mapa pula e fica preto no zoom -- já
 * aconteceu três vezes, ver a skill `debug-do-palco`. Por isso a etiqueta vai
 * para baixo do token quando não cabe em cima, encosta na beirada em vez de
 * passar dela, e o anel é a caixa do token cortada pelo plano.
 */
export function QuemMove({ scene }: { scene: Scene }) {
  const pegadas = useQuemMoveStore((state) => state.pegadas);
  const jogadores = useCharactersStore((state) => state.jogadores);
  const { scale, ampliacaoNoLayout } = useSceneScale();

  const daCena = Object.entries(pegadas).filter(
    ([, pegada]) => pegada.sceneId === scene.id,
  );
  if (daCena.length === 0) return null;

  return daCena.map(([itemId, pegada]) => {
    const item = scene.items.find((cada) => cada.id === itemId);
    if (!item) return null;

    const nome =
      jogadores.find((jogador) => jogador.id === pegada.jogadorId)?.nome ??
      t.quemMove.semNome;

    const caixa = itemBounds(item);
    const anel = {
      left: prender(caixa.minX, 0, SCENE_WIDTH),
      top: prender(caixa.minY, 0, SCENE_HEIGHT),
      right: prender(caixa.maxX, 0, SCENE_WIDTH),
      bottom: prender(caixa.maxY, 0, SCENE_HEIGHT),
    };

    // A etiqueta tem tamanho fixo na TELA, então em unidades de cena ela
    // cresce quando o palco se afasta. O teto do plano vale para ela também.
    const largura = Math.min(LARGURA / scale, SCENE_WIDTH);
    const altura = Math.min(ALTURA / scale, SCENE_HEIGHT);
    const vao = VAO / scale;

    // Em cima do token, que é onde o olho procura; embaixo quando a beirada de
    // cima do mapa não deixa.
    const emCima = caixa.minY - vao - altura;
    const top = prender(
      emCima >= 0 ? emCima : caixa.maxY + vao,
      0,
      SCENE_HEIGHT - altura,
    );
    const left = prender(
      (caixa.minX + caixa.maxX) / 2 - largura / 2,
      0,
      SCENE_WIDTH - largura,
    );

    return (
      <Fragment key={itemId}>
        {anel.right > anel.left && anel.bottom > anel.top ? (
          <div
            className="pointer-events-none absolute"
            style={{
              left: anel.left,
              top: anel.top,
              width: anel.right - anel.left,
              height: anel.bottom - anel.top,
              outline: `${2 / scale}px solid var(--color-sky-400)`,
              outlineOffset: 2 / scale,
              zIndex: 9_950,
            }}
          />
        ) : null}

        <div
          className="pointer-events-none absolute flex items-center justify-center"
          style={{ left, top, width: largura, height: altura, zIndex: 9_950 }}
        >
          <span
            className="flex items-center rounded-full bg-sky-500 font-medium text-white shadow-sm"
            // Conteúdo em pixel de tela, como o rótulo da câmera: dividir pela
            // escala engordava o traço do ícone sob `zoom`. Ver `emPixelDeTela`.
            style={{
              fontSize: 12,
              lineHeight: "18px",
              gap: 4,
              padding: "2px 8px",
              maxWidth: LARGURA,
              ...emPixelDeTela(scale),
            }}
          >
            <Smartphone
              aria-hidden
              className="shrink-0"
              strokeWidth={tracoDoIcone(scale, ampliacaoNoLayout)}
              style={{ width: 12, height: 12 }}
            />
            <span className="truncate">{nome}</span>
          </span>
        </div>
      </Fragment>
    );
  });
}
