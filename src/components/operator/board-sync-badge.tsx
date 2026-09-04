"use client";

import { CloudAlert, CloudCheck, CloudUpload } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSceneStore } from "@/lib/store/use-scene-store";

/**
 * Onde as cenas estão: só neste navegador, ou também na nuvem.
 *
 * Discreto porque o estado normal é "salvo" e ninguém precisa ser avisado do
 * normal. Mas sem indicador nenhum, o mestre que fecha o notebook não tem como
 * saber se o trabalho de hoje vai estar em casa — e descobriria abrindo a mesa
 * vazia do outro lado.
 *
 * `local` não mostra nada: é a instalação sem Supabase, onde não existe nuvem
 * para comparar.
 */
export function BoardSyncBadge() {
  const status = useSceneStore((state) => state.syncStatus);
  const error = useSceneStore((state) => state.syncError);

  if (status === "local" || status === "conflict") return null;

  if (status === "error") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="text-destructive flex items-center gap-1.5 text-xs">
              <CloudAlert className="size-3.5" />
              Sem sincronizar
            </span>
          }
        />
        <TooltipContent>
          <p className="max-w-56">
            {error} — as cenas continuam salvas neste navegador, e sobem quando a rede voltar.
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
            {status === "saving" ? (
              <CloudUpload className="size-3.5 animate-pulse" />
            ) : (
              <CloudCheck className="size-3.5" />
            )}
            <span className="hidden lg:inline">{status === "saving" ? "Salvando" : "Salvo"}</span>
          </span>
        }
      />
      <TooltipContent>
        <p className="max-w-56">
          {status === "saving"
            ? "Subindo as cenas para esta mesa."
            : "As cenas desta mesa estão na nuvem. Abrir a mesa em outra máquina traz elas."}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Conflito: as duas pontas mudaram.
 *
 * Barra e não diálogo: o mestre pode estar no meio de uma sessão, e um modal
 * bloquearia a mesa por causa de uma decisão que espera. Editar segue
 * permitido — o que para é a subida, até ele escolher.
 */
export function BoardConflictBar() {
  const status = useSceneStore((state) => state.syncStatus);
  const pullRemote = useSceneStore((state) => state.pullRemote);
  const overwriteRemote = useSceneStore((state) => state.overwriteRemote);

  if (status !== "conflict") return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
      <CloudAlert className="size-4 shrink-0 text-amber-500" aria-hidden />
      <p className="min-w-0">
        Esta mesa foi alterada em outro aparelho, e há edição daqui que ainda não subiu.
      </p>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          className="underline underline-offset-4"
          onClick={() => void pullRemote()}
        >
          Puxar de lá
        </button>
        <button
          type="button"
          className="underline underline-offset-4"
          onClick={() => void overwriteRemote()}
        >
          Manter esta
        </button>
      </div>
    </div>
  );
}
