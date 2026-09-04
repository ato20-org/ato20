"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, Tv } from "lucide-react";

import { ViewerStage } from "@/components/playground/viewer-stage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRoomStore } from "@/lib/store/use-room-store";

const CODE_LENGTH = 6;

/**
 * Porta do Assistir.
 *
 * A TV pede o código da mesa pelo mesmo motivo que a Plateia: sem ele a tela
 * só conseguiria ouvir o `BroadcastChannel`, e ficaria presa à máquina do
 * Operador. Com o código, qualquer aparelho na casa serve de TV.
 *
 * É o código da mesa, o de seis caracteres — não o de operação. Assistir não
 * escreve nada, então não há o que proteger com a senha do mestre.
 */
export function ViewerShell() {
  const searchParams = useSearchParams();
  const codeFromLink = (searchParams.get("code") ?? "").trim().toUpperCase();

  const status = useRoomStore((state) => state.status);
  const room = useRoomStore((state) => state.room);
  const error = useRoomStore((state) => state.error);
  const connectAsViewer = useRoomStore((state) => state.connectAsViewer);

  const [code, setCode] = useState(codeFromLink);

  useEffect(() => {
    // O botão "Abrir Assistir" do Operador já traz o código: a TV não tem
    // teclado nem quem digite nela.
    if (codeFromLink.length === CODE_LENGTH) void connectAsViewer(codeFromLink);
  }, [codeFromLink, connectAsViewer]);

  useEffect(() => {
    if (!room) return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("code") === room.code) return;

    url.searchParams.set("code", room.code);
    // `replaceState` e não navegação do router: navegar remontaria a árvore e
    // reabriria o canal. Aqui só o endereço muda, para um F5 na TV — ou o
    // atalho salvo nela — reencontrar a mesa sem ninguém digitar nada.
    window.history.replaceState(null, "", url);
  }, [room]);

  // Sem Supabase não existe mesa nem código para pedir: a TV volta a ser uma
  // aba da máquina do Operador, falando por `BroadcastChannel`.
  if (status === "offline") return <ViewerStage roomId={null} />;

  if (status === "ready" && room) return <ViewerStage roomId={room.id} />;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <Tv className="text-muted-foreground size-8" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">Assistir</h1>
      <p className="text-muted-foreground text-sm">
        Digite o código da mesa que o mestre está mostrando na tela dele.
      </p>

      <form
        className="w-full space-y-3 text-left"
        onSubmit={(event) => {
          event.preventDefault();
          void connectAsViewer(code);
        }}
      >
        <Label htmlFor="viewer-room-code">Código da mesa</Label>
        <Input
          id="viewer-room-code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          maxLength={CODE_LENGTH}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="ABC234"
          className="text-center text-lg tracking-[0.4em]"
        />

        {status === "error" ? <p className="text-destructive text-sm">{error}</p> : null}

        <Button
          type="submit"
          className="w-full"
          disabled={code.length !== CODE_LENGTH || status === "loading"}
        >
          {status === "loading" ? <Loader2 className="animate-spin" /> : null}
          Entrar
        </Button>
      </form>

      <Button render={<Link href="/mesa" />} nativeButton={false} variant="ghost" size="sm">
        Voltar
      </Button>
    </main>
  );
}
