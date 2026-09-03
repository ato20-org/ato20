"use client";

import { SceneLayer } from "@/components/playground/scene-layer";
import { SceneStage } from "@/components/playground/scene-stage";
import { useSceneSubscription } from "@/hooks/use-scene-broadcast";

/**
 * Visão Assistir: recebe a cena e não emite nada. Nenhum controle, nenhum
 * atalho — a tela vai numa TV virada para a mesa.
 */
export function ViewerStage() {
  // Mesma máquina do Operador: `BroadcastChannel` basta e não gasta rede.
  const { scene, synced, stalled } = useSceneSubscription({ local: true });

  return (
    // `relative` porque o aviso de estado é posicionado absoluto sobre o palco.
    <main className="relative flex flex-1 flex-col bg-black">
      {/* A TV não tem quem opere: enquadramento vem só da câmera da cena. */}
      <SceneStage viewport={scene?.camera}>
        {scene ? <SceneLayer scene={scene} /> : null}
      </SceneStage>

      {/* Irmão do palco, não filho — ver a nota em `PlateiaStage`. */}
      {!scene ? (
        <p className="text-muted-foreground absolute inset-0 grid place-items-center px-8 text-center text-xl">
          {synced
            ? "O mestre não colocou nenhuma cena no ar."
            : stalled
              ? "Sem resposta. A tela do Operador precisa estar aberta nesta mesma máquina."
              : "Aguardando o Operador…"}
        </p>
      ) : null}
    </main>
  );
}
