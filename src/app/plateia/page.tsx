"use client";

import { Smartphone } from "lucide-react";

import { PlateiaShell } from "@/components/plateia/plateia-shell";
import { RoomDoor } from "@/components/playground/room-door";

export default function PlateiaPage() {
  return (
    <RoomDoor
      titulo="Entrar na mesa"
      icone={<Smartphone className="text-muted-foreground size-8" aria-hidden />}
    >
      {(codigo, nomeDaMesa) => <PlateiaShell codigo={codigo} nomeDaMesa={nomeDaMesa} />}
    </RoomDoor>
  );
}
