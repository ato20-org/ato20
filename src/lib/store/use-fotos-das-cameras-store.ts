"use client";

import { create } from "zustand";

/** Uma foto guardada: a imagem, o que ela mostra, e quando foi tirada. */
export type FotoDaCamera = {
  /** `data:image/jpeg;base64,...`. Ver `fotografarCamera`. */
  url: string;
  /** Ver `assinaturaDaFoto`: mudou, a foto está velha. */
  assinatura: string;
  /** `Date.now()` de quando foi tirada. É por ela que as antigas saem. */
  quando: number;
};

/**
 * Quantas fotos o cache guarda. Uma foto tem uns 4 a 8 KB em base64, e 300
 * delas cabem com folga no `localStorage` -- uma campanha grande inteira, com
 * várias câmeras por mapa. Passou disso, saem as mais antigas: a câmera de um
 * mapa que ninguém abre há meses tira a foto de novo no dia em que abrirem.
 */
export const TETO_DE_FOTOS = 300;

const CHAVE = "ato20:fotos-das-cameras";

/** As fotos que ficam, quando passam do teto: as mais recentes. */
export function dentroDoTeto(
  fotos: Readonly<Record<string, FotoDaCamera>>,
  teto = TETO_DE_FOTOS,
): Record<string, FotoDaCamera> {
  const todas = Object.entries(fotos);
  if (todas.length <= teto) return { ...fotos };

  return Object.fromEntries(
    todas.sort(([, a], [, b]) => b.quando - a.quando).slice(0, teto),
  );
}

function lerDoDisco(): Record<string, FotoDaCamera> {
  try {
    const cru = window.localStorage.getItem(CHAVE);
    return cru ? (JSON.parse(cru) as Record<string, FotoDaCamera>) : {};
  } catch {
    // Janela privada, armazenamento bloqueado ou um JSON quebrado: o cache
    // começa vazio, e as fotos se refazem ao abrir cada cena.
    return {};
  }
}

function gravarNoDisco(fotos: Record<string, FotoDaCamera>) {
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(fotos));
  } catch {
    // Cheio ou bloqueado: as fotos valem nesta sessão, e só não voltam depois.
  }
}

type FotosDasCamerasStore = {
  /** Por id de câmera, que é único entre campanhas: um uuid. */
  fotos: Record<string, FotoDaCamera>;
  guardar: (cameraId: string, foto: FotoDaCamera) => void;
};

/**
 * As fotos das câmeras: o cache desta máquina.
 *
 * Fora da cena de propósito: a foto é DERIVADA -- sai dos dados que a cena já
 * tem --, e gravá-la ali reescreveria o arquivo da cena a cada token que anda,
 * entraria no Ctrl+Z e atravessaria o canal. Aqui ela é do navegador desta
 * máquina, como o tamanho da faixa de câmeras. Abrindo a campanha em outra
 * máquina, as fotos se refazem ao abrir cada cena.
 */
export const useFotosDasCamerasStore = create<FotosDasCamerasStore>((set) => ({
  fotos: typeof window === "undefined" ? {} : lerDoDisco(),
  guardar: (cameraId, foto) =>
    set((estado) => {
      const fotos = dentroDoTeto({ ...estado.fotos, [cameraId]: foto });
      gravarNoDisco(fotos);
      return { fotos };
    }),
}));
