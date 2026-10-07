"use client";

import { SessionAudio } from "@/components/playground/session-audio";
import { CenaDeEsguelha } from "@/components/playground/cena-de-esguelha";
import {
  CortinaDeCorte,
  useCorteDeCamera,
} from "@/components/playground/corte-de-camera";
import { SceneStage } from "@/components/playground/scene-stage";
import { SoundToggle } from "@/components/playground/sound-toggle";
import { SpotlightLayer } from "@/components/playground/spotlight-layer";
import { useSubscription } from "@/hooks/use-scene-broadcast";
import {
  DeclarativoProvider,
  useDeclarativoDaMesa,
} from "@/components/playground/declarativo";
import { t } from "@/lib/i18n/palco";

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
    ambientes,
    disparos,
    volume,
    volumeTrilha,
    volumeAmbiente,
    volumeDisparo,
    portraits,
    fichas,
    efeitos,
    spotlight,
    rolagens,
    pings,
    laser,
    declarativoVersao,
    synced,
    stalled,
  } = useSubscription(codigo);

  // Os estilos de medidor dos plugins, buscados quando a versão do quadro muda.
  const declarativo = useDeclarativoDaMesa(codigo, declarativoVersao);

  // Trocar de câmera corta em fade; a mesma câmera andando interpola.
  const { cena, viewport, tripe, corte, cortando } = useCorteDeCamera(scene);
  /**
   * Com um tripé no ar, quem anda é o OLHO, e não o palco.
   *
   * O palco fica parado no plano inteiro e o tripé vai para a `CenaDeEsguelha`,
   * que o segue com voo suave. Recortar o palco também seria aplicar a câmera
   * duas vezes: uma como foto, outra como olho. Ver `Scene.tripeNoAr`.
   */
  const deEsguelha = Boolean(tripe);

  return (
    <DeclarativoProvider valor={declarativo}>
    {/* `relative` porque o aviso de estado é posicionado absoluto sobre o palco. */}
    <main className="relative flex flex-1 flex-col bg-black">
      {/* A TV não tem quem opere: enquadramento vem só da câmera da cena.
          `smooth` porque aqui ninguém manipula nada — o que chega são amostras
          do Mestre, e interpolá-las é o que separa movimento de salto. */}
      <SceneStage
        viewport={deEsguelha ? undefined : viewport}
        corDoVazio={cena?.corDoVazio}
        corte={corte}
        smooth
      >
        {/* `key` na cena: trocar de cena remonta a camada, e é a remontagem
            que dispara a entrada em fade. */}
        {cena ? (
          <div key={cena.id} className="scene-fade-in absolute inset-0">
            {/* `CenaDeEsguelha` e não `SceneLayer` direto: com a cena de
                prumo ela devolve exatamente a mesma camada, e com a cena
                deitada ela compõe o piso com o que se ergue dele. A TV é quem
                o modo veio servir. */}
            <CenaDeEsguelha
              scene={cena}
              portraits={portraits}
              fichas={fichas}
              efeitos={efeitos}
              rolagens={rolagens}
              pings={pings}
              laser={laser}
              smooth
              tripe={tripe}
              corte={corte}
            />
          </div>
        ) : null}
      </SceneStage>

      <CortinaDeCorte fechada={cortando} />

      <SessionAudio
        track={track}
        ambientes={ambientes}
        disparos={disparos}
        volume={volume}
        volumeTrilha={volumeTrilha}
        volumeAmbiente={volumeAmbiente}
        volumeDisparo={volumeDisparo}
      />

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
            ? t.espectador.nadaNoAr
            : stalled
              ? // A mesa foi encontrada — o código passou —, então o que falta
                // é o Mestre publicar. Dizer isso poupa procurar problema na
                // rede, que é onde ninguém acharia nada.
                t.espectador.semResposta
              : t.espectador.aguardando}
        </p>
      ) : null}
    </main>
    </DeclarativoProvider>
  );
}
