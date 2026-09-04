"use client";

import { Loader2, WifiOff } from "lucide-react";

import { InviteBadge } from "@/components/operator/invite-badge";
import { OperatorCodeDialog } from "@/components/operator/operator-code-dialog";
import { PlayersDialog } from "@/components/operator/players-dialog";
import { StorageDialog } from "@/components/operator/storage-dialog";
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
  // Quem conecta é o `Operator`, que decide entre a porta e a mesa antes deste
  // cabeçalho existir. Aqui a ação só serve ao botão de tentar de novo.
  const connectAsMaster = useRoomStore((state) => state.connectAsMaster);

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

  // O código da mesa fica à mão, porque é ditado no começo de toda sessão. O
  // código de operação e a ficha dos jogadores ficam atrás de um clique — e a
  // senha, ainda escondida lá dentro.
  return (
    <>
      <InviteBadge room={room} />
      <OperatorCodeDialog room={room} />
      <PlayersDialog room={room} />
      <StorageDialog room={room} />
    </>
  );
}
