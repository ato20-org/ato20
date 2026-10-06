"use client";

import { FolderX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCaminhoCurto } from "@/hooks/use-caminho-curto";
import { t } from "@/lib/i18n/mestre";
import { rico } from "@/lib/i18n/rico";
import { useCampaignStore } from "@/lib/store/use-campaign-store";
import type { CampaignInfo } from "@/lib/vault/campaign";

/**
 * A pasta da campanha sumiu do disco com a mesa aberta.
 *
 * Apagada, movida, ou num volume que foi desconectado. Antes disto o
 * aplicativo não percebia: a mesa aparecia VAZIA, como campanha nova, e a
 * primeira gravação recriava a pasta pela metade. Ver `Vault::verificar`.
 *
 * Diz o caminho inteiro, e não só o nome: nomes se repetem entre cópias, e o
 * caminho é o que o mestre vai procurar na lixeira ou no pendrive.
 *
 * "Escolher outra" volta para a porta sem fechar nada no Rust -- a TV e os
 * celulares continuam vendo a cena que está na memória, e é isso que dá tempo
 * de ir atrás da pasta.
 */
export function CampanhaPerdida({ campaign }: { campaign: CampaignInfo }) {
  const close = useCampaignStore((state) => state.close);
  const encurtar = useCaminhoCurto();

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
        <FolderX className="text-destructive size-8" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">
          {t.campanhaPerdida.titulo}
        </h1>
        <p className="text-muted-foreground text-sm">
          {rico(t.campanhaPerdida.estavaEm, {
            nome: (
              <span className="text-foreground font-medium">
                {campaign.nome}
              </span>
            ),
          })}
        </p>
        <code
          className="bg-input/30 border-border w-full truncate rounded-lg border px-3 py-2 text-left text-xs"
          title={campaign.path}
        >
          {encurtar(campaign.path)}
        </code>
        <p className="text-muted-foreground text-sm">
          {t.campanhaPerdida.explicacao}
        </p>
        <Button variant="outline" size="sm" onClick={close}>
          {t.campanhaPerdida.escolherOutra}
        </Button>
      </div>
    </div>
  );
}
