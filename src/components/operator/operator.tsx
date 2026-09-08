"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";

import { WindowChrome } from "@/components/desktop/window-chrome";
import { CampaignBadge } from "@/components/operator/campaign-badge";
import { OperatorGate } from "@/components/operator/operator-gate";
import { OperatorShell } from "@/components/operator/operator-shell";
import { Button } from "@/components/ui/button";
import { useCampaignStore } from "@/lib/store/use-campaign-store";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";

/**
 * Decide entre a porta e a mesa.
 *
 * Existe separado do `OperatorShell` porque a decisão precisa acontecer antes
 * dos hooks dele — publicar cena, atalhos de teclado, carregar o board. Um
 * `if` no meio daquele componente quebraria a ordem dos hooks.
 *
 * É também onde a barra da janela é montada, e não no layout da aplicação. O
 * layout serve as três telas, e duas delas rodam no navegador de um celular:
 * montar a barra lá arrastaria o store de cenas — com histórico, operações de
 * board e ordenação de camadas — para o bundle da Plateia, que não usa nada
 * disso. O aplicativo só abre esta rota, então este é o lugar certo.
 */
export function Operator() {
  const status = useCampaignStore((state) => state.status);
  const error = useCampaignStore((state) => state.error);
  const boot = useCampaignStore((state) => state.boot);

  // A cena em edição vira o subtítulo da janela. `undefined` na porta, onde
  // ainda não há campanha aberta — e aí a barra mostra só o nome.
  const editando = useSceneStore(selectEditingScene)?.name;

  useEffect(() => {
    void boot();
  }, [boot]);

  return (
    <>
      <WindowChrome
        // A campanha na ponta esquerda, junto do nome: ela é o que a janela é,
        // e não um controle de gesto que dispute espaço com a barra de
        // ferramentas.
        inicio={status === "ready" ? <CampaignBadge /> : undefined}
        subtitulo={status === "ready" ? editando : undefined}
      />
      <Conteudo status={status} error={error} onRetry={boot} />
    </>
  );
}

/**
 * O corpo, separado da barra.
 *
 * Componente, e não quatro saídas antecipadas no `Operator`: cada uma teria de
 * repetir a barra da janela, e esquecer numa delas deixaria a janela sem como
 * fechar justamente numa tela de erro.
 */
function Conteudo({
  status,
  error,
  onRetry,
}: {
  status: ReturnType<typeof useCampaignStore.getState>["status"];
  error: string | null;
  onRetry: () => void;
}) {
  if (status === "escolhendo" || status === "sem-aplicativo") return <OperatorGate />;

  // Falha ao abrir não é campanha ausente: mostrar a porta aqui convidaria a
  // criar uma segunda campanha por cima de uma que existe e não pôde ser lida.
  if (status === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-destructive max-w-sm text-sm">{error}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
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
