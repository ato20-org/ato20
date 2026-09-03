"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Users } from "lucide-react";
import { toast } from "sonner";

import { AttachmentViewer } from "@/components/attachments/attachment-viewer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { listAttachments, signAttachments, type Attachment } from "@/lib/supabase/attachments";
import {
  listPlayers,
  setPlayerLabel,
  subscribeToPlayers,
  type PlayerRow,
} from "@/lib/supabase/players";
import type { Room } from "@/lib/supabase/rooms";

/**
 * Quem está na mesa e o que cada um anexou.
 *
 * Separado do código de convite: convidar acontece uma vez, no começo;
 * consultar a ficha de um jogador acontece no meio da cena, e são gestos com
 * urgências diferentes.
 */
export function PlayersDialog({ room }: { room: Room }) {
  const [players, setPlayers] = useState<PlayerRow[]>([]);

  const refresh = useCallback(() => {
    void listPlayers(room.id).then(setPlayers, () => setPlayers([]));
  }, [room.id]);

  useEffect(() => {
    refresh();

    // Sem isso o mestre teria que recarregar para ver quem entrou.
    return subscribeToPlayers(room.id, refresh);
  }, [room.id, refresh]);

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" aria-label="Jogadores da mesa">
            <Users />
            {players.length > 0 ? <span className="text-xs">{players.length}</span> : null}
          </Button>
        }
      />

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Jogadores</DialogTitle>
          <DialogDescription>
            Nome que cada um escolheu, teu apelido para ele, e o que anexou.
          </DialogDescription>
        </DialogHeader>

        {players.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Ninguém entrou ainda. Esta lista atualiza sozinha.
          </p>
        ) : (
          <ScrollArea className="max-h-96">
            <ul className="space-y-4 pr-3">
              {players.map((player) => (
                <PlayerCard key={player.user_id} player={player} />
              ))}
            </ul>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PlayerCard({ player }: { player: PlayerRow }) {
  // Sem sincronizar de volta com o servidor de propósito: só o mestre escreve
  // o apelido, e daqui. Reaplicar o valor remoto a cada `refresh` apagaria o
  // que ele está digitando quando um jogador muda o nome no meio.
  const [label, setLabel] = useState(player.master_label);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const inputId = `label-${player.user_id}`;

  useEffect(() => {
    let active = true;

    void listAttachments(player.room_id, player.user_id)
      .then(async (list) => {
        if (!active) return;

        setFiles(list);
        setUrls(await signAttachments(list.map((file) => file.path)));
      })
      .catch(() => {
        if (active) {
          setFiles([]);
          setUrls({});
        }
      });

    return () => {
      active = false;
    };
  }, [player.room_id, player.user_id]);

  async function commit() {
    if (label.trim() === player.master_label) return;

    try {
      await setPlayerLabel(player.room_id, player.user_id, label);
    } catch {
      toast.error("Não foi possível salvar o apelido.");
      setLabel(player.master_label);
    }
  }

  return (
    <li className="space-y-2">
      <div className="space-y-1">
        <Label htmlFor={inputId} className="text-xs">
          {player.name.trim() || "Jogador sem nome"}
        </Label>
        <Input
          id={inputId}
          value={label}
          placeholder="Seu apelido para ele"
          maxLength={40}
          className="h-8 text-sm"
          onChange={(event) => setLabel(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") setLabel(player.master_label);
          }}
        />
      </div>

      {files.length > 0 ? (
        <ul className="space-y-0.5">
          {files.map((file) => (
            <li key={file.path}>
              <Button
                variant="ghost"
                size="xs"
                className="w-full justify-start"
                onClick={() => setViewing(file)}
              >
                <FileText />
                <span className="min-w-0 flex-1 truncate text-left">{file.name}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {player.notes.trim() ? (
        <p className="text-muted-foreground max-h-24 overflow-y-auto rounded-md border p-2 text-xs whitespace-pre-line">
          {player.notes}
        </p>
      ) : null}

      <AttachmentViewer
        attachment={viewing}
        url={viewing ? (urls[viewing.path] ?? null) : null}
        onClose={() => setViewing(null)}
      />
    </li>
  );
}
