"use client";

import { useEffect } from "react";
import {
  PanelLeftOpen,
  PanelRightOpen,
} from "lucide-react";

import { OpenViewer } from "@/components/operator/open-viewer";
import { PlayersChip } from "@/components/operator/players-chip";
import { TableInvite } from "@/components/operator/table-invite";
import { DockRow } from "@/components/operator/dock/dock-row";
import { TrackBar } from "@/components/operator/track-bar";
import { WindowLayer } from "@/components/operator/window-layer";
import { OnAirControl } from "@/components/operator/on-air-control";
import { OperatorStage } from "@/components/operator/operator-stage";
import { OperatorToolbar } from "@/components/operator/operator-toolbar";
import { PinIndex } from "@/components/operator/pin-index";
import { SpotlightChip } from "@/components/operator/spotlight-chip";
import { StageContextMenu } from "@/components/operator/stage-context-menu";
import { ViewportControls } from "@/components/operator/viewport-controls";
import { SessionAudio } from "@/components/playground/session-audio";
import { SceneStage } from "@/components/playground/scene-stage";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCharacters } from "@/hooks/use-characters";
import { useEscopoDosAssets } from "@/hooks/use-escopo-dos-assets";
import { useFilaDeRetratos } from "@/hooks/use-fila-de-retratos";
import { useOperatorShortcuts } from "@/hooks/use-operator-shortcuts";
import { usePanMode } from "@/hooks/use-pan-mode";
import { usePublisher } from "@/hooks/use-scene-broadcast";
import { useSpacePan } from "@/hooks/use-space-pan";
import { usePanelsStore } from "@/lib/store/use-panels-store";
import { useLayoutStore } from "@/lib/store/use-layout-store";
import { usePinWindowStore } from "@/lib/store/use-pin-window-store";
import { useWindowStore } from "@/lib/store/use-window-store";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import { retratosDaCena } from "@/lib/geometry/portrait";
import {
  selectEditingScene,
  selectLiveScene,
  useSceneStore,
} from "@/lib/store/use-scene-store";
import { useReguaStore } from "@/lib/store/use-regua-store";
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
  const restorePinNotes = usePinWindowStore((state) => state.restaurar);
  const restoreLayout = useLayoutStore((state) => state.restaurar);
  const restoreWindows = useWindowStore((state) => state.restaurar);

  const track = useTrackStore((state) => state.track);
  const trackVolume = useTrackStore((state) => state.volume);

  const guardados = usePortraitStore((state) => state.portraits);
  const { personagens } = useCharacters();

  /**
   * O que a mesa vê: os retratos de quem tem token na cena NO AR.
   *
   * Pela cena no ar, e não pela que está sendo editada -- é a mesma promessa
   * que o resto da publicação faz. O mestre monta a cena seguinte com os
   * retratos dela já armados e posicionados, e nada disso chega à TV antes de
   * a cena subir. Ver `retratosDaCena`, que o painel usa com a outra cena.
   */
  const portraits = retratosDaCena(guardados, liveScene?.items ?? [], personagens ?? []);

  const spotlight = useSpotlightStore((state) => state.spotlight);
  const medida = useReguaStore((state) => state.medida);

  // Depois da montagem, não na criação do store: o HTML pré-renderizado usa os
  // padrões, e ler `localStorage` antes disso divergiria na hidratação. Vale
  // para os painéis e para onde cada nota de ponto foi deixada.
  useEffect(() => {
    restorePanels();
    restorePinNotes();
    restoreWindows();
    restoreLayout();
  }, [restorePanels, restorePinNotes, restoreWindows, restoreLayout]);

  // Publica a cena NO AR, não a que está sendo editada — é o que permite
  // montar a próxima cena sem a mesa ver o rascunho.
  //
  // A cena entra aqui inteira, com os pontos de anotação; quem os remove é o
  // próprio `usePublisher`, e não este chamador. Ver `sceneForTable`.
  //
  // O volume viaja FORA da faixa: é da sessão, e trocar de música não mexe
  // nele.
  // A medida entra no quadro publicado: a mesa acompanha a conta enquanto o
  // mestre mede. Ver `useReguaStore`.
  usePublisher({
    scene: liveScene,
    track,
    volume: trackVolume,
    portraits,
    spotlight,
    medida,
  });

  // A fila arruma o elenco da cena EM EDIÇÃO, que é a que o mestre vê no palco.
  // A publicação acima usa a que está no ar. Ver `useFilaDeRetratos`.
  useFilaDeRetratos(editingScene);

  // Passagem única: marca o dono dos arquivos que entraram antes de o escopo
  // existir, senão eles ficariam na biblioteca para sempre.
  useEscopoDosAssets(status === "ready");
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
          Jogadores saiu junto: virou pílula com contador no canto do palco.
          A campanha subiu para a barra da janela. */}
      <header className="flex flex-wrap items-center gap-2 gap-y-1 border-b px-3 py-2 select-none">
        <OnAirControl editing={editingScene} />

        {/* As duas juntas, na mesma ponta: são a mesma pergunta — como as
            outras telas entram na mesa. Uma dá o QR para o celular e para a TV
            de outro aparelho; a outra abre a TV aqui. Quem JÁ entrou é outra
            coisa, e mora no canto do palco — ver `PlayersChip`. */}
        <div className="ml-auto flex items-center gap-2">
          <TableInvite />
          <OpenViewer />
        </div>
      </header>

      {/* `relative` porque é este retângulo que as janelas internas medem: elas
          vão POR CIMA dos painéis, e a posição delas é relativa a ele. Antes a
          camada morava dentro do palco, e o painel de imagens cortava a janela
          no meio — arrastar a ficha para a direita a levava para debaixo da
          biblioteca em vez de sobre ela.

          A linha, e não a raiz do shell: a barra de cima é o que está NO AR e
          quem alcança a mesa, e a de baixo é o que está tocando. Uma janela
          cobrindo qualquer das duas esconderia controle de sessão atrás de
          consulta de ficha. */}
      <div className="relative flex min-h-0 min-w-0 flex-1">
        <DockRow>
          <main className="relative flex min-w-0 flex-1 flex-col bg-neutral-950 p-4">
            {/* Painel fechado deixa um alvo flutuando no canto de cima do palco,
                do lado dele. É o caminho de volta: sem isso, fechar um painel o
                deixaria inalcançável. */}
            {/* Canto de cima à esquerda: o caminho de volta do painel fechado, e
                o índice de pontos.

                Os dois são a mesma coisa — alcançar o que está fora da vista:
                um devolve o painel recolhido, o outro leva a um ponto de
                anotação que pode estar fora do enquadramento. E nenhum é gesto
                sobre o mapa, que é o que mora embaixo.

                Na mesma fila e não em blocos separados porque eles se
                sobreporiam: este bloco fica na folga do `main`, e o palco
                começa 16 pixels adentro. */}
            <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
              {leftOpen ? null : (
                <FloatingPanelToggle
                  onToggle={toggleLeft}
                  // "o painel esquerdo", e não "Cenas e áreas": o que mora na
                  // coluna agora é escolha do mestre, e o rótulo mentiria no
                  // dia em que ele arrastasse Cenas para o outro lado.
                  label="o painel esquerdo"
                  icon={<PanelLeftOpen />}
                />
              )}

              {editingScene ? <PinIndex scene={editingScene} /> : null}
            </div>

            {/* Quem está na mesa fica aqui, e não no cabeçalho: é consulta, como
                o índice de pontos, e a contagem só serve se estiver à vista o
                tempo todo. Fora do `StageBoundary`: uma mesa cheia continua
                cheia sem cena nenhuma selecionada. */}
            <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
              {/* Só jogadores. Personagens tinha uma pílula ao lado desta, e ela
                  saiu quando a lista virou aba padrão da bancada: um atalho no
                  canto do palco para uma tela que já está à vista é um segundo
                  caminho para o mesmo lugar, e o contador dela repetia o que a
                  própria lista mostra.

                  Jogadores fica: quem entrou pela Plateia não tem aba nenhuma,
                  e a contagem é o que responde "quantos entraram?" sem abrir
                  nada. O chip sai sem moldura; a moldura é esta. */}
              <div className="bg-background/85 pointer-events-auto flex items-center gap-0.5 rounded-lg border p-1 backdrop-blur">
                <PlayersChip />
              </div>
              {rightOpen ? null : (
                <FloatingPanelToggle
                  onToggle={toggleRight}
                  label="o painel direito"
                  icon={<PanelRightOpen />}
                />
              )}
            </div>

            {status === "error" ? (
              <p className="text-destructive m-auto max-w-sm text-center text-sm">{error}</p>
            ) : (
              <StageBoundary scene={editingScene} status={status} />
            )}
          </main>
        </DockRow>

        {/* Por último na marcação: as janelas ficam acima de tudo o que está
            nesta linha, e deixar a ordem do DOM concordar com a ordem visual é
            o que mantém a navegação por Tab indo do mapa e dos painéis para a
            janela, e não o contrário. */}
        <WindowLayer />
      </div>

      {/* A linha de baixo: o que está tocando, com onde está e quanto falta.
          Só aparece quando há trilha escolhida. */}
      <TrackBar />

      {/* A trilha é da sessão, não da cena: trocar de cena não corta a
          música. */}
      <SessionAudio track={track} volume={trackVolume} />
    </div>
  );
}

/**
 * O alvo que devolve um painel fechado.
 *
 * Flutua sobre o canto de cima do palco, do lado do painel que ele reabre —
 * quem o posiciona é o grupo que o envolve.
 * Substituiu os dois botões que viviam nas pontas do cabeçalho: eles ficavam
 * longe do que controlavam, e eram dois dos itens que faziam a barra parecer
 * cheia.
 */
function FloatingPanelToggle({
  onToggle,
  label,
  icon,
}: {
  onToggle: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="secondary"
            size="icon-sm"
            // Sem sombra e semitransparente: ele fica sobre a cena, e um
            // botão opaco ali competiria com o mapa.
            className="bg-background/85 backdrop-blur"
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
  // A mesma resposta que o `OperatorStage` usa para soltar os itens.
  const panMode = usePanMode();

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

          As ferramentas à esquerda e o zoom à direita, um canto para cada
          grupo. Estavam juntas à esquerda, e o lápis com a borracha levaram a
          fila a seis alvos: com o zoom emendado, a barra atravessava metade do
          palco e as duas pontas dela não tinham relação nenhuma. */}
      {scene ? (
        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <OperatorToolbar />
        </div>
      ) : null}

      {scene ? (
        <div className="absolute right-3 bottom-3 flex items-center gap-2">
          <ViewportControls scene={scene} />
        </div>
      ) : null}
    </div>
  );
}
