"use client";

import { create } from "zustand";

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
  /** Da mexida mais recente para a mais antiga, como o daemon devolve. */
  notas: Nota[];
  erro: string | null;
  /**
   * Se a última gravação saiu do aparelho.
   *
   * Existe porque a gravação é otimista e atrasada: o texto aparece na hora e a
   * requisição sai 800ms depois. Sem um lugar para dizer que ela falhou, a
   * escrita perdida ficaria visível na tela e ausente no disco — que é o pior
   * jeito de perder uma anotação.
   */
  gravando: boolean;
  falhou: boolean;

  carregar: (codigo: string) => Promise<void>;
  /** Abre uma nota nova e devolve ela, já com id. `null` = não deu. */
  criar: (codigo: string) => Promise<Nota | null>;
  mudar: (codigo: string, id: string, patch: PatchNota) => Promise<void>;
  apagar: (codigo: string, id: string) => Promise<void>;
  /** Esquece o que foi lido. Trocar de credencial no mesmo aparelho passa aqui. */
  limpar: () => void;
};

function descreve(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Falha ao falar com a mesa";
}

/** Mais recente primeiro, que é a ordem em que o caderno é lido. */
function porRecencia(notas: Nota[]): Nota[] {
  return [...notas].sort((a, b) => b.atualizadoEm - a.atualizadoEm);
}

export const useCadernoStore = create<CadernoStore>((set, get) => ({
  status: "idle",
  notas: [],
  erro: null,
  gravando: false,
  falhou: false,

  async carregar(codigo) {
    if (get().status === "lendo") return;

    set({ status: "lendo", erro: null });

    try {
      set({ status: "pronto", notas: porRecencia(await listNotas(codigo)) });
    } catch (cause) {
      set({ status: "erro", erro: descreve(cause) });
    }
  },

  async criar(codigo) {
    try {
      const nota = await criarNota(codigo);

      set((atual) => ({ notas: [nota, ...atual.notas], erro: null, falhou: false }));

      return nota;
    } catch (cause) {
      set({ erro: descreve(cause), falhou: true });

      return null;
    }
  },

  async mudar(codigo, id, patch) {
    // Otimista: no celular, no meio da sessão, esperar a resposta para a letra
    // aparecer faria a digitação engasgar. O servidor é a verdade, e concorda
    // em praticamente todos os casos.
    set((atual) => ({
      gravando: true,
      notas: atual.notas.map((nota) => (nota.id === id ? { ...nota, ...patch } : nota)),
    }));

    try {
      const gravada = await mudarNota(codigo, id, patch);

      // Troca pela versão do daemon, que é a que passou pelos tetos: etiqueta
      // repetida sai, título de duas linhas vira uma, texto longo demais é
      // cortado. Sem isto a tela mostraria a etiqueta duplicada até o próximo
      // carregamento, e o jogador a marcaria de novo achando que não pegou.
      set((atual) => ({
        gravando: false,
        falhou: false,
        erro: null,
        notas: atual.notas.map((nota) => (nota.id === id ? gravada : nota)),
      }));
    } catch (cause) {
      // O texto na tela NÃO volta atrás: desfazer a escrita de quem está
      // digitando é perder a frase duas vezes. Fica o aviso, e a próxima
      // gravação tenta de novo.
      set({ gravando: false, falhou: true, erro: descreve(cause) });
    }
  },

  async apagar(codigo, id) {
    const antes = get().notas;

    set((atual) => ({ notas: atual.notas.filter((nota) => nota.id !== id) }));

    try {
      await apagarNota(codigo, id);
      set({ erro: null, falhou: false });
    } catch (cause) {
      // Aqui a volta atrás é certa, e é o contrário da gravação: o gesto foi
      // "apague isto", e uma nota que some da tela sem ter sumido do disco
      // reaparece sozinha na próxima abertura, sem explicação nenhuma.
      set({ notas: antes, erro: descreve(cause), falhou: true });
    }
  },

  limpar() {
    set({ status: "idle", notas: [], erro: null, gravando: false, falhou: false });
  },
}));
