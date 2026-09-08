"use client";

import { SessionAudio } from "@/components/playground/session-audio";
import { SceneLayer } from "@/components/playground/scene-layer";
import { SceneStage } from "@/components/playground/scene-stage";
import { SoundToggle } from "@/components/playground/sound-toggle";
import { useSubscription } from "@/hooks/use-scene-broadcast";

/**
 * Visão Assistir: recebe a cena e não emite nada. Nenhum controle, nenhum
 * atalho — a tela vai numa TV virada para a mesa.
 *
 * Sem `roomId`: enquanto o transporte é o `BroadcastChannel`, esta tela é uma
 * aba da própria máquina do Operador. O que a solta para outro aparelho é o
 * SSE do daemon, no passo seguinte.
 */
export function ViewerStage() {
  const { scene, track, portraits, synced, stalled } = useSubscription();

  return (
    // `relative` porque o aviso de estado é posicionado absoluto sobre o palco.
    <main className="relative flex flex-1 flex-col bg-black">
      {/* A TV não tem quem opere: enquadramento vem só da câmera da cena.
          `smooth` porque aqui ninguém manipula nada — o que chega são amostras
          do Operador, e interpolá-las é o que separa movimento de salto. */}
      <SceneStage viewport={scene?.camera} smooth>
        {/* `key` na cena: trocar de cena remonta a camada, e é a remontagem
            que dispara a entrada em fade. */}
        {scene ? (
          <div key={scene.id} className="scene-fade-in absolute inset-0">
            <SceneLayer scene={scene} portraits={portraits} smooth />
          </div>
        ) : null}
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
              ? // O único transporte é a própria máquina, e é isso que a
                // mensagem precisa dizer para não mandar procurar na rede.
                "Sem resposta. A tela do Operador precisa estar aberta nesta mesma máquina."
              : "Aguardando o Operador…"}
        </p>
      ) : null}
    </main>
  );
}
