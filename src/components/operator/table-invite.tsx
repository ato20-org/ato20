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

type Telas = "plateia" | "assistir";

/**
 * Como a mesa entra.
 *
 * Substitui o crachá de convite que existia com o Supabase, e o problema é
 * outro: lá o link era um domínio estável e o que faltava era o código; aqui o
 * endereço é o IP desta máquina na rede local, que ninguém decora e que
 * ninguém deveria digitar num celular.
 *
 * Daí o QR. O código vai dentro dele, então o jogador aponta a câmera e cai na
 * mesa — sem digitar endereço nem código.
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
          Aponte a câmera do celular. O código já vai no QR — ninguém precisa
          digitar nada.
        </DialogDescription>

        <Tabs defaultValue="plateia" className="gap-3">
          <TabsList>
            <TabsTrigger value="plateia">Jogador</TabsTrigger>
            <TabsTrigger value="assistir">TV</TabsTrigger>
          </TabsList>

          {(["plateia", "assistir"] as Telas[]).map((tela) => (
            <TabsContent key={tela} value={tela} className="space-y-3">
              <Alvo url={`${lanUrl}/${tela}?code=${campaign.codigo}`} />
            </TabsContent>
          ))}
        </Tabs>

        <p className="text-muted-foreground border-t pt-3 text-xs">
          Vale só na mesma rede. O código não é senha forte — ele impede a
          entrada por acaso, não alguém decidido no teu Wi-Fi.
        </p>
      </DialogContent>
    </Dialog>
  );
}

/** O QR de um endereço, com o endereço legível embaixo. */
function Alvo({ url }: { url: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

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
    <div className="flex flex-col items-center gap-3">
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

      <code className="text-muted-foreground w-full text-center text-xs break-all">
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
