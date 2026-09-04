"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Smartphone, Tv, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { listKnownRooms, type KnownRoom } from "@/lib/supabase/rooms";

/** Data curta: a lista serve para reconhecer a mesa, não para auditar. */
const when = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

/** Só duas possibilidades: a RLS não mostra mesa que não seja tua ou já entrada. */
function role(room: KnownRoom): string {
  return room.mastered ? "tua mesa" : "você entrou";
}

/**
 * As mesas que este aparelho alcança: as da conta de mestre logada aqui e as
 * em que ele entrou como jogador.
 *
 * Existe porque as três telas pedem o código da mesa, e o código não fica na
 * cabeça de ninguém.
 *
 * Lista vazia e falha aparecem escritas, em vez de a seção desaparecer: a
 * ausência silenciosa é indistinguível de bug — nem quem programou consegue
 * dizer se não há mesa ou se a leitura foi recusada.
 *
 * Só a instalação sem Supabase esconde tudo, e aí não há mesa como conceito.
 */
export function KnownRooms() {
  /** `null` enquanto procura; `undefined` quando não há sessão neste aparelho. */
  const [rooms, setRooms] = useState<KnownRoom[] | null | undefined>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    void listKnownRooms().then(
      (found) => setRooms(found ?? undefined),
      (cause: unknown) => {
        setRooms([]);
        setError(cause instanceof Error ? cause.message : "Falha ao listar as mesas");
      },
    );
  }, []);

  if (!isSupabaseConfigured()) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Mesas deste aparelho
      </h2>

      {rooms === null ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Procurando…
        </p>
      ) : null}

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {rooms === undefined ? (
        <p className="text-muted-foreground max-w-prose text-sm">
          Nada por aqui ainda. Entre no Operador com tua conta de mestre, ou abra Assistir ou
          Plateia com o código que o mestre passar.
        </p>
      ) : null}

      {rooms?.length === 0 && !error ? (
        <p className="text-muted-foreground max-w-prose text-sm">
          Nenhuma mesa alcançável por este aparelho. No Operador, a conta logada cria a mesa ou
          assume uma existente com o código de operação.
        </p>
      ) : null}

      <ul className="divide-y rounded-lg border empty:hidden">
        {(rooms ?? []).map((room) => (
          <li key={room.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <code className="text-sm font-medium tracking-widest">{room.code}</code>

            <span className="text-muted-foreground text-xs">
              {role(room)} · {when.format(new Date(room.createdAt))}
            </span>

            <div className="ml-auto flex items-center gap-1">
              {/* O Operador só aparece na mesa que este navegador comanda: nas
                  outras a RLS recusaria toda escrita, e o link abriria a mesa
                  errada — a busca do Operador é presa ao `master_id`. */}
              {room.mastered ? (
                <Button
                  render={<Link href={`/operador?code=${room.code}`} />}
                  nativeButton={false}
                  variant="ghost"
                  size="sm"
                >
                  <Wand2 />
                  Operador
                </Button>
              ) : null}

              <Button
                render={<Link href={`/assistir?code=${room.code}`} />}
                nativeButton={false}
                variant="ghost"
                size="sm"
              >
                <Tv />
                Assistir
              </Button>

              <Button
                render={<Link href={`/plateia?code=${room.code}`} />}
                nativeButton={false}
                variant="ghost"
                size="sm"
              >
                <Smartphone />
                Plateia
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
