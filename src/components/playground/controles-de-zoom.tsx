"use client";

import { ZoomIn, ZoomOut } from "lucide-react";

import { temZoom, ZOOM_MAXIMO_DA_MESA, type ZoomDaMesa } from "@/lib/geometry/zoom-da-mesa";
import { t } from "@/lib/i18n/palco";
import { cn } from "@/lib/utils";

/**
 * Os botões do zoom de quem assiste: afastar, a porcentagem e aproximar. Ver
 * `useZoomDaMesa`.
 *
 * A porcentagem só aparece com zoom, e é ela o botão de voltar: o número diz
 * que a tela não está mostrando o que o mestre enquadrou, e tocar nele devolve
 * o enquadramento. Um jogador ampliado num canto do mapa é o que fazia o
 * celular não ter zoom; a saída tem de estar à vista enquanto ele durar.
 *
 * `discreto` é o da TV: apagado até o cursor chegar, como o botão de som, para
 * não ficar no canto da imagem que a mesa inteira olha.
 */
export function ControlesDeZoom({
  zoom,
  onAproximar,
  onAfastar,
  onVoltar,
  discreto = false,
  className,
}: {
  zoom: ZoomDaMesa;
  onAproximar: () => void;
  onAfastar: () => void;
  onVoltar: () => void;
  discreto?: boolean;
  className?: string;
}) {
  const ampliado = temZoom(zoom);
  const porcento = Math.round(zoom.fator * 100);

  return (
    <div
      role="group"
      aria-label={t.zoom.rotulo}
      // Fora do gesto do mapa e do toque longo do ping: tocar aqui é botão.
      data-sem-zoom
      data-sem-ping
      className={cn(
        // Alvo generoso e fundo próprio, como o botão de tela cheia: por cima de
        // mapa escuro ou claro, ícone sem contraste desaparece.
        "flex items-center overflow-hidden rounded-md bg-black/60 text-white backdrop-blur",
        discreto &&
          "opacity-40 transition-opacity hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none",
        className,
      )}
    >
      <button
        type="button"
        aria-label={t.zoom.afastar}
        disabled={!ampliado}
        onClick={onAfastar}
        className="p-2 disabled:opacity-40"
      >
        <ZoomOut className="size-4" />
      </button>

      {ampliado ? (
        <button
          type="button"
          aria-label={t.zoom.voltar(porcento)}
          onClick={onVoltar}
          className="min-w-12 px-1 py-2 text-xs font-medium tabular-nums"
        >
          {t.zoom.porcento(porcento)}
        </button>
      ) : null}

      <button
        type="button"
        aria-label={t.zoom.aproximar}
        disabled={zoom.fator >= ZOOM_MAXIMO_DA_MESA}
        onClick={onAproximar}
        className="p-2 disabled:opacity-40"
      >
        <ZoomIn className="size-4" />
      </button>
    </div>
  );
}
