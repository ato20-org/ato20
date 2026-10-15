"use client";

import { useState } from "react";
import type * as React from "react";
import {
  ChevronDown,
  FileDown,
  FileUp,
  FolderSymlink,
  PackageOpen,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";

import { CapaDaCampanha } from "@/components/mestre/capa-da-campanha";
import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { comum } from "@/lib/i18n/comum";
import { t } from "@/lib/i18n/mestre";
import { usePacoteStore } from "@/lib/store/use-pacote-store";
import { useCampaignStore } from "@/lib/store/use-campaign-store";

/**
 * A campanha aberta, na barra da janela.
 *
 * Mora ali, e não no cabeçalho do Mestre, porque é o que a janela É: qual
 * pasta está aberta não muda durante o trabalho, e uma informação estável
 * disputando espaço com controles de gesto era parte do que deixava a barra de
 * ferramentas pesada.
 *
 * Compacto de propósito — a barra tem 32px de altura. Botão de 24px e texto
 * `text-xs`, sem ícone de pasta antes do nome: o contexto já diz que é pasta.
 */
export function CampaignBadge({ children }: { children?: React.ReactNode }) {
  const campaign = useCampaignStore((state) => state.campaign);
  const busy = useCampaignStore((state) => state.busy);
  const close = useCampaignStore((state) => state.close);
  const exportar = useCampaignStore((state) => state.exportar);

  /**
   * Controlado só para o submenu da capa não existir com o menu fechado.
   *
   * Ele assina a lista de cenas, e a barra de título não pode redesenhar a
   * cada mutação do board. Ver `CapaDaCampanha`.
   */
  const [aberto, setAberto] = useState(false);

  /**
   * Fora do menu, e não um gatilho dentro dele: o item fecha o menu ao ser
   * clicado, e o diálogo precisa sobreviver a esse fechamento.
   */
  const [trocando, setTrocando] = useState(false);

  const abrirJanela = useAbrirJanela();

  if (!campaign) return null;

  function exportarCampanha() {
    void exportar().then(
      (dest) => {
        // `null` é o diálogo fechado sem escolher: não avisa nada.
        if (dest) toast.success(t.campanha.exportadaEm(dest));
      },
      () => toast.error(t.campanha.exportarFalhou),
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <DropdownMenu open={aberto} onOpenChange={setAberto}>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    // `h-6` e `px-1.5`: os botões de barra de título são mais
                    // baixos que os do corpo, senão a faixa parece uma segunda
                    // barra de ferramentas.
                    className="h-6 min-w-0 gap-1 px-1.5 text-xs font-normal"
                    disabled={busy}
                  >
                    <span className="max-w-40 truncate">{campaign.nome}</span>
                    <ChevronDown className="size-3 opacity-60" />
                  </Button>
                }
              />
            }
          />
          <TooltipContent>
            <p className="max-w-64 break-all">{campaign.path}</p>
          </TooltipContent>
        </Tooltip>

        <DropdownMenuContent align="start" className="w-56">
          {aberto ? <CapaDaCampanha /> : null}

          {/* Logo abaixo da capa, e antes do separador: as duas são o que se
              ajusta NA campanha, e o que vem depois do traço é o que se faz
              COM ela -- exportar, trocar. */}
          <DropdownMenuItem
            onClick={() => abrirJanela({ tipo: "configuracao" })}
          >
            <SlidersHorizontal />
            {t.campanha.configuracao}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={exportarCampanha}>
            <PackageOpen />
            {t.campanha.exportar}
          </DropdownMenuItem>
          {/* Partes da campanha, num pacote que outra campanha importa. Ver
              `vault/pacote.rs`. */}
          <DropdownMenuItem onClick={() => usePacoteStore.getState().abrirExportar()}>
            <FileUp />
            {t.pacote.exportarItem}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void usePacoteStore.getState().escolherPacote()}>
            <FileDown />
            {t.pacote.importarItem}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => setTrocando(true)}>
            <FolderSymlink />
            {t.campanha.trocar}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={trocando} onOpenChange={setTrocando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.campanha.fecharTitulo(campaign.nome)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.campanha.fecharExplicacao}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>{comum.cancelar}</AlertDialogCancel>
            <AlertDialogAction onClick={close}>
              {t.campanha.fechar}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Entre o nome e o código: é onde entra o que quem chama quiser pôr no
          meio do bloco da campanha. O código fica na ponta de propósito -- ele
          é o que se dita em voz alta, e uma sequência de seis caracteres no meio
          de dois controles se acha mais devagar do que no fim da fileira. */}
      {children}

      {/* O código fica à mão, e não atrás de um clique, porque é ditado no
          começo de toda sessão. São seis caracteres. */}
      <Tooltip>
        <TooltipTrigger
          render={
            <code className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] tracking-widest">
              {campaign.codigo}
            </code>
          }
        />
        <TooltipContent>
          <p className="max-w-52">{t.campanha.codigoAjuda}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
