"use client";

import { create } from "zustand";

import { createPortrait } from "@/lib/geometry/portrait";
import {
  ajustarUniao,
  desfazerUniao,
  juntarNaUniao,
  moverNaUniao,
  normalizarUnioes,
  tirarDaUniao,
  uniaoDaFilaAntiga,
  unirRetratos,
} from "@/lib/mestre/unioes";
import { loadPortraits, savePortraits, type RetratosSalvos } from "@/lib/vault/session";
import type { AncoraRetrato, Portrait, UniaoDeRetratos } from "@/types/scene";

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
   * Os conjuntos que se enfileiram. Ver `UniaoDeRetratos`.
   *
   * Substituem o interruptor de fila automática, que era um só para todos, mais
   * a área e a folga globais que vinham com ele. Retrato fora de toda união é
   * solto: fica onde foi largado, e nenhuma regra o move.
   *
   * A ordem da lista é a ordem de empilhamento quando duas uniões dividem a
   * mesma área da tela — ver `filasDeUnioes`.
   */
  unioes: UniaoDeRetratos[];
  /** Qual campanha estes retratos pertencem. Ver `use-scene-store`. */
  hydratedPath: string | null;

  hydrate: (campaignPath: string) => Promise<void>;
  /**
   * Põe o retrato do personagem no ar.
   *
   * Na primeira vez cria o registro no canto inferior; depois só liga o que já
   * existe, na posição em que foi deixado. É o que faz desligar e ligar de novo
   * devolver a figura onde ela estava, e não no canto.
   *
   * Entra SOLTO, sempre. A fila automática punha o novato no fim da fila
   * sozinha, e era o que fazia dela um interruptor global; com uniões, pôr
   * alguém num grupo é um gesto do mestre, e adivinhar em qual dos grupos ele
   * entraria seria errar na frente da mesa.
   */
  armar: (personagemId: string, assetId: string, naturalWidth?: number, naturalHeight?: number) => void;
  /** Tira do ar, mantendo a geometria e a união. Ver `armar`. */
  desarmar: (personagemId: string) => void;
  update: (id: string, patch: Partial<Portrait>) => void;
  /** Um update para N retratos: arrastar ou escalar em grupo é um gesto só. */
  updateMany: (patches: Array<{ id: string; patch: Partial<Portrait> }>) => void;
  remove: (id: string) => void;
  /** Cria uma união com estes retratos. Ver `unirRetratos`. */
  unir: (ids: string[]) => void;
  /** Acrescenta retratos a uma união existente, no fim dela. */
  juntar: (uniaoId: string, ids: string[]) => void;
  /** Desfaz a união: os membros viram soltos, onde estiverem. */
  desunir: (uniaoId: string) => void;
  /** Tira UM da união dele. A união que ficar vazia some. */
  soltar: (retratoId: string) => void;
  /** Move um membro dentro da união, ou para outra. É o arrasto da lista. */
  mover: (retratoId: string, uniaoId: string, destino: number) => void;
  /** Troca nome, cor, área ou folga de uma união. */
  ajustar: (
    uniaoId: string,
    patch: Partial<Pick<UniaoDeRetratos, "nome" | "cor" | "ancora" | "folga">>,
  ) => void;
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
  unioes: [],
  hydratedPath: null,

  async hydrate(campaignPath) {
    if (get().hydratedPath === campaignPath) return;

    // Zera antes de ler: elenco da campanha anterior na tela seria pior que
    // palco vazio por um instante.
    set({ portraits: [], unioes: [], hydratedPath: campaignPath });

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
    // Sai da união junto: um membro que não é mais retrato deixaria a união
    // governando um id que não existe, e a normalização da leitura só acontece
    // na próxima abertura da campanha.
    const unioes = tirarDaUniao(get().unioes, id);

    set({ unioes });
    persist(
      get().portraits.filter((portrait) => portrait.id !== id),
      set,
      { unioes },
    );
  },

  unir(ids) {
    aplicar(unirRetratos(get().unioes, ids, get().portraits), set, get);
  },

  juntar(uniaoId, ids) {
    aplicar(juntarNaUniao(get().unioes, uniaoId, ids), set, get);
  },

  desunir(uniaoId) {
    aplicar(desfazerUniao(get().unioes, uniaoId), set, get);
  },

  soltar(retratoId) {
    aplicar(tirarDaUniao(get().unioes, retratoId), set, get);
  },

  mover(retratoId, uniaoId, destino) {
    aplicar(moverNaUniao(get().unioes, retratoId, uniaoId, destino), set, get);
  },

  ajustar(uniaoId, patch) {
    aplicar(ajustarUniao(get().unioes, uniaoId, patch), set, get);
  },

  receive(portraits) {
    // Espectador não grava: o disco pertence a quem opera.
    //
    // E não recebe união: o que viaja pelo canal é a geometria já resolvida de
    // cada retrato. União é arrumação do Mestre — a mesa vê o resultado dela,
    // nunca o conceito.
    set({ portraits });
  },
}));

let persistTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Grava a lista de uniões nova e a põe no estado, num gesto só.
 *
 * Todas as ações de união terminam aqui, e é o que garante que nenhuma delas
 * esqueça de gravar: elas mudam a MESMA coisa, e a diferença entre elas está
 * toda na função pura que produziu a lista.
 */
function aplicar(
  unioes: UniaoDeRetratos[],
  set: (partial: Partial<PortraitStore>) => void,
  get: () => PortraitStore,
) {
  set({ unioes });
  persist(get().portraits, set, { unioes });
}

/**
 * Grava a sessão inteira, e não só a lista.
 *
 * O arquivo virou objeto porque as uniões são um segundo campo ao lado dos
 * retratos. `extra` existe para as ações que mexem NELAS: o `set` delas já
 * aconteceu, mas o estado do store ainda não chegou aqui pelo `get` do
 * chamador — passar o valor novo à mão evita gravar o antigo.
 */
function persist(
  portraits: Portrait[],
  set: (partial: Partial<PortraitStore>) => void,
  extra?: Partial<Pick<RetratosSalvos, "unioes">>,
) {
  set({ portraits });

  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => void savePortraits(tudo(extra)), PERSIST_DEBOUNCE_MS);
}

/** O objeto que vai para o disco. */
function tudo(extra?: Partial<Pick<RetratosSalvos, "unioes">>): RetratosSalvos {
  const { portraits, unioes } = usePortraitStore.getState();

  return { retratos: portraits, unioes, ...extra };
}

/**
 * O que veio do disco, tolerando as quatro formas.
 *
 * `null` é campanha sem arquivo. ARRAY é o formato mais antigo, de quando
 * retrato era só uma lista. Objeto com `filaAuto` é o da fila automática.
 * Objeto com `unioes` é o de agora. Uma quinta forma qualquer cai no padrão,
 * como o resto das leituras de disco deste projeto.
 *
 * Registro sem `personagemId` é retrato SOLTO, de quando qualquer imagem do
 * acervo podia virar um. O conceito saiu: a lista deriva dos tokens da cena, e
 * um solto não teria linha nenhuma para ser desligado — ficaria publicado para a
 * mesa e fora do alcance do mestre. Some na leitura.
 *
 * ## A migração da fila automática
 *
 * Ligada, ela era exatamente uma união com todo mundo que não tinha
 * `foraDaFila`, na área e com a folga globais. Virar essa união é o que deixa a
 * tela idêntica à que o mestre fechou na sessão anterior. Desligada, não havia
 * conjunto nenhum e ninguém é unido — a área e a folga gravadas se perdem, e é
 * de propósito: elas não governavam nada.
 */
function ler(cru: unknown): Pick<PortraitStore, "portraits" | "unioes"> {
  const padrao = { portraits: [], unioes: [] };

  const objeto =
    typeof cru === "object" && cru !== null && !Array.isArray(cru)
      ? (cru as FormatoAntigo)
      : null;

  const lista = Array.isArray(cru)
    ? cru
    : Array.isArray(objeto?.retratos)
      ? objeto.retratos
      : null;

  if (!lista) return padrao;

  const portraits = (lista as Array<Portrait & { foraDaFila?: boolean }>).filter(
    (retrato) => Boolean(retrato?.personagemId),
  );

  if (objeto?.unioes) {
    return {
      portraits,
      unioes: normalizarUnioes(
        objeto.unioes,
        portraits.map((retrato) => retrato.id),
      ),
    };
  }

  if (objeto?.filaAuto !== true) return { portraits, unioes: [] };

  return {
    portraits,
    unioes: uniaoDaFilaAntiga(
      portraits,
      portraits.filter((retrato) => retrato.foraDaFila).map((retrato) => retrato.id),
      objeto.ancora ?? "baixo-centro",
      objeto.folga ?? 0,
    ),
  };
}

/**
 * O arquivo como as versões anteriores o gravaram.
 *
 * Existe para a leitura poder olhar campos que saíram do tipo de hoje sem
 * espalhar `as` pelo caminho. Todos opcionais: cada versão gravou um conjunto
 * diferente deles.
 */
type FormatoAntigo = {
  retratos?: unknown;
  unioes?: unknown;
  filaAuto?: boolean;
  ancora?: AncoraRetrato;
  folga?: number;
};

/**
 * Grava agora o que estiver pendente. Ver `flushBoard` em `use-scene-store`.
 */
export async function flushPortraits(): Promise<void> {
  clearTimeout(persistTimer);
  persistTimer = undefined;

  await savePortraits(tudo());
}
