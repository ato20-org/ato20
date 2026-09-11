"use client";

import type { ComponentType } from "react";

import type { CanvasItem, Scene } from "@/types/scene";

/**
 * O contrato que uma extensão de código recebe.
 *
 * Este arquivo é a promessa do projeto para quem escreve plugin. Tudo que está
 * aqui vira compromisso de compatibilidade; tudo que NÃO está pode mudar sem
 * aviso — e é por isso que ele é pequeno de propósito.
 *
 * **Ações nomeadas, e nunca os stores.** O plugin não alcança `useSceneStore`.
 * Se alcançasse, todo plugin passaria a depender do formato interno de `Scene`
 * e dos nomes dos métodos do zustand, e mexer neles quebraria o ecossistema —
 * que é exatamente o que matou a compatibilidade de plugins do Atom. Uma ação
 * nomeada é um contrato que dá para manter enquanto o interior muda.
 *
 * **O React vem por aqui, não pelo `import` do plugin.** A interface tem uma
 * instância só, e uma segunda quebraria os hooks dela. É a razão de `react`
 * estar no objeto em vez de ser uma dependência do autor.
 */

/** A versão do contrato. O manifesto declara qual ele fala. */
export const API_VERSAO_ATUAL = 1;

/** O que o plugin sabe da cena sem poder mexer no formato dela. */
export type CenaResumo = {
  id: string;
  nome: string;
  /** Os itens, em cópia rasa. Mexer nesta lista não mexe na cena. */
  itens: ReadonlyArray<Readonly<CanvasItem>>;
};

/** O que `registrar.painel` recebe. O corpo é um componente React comum. */
export type PainelRegistrado = {
  id: string;
  corpo: ComponentType;
};

export type ComandoRegistrado = {
  id: string;
  executar: () => void | Promise<void>;
};

export type FerramentaRegistrada = {
  id: string;
  /** Clique no palco, em coordenadas de CENA — o plano fixo de 1920x1080. */
  aoClicar?: (ponto: { x: number; y: number }) => void;
  /** Arrasto terminado, também em coordenadas de cena. */
  aoArrastar?: (area: { x: number; y: number; largura: number; altura: number }) => void;
};

/** Uma camada é um componente desenhado sobre o mapa, no palco do mestre. */
export type CamadaRegistrada = {
  id: string;
  corpo: ComponentType;
};

/** O que todo `registrar.*` devolve: a função que desfaz. */
export type Desfazer = () => void;

export type Ato20Api = {
  /** A versão do contrato que este aplicativo implementa. */
  versao: number;

  /** O MESMO React da interface. Não empacote outro. */
  react: typeof import("react");

  extensao: {
    id: string;
    versao: string;
    /** A URL de um arquivo de dentro da pasta da extensão. */
    url: (arquivo: string) => string;
  };

  cena: {
    /** A cena em EDIÇÃO — a que o mestre está montando, não a que está no ar. */
    atual: () => CenaResumo | null;
    /**
     * Avisa a cada mudança na cena em edição. Devolve a função que cancela.
     *
     * É o caminho para um painel se manter em dia sem pesquisar o estado a cada
     * render — e é o único caminho, porque o store não é alcançável daqui.
     */
    assinar: (aviso: (cena: CenaResumo | null) => void) => Desfazer;

    moverItem: (itemId: string, ponto: { x: number; y: number }) => void;
    /**
     * Muda posição, tamanho ou giro de um item. Campos fora desses são
     * ignorados — o plugin não reescreve o item inteiro, e é o que impede um
     * `assetId` trocado por engano de apagar a imagem de alguém.
     */
    ajustarItem: (
      itemId: string,
      patch: Partial<Pick<CanvasItem, "x" | "y" | "width" | "height" | "rotation">>,
    ) => void;

    /**
     * O guardado DESTA extensão, dentro da cena.
     *
     * Vive em `scene.extensoes[id]`, viaja no zip da campanha e some do payload
     * publicado pelo mesmo caminho que apaga alfinete e postit — então o que o
     * plugin escrever aqui não chega à mesa. Ver `sceneForTable`.
     */
    dados: <T = unknown>() => T | undefined;
    gravarDados: (valor: unknown) => void;
  };

  personagens: {
    listar: () => ReadonlyArray<{ id: string; nome: string }>;
  };

  /** Aviso na tela, no mesmo canto em que o aplicativo já avisa. */
  ui: {
    aviso: (texto: string) => void;
    erro: (texto: string) => void;
  };

  registrar: {
    painel: (painel: PainelRegistrado) => Desfazer;
    comando: (comando: ComandoRegistrado) => Desfazer;
    ferramenta: (ferramenta: FerramentaRegistrada) => Desfazer;
    camada: (camada: CamadaRegistrada) => Desfazer;
  };
};

/**
 * O que o módulo de uma extensão exporta por padrão.
 *
 * `desativar` é opcional: o que `ativar` devolveu já é desfeito pelo
 * aplicativo. Existe para o que o plugin criou por fora — um `setInterval`, um
 * ouvinte no `window`, um arquivo aberto.
 */
export type ModuloExtensao = {
  ativar?: (api: Ato20Api) => void | Desfazer | Promise<void | Desfazer>;
  desativar?: () => void;
};

/** A cena, reduzida ao que o contrato promete. */
export function resumoDaCena(scene: Scene | null): CenaResumo | null {
  if (!scene) return null;

  return { id: scene.id, nome: scene.name, itens: scene.items };
}
