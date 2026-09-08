"use client";

import { useEffect } from "react";
import {
  PanelLeftOpen,
  PanelRightOpen,
} from "lucide-react";

import { OpenViewer } from "@/components/operator/open-viewer";
import { PlayersDialog } from "@/components/operator/players-dialog";
import { TableInvite } from "@/components/operator/table-invite";
import { TrackBar } from "@/components/operator/track-bar";
import { LibraryPanel } from "@/components/operator/library-panel";
import { OnAirControl } from "@/components/operator/on-air-control";
import { OperatorStage } from "@/components/operator/operator-stage";
import { OperatorToolbar } from "@/components/operator/operator-toolbar";
import { ScenesPanel } from "@/components/operator/scenes-panel";
import { SpotlightChip } from "@/components/operator/spotlight-chip";
import { StageContextMenu } from "@/components/operator/stage-context-menu";
import { ViewportControls } from "@/components/operator/viewport-controls";
import { SessionAudio } from "@/components/playground/session-audio";
import { SceneStage } from "@/components/playground/scene-stage";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOperatorShortcuts } from "@/hooks/use-operator-shortcuts";
import { usePublisher } from "@/hooks/use-scene-broadcast";
import { useSpacePan } from "@/hooks/use-space-pan";
import { usePanelsStore } from "@/lib/store/use-panels-store";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import {
  selectEditingScene,
  selectLiveScene,
  useSceneStore,
} from "@/lib/store/use-scene-store";
import { useSpotlightStore } from "@/lib/store/use-spotlight-store";
import { useTrackStore } from "@/lib/store/use-track-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import type { Scene } from "@/types/scene";

/**
 * A mesa.
 *
 * Monta com tudo já lido: quem carrega a campanha é o `CampaignBoot`, e este
 * componente antes disparava as hidratações nos próprios efeitos — o que fazia
 * a mesa aparecer aos pedaços e deixava os efeitos de publicação rodarem antes
 * de haver cena.
 */
export function OperatorShell() {
  const status = useSceneStore((state) => state.status);
  const error = useSceneStore((state) => state.error);
  // Duas cenas distintas: a que o mestre edita e a que a mesa vê.
  const editingScene = useSceneStore(selectEditingScene);
  const liveScene = useSceneStore(selectLiveScene);

  const leftOpen = usePanelsStore((state) => state.left);
  const rightOpen = usePanelsStore((state) => state.right);
  const toggleLeft = usePanelsStore((state) => state.toggleLeft);
  const toggleRight = usePanelsStore((state) => state.toggleRight);
  const restorePanels = usePanelsStore((state) => state.restore);

  const track = useTrackStore((state) => state.track);

  const portraits = usePortraitStore((state) => state.portraits);

  const spotlight = useSpotlightStore((state) => state.spotlight);

  // Depois da montagem, não na criação do store: o HTML pré-renderizado usa os
  // padrões, e ler `localStorage` antes disso divergiria na hidratação.
  useEffect(() => {
    restorePanels();
  }, [restorePanels]);

  // Publica a cena NO AR, não a que está sendo editada — é o que permite
  // montar a próxima cena sem a mesa ver o rascunho.
  //
  // A cena entra aqui inteira, com os pontos de anotação; quem os remove é o
  // próprio `usePublisher`, e não este chamador. Ver `sceneForTable`.
  usePublisher({ scene: liveScene, track, portraits, spotlight });
  useOperatorShortcuts();
  useSpacePan();
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* `flex-wrap`: abaixo de ~1000px a barra quebra em duas linhas em vez
          de comprimir os controles ou vazar para fora da tela. Duas linhas em
          janela estreita é honesto; controle inalcançável não é. */}
      {/* O que sobrou aqui é o que pertence à SESSÃO: o que está no ar, o som,
          e quem alcança a mesa. Saíram os controles de gesto — ferramentas e
          zoom foram para o canto do palco, onde a mão já está —, os dois
          toggles de painel, que agora moram nos próprios painéis, e desfazer e
          refazer, que são Ctrl+Z e Ctrl+Y e não precisavam de alvo na tela.
          A campanha subiu para a barra da janela. */}
      <header className="flex flex-wrap items-center gap-2 gap-y-1 border-b px-3 py-2 select-none">
        <OnAirControl editing={editingScene} />

        <Separator orientation="vertical" className="mx-1 h-8" />
        <PlayersDialog />

        {/* As duas juntas, na mesma ponta: são a mesma pergunta — como as
            outras telas entram na mesa. Uma dá o QR para o celular e para a TV
            de outro aparelho; a outra abre a TV aqui. "Jogadores" fica do outro
            lado porque é outra coisa: quem já entrou. */}
        <div className="ml-auto flex items-center gap-2">
          <TableInvite />
          <OpenViewer />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {leftOpen ? <ScenesPanel scene={editingScene} ready={status === "ready"} /> : null}

        <main className="relative flex min-w-0 flex-1 flex-col bg-neutral-950 p-4">
          {/* Painel fechado deixa um alvo flutuando no canto de cima do palco,
              do lado dele. É o caminho de volta: sem isso, fechar um painel o
              deixaria inalcançável. */}
          {leftOpen ? null : (
            <FloatingPanelToggle
              onToggle={toggleLeft}
              label="Cenas e áreas"
              className="top-2 left-2"
              icon={<PanelLeftOpen />}
            />
          )}
          {rightOpen ? null : (
            <FloatingPanelToggle
              onToggle={toggleRight}
              label="Imagens e sons"
              className="top-2 right-2"
              icon={<PanelRightOpen />}
            />
          )}

          {status === "error" ? (
            <p className="text-destructive m-auto max-w-sm text-center text-sm">{error}</p>
          ) : (
            <StageBoundary scene={editingScene} status={status} />
          )}
        </main>

        {rightOpen ? <LibraryPanel scene={editingScene} /> : null}
      </div>

      {/* A linha de baixo: o que está tocando, com onde está e quanto falta.
          Só aparece quando há trilha escolhida. */}
      <TrackBar />

      {/* A trilha é da sessão, não da cena: trocar de cena não corta a
          música. */}
      <SessionAudio track={track} />
    </div>
  );
}

/**
 * O alvo que devolve um painel fechado.
 *
 * Flutua sobre o canto de cima do palco, do lado do painel que ele reabre.
 * Substituiu os dois botões que viviam nas pontas do cabeçalho: eles ficavam
 * longe do que controlavam, e eram dois dos itens que faziam a barra parecer
 * cheia.
 */
function FloatingPanelToggle({
  onToggle,
  label,
  className,
  icon,
}: {
  onToggle: () => void;
  label: string;
  className: string;
  icon: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="secondary"
            size="icon-sm"
            // `z-10` para vencer o palco. Sem sombra e semitransparente: ele
            // fica sobre a cena, e um botão opaco ali competiria com o mapa.
            className={`bg-background/85 absolute z-10 backdrop-blur ${className}`}
            aria-label={`Mostrar ${label}`}
            onClick={onToggle}
          >
            {icon}
          </Button>
        }
      />
      <TooltipContent>
        <p>Mostrar {label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * O menu de contexto só existe quando há cena — sem ela não há ação nenhuma
 * para oferecer, e o `ContextMenuTrigger` ficaria envolvendo um aviso.
 */
function StageBoundary({ scene, status }: { scene: Scene | null; status: string }) {
  const viewport = useViewportStore((state) => state.viewport);
  const setViewport = useViewportStore((state) => state.setViewport);
  const panMode = useViewportStore((state) => state.panMode);

  const stage = (
    // Com espaço segurado, o arrasto de botão esquerdo passa a deslocar a cena
    // — o mesmo caminho que o botão do meio já usava.
    <SceneStage viewport={viewport} onViewportChange={setViewport} panOnDrag={panMode} bounds>
      {scene ? (
        <OperatorStage scene={scene} />
      ) : (
        <p className="text-muted-foreground absolute inset-0 grid place-items-center text-xl">
          {status === "ready" ? "Nenhuma cena selecionada" : "Carregando…"}
        </p>
      )}
    </SceneStage>
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {scene ? <StageContextMenu scene={scene}>{stage}</StageContextMenu> : stage}

      {/* Fora do gatilho do menu de contexto, e independente de haver cena: uma
          imagem transmitida continua no ar mesmo sem cena nenhuma no palco, e é
          justamente aí que esquecê-la é mais fácil. */}
      <SpotlightChip />

      {/* Fora do gatilho do menu de contexto: botão direito sobre os controles
          não deve abrir o menu da cena.
          Canto inferior ESQUERDO, e num grupo só com as ferramentas: escolher
          a ferramenta e ajustar o zoom são o mesmo tipo de gesto — mira no
          mapa —, e tê-los em cantos opostos obrigava a atravessar a tela entre
          duas ações que andam juntas. */}
      {scene ? (
        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <OperatorToolbar />
          <ViewportControls scene={scene} />
        </div>
      ) : null}
    </div>
  );
}
