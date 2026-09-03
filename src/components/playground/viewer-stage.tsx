"use client";

import { SessionAudio } from "@/components/playground/session-audio";
import { SceneLayer } from "@/components/playground/scene-layer";
import { SceneStage } from "@/components/playground/scene-stage";
import { SoundToggle } from "@/components/playground/sound-toggle";
import { useSubscription } from "@/hooks/use-scene-broadcast";

/**
 * Visão Assistir: recebe a cena e não emite nada. Nenhum controle, nenhum
 * atalho — a tela vai numa TV virada para a mesa.
 */
export function ViewerStage() {
  // Mesma máquina do Operador: `BroadcastChannel` basta e não gasta rede.
  const { scene, track, synced, stalled } = useSubscription({ local: true });

  return (
    // `relative` porque o aviso de estado é posicionado absoluto sobre o palco.
    <main className="relative flex flex-1 flex-col bg-black">
      {/* A TV não tem quem opere: enquadramento vem só da câmera da cena. */}
      <SceneStage viewport={scene?.camera}>
        {scene ? <SceneLayer scene={scene} /> : null}
      </SceneStage>

      <SessionAudio track={track} />

      {/* Discreto no canto: a TV fica virada para a mesa, e o controle existe
          para o mestre escolher qual aparelho emite o som. */}
      <SoundToggle className="absolute top-3 right-3 opacity-40 hover:opacity-100" />

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
