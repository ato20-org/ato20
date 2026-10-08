"use client";

import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";

import { SceneLayer } from "@/components/playground/scene-layer";
import { SceneStage } from "@/components/playground/scene-stage";
import { Button } from "@/components/ui/button";
import { limitesDoConteudo } from "@/lib/geometry/limites";
import { t } from "@/lib/i18n/mestre";
import { viewportQueCabe } from "@/lib/geometry/viewport";
import { useArquivoAbertoStore } from "@/lib/store/use-arquivo-aberto-store";
import { usePaineisStore } from "@/lib/store/use-paineis-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import { itensVisiveis } from "@/types/scene";

/**
 * Um quadro ao lado do mapa, SÓ PARA VER: a roda aproxima, o arrasto desloca,
 * e nada se edita.
 *
 * Editar é no palco, que é um só: a câmera, a seleção e a ferramenta são do
 * aplicativo inteiro, e um segundo quadro editável brigaria por elas. O botão
 * de editar troca de casa -- o quadro vai para o palco e sai daqui.
 *
 * O desenho é o da mesa (`SceneLayer` em modo mesa), que é como o quadro
 * aparece para quem só olha: postits, cartões, letras e formas, sem alça
 * nenhuma. A câmera é DESTE painel, e o mapa continua onde estava.
 */
export function VistaDoQuadro({ sceneId }: { sceneId: string }) {
  const scene = useSceneStore(
    (state) => state.board?.scenes.find((atual) => atual.id === sceneId) ?? null,
  );

  // Sem os de olho apagado na lista de camadas, como no palco.
  const visivel = useMemo(
    () =>
      scene ? { ...scene, items: itensVisiveis(scene.items, scene.grupos) } : null,
    [scene],
  );
  const limites = useMemo(() => (scene ? limitesDoConteudo(scene) : null), [scene]);

  // Enquadrado no que o quadro tem na primeira vez; daí em diante, do mestre.
  const [viewport, setViewport] = useState(() =>
    limites ? viewportQueCabe(limites) : undefined,
  );

  if (!visivel || !limites) {
    return (
      <p className="text-muted-foreground grid flex-1 place-items-center p-4 text-center text-xs">
        {t.paineis.quadroSumiu}
      </p>
    );
  }

  function editarNoPalco() {
    useArquivoAbertoStore.getState().fechar();
    useSceneStore.getState().setEditingSceneId(sceneId);
    // Seleção e enquadramento são por cena, como ao abrir pela lista.
    useSelectionStore.getState().clear();
    useViewportStore.getState().fit();
    usePaineisStore.getState().fechar({ tipo: "quadro", sceneId });
  }

  return (
    <div className="relative isolate flex min-h-0 flex-1 flex-col overflow-hidden">
      <SceneStage
        viewport={viewport ?? viewportQueCabe(limites)}
        onViewportChange={setViewport}
        panOnDrag
        plano="quadro"
        limites={limites}
      >
        <SceneLayer scene={visivel} variant="mesa" />
      </SceneStage>

      <Button
        variant="secondary"
        size="sm"
        className="absolute top-2 right-2 z-10 h-7 gap-1.5 px-2 text-xs shadow"
        title={t.paineis.editarNoPalcoDica}
        onClick={editarNoPalco}
      >
        <Pencil className="size-3.5" />
        {t.paineis.editarNoPalco}
      </Button>
    </div>
  );
}
