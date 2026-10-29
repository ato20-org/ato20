"use client";

import { create } from "zustand";

import { motivoDoErro } from "@/lib/youtube";

/** Onde o aparelho lembra dos vídeos que o YouTube recusou tocar embutidos. */
const CHAVE = "ato20:youtube:recusados";

function ler(): Record<string, number | string> {
  try {
    const valor: unknown = JSON.parse(window.localStorage.getItem(CHAVE) ?? "{}");
    return valor && typeof valor === "object" ? (valor as Record<string, number | string>) : {};
  } catch {
    return {};
  }
}

function gravar(recusados: Record<string, number | string>) {
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(recusados));
  } catch {
    // Sem onde guardar, vale até fechar a janela.
  }
}

/**
 * Os vídeos que o YouTube recusou tocar fora do site, por id, com o código.
 *
 * Para o acervo avisar na linha do som ANTES de alguém apertar play no meio da
 * sessão. O oEmbed com que o diálogo confere não vê esta trava -- a de quem
 * tem os direitos da música, que só aparece quando o player carrega --, e um
 * som que entrou antes do teste pela ponte, ou que foi bloqueado depois, só se
 * descobre tocando. Ver `testarNaPonte`.
 *
 * No aparelho, e não no `assets.json`: a trava é do vídeo, e não da campanha,
 * e a próxima tentativa de tocar descobre de novo em dois segundos. Só os
 * códigos que são do VÍDEO -- bloqueado e sumido --, e não os do lugar: sem
 * rede hoje, o mesmo vídeo toca amanhã. Esquece quando o vídeo volta a tocar.
 */
export const useYoutubeRecusadosStore = create<{
  recusados: Record<string, number | string>;
  marcar: (video: string, codigo: number | string) => void;
  esquecer: (video: string) => void;
}>((set, get) => ({
  recusados: typeof window === "undefined" ? {} : ler(),

  marcar: (video, codigo) => {
    const motivo = motivoDoErro(codigo);
    if (motivo !== "bloqueado" && motivo !== "sumiu") return;
    if (get().recusados[video] === codigo) return;

    const recusados = { ...get().recusados, [video]: codigo };
    gravar(recusados);
    set({ recusados });
  },

  esquecer: (video) => {
    if (!(video in get().recusados)) return;

    const recusados = { ...get().recusados };
    delete recusados[video];
    gravar(recusados);
    set({ recusados });
  },
}));
