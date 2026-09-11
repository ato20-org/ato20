"use client";

import { create } from "zustand";

/**
 * Quais seções da ficha o mestre deixou fechadas.
 *
 * GLOBAL, e não por personagem: fechar "Arquivos" no Edgar e reencontrá-lo
 * aberto na Mira seria um estado que ninguém consegue prever — a mesma janela,
 * o mesmo lugar na tela, dois comportamentos. O que a mão aprende é "eu fechei
 * Arquivos", e isso vale para a ficha, não para uma ficha.
 *
 * Em `localStorage` como o zoom, o layout e as posições de janela: é arrumação
 * de bancada, e é onde as outras já moram. Não no `ato20.db` — o banco existe
 * para o que o Rust precisa ler, e o Rust não tem nada a fazer com isto.
 */
const CHAVE_DISCO = "ato20:secoes-ficha";

/**
 * As seções que a ficha pode fechar.
 *
 * O cabeçalho de identidade NÃO está aqui de propósito: ele é quem a ficha é, e
 * uma ficha sem nome nem retrato seria uma janela sem título dentro de uma
 * janela com título.
 */
export type SecaoFicha = "campos" | "inventario" | "arquivos" | "nota";

/**
 * O que é gravado são as FECHADAS, e não as abertas.
 *
 * Assim o padrão é "aberta", e uma seção nova nasce visível sem precisar de
 * migração: uma lista de abertas gravada hoje não conheceria a seção que existe
 * amanhã, e ela nasceria fechada na máquina de quem já usou o aplicativo — o
 * único lugar onde ninguém a procuraria.
 */
function ler(): Set<SecaoFicha> {
  try {
    const cru = localStorage.getItem(CHAVE_DISCO);
    if (!cru) return new Set();

    const valor: unknown = JSON.parse(cru);
    if (!Array.isArray(valor)) return new Set();

    return new Set(valor.filter((item): item is SecaoFicha => typeof item === "string"));
  } catch {
    // Chave escrita à mão, JSON quebrado, `localStorage` negado numa webview
    // sem armazenamento: nada disso deveria impedir a ficha de abrir. Tudo
    // aberto é o padrão, e é um estado válido.
    return new Set();
  }
}

function gravar(fechadas: Set<SecaoFicha>): void {
  try {
    localStorage.setItem(CHAVE_DISCO, JSON.stringify([...fechadas]));
  } catch {
    // Sem disco a preferência vale só nesta sessão, e isso é melhor do que a
    // seta de colapsar parar de funcionar.
  }
}

type SecoesStore = {
  fechadas: Set<SecaoFicha>;
  alternar: (secao: SecaoFicha) => void;
  /** Lê o disco. Chamado uma vez, no cliente — ver `useSecaoAberta`. */
  hidratar: () => void;
};

export const useSecoesStore = create<SecoesStore>((set, get) => ({
  // Vazio no primeiro render, e não o disco: este módulo é importado pelo
  // servidor durante o build estático, onde `localStorage` não existe. Quem
  // lê o disco é `hidratar`, já no navegador.
  fechadas: new Set(),

  alternar(secao) {
    const fechadas = new Set(get().fechadas);

    if (fechadas.has(secao)) fechadas.delete(secao);
    else fechadas.add(secao);

    gravar(fechadas);
    set({ fechadas });
  },

  hidratar() {
    // Uma vez por sessão, e não uma por seção montada: são quatro seções por
    // ficha, e cada ficha aberta relia o disco quatro vezes — quatro `Set`
    // novos, e um render de todas as seções por leitura. Depois da primeira, o
    // store já É a verdade: quem escreve é `alternar`, que grava nos dois.
    if (hidratado) return;

    hidratado = true;
    set({ fechadas: ler() });
  },
}));

let hidratado = false;
