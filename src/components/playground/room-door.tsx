"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CODE_LENGTH, useMesaStore } from "@/lib/store/use-mesa-store";

/**
 * A porta das telas de espectador.
 *
 * O código volta a existir agora que o daemon está na rede: sem ele, qualquer
 * aparelho do mesmo Wi-Fi que achasse a porta cairia na cena. Ele não é senha
 * forte — seis caracteres ditados em voz alta —, e o README diz isso com essas
 * palavras; o que ele faz é impedir a entrada por acaso.
 *
 * A conferência passa por `fetch` antes de o fluxo abrir, e não pelo próprio
 * SSE. Não é detalhe: o `EventSource` não entrega o status da resposta ao
 * JavaScript, então um código errado chegaria como `onerror` indistinguível de
 * queda de rede — e ele reconectaria em loop contra um código que nunca vai
 * passar. Ver `useMesaStore`.
 *
 * Compartilhada por Espectador e Jogador porque a pergunta é a mesma. O que muda
 * é o que vem depois, e isso é o `children`.
 */
export function RoomDoor({
  titulo,
  icone,
  children,
}: {
  titulo: string;
  icone: ReactNode;
  /** Recebe o código já conferido. */
  children: (codigo: string, nomeDaMesa: string) => ReactNode;
}) {
  const status = useMesaStore((state) => state.status);
  const codigoAceito = useMesaStore((state) => state.codigo);
  const nome = useMesaStore((state) => state.nome);
  const erro = useMesaStore((state) => state.erro);
  const boot = useMesaStore((state) => state.boot);
  const conferir = useMesaStore((state) => state.conferir);

  const [digitado, setDigitado] = useState("");

  useEffect(() => {
    void boot();
  }, [boot]);

  if (status === "aberta" && codigoAceito) {
    return <>{children(codigoAceito, nome ?? "Mesa")}</>;
  }

  // `idle` é o instante entre a montagem e a leitura da URL. Mostrar a porta
  // aqui a faria piscar antes da entrada automática pelo QR.
  if (status === "idle") {
    return (
      <main className="flex flex-1 items-center justify-center">
        <Loader2
          className="text-muted-foreground size-5 animate-spin"
          aria-label="Procurando a mesa"
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      {icone}
      <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
      <p className="text-muted-foreground text-sm">
        Digite o código que o mestre está mostrando na tela dele.
      </p>

      <form
        className="w-full space-y-3 text-left"
        onSubmit={(event) => {
          event.preventDefault();
          void conferir(digitado);
        }}
      >
        <Label htmlFor="room-code">Código da mesa</Label>
        <Input
          id="room-code"
          value={digitado}
          onChange={(event) => setDigitado(event.target.value.toUpperCase())}
          maxLength={CODE_LENGTH}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="ABC234"
          className="text-center text-lg tracking-[0.4em]"
        />

        {erro ? <p className="text-destructive text-sm">{erro}</p> : null}

        <Button
          type="submit"
          className="w-full"
          disabled={
            digitado.trim().length !== CODE_LENGTH || status === "conferindo"
          }
        >
          {status === "conferindo" ? (
            <Loader2 className="animate-spin" />
          ) : null}
          Entrar
        </Button>
      </form>
    </main>
  );
}
