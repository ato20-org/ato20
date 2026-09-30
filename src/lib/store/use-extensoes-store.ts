"use client";

import { create } from "zustand";

import {
  type Extensao,
  habilitarExtensao,
  importarExtensao,
  listarExtensoes,
  removerExtensao,
} from "@/lib/extensoes/manifesto";
import { useConfiguracoesStore } from "@/lib/configuracoes/registro";
import type { Definicao } from "@/lib/configuracoes/valor";
import { descarregar, garantirCarregada } from "@/lib/extensoes/carregar";
import { aplicarTemas } from "@/lib/extensoes/tema";
import { useDeclarativoStore } from "@/lib/store/use-declarativo-store";
import { isDesktop, VaultError } from "@/lib/vault/bridge";

/**
 * As extensões instaladas nesta máquina.
 *
 * Store próprio e não parte do `usePreferenciasStore`, apesar de as duas serem
 * "da máquina": aquele guarda o que a tela decide sozinha e grava no
 * `localStorage`, e este é uma lista que vive no DISCO, sob o Rust. Misturar
 * os dois daria um store em que metade dos campos é síncrona e a outra metade
 * pede `await`.
 *
 * A lista inteira a cada mudança, e não um item alterado no lugar: quem sabe o
 * que existe é o disco — apagar a pasta pelo gerenciador de arquivos é um
 * jeito legítimo de desinstalar —, e recarregar é o que mantém a tela honesta
 * sobre isso.
 */

type ExtensoesStore = {
  extensoes: Extensao[];
  /** A lista já foi lida uma vez. Antes disso, vazia não quer dizer nenhuma. */
  carregada: boolean;
  /** Uma operação está em curso. Segura os botões. */
  ocupada: boolean;
  /** A última falha, para a tela mostrar. `null` quando não há. */
  erro: string | null;

  carregar: () => Promise<void>;
  importar: () => Promise<void>;
  remover: (id: string) => Promise<void>;
  habilitar: (id: string, habilitada: boolean) => Promise<void>;
};

/** A mensagem de um erro do Rust, ou o que houver. */
function mensagem(causa: unknown): string {
  if (causa instanceof VaultError) return causa.message;

  return "Falha ao falar com o aplicativo.";
}

export const useExtensoesStore = create<ExtensoesStore>((set, get) => ({
  extensoes: [],
  carregada: false,
  ocupada: false,
  erro: null,

  async carregar() {
    // Fora do aplicativo não há disco para ler. A lista fica vazia e
    // carregada, que é o estado honesto: nenhuma extensão, e não um erro.
    if (!isDesktop()) {
      set({ carregada: true });
      return;
    }

    try {
      set({ extensoes: await listarExtensoes(), carregada: true, erro: null });
    } catch (causa) {
      set({ carregada: true, erro: mensagem(causa) });
    }
  },

  async importar() {
    if (get().ocupada) return;

    set({ ocupada: true, erro: null });

    try {
      const nova = await importarExtensao();

      // `null` é o diálogo fechado sem escolher. Cancelar não é falha, e
      // recarregar a lista por causa dele seria trabalho por nada.
      if (nova) await get().carregar();
    } catch (causa) {
      set({ erro: mensagem(causa) });
    } finally {
      set({ ocupada: false });
    }
  },

  async remover(id) {
    if (get().ocupada) return;

    set({ ocupada: true, erro: null });

    // Desfaz ANTES de apagar do disco: o que a extensão registrou continua na
    // interface até alguém desfazer, e um painel de plugin que já não existe no
    // disco é pior que um erro -- ele parece funcionar.
    descarregar(id);

    try {
      await removerExtensao(id);
      await get().carregar();
    } catch (causa) {
      set({ erro: mensagem(causa) });
    } finally {
      set({ ocupada: false });
    }
  },

  async habilitar(id, habilitada) {
    // Otimista, ao contrário de importar e remover: o interruptor tem de
    // responder ao dedo, e o que ele liga é um `<link>` que já está no disco.
    // Os outros dois mexem em arquivo e podem demorar o que o disco demorar.
    const antes = get().extensoes;

    // Desligar solta o módulo. Religar NÃO o carrega de volta aqui: quem o
    // importa é o painel ou o comando ao ser usado, e é o que mantém a
    // ativação preguiçosa valendo depois do primeiro ciclo.
    if (!habilitada) descarregar(id);

    set({
      extensoes: antes.map((extensao) =>
        extensao.id === id ? { ...extensao, habilitada } : extensao,
      ),
      erro: null,
    });

    try {
      await habilitarExtensao(id, habilitada);
    } catch (causa) {
      // Volta ao que era: o interruptor mostrando o contrário do que vale é
      // pior que não ter mudado.
      set({ extensoes: antes, erro: mensagem(causa) });
    }
  },
}));

/**
 * Os temas seguem a lista, fora do React.
 *
 * Aqui e não num `useEffect` porque o que isto mexe é o `<head>` do documento,
 * que não pertence a componente nenhum: um efeito em algum painel faria o tema
 * do aplicativo depender de aquele painel estar montado — e a tela de
 * Configurações, que é de onde se liga uma extensão, desmonta ao fechar.
 *
 * É a mesma escolha do `usePanelsStore`, que grava a preferência de coluna por
 * um `subscribe` e não por efeito.
 */
useExtensoesStore.subscribe((estado, anterior) => {
  if (estado.extensoes === anterior.extensoes) return;

  aplicarTemas(estado.extensoes);
  sincronizarConfiguracoes(estado.extensoes);
  // Os estilos de medidor pelo mesmo caminho: a lista muda, o Mestre relê os
  // SVGs das habilitadas e publica o conjunto para a mesa.
  void useDeclarativoStore.getState().sincronizar(estado.extensoes);
  // Quem pediu para subir na abertura sobe agora, sem esperar o painel abrir:
  // é o plugin que trabalha sozinho -- escuta a mesa e publica para uma
  // página. `garantirCarregada` é idempotente, então religar a lista não o
  // importa duas vezes; desligar é `descarregar`, pelo caminho de sempre.
  for (const extensao of estado.extensoes) {
    if (extensao.habilitada && extensao.ativacao === "abertura") void garantirCarregada(extensao);
  }
});

/**
 * As configurações declaradas entram no registro pelo mesmo caminho do tema:
 * a lista muda, o registro recebe a lista inteira do que está habilitado. Só
 * HABILITADO -- a de um plugin desligado sai da tela, e o valor gravado dela
 * fica no arquivo, para voltar quando ele religar.
 *
 * O `dono` é o id da extensão, e é por ele que a tela agrupa e que o registro
 * esquece: uma chamada com a lista nova substitui tudo que é de plugin.
 */
function sincronizarConfiguracoes(extensoes: Extensao[]): void {
  const definicoes: Definicao[] = extensoes
    .filter((extensao) => extensao.habilitada)
    .flatMap((extensao) =>
      (extensao.contribui?.configuracoes ?? []).map((c) => ({
        chave: c.chave,
        titulo: c.titulo,
        descricao: c.descricao ?? undefined,
        tipo: c.tipo,
        padrao: c.padrao,
        escopo: c.escopo,
        opcoes: c.opcoes.length > 0 ? c.opcoes : undefined,
        minimo: c.minimo ?? undefined,
        maximo: c.maximo ?? undefined,
        dono: extensao.id,
      })),
    );

  useConfiguracoesStore.getState().definirDeExtensoes(definicoes);
}
