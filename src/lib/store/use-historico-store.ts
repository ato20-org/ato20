"use client";

import { create } from "zustand";

import { registroDe } from "@/lib/historico/escriba";
import { acrescentarAoHistorico, lerHistorico } from "@/lib/vault/historico";
import type { LinhaDoFio } from "@/types/fio";
import type { RegistroDoHistorico } from "@/types/historico";

type HistoricoStore = {
  /** `null` = ainda não lido, ou a campanha trocou. */
  registros: RegistroDoHistorico[] | null;
  /** O fio inteiro como estava na leitura. O que chega depois vem do `useFioStore`. */
  fio: LinhaDoFio[];
  /** Até onde o arquivo foi lido. Ver `atualizar`. */
  tamanho: number;
  erro: boolean;

  /** Lê tudo. A janela chama ao abrir. */
  carregar: () => Promise<void>;
  /** Lê o fim novo do arquivo: o que o Rust gravou sem a tela saber. */
  atualizar: () => Promise<void>;
  /** O que o escriba acabou de gravar, sem esperar a próxima leitura. */
  receber: (registros: readonly RegistroDoHistorico[]) => void;
  /** Saiu da campanha: o histórico de outra não pode ficar na janela. */
  esquecer: () => void;

  escreverMarco: (texto: string) => Promise<void>;
  editarMarco: (alvo: string, texto: string) => Promise<void>;
  apagarMarco: (alvo: string) => Promise<void>;
};

/**
 * O histórico da campanha, na memória da janela.
 *
 * Só existe lido enquanto alguém pediu -- a janela aberta. O escriba grava com
 * ou sem ela; o que ele grava entra aqui na hora (`receber`), e o que o Rust
 * grava sozinho -- a mochila mexida pelo celular -- entra pela leitura do fim
 * do arquivo (`atualizar`). Os dois caminhos podem trazer o mesmo registro, e
 * o id é quem decide que é um só.
 */
export const useHistoricoStore = create<HistoricoStore>((set, get) => {
  /** Acrescenta os que ainda não estão, na ordem em que chegaram. */
  const juntar = (novos: readonly RegistroDoHistorico[]) =>
    set((state) => {
      if (state.registros === null || novos.length === 0) return state;

      const vistos = new Set(state.registros.map((registro) => registro.id));
      const deFato = novos.filter((registro) => !vistos.has(registro.id));
      return deFato.length > 0 ? { registros: [...state.registros, ...deFato] } : state;
    });

  /** Grava um registro do Mestre e o põe na lista. */
  const gravar = async (registro: RegistroDoHistorico) => {
    await acrescentarAoHistorico([registro]);
    juntar([registro]);
  };

  return {
    registros: null,
    fio: [],
    tamanho: 0,
    erro: false,

    async carregar() {
      try {
        const lido = await lerHistorico();
        set({ registros: lido.registros, fio: lido.fio ?? [], tamanho: lido.tamanho, erro: false });
      } catch {
        set({ erro: true });
      }
    },

    async atualizar() {
      if (get().registros === null) return;

      try {
        const lido = await lerHistorico(get().tamanho);
        juntar(lido.registros);
        set({ tamanho: lido.tamanho });
      } catch {
        // A próxima tentativa lê do mesmo ponto: nada se perde.
      }
    },

    receber: juntar,

    esquecer: () => set({ registros: null, fio: [], tamanho: 0, erro: false }),

    escreverMarco: (texto) =>
      gravar(registroDe({ tipo: "marco", texto: texto.trim() }, Date.now())),

    editarMarco: (alvo, texto) =>
      gravar(registroDe({ tipo: "editado", alvo, texto: texto.trim() }, Date.now())),

    apagarMarco: (alvo) => gravar(registroDe({ tipo: "apagado", alvo }, Date.now())),
  };
});
