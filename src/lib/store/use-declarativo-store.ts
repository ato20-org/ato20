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
  /**
   * Os efeitos que a CAMPANHA criou no editor, que viajam junto com os de
   * plugin. Ver `useEfeitosDaCampanhaStore`.
   */
  definirEfeitosDaCampanha: (efeitos: ReadonlyArray<DefinicaoDeEfeito>) => void;
};

/**
 * As duas fontes de efeito que viajam, guardadas à parte: cada uma muda por um
 * caminho, e a que vai no fio é a junção. Os ids não colidem -- os da campanha
 * começam com `campanha/`, e o plugin com esse nome não declara efeito.
 */
let efeitosDePlugins: Record<string, DefinicaoDeEfeito> = {};
let efeitosDaCampanha: Record<string, DefinicaoDeEfeito> = {};

function juntarEfeitos(): Record<string, DefinicaoDeEfeito> {
  return { ...efeitosDePlugins, ...efeitosDaCampanha };
}

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

    efeitosDePlugins = lerEfeitos(extensoes);
    const efeitos = juntarEfeitos();

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

  definirEfeitosDaCampanha(lista) {
    efeitosDaCampanha = Object.fromEntries(
      lista.map((efeito) => [efeito.id, { ...efeito, origem: { acervo: true } as const }]),
    );
    const efeitos = juntarEfeitos();
    if (JSON.stringify(efeitos) === JSON.stringify(get().efeitos)) return;

    // O Mestre desenha o conjunto novo AGORA -- a prévia anda com o controle.
    // A versão, que é o que manda a TV buscar, só sobe depois do envio.
    set({ efeitos });
    publicarLogo();
  },
}));

/**
 * Publica o estado atual um instante depois da ÚLTIMA mudança. O editor de
 * efeitos muda o conjunto a cada passo de um controle arrastado, e um envio ao
 * daemon por passo seria uma rajada de POSTs que a TV nem chega a desenhar.
 *
 * A versão sobe DEPOIS do envio, e não antes: é ela que viaja no quadro de
 * 10 Hz e manda a TV buscar o conjunto. Subindo antes, a TV buscava o
 * conjunto velho com o número novo -- e, com o número já igual, não buscava
 * de novo até a próxima mudança.
 */
let esperaDaPublicacao: ReturnType<typeof setTimeout> | null = null;

function publicarLogo(): void {
  if (esperaDaPublicacao) clearTimeout(esperaDaPublicacao);
  esperaDaPublicacao = setTimeout(async () => {
    esperaDaPublicacao = null;
    const { versao: atual, estilos, efeitos, plugins } = useDeclarativoStore.getState();
    const versao = atual + 1;

    await publicar({ versao, estilos, efeitos, plugins });
    // Um `sincronizar` no meio já publicou com versão maior, e com este
    // conjunto junto: aí o número dele vale.
    if (useDeclarativoStore.getState().versao < versao) useDeclarativoStore.setState({ versao });
  }, 150);
}
