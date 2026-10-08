"use client";

import { Eye } from "lucide-react";
import { useEffect, useState } from "react";

import {
  CortinaDeCorte,
  useCorteDeCamera,
} from "@/components/playground/corte-de-camera";
import { CenaDeEsguelha } from "@/components/playground/cena-de-esguelha";
import { SceneStage } from "@/components/playground/scene-stage";
import { useSubscription } from "@/hooks/use-scene-broadcast";
import {
  DeclarativoProvider,
  useDeclarativoDaMesa,
} from "@/components/playground/declarativo";
import { useSpotlightUrl } from "@/hooks/use-spotlight-url";
import { t } from "@/lib/i18n/mestre";
import { compor, filtroDaImagem } from "@/lib/imagem-do-espectador";
import { useCampaignStore } from "@/lib/store/use-campaign-store";
import { daemonAddr } from "@/lib/vault/bridge";
import type { Spotlight } from "@/types/scene";

/**
 * O miniplayer: o que a mesa está vendo, numa janela do Mestre.
 *
 * Existe para o mestre saber o que VAZOU antes de a mesa saber. O palco dele
 * mostra a cena em edição, com névoa atravessada, pontos de anotação e a câmera
 * onde a mão deixou; a TV mostra outra coisa, e até aqui a única forma de
 * conferir era virar a cabeça para o segundo monitor -- ou não ter um.
 *
 * ## Assina o fluxo, não lê o store
 *
 * Esta janela é um ESPECTADOR a mais: entra no `/sala/live` do daemon com o
 * código da mesa, igual à TV. Seria mais barato ler `selectLiveScene` do store
 * e desenhar com `variant="mesa"`, mas isso reproduziria o que a TV DEVERIA
 * mostrar, não o que ela mostra. O que sai do daemon já passou pelo
 * `sceneForTable`, pelo throttle e pela reidratação; se algum desses um dia
 * vazar um ponto do mestre, é aqui que ele aparece. Prova, não estimativa.
 *
 * ## Menor
 *
 * `variante="tela"`: as imagens vêm em 1920px, como para o celular do jogador.
 * Numa janela de 320 pixels o original de um mapa só custaria decodificação, e
 * este palco vive AO LADO do palco de verdade -- cada quadro dele é roubado do
 * mestre. Ver a nota sobre variantes em `SceneLayer`.
 *
 * Sem som, de propósito: o Mestre já tem o `SessionAudio` dele, e uma segunda
 * saída seria eco. Sem controle nenhum, como a TV.
 */
export function MiniplayerBody() {
  const codigo = useCampaignStore((state) => state.campaign?.codigo ?? null);

  // O endereço do daemon chega por IPC, depois do primeiro render. Sem ele o
  // `EventSource` abriria contra a origem da webview, que não é o daemon.
  const [base, setBase] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    void daemonAddr().then(
      ({ url }) => {
        if (ativo) setBase(url);
      },
      () => {
        if (ativo) setBase(null);
      },
    );
    return () => {
      ativo = false;
    };
  }, []);

  if (!codigo) {
    return (
      <p className="text-muted-foreground p-3 text-xs">
        {t.miniplayer.semCampanha}
      </p>
    );
  }

  if (!base) {
    return (
      <div className="aspect-video w-full bg-black" aria-busy>
        <p className="text-muted-foreground grid h-full place-items-center px-4 text-center text-xs">
          {t.miniplayer.procurandoDaemon}
        </p>
      </div>
    );
  }

  return <MiniplayerPalco codigo={codigo} base={base} />;
}

/**
 * Separado porque o `useSubscription` precisa de código e endereço prontos: o
 * hook abre o fluxo no `useEffect`, e trocar de argumento depois seria abrir e
 * fechar uma conexão à toa.
 */
function MiniplayerPalco({ codigo, base }: { codigo: string; base: string }) {
  const {
    scene,
    portraits,
    fichas,
    spotlight,
    rolagens,
    pings,
    laser,
    declarativoVersao,
    imagem,
    synced,
    stalled,
  } = useSubscription(codigo, base);

  // Do daemon, e não do store do Mestre: esta janela existe para mostrar o que
  // a MESA vê, e a mesa lê o conjunto que o daemon serve.
  const declarativo = useDeclarativoDaMesa(codigo, declarativoVersao, base);

  // Mesmo corte da TV: trocar de câmera fecha a cortina; a mesma câmera andando
  // interpola. É o que faz este quadro bater com o da mesa também no tempo.
  const { cena, viewport, tripe, corte, cortando } = useCorteDeCamera(scene);
  // Com um tripé no ar a mesa vê de esguelha, e esta janela também: o palco
  // fica parado no plano inteiro e quem anda é o olho. Mesma regra do
  // `EspectadorStage` -- sem ela, a janela mostrava o mapa de prumo enquanto a
  // TV mostrava o 2.5D.
  const deEsguelha = Boolean(tripe);
  // O ajuste de imagem da TV, igual ao do `EspectadorStage`: esta janela é a
  // prévia dele. O palco do Mestre fica com o mapa como é, e sem ela o mestre
  // mexeria nas réguas às cegas, olhando para a sala.
  const filtro = filtroDaImagem(compor(imagem, cena?.imagem));

  return (
    // `aspect-video` E `flex-1`: a janela flutuante nasce sem altura e cresce
    // com o conteúdo, e um palco sem proporção teria zero pixels -- daí o
    // 16:9, que é a TV da maioria das mesas. Quando o mestre puxa a alça, ou a
    // janela vira aba de coluna, a altura passa a ser dada, e aí é o `flex-1`
    // que faz o palco preencher em vez de deixar uma faixa preta embaixo.
    //
    // `overflow-hidden` e `isolate`: o palco faz o próprio recorte, mas a
    // cortina e o aviso são `absolute` e não podem sair da janela.
    //
    // O ajuste de imagem na caixa inteira, como a TV faz no palco, na cortina
    // e na evidência. O aviso de "nada no ar" vai junto, e só aparece sem cena.
    <DeclarativoProvider valor={declarativo}>
    <div
      className="relative isolate flex aspect-video min-h-0 w-full flex-1 flex-col overflow-hidden bg-black"
      style={{ filter: filtro }}
    >
      <SceneStage
        viewport={deEsguelha ? undefined : viewport}
        corDoVazio={cena?.corDoVazio}
        corte={corte}
        smooth
      >
        {cena ? (
          <div key={cena.id} className="scene-fade-in absolute inset-0">
            {/* Sem tripé no ar, devolve a mesma `SceneLayer` de antes. */}
            <CenaDeEsguelha
              scene={cena}
              portraits={portraits}
              fichas={fichas}
              rolagens={rolagens}
              pings={pings}
              laser={laser}
              variante="tela"
              smooth
              tripe={tripe}
              corte={corte}
            />
          </div>
        ) : null}
      </SceneStage>

      <CortinaDeCorte fechada={cortando} />

      {/* A evidência, DENTRO da janela. O `SpotlightLayer` da TV é `fixed
          inset-0`; montá-lo aqui cobriria o Mestre inteiro, e a tela que
          existe para o mestre ver o que a mesa vê o deixaria sem ver nada. */}
      <EvidenciaEmMiniatura spotlight={spotlight} />

      {!scene ? (
        <p className="text-muted-foreground absolute inset-0 grid place-items-center px-4 text-center text-xs">
          {synced
            ? t.miniplayer.nadaNoAr
            : stalled
              ? t.miniplayer.semResposta
              : t.miniplayer.aguardando}
        </p>
      ) : null}
    </div>
    </DeclarativoProvider>
  );
}

function EvidenciaEmMiniatura({ spotlight }: { spotlight: Spotlight | null }) {
  const url = useSpotlightUrl(spotlight);

  if (!spotlight) return null;

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-1 bg-black/92 p-2">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- endereço do daemon, não do bundle
        <img
          src={url}
          alt=""
          className="max-h-full min-h-0 w-auto max-w-full flex-1 object-contain select-none"
          draggable={false}
        />
      ) : null}
      <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/90">
        <Eye className="size-3" aria-hidden />
        {t.miniplayer.emEvidencia}
      </span>
    </div>
  );
}
