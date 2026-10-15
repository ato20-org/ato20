"use client";

import { useMemo, useState } from "react";
import {
  ChevronRight,
  Flame,
  Plus,
  RotateCcw,
  SkipForward,
  Swords,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCharacters } from "@/hooks/use-characters";
import {
  participanteAtivo,
  participantesOrdenados,
} from "@/lib/combate/iniciativa";
import { novoId } from "@/lib/id";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import { useIniciativaStore } from "@/lib/store/use-iniciativa-store";
import { cn } from "@/lib/utils";

export function IniciativaBody() {
  const estado = useIniciativaStore((state) => state.estado);
  const avancarTurno = useIniciativaStore((state) => state.avancarTurno);
  const voltarTurno = useIniciativaStore((state) => state.voltarTurno);
  const adicionarParticipante = useIniciativaStore(
    (state) => state.adicionarParticipante,
  );
  const removerParticipante = useIniciativaStore(
    (state) => state.removerParticipante,
  );
  const atualizarIniciativa = useIniciativaStore(
    (state) => state.atualizarIniciativa,
  );
  const puxarTokensDaCena = useIniciativaStore(
    (state) => state.puxarTokensDaCena,
  );
  const encerrar = useIniciativaStore((state) => state.encerrar);
  // Derivados do `estado`, e não lidos do store por seletor: `ordenados()`
  // monta uma lista nova a cada chamada, e um seletor que nunca devolve o mesmo
  // valor faz o zustand renderizar de novo para sempre.
  const ordenados = useMemo(() => participantesOrdenados(estado), [estado]);
  const ativo = useMemo(() => participanteAtivo(estado), [estado]);

  const cena = useSceneStore(selectEditingScene);
  const { personagens } = useCharacters();

  const [novoNome, setNovoNome] = useState("");
  const [novaInic, setNovaInic] = useState("");

  function handleAdicionar() {
    const nome = novoNome.trim();
    if (!nome) return;
    const valor = parseInt(novaInic, 10);
    const iniciativa = Number.isFinite(valor)
      ? valor
      : Math.floor(Math.random() * 20) + 1;

    adicionarParticipante({
      id: novoId(),
      nome,
      iniciativa,
    });

    setNovoNome("");
    setNovaInic("");
  }

  function handlePuxarTokens() {
    if (!cena || !cena.items || cena.items.length === 0) {
      toast.error("Nenhum token encontrado na cena ativa.");
      return;
    }

    puxarTokensDaCena(cena.items, (personagemId, itemId) => {
      if (personagemId && personagens) {
        const p = personagens.find((item) => item.id === personagemId);
        if (p?.nome) return p.nome;
      }
      return itemId ? `Token ${itemId.slice(0, 4)}` : "Combatente";
    });

    toast.success("Tokens da cena adicionados à iniciativa!");
  }

  const emCombate = estado.rodada > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Topo / Barra de Rodada e Ações */}
      <div className="p-3 border-b bg-muted/30 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Swords className="size-5 text-amber-500" />
          <div>
            <span className="font-bold text-sm">
              {emCombate ? `Rodada ${estado.rodada}` : "Combate Inativo"}
            </span>
            {emCombate && ativo && (
              <p className="text-xs text-muted-foreground truncate max-w-[140px]">
                Turno: <strong className="text-foreground">{ativo.nome}</strong>
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {emCombate ? (
            <>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={voltarTurno}
                title="Voltar turno"
              >
                <RotateCcw className="size-3.5" />
              </Button>
              <Button
                size="sm"
                className="h-8 gap-1.5 px-3"
                onClick={avancarTurno}
              >
                <span>Próximo</span>
                <SkipForward className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-destructive hover:bg-destructive/10"
                onClick={encerrar}
                title="Encerrar combate"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={handlePuxarTokens}
            >
              <Users className="size-3.5" />
              Puxar Tokens
            </Button>
          )}
        </div>
      </div>

      {/* Lista de Combatentes */}
      <ScrollArea className="flex-1 p-2">
        {ordenados.length === 0 ? (
          <div className="py-8 px-4 text-center text-xs text-muted-foreground space-y-3">
            <p>Nenhum combatente na iniciativa.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePuxarTokens}
              className="gap-2 mx-auto"
            >
              <Users className="size-3.5" />
              Puxar tokens do mapa
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {ordenados.map((p, idx) => {
              const estaAtivo = emCombate && ativo?.id === p.id;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-lg border text-sm transition-all",
                    estaAtivo
                      ? "bg-primary/10 border-primary shadow-sm"
                      : "bg-card hover:bg-accent/40",
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono text-muted-foreground w-4 text-center">
                      {idx + 1}
                    </span>

                    {estaAtivo ? (
                      <Flame className="size-4 text-amber-500 animate-pulse shrink-0" />
                    ) : (
                      <ChevronRight className="size-4 text-muted-foreground/40 shrink-0" />
                    )}

                    <span
                      className={cn(
                        "truncate font-medium",
                        estaAtivo && "text-primary font-bold",
                      )}
                    >
                      {p.nome}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <input
                      type="number"
                      value={p.iniciativa}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (Number.isFinite(val)) {
                          atualizarIniciativa(p.id, val);
                        }
                      }}
                      className="w-12 h-7 text-center text-xs font-bold font-mono rounded border bg-background"
                      title="Valor de iniciativa"
                    />

                    <button
                      type="button"
                      onClick={() => removerParticipante(p.id)}
                      className="size-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Remover combatente"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Formulário Rápido de Adição */}
      <div className="p-2 border-t bg-muted/20 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAdicionar();
          }}
          className="flex items-center gap-1.5"
        >
          <Input
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            placeholder="Nome do combatente..."
            className="h-8 text-xs flex-1"
          />
          <Input
            type="number"
            value={novaInic}
            onChange={(e) => setNovaInic(e.target.value)}
            placeholder="Inic (d20)"
            className="h-8 w-16 text-xs text-center font-mono"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!novoNome.trim()}
            className="h-8 size-8 p-0 shrink-0"
            title="Adicionar à iniciativa"
          >
            <Plus className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
