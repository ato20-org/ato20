"use client";

import { ChevronDown, FolderOpen, FolderSymlink, PackageOpen } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const busy = useCampaignStore((state) => state.busy);
  const close = useCampaignStore((state) => state.close);
  const exportar = useCampaignStore((state) => state.exportar);

  if (!campaign) return null;

  function exportarCampanha() {
    void exportar().then(
      (dest) => {
        // `null` é o diálogo fechado sem escolher: não avisa nada.
        if (dest) toast.success(`Campanha exportada em ${dest}`);
      },
      () => toast.error("Não foi possível exportar a campanha."),
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="sm" className="min-w-0" disabled={busy}>
                    <FolderOpen />
                    {/* `max-w-32` porque `truncate` só corta dentro de largura
                        definida — sem o limite, um nome longo empurra o resto
                        da barra para fora da janela. */}
                    <span className="max-w-32 truncate">{campaign.nome}</span>
                    <ChevronDown className="opacity-60" />
                  </Button>
                }
              />
            }
          />
          <TooltipContent>
            <p className="max-w-64 break-all">{campaign.path}</p>
          </TooltipContent>
        </Tooltip>

        <DropdownMenuContent align="start" className="w-64">
          {/* Um item, e leva tudo. Havia dois — com e sem as fichas dos
              jogadores —, e a escolha cobrava uma decisão em todo export por um
              caso raro: quem exporta está quase sempre levando a campanha para
              outra máquina, e ali "tudo" é a única resposta certa. */}
          <DropdownMenuItem onClick={exportarCampanha}>
            <PackageOpen />
            Exportar campanha
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={close}>
            <FolderSymlink />
            Trocar de campanha
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
