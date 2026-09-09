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
    let alvo = "";

    try {
      const { url } = await daemonAddr();
      alvo = codigo ? `${url}/assistir?code=${codigo}` : `${url}/assistir`;

      await openUrl(alvo);
    } catch (cause) {
      // O motivo, e não só "não deu". A primeira versão engolia a causa, e a
      // falha real — escopo do `opener` recusando o endereço — era
      // indistinguível de não haver navegador instalado.
      //
      // O endereço vai junto porque ele é copiável: se abrir falhar, colar na
      // barra do navegador é o caminho de saída, e a mensagem já entrega o que
      // colar.
      toast.error(
        cause instanceof Error ? cause.message : `Não foi possível abrir ${alvo}`,
        {
          description: alvo || undefined,
          duration: 12_000,
          action: alvo
            ? {
                label: "Copiar endereço",
                onClick: () => void navigator.clipboard.writeText(alvo).catch(() => {}),
              }
            : undefined,
        },
      );
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
