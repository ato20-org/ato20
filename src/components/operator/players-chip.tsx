"use client";

import { useMemo, useState } from "react";
import { Loader2, Search, Users } from "lucide-react";

import { PlayerDialog } from "@/components/operator/player-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCharacterNames } from "@/hooks/use-character-names";
import { presente as estaPresente, usePlayers } from "@/hooks/use-players";
import { cn } from "@/lib/utils";

/** Passo da sondagem com a lista aberta, e com ela fechada. Ver `usePlayers`. */
const ABERTO_MS = 5_000;
const FECHADO_MS = 30_000;

/** Sem acento e sem caixa: "Álvaro" tem de ser achável digitando "alvaro". */
function normaliza(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Quem está na mesa, no canto do palco.
 *
 * Saiu do cabeçalho: lá ele era um alvo de largura variável no meio da barra da
 * sessão, e a contagem — a única coisa que o mestre olha sem querer abrir nada
 * — não aparecia. Aqui é a mesma pílula das ferramentas, do zoom e do índice de
 * pontos, com o número ao lado do ícone.
 *
 * A lista vem por IPC: o mestre não passa pelas rotas do daemon, porque o
 * aplicativo é ele. Substitui o diálogo que lia a tabela `players` do Supabase,
 * e o que garantia ali que a ficha de um não vazava para o outro era a RLS —
 * agora é o token de cada jogador, e o mestre vê tudo por ser dono do disco.
 *
 * Só nomes aqui. Notas e arquivos são de UM jogador, e mostrá-los na lista
 * obrigava a carregar os anexos de todos a cada sondagem — ver `PlayerDialog`.
 */
export function PlayersChip() {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [escolhido, setEscolhido] = useState<string | null>(null);

  const { players, loaded, agora, recarregar } = usePlayers(aberto ? ABERTO_MS : FECHADO_MS);

  /** Qual personagem cada jogador tem. Substituiu o apelido — ver o hook. */
  const nomes = useCharacterNames();

  const total = players.length;
  const presentes = players.filter((player) => estaPresente(player, agora)).length;

  const achados = useMemo(() => {
    const termo = normaliza(busca.trim());
    if (!termo) return players;

    // No nome E no personagem: numa mesa em que todos se chamam pelo nome do
    // personagem, é por ele que o mestre lembra de metade da sala.
    return players.filter(
      (player) =>
        normaliza(player.nome).includes(termo) ||
        // Era a busca pelo apelido; agora o texto vem do vínculo em vez de ter
        // sido digitado à mão.
        (nomes.get(player.id) ?? []).some((nome) => normaliza(nome).includes(termo)),
    );
  }, [players, busca, nomes]);

  // Pelo id, e não guardando o objeto: a sondagem troca as instâncias a cada
  // cinco segundos, e um objeto guardado deixaria a ficha aberta congelada na
  // leitura de quando ela abriu.
  const jogador = players.find((player) => player.id === escolhido) ?? null;

  return (
    <>
      <Popover open={aberto} onOpenChange={setAberto}>
        <div className="bg-background/85 pointer-events-auto flex items-center gap-0.5 rounded-lg border p-1 backdrop-blur">
          <Tooltip>
            <TooltipTrigger
              render={
                <PopoverTrigger
                  render={
                    <Button
                      variant={aberto ? "secondary" : "ghost"}
                      size="icon-sm"
                      // Largura própria quando há gente: o número ao lado do
                      // ícone é o que responde "quantos entraram?" sem abrir
                      // nada. Mesma pílula do índice de pontos.
                      className={cn(total > 0 && "w-auto gap-1 px-2")}
                      aria-label={`Jogadores (${total})`}
                    >
                      <Users />
                      {total > 0 ? <span className="text-xs tabular-nums">{total}</span> : null}
                    </Button>
                  }
                />
              }
            />
            <TooltipContent>
              <p className="font-medium">Jogadores</p>
              <p className="text-muted-foreground max-w-48">
                {total === 0
                  ? "Ninguém entrou pela Plateia ainda."
                  : `${presentes} de ${total} na mesa agora. Escolha um para ver arquivos e notas.`}
              </p>
            </TooltipContent>
          </Tooltip>
        </div>

        <PopoverContent className="w-72 p-0" side="bottom" align="end">
          {!loaded ? (
            <div className="grid h-20 place-items-center">
              <Loader2
                className="text-muted-foreground size-4 animate-spin"
                aria-label="Carregando"
              />
            </div>
          ) : total === 0 ? (
            <p className="text-muted-foreground p-3 text-xs leading-snug">
              Ninguém entrou ainda. Mostre o QR de &quot;Entrar na mesa&quot; e peça para abrirem a
              aba Personagem.
            </p>
          ) : (
            <>
              {/* Sempre, e não só a partir de um punhado de nomes: com o
                  campo aparecendo e desaparecendo conforme a mesa enche, o
                  mestre não pode contar com ele — e é justamente digitar sem
                  olhar que ele quer. O foco cai aqui na abertura, então
                  qualquer tamanho de mesa se navega pelo teclado. */}
              <div className="relative border-b">
                <Search
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
                  aria-hidden
                />
                <Input
                  autoFocus
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  placeholder="Buscar por nome ou apelido"
                  aria-label="Buscar jogador"
                  className="h-9 border-0 pl-8 text-sm shadow-none focus-visible:ring-0"
                />
              </div>

              {achados.length === 0 ? (
                <p className="text-muted-foreground p-3 text-xs">Ninguém com esse nome.</p>
              ) : (
                // Teto de altura: numa mesa grande a lista cobriria o mapa.
                <ScrollArea className="max-h-64">
                  <ul className="p-1">
                    {achados.map((player) => (
                      <li key={player.id}>
                        <button
                          type="button"
                          className="hover:bg-accent flex w-full items-center gap-2 rounded-md p-1.5 text-left"
                          onClick={() => {
                            setAberto(false);
                            setEscolhido(player.id);
                          }}
                        >
                          <span
                            className={`size-2 shrink-0 rounded-full ${estaPresente(player, agora) ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                            aria-label={
                              estaPresente(player, agora)
                                ? "na mesa agora"
                                : "não visto há um tempo"
                            }
                          />

                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium">
                              {player.nome}
                            </span>
                            {/* O personagem embaixo do nome, não no lugar
                                dele: na hora de falar com a pessoa o que vale é
                                o nome que ela escolheu.

                                Aqui havia o apelido que o mestre digitava, e o
                                que ele digitava era quase sempre isto. Agora sai
                                do vínculo — acompanha quando o personagem troca
                                de mãos, e não vira mentira quando o mestre
                                esquece de atualizar. */}
                            {(nomes.get(player.id) ?? []).length > 0 ? (
                              <span className="text-muted-foreground block truncate text-[10px]">
                                {(nomes.get(player.id) ?? []).join(", ")}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </>
          )}
        </PopoverContent>
      </Popover>

      <PlayerDialog
        player={jogador}
        presente={jogador ? estaPresente(jogador, agora) : false}
        // Devolve a lista: a ficha é um passo dentro dela, e fechar para o
        // palco vazio obrigaria a reabrir o canto para ver o próximo jogador.
        onVoltar={() => {
          setEscolhido(null);
          setAberto(true);
        }}
        onChanged={() => void recarregar()}
      />
    </>
  );
}
