"use client";

import { LogOut, Repeat, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRoomStore } from "@/lib/store/use-room-store";

/**
 * A conta do mestre no cabeçalho.
 *
 * Sem isto não há como trocar de conta nem de mesa sem limpar os dados do
 * navegador — e trocar de mesa é o gesto de quem mestra mais de uma campanha.
 *
 * Não aparece na instalação sem Supabase: lá não existe conta nem mesa.
 */
export function AccountBadge() {
  const account = useRoomStore((state) => state.account);
  const masterRooms = useRoomStore((state) => state.masterRooms);
  const leaveRoom = useRoomStore((state) => state.leaveRoom);
  const signOut = useRoomStore((state) => state.signOut);

  if (!account) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" aria-label={`Conta: ${account.email}`}>
            <UserRound />
            <span className="hidden max-w-32 truncate xl:inline">{account.email}</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <p className="text-muted-foreground truncate px-2 py-1.5 text-xs">{account.email}</p>

        <DropdownMenuSeparator />

        {/* Uma mesa só não é escolha: o item levaria a uma tela com um botão. */}
        {masterRooms.length > 1 ? (
          <DropdownMenuItem onClick={leaveRoom}>
            <Repeat />
            Trocar de mesa
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOut />
          Sair da conta
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
