"use client";

import { useEffect } from "react";
import { Loader2, WifiOff } from "lucide-react";

import { InviteBadge } from "@/components/operator/invite-badge";
import { PlayersDialog } from "@/components/operator/players-dialog";
import { RulesDialog } from "@/components/operator/rules-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRoomStore } from "@/lib/store/use-room-store";

/**
 * Estado da mesa no cabeçalho do Operador. Abre o painel com o código, o
 * link de convite e a lista de jogadores.
 */
export function RoomBadge() {
  const status = useRoomStore((state) => state.status);
  const room = useRoomStore((state) => state.room);
  const error = useRoomStore((state) => state.error);
  const connectAsMaster = useRoomStore((state) => state.connectAsMaster);

  useEffect(() => {
    void connectAsMaster();
  }, [connectAsMaster]);

  if (status === "offline") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <WifiOff className="size-3.5" />
              Local
            </span>
          }
        />
        <TooltipContent>
          <p className="max-w-52">
            Sem Supabase configurado. Operador e Assistir funcionam; a Plateia no celular precisa
            das chaves em <code>.env.local</code>.
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (status === "error") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="ghost" size="sm" onClick={() => void connectAsMaster()}>
              Sala indisponível
            </Button>
          }
        />
        <TooltipContent>
          <p className="max-w-52">{error} — clique para tentar de novo.</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (!room) {
    return (
      <Loader2 className="text-muted-foreground size-3.5 animate-spin" aria-label="Abrindo mesa" />
    );
  }

  // Duas peças, não uma: o código fica à mão para ser passado, e a ficha dos
  // jogadores atrás de um clique, porque só é consultada de vez em quando.
  return (
    <>
      <InviteBadge room={room} />
      <PlayersDialog room={room} />
      <RulesDialog room={room} />
    </>
  );
}
