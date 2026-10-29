"use client";

import { ChevronDown, ChevronRight, CircleDot, Radio, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { irParaCamera, transmissaoDaCamera } from "@/lib/mestre/camera-actions";
import { t } from "@/lib/i18n/cenas";
import { t as textoDasCameras } from "@/lib/i18n/ferramentas";
import { useCameraLockStore } from "@/lib/store/use-camera-lock-store";
import { useEsguelhaStore } from "@/lib/store/use-esguelha-store";
import { useFotosDasCamerasStore } from "@/lib/store/use-fotos-das-cameras-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { cn } from "@/lib/utils";
import type { Scene } from "@/types/scene";

/** Quantas câmeras e tripés a cena tem. Zero = a linha nem oferece a seta. */
export function quantasCameras(scene: Pick<Scene, "cameras" | "tripes">): number {
  return (scene.cameras?.length ?? 0) + (scene.tripes?.length ?? 0);
}

/** A seta da linha da cena que abre e fecha a lista das câmeras dela. */
export function SetaDasCameras({
  aberta,
  onAlternar,
}: {
  aberta: boolean;
  onAlternar: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="text-muted-foreground shrink-0"
      aria-expanded={aberta}
      aria-label={aberta ? t.sceneList.esconderCameras : t.sceneList.mostrarCameras}
      title={aberta ? t.sceneList.esconderCameras : t.sceneList.mostrarCameras}
      // Dentro da linha, que abre a cena no clique: a seta só abre a lista.
      onClick={(evento) => {
        evento.stopPropagation();
        onAlternar();
      }}
    >
      {aberta ? <ChevronDown /> : <ChevronRight />}
    </Button>
  );
}

/**
 * As câmeras de uma cena, debaixo da linha dela na lista de cenas: a foto da
 * última posição, o nome e o REC de quem está no ar.
 *
 * A foto é a do cache desta máquina (`useFotosDasCamerasStore`), tirada
 * quando a cena aberta parou de mudar -- não é ao vivo. A câmera que nunca foi
 * vista nesta máquina mostra o ícone até a cena ser aberta.
 *
 * O clique abre a cena JÁ na câmera: selecionada, e o palco no enquadramento
 * dela. Não muda o que a mesa vê -- transmitir fica no botão direito. Um tripé
 * leva ao 2.5D, que é onde ele se ajusta.
 */
export function CamerasDaCena({
  scene,
  recuo,
  onOpen,
}: {
  scene: Scene;
  /** O recuo da linha da cena, para a lista ficar debaixo dela. */
  recuo: number;
  /** Abre a cena, como o clique na linha. */
  onOpen: () => void;
}) {
  const fotos = useFotosDasCamerasStore((state) => state.fotos);
  const transmitirCamera = useSceneStore((state) => state.transmitirCamera);
  const cenaNoAr = useSceneStore(
    (state) => state.board?.liveSceneId === scene.id,
  );

  const todas = [
    ...(scene.cameras ?? []).map((camera) => ({ camera, tripe: false })),
    ...(scene.tripes ?? []).map((camera) => ({ camera, tripe: true })),
  ];

  function abrirNaCamera(cameraId: string, tripe: boolean) {
    onOpen();
    // O modo da câmera: o recorte se ajusta no 2D, o tripé no 2.5D. A troca
    // antes da seleção -- ela escolhe uma câmera do modo novo, e a do clique
    // passa por cima.
    const esguelha = useEsguelhaStore.getState();
    if (esguelha.ligada !== tripe) esguelha.alternar();
    useCameraLockStore.getState().selecionar(cameraId);
    if (!tripe) irParaCamera();
  }

  return (
    <li>
      <ul
        className="space-y-0.5 pb-1"
        aria-label={t.sceneList.camerasDe(scene.name)}
        style={{ paddingLeft: recuo + 24 }}
      >
        {todas.map(({ camera, tripe }) => {
          const transmissao = transmissaoDaCamera(scene, camera.id, cenaNoAr);
          const foto = fotos[camera.id]?.url;

          return (
            <ContextMenu key={camera.id}>
              <ContextMenuTrigger
                render={
                  <li>
                    <button
                      type="button"
                      className="hover:bg-accent/50 flex w-full items-center gap-2 rounded-md p-1 text-left"
                      title={t.sceneList.abrirNaCamera(camera.nome)}
                      onClick={() => abrirNaCamera(camera.id, tripe)}
                    >
                      <span className="flex h-[27px] w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-black">
                        {foto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={foto}
                            alt=""
                            className="size-full object-cover"
                            draggable={false}
                          />
                        ) : (
                          <Video
                            className="text-muted-foreground size-3.5"
                            aria-label={t.sceneList.semFotoAinda}
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs">
                        {camera.nome}
                      </span>
                      {transmissao ? (
                        <CircleDot
                          className={cn(
                            "size-3 shrink-0",
                            transmissao === "no-ar"
                              ? "text-red-400"
                              : "text-amber-400",
                          )}
                        />
                      ) : null}
                    </button>
                  </li>
                }
              />
              <ContextMenuContent className="w-48">
                <ContextMenuItem
                  onClick={() =>
                    transmitirCamera(scene.id, transmissao ? undefined : camera.id)
                  }
                >
                  <Radio />
                  {transmissao === "no-ar"
                    ? textoDasCameras.camerasSalvas.tirarDoAr
                    : transmissao === "preparada"
                      ? textoDasCameras.camerasSalvas.desfazerPreparacao
                      : textoDasCameras.camerasSalvas.transmitir}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </ul>
    </li>
  );
}
