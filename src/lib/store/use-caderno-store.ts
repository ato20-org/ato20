"use client";

import { create } from "zustand";

import { t } from "@/lib/i18n/jogador";
import {
  apagarNota,
  criarNota,
  listNotas,
  mudarNota,
  type Nota,
  type PatchNota,
} from "@/lib/player/caderno";

/**
 * O caderno deste aparelho.
 *
 * Store e não estado do componente porque o caderno atravessa a tela: a lista,
 * o editor e a menção `#nota` precisam das mesmas notas, e as duas primeiras
 * trocam de lugar conforme a mão do jogador. Guardado dentro da aba, trocar de
 * aba — o que acontece a cada olhada na ficha — jogaria fora o que foi lido e
 * mandaria buscar tudo de novo no meio da sessão.
 *
 * Separado do `use-player-store` pela mesma razão que o caderno saiu da ficha
 * no banco: a ficha é identidade e muda uma vez por campanha; o caderno muda a
 * cada frase digitada.
 */
export type CadernoStatus = "idle" | "lendo" | "pronto" | "erro";

type CadernoStore = {
  status: CadernoStatus;
  /**
   * De quem é o caderno aberto. Um por personagem: trocar de personagem
   * esquece as notas do outro e lê as deste.
   */
  personagemId: string | null;
  /** Da mexida mais recente para a mais antiga, como o daemon devolve. */
  notas: Nota[];
  erro: string | null;

  carregar: (codigo: string, personagemId: string) => Promise<void>;
  /** Abre uma nota nova no caderno aberto e devolve ela, já com id. `null` = não deu. */
  criar: (codigo: string) => Promise<Nota | null>;
  /**
   * Grava a nota, e devolve a versão do daemon -- `null` = não gravou.
   *
   * Só quando o jogador manda, pelo botão Salvar: o rascunho mora no editor, e
   * a lista só muda com o que o daemon aceitou. Ver `Editor`.
   */
  salvar: (codigo: string, id: string, patch: PatchNota) => Promise<Nota | null>;
  apagar: (codigo: string, id: string) => Promise<void>;
  /** Esquece o que foi lido. Trocar de credencial no mesmo aparelho passa aqui. */
  limpar: () => void;
};

function descreve(cause: unknown): string {
  return cause instanceof Error ? cause.message : t.erros.semMesa;
}

/** Mais recente primeiro, que é a ordem em que o caderno é lido. */
function porRecencia(notas: Nota[]): Nota[] {
  return [...notas].sort((a, b) => b.atualizadoEm - a.atualizadoEm);
}

export const useCadernoStore = create<CadernoStore>((set, get) => ({
  status: "idle",
  personagemId: null,
  notas: [],
  erro: null,

  async carregar(codigo, personagemId) {
    const outro = get().personagemId !== personagemId;
    if (get().status === "lendo" && !outro) return;

    // Outro personagem: a lista do anterior sai na hora, e não fica na tela
    // sob o nome deste até a resposta chegar.
    set({
      status: "lendo",
      personagemId,
      erro: null,
      ...(outro ? { notas: [] } : {}),
    });

    try {
      const notas = porRecencia(await listNotas(codigo, personagemId));
      // Trocou de novo no meio do caminho: esta resposta já não é de ninguém.
      if (get().personagemId !== personagemId) return;
      set({ status: "pronto", notas });
    } catch (cause) {
      if (get().personagemId !== personagemId) return;
      set({ status: "erro", erro: descreve(cause) });
    }
  },

  async criar(codigo) {
    const personagemId = get().personagemId;
    if (!personagemId) return null;

    try {
      const nota = await criarNota(codigo, personagemId);
      if (get().personagemId !== personagemId) return null;

      set((atual) => ({ notas: [nota, ...atual.notas], erro: null }));

      return nota;
    } catch (cause) {
      set({ erro: descreve(cause) });

      return null;
    }
  },

  async salvar(codigo, id, patch) {
    try {
      const gravada = await mudarNota(codigo, id, patch);

      // A versão do daemon, que é a que passou pelos tetos: etiqueta repetida
      // sai, título de duas linhas vira uma, texto longo demais é cortado.
      set((atual) => ({
        erro: null,
        notas: porRecencia(atual.notas.map((nota) => (nota.id === id ? gravada : nota))),
      }));

      return gravada;
    } catch (cause) {
      set({ erro: descreve(cause) });

      return null;
    }
  },

  async apagar(codigo, id) {
    const antes = get().notas;

    set((atual) => ({ notas: atual.notas.filter((nota) => nota.id !== id) }));

    try {
      await apagarNota(codigo, id);
      set({ erro: null });
    } catch (cause) {
      // Aqui a volta atrás é certa, e é o contrário da gravação: o gesto foi
      // "apague isto", e uma nota que some da tela sem ter sumido do disco
      // reaparece sozinha na próxima abertura, sem explicação nenhuma.
      set({ notas: antes, erro: descreve(cause) });
    }
  },

  limpar() {
    set({
      status: "idle",
      personagemId: null,
      notas: [],
      erro: null,
    });
  },
}));
