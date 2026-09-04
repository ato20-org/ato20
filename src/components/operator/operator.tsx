"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { OperatorGate } from "@/components/operator/operator-gate";
import { OperatorShell } from "@/components/operator/operator-shell";
import { Button } from "@/components/ui/button";
import { useRoomStore } from "@/lib/store/use-room-store";

/**
 * Decide entre a porta e a mesa.
 *
 * Existe separado do `OperatorShell` porque a decisão precisa acontecer antes
 * dos hooks dele — publicar cena, atalhos de teclado, sincronia de arquivos. Um
 * `if` no meio daquele componente quebraria a ordem dos hooks.
 */
export function Operator() {
  const searchParams = useSearchParams();
  // Qual mesa abrir, quando este navegador comanda mais de uma. Vem da lista
  // em `/mesa`; o código sozinho não dá acesso a nada, porque a busca continua
  // presa ao `master_id` desta sessão.
  const codeFromLink = (searchParams.get("code") ?? "").trim().toUpperCase();

  const status = useRoomStore((state) => state.status);
  const error = useRoomStore((state) => state.error);
  const connectAsMaster = useRoomStore((state) => state.connectAsMaster);

  useEffect(() => {
    void connectAsMaster(codeFromLink || undefined);
  }, [codeFromLink, connectAsMaster]);

  // Três telas atrás da mesma porta: sem conta, conta sem mesa, e conta com
  // várias mesas e nenhuma escolhida.
  if (status === "unauthenticated" || status === "locked" || status === "choosing") {
    return <OperatorGate />;
  }

  // Falha de rede não é mesa trancada: mostrar a porta aqui convidaria a criar
  // uma segunda mesa por cima de uma que existe e não pôde ser lida.
  if (status === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-destructive max-w-sm text-sm">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void connectAsMaster()}>
          Tentar de novo
        </Button>
        <Button render={<Link href="/mesa" />} nativeButton={false} variant="ghost" size="sm">
          Voltar
        </Button>
      </div>
    );
  }

  // `offline` cai na mesa de propósito: sem Supabase o Operador funciona local,
  // e não há conta, mesa nem senha para pedir.
  if (status === "idle" || status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin" aria-label="Abrindo mesa" />
      </div>
    );
  }

  return <OperatorShell />;
}
