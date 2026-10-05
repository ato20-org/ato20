"use client";

import { toast } from "sonner";
import { create } from "zustand";

import { useDeclarativoStore } from "@/lib/store/use-declarativo-store";
import { daemonAddr, isDesktop } from "@/lib/vault/bridge";
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
  /** `null` = ainda não leu. */
  efeitos: DefinicaoDeEfeito[] | null;
  pedido: number;
  carregar: () => Promise<void>;
  esquecer: () => void;
  criar: () => Promise<DefinicaoDeEfeito | null>;
  /** Troca o efeito na lista agora, e grava no disco depois. */
  salvar: (efeito: DefinicaoDeEfeito) => void;
  apagar: (id: string) => Promise<void>;
};

/** Quanto o disco espera depois do último toque num controle. */
const ESPERA_PARA_GRAVAR = 400;

const gravacoes = new Map<string, ReturnType<typeof setTimeout>>();

export const useEfeitosDaCampanhaStore = create<EfeitosDaCampanhaStore>((set, get) => ({
  efeitos: null,
  pedido: 0,

  async carregar() {
    const meu = get().pedido + 1;
    set({ pedido: meu });

    try {
      // O endereço do daemon antes: no Mestre, a imagem do acervo só tem
      // endereço depois que ele respondeu. Ver `urlDoAcervo`.
      if (isDesktop()) await daemonAddr();
      const efeitos = await listarEfeitosDaCampanha();
      if (get().pedido !== meu) return;

      set({ efeitos });
      publicar(efeitos);
    } catch (cause) {
      if (get().pedido !== meu) return;
      set({ efeitos: [] });
      publicar([]);
      toast.error(cause instanceof Error ? cause.message : "Falha ao ler os efeitos.");
    }
  },

  esquecer() {
    for (const espera of gravacoes.values()) clearTimeout(espera);
    gravacoes.clear();
    set({ efeitos: null, pedido: get().pedido + 1 });
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
      toast.error(cause instanceof Error ? cause.message : "Falha ao criar o efeito.");
      return null;
    }
  },

  salvar(efeito) {
    const efeitos = (get().efeitos ?? []).map((atual) => (atual.id === efeito.id ? efeito : atual));
    set({ efeitos });
    publicar(efeitos);

    const antes = gravacoes.get(efeito.id);
    if (antes) clearTimeout(antes);
    gravacoes.set(
      efeito.id,
      setTimeout(() => {
        gravacoes.delete(efeito.id);
        salvarEfeitoDaCampanha(efeito).catch((cause: unknown) =>
          toast.error(cause instanceof Error ? cause.message : "Falha ao gravar o efeito."),
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
      set({ efeitos });
      publicar(efeitos);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao apagar o efeito.");
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
