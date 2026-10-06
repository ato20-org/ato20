"use client";

import { Tv } from "lucide-react";

import { RoomDoor } from "@/components/playground/room-door";
import { EspectadorStage } from "@/components/playground/espectador-stage";
import { t } from "@/lib/i18n/jogador";

/**
 * A TV.
 *
 * A porta do código voltou junto com o daemon na rede: é ela que solta esta
 * tela da máquina do Mestre e deixa qualquer aparelho da casa servir de TV.
 * O botão "Abrir Espectador" do Mestre já leva o código no QR e na URL, porque
 * a TV não tem quem digite nela.
 */
export default function EspectadorPage() {
  return (
    <RoomDoor
      titulo={t.porta.tituloEspectador}
      icone={<Tv className="text-muted-foreground size-8" aria-hidden />}
    >
      {(codigo) => <EspectadorStage codigo={codigo} />}
    </RoomDoor>
  );
}
