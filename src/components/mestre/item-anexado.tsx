"use client";

import { Package, Radio, RadioTower, X } from "lucide-react";

import { ImagemDoItem, imagemDesenhada } from "@/components/mestre/imagem-do-item";
import { abrirItem } from "@/components/mestre/acoes-do-item";
import { Button } from "@/components/ui/button";
import { useTokenDrag } from "@/hooks/use-token-drag";
import { useTransmissaoDoItem } from "@/hooks/use-transmissao-do-item";
import { fitInitialSize } from "@/lib/geometry/transform";
import { t } from "@/lib/i18n/itens";
import { useItemDaCampanha, useItens } from "@/lib/store/use-itens-store";
import { useSpotlightStore } from "@/lib/store/use-spotlight-store";
import { cn } from "@/lib/utils";

/** Usado quando a imagem do item não disse a medida dela. */
const TAMANHO_DE_RESERVA = { x: 160, y: 160 };

/** Os botões da célula, que só aparecem ao passar o mouse. */
const REVELAR =
  "opacity-0 transition-opacity group-hover/item:opacity-100 focus-visible:opacity-100";

/**
 * Um item da campanha preso a um ponto do mapa ou ao handout.
 *
 * Mesma célula das imagens ao lado dele — quadrada, botões só no hover, o de
 * transmitir fixo enquanto está no ar —, e com o NOME embaixo, que a imagem não
 * tem: uma imagem do acervo se reconhece pela cara, e um item é o nome dele. Um
 * bilhete sem imagem seria um quadrado com uma caixa desenhada.
 *
 * Os mesmos dois gestos do quadro do inventário: clicar abre o item, arrastar o
 * leva — para um personagem, que o recebe; para o mapa, que ganha a peça. Ele
 * continua preso aqui depois, como a imagem do handout continua no handout.
 *
 * O item apagado do catálogo deixa a célula com o aviso e o `X`: o ponto não
 * deveria perder a vaga sem o mestre ver por quê. O store da cena já tira o id
 * quando o item é apagado daqui do Mestre; esta é a defesa para o resto — um
 * jogador que apagou o próprio item pelo celular.
 */
export function ItemAnexado({
  itemId,
  rotuloTirar,
  onTirar,
}: {
  itemId: string;
  rotuloTirar: (nome: string) => string;
  onTirar: () => void;
}) {
  const itens = useItens();
  const item = useItemDaCampanha(itemId);
  const arrastar = useTokenDrag();
  const { noAr, alternar } = useTransmissaoDoItem(item);

  // Lendo ainda: a vaga, sem nada. Dizer "apagado" antes de o catálogo chegar
  // seria mentir por um instante a cada abertura do cartão.
  const apagado = itens !== null && !item;
  const nome = item?.nome ?? t.anexado.apagado;

  return (
    <li
      className={cn(
        "group/item bg-muted relative aspect-square overflow-hidden rounded-md border select-none",
        item && "cursor-grab active:cursor-grabbing",
        // No ar, a célula se marca sem precisar do mouse, como a da imagem.
        noAr && "ring-primary ring-2",
      )}
      title={noAr ? t.anexado.noAr(nome) : nome}
      onPointerDown={(event) => {
        if (!item) return;

        const desenhada = imagemDesenhada(event.currentTarget);
        const tamanho =
          desenhada && desenhada.largura > 0 && desenhada.altura > 0
            ? fitInitialSize(desenhada.largura, desenhada.altura)
            : TAMANHO_DE_RESERVA;

        arrastar(event, {
          fonte: { tipo: "item", itemId: item.id, url: desenhada?.url },
          largura: tamanho.x,
          altura: tamanho.y,
        });
      }}
    >
      <button
        type="button"
        disabled={!item}
        aria-label={t.anexado.abrir(nome)}
        className="focus-visible:ring-ring absolute inset-0 flex size-full cursor-[inherit] flex-col items-center justify-end p-0.5 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
        onClick={() => item && abrirItem(item)}
      >
        {item ? (
          // `cobrir`, e não `object-cover`: esta célula também mora no cartão do
          // ponto, que é desenhado dentro do palco. Ver `ImagemDoItem`.
          <ImagemDoItem
            imagem={item.imagem}
            cobrir
            classeDoIcone="absolute inset-0 m-auto size-5"
          />
        ) : (
          <Package
            className="text-muted-foreground/30 absolute inset-0 m-auto size-5"
            aria-hidden
          />
        )}

        {/* O nome numa tarja por cima da imagem, e não embaixo dela: a célula
            tem o tamanho das imagens vizinhas, e a grade não desalinha. */}
        <span
          className={cn(
            "bg-background/85 relative w-full truncate rounded-sm px-0.5 text-center text-[9px] leading-3 font-medium",
            apagado && "text-muted-foreground italic",
          )}
        >
          {item || apagado ? nome : ""}
        </span>
      </button>

      <span className="absolute inset-x-0 top-0 flex justify-between p-0.5">
        {item ? (
          <Button
            variant={noAr ? "default" : "secondary"}
            size="icon-xs"
            className={cn(!noAr && REVELAR)}
            aria-label={noAr ? t.anexado.noAr(nome) : t.anexado.transmitir(nome)}
            aria-pressed={noAr}
            // Apertar o botão não levanta a célula: sem isto, o tremor da mão
            // no clique viraria arrasto.
            onPointerDown={(event) => event.stopPropagation()}
            onClick={alternar}
          >
            {noAr ? <RadioTower /> : <Radio />}
          </Button>
        ) : (
          <span />
        )}

        <Button
          variant="secondary"
          size="icon-xs"
          className={REVELAR}
          aria-label={rotuloTirar(nome)}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            // Tirar do ar junto, pela razão da imagem do ponto: o que está na
            // TV não fica sem a origem de onde foi mandado.
            if (noAr) useSpotlightStore.getState().clear();
            onTirar();
          }}
        >
          <X />
        </Button>
      </span>
    </li>
  );
}
