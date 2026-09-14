"use client";

import { useEffect, useState } from "react";
import { Check, Copy, QrCode, WifiOff } from "lucide-react";
import QRCode from "qrcode";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCampaignStore } from "@/lib/store/use-campaign-store";
import { daemonAddr } from "@/lib/vault/bridge";
import { cn } from "@/lib/utils";

/**
 * Como a mesa entra.
 *
 * Substitui o crachá de convite que existia com o Supabase, e o problema é
 * outro: lá o link era um domínio estável e o que faltava era o código; aqui o
 * endereço é o IP desta máquina na rede local, que ninguém decora.
 *
 * As duas abas resolvem isso de formas diferentes porque os dois aparelhos são
 * diferentes. O CELULAR tem câmera: o QR leva endereço e código de uma vez, e
 * ninguém digita nada. A TV não tem câmera — o que existe ali é um navegador e
 * um controle remoto —, então a aba dela mostra o endereço grande, para ser
 * lido do outro lado da sala e digitado. O QR que estava ali era uma imagem que
 * a TV não tem como usar.
 *
 * O código vai no endereço nos dois casos, e é por isso que não há nenhum campo
 * de código em lugar nenhum.
 */
export function TableInvite() {
  const campaign = useCampaignStore((state) => state.campaign);
  const [lanUrl, setLanUrl] = useState<string | null>(null);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    let ativo = true;

    void daemonAddr().then(
      ({ lanUrl }) => {
        if (!ativo) return;

        setLanUrl(lanUrl);
        setCarregado(true);
      },
      () => {
        if (ativo) setCarregado(true);
      },
    );

    return () => {
      ativo = false;
    };
  }, []);

  if (!campaign || !carregado) return null;

  // Sem rota de rede a mesa não alcança esta máquina, e um endereço que não
  // responde é pior que dizer o que está faltando.
  if (!lanUrl) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <WifiOff className="size-3.5" />
              Sem rede
            </span>
          }
        />
        <TooltipContent>
          <p className="max-w-52">
            Esta máquina não está numa rede local, então a TV e os celulares não
            têm como alcançá-la. Conecte o Wi-Fi ou o cabo e reabra o
            aplicativo.
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm">
            <QrCode />
            <span className="hidden lg:inline">Entrar na mesa</span>
          </Button>
        }
      />
      <DialogContent className="max-w-sm">
        <DialogTitle>Entrar na mesa</DialogTitle>
        <DialogDescription>
          O código já vai no endereço — ninguém precisa digitá-lo à parte.
        </DialogDescription>

        <Tabs defaultValue="jogador" className="min-w-0 gap-3">
          <TabsList>
            <TabsTrigger value="jogador">Jogador</TabsTrigger>
            <TabsTrigger value="espectador">TV</TabsTrigger>
          </TabsList>

          <TabsContent value="jogador" className="min-w-0 space-y-3">
            <Alvo url={`${lanUrl}/jogador?code=${campaign.codigo}`} />
          </TabsContent>

          {/* Sem QR: a TV não tem câmera para apontar para coisa nenhuma. O que
              acontece ali é alguém digitando o endereço no navegador dela, com
              um controle remoto — então o que a tela precisa dar é o endereço
              legível e inteiro, não um quadrado preto.

              E sem instrução escrita: a aba se chama TV, mostra um endereço e
              um botão de copiar. O parágrafo que havia aqui explicava o que os
              três já dizem. */}
          <TabsContent value="espectador" className="min-w-0 space-y-3">
            <Endereco
              url={`${lanUrl}/espectador?code=${campaign.codigo}`}
              grande
            />
          </TabsContent>
        </Tabs>

        <p className="text-muted-foreground border-t pt-3 text-xs">
          Vale só na mesma rede. O código não é senha forte — ele impede a
          entrada por acaso, não alguém decidido no teu Wi-Fi.
        </p>
      </DialogContent>
    </Dialog>
  );
}

/**
 * O QR de um endereço, com o endereço legível embaixo.
 *
 * Só para o CELULAR. O QR existe porque o endereço é o IP desta máquina na rede
 * local, que ninguém decora e ninguém deveria digitar num teclado de vidro — a
 * câmera resolve isso. A TV não tem câmera, e lá o mesmo quadrado seria uma
 * imagem que ninguém consegue usar; ver a aba dela.
 */
function Alvo({ url }: { url: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;

    void QRCode.toDataURL(url, {
      margin: 1,
      width: 320,
      // Claro sempre, e não seguindo o tema: quem lê é a câmera de um celular,
      // e QR invertido é o caso que mais falha em leitor.
      color: { dark: "#000000ff", light: "#ffffffff" },
    }).then(
      (gerado) => {
        if (ativo) setDataUrl(gerado);
      },
      () => {
        // Sem QR a mesa ainda entra pelo endereço escrito abaixo.
        if (ativo) setDataUrl(null);
      },
    );

    return () => {
      ativo = false;
    };
  }, [url]);

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-3">
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          alt={`QR code para ${url}`}
          className="size-48 rounded-md bg-white p-2"
        />
      ) : (
        <div className="bg-muted size-48 animate-pulse rounded-md" />
      )}

      <Endereco url={url} />
    </div>
  );
}

/**
 * O endereço escrito, e o botão de copiá-lo.
 *
 * Separado do QR porque a aba da TV usa só isto. `grande` é o tamanho de quem
 * vai LER e digitar de longe — na aba do celular o endereço é a legenda de
 * baixo do QR, e ninguém o digita.
 */
function Endereco({ url, grande }: { url: string; grande?: boolean }) {
  const [copiado, setCopiado] = useState(false);

  // `min-w-0` em cada degrau da cadeia — aqui, no `Tabs`, no `TabsContent`:
  // item de flex e de grid tem `min-width: auto`, que é o tamanho do CONTEÚDO,
  // e um endereço que não cabe empurrava a caixa para fora do diálogo em vez de
  // rolar dentro dela.
  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-2">
      <code
        className={cn(
          // `block`: `<code>` é inline, e em elemento inline `overflow` e
          // `width` não valem nada. Era o que fazia a linha vazar o diálogo.
          "block w-full min-w-0 text-center select-all",
          grande
            ? // Uma LINHA só, com rolagem lateral se não couber -- e não quebra
              // por caractere. Quebrando, "espectador" virava "assist" numa linha
              // e "ir" na outra, e quem está copiando isso para o controle da TV
              // lê dois pedaços e digita um deles errado.
              "bg-muted rolagem-limpa overflow-x-auto rounded-md px-3 py-2 text-left text-sm whitespace-nowrap"
            : "text-muted-foreground text-xs break-all",
        )}
      >
        {url}
      </code>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          void navigator.clipboard.writeText(url).then(
            () => setCopiado(true),
            // `clipboard` exige contexto seguro; em HTTP na rede local ele
            // falha, e o endereço continua legível na tela.
            () => setCopiado(false),
          );
        }}
      >
        {copiado ? <Check /> : <Copy />}
        {copiado ? "Copiado" : "Copiar endereço"}
      </Button>
    </div>
  );
}
