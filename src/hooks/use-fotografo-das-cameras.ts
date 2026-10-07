"use client";

import { useEffect } from "react";

import {
  assinaturaDaFoto,
  assinaturaDoTripe,
  fotografarCamera,
  fotografarTripe,
} from "@/lib/mestre/foto-da-camera";
import { useFotosDasCamerasStore } from "@/lib/store/use-fotos-das-cameras-store";
import { useGestoStore } from "@/lib/store/use-gesto-store";
import type { Scene } from "@/types/scene";

/**
 * Quanto a cena tem de ficar parada antes de as fotos serem tiradas.
 *
 * A foto não é ao vivo: é a ÚLTIMA posição. Um token arrastado, uma câmera
 * empurrada, uma área revelada -- cada mudança recomeça a contagem, e as fotos
 * só saem quando o mestre para de mexer. Menos que isto e a foto sairia no
 * meio de uma sequência de ajustes; mais e a lista mostraria a câmera velha
 * tempo demais depois de soltar.
 */
const PARADA_MS = 800;

/** Espera o navegador ficar ocioso. Sem `requestIdleCallback`, o próximo giro. */
function ocioso(): Promise<void> {
  return new Promise((pronto) => {
    if (typeof window.requestIdleCallback === "function")
      window.requestIdleCallback(() => pronto(), { timeout: 1000 });
    else setTimeout(pronto, 0);
  });
}

/**
 * Tira as fotos das câmeras e dos tripés da cena ABERTA, quando ela para de
 * mudar.
 *
 * Só a aberta: é a única que muda. As outras ficam com a última foto, que é a
 * do último instante em que foram editadas -- "salvar a última posição". Só as
 * câmeras cuja assinatura mudou, uma de cada vez, no tempo ocioso, e nunca no
 * meio de um gesto: a foto custa pouco, mas um quadro perdido no arrasto custa
 * mais do que uma foto atrasada vale. Ver `fotografarCamera`.
 */
export function useFotografoDasCameras(scene: Scene | null | undefined): void {
  useEffect(() => {
    if (!scene) return;
    // Os recortes e os tripés, cada um com a sua foto: a do recorte vista de
    // cima, a do tripé em perspectiva. Ver `fotografarTripe`.
    const pedidos = [
      ...(scene.cameras ?? []).map((camera) => ({
        id: camera.id,
        assinatura: assinaturaDaFoto(scene, camera.viewport),
        tirar: () => fotografarCamera(scene, camera.viewport),
      })),
      ...(scene.tripes ?? []).map((tripe) => ({
        id: tripe.id,
        assinatura: assinaturaDoTripe(scene, tripe),
        tirar: () => fotografarTripe(scene, tripe),
      })),
    ];
    if (pedidos.length === 0) return;

    let cancelado = false;
    let espera: ReturnType<typeof setTimeout> | undefined;

    const fotografar = async () => {
      for (const { id, assinatura, tirar } of pedidos) {
        if (cancelado) return;
        // A mão ainda está num gesto: tenta de novo depois da parada.
        if (useGestoStore.getState().sceneId) {
          espera = setTimeout(fotografar, PARADA_MS);
          return;
        }

        const guardada = useFotosDasCamerasStore.getState().fotos[id];
        if (guardada?.assinatura === assinatura) continue;

        await ocioso();
        if (cancelado) return;
        const url = await tirar();
        if (cancelado || !url) continue;

        useFotosDasCamerasStore
          .getState()
          .guardar(id, { url, assinatura, quando: Date.now() });
      }
    };

    espera = setTimeout(fotografar, PARADA_MS);
    return () => {
      cancelado = true;
      if (espera) clearTimeout(espera);
    };
  }, [scene]);
}
