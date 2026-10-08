"use client";

import { useLayoutEffect, useRef } from "react";

import { useAssetUrl } from "@/hooks/use-asset-url";
import type { CameraAssinavel } from "@/lib/geometry/camera-orbital";
import { ceuNaTela } from "@/lib/geometry/panorama-do-ceu";
import type { Variante } from "@/lib/vault/assets";

/**
 * O céu da cena de esguelha: o panorama atrás do chão deitado, andando com a
 * câmera. Ver `Scene.ceuAssetId` e `ceuNaTela`.
 *
 * Um `div` do tamanho da caixa da câmera -- a tela no Mestre, o plano na TV --,
 * com a imagem de fundo repetida na horizontal. Nada maior que a caixa: um
 * panorama na escala da lente tem oito mil pixels de largura, e um filho desse
 * tamanho inflaria a camada composta (ver `debug-do-palco` §3). O que anda é a
 * POSIÇÃO do fundo, escrita a cada aviso da câmera, sem React, como o chão.
 *
 * E só quando muda. O céu está longe: andar e aproximar não o mexem -- só girar,
 * inclinar e trocar de lente --, e a escrita que não muda nada não repinta.
 *
 * A rolagem do tripé gira a camada inteira. Os cantos que sobram nesse caso
 * mostram a cor do vazio por trás: aumentar a camada para cobri-los seria o
 * transbordo de novo, e câmera rolada é o raro.
 */
export function CeuPanoramico({
  assetId,
  variante,
  camera,
}: {
  assetId: string;
  /** O tamanho do arquivo. Ausente = `palco`, o da TV e do Mestre. */
  variante?: Variante;
  camera: CameraAssinavel;
}) {
  const url = useAssetUrl(assetId, variante ?? "palco");
  const no = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const elemento = no.current;
    if (!elemento) return;

    let anterior = "";
    function escrever() {
      const vista = camera.olho?.() ?? null;
      if (!vista || !elemento) {
        elemento?.style.setProperty("visibility", "hidden");
        anterior = "";
        return;
      }

      const ceu = ceuNaTela(vista.tripe, vista.tela);
      const chave = `${ceu.largura.toFixed(1)},${ceu.x.toFixed(1)},${ceu.y.toFixed(1)},${ceu.rolagem}`;
      if (chave === anterior) return;
      anterior = chave;

      elemento.style.visibility = "";
      elemento.style.backgroundSize = `${ceu.largura}px ${ceu.altura}px`;
      elemento.style.backgroundPosition = `${ceu.x}px ${ceu.y}px`;
      elemento.style.transform = ceu.rolagem ? `rotate(${ceu.rolagem}deg)` : "";
    }

    escrever();
    return camera.assinar(escrever);
  }, [camera]);

  return (
    <div
      ref={no}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        // Vazio enquanto o daemon não responde: aparece a cor do vazio.
        backgroundImage: url ? `url(${url})` : undefined,
        backgroundRepeat: "repeat-x",
      }}
    />
  );
}
