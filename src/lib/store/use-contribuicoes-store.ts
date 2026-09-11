"use client";

import type { ComponentType } from "react";
import { create } from "zustand";

import type { FerramentaRegistrada } from "@/lib/extensoes/api";

/**
 * O que as extensões de código acrescentaram, de verdade.
 *
 * Duas tabelas, e a distinção é o ponto do sistema:
 *
 * O que a extensão DECLARA vive no `manifesto.json` e é conhecido sem executar
 * nada — é dele que saem a lista de telas, a lista de atalhos e a barra de
 * ferramentas. O que ela REGISTRA vive aqui, e só existe depois de o módulo ser
 * importado.
 *
 * É essa separação que permite a ativação preguiçosa: o menu mostra "Tabela de
 * testes" porque o manifesto diz que ela existe, e o módulo só é importado
 * quando alguém a abre.
 *
 * Store separado do `useExtensoesStore` porque a vida útil é outra: aquele é a
 * lista do disco, que sobrevive a tudo; este é memória de execução, e some
 * inteiro quando a extensão é desligada.
 */

/** Onde o módulo de uma extensão está. */
export type EstadoCarga = "ausente" | "carregando" | "pronta" | "falhou";

type Registros = {
  paineis: Record<string, ComponentType>;
  comandos: Record<string, () => void | Promise<void>>;
  ferramentas: Record<string, FerramentaRegistrada>;
  camadas: Record<string, ComponentType>;
};

type ContribuicoesStore = Registros & {
  /** Por id de extensão. `erro` só existe em `falhou`. */
  carga: Record<string, { estado: EstadoCarga; erro?: string }>;

  marcar: (extensaoId: string, estado: EstadoCarga, erro?: string) => void;
  guardar: <T extends keyof Registros>(
    tipo: T,
    chave: string,
    valor: Registros[T][string],
  ) => void;
  soltar: <T extends keyof Registros>(tipo: T, chave: string) => void;
  /** Esquece TUDO de uma extensão: registros e estado de carga. */
  esquecer: (extensaoId: string) => void;
};

/** As chaves são `${extensaoId}/${id}` — ver `chaveContribuicao`. */
function daExtensao(chave: string, extensaoId: string): boolean {
  return chave.startsWith(`${extensaoId}/`);
}

function semAsDaExtensao<V>(tabela: Record<string, V>, extensaoId: string): Record<string, V> {
  return Object.fromEntries(
    Object.entries(tabela).filter(([chave]) => !daExtensao(chave, extensaoId)),
  );
}

export const useContribuicoesStore = create<ContribuicoesStore>((set) => ({
  paineis: {},
  comandos: {},
  ferramentas: {},
  camadas: {},
  carga: {},

  marcar(extensaoId, estado, erro) {
    set((atual) => ({
      carga: { ...atual.carga, [extensaoId]: { estado, erro } },
    }));
  },

  guardar(tipo, chave, valor) {
    set((atual) => ({ [tipo]: { ...atual[tipo], [chave]: valor } }) as Partial<ContribuicoesStore>);
  },

  soltar(tipo, chave) {
    set((atual) => {
      const copia = { ...atual[tipo] };
      delete copia[chave];

      return { [tipo]: copia } as Partial<ContribuicoesStore>;
    });
  },

  esquecer(extensaoId) {
    set((atual) => {
      const carga = { ...atual.carga };
      delete carga[extensaoId];

      return {
        paineis: semAsDaExtensao(atual.paineis, extensaoId),
        comandos: semAsDaExtensao(atual.comandos, extensaoId),
        ferramentas: semAsDaExtensao(atual.ferramentas, extensaoId),
        camadas: semAsDaExtensao(atual.camadas, extensaoId),
        carga,
      };
    });
  },
}));

/** O estado de carga de uma extensão, para a tela mostrar. */
export function estadoDaCarga(extensaoId: string): { estado: EstadoCarga; erro?: string } {
  return useContribuicoesStore.getState().carga[extensaoId] ?? { estado: "ausente" };
}
