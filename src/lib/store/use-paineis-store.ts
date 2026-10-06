"use client";

import { create } from "zustand";

import {
  abrir,
  abrirEm,
  ativar,
  chaveDoConteudo,
  fecharAba,
  fecharConteudo,
  lerPaineis,
  PAINEIS_PADRAO,
  podar,
  soltar,
  type Alvo,
  type ConteudoDoPainel,
  type Origem,
  type Paineis,
} from "@/lib/paineis";

/** Onde a fileira de uma campanha sobrevive ao fechar o aplicativo. */
const PREFIXO_DO_DISCO = "ato20:paineis:";

/**
 * A fileira do Mestre: o mapa e os painéis de nota e de livro ao lado dele.
 * As regras moram em `lib/paineis`; aqui só se guarda e se lembra.
 *
 * Lembrada POR CAMPANHA, e na máquina: as notas abertas são de uma campanha, e
 * a largura de cada painel depende da tela -- levar isso junto da campanha
 * para outro computador desenharia uma fileira pensada para outro monitor.
 */
type PaineisStore = Paineis & {
  /** O caminho da campanha cuja fileira está aqui. `null` = nenhuma. */
  campanha: string | null;

  /** Troca para a fileira lembrada de uma campanha, ou a limpa. */
  carregar: (campanha: string | null) => void;
  abrir: (conteudo: ConteudoDoPainel) => void;
  /** Abre num lugar escolhido da fileira. Ver `abrirEm`. */
  abrirEm: (conteudo: ConteudoDoPainel, alvo: Alvo) => void;
  ativar: (painelId: string, chave: string) => void;
  fecharAba: (painelId: string, chave: string) => void;
  /** Fecha uma nota ou um livro onde estiver -- a nota apagada, o livro tirado da estante. */
  fechar: (conteudo: ConteudoDoPainel) => void;
  soltar: (origem: Origem, alvo: Alvo) => void;
  redimensionar: (fracoes: number[]) => void;
  podar: (
    tipo: ConteudoDoPainel["tipo"],
    existe: (conteudo: ConteudoDoPainel) => boolean,
  ) => void;

  /**
   * O que está sendo levado até a área de split por um gesto que não é o
   * arrasto de peças -- o quadro, que sai da lista de Arquivos pelo gesto de
   * reordenar. A nota não passa por aqui: ela vai pelo `useTokenDragStore`,
   * que já é o gesto dela. Ver `FileiraDePaineis`.
   *
   * Do meio do gesto, e por isso fora do disco.
   */
  naMao: ConteudoDoPainel | null;
  /** A zona sob o ponteiro, para acender. */
  alvoNaMao: Alvo | null;
  pegarParaSplit: (conteudo: ConteudoDoPainel) => void;
  mirarSplit: (alvo: Alvo | null) => void;
  largarSplit: () => void;
};

function chaveDoDisco(campanha: string): string {
  return `${PREFIXO_DO_DISCO}${campanha}`;
}

function ler(campanha: string): Paineis {
  try {
    const cru = localStorage.getItem(chaveDoDisco(campanha));
    return cru ? lerPaineis(JSON.parse(cru)) : PAINEIS_PADRAO;
  } catch {
    return PAINEIS_PADRAO;
  }
}

function gravar(campanha: string | null, paineis: Paineis): void {
  if (!campanha) return;

  try {
    localStorage.setItem(
      chaveDoDisco(campanha),
      JSON.stringify({ ordem: paineis.ordem, fracoes: paineis.fracoes }),
    );
  } catch {
    // Cota cheia ou armazenamento bloqueado: a fileira continua nesta sessão e
    // volta ao padrão na próxima. Não vale um aviso.
  }
}

export const usePaineisStore = create<PaineisStore>((set, get) => {
  /** Aplica uma regra e grava, se ela mudou alguma coisa. */
  function aplicar(regra: (atual: Paineis) => Paineis) {
    const { ordem, fracoes, campanha } = get();
    const proximo = regra({ ordem, fracoes });
    if (proximo.ordem === ordem && proximo.fracoes === fracoes) return;

    set({ ordem: proximo.ordem, fracoes: proximo.fracoes });
    gravar(campanha, proximo);
  }

  return {
    ...PAINEIS_PADRAO,
    campanha: null,

    carregar(campanha) {
      if (get().campanha === campanha) return;

      set({ campanha, ...(campanha ? ler(campanha) : PAINEIS_PADRAO) });
    },

    abrir: (conteudo) => aplicar((atual) => abrir(atual, conteudo)),
    abrirEm: (conteudo, alvo) => aplicar((atual) => abrirEm(atual, conteudo, alvo)),
    ativar: (painelId, chave) => aplicar((atual) => ativar(atual, painelId, chave)),
    fecharAba: (painelId, chave) =>
      aplicar((atual) => fecharAba(atual, painelId, chave)),
    fechar: (conteudo) =>
      aplicar((atual) => fecharConteudo(atual, chaveDoConteudo(conteudo))),
    soltar: (origem, alvo) => aplicar((atual) => soltar(atual, origem, alvo)),
    redimensionar: (fracoes) => aplicar((atual) => ({ ...atual, fracoes })),
    podar: (tipo, existe) => aplicar((atual) => podar(atual, tipo, existe)),

    naMao: null,
    alvoNaMao: null,
    pegarParaSplit: (conteudo) => {
      const atual = get().naMao;
      if (atual && chaveDoConteudo(atual) === chaveDoConteudo(conteudo)) return;
      set({ naMao: conteudo });
    },
    mirarSplit: (alvo) => {
      const atual = get().alvoNaMao;
      if (atual?.painel === alvo?.painel && atual?.zona === alvo?.zona) return;
      set({ alvoNaMao: alvo });
    },
    largarSplit: () => set({ naMao: null, alvoNaMao: null }),
  };
});

/** A nota está aberta em algum painel? É o destaque da linha em Arquivos. */
export function selectNotaAberta(notaId: string) {
  return (state: PaineisStore): boolean =>
    state.ordem.some(
      (painel) =>
        painel.tipo === "abas" &&
        painel.abas.some((aba) => aba.tipo === "nota" && aba.notaId === notaId),
    );
}

/** O livro está aberto em algum painel? */
export function selectLivroAberto(livroId: string) {
  return (state: PaineisStore): boolean =>
    state.ordem.some(
      (painel) =>
        painel.tipo === "abas" &&
        painel.abas.some((aba) => aba.tipo === "livro" && aba.livroId === livroId),
    );
}
