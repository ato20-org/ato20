"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Paperclip, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  listPlayers,
  playerAttachments,
  removePlayer,
  setPlayerLabel,
  type Player,
  type PlayerAttachment,
} from "@/lib/vault/players";

/** Depois disso, o jogador deixa de contar como "na mesa agora". */
const PRESENTE_POR_MS = 90_000;

/**
 * Quem está na mesa.
 *
 * A lista vem por IPC: o mestre não passa pelas rotas do daemon, porque o
 * aplicativo é ele. Substitui o diálogo que lia a tabela `players` do Supabase,
 * e o que garantia ali que a ficha de um não vazava para o outro era a RLS —
 * agora é o token de cada jogador, e o mestre vê tudo por ser dono do disco.
 */
export function PlayersDialog() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [anexos, setAnexos] = useState<Record<string, PlayerAttachment[]>>({});
  const [loaded, setLoaded] = useState(false);
  const [aberto, setAberto] = useState(false);
  /**
   * Instante da ultima leitura.
   *
   * Guardado em estado em vez de `Date.now()` no render: ler o relogio durante
   * o render torna o componente impuro -- o mesmo estado passaria a desenhar
   * coisas diferentes -- e, pior, a bolinha de presenca nunca mudaria de cor,
   * porque nada dispararia um render novo quando o tempo passasse. Aqui ela
   * acompanha a sondagem.
   */
  const [agora, setAgora] = useState(0);

  const recarregar = useCallback(async () => {
    try {
      const lista = await listPlayers();
      setPlayers(lista);

      const pares = await Promise.all(
        lista.map(async (player) => {
          try {
            return [player.id, await playerAttachments(player.id)] as const;
          } catch {
            return [player.id, []] as const;
          }
        }),
      );

      setAnexos(Object.fromEntries(pares));
      setAgora(Date.now());
    } catch {
      setPlayers([]);
      setAnexos({});
    }
  }, []);

  useEffect(() => {
    if (!aberto) return;

    let ativo = true;

    // Sem reapagar `loaded` na reabertura: a lista anterior aparece na hora e a
    // sondagem a atualiza em seguida. Um spinner por cima do que ja se sabe e
    // pior que um dado de cinco segundos atras.
    //
    // `set-state-in-effect` desligado pelo mesmo motivo de
    // `player-attachments`: a regra rastreia os `setState` de `recarregar` de
    // volta ate aqui e nao ve que todos acontecem depois de um `await`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recarregar().finally(() => {
      if (ativo) setLoaded(true);
    });

    // Sondagem enquanto o diálogo está aberto. Sem `postgres_changes` para
    // assinar, e uma rota de eventos só para isto pagaria complexidade por uma
    // lista que muda uma vez por sessão.
    const timer = setInterval(() => void recarregar(), 5000);

    return () => {
      ativo = false;
      clearInterval(timer);
    };
  }, [aberto, recarregar]);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" aria-label="Jogadores">
            <Users />
            <span className="hidden lg:inline">Jogadores</span>
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogTitle>Jogadores</DialogTitle>
        <DialogDescription>
          Quem entrou pela Plateia. Os arquivos de cada um estão em{" "}
          <code>jogadores/&#123;id&#125;/</code> dentro da pasta da campanha.
        </DialogDescription>

        {!loaded ? (
          <div className="grid h-24 place-items-center">
            <Loader2 className="text-muted-foreground size-5 animate-spin" aria-label="Carregando" />
          </div>
        ) : players.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Ninguém entrou ainda. Mostre o QR de &quot;Entrar na mesa&quot; e peça para abrirem a
            aba Personagem.
          </p>
        ) : (
          <ul className="max-h-[60dvh] space-y-3 overflow-y-auto">
            {players.map((player) => (
              <PlayerRow
                key={player.id}
                player={player}
                anexos={anexos[player.id] ?? []}
                agora={agora}
                onChanged={() => void recarregar()}
              />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PlayerRow({
  player,
  anexos,
  agora,
  onChanged,
}: {
  player: Player;
  anexos: PlayerAttachment[];
  /** Instante da leitura que trouxe este jogador. Ver a nota em `agora`. */
  agora: number;
  onChanged: () => void;
}) {
  const [rotulo, setRotulo] = useState(player.rotulo);

  const presente = agora - player.vistoEm < PRESENTE_POR_MS;

  return (
    <li className="space-y-2 rounded-md border p-3">
      <div className="flex items-start gap-2">
        <span
          className={`mt-1.5 size-2 shrink-0 rounded-full ${presente ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
          aria-label={presente ? "na mesa agora" : "não visto há um tempo"}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{player.nome}</p>
          {player.notas ? (
            // As notas do jogador são dele, mas o mestre é dono do disco: não
            // faz sentido esconder na tela o que está em texto no SQLite ao
            // lado. O que o token protege é o acesso de OUTRO jogador.
            <p className="text-muted-foreground mt-1 line-clamp-3 text-xs whitespace-pre-wrap">
              {player.notas}
            </p>
          ) : null}
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Tirar ${player.nome} da mesa`}
          onClick={() => {
            void removePlayer(player.id).then(onChanged, () =>
              toast.error("Não foi possível tirar o jogador da mesa."),
            );
          }}
        >
          <Trash2 />
        </Button>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void setPlayerLabel(player.id, rotulo).then(onChanged, () =>
            toast.error("Não foi possível salvar o apelido."),
          );
        }}
      >
        <Input
          value={rotulo}
          onChange={(event) => setRotulo(event.target.value)}
          placeholder="Teu apelido para ele"
          className="h-8 text-xs"
          maxLength={60}
        />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={rotulo.trim() === player.rotulo}
        >
          Anotar
        </Button>
      </form>

      {anexos.length > 0 ? (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Paperclip className="size-3" aria-hidden />
          {anexos.map((anexo) => anexo.arquivo).join(", ")}
        </p>
      ) : null}
    </li>
  );
}
