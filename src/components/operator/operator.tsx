"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";

import { OperatorGate } from "@/components/operator/operator-gate";
import { OperatorShell } from "@/components/operator/operator-shell";
import { Button } from "@/components/ui/button";
import { useCampaignStore } from "@/lib/store/use-campaign-store";

/**
 * Decide entre a porta e a mesa.
 *
 * Existe separado do `OperatorShell` porque a decisão precisa acontecer antes
 * dos hooks dele — publicar cena, atalhos de teclado, carregar o board. Um
 * `if` no meio daquele componente quebraria a ordem dos hooks.
 *
 * O `?code=` da URL saiu: ele existia para escolher entre as mesas de uma
 * conta, e agora quem escolhe é o seletor de pasta.
 */
export function Operator() {
  const status = useCampaignStore((state) => state.status);
  const error = useCampaignStore((state) => state.error);
  const boot = useCampaignStore((state) => state.boot);

  useEffect(() => {
    void boot();
  }, [boot]);

  if (status === "escolhendo" || status === "sem-aplicativo") return <OperatorGate />;

  // Falha ao abrir não é campanha ausente: mostrar a porta aqui convidaria a
  // criar uma segunda campanha por cima de uma que existe e não pôde ser lida.
  if (status === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-destructive max-w-sm text-sm">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void boot()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  if (status === "idle" || status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2
          className="text-muted-foreground size-5 animate-spin"
          aria-label="Abrindo campanha"
        />
      </div>
    );
  }

  return <OperatorShell />;
}
