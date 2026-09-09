"use client";

import { RadioTower, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAssetList } from "@/hooks/use-asset-list";
import { useSpotlightUrl } from "@/hooks/use-spotlight-url";
import { MINIATURA } from "@/lib/miniatura";
import { useSpotlightStore } from "@/lib/store/use-spotlight-store";

/**
 * O que está em evidência na mesa, visto do lado do mestre.
 *
 * Existe porque a evidência é a única coisa que o mestre manda para a mesa
 * sem vê-la na própria tela. A cena ele edita, os retratos ele posiciona, a
 * trilha tem a barra de baixo — mas a imagem transmitida cobre a TV e os
 * celulares enquanto o palco do Operador continua mostrando o mapa. Sem este
 * aviso, esquecer uma imagem no ar seria o estado mais fácil de alcançar e o
 * mais difícil de perceber.
 *
 * Não abre a imagem grande aqui: o mestre está trabalhando no mapa embaixo, e
 * cobrir o palco dele para mostrar o que já mandou seria pagar o preço da
 * evidência duas vezes.
 *
 * Fica no alto do palco, e não no cabeçalho: o cabeçalho já estava cheio, e
 * isto é sobre o que a mesa vê — o mesmo assunto dos controles que moram no
 * palco.
 */
export function SpotlightChip() {
  const spotlight = useSpotlightStore((state) => state.spotlight);
  const clear = useSpotlightStore((state) => state.clear);

  const url = useSpotlightUrl(spotlight);
  // O nome do arquivo, que é o que este aviso tem para identificar a imagem.
  // O título do ponto de origem seria mais descritivo, mas ele não viaja mais:
  // ver a nota em `Spotlight`.
  const { assets } = useAssetList("image");
  // Anexo de jogador não está no acervo, então não há lista onde procurar o
  // nome dele: quem o guarda é o store, do lado do mestre.
  const origem = useSpotlightStore((state) => state.origem);

  if (!spotlight) return null;

  const nome = origem ?? assets.find((asset) => asset.id === spotlight.assetId)?.name;

  return (
    <div className="bg-background/90 pointer-events-auto absolute top-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg border py-1 pr-1 pl-2 shadow-sm backdrop-blur">
      <RadioTower className="size-3.5 shrink-0 text-amber-500" aria-hidden />

      <span className="text-[11px] font-medium">Em evidência na mesa</span>

      {/* A miniatura responde "qual imagem?" sem obrigar a abrir o ponto de
          onde ela saiu — que é a pergunta de quem transmitiu três coisas na
          última meia hora. */}
      <span className="bg-muted h-6 w-9 shrink-0 overflow-hidden rounded">
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
      </span>

      <span className="text-muted-foreground max-w-40 truncate text-[11px]">
        {nome ?? "imagem"}
      </span>

      <Button variant="ghost" size="icon-sm" aria-label="Tirar da evidência" onClick={clear}>
        <X />
      </Button>
    </div>
  );
}
