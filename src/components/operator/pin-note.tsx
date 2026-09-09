"use client";

import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { Loader2, Paperclip, PinOff, Radio, RadioTower, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAssetList } from "@/hooks/use-asset-list";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { MINIATURA } from "@/lib/miniatura";
import { cn } from "@/lib/utils";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSpotlightStore } from "@/lib/store/use-spotlight-store";
import { importAssets } from "@/lib/vault/assets";
import type { MapPin } from "@/types/scene";

/**
 * A nota de um ponto de anotação: título, texto e anexos.
 *
 * Vive no cartão amarrado ao alfinete — ver `PinWindow` —, e não num painel
 * lateral nem num diálogo. O diálogo cobriria o mapa, justamente o mapa onde o
 * ponto está; um painel lateral desfaria a única coisa que dá sentido ao
 * ponto, que é a nota estar ONDE o lugar está.
 *
 * Nada aqui chega à mesa. O que sai deste cartão para a TV e para os celulares
 * é só o que o mestre transmite, um anexo por vez.
 */
export function PinNote({
  sceneId,
  pin,
  indice,
  onClose,
  onArrastar,
}: {
  sceneId: string;
  pin: MapPin;
  /** Número do alfinete no mapa, para o cartão dizer qual ponto é este. */
  indice: number;
  /** Tira a nota da tela. O ponto continua no mapa. */
  onClose: () => void;
  /** Faz do cabeçalho a alça de arrasto. */
  onArrastar?: (event: ReactPointerEvent) => void;
}) {
  const updatePin = useSceneStore((state) => state.updatePin);
  const removePin = useSceneStore((state) => state.removePin);
  const attachToPin = useSceneStore((state) => state.attachToPin);

  // O acervo entra só pelos nomes: o cartão mostra de que arquivo é cada
  // anexo, e `refresh` é o que faz um arquivo recém-importado aparecer com
  // nome em vez de "arquivo removido".
  const { assets, refresh } = useAssetList("image");

  const [importando, setImportando] = useState(false);

  /**
   * Traz arquivos de fora e os anexa.
   *
   * Chama `importAssets` direto, em vez do `importar` do `useAssetList`: aquele
   * devolve `void`, e aqui os ids dos aceitos são exatamente o que se precisa —
   * sem eles o mestre escolheria seis imagens e depois teria de encontrá-las no
   * acervo para anexar uma por uma.
   */
  async function anexarDeFora() {
    setImportando(true);

    try {
      const resultado = await importAssets("image");

      // `null` é o diálogo fechado sem escolher: não é erro e não avisa.
      if (!resultado) return;

      for (const motivo of resultado.recusados) toast.error(motivo);

      const ids = resultado.aceitos.map((asset) => asset.id);
      if (ids.length === 0) return;

      attachToPin(sceneId, pin.id, ids);
      refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao anexar.");
    } finally {
      setImportando(false);
    }
  }

  return (
    // Sem soltura de arrasto do acervo aqui, embora fosse o gesto natural para
    // anexar uma imagem que já está na campanha: o cartão vive dentro do
    // palco, e uma soltura sobre ele cairia no mesmo alvo que recebe imagem
    // solta na CENA — a imagem entraria no mapa, atrás do cartão. Por
    // enquanto anexa-se por arquivo, e uma imagem já importada é importada de
    // novo.
    <div className="space-y-3">
      {/* O cabeçalho é também a alça de arrasto. Uma barra de título separada
          duplicaria o número e o nome do ponto que já estão aqui, e o cartão
          tem 320 pixels de largura para gastar com conteúdo, não com cromo. */}
      <div
        className={cn("flex items-center gap-2", onArrastar && "cursor-move")}
        onPointerDown={onArrastar}
      >
        <span
          className="grid size-5 shrink-0 place-items-center rounded-full bg-amber-400 text-[10px] font-semibold text-amber-950 tabular-nums"
          aria-hidden
        >
          {indice}
        </span>

        <Input
          className="h-7 min-w-0 flex-1 border-0 bg-transparent px-1 text-sm font-medium shadow-none focus-visible:ring-0"
          placeholder="Sem título"
          aria-label="Título do ponto"
          value={pin.title}
          onChange={(event) => updatePin(sceneId, pin.id, { title: event.target.value })}
        />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Tirar esta nota da tela"
                onClick={onClose}
              >
                <PinOff />
              </Button>
            }
          />
          <TooltipContent>
            <p>Tira a nota da tela. O ponto continua no mapa.</p>
          </TooltipContent>
        </Tooltip>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Apagar este ponto"
          onClick={() => {
            // Fecha antes de apagar, e a ordem importa: o cartão se posiciona a
            // partir do alfinete, e apagar primeiro o deixaria um quadro sem
            // ponto de onde se ancorar.
            onClose();
            removePin(sceneId, pin.id);
          }}
        >
          <Trash2 />
        </Button>
      </div>

      <Textarea
        className="min-h-24 resize-y text-sm"
        placeholder="O que tem aqui, o que acontece, o que os jogadores não sabem."
        aria-label="Nota do ponto"
        value={pin.note}
        onChange={(event) => updatePin(sceneId, pin.id, { note: event.target.value })}
      />

      {pin.attachments.length > 0 ? (
        <ul className="space-y-1.5">
          {pin.attachments.map((assetId) => (
            <Anexo
              key={assetId}
              sceneId={sceneId}
              pinId={pin.id}
              assetId={assetId}
              nome={assets.find((asset) => asset.id === assetId)?.name}
            />
          ))}
        </ul>
      ) : null}

      <Button
        variant="secondary"
        size="sm"
        className="w-full"
        disabled={importando}
        onClick={() => void anexarDeFora()}
      >
        {importando ? <Loader2 className="animate-spin" /> : <Paperclip />}
        Anexar imagens
      </Button>

      <p className="text-muted-foreground text-[10px] leading-snug">
        Só você vê este ponto. A TV e os celulares recebem apenas o que você transmitir.
      </p>
    </div>
  );
}

/**
 * Um anexo: miniatura, nome e o botão que o joga na mesa.
 *
 * A miniatura é a imagem de verdade, reduzida, e não um ícone de arquivo:
 * numa campanha com trinta mapas o nome do arquivo raramente é o que faz
 * reconhecer qual é, e é do reconhecimento que depende transmitir o certo.
 */
function Anexo({
  sceneId,
  pinId,
  assetId,
  nome,
}: {
  sceneId: string;
  pinId: string;
  assetId: string;
  nome: string | undefined;
}) {
  const url = useAssetUrl(assetId, true);

  const detachFromPin = useSceneStore((state) => state.detachFromPin);
  const spotlight = useSpotlightStore((state) => state.spotlight);
  const transmit = useSpotlightStore((state) => state.transmit);
  const clear = useSpotlightStore((state) => state.clear);

  const noAr = spotlight?.assetId === assetId;

  return (
    <li className="bg-muted/40 flex items-center gap-2 rounded-md border p-1.5">
      {/* `h-10 w-14`: proporção de mapa, e alto o bastante para reconhecer a
          imagem sem roubar a largura do cartão. */}
      <span className="bg-background h-10 w-14 shrink-0 overflow-hidden rounded">
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

      <span className="min-w-0 flex-1 truncate text-xs" title={nome ?? assetId}>
        {nome ?? "Arquivo removido do acervo"}
      </span>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant={noAr ? "default" : "ghost"}
              size="icon-sm"
              aria-label={noAr ? "Tirar da evidência" : "Transmitir para a mesa"}
              aria-pressed={noAr}
              // Clicar de novo no que já está no ar TIRA, em vez de
              // retransmitir: o botão é o mesmo alvo, e ficar preso com uma
              // imagem cobrindo a TV enquanto se procura onde desligá-la é o
              // pior momento possível para procurar um botão.
              onClick={() => (noAr ? clear() : transmit(assetId))}
            >
              {noAr ? <RadioTower /> : <Radio />}
            </Button>
          }
        />
        <TooltipContent>
          <p className="max-w-48">
            {noAr
              ? "No ar agora. Clique para tirar."
              : "Põe esta imagem na frente de tudo, na TV e nos celulares."}
          </p>
        </TooltipContent>
      </Tooltip>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Tirar o anexo deste ponto"
        onClick={() => {
          // Tirar do ar junto: desanexar é dizer que este arquivo não pertence
          // mais a este ponto, e deixá-lo na TV depois disso separaria o que
          // está no ar de onde ele foi transmitido. O aviso do palco ainda
          // desligaria, mas o mestre teria de perceber que precisa.
          if (noAr) clear();
          detachFromPin(sceneId, pinId, assetId);
        }}
      >
        <X />
      </Button>
    </li>
  );
}
