"use client";

import { memo } from "react";

import {
  caixaDaForma,
  FormaView,
} from "@/components/playground/quadro-mesa-layer";
import { TransformHandles } from "@/components/playground/transform-handles";
import { RESIZE_HANDLES } from "@/lib/geometry/transform";
import {
  moverNoGesto,
  terminarGesto,
  useGestoStore,
} from "@/lib/store/use-gesto-store";
import { FORMA_Z } from "@/lib/store/use-quadro-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import { temAnotacao, type Forma, type NewForma, type Scene } from "@/types/scene";

/**
 * Quanto uma forma se apaga no palco do Mestre enquanto a mesa não a vê.
 *
 * Mesma linguagem das câmeras fora do ar, que também ficam apagadas ali: o que
 * está no ar é o que se destaca. Sem esta marca o mestre teria de clicar em
 * cada forma para descobrir quais já publicou -- e a pergunta "o que eles estão
 * vendo?" é de relance, no meio da cena.
 */
const APAGADA = 0.45;

/**
 * As formas geométricas do quadro no palco do MESTRE. Irmã do `TextoLayer`, e
 * fora do `SceneLayer` pela mesma razão: aqui elas recebem clique, arrasto e
 * alças, e o `SceneLayer` é o componente que também desenha na TV.
 *
 * O desenho em si é o mesmo dos dois lados -- `FormaView` --, para o que a mesa
 * vê ser exatamente o que o mestre desenhou. O que esta camada acrescenta é a
 * mira: o traço invisível que recebe o clique, e as alças de quem está
 * sozinho na seleção.
 */
export function FormaLayer({
  scene,
  panMode,
  onFormaPointerDown,
}: {
  scene: Scene;
  /** Espaço segurado: o arrasto pertence ao deslocamento da cena. */
  panMode: boolean;
  /** Quem trata o clique é o palco, como no texto e no item. */
  onFormaPointerDown: (event: React.PointerEvent, forma: Forma) => void;
}) {
  const formas = scene.formas;
  if (!formas || formas.length === 0) return null;

  // Num QUADRO a folha vai inteira para a mesa, e a pergunta "a mesa vê esta
  // forma?" não existe: nem o olho no gizmo, nem a marca de apagado.
  const mapa = temAnotacao(scene);

  return formas.map((forma) => (
    <FormaDaCena
      key={forma.id}
      sceneId={scene.id}
      forma={forma}
      mapa={mapa}
      panMode={panMode}
      onFormaPointerDown={onFormaPointerDown}
    />
  ));
}

/**
 * Acima de tudo o que o quadro tem, e abaixo da área de seleção. Ver
 * `FormaFantasma`.
 */
const FANTASMA_Z = 9_400;

/**
 * A forma que está sendo desenhada, enquanto o botão ainda está preso.
 *
 * O MESMO desenho da forma de verdade -- `FormaView`, a que a mesa também usa
 * --, com o tipo, a cor, a espessura e o fundo que estão escolhidos. É o ponto
 * dela: o gesto mostrava o retângulo azul da seleção por área, que é o desenho
 * de "estou marcando o que está aqui dentro" e não o de "estou desenhando uma
 * elipse vermelha vazada". Quem ia desenhar um círculo via um quadrado até
 * soltar, e só descobria a espessura errada depois de a forma existir.
 *
 * Por cima de tudo do quadro, e não na altura em que a forma vai ficar: a
 * forma existe para CERCAR, então o gesto acontece quase sempre em volta de
 * postits e textos, que moram acima dela -- e uma prévia meio escondida atrás
 * do que ela cerca não responderia a pergunta que ela existe para responder.
 * Um quadro de diferença entre a prévia e a forma assentada é o preço, e ele é
 * menor que o de não ver o que se está desenhando.
 */
export function FormaFantasma({ forma }: { forma: NewForma | null }) {
  if (!forma) return null;

  return (
    <div
      aria-hidden
      className="text-foreground pointer-events-none absolute"
      style={{ ...caixaDaForma(forma), zIndex: FANTASMA_Z }}
    >
      <FormaView forma={forma} />
    </div>
  );
}

/** `memo` pela mesma razão do `TextoSolto`, com o mesmo requisito de handler
 * estável. */
const FormaDaCena = memo(function FormaDaCena({
  sceneId,
  forma,
  mapa,
  panMode,
  onFormaPointerDown,
}: {
  sceneId: string;
  forma: Forma;
  /** Cena de mapa: a forma tem olho, e nasce fechada. Ver `naMesa`. */
  mapa: boolean;
  panMode: boolean;
  onFormaPointerDown: (event: React.PointerEvent, forma: Forma) => void;
}) {
  const tool = useToolStore((state) => state.tool);
  const updateForma = useSceneStore((state) => state.updateForma);
  const removeFormas = useSceneStore((state) => state.removeFormas);

  const selecionada = useSelectionStore((state) =>
    state.selectedFormaIds.includes(forma.id),
  );
  /**
   * Sozinha na seleção? Então as alças são dela. Acompanhada, quem desenha é o
   * gizmo do grupo, no palco -- mesma regra do texto solto.
   */
  const sozinha = useSelectionStore(
    (state) =>
      state.selectedIds.length === 0 &&
      state.selectedTextoIds.length === 0 &&
      state.selectedFormaIds.length === 1,
  );

  /**
   * Com a seta na mão a forma não recebe clique: o gesto é de puxar seta, e
   * quem o trata é o palco.
   *
   * Não interativa, a `FormaView` deixa de desenhar o traço invisível de mira
   * e o envelope já é `pointer-events-none` -- o clique ATRAVESSA até o
   * envelope do palco, no plano de baixo, que é quem trata o gesto. É o mesmo
   * efeito que o postit, o texto e o cartão obtêm desligando o ponteiro com a
   * seta na mão, e é o que faz a seta poder começar em cima de qualquer coisa
   * do quadro.
   */
  const interativa = !panMode && tool !== "ligacao";

  return (
    <>
      <div
        // `pointer-events-none` no envelope, e o ponteiro religado só no TRAÇO,
        // lá dentro: a caixa de um retângulo vazado é quase toda vazio, e
        // deixá-la clicável roubaria o clique dos postits que ela cerca -- e o
        // duplo clique no vazio, que escreve. Ver `FormaView`.
        className="text-foreground pointer-events-none absolute"
        style={{
          ...caixaDaForma(forma),
          zIndex: FORMA_Z,
          touchAction: "none",
          // Apagada enquanto a mesa não a vê. No envelope e não na `FormaView`:
          // é a MESMA view que a TV desenha, e mexer nela apagaria a forma
          // também lá.
          ...(mapa && !forma.naMesa ? { opacity: APAGADA } : {}),
        }}
        // Qual botão desceu é decisão do palco: ele trata o direito apontando o
        // menu para esta forma, como faz com a imagem.
        onPointerDown={(event) => {
          if (interativa) onFormaPointerDown(event, forma);
        }}
      >
        <FormaView forma={forma} interativa={interativa} />
      </div>

      {/* As oito alças, e giro: forma não é imagem, e esticar só a largura de
          um retângulo é o gesto normal -- não há desenho para deformar. */}
      {selecionada && sozinha && interativa ? (
        <TransformHandles
          key={forma.id}
          box={{
            x: forma.x,
            y: forma.y,
            width: forma.width,
            height: forma.height,
            rotation: forma.rotation,
          }}
          handles={RESIZE_HANDLES}
          paleta={{
            titulo: "Traço",
            cor: forma.cor,
            fundo: forma.fundo,
            onChange: ({ cor, fundo }) =>
              updateForma(sceneId, forma.id, {
                // `null` é "de volta ao padrão", e no modelo o padrão é o campo
                // ausente: cor do tema no traço, sem fundo dentro. A mesma
                // regra do texto solto.
                ...(cor !== undefined ? { cor: cor ?? undefined } : {}),
                ...(fundo !== undefined ? { fundo: fundo ?? undefined } : {}),
              }),
          }}
          // Pelo gesto, como o texto e o item: redimensionar gravava a cena a
          // cada quadro. Ver `useGestoStore`.
          onChange={(patch) =>
            moverNoGesto(sceneId, [], [], [{ id: forma.id, patch }])
          }
          onGestureEnd={() =>
            terminarGesto(
              sceneId,
              [],
              [],
              useGestoStore.getState().formas ?? [],
            )
          }
          // Só no mapa: no quadro a folha inteira já vai, e o olho mentiria.
          mesa={
            mapa
              ? {
                  naMesa: !!forma.naMesa,
                  onToggle: () =>
                    updateForma(sceneId, forma.id, {
                      // De volta ao padrão é a AUSÊNCIA do campo, como na cor e
                      // no fundo -- e não `false`, que seria um segundo jeito
                      // de dizer a mesma coisa.
                      naMesa: forma.naMesa ? undefined : true,
                    }),
                }
              : undefined
          }
          onDelete={() => removeFormas(sceneId, [forma.id])}
        />
      ) : null}
    </>
  );
});
