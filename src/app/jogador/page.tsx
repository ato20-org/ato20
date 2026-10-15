"use client";

import { Smartphone } from "lucide-react";

import { JogadorShell } from "@/components/jogador/jogador-shell";
import { RoomDoor } from "@/components/playground/room-door";
import { t } from "@/lib/i18n/jogador";

export default function JogadorPage() {
  return (
    <RoomDoor
      titulo={t.porta.tituloJogador}
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
