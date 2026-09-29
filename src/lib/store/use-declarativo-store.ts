"use client";

import { create } from "zustand";

import type { Extensao } from "@/lib/extensoes/manifesto";
import { urlDaExtensao } from "@/lib/extensoes/manifesto";
import { lerModeloSvg } from "@/lib/extensoes/svg-modelo";
import type { Declarativo, EstiloDeMedidorPublicado } from "@/lib/sync/declarativo";
import { daemonAddr } from "@/lib/vault/bridge";

/**
 * O que os plugins declaram para a mesa, do lado do Mestre.
 *
 * Lê os `.svg` das extensões habilitadas, filtra cada um para a árvore que a
 * TV sabe desenhar (`svg-modelo.ts`) e publica o conjunto no daemon por
 * `/sala/declarativo`. A `versao` sobe a cada mudança, e é ela que viaja no
 * quadro de 10 Hz -- um número --, para quem assiste buscar o conjunto novo.
 *
 * Um arquivo que não lê, ou que não sobra nada depois do filtro, simplesmente
 * não entra: o medidor que o pedia desenha a barra de fábrica, que é o que ele
 * desenharia numa TV que não tem o plugin.
 */

type DeclarativoStore = Declarativo & {
  /** Relê os estilos das extensões habilitadas e publica se algo mudou. */
  sincronizar: (extensoes: Extensao[]) => Promise<void>;
};

/** O pedido mais novo vence: dois `sincronizar` seguidos não publicam o velho. */
let pedido = 0;

async function lerEstilos(
  extensoes: Extensao[],
): Promise<Record<string, EstiloDeMedidorPublicado>> {
  const estilos: Record<string, EstiloDeMedidorPublicado> = {};

  await Promise.all(
    extensoes
      .filter((extensao) => extensao.habilitada)
      .flatMap((extensao) =>
        (extensao.contribui?.estilosDeMedidor ?? []).map(async (estilo) => {
          try {
            const texto = await (
              await fetch(urlDaExtensao(extensao.id, estilo.arquivo, extensao.versao))
            ).text();
            const modelo = lerModeloSvg(texto);
            if (modelo) {
              estilos[`${extensao.id}/${estilo.id}`] = { altura: estilo.altura, modelo };
            }
          } catch {
            // Arquivo apagado por fora, ou SVG ilegível: o estilo some e o
            // medidor volta ao de fábrica. Ver o cabeçalho.
          }
        }),
      ),
  );

  return estilos;
}

async function publicar(declarativo: Declarativo): Promise<void> {
  try {
    const { url, token } = await daemonAddr();
    await fetch(`${url}/sala/declarativo`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ato20-token": token },
      body: JSON.stringify(declarativo),
    });
  } catch {
    // Sem daemon não há mesa. O Mestre continua desenhando os estilos dele.
  }
}

export const useDeclarativoStore = create<DeclarativoStore>((set, get) => ({
  versao: 0,
  estilos: {},

  async sincronizar(extensoes) {
    const meu = ++pedido;
    const estilos = await lerEstilos(extensoes);
    if (meu !== pedido) return;

    // Comparado pelo texto: é o que vai no fio, e é a única pergunta que
    // importa -- a TV precisa de outro conjunto ou não?
    if (JSON.stringify(estilos) === JSON.stringify(get().estilos)) return;

    const versao = get().versao + 1;
    set({ estilos, versao });
    void publicar({ versao, estilos });
  },
}));
