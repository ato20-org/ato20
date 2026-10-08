"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";

import {
  escopoPadrao,
  resolver,
  valido,
  type Definicao,
  type Escopo,
  type Valores,
} from "@/lib/configuracoes/valor";
import { isDesktop, VaultError } from "@/lib/vault/bridge";
import { gravarConfiguracoes, lerConfiguracoes } from "@/lib/vault/configuracoes";
import { comum } from "@/lib/i18n/comum";

/**
 * O registro de configurações: o que existe para ajustar, e o que vale.
 *
 * UM registro para o aplicativo e para os plugins, como o do VSCode. O
 * aplicativo declara as dele (`ato20.zoom`, `ato20.avisarAtualizacao`, os
 * faders) e cada plugin declara as suas no manifesto; a tela de Configurações
 * desenha todas a partir daqui, e o arquivo também se edita à mão. Antes
 * cada preferência era um campo escrito à mão num store e uma seção escrita à
 * mão na tela, e um plugin não tinha onde guardar nem onde mostrar a dele.
 *
 * Dois escopos, dois arquivos: `{config do app}/configuracoes.json` para a
 * MÁQUINA e `{campanha}/configuracoes.json` para a CAMPANHA, que viaja no zip.
 * A campanha vence a máquina, a máquina vence o padrão -- ver `resolver`.
 *
 * O valor gravado é o que o mestre MUDOU, nunca o padrão: um arquivo com só o
 * que difere é o que se lê e se edita, e é o que deixa o padrão mudar numa
 * versão nova sem reescrever o arquivo de todo mundo.
 *
 * A gravação espera 400 ms, como o board: um deslizador emite dezenas de
 * valores por segundo, e cada um seria um `fsync`. E ela NÃO acontece quando
 * o arquivo veio corrompido: sobrescrever o que o mestre editou à mão e errou
 * uma vírgula apagaria tudo o que ele escreveu. A tela mostra o erro e segue
 * com os padrões até alguém consertar o arquivo.
 */

const ESPERA_MS = 400;

type ConfiguracoesStore = {
  definicoes: Record<string, Definicao>;
  valores: Valores;
  /** O arquivo já foi lido. Antes disso, vazio não quer dizer nada. */
  carregado: Record<Escopo, boolean>;
  /** O arquivo veio ilegível. Enquanto houver erro, ninguém grava nele. */
  erro: Record<Escopo, string | null>;

  /** Declara ou redeclara. Chave repetida vale a última. */
  definir: (definicoes: Definicao[]) => void;
  /** Esquece tudo que um dono declarou. Plugin desligado ou desinstalado. */
  esquecerDono: (dono: string) => void;
  /**
   * Troca as definições de TODOS os plugins de uma vez, pela lista que está
   * habilitada agora. É o que a lista de extensões chama a cada mudança.
   */
  definirDeExtensoes: (definicoes: Definicao[]) => void;

  carregar: (escopo: Escopo) => Promise<void>;
  /** A campanha fechou: os valores dela saem, e o padrão volta a valer. */
  esquecer: (escopo: Escopo) => void;

  /**
   * Grava um valor. Recusa o que não é do tipo declarado, e o que não é de
   * chave declarada -- gravar chave desconhecida deixaria o arquivo acumular
   * lixo de plugins que já saíram.
   */
  gravar: (chave: string, valor: unknown, escopo?: Escopo) => boolean;
  /** Tira o valor de um escopo. O que vale passa a ser o próximo. */
  limpar: (chave: string, escopo: Escopo) => void;
};

/** A mensagem de um erro do Rust, ou o que houver. */
function mensagem(causa: unknown): string {
  if (causa instanceof VaultError) return causa.message;
  if (causa instanceof Error) return causa.message;

  return comum.erros.semAplicativo;
}

/** As gravações à espera, uma por escopo. */
const pendentes: Partial<Record<Escopo, ReturnType<typeof setTimeout>>> = {};

function agendar(escopo: Escopo): void {
  if (!isDesktop()) return;

  clearTimeout(pendentes[escopo]);
  pendentes[escopo] = setTimeout(() => {
    delete pendentes[escopo];
    const { valores, erro } = useConfiguracoesStore.getState();
    if (erro[escopo]) return;

    gravarConfiguracoes(escopo, valores[escopo]).catch((causa) => {
      useConfiguracoesStore.setState((atual) => ({
        erro: { ...atual.erro, [escopo]: mensagem(causa) },
      }));
    });
  }, ESPERA_MS);
}

/**
 * Grava agora o que está à espera, sem os 400 ms.
 *
 * Para quem vai recarregar a janela logo em seguida -- a troca de idioma: o
 * `setTimeout` morreria com a página, e a escolha que pediu a recarga seria
 * justamente a que não chegou ao arquivo.
 */
export async function descarregarConfiguracoes(): Promise<void> {
  const escopos = Object.keys(pendentes) as Escopo[];

  await Promise.all(
    escopos.map(async (escopo) => {
      clearTimeout(pendentes[escopo]);
      delete pendentes[escopo];
      const { valores, erro } = useConfiguracoesStore.getState();
      if (erro[escopo]) return;

      await gravarConfiguracoes(escopo, valores[escopo]).catch(() => {
        // Melhor esforço: quem chama vai recarregar de qualquer jeito, e o
        // espelho do `localStorage` já leva a escolha para a próxima abertura.
      });
    }),
  );
}

/**
 * Põe no registro valores que vieram de um pacote e grava.
 *
 * Sem passar pela definição de cada chave, ao contrário do `gravar`: o pacote
 * pode trazer a chave de um plugin que ainda não carregou nesta máquina, e o
 * valor tem de esperar por ele no arquivo, como espera o de um plugin
 * desligado. `sobrescrever` falso só preenche a chave que ainda não tem valor
 * -- é a regra da campanha, que nunca perde um ajuste por importar outro.
 * Devolve quantas chaves entraram.
 */
export function mesclarConfiguracoes(
  escopo: Escopo,
  valores: Record<string, unknown>,
  sobrescrever: boolean,
): number {
  const atuais = useConfiguracoesStore.getState().valores[escopo];
  const novas = Object.entries(valores).filter(
    ([chave]) => sobrescrever || atuais[chave] === undefined,
  );
  if (novas.length === 0) return 0;

  useConfiguracoesStore.setState((atual) => ({
    valores: {
      ...atual.valores,
      [escopo]: { ...atual.valores[escopo], ...Object.fromEntries(novas) },
    },
  }));
  agendar(escopo);

  return novas.length;
}

export const useConfiguracoesStore = create<ConfiguracoesStore>((set, get) => ({
  definicoes: {},
  valores: { maquina: {}, campanha: {} },
  carregado: { maquina: false, campanha: false },
  erro: { maquina: null, campanha: null },

  definir(novas) {
    set((atual) => ({
      definicoes: {
        ...atual.definicoes,
        ...Object.fromEntries(novas.map((d) => [d.chave, d])),
      },
    }));
  },

  esquecerDono(dono) {
    set((atual) => ({
      definicoes: Object.fromEntries(
        Object.entries(atual.definicoes).filter(([, d]) => d.dono !== dono),
      ),
    }));
  },

  definirDeExtensoes(novas) {
    set((atual) => ({
      definicoes: {
        ...Object.fromEntries(
          Object.entries(atual.definicoes).filter(([, d]) => d.dono === "ato20"),
        ),
        ...Object.fromEntries(novas.map((d) => [d.chave, d])),
      },
    }));
  },

  async carregar(escopo) {
    // Fora do aplicativo não há arquivo. Carregado e vazio é o estado honesto.
    if (!isDesktop()) {
      set((atual) => ({ carregado: { ...atual.carregado, [escopo]: true } }));
      return;
    }

    try {
      const lido = await lerConfiguracoes(escopo);
      set((atual) => ({
        valores: { ...atual.valores, [escopo]: lido },
        carregado: { ...atual.carregado, [escopo]: true },
        erro: { ...atual.erro, [escopo]: null },
      }));
    } catch (causa) {
      set((atual) => ({
        carregado: { ...atual.carregado, [escopo]: true },
        erro: { ...atual.erro, [escopo]: mensagem(causa) },
      }));
    }
  },

  esquecer(escopo) {
    clearTimeout(pendentes[escopo]);
    delete pendentes[escopo];
    set((atual) => ({
      valores: { ...atual.valores, [escopo]: {} },
      carregado: { ...atual.carregado, [escopo]: false },
      erro: { ...atual.erro, [escopo]: null },
    }));
  },

  gravar(chave, valor, escopo) {
    const definicao = get().definicoes[chave];
    if (!definicao || !valido(definicao, valor)) return false;

    const alvo = escopo ?? escopoPadrao(definicao);
    if (get().valores[alvo][chave] === valor) return true;

    set((atual) => ({
      valores: { ...atual.valores, [alvo]: { ...atual.valores[alvo], [chave]: valor } },
    }));
    agendar(alvo);

    return true;
  },

  limpar(chave, escopo) {
    if (!(chave in get().valores[escopo])) return;

    set((atual) => {
      const copia = { ...atual.valores[escopo] };
      delete copia[chave];

      return { valores: { ...atual.valores, [escopo]: copia } };
    });
    agendar(escopo);
  },
}));

/** O valor que vale para uma chave agora. Padrão da definição se não houver. */
export function valorDe<T = unknown>(chave: string): T | undefined {
  const { definicoes, valores } = useConfiguracoesStore.getState();
  const definicao = definicoes[chave];
  if (!definicao) return undefined;

  return resolver(definicao, valores).valor as T;
}

/**
 * Avisa quando o valor que VALE muda -- e só então.
 *
 * Compara o resolvido, e não o store: uma gravação na campanha que a máquina
 * já sobrepunha, ou uma chave alheia, não acorda quem assinou esta.
 */
export function assinarConfiguracao(
  chave: string,
  aviso: (valor: unknown) => void,
): () => void {
  let anterior = valorDe(chave);

  return useConfiguracoesStore.subscribe(() => {
    const atual = valorDe(chave);
    if (Object.is(atual, anterior)) return;

    anterior = atual;
    aviso(atual);
  });
}

/** O valor que vale, como hook. Re-renderiza só quando ele muda. */
export function useConfiguracao<T = unknown>(chave: string): T | undefined {
  return useSyncExternalStore(
    (avisar) => assinarConfiguracao(chave, avisar),
    () => valorDe<T>(chave),
    () => valorDe<T>(chave),
  );
}
