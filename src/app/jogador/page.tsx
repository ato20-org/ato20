"use client";

import { Smartphone } from "lucide-react";

import { JogadorShell } from "@/components/jogador/jogador-shell";
import { RoomDoor } from "@/components/playground/room-door";

export default function JogadorPage() {
  return (
    <RoomDoor
      titulo="Entrar na mesa"
      icone={
        <Smartphone className="text-muted-foreground size-8" aria-hidden />
      }
    >
      {(codigo, nomeDaMesa) => (
        <JogadorShell codigo={codigo} nomeDaMesa={nomeDaMesa} />
      )}
    </RoomDoor>
  );
}
