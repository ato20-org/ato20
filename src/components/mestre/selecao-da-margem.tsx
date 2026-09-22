"use client";

import { createPortal } from "react-dom";
import type { PointerEvent as ReactPointerEvent } from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import { caixaDoTraco } from "@/lib/geometry/limites";
import type { Bounds } from "@/lib/geometry/bounds";
import { caixaDoPapel } from "@/lib/mestre/grupo-sem-alca";
import type { Documento, Postit, Traco } from "@/types/scene";

/**
 * Acima do cartão (8 550) e abaixo da seta (8 600): o contorno é do papel que
 * está por baixo dele, e some atrás da seta como o resto do quadro.
 */
const CONTORNO_Z = 8_560;
/**
 * A pega fica ABAIXO do papel (8 500) e do cartão (8 550), e é de propósito.
 *
 * Ela cobre a caixa do conjunto inteiro, e por cima dos papéis engoliria o que
 * eles têm de próprio: o corpo que abre para digitar, a faixa que arrasta um
 * só, a alça que redimensiona. Por baixo, cada papel continua sendo ele mesmo
 * e a pega recolhe o que sobra -- o vazio entre eles, e o risco, que não tem
 * nada que ouça o ponteiro.
 */
const PEGA_Z = 8_450;

/**
 * O que a área laçou e só ANDA, marcado na tela: papel, cartão de nota e
 * risco.
 *
 * ## Por que na margem, e não no plano de controles
 *
 * Porque o postit pode estar estacionado FORA do mapa, e o contorno dele
 * também estaria. Um filho que passa da caixa de um plano infla a camada
 * composta do WebKitGTK e faz o motor pintar o plano inteiro deslocado -- o
 * mapa pula e fica preto ao dar zoom, e parece bug de câmera. Já derrubou o
 * palco três vezes; ver `debug-do-palco` §3 e o `planoDaMargem` do
 * `SceneStage`, que nasceu exatamente deste caso com o papel.
 *
 * A margem é um envelope 0x0 com a mesma geometria dos planos: sem caixa não
 * há transbordo, e o que a camada dele pinta é só o que está dentro.
 *
 * ## Por que a caixa é uma PEGA
 *
 * Porque o risco não tem onde ser pego. A camada dele é um SVG atravessável
 * (`pointer-events-none`), compartilhada com o Espectador, e ligar o ponteiro
 * nela faria cada linha do mapa disputar o clique com os tokens embaixo. Com a
 * caixa agarrável, o gesto é o mesmo do resto do palco: o que está marcado
 * anda junto, seja lá de onde a mão pegue.
 *
 * O papel e o cartão têm faixa própria e não precisam da pega -- ela só cobre
 * a caixa do conjunto, e a faixa deles continua por cima.
 */
export function SelecaoDaMargem({
  postits,
  documentos,
  tracos,
  caixa,
  panMode,
  onPegaPointerDown,
}: {
  postits: Postit[];
  documentos: Documento[];
  tracos: Traco[];
  /** A caixa do que está na mão -- o grupo inteiro, quando há mais de um. */
  caixa: Bounds | null;
  panMode: boolean;
  onPegaPointerDown: (event: ReactPointerEvent) => void;
}) {
  const { scale, planoDaMargem } = useSceneScale();

  if (!planoDaMargem || scale === 0 || !caixa) return null;

  const traco = 1.5 / scale;

  const contorno = (chave: string, alvo: Bounds) => (
    <div
      key={chave}
      className="outline-primary/80 pointer-events-none absolute outline-dashed"
      style={{
        left: alvo.minX,
        top: alvo.minY,
        width: alvo.maxX - alvo.minX,
        height: alvo.maxY - alvo.minY,
        outlineWidth: traco,
        outlineOffset: 2 / scale,
        zIndex: CONTORNO_Z,
      }}
    />
  );

  return createPortal(
    <>
      {postits.map((postit) => contorno(postit.id, caixaDoPapel(postit)))}
      {documentos.map((documento) =>
        contorno(documento.id, caixaDoPapel(documento)),
      )}
      {tracos.map((risco) => {
        const caixaDoRisco = caixaDoTraco(risco);
        return caixaDoRisco ? contorno(risco.id, caixaDoRisco) : null;
      })}

      {/* A pega: a caixa do conjunto, sólida e agarrável.

          Com espaço segurado ela sai do ar -- aí o gesto é do deslocamento da
          cena, e uma pega por cima do mapa engoliria o arrasto da câmera. */}
      <div
        className={
          panMode
            ? "outline-primary pointer-events-none absolute outline"
            : "outline-primary pointer-events-auto absolute cursor-move outline"
        }
        style={{
          left: caixa.minX,
          top: caixa.minY,
          width: caixa.maxX - caixa.minX,
          height: caixa.maxY - caixa.minY,
          outlineWidth: traco,
          outlineOffset: 4 / scale,
          zIndex: PEGA_Z,
          // Sem isto o toque rolaria a tela em vez de arrastar o grupo, como
          // no papel e no alfinete.
          touchAction: "none",
        }}
        onPointerDown={panMode ? undefined : onPegaPointerDown}
      />
    </>,
    planoDaMargem,
  );
}
