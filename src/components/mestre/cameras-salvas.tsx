"use client";

import { useState } from "react";
import {
  CircleDot,
  Crosshair,
  Eye,
  EyeOff,
  Focus,
  LocateFixed,
  Maximize,
  MoreVertical,
  Plus,
  Radio,
  ScanSearch,
  TextCursorInput,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { aoApertarF2, useRenomearPeloMenu } from "@/hooks/use-renomear-pelo-menu";
import {
  alternarTransmissao,
  enquadrarAqui,
  enquadrarSelecao,
  irParaCamera,
  mostrarCenaInteira,
  novaCamera,
} from "@/lib/mestre/camera-actions";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useCameraLockStore } from "@/lib/store/use-camera-lock-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { cn } from "@/lib/utils";
import type { CameraSalva, Scene } from "@/types/scene";

/**
 * As câmeras da cena, como chips numerados ao lado do zoom.
 *
 * Chips e não uma lista num popover: trocar de câmera no meio da sessão é um
 * gesto de um toque, e um menu que abre e fecha é dois. O número no chip é a
 * tecla: `Shift+1` seleciona a primeira. A ordem é a da lista, sem uma
 * segunda numeração para divergir.
 *
 * O chip aceso é a SELECIONADA, a que o mestre edita. O REC vermelho na
 * frente do nome é a que está NO AR. São coisas diferentes de propósito: o
 * mestre prepara uma enquanto a mesa vê outra, e o T troca.
 *
 * Depois dos chips: novo, transmitir, e um menu com o resto. Eram nove botões
 * espalhados por duas pílulas; à vista ficam só os dois que se apertam no
 * meio da sessão. O resto tem tecla, e o menu é onde se descobre qual.
 */
export function CamerasSalvas({ scene }: { scene: Scene }) {
  const cameras = scene.cameras ?? [];
  const selecionadaId = useCameraLockStore((state) => state.selecionadaId);
  const fantasmasVisiveis = useCameraLockStore(
    (state) => state.fantasmasVisiveis,
  );
  const alternarFantasmas = useCameraLockStore(
    (state) => state.alternarFantasmas,
  );
  const espelhoMestre = useCameraLockStore((state) => state.espelhoMestre);
  const alternarEspelho = useCameraLockStore((state) => state.alternarEspelho);
  const prenderNaSelecao = useCameraLockStore(
    (state) => state.prenderNaSelecao,
  );
  const soltar = useCameraLockStore((state) => state.soltar);
  const temSelecao = useSelectionStore(
    (state) => state.selectedIds.length > 0,
  );

  const selecionada = cameras.find((camera) => camera.id === selecionadaId);
  const segue = Boolean(selecionada?.alvoIds);
  const transmitindo = Boolean(
    selecionada && scene.cameraNoArId === selecionada.id,
  );

  return (
    <div className="bg-background/85 pointer-events-auto flex items-center gap-0.5 rounded-lg border p-1 backdrop-blur">
      {cameras.map((camera, index) => (
        <Chip
          key={camera.id}
          sceneId={scene.id}
          camera={camera}
          posicao={index + 1}
          selecionada={camera.id === selecionadaId}
          transmitindo={camera.id === scene.cameraNoArId}
        />
      ))}

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Nova câmera"
              onClick={() => novaCamera()}
            >
              <Plus />
            </Button>
          }
        />
        <TooltipContent>
          <p className="font-medium">Nova câmera</p>
          <p className="text-muted-foreground max-w-52">
            Nasce sobre a selecionada, ou sobre o que você vê, e já no ar.
          </p>
        </TooltipContent>
      </Tooltip>

      <span className="bg-border mx-0.5 h-5 w-px" />

      {/* Transmitir fica à vista, e é o único que fica: é o toque que muda o
          que a mesa vê, e o mestre precisa achá-lo sem abrir nada. Vermelho
          no ar. O resto dos comandos da câmera mora no menu ao lado. */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant={transmitindo ? "destructive" : "ghost"}
              size="icon-sm"
              aria-label={
                transmitindo ? "Tirar do ar" : "Transmitir a câmera selecionada"
              }
              disabled={!selecionada}
              onClick={alternarTransmissao}
            >
              <Radio />
            </Button>
          }
        />
        <TooltipContent>
          <p className="font-medium">
            {transmitindo ? "Tirar do ar" : "Transmitir"}
          </p>
          <p className="text-muted-foreground max-w-52">
            {transmitindo
              ? "A mesa volta a ver a cena inteira."
              : "A mesa passa a ver a câmera selecionada."}
          </p>
        </TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Mais comandos da câmera"
              disabled={!selecionada}
            >
              <MoreVertical />
            </Button>
          }
        />
        {/* Largura fixa: sem ela o menu herda a do botão de três pontos e
            cada rótulo quebra em três linhas. */}
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onClick={enquadrarAqui}>
            <ScanSearch />
            Trazer para aqui
            <DropdownMenuShortcut>C</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={irParaCamera}>
            <LocateFixed />
            Ir até a câmera
            <DropdownMenuShortcut>Home</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!temSelecao} onClick={enquadrarSelecao}>
            <Focus />
            Enquadrar a seleção
            <DropdownMenuShortcut>F</DropdownMenuShortcut>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuCheckboxItem
            checked={segue}
            disabled={!segue && !temSelecao}
            onCheckedChange={() => (segue ? soltar() : prenderNaSelecao())}
          >
            <Crosshair />
            Seguir a seleção
            <DropdownMenuShortcut>L</DropdownMenuShortcut>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={espelhoMestre}
            onCheckedChange={alternarEspelho}
          >
            <Eye />
            Espelhar o palco
            <DropdownMenuShortcut>Shift+L</DropdownMenuShortcut>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={fantasmasVisiveis}
            onCheckedChange={alternarFantasmas}
          >
            {fantasmasVisiveis ? <Eye /> : <EyeOff />}
            Outras câmeras no mapa
          </DropdownMenuCheckboxItem>

          {scene.cameraNoArId ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={mostrarCenaInteira}>
                <Maximize />
                Mostrar a cena inteira
                <DropdownMenuShortcut>Shift+C</DropdownMenuShortcut>
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

type ChipProps = {
  sceneId: string;
  camera: CameraSalva;
  posicao: number;
  selecionada: boolean;
  transmitindo: boolean;
};

function Chip({
  sceneId,
  camera,
  posicao,
  selecionada,
  transmitindo,
}: ChipProps) {
  const atualizarCamera = useSceneStore((state) => state.atualizarCamera);
  const removerCamera = useSceneStore((state) => state.removerCamera);
  const transmitirCamera = useSceneStore((state) => state.transmitirCamera);
  const selecionar = useCameraLockStore((state) => state.selecionar);
  const [renomeando, setRenomeando] = useState(false);
  const renomear = useRenomearPeloMenu(() => setRenomeando(true));

  const segue = (camera.alvoIds?.length ?? 0) > 0;

  function confirmar(nome: string) {
    const limpo = nome.trim();
    if (limpo && limpo !== camera.nome)
      atualizarCamera(sceneId, camera.id, { nome: limpo });
    setRenomeando(false);
  }

  if (renomeando) {
    return (
      <input
        autoFocus
        defaultValue={camera.nome}
        className="bg-accent h-7 w-24 rounded-md px-2 text-xs outline-none"
        aria-label="Nome da câmera"
        onFocus={(event) => event.currentTarget.select()}
        onBlur={(event) => confirmar(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") confirmar(event.currentTarget.value);
          if (event.key === "Escape") setRenomeando(false);
          // Nem o palco nem os atalhos: o mestre está digitando.
          event.stopPropagation();
        }}
      />
    );
  }

  return (
    <ContextMenu onOpenChangeComplete={renomear.aoFechar}>
      <ContextMenuTrigger
        render={
          <button
            type="button"
            className={cn(
              "hover:bg-accent flex h-7 max-w-32 items-center gap-1 rounded-md px-2 text-xs",
              selecionada &&
                "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
            title={`${camera.nome} (Shift+${posicao})`}
            onClick={() => selecionar(camera.id)}
            onDoubleClick={() => setRenomeando(true)}
            onKeyDown={aoApertarF2(() => setRenomeando(true))}
          >
            {/* O número É a tecla. Fora do nome para não sumir no corte. */}
            <span className="tabular-nums opacity-70">{posicao}</span>
            {transmitindo ? (
              <CircleDot className="size-3 shrink-0 text-red-400" />
            ) : null}
            <span className="truncate">{camera.nome}</span>
            {/* Segue tokens, e não um lugar: a mira diz isso sem ocupar o
                nome. */}
            {segue ? <Crosshair className="size-3 shrink-0 opacity-80" /> : null}
          </button>
        }
      />
      <ContextMenuContent>
        <ContextMenuItem
          onClick={() =>
            transmitirCamera(sceneId, transmitindo ? undefined : camera.id)
          }
        >
          <Radio />
          {transmitindo ? "Tirar do ar" : "Transmitir"}
          {selecionada ? <ContextMenuShortcut>T</ContextMenuShortcut> : null}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            selecionar(camera.id);
            enquadrarAqui();
          }}
        >
          <ScanSearch />
          Trazer para onde estou
          {selecionada ? <ContextMenuShortcut>C</ContextMenuShortcut> : null}
        </ContextMenuItem>
        <ContextMenuItem onClick={renomear.pedir}>
          <TextCursorInput />
          Renomear
          <ContextMenuShortcut>F2</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem
          variant="destructive"
          onClick={() => removerCamera(sceneId, camera.id)}
        >
          <Trash2 />
          Remover
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
