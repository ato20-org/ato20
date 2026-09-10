"use client";

import { create } from "zustand";

import { createPortrait, FOLGA_PADRAO, limitarFolga } from "@/lib/geometry/portrait";
import { loadPortraits, savePortraits, type RetratosSalvos } from "@/lib/vault/session";
import type { AncoraRetrato, Portrait } from "@/types/scene";

/**
 * Gravação atrasada, como a do board.
 *
 * Arrastar um retrato emite uma mudança por frame, e gravar todas no disco
 * derruba o frame rate por nada — o que importa é o estado em que o gesto
 * parou.
 */
const PERSIST_DEBOUNCE_MS = 400;

type PortraitStore = {
  portraits: Portrait[];
  /**
   * A fila automática está ligada.
   *
   * Um interruptor para todos, e não um por retrato: o caso comum é o elenco
   * inteiro enfileirado, e marcar cinco linhas para dizer isso seria trabalho
   * por padrão. A exceção mora no retrato — ver `Portrait.foraDaFila`.
   */
  filaAuto: boolean;
  /** Onde a fila encosta. Ver `AncoraRetrato`. */
  ancora: AncoraRetrato;
  /**
   * Espaço entre dois retratos da fila, em fração da câmera.
   *
   * Global como os outros dois campos da fila, e pelo mesmo motivo: o vão é uma
   * propriedade da FILA, não de um retrato. Guardado por retrato, cada vizinho
   * teria uma opinião sobre o mesmo vão.
   *
   * Negativo sobrepõe de propósito — ver `FOLGA_MIN`.
   */
  folga: number;
  /** Qual campanha estes retratos pertencem. Ver `use-scene-store`. */
  hydratedPath: string | null;

  hydrate: (campaignPath: string) => Promise<void>;
  /**
   * Põe o retrato do personagem no ar.
   *
   * Na primeira vez cria o registro no canto inferior; depois só liga o que já
   * existe, na posição em que foi deixado. É o que faz desligar e ligar de novo
   * devolver a figura onde ela estava, e não no canto.
   */
  armar: (personagemId: string, assetId: string, naturalWidth?: number, naturalHeight?: number) => void;
  /** Tira do ar, mantendo a geometria. Ver `armar`. */
  desarmar: (personagemId: string) => void;
  update: (id: string, patch: Partial<Portrait>) => void;
  /** Um update para N retratos: arrastar ou escalar em grupo é um gesto só. */
  updateMany: (patches: Array<{ id: string; patch: Partial<Portrait> }>) => void;
  remove: (id: string) => void;
  /** Liga e desliga a fila para todos. */
  alternarFila: () => void;
  /** Troca a área em que a fila encosta. */
  ancorar: (ancora: AncoraRetrato) => void;
  /** Muda o espaço entre os retratos da fila. Ver `folga`. */
  ajustarFolga: (folga: number) => void;
  /** Aplica um estado recebido do canal, sem regravar no disco. */
  receive: (portraits: Portrait[]) => void;

};

/**
 * A geometria dos retratos, por personagem.
 *
 * Store próprio, fora do board, pelos mesmos dois motivos da trilha: desfazer
 * um movimento de imagem não deve mudar quem está no ar, e trocar de cena não
 * deve derrubar o que já foi arrumado.
 *
 * O que mora aqui é ONDE cada retrato está e se está no ar — não QUEM tem
 * retrato. Quem tem sai dos tokens da cena, e é decidido em `retratosDaCena`.
 * Guardar a lista de participantes aqui obrigaria a mantê-la de acordo com as
 * cenas a cada item que entra ou sai do mapa.
 *
 * Fica na sessão e não no vault do personagem: onde a figura está na tela é
 * bancada, como a posição das janelas — não viaja no zip.
 */
export const usePortraitStore = create<PortraitStore>((set, get) => ({
  portraits: [],
  filaAuto: false,
  ancora: "baixo-centro",
  folga: FOLGA_PADRAO,
  hydratedPath: null,

  async hydrate(campaignPath) {
    if (get().hydratedPath === campaignPath) return;

    // Zera antes de ler: elenco da campanha anterior na tela seria pior que
    // palco vazio por um instante.
    set({ portraits: [], hydratedPath: campaignPath });

    try {
      set(ler(await loadPortraits()));
    } catch {
      // Sessão sem retrato guardado é estado válido; não derruba a tela.
    }
  },

  armar(personagemId, assetId, naturalWidth, naturalHeight) {
    const existente = get().portraits.find((retrato) => retrato.personagemId === personagemId);

    if (existente) {
      get().update(existente.id, { visible: true, assetId });
      return;
    }

    // No fim da lista: o mais novo fica na frente, como acontece ao empilhar
    // qualquer coisa numa mesa.
    persist(
      [...get().portraits, createPortrait(personagemId, assetId, naturalWidth, naturalHeight)],
      set,
    );
  },

  desarmar(personagemId) {
    const existente = get().portraits.find((retrato) => retrato.personagemId === personagemId);
    if (existente) get().update(existente.id, { visible: false });
  },

  update(id, patch) {
    persist(
      get().portraits.map((portrait) =>
        portrait.id === id ? { ...portrait, ...patch } : portrait,
      ),
      set,
    );
  },

  updateMany(patches) {
    if (patches.length === 0) return;

    const byId = new Map(patches.map(({ id, patch }) => [id, patch]));

    persist(
      get().portraits.map((portrait) => {
        const patch = byId.get(portrait.id);
        return patch ? { ...portrait, ...patch } : portrait;
      }),
      set,
    );
  },

  remove(id) {
    persist(
      get().portraits.filter((portrait) => portrait.id !== id),
      set,
    );
  },

  alternarFila() {
    const filaAuto = !get().filaAuto;
    set({ filaAuto });
    persist(get().portraits, set, { filaAuto });
  },

  ancorar(ancora) {
    set({ ancora });
    persist(get().portraits, set, { ancora });
  },

  ajustarFolga(folga) {
    const limitada = limitarFolga(folga);

    set({ folga: limitada });
    persist(get().portraits, set, { folga: limitada });
  },

  receive(portraits) {
    // Espectador não grava: o disco pertence a quem opera.
    set({ portraits });
  },
}));

let persistTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Grava a sessão inteira, e não só a lista.
 *
 * O arquivo virou objeto porque a fila tem campos que são de todos os retratos.
 * `extra` existe para as ações que mexem NESSES campos: o `set` delas
 * já aconteceu, mas o estado do store ainda não chegou aqui pelo `get` do
 * chamador — passar o valor novo à mão evita gravar o antigo.
 */
function persist(
  portraits: Portrait[],
  set: (partial: { portraits: Portrait[] }) => void,
  extra?: Partial<Pick<RetratosSalvos, "filaAuto" | "ancora" | "folga">>,
) {
  set({ portraits });

  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => void savePortraits(tudo(extra)), PERSIST_DEBOUNCE_MS);
}

/** O objeto que vai para o disco. */
function tudo(extra?: Partial<Pick<RetratosSalvos, "filaAuto" | "ancora" | "folga">>): RetratosSalvos {
  const { portraits, filaAuto, ancora, folga } = usePortraitStore.getState();

  return { retratos: portraits, filaAuto, ancora, folga, ...extra };
}

/**
 * O que veio do disco, tolerando as três formas.
 *
 * `null` é campanha sem arquivo. ARRAY é o formato antigo, de quando retrato era
 * só uma lista. Objeto é o de agora. Uma quarta forma qualquer cai no padrão,
 * como o resto das leituras de disco deste projeto.
 *
 * Registro sem `personagemId` é retrato SOLTO, de quando qualquer imagem do
 * acervo podia virar um. O conceito saiu: a lista deriva dos tokens da cena, e
 * um solto não teria linha nenhuma para ser desligado — ficaria publicado para a
 * mesa e fora do alcance do mestre. Some na leitura.
 */
function ler(cru: unknown): Pick<PortraitStore, "portraits" | "filaAuto" | "ancora" | "folga"> {
  const padrao = {
    portraits: [],
    filaAuto: false,
    ancora: "baixo-centro" as AncoraRetrato,
    folga: FOLGA_PADRAO,
  };

  const lista = Array.isArray(cru)
    ? cru
    : typeof cru === "object" && cru !== null && Array.isArray((cru as RetratosSalvos).retratos)
      ? (cru as RetratosSalvos).retratos
      : null;

  if (!lista) return padrao;

  const objeto = Array.isArray(cru) ? null : (cru as RetratosSalvos);

  return {
    portraits: (lista as Portrait[]).filter((retrato) => Boolean(retrato?.personagemId)),
    filaAuto: typeof objeto?.filaAuto === "boolean" ? objeto.filaAuto : padrao.filaAuto,
    ancora: ANCORAS.has(objeto?.ancora as AncoraRetrato) ? objeto!.ancora : padrao.ancora,
    // Arquivo de antes do ajuste não tem o campo, e `limitarFolga` devolve o
    // padrão para isso pelo mesmo caminho que usa para lixo.
    folga: limitarFolga(objeto?.folga),
  };
}

/** As áncoras válidas, para não aceitar uma string qualquer do disco. */
const ANCORAS = new Set<AncoraRetrato>([
  "cima-esquerda",
  "cima-centro",
  "cima-direita",
  "baixo-esquerda",
  "baixo-centro",
  "baixo-direita",
]);

/**
 * Grava agora o que estiver pendente. Ver `flushBoard` em `use-scene-store`.
 */
export async function flushPortraits(): Promise<void> {
  clearTimeout(persistTimer);
  persistTimer = undefined;

  await savePortraits(tudo());
}
