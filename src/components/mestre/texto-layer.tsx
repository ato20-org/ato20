"use client";

import { memo, useCallback, useEffect, useRef } from "react";

import {
  giroDoTexto,
  TextoView,
  tipografiaDoTexto,
} from "@/components/playground/quadro-mesa-layer";
import { useSceneScale } from "@/components/playground/scene-stage";
import { TransformHandles } from "@/components/playground/transform-handles";
import { boundsToBox } from "@/lib/geometry/bounds";
import { CORNER_HANDLES } from "@/lib/geometry/transform";
import { TAMANHO_MINIMO_DO_TEXTO } from "@/lib/mestre/grupo-de-textos";
import { ALTURA_DA_LINHA, caixaRetaDoTexto } from "@/lib/mestre/ligacoes";
import { medidaDoTexto } from "@/lib/mestre/medida-do-texto";
import {
  moverNoGesto,
  terminarGesto,
  useGestoStore,
} from "@/lib/store/use-gesto-store";
import { useQuadroStore, TEXTO_Z } from "@/lib/store/use-quadro-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";
import { temAnotacao, type Scene, type Texto } from "@/types/scene";

/** Quanto a letra se apaga enquanto a mesa não a vê. A mesma da forma. */
const APAGADA = 0.45;

/**
 * Os textos soltos da cena. Irmã do `PostitLayer`, e fora do `SceneLayer` pela
 * mesma razão: aqui eles recebem clique, arrasto, edição e alças.
 *
 * Vale nos DOIS tipos de cena. No quadro a folha inteira vai para a mesa; num
 * mapa cada letra nasce fechada e o mestre a abre no olho do gizmo -- ver
 * `naMesa`. É o que faz um rótulo em cima da cidade ser possível sem entregar
 * junto a anotação da linha de baixo.
 *
 * Bem mais simples que o postit de propósito: sem menção, sem cor, sem alça
 * de tamanho. Um texto é letra na folha -- duplo clique escreve, arrasto
 * move, Delete apaga. O que quer mais que isso é postit.
 */
export function TextoLayer({
  scene,
  panMode,
  onTextoPointerDown,
}: {
  scene: Scene;
  /** Espaço segurado: o arrasto pertence ao deslocamento da cena. */
  panMode: boolean;
  /**
   * Quem trata o clique: o palco, como já trata o do item.
   *
   * Aqui dentro só se sabe deste texto, e o gesto é da SELEÇÃO -- pegar uma
   * frase marcada junto com duas imagens tem de mover as três. Ver
   * `handleTextoPointerDown` no `MestreStage`.
   */
  onTextoPointerDown: (event: React.PointerEvent, texto: Texto) => void;
}) {
  const textos = scene.textos;
  if (!textos || textos.length === 0) return null;

  return textos.map((texto) => (
    <TextoSolto
      key={texto.id}
      sceneId={scene.id}
      texto={texto}
      mapa={temAnotacao(scene)}
      panMode={panMode}
      onTextoPointerDown={onTextoPointerDown}
    />
  ));
}

/**
 * `memo` pela mesma razão do `CanvasItemView`: a cena é imutável e
 * `updateTextos` preserva a identidade de quem não mudou, então mexer num
 * texto -- ou qualquer render da bancada acima -- não precisa redesenhar os
 * outros vinte e nove. Medido com o contador de renders: sem isto, um render
 * do `MestreShell` custava trinta renders de texto.
 *
 * Só vale com handler ESTÁVEL: ver o envelope de `handlersRef` no
 * `MestreStage`.
 */
const TextoSolto = memo(function TextoSolto({
  sceneId,
  texto,
  mapa,
  panMode,
  onTextoPointerDown,
}: {
  sceneId: string;
  texto: Texto;
  /** Cena de mapa: a letra tem olho, e nasce fechada. Ver `naMesa`. */
  mapa: boolean;
  panMode: boolean;
  onTextoPointerDown: (event: React.PointerEvent, texto: Texto) => void;
}) {
  const { scale, ampliacaoNoLayout } = useSceneScale();
  const tool = useToolStore((state) => state.tool);

  const updateTexto = useSceneStore((state) => state.updateTexto);
  const removeTexto = useSceneStore((state) => state.removeTexto);

  const editando = useQuadroStore((state) => state.textoEditandoId === texto.id);
  const selecionado = useSelectionStore((state) =>
    state.selectedTextoIds.includes(texto.id),
  );
  /**
   * Este texto é a ÚNICA coisa selecionada no palco?
   *
   * É o que decide de quem são as alças: sozinho, ele traz as próprias -- girar
   * e escalar a fonte por um canto. Acompanhado, quem desenha é o gizmo do
   * grupo, no palco, e dois conjuntos de alças no mesmo lugar disputariam o
   * clique.
   */
  const sozinho = useSelectionStore(
    (state) =>
      state.selectedIds.length === 0 && state.selectedTextoIds.length === 1,
  );
  const editar = useQuadroStore((state) => state.editarTexto);

  const campo = useRef<HTMLTextAreaElement | null>(null);

  // Ver `tipografiaDoTexto`: pixel de tela sob `zoom`, pelo piso de 9px do WebKit.
  const { medida, estilo: tipografia } = tipografiaDoTexto(
    texto,
    scale,
    ampliacaoNoLayout,
  );

  // Lê o texto atual do store, e não da prop: o ouvinte do documento abaixo
  // é instalado uma vez por edição, e a prop que ele fechou seria a do
  // primeiro render.
  const fechar = useCallback(() => {
    const quadro = useQuadroStore.getState();
    if (quadro.textoEditandoId !== texto.id) return;

    const atual = useSceneStore
      .getState()
      .board?.scenes.find((cena) => cena.id === sceneId)
      ?.textos?.find((candidato) => candidato.id === texto.id);

    // Texto que ficou vazio some: uma caixa invisível no quadro seria um alvo
    // de seta que ninguém vê.
    if (!atual?.texto.trim()) {
      removeTexto(sceneId, texto.id);
      quadro.editarTexto(null);
      return;
    }
    // Sai da edição mas FICA selecionado: apertar A+ na pílula tira o foco do
    // campo, e a pílula sumir junto deixaria o segundo A+ sem alvo.
    quadro.editarTexto(null);
    useSelectionStore.getState().selectTextos([texto.id]);
  }, [sceneId, texto.id, removeTexto]);

  const raiz = useRef<HTMLDivElement | null>(null);
  const desenho = useRef<HTMLDivElement | null>(null);
  const medirTexto = useSceneStore((state) => state.medirTexto);



  /**
   * Mede a caixa do texto e a guarda na cena. É o que faz o gizmo e a seta
   * encostarem onde a letra termina, e não onde a estimativa achou.
   *
   * Pelo CANVAS, e não pelo `offsetWidth` do desenho: a medida do layout muda
   * com a ampliação do palco -- o plano alterna `zoom` e `transform`, e a
   * fonte é rasterizada com outra régua em cada um --, e como toda medida
   * grava na cena, dar zoom reescrevia o board e mexia o gizmo e as setas de
   * tudo o que estava na tela. Ver `medidaDoTexto`, onde estão os números.
   *
   * A família vem do elemento desenhado, que é onde o CSS do tema resolveu
   * qual é; o resto da fonte sai do próprio texto. `document.fonts.ready`
   * porque a primeira medida cai antes de a fonte da interface carregar, e
   * medir com a de fallback erra a caixa até alguém reescrever a frase.
   */
  useEffect(() => {
    if (editando) return;
    const alvo = desenho.current;
    if (!alvo) return;

    let vivo = true;
    const medir = () => {
      if (!vivo) return;
      const caixa = medidaDoTexto(texto, getComputedStyle(alvo).fontFamily);
      if (caixa) medirTexto(sceneId, texto.id, caixa);
    };

    medir();
    void document.fonts?.ready.then(medir);
    return () => {
      vivo = false;
    };
  }, [editando, sceneId, texto, medirTexto]);

  useEffect(() => {
    if (!editando) return;
    // No quadro seguinte, e não já: o texto nasce no MESMO pointerdown que o
    // criou, e o foco pedido dentro desse gesto era desfeito pelo padrão do
    // clique, que leva o foco para onde o mouse desceu.
    const quadro = requestAnimationFrame(() => {
      const alvo = campo.current;
      if (!alvo) return;
      alvo.focus();
      // Cursor no fim: quem reabre um texto quer continuar, não reescrever.
      alvo.setSelectionRange(alvo.value.length, alvo.value.length);
    });
    return () => cancelAnimationFrame(quadro);
  }, [editando]);

  /**
   * Clique fora fecha, como no postit: na captura e no documento, porque o
   * `blur` sozinho não vem quando o clique cai em algo que não toma foco, e o
   * palco é exatamente isso.
   */
  useEffect(() => {
    if (!editando) return;

    function foraDaqui(event: PointerEvent) {
      const alvo = event.target;
      if (alvo instanceof Node && raiz.current?.contains(alvo)) return;
      fechar();
    }

    document.addEventListener("pointerdown", foraDaqui, true);
    return () => document.removeEventListener("pointerdown", foraDaqui, true);
  }, [editando, fechar]);

  function arrastar(event: React.PointerEvent) {
    // Com a seta na mão, o clique é do palco: é ele que descobre o alvo.
    if (panMode || editando || tool === "ligacao") return;
    if (event.button !== 0) return;

    onTextoPointerDown(event, texto);
  }

  const linhas = texto.texto.split("\n");
  const maior = Math.max(1, ...linhas.map((linha) => linha.length));

  const linhasDoTexto = Math.max(1, linhas.length);

  return (
    <>
    <div
      ref={raiz}
      className={cn(
        // `pointer-events-auto` porque o plano dos controles desliga o ponteiro.
        // Ver `PostitPapel`.
        "absolute",
        // Com a seta na mão o ponteiro é DESLIGADO aqui, e não apenas
        // ignorado: o clique precisa ATRAVESSAR até o envelope do palco, que
        // vive no plano de baixo e é quem trata o gesto da seta. Um tratador
        // que só retornava deixava o pointerdown morrer neste `<div>` -- e a
        // seta não começava em cima de um postit, de um texto nem de um
        // cartão, que é justamente onde ela quer começar.
        tool === "ligacao"
          ? "pointer-events-none cursor-crosshair"
          : "pointer-events-auto cursor-move",
        // Contorno enquanto edita ou selecionado: um texto vazio em edição
        // não tem letra nenhuma para mostrar onde está.
        (editando || selecionado) && "ring-primary/60 rounded-sm ring-1",
      )}
      style={{
        left: texto.x,
        top: texto.y,
        zIndex: TEXTO_Z,
        touchAction: "none",
        ...giroDoTexto(texto),
        // Apagada enquanto a mesa não a vê, como a forma. Nunca em EDIÇÃO: quem
        // está escrevendo precisa ler o que escreve.
        ...(mapa && !texto.naMesa && !editando ? { opacity: APAGADA } : {}),
      }}
      onPointerDown={arrastar}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (!panMode && tool !== "ligacao") editar(texto.id);
      }}
    >
      <div style={editando ? medida : undefined}>
        {editando ? (
          <textarea
            ref={campo}
            className="text-foreground block resize-none overflow-hidden bg-transparent whitespace-pre outline-none"
            style={tipografia}
            aria-label="Texto solto"
            placeholder="Escreva…"
            rows={linhas.length}
            // Nunca menor que o placeholder: vazio, a caixa de uma coluna
            // cortaria a dica e o texto pareceria não ter nascido.
            cols={Math.max(8, maior)}
            value={texto.texto}
            onChange={(event) =>
              updateTexto(sceneId, texto.id, { texto: event.target.value })
            }
            onPointerDown={(event) => event.stopPropagation()}
            onBlur={fechar}
            onKeyDown={(event) => {
              // Esc sai. Enter é quebra de linha: título de duas linhas é comum,
              // e sair da edição já tem o clique fora.
              if (event.key === "Escape") {
                event.preventDefault();
                fechar();
              }
              event.stopPropagation();
            }}
          />
        ) : null}
      </div>
      {editando ? null : <TextoView ref={desenho} texto={texto} />}
    </div>

      {/* As mesmas alças da imagem: cantos escalam a fonte, a alça de cima
          gira. Só cantos e proporção travada, porque um texto não tem largura
          própria -- ela vem da fonte --, e esticar um eixo só seria deformar
          a letra. Fora do envelope girado, porque o gizmo recebe o giro à
          parte e desenha o dele. */}
      {selecionado && sozinho && !editando && !panMode && tool !== "ligacao" ? (
        <TransformHandles
          key={texto.id}
          box={{
            ...boundsToBox(caixaRetaDoTexto(texto)),
            rotation: texto.rotation ?? 0,
          }}
          handles={CORNER_HANDLES}
          keepAspect
          // A caixa de opções da letra, na mesma fileira em que a imagem mostra
          // espelhar e excluir: é onde a mão já procura depois de clicar.
          estilo={{
            negrito: texto.negrito,
            italico: texto.italico,
            sublinhado: texto.sublinhado,
            onChange: (patch) => updateTexto(sceneId, texto.id, patch),
          }}
          paleta={{
            titulo: "Letra",
            cor: texto.cor,
            fundo: texto.fundo,
            onChange: ({ cor, fundo }) =>
              updateTexto(sceneId, texto.id, {
                // `null` é "de volta ao padrão", e no modelo o padrão é o campo
                // ausente. Ver `Texto`.
                ...(cor !== undefined ? { cor: cor ?? undefined } : {}),
                ...(fundo !== undefined ? { fundo: fundo ?? undefined } : {}),
              }),
          }}
          /**
           * Pelo GESTO, e não pelo board: aumentar a letra arrastando o canto
           * gravava a cena a cada quadro, e cada gravação é um commit inteiro
           * -- cópia do board, passo de histórico, todo assinante acordado, a
           * bancada re-renderizada e, com a cena no ar, uma publicação para a
           * mesa. Sessenta vezes por segundo, para um gesto que só interessa a
           * quem está olhando o palco. É o mesmo caminho que o item já fazia:
           * ver `useGestoStore`.
           *
           * O board recebe UMA vez, no soltar -- e um Ctrl+Z só.
           */
          onChange={(patch) => {
            if (patch.rotation !== undefined) {
              moverNoGesto(sceneId, [], [
                { id: texto.id, patch: { rotation: patch.rotation || undefined } },
              ]);
              return;
            }
            // A altura da caixa é linhas × fonte × altura de linha: é dela
            // que sai o tamanho novo. `x`/`y` vêm junto porque escalar por um
            // canto move o oposto.
            const altura = patch.height;
            moverNoGesto(sceneId, [], [
              {
                id: texto.id,
                patch: {
                  ...(patch.x !== undefined ? { x: Math.round(patch.x) } : {}),
                  ...(patch.y !== undefined ? { y: Math.round(patch.y) } : {}),
                  ...(altura !== undefined
                    ? {
                        tamanho: Math.max(
                          TAMANHO_MINIMO_DO_TEXTO,
                          Math.round(altura / (linhasDoTexto * ALTURA_DA_LINHA)),
                        ),
                      }
                    : {}),
                },
              },
            ]);
          }}
          onGestureEnd={() =>
            terminarGesto(sceneId, [], useGestoStore.getState().textos ?? [])
          }
          // Só no mapa, como na forma: no quadro a folha inteira já vai.
          mesa={
            mapa
              ? {
                  naMesa: !!texto.naMesa,
                  onToggle: () =>
                    updateTexto(sceneId, texto.id, {
                      naMesa: texto.naMesa ? undefined : true,
                    }),
                }
              : undefined
          }
          onDelete={() => removeTexto(sceneId, texto.id)}
        />
      ) : null}
    </>
  );
});
