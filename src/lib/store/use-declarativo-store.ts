"use client";

import { create } from "zustand";

import type { Extensao } from "@/lib/extensoes/manifesto";
import { urlDaExtensao } from "@/lib/extensoes/manifesto";
import { lerModeloSvg } from "@/lib/extensoes/svg-modelo";
import type { Declarativo, EstiloDeMedidorPublicado } from "@/lib/sync/declarativo";
import { daemonAddr } from "@/lib/vault/bridge";
import type { DefinicaoDeEfeito } from "@/types/efeito";

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
 * desenharia numa TV que não tem o plugin. *
 * Leva junto a lista dos plugins habilitados, que é o que o celular usa para
 * não mostrar a seção de quem foi desligado. Ver `Declarativo.plugins`.
 */

type DeclarativoStore = Declarativo & {
  /** Relê os estilos e a lista das extensões habilitadas, e publica se algo mudou. */
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
          const chave = `${extensao.id}/${estilo.id}`;
          const comum = {
            titulo: estilo.titulo,
            altura: estilo.altura,
            ...(estilo.rotulo ? { rotulo: estilo.rotulo } : {}),
          };

          // Camadas não têm arquivo para ler: são o próprio JSON, que o Rust
          // já validou ao instalar. As imagens cada tela busca na hora.
          if (estilo.camadas) {
            estilos[chave] = {
              ...comum,
              tipo: "camadas",
              plugin: extensao.id,
              versao: extensao.versao,
              camadas: estilo.camadas,
            };
            return;
          }
          if (!estilo.arquivo) return;

          try {
            const texto = await (
              await fetch(urlDaExtensao(extensao.id, estilo.arquivo, extensao.versao))
            ).text();
            const modelo = lerModeloSvg(texto);
            if (modelo) estilos[chave] = { ...comum, tipo: "svg", modelo };
          } catch {
            // Arquivo apagado por fora, ou SVG ilegível: o estilo some e o
            // medidor volta ao de fábrica. Ver o cabeçalho.
          }
        }),
      ),
  );

  return estilos;
}

/**
 * Os efeitos dos plugins habilitados, já com o id da mesa: `{plugin}/{efeito}`.
 *
 * Sem arquivo para ler: é o JSON do manifesto, que o Rust validou ao ler a
 * lista.
 */
function lerEfeitos(extensoes: Extensao[]): Record<string, DefinicaoDeEfeito> {
  const efeitos: Record<string, DefinicaoDeEfeito> = {};

  for (const extensao of extensoes) {
    if (!extensao.habilitada) continue;

    for (const efeito of extensao.contribui?.efeitos ?? []) {
      const id = `${extensao.id}/${efeito.id}`;
      efeitos[id] = { ...efeito, id, origem: { plugin: extensao.id, versao: extensao.versao } };
    }
  }

  return efeitos;
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
  efeitos: {},
  plugins: [],

  async sincronizar(extensoes) {
    const meu = ++pedido;
    const estilos = await lerEstilos(extensoes);
    if (meu !== pedido) return;

    const efeitos = lerEfeitos(extensoes);

    // Em ordem: a lista vem na ordem da tela, e reordenar não é mudança.
    const plugins = extensoes
      .filter((extensao) => extensao.habilitada)
      .map((extensao) => extensao.id)
      .sort();

    // Comparado pelo texto: é o que vai no fio, e é a única pergunta que
    // importa -- a TV precisa de outro conjunto ou não?
    const { estilos: antes, efeitos: antesEfeitos, plugins: antesPlugins } = get();
    if (
      JSON.stringify(estilos) === JSON.stringify(antes) &&
      JSON.stringify(efeitos) === JSON.stringify(antesEfeitos) &&
      JSON.stringify(plugins) === JSON.stringify(antesPlugins)
    )
      return;

    const versao = get().versao + 1;
    set({ estilos, efeitos, plugins, versao });
    void publicar({ versao, estilos, efeitos, plugins });
  },
}));
