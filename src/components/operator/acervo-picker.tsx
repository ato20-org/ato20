"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MINIATURA } from "@/lib/miniatura";
import { assetUrl, listAssets } from "@/lib/vault/assets";
import type { AssetMeta } from "@/types/scene";

/**
 * Escolher uma imagem que JÁ está no acervo.
 *
 * A `AssetLibrary` não serve para isto: ela é fonte de arrasto presa a uma
 * cena, e o que ela entrega é um objeto solto no mapa. Aqui o gesto é escolher
 * e voltar.
 *
 * Mostra TUDO que é imagem, inclusive o que tem escopo — retratos, miniaturas,
 * imagens de outros itens. A biblioteca esconde essas porque lá a pergunta é "o
 * que arrasto para o mapa"; aqui a pergunta é "que imagem este item tem", e a
 * poção que já ilustra o item de outro personagem é justamente a resposta que
 * se quer reaproveitar sem reimportar o arquivo.
 */
export function AcervoPicker({
  aberto,
  onFechar,
  onEscolher,
}: {
  aberto: boolean;
  onFechar: () => void;
  onEscolher: (assetId: string) => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>Escolher do acervo</DialogTitle>
        <DialogDescription>
          As imagens que já estão na campanha. Escolher não copia o arquivo.
        </DialogDescription>

        {/* A lista monta com o diálogo, e é o que a faz reler a cada abertura:
            o mestre pode ter importado uma imagem entre uma abertura e outra, e
            uma lista guardada o faria procurar o que acabou de pôr lá. Zerar no
            efeito daria o mesmo, com um render a mais mostrando a lista velha. */}
        {aberto ? <Imagens onEscolher={onEscolher} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Imagens({ onEscolher }: { onEscolher: (assetId: string) => void }) {
  const [imagens, setImagens] = useState<AssetMeta[] | null>(null);

  useEffect(() => {
    listAssets("image").then(setImagens, (cause: unknown) => {
      toast.error(cause instanceof Error ? cause.message : "Falha ao ler o acervo.");
      setImagens([]);
    });
  }, []);

  if (imagens === null) {
    return <p className="text-muted-foreground py-8 text-center text-xs">Lendo…</p>;
  }

  if (imagens.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-xs">
        O acervo ainda não tem imagem nenhuma.
      </p>
    );
  }

  return (
    <ScrollArea className="max-h-80">
      <div className="grid grid-cols-4 gap-2 pr-3">
        {imagens.map((asset) => (
          <Escolha key={asset.id} asset={asset} onEscolher={() => onEscolher(asset.id)} />
        ))}
      </div>
    </ScrollArea>
  );
}

function Escolha({ asset, onEscolher }: { asset: AssetMeta; onEscolher: () => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;

    void assetUrl(asset.id, "mini").then((endereco) => {
      if (ativo) setUrl(endereco);
    });

    return () => {
      ativo = false;
    };
  }, [asset.id]);

  return (
    <button
      type="button"
      onClick={onEscolher}
      title={asset.name}
      aria-label={asset.name}
      className="bg-card hover:ring-ring focus-visible:ring-ring relative aspect-square overflow-hidden rounded border hover:ring-2 focus-visible:ring-2 focus-visible:outline-none"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          draggable={false}
          className="size-full object-cover"
          {...MINIATURA}
        />
      ) : null}
    </button>
  );
}
