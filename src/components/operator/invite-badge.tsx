"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Room } from "@/lib/supabase/rooms";

/**
 * Código da mesa e link de convite.
 *
 * Direto no cabeçalho, sem diálogo: passar o código é a ação mais frequente
 * da abertura de sessão, e enterrá-la atrás de um clique custava um passo em
 * algo que se faz com os jogadores esperando.
 */
export function InviteBadge({ room }: { room: Room }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;

    const timer = setTimeout(() => setCopied(false), 1500);

    return () => clearTimeout(timer);
  }, [copied]);

  async function copyInvite() {
    const invite = `${window.location.origin}/plateia?code=${room.code}`;

    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
    } catch {
      // `clipboard` exige contexto seguro; em HTTP na rede local falha.
      toast.info(invite, { description: "Copie o link manualmente." });
    }
  }

  return (
    <span className="flex items-center gap-1">
      <code className="text-sm font-medium tracking-widest">{room.code}</code>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Copiar link de convite"
              onClick={() => void copyInvite()}
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          }
        />
        <TooltipContent>
          <p className="max-w-52">
            {copied ? "Link copiado." : "Copia o link que já entra na mesa com este código."}
          </p>
        </TooltipContent>
      </Tooltip>
    </span>
  );
}
