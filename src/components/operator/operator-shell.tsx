"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Redo2,
  Undo2,
  Volume2,
  VolumeX,
} from "lucide-react";

import { AccountBadge } from "@/components/operator/account-badge";
import { BoardConflictBar, BoardSyncBadge } from "@/components/operator/board-sync-badge";
import { LibraryPanel } from "@/components/operator/library-panel";
import { OnAirControl } from "@/components/operator/on-air-control";
import { OperatorStage } from "@/components/operator/operator-stage";
import { OperatorToolbar } from "@/components/operator/operator-toolbar";
import { RoomBadge } from "@/components/operator/room-badge";
import { ScenesPanel } from "@/components/operator/scenes-panel";
import { StageContextMenu } from "@/components/operator/stage-context-menu";
import { ViewportControls } from "@/components/operator/viewport-controls";
import { SessionAudio } from "@/components/playground/session-audio";
import { SceneStage } from "@/components/playground/scene-stage";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAssetSync } from "@/hooks/use-asset-sync";
import { collectUsedAssetIds } from "@/lib/operator/asset-usage";
import { useOperatorShortcuts } from "@/hooks/use-operator-shortcuts";
import { usePublisher } from "@/hooks/use-scene-broadcast";
import { useSpacePan } from "@/hooks/use-space-pan";
import { useAudioStore } from "@/lib/store/use-audio-store";
import { useLibraryStore } from "@/lib/store/use-library-store";
import { usePanelsStore } from "@/lib/store/use-panels-store";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import { useSessionSyncStore } from "@/lib/store/use-session-sync-store";
import { useRoomStore } from "@/lib/store/use-room-store";
import {
  selectCanRedo,
  selectCanUndo,
  selectEditingScene,
  selectLiveScene,
  useSceneStore,
} from "@/lib/store/use-scene-store";
import { useTrackStore } from "@/lib/store/use-track-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import type { Scene } from "@/types/scene";

export function OperatorShell() {
  const hydrate = useSceneStore((state) => state.hydrate);
  const status = useSceneStore((state) => state.status);
  const error = useSceneStore((state) => state.error);
  // Duas cenas distintas: a que o mestre edita e a que a mesa vê.
  const scenes = useSceneStore((state) => state.board?.scenes);
  const editingScene = useSceneStore(selectEditingScene);
  const liveScene = useSceneStore(selectLiveScene);

  const soundOn = useAudioStore((state) => state.enabled);
  const setSoundOn = useAudioStore((state) => state.setEnabled);
  const audioBlocked = useAudioStore((state) => state.blocked);
  const retryAudio = useAudioStore((state) => state.retry);

  const leftOpen = usePanelsStore((state) => state.left);
  const rightOpen = usePanelsStore((state) => state.right);
  const toggleLeft = usePanelsStore((state) => state.toggleLeft);
  const toggleRight = usePanelsStore((state) => state.toggleRight);
  const restorePanels = usePanelsStore((state) => state.restore);

  const canUndo = useSceneStore(selectCanUndo);
  const canRedo = useSceneStore(selectCanRedo);
  const undo = useSceneStore((state) => state.undo);
  const redo = useSceneStore((state) => state.redo);

  const track = useTrackStore((state) => state.track);
  const trackVolume = useTrackStore((state) => state.volume);
  const hydrateTrack = useTrackStore((state) => state.hydrate);

  const portraits = usePortraitStore((state) => state.portraits);
  const hydratePortraits = usePortraitStore((state) => state.hydrate);

  const roomId = useRoomStore((state) => state.room?.id ?? null);
  const syncLibrary = useLibraryStore((state) => state.sync);
  const syncSession = useSessionSyncStore((state) => state.sync);
  // A porta do Assistir pede o código da mesa. O botão daqui já o leva: quem
  // abre a TV é o mestre, e ele não deveria digitar o que já está na tela.
  const roomCode = useRoomStore((state) => state.room?.code ?? null);

  useEffect(() => {
    // A mesa entra na hidratação: o board é por mesa, e trocar de mesa troca
    // de board — inclusive o cache local, que antes era um só por navegador.
    void hydrate(roomId);
  }, [hydrate, roomId]);

  useEffect(() => {
    void hydrateTrack();
  }, [hydrateTrack]);

  useEffect(() => {
    void hydratePortraits();
  }, [hydratePortraits]);

  // Depois da montagem, não na criação do store: o HTML pré-renderizado usa os
  // padrões, e ler `localStorage` antes disso divergiria na hidratação.
  useEffect(() => {
    restorePanels();
  }, [restorePanels]);

  // Publica a cena NO AR, não a que está sendo editada — é o que permite
  // montar a próxima cena sem a mesa ver o rascunho.
  // `local` alimenta a TV na mesma máquina; `roomId` alimenta os celulares.
  usePublisher(
    { scene: liveScene, track, volume: trackVolume, portraits },
    { local: true, roomId },
  );
  useOperatorShortcuts();
  useSpacePan();
  // O que a mesa precisa alcançar de fora desta máquina. É a mesma conta que a
  // faxina do bucket usa, e por isso vive num lugar só.
  //
  // Assinado do store, e não lido com `getState()`: o arquivo tem de subir no
  // instante em que entra numa cena, e uma leitura pontual não reagiria a isso.
  const usedAssetIds = collectUsedAssetIds(scenes ?? [], portraits, track);

  useAssetSync(roomId, usedAssetIds);

  // Depois do board, não junto: a faxina do bucket precisa saber o que está em
  // uso, e sem board carregado essa conta seria vazia — ela apagaria justamente
  // o material das cenas.
  //
  // A sessão vem antes do acervo de propósito: ela decide quais retratos estão
  // no ar, e a faxina precisa contar esses arquivos como em uso.
  useEffect(() => {
    if (!roomId || status !== "ready") return;

    void syncSession(roomId).then(() => syncLibrary(roomId));
  }, [roomId, status, syncLibrary, syncSession]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* `flex-wrap`: abaixo de ~1000px a barra quebra em duas linhas em vez
          de comprimir os controles ou vazar para fora da tela. Duas linhas em
          janela estreita é honesto; controle inalcançável não é. */}
      <header className="flex flex-wrap items-center gap-2 gap-y-1 border-b px-3 py-2">
        {/* `nativeButton={false}`: o Base UI avisa que renderizar um <a> como
            botão apaga a semântica nativa. Aqui é um link de verdade — navega,
            abre em nova aba, aceita "copiar endereço" — então declaramos isso. */}
        <Button
          render={<Link href="/mesa" />}
          nativeButton={false}
          variant="ghost"
          size="icon-sm"
          aria-label="Escolher visão"
        >
          <Home />
        </Button>

        <PanelToggle
          open={leftOpen}
          onToggle={toggleLeft}
          label="Cenas e áreas"
          openIcon={<PanelLeftClose />}
          closedIcon={<PanelLeftOpen />}
        />

        <Separator orientation="vertical" className="mx-1 h-8" />

        {/* `max-w-40` porque `truncate` só corta dentro de largura definida —
            sem o limite, um nome longo de cena empurraria o resto da barra. */}
        <div className="min-w-0 max-w-40">
          <p className="text-sm leading-none font-medium">Operador</p>
          <p className="text-muted-foreground truncate text-xs">
            {editingScene ? `Editando ${editingScene.name}` : "Nenhuma cena aberta"}
          </p>
        </div>

        <Separator orientation="vertical" className="mx-1 h-8" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Desfazer"
          disabled={!canUndo}
          onClick={undo}
        >
          <Undo2 />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Refazer"
          disabled={!canRedo}
          onClick={redo}
        >
          <Redo2 />
        </Button>

        <Separator orientation="vertical" className="mx-1 h-8" />
        <OnAirControl editing={editingScene} />

        <Separator orientation="vertical" className="mx-1 h-8" />
        <OperatorToolbar />

        <Separator orientation="vertical" className="mx-1 h-8" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={soundOn ? "Silenciar esta tela" : "Ligar o som desta tela"}
          aria-pressed={!soundOn}
          onClick={() => setSoundOn(!soundOn)}
        >
          {soundOn ? <Volume2 /> : <VolumeX />}
        </Button>

        <Separator orientation="vertical" className="mx-1 h-8" />
        <RoomBadge />
        <BoardSyncBadge />

        {/* O browser recusa tocar antes de um gesto na página. Só aparece
            quando há trilha para desbloquear. */}
        {audioBlocked && track ? (
          <Button variant="secondary" size="sm" onClick={retryAudio}>
            <Volume2 />
            Ativar som
          </Button>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <AccountBadge />

          <Button
            render={
              <Link
                href={roomCode ? `/assistir?code=${roomCode}` : "/assistir"}
                target="_blank"
                rel="noopener"
              />
            }
            nativeButton={false}
            variant="outline"
            size="sm"
            aria-label="Abrir Assistir"
          >
            <ExternalLink />
            <span className="hidden xl:inline">Abrir Assistir</span>
          </Button>

          <PanelToggle
            open={rightOpen}
            onToggle={toggleRight}
            label="Imagens e sons"
            openIcon={<PanelRightClose />}
            closedIcon={<PanelRightOpen />}
          />
        </div>
      </header>

      <BoardConflictBar />

      <div className="flex min-h-0 flex-1">
        {leftOpen ? <ScenesPanel scene={editingScene} ready={status === "ready"} /> : null}

        <main className="flex min-w-0 flex-1 flex-col bg-neutral-950 p-4">
          {status === "error" ? (
            <p className="text-destructive m-auto max-w-sm text-center text-sm">{error}</p>
          ) : (
            <StageBoundary scene={editingScene} status={status} />
          )}
        </main>

        {rightOpen ? <LibraryPanel scene={editingScene} /> : null}
      </div>

      {/* A trilha é da sessão, não da cena: trocar de cena não corta a
          música. */}
      <SessionAudio track={track} volume={trackVolume} />
    </div>
  );
}

type PanelToggleProps = {
  open: boolean;
  onToggle: () => void;
  label: string;
  openIcon: React.ReactNode;
  closedIcon: React.ReactNode;
};

function PanelToggle({ open, onToggle, label, openIcon, closedIcon }: PanelToggleProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${open ? "Esconder" : "Mostrar"} ${label}`}
            aria-pressed={open}
            onClick={onToggle}
          >
            {open ? openIcon : closedIcon}
          </Button>
        }
      />
      <TooltipContent>
        <p>
          {open ? "Esconder" : "Mostrar"} {label}
        </p>
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

      {/* Fora do gatilho do menu de contexto: botão direito sobre os controles
          não deve abrir o menu da cena. */}
      {scene ? (
        <div className="absolute right-3 bottom-3">
          <ViewportControls scene={scene} />
        </div>
      ) : null}
    </div>
  );
}
