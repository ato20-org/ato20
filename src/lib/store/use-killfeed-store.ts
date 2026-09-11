"use client";

import { create } from "zustand";

/**
 * Onde a fileira de dados está, e de que tamanho.
 *
 * `null` é o LUGAR PADRÃO — alto e ao centro —, e não uma posição gravada de
 * zero. A diferença importa: no padrão a fileira é centrada por layout, então
 * ela continua centrada quando a janela do aplicativo muda de largura. Gravar
 * um `x` no primeiro render congelaria o centro de uma janela que já não
 * existe, e a mesa que mudou de monitor encontraria a fileira fora do meio.
 */
export type LugarDaFaixa = { x: number; y: number; escala: number };

const CHAVE_DISCO = "ato20:faixa-rolagens";

/**
 * Os limites da escala.
 *
 * Baixo o bastante para a fileira sair da frente sem ser apagada, e alto o
 * bastante para ser lida do outro lado da mesa — que é o caso que motivou isto:
 * o mestre com a TV a três metros e a bancada num ultrawide. Acima de 2,5 a
 * fileira compete com a cena; abaixo de 0,6 o desenho do dado deixa de ter
 * forma.
 */
export const ESCALA_MIN = 0.6;
export const ESCALA_MAX = 2.5;

export function limitarEscala(valor: number): number {
  if (!Number.isFinite(valor)) return 1;

  return Math.min(Math.max(valor, ESCALA_MIN), ESCALA_MAX);
}

function ler(): LugarDaFaixa | null {
  try {
    const cru = localStorage.getItem(CHAVE_DISCO);
    if (!cru) return null;

    const valor: unknown = JSON.parse(cru);
    if (typeof valor !== "object" || valor === null) return null;

    const { x, y, escala } = valor as Partial<LugarDaFaixa>;
    if (typeof x !== "number" || typeof y !== "number") return null;

    return { x, y, escala: limitarEscala(typeof escala === "number" ? escala : 1) };
  } catch {
    // Chave escrita à mão, JSON quebrado, armazenamento negado: nada disso
    // deveria impedir a fileira de aparecer. O padrão é um lugar válido.
    return null;
  }
}

function gravar(lugar: LugarDaFaixa | null): void {
  try {
    if (lugar) localStorage.setItem(CHAVE_DISCO, JSON.stringify(lugar));
    else localStorage.removeItem(CHAVE_DISCO);
  } catch {
    // Sem disco o arranjo vale só nesta sessão, que é melhor do que a alça
    // parar de funcionar.
  }
}

type KillfeedStore = {
  lugar: LugarDaFaixa | null;
  /** Move e redimensiona. Um só porque os dois gestos gravam a mesma linha. */
  acomodar: (lugar: LugarDaFaixa) => void;
  /** Volta ao alto e ao centro, no tamanho de origem. */
  restaurar: () => void;
  hidratar: () => void;
};

/**
 * Onde o mestre deixou a fileira de dados.
 *
 * Em `localStorage` como o zoom, o layout e as posições de janela: é arrumação
 * de bancada, e é onde as outras já moram. Não no vault — o lugar em que ESTA
 * pessoa gosta de ver os dados não é conteúdo de campanha, e viajaria no zip
 * para a máquina de outra que arruma a mesa de outro jeito.
 */
export const useKillfeedStore = create<KillfeedStore>((set) => ({
  // Padrão no primeiro render, e não o disco: este módulo é importado pelo
  // servidor durante o build estático, onde `localStorage` não existe. Quem lê
  // o disco é `hidratar`, já no navegador.
  lugar: null,

  acomodar(lugar) {
    const arrumado = { ...lugar, escala: limitarEscala(lugar.escala) };

    gravar(arrumado);
    set({ lugar: arrumado });
  },

  restaurar() {
    gravar(null);
    set({ lugar: null });
  },

  hidratar() {
    // Uma vez por sessão: a fileira monta e desmonta conforme há dados na
    // bandeja, e reler o disco a cada dado que cai seria uma leitura por
    // rolagem para responder algo que não mudou.
    if (hidratado) return;

    hidratado = true;
    set({ lugar: ler() });
  },
}));

let hidratado = false;
