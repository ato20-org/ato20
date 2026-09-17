"use client";

import { Eye } from "lucide-react";
import { useEffect, useState } from "react";

import {
  CortinaDeCorte,
  useCorteDeCamera,
} from "@/components/playground/corte-de-camera";
import { SceneLayer } from "@/components/playground/scene-layer";
import { SceneStage } from "@/components/playground/scene-stage";
import { useSubscription } from "@/hooks/use-scene-broadcast";
import { useSpotlightUrl } from "@/hooks/use-spotlight-url";
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
        Abra uma campanha para ver o que a mesa vê.
      </p>
    );
  }

  if (!base) {
    return (
      <div className="aspect-video w-full bg-black" aria-busy>
        <p className="text-muted-foreground grid h-full place-items-center px-4 text-center text-xs">
          Procurando o daemon…
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
  const { scene, portraits, spotlight, rolagens, synced, stalled } =
    useSubscription(codigo, base);

  // Mesmo corte da TV: trocar de câmera fecha a cortina; a mesma câmera andando
  // interpola. É o que faz este quadro bater com o da mesa também no tempo.
  const { cena, viewport, corte, cortando } = useCorteDeCamera(scene);

  return (
    // `aspect-video` E `flex-1`: a janela flutuante nasce sem altura e cresce
    // com o conteúdo, e um palco sem proporção teria zero pixels -- daí o
    // 16:9, que é a TV da maioria das mesas. Quando o mestre puxa a alça, ou a
    // janela vira aba de coluna, a altura passa a ser dada, e aí é o `flex-1`
    // que faz o palco preencher em vez de deixar uma faixa preta embaixo.
    //
    // `overflow-hidden` e `isolate`: o palco faz o próprio recorte, mas a
    // cortina e o aviso são `absolute` e não podem sair da janela.
    <div className="relative isolate flex aspect-video min-h-0 w-full flex-1 flex-col overflow-hidden bg-black">
      <SceneStage viewport={viewport} corte={corte} smooth>
        {cena ? (
          <div key={cena.id} className="scene-fade-in absolute inset-0">
            <SceneLayer
              scene={cena}
              portraits={portraits}
              rolagens={rolagens}
              variante="tela"
              smooth
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
            ? "Nada no ar."
            : stalled
              ? "Sem resposta do daemon."
              : "Aguardando…"}
        </p>
      ) : null}
    </div>
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
        Em evidência
      </span>
    </div>
  );
}
