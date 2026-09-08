"use client";

import { ExternalLink } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useCampaignStore } from "@/lib/store/use-campaign-store";
import { daemonAddr } from "@/lib/vault/bridge";

/**
 * Abre o Assistir no navegador do sistema.
 *
 * No navegador, e não numa aba desta janela: a janela é o Operador, e a TV é
 * uma tela de espectador. Trocar uma pela outra tiraria o mestre da mesa dele
 * no meio da sessão — e o Assistir costuma ir para um segundo monitor, que o
 * navegador sabe arrastar e a webview não.
 *
 * Vai pelo loopback, e não pelo IP da rede: quem abre daqui é o próprio mestre,
 * na própria máquina. Para a TV em outro aparelho existe o QR de "Entrar na
 * mesa", que é onde o endereço de rede faz sentido.
 *
 * Leva o código na URL porque quem clica já está olhando para ele na barra —
 * digitá-lo de novo seria trabalho que a tela já fez.
 */
export function OpenViewer() {
  const codigo = useCampaignStore((state) => state.campaign?.codigo ?? null);

  async function abrir() {
    try {
      const { url } = await daemonAddr();
      const alvo = codigo ? `${url}/assistir?code=${codigo}` : `${url}/assistir`;

      await openUrl(alvo);
    } catch {
      toast.error("Não foi possível abrir o navegador.");
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      aria-label="Abrir Assistir no navegador"
      onClick={() => void abrir()}
    >
      <ExternalLink />
      <span className="hidden xl:inline">Abrir Assistir</span>
    </Button>
  );
}
