"use client";

import { Tv } from "lucide-react";

import { RoomDoor } from "@/components/playground/room-door";
import { ViewerStage } from "@/components/playground/viewer-stage";

/**
 * A TV.
 *
 * A porta do código voltou junto com o daemon na rede: é ela que solta esta
 * tela da máquina do Operador e deixa qualquer aparelho da casa servir de TV.
 * O botão "Abrir Assistir" do Operador já leva o código no QR e na URL, porque
 * a TV não tem quem digite nela.
 */
export default function AssistirPage() {
  return (
    <RoomDoor titulo="Assistir" icone={<Tv className="text-muted-foreground size-8" aria-hidden />}>
      {(codigo) => <ViewerStage codigo={codigo} />}
    </RoomDoor>
  );
}
