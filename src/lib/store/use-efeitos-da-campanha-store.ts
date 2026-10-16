"use client";

import { toast } from "sonner";
import { create } from "zustand";

import { t } from "@/lib/i18n/mestre";
import { useDeclarativoStore } from "@/lib/store/use-declarativo-store";
import { daemonAddr, isDesktop } from "@/lib/vault/bridge";
import {
  criarMoldeDeEfeito,
  efeitoEmJogo,
  guardarEfeitoNoCompendio,
  trazerDoCompendio,
} from "@/lib/vault/compendio";
import {
  apagarEfeitoDaCampanha,
  criarEfeitoDaCampanha,
  listarEfeitosDaCampanha,
  salvarEfeitoDaCampanha,
} from "@/lib/vault/efeitos";
import type { DefinicaoDeEfeito } from "@/types/efeito";

/**
 * Os efeitos que a campanha criou no editor, lidos na ABERTURA da campanha.
 *
 * Na abertura, e não quando o editor abre: a condição que aponta para um deles
 * tem de desenhar no palco e na TV desde o primeiro quadro. Cada mudança vai
 * para o declarativo (`definirEfeitosDaCampanha`), que é como eles chegam à
 * TV e ao celular -- o mesmo caminho dos efeitos de plugin.
 *
 * Gravar é otimista: a lista muda na hora, para a prévia andar com o
 * controle, e o disco recebe o efeito um instante depois de o mestre parar de
 * mexer. Ver `salvar`.
 */
type EfeitosDaCampanhaStore = {
  /**
   * Os efeitos EM JOGO: os do seletor, os do cardápio, os que vão à mesa.
   * `null` = ainda não leu.
   *
   * Sem os moldes do Compêndio -- ver `moldes` --, e é isso que deixa toda
   * tela que já lia esta lista continuar lendo só o que está em jogo.
   */
  efeitos: DefinicaoDeEfeito[] | null;
  /**
   * Os moldes de efeito do Compêndio: o mesmo `efeitos.json`, marcados com
   * `compendio`, lidos na mesma ida ao Rust e guardados à parte. Não vão à
   * mesa. O editor os edita como edita os em jogo -- `salvar` acha o efeito
   * na lista em que ele estiver.
   */
  moldes: DefinicaoDeEfeito[] | null;
  pedido: number;
  carregar: () => Promise<void>;
  esquecer: () => void;
  criar: () => Promise<DefinicaoDeEfeito | null>;
  /** Troca o efeito na lista agora, e grava no disco depois. */
  salvar: (efeito: DefinicaoDeEfeito) => void;
  apagar: (id: string) => Promise<void>;
  /** Um molde em branco no Compêndio. Ver `efeitos::criar_molde`. */
  criarMolde: () => Promise<DefinicaoDeEfeito | null>;
  /** O molde entra em jogo. Recusa com o motivo quando os 32 estão cheios. */
  porEmJogo: (id: string) => Promise<boolean>;
  /**
   * Uma cópia EM JOGO do molde, para a condição que vai a um token: o molde
   * fica no Compêndio, como o do Bestiário. Reaproveita a cópia que já está em
   * jogo e ainda desenha igual a ele -- o segundo goblin em chamas não gasta
   * outro dos trinta e dois --, e faz outra quando o molde mudou desde a
   * primeira: o token novo recebe o efeito como o Compêndio o tem agora, e os
   * de antes não mudam. `null` quando não deu, com o motivo já avisado.
   */
  copiaEmJogo: (moldeId: string) => Promise<DefinicaoDeEfeito | null>;
  /**
   * Um efeito do Compêndio do ATO20 em jogo nesta campanha, para um token. Na
   * primeira vez ele é trazido -- com as imagens, como o "Trazer" -- e vai
   * direto ao jogo, sem deixar um card no Compêndio da campanha: quem pediu
   * foi o token, e não a biblioteca. Depois, a marca `ato20` acha o que já
   * veio. `null` quando não deu, com o motivo já avisado.
   */
  doAto20EmJogo: (idNoAto20: string) => Promise<DefinicaoDeEfeito | null>;
  /**
   * O id EM JOGO de um efeito arrastado do Compêndio até o mapa -- para a
   * condição de um token, ou para uma área nova: a cópia do molde da campanha,
   * o trazido do ATO20, ou ele mesmo, quando já está em jogo ou é de fábrica.
   * `null` quando não deu, com o motivo já avisado.
   */
  paraOJogo: (id: string, doAto20?: boolean) => Promise<string | null>;
  /** O efeito em jogo volta ao Compêndio. Recusa se o menu o usa. */
  guardar: (id: string) => Promise<boolean>;
};

/** Quanto o disco espera depois do último toque num controle. */
const ESPERA_PARA_GRAVAR = 400;

const gravacoes = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * As cópias a caminho, por molde (e por `ato20:{id}`, as que vêm de lá): dois
 * tokens soltos juntos levam a mesma.
 */
const copiando = new Map<string, Promise<DefinicaoDeEfeito | null>>();

/** O que não é desenho: o endereço, a marca e o que só serve ao Compêndio. */
const FORA_DO_DESENHO = ["id", "molde", "ato20", "compendio", "tags", "origem"] as const;

/** Os dois desenham igual? Com as chaves em ordem: o Rust devolve na dele. */
function mesmoDesenho(a: DefinicaoDeEfeito, b: DefinicaoDeEfeito): boolean {
  const desenho = (efeito: DefinicaoDeEfeito) => {
    const resto: Partial<DefinicaoDeEfeito> = { ...efeito };
    for (const chave of FORA_DO_DESENHO) delete resto[chave];
    return JSON.stringify(emOrdem(resto));
  };

  return desenho(a) === desenho(b);
}

function emOrdem(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(emOrdem);
  if (!valor || typeof valor !== "object") return valor;

  const objeto = valor as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(objeto)
      .sort()
      .map((chave) => [chave, emOrdem(objeto[chave])]),
  );
}

export const useEfeitosDaCampanhaStore = create<EfeitosDaCampanhaStore>((set, get) => ({
  efeitos: null,
  moldes: null,
  pedido: 0,

  async carregar() {
    const meu = get().pedido + 1;
    set({ pedido: meu });

    try {
      // O endereço do daemon antes: no Mestre, a imagem do acervo só tem
      // endereço depois que ele respondeu. Ver `urlDoAcervo`.
      if (isDesktop()) await daemonAddr();
      const todos = await listarEfeitosDaCampanha();
      if (get().pedido !== meu) return;

      const efeitos = todos.filter((efeito) => !efeito.compendio);
      set({ efeitos, moldes: todos.filter((efeito) => efeito.compendio) });
      publicar(efeitos);
    } catch (cause) {
      if (get().pedido !== meu) return;
      set({ efeitos: [], moldes: [] });
      publicar([]);
      toast.error(cause instanceof Error ? cause.message : t.efeitosDaCampanha.falhaAoLer);
    }
  },

  esquecer() {
    for (const espera of gravacoes.values()) clearTimeout(espera);
    gravacoes.clear();
    set({ efeitos: null, moldes: null, pedido: get().pedido + 1 });
    publicar([]);
  },

  async criar() {
    try {
      const novo = await criarEfeitoDaCampanha();
      const efeitos = [...(get().efeitos ?? []), novo];
      set({ efeitos });
      publicar(efeitos);
      return novo;
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t.efeitosDaCampanha.falhaAoCriar);
      return null;
    }
  },

  salvar(efeito) {
    // O molde se edita no mesmo editor: a troca vale para a lista em que ele
    // estiver, e só a dos em jogo vai à mesa.
    // A marca vai junto: "partir de um pronto" troca o efeito por uma cópia
    // limpa, sem ela, e o molde viraria em jogo na próxima leitura da lista.
    if (get().moldes?.some((atual) => atual.id === efeito.id)) {
      efeito = { ...efeito, compendio: true };
      const molde = efeito;
      set({
        moldes: (get().moldes ?? []).map((atual) => (atual.id === molde.id ? molde : atual)),
      });
    } else {
      const efeitos = (get().efeitos ?? []).map((atual) => (atual.id === efeito.id ? efeito : atual));
      set({ efeitos });
      publicar(efeitos);
    }

    const antes = gravacoes.get(efeito.id);
    if (antes) clearTimeout(antes);
    gravacoes.set(
      efeito.id,
      setTimeout(() => {
        gravacoes.delete(efeito.id);
        salvarEfeitoDaCampanha(efeito).catch((cause: unknown) =>
          toast.error(
            cause instanceof Error ? cause.message : t.efeitosDaCampanha.falhaAoGravar,
          ),
        );
      }, ESPERA_PARA_GRAVAR),
    );
  },

  async apagar(id) {
    const espera = gravacoes.get(id);
    if (espera) clearTimeout(espera);
    gravacoes.delete(id);

    try {
      await apagarEfeitoDaCampanha(id);
      const efeitos = (get().efeitos ?? []).filter((efeito) => efeito.id !== id);
      set({ efeitos, moldes: (get().moldes ?? []).filter((efeito) => efeito.id !== id) });
      publicar(efeitos);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t.efeitosDaCampanha.falhaAoApagar);
    }
  },

  async criarMolde() {
    try {
      const novo = await criarMoldeDeEfeito();
      set({ moldes: [...(get().moldes ?? []), novo] });
      return novo;
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t.efeitosDaCampanha.falhaAoCriar);
      return null;
    }
  },

  async porEmJogo(id) {
    try {
      const posto = await efeitoEmJogo(id);
      const efeitos = [...(get().efeitos ?? []), posto];
      set({ efeitos, moldes: (get().moldes ?? []).filter((efeito) => efeito.id !== id) });
      publicar(efeitos);
      return true;
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t.efeitosDaCampanha.falhaAoGravar);
      return false;
    }
  },

  copiaEmJogo(moldeId) {
    const aCaminho = copiando.get(moldeId);
    if (aCaminho) return aCaminho;

    const molde = get().moldes?.find((efeito) => efeito.id === moldeId);
    if (!molde) return Promise.resolve(null);

    const igual = get().efeitos?.find(
      (efeito) => efeito.molde === moldeId && mesmoDesenho(efeito, molde),
    );
    if (igual) return Promise.resolve(igual);

    const copiar = (async () => {
      const novo = await get().criar();
      if (!novo) return null;

      const copia: DefinicaoDeEfeito = { ...molde, id: novo.id, molde: moldeId };
      delete copia.compendio;
      delete copia.tags;

      // Gravada já, e não no tempo do editor: a condição que vem logo depois
      // aponta para ela, e o disco não pode ficar com o efeito em branco.
      try {
        const gravada = await salvarEfeitoDaCampanha(copia);
        const efeitos = (get().efeitos ?? []).map((atual) =>
          atual.id === gravada.id ? gravada : atual,
        );
        set({ efeitos });
        publicar(efeitos);
        return gravada;
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : t.efeitosDaCampanha.falhaAoGravar);
        await get().apagar(novo.id);
        return null;
      }
    })().finally(() => copiando.delete(moldeId));

    copiando.set(moldeId, copiar);
    return copiar;
  },

  doAto20EmJogo(idNoAto20) {
    const chave = `ato20:${idNoAto20}`;
    const aCaminho = copiando.get(chave);
    if (aCaminho) return aCaminho;

    const emJogo = get().efeitos?.find((efeito) => efeito.ato20 === idNoAto20);
    if (emJogo) return Promise.resolve(emJogo);

    // Já veio, e foi guardado no Compêndio da campanha depois: é molde de lá.
    const guardado = get().moldes?.find((efeito) => efeito.ato20 === idNoAto20);
    if (guardado) return get().copiaEmJogo(guardado.id);

    const trazer = (async () => {
      const conhecidos = new Set(
        [...(get().efeitos ?? []), ...(get().moldes ?? [])].map((efeito) => efeito.id),
      );

      // O "Trazer" não diz o id que deu: o trazido é o molde que não havia.
      // Lido à parte, e não pelo `carregar`, que trocaria as listas inteiras
      // por baixo de um editor aberto.
      let trazido: DefinicaoDeEfeito | undefined;
      try {
        await trazerDoCompendio({ efeitos: [idNoAto20] });
        trazido = (await listarEfeitosDaCampanha()).find(
          (efeito) => efeito.compendio && !conhecidos.has(efeito.id),
        );
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : t.efeitosDaCampanha.falhaAoGravar);
        return null;
      }
      if (!trazido) return null;
      set({ moldes: [...(get().moldes ?? []), trazido] });

      // Com os trinta e dois cheios, ele fica no Compêndio da campanha, e o
      // store já disse por quê. A marca vai nos dois casos.
      const entrou = await get().porEmJogo(trazido.id);
      const lista = entrou ? get().efeitos : get().moldes;
      const atual = lista?.find((efeito) => efeito.id === trazido.id) ?? trazido;
      const marcado = { ...atual, ato20: idNoAto20 };
      get().salvar(marcado);

      return entrou ? marcado : null;
    })().finally(() => copiando.delete(chave));

    copiando.set(chave, trazer);
    return trazer;
  },

  async paraOJogo(id, doAto20) {
    if (doAto20) return (await get().doAto20EmJogo(id))?.id ?? null;
    if (get().moldes?.some((molde) => molde.id === id)) {
      return (await get().copiaEmJogo(id))?.id ?? null;
    }
    return id;
  },

  async guardar(id) {
    try {
      const guardado = await guardarEfeitoNoCompendio(id);
      const efeitos = (get().efeitos ?? []).filter((efeito) => efeito.id !== id);
      set({ efeitos, moldes: [...(get().moldes ?? []), guardado] });
      publicar(efeitos);
      return true;
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t.efeitosDaCampanha.falhaAoGravar);
      return false;
    }
  },
}));

function publicar(efeitos: DefinicaoDeEfeito[]): void {
  useDeclarativoStore.getState().definirEfeitosDaCampanha(efeitos);
}

/** A campanha passou a ser outra. O gêmeo de `esquecerCondicoes`. */
export function esquecerEfeitosDaCampanha(): void {
  useEfeitosDaCampanhaStore.getState().esquecer();
}
