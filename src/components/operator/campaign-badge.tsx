"use client";

import { FolderOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCampaignStore } from "@/lib/store/use-campaign-store";

/**
 * A campanha aberta, no cabeçalho do Operador.
 *
 * Substitui o crachá da mesa, e com ele saíram os quatro diálogos que viviam
 * aqui: convite, código de operação, jogadores e espaço no Storage. Os dois
 * primeiros não existem mais — não há conta a mover nem cota a vigiar. Os
 * jogadores voltam quando o daemon expuser a mesa na rede.
 *
 * O que fica é o que se pergunta no meio de uma sessão: qual campanha está
 * aberta, e qual é o código que a mesa digita.
 */
export function CampaignBadge() {
  const campaign = useCampaignStore((state) => state.campaign);
  const close = useCampaignStore((state) => state.close);

  if (!campaign) return null;

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="min-w-0"
              onClick={close}
              aria-label="Trocar de campanha"
            >
              <FolderOpen />
              {/* `max-w-32` porque `truncate` só corta dentro de largura
                  definida — sem o limite, um nome longo empurra o resto da
                  barra para fora da janela. */}
              <span className="max-w-32 truncate">{campaign.nome}</span>
            </Button>
          }
        />
        <TooltipContent>
          <p className="max-w-64 break-all">{campaign.path}</p>
        </TooltipContent>
      </Tooltip>

      {/* O código fica à mão, e não atrás de um clique, porque é ditado no
          começo de toda sessão. */}
      <Tooltip>
        <TooltipTrigger
          render={
            <code className="bg-muted rounded px-1.5 py-0.5 text-xs tracking-widest">
              {campaign.codigo}
            </code>
          }
        />
        <TooltipContent>
          <p className="max-w-52">
            O código desta campanha. Ele viaja no zip, então continua o mesmo depois de importar
            noutra máquina.
          </p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
