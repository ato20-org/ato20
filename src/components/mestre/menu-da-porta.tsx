"use client";

import { DoorClosed, DoorOpen, Lock, LockOpen, Trash2 } from "lucide-react";

import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
} from "@/components/ui/context-menu";
import { alternarPorta } from "@/lib/geometry/porta";
import {
  removePortaSelection,
  toggleSelectionLock,
} from "@/lib/mestre/item-actions";
import { useSceneStore } from "@/lib/store/use-scene-store";
import type { Porta } from "@/types/scene";

/**
 * O que se faz com a porta selecionada pelo botão direito: abrir ou fechar de
 * uma vez, travar e remover. O mesmo botão da fileira do gizmo -- abrir volta
 * à última abertura, ver `alternarPorta` --, e a folha gira até lá.
 *
 * No topo do menu, como o bloco da luz: a porta só fica selecionada quando o
 * mestre acabou de encostar nela.
 */
export function BlocoDaPorta({
  sceneId,
  porta,
}: {
  sceneId: string;
  porta: Porta;
}) {
  const updatePorta = useSceneStore((state) => state.updatePorta);

  return (
    <>
      <ContextMenuItem
        onClick={() => updatePorta(sceneId, porta.id, alternarPorta(porta))}
      >
        {porta.abertura !== undefined ? <DoorClosed /> : <DoorOpen />}
        {porta.abertura !== undefined ? "Fechar porta" : "Abrir porta"}
      </ContextMenuItem>
      <ContextMenuItem onClick={toggleSelectionLock}>
        {porta.locked ? <LockOpen /> : <Lock />}
        {porta.locked ? "Destravar" : "Travar"}
      </ContextMenuItem>
      {/* Apagado, e não sumido, na travada: a razão do bloco da luz. */}
      <ContextMenuItem
        variant="destructive"
        disabled={Boolean(porta.locked)}
        onClick={removePortaSelection}
      >
        <Trash2 />
        Remover porta
        <ContextMenuShortcut>Del</ContextMenuShortcut>
      </ContextMenuItem>

      <ContextMenuSeparator />
    </>
  );
}
