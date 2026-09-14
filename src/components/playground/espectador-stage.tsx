"use client";

import { SessionAudio } from "@/components/playground/session-audio";
import { RulerOverlay } from "@/components/playground/ruler-overlay";
import { SceneLayer } from "@/components/playground/scene-layer";
import { SceneStage } from "@/components/playground/scene-stage";
import { SoundToggle } from "@/components/playground/sound-toggle";
import { SpotlightLayer } from "@/components/playground/spotlight-layer";
import { useSubscription } from "@/hooks/use-scene-broadcast";

/**
 * Visão Espectador: recebe a cena e não emite nada. Nenhum controle, nenhum
 * atalho — a tela vai numa TV virada para a mesa.
 *
 * O código vem da porta, já conferido: é o daemon que decide quem pode ouvir o
 * fluxo, e é isso que permite esta tela estar em qualquer aparelho da casa.
 */
export function EspectadorStage({ codigo }: { codigo: string }) {
  const {
    scene,
    track,
    volume,
    portraits,
    spotlight,
    medida,
    rolagens,
    synced,
    stalled,
  } = useSubscription(codigo);

  return (
    // `relative` porque o aviso de estado é posicionado absoluto sobre o palco.
    <main className="relative flex flex-1 flex-col bg-black">
      {/* A TV não tem quem opere: enquadramento vem só da câmera da cena.
          `smooth` porque aqui ninguém manipula nada — o que chega são amostras
          do Mestre, e interpolá-las é o que separa movimento de salto. */}
      <SceneStage viewport={scene?.camera} smooth>
        {/* `key` na cena: trocar de cena remonta a camada, e é a remontagem
            que dispara a entrada em fade. */}
        {scene ? (
          <div key={scene.id} className="scene-fade-in absolute inset-0">
            <SceneLayer
              scene={scene}
              portraits={portraits}
              rolagens={rolagens}
              smooth
            />

            {/* A régua do mestre, enquanto ele mede. Dentro do palco porque as
                pontas são coordenadas de cena, e fora do `SceneLayer` porque
                ela não é conteúdo do mapa -- some quando ele solta. */}
            {medida && scene.grid ? (
              <RulerOverlay
                de={medida.de}
                para={medida.para}
                grid={scene.grid}
              />
            ) : null}
          </div>
        ) : null}
      </SceneStage>

      <SessionAudio track={track} volume={volume} />

      {/* Sem `dismissable`: não há ninguém na TV para fechar nada, e um botão
          ali só criaria a chance de alguém encostar. Quem tira do ar é o
          mestre. */}
      <SpotlightLayer spotlight={spotlight} />

      {/* Discreto no canto: a TV fica virada para a mesa, e o controle existe
          para o mestre escolher qual aparelho emite o som. */}
      <SoundToggle className="absolute top-3 right-3 opacity-40 hover:opacity-100" />

      {/* Irmão do palco, não filho — ver a nota em `JogadorStage`. */}
      {!scene ? (
        <p className="text-muted-foreground absolute inset-0 grid place-items-center px-8 text-center text-xl">
          {synced
            ? "O mestre não colocou nenhuma cena no ar."
            : stalled
              ? // A mesa foi encontrada — o código passou —, então o que falta
                // é o Mestre publicar. Dizer isso poupa procurar problema na
                // rede, que é onde ninguém acharia nada.
                "Sem resposta. A tela do Mestre precisa estar aberta."
              : "Aguardando o Mestre…"}
        </p>
      ) : null}
    </main>
  );
}
