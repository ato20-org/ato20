"use client";

import { SessionAudio } from "@/components/playground/session-audio";
import { CenaDeEsguelha } from "@/components/playground/cena-de-esguelha";
import { ControlesDeZoom } from "@/components/playground/controles-de-zoom";
import {
  CortinaDeCorte,
  useCorteDeCamera,
} from "@/components/playground/corte-de-camera";
import { SceneStage } from "@/components/playground/scene-stage";
import { SoundToggle } from "@/components/playground/sound-toggle";
import { SpotlightLayer } from "@/components/playground/spotlight-layer";
import { useSubscription } from "@/hooks/use-scene-broadcast";
import { useDefinirVezDaMesa } from "@/lib/store/use-vez-da-mesa-store";
import { useZoomDaMesa } from "@/hooks/use-zoom-da-mesa";
import {
  DeclarativoProvider,
  useDeclarativoDaMesa,
} from "@/components/playground/declarativo";
import { compor, filtroDaImagem } from "@/lib/imagem-do-espectador";
import { t } from "@/lib/i18n/palco";

/**
 * Visão Espectador: recebe a cena e não emite nada. A tela vai numa TV virada
 * para a mesa, e o único controle é o zoom de quem estiver diante dela -- só
 * para dentro do recorte do mestre, e local a esta tela. Ver `useZoomDaMesa`.
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
    imagem,
    iniciativa,
    synced,
    stalled,
  } = useSubscription(codigo);
  // A vez, para a marca nos retratos. Ver `useVezDaMesaStore`.
  useDefinirVezDaMesa(iniciativa?.vezDe ?? null);

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
  // O mapa é a página inteira: o Ctrl + vale em qualquer lugar dela.
  const { viewport: recorte, zoom, direto, alvo, aproximar, afastar, voltar } = useZoomDaMesa({
    base: deEsguelha ? undefined : viewport,
    corte,
    ativo: Boolean(cena),
    tecladoSempre: true,
  });
  /**
   * O ajuste de imagem: o da campanha vezes o da cena que está NA TELA -- a
   * `cena` do corte, e não a `scene` que acabou de chegar, para o tom trocar
   * atrás da cortina junto com o mapa. `undefined` quando neutro, e aí não há
   * `filter` nenhum. Ver `lib/imagem-do-espectador`.
   */
  const filtro = filtroDaImagem(compor(imagem, cena?.imagem));

  return (
    <DeclarativoProvider valor={declarativo}>
    {/* `relative` porque o aviso de estado é posicionado absoluto sobre o palco. */}
    <main className="relative flex flex-1 flex-col bg-black">
      {/* O ajuste de imagem cobre o palco, a cortina e a evidência: é a imagem
          da TV, e a evidência que entra no meio da cena escura escurece com
          ela. Por FORA do palco, e nunca dentro dos planos -- ver
          `debug-do-palco` §3.

          A cortina vem para DENTRO junto: o `filter` faz desta caixa um
          contexto de empilhamento, e a cortina de fora (`z-20`) passaria a
          cobrir a evidência (`z-60`) a cada corte de câmera. Dentro, a ordem é
          a de sempre -- e o preto dela fica igual ao preto do vazio ajustado.

          O `filter` também a torna o bloco de contenção do `fixed` da
          evidência; ela ocupa a tela inteira, e o resultado é o mesmo. */}
      <div
        ref={alvo}
        // A pinça é o zoom do mapa, e não o da página.
        className="relative flex flex-1 touch-none flex-col"
        style={{ filter: filtro }}
      >
        {/* A TV não tem quem opere: enquadramento vem só da câmera da cena.
            `smooth` porque aqui ninguém manipula nada — o que chega são
            amostras do Mestre, e interpolá-las é o que separa movimento de
            salto. */}
        <SceneStage
          viewport={recorte}
          corDoVazio={cena?.corDoVazio}
          corte={corte}
          semTransicao={direto}
          smooth
        >
          {/* `key` na cena: trocar de cena remonta a camada, e é a remontagem
              que dispara a entrada em fade. */}
          {cena ? (
            <div key={cena.id} className="scene-fade-in absolute inset-0">
              {/* `CenaDeEsguelha` e não `SceneLayer` direto: com a cena de
                  prumo ela devolve exatamente a mesma camada, e com a cena
                  deitada ela compõe o piso com o que se ergue dele. A TV é
                  quem o modo veio servir. */}
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

        {/* Sem `dismissable`: não há ninguém na TV para fechar nada, e um
            botão ali só criaria a chance de alguém encostar. Quem tira do ar
            é o mestre. */}
        <SpotlightLayer spotlight={spotlight} />
      </div>

      <SessionAudio
        track={track}
        ambientes={ambientes}
        disparos={disparos}
        volume={volume}
        volumeTrilha={volumeTrilha}
        volumeAmbiente={volumeAmbiente}
        volumeDisparo={volumeDisparo}
      />

      {/* Discreto no canto: a TV fica virada para a mesa, e o controle existe
          para o mestre escolher qual aparelho emite o som. `z-30` pelo motivo
          dos botões do `JogadorStage`: a tarja preta do palco (`z-10`) e a
          cortina (`z-20`) pintavam por cima dele sempre que a tela sobrava em
          cima e embaixo, e o botão continuava clicável sem aparecer. */}
      <SoundToggle className="absolute top-3 right-3 z-30 opacity-40 hover:opacity-100" />

      {/* Fora do ajuste de imagem, como o som. Some com a evidência no ar: ela
          cobre o mapa, e o botão ficaria sobre a imagem que a mesa foi chamada
          a olhar. */}
      {cena && !spotlight ? (
        <ControlesDeZoom
          zoom={zoom}
          onAproximar={aproximar}
          onAfastar={afastar}
          onVoltar={voltar}
          discreto
          className="absolute right-3 bottom-3 z-30"
        />
      ) : null}

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
