"use client";

import { ExternalLink } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useCampaignStore } from "@/lib/store/use-campaign-store";
import { call, daemonAddr } from "@/lib/vault/bridge";

/**
 * Abre o Espectador no navegador do sistema.
 *
 * No navegador, e não numa aba desta janela: a janela é o Mestre, e a TV é
 * uma tela de espectador. Trocar uma pela outra tiraria o mestre da mesa dele
 * no meio da sessão — e o Espectador costuma ir para um segundo monitor, que o
 * navegador sabe arrastar e a webview não.
 *
 * Vai pelo loopback, e não pelo IP da rede: quem abre daqui é o próprio mestre,
 * na própria máquina. Para a TV em outro aparelho existe o QR de "Entrar na
 * mesa", que é onde o endereço de rede faz sentido.
 *
 * Leva o código na URL porque quem clica já está olhando para ele na barra —
 * digitá-lo de novo seria trabalho que a tela já fez.
 *
 * ## Duas portas, e depois o endereço na mão
 *
 * O plugin `opener` é a primeira. Ele resolve em quase toda máquina e é o
 * caminho que o Tauri mantém; quando falha, falha por um motivo que não é
 * nosso: no Linux, "abrir no navegador" depende de um `xdg-open` instalado, e
 * numa sessão enxuta ele simplesmente não existe. Foi o que aconteceu na
 * máquina de um usuário — o botão não abria nada.
 *
 * A segunda é o `abrir_no_navegador`, no Rust, que desce a lista de abridores e
 * de navegadores pelo nome. Ver o comando: ele só aceita endereço do próprio
 * daemon.
 *
 * Falhando as duas, a tela entrega o que sobrou: o endereço, copiável, com o
 * motivo de cada porta. Colar na barra do navegador é o caminho de saída, e ele
 * nunca depende da máquina ter nada instalado.
 */
export function AbrirEspectador() {
  const codigo = useCampaignStore((state) => state.campaign?.codigo ?? null);

  async function abrir() {
    let alvo = "";

    try {
      const { url } = await daemonAddr();
      alvo = codigo ? `${url}/espectador?code=${codigo}` : `${url}/espectador`;

      try {
        await openUrl(alvo);
      } catch (recusa) {
        // Segunda porta. O motivo da primeira vai junto na exceção que sai
        // daqui quando esta também falhar: sem ele, "não abriu" some a
        // diferença entre escopo recusado e máquina sem navegador nenhum.
        try {
          await call<string>("abrir_no_navegador", { url: alvo });
        } catch (semNavegador) {
          throw new Error(
            [recusa, semNavegador]
              .map((erro) =>
                erro instanceof Error ? erro.message : String(erro),
              )
              .join(" "),
          );
        }
      }
    } catch (cause) {
      // O motivo, e não só "não deu". A primeira versão engolia a causa, e a
      // falha real — escopo do `opener` recusando o endereço — era
      // indistinguível de não haver navegador instalado.
      //
      // O endereço vai junto porque ele é copiável: se abrir falhar, colar na
      // barra do navegador é o caminho de saída, e a mensagem já entrega o que
      // colar.
      toast.error(
        cause instanceof Error
          ? cause.message
          : `Não foi possível abrir ${alvo}`,
        {
          description: alvo || undefined,
          duration: 12_000,
          action: alvo
            ? {
                label: "Copiar endereço",
                onClick: () =>
                  void navigator.clipboard.writeText(alvo).catch(() => {}),
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
      aria-label="Abrir Espectador no navegador"
      onClick={() => void abrir()}
    >
      <ExternalLink />
      <span className="hidden xl:inline">Abrir Espectador</span>
    </Button>
  );
}
