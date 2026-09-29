"use client";

import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

import type { Componentes, Experimental } from "@/lib/extensoes/componentes";
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

/**
 * A versão do contrato. O manifesto declara qual ele fala.
 *
 * A 2 acrescentou `janelas`, `ui.componentes`, `ui.experimental` e
 * `ui.icones`, e o `parametro` do painel. Nada da 1 saiu: um plugin que pede 1
 * recebe o mesmo objeto, com o novo ao lado.
 */
export const API_VERSAO_ATUAL = 2;

/** O que o plugin sabe da cena sem poder mexer no formato dela. */
export type CenaResumo = {
  id: string;
  nome: string;
  /** Os itens, em cópia rasa. Mexer nesta lista não mexe na cena. */
  itens: ReadonlyArray<Readonly<CanvasItem>>;
};

/**
 * O que `registrar.painel` recebe. O corpo é um componente React comum.
 *
 * `parametro` chega quando a janela foi aberta por `janelas.abrir` com um: é
 * o que faz o mesmo painel servir para "a ficha do Edgar" e "a ficha da
 * Mira", em duas janelas. Aberto pelo menu, sem parâmetro, ele vem `undefined`.
 */
export type PainelRegistrado = {
  id: string;
  corpo: ComponentType<{ parametro?: string }>;
};

/**
 * Uma janela que o plugin pede para abrir ou fechar.
 *
 * Duas famílias. A do PRÓPRIO plugin é um painel declarado no manifesto, com
 * `parametro` opcional para abrir mais de uma instância dele, e `titulo` para
 * a instância ter nome próprio na aba ("Edgar", e não "Ficha"). A de FÁBRICA
 * são as telas do aplicativo que fazem sentido abrir de fora -- a ficha de um
 * personagem, a lista de personagens, a configuração da campanha. Anexo, asset
 * e livro ficam de fora: pedem identidades que a API não entrega ainda.
 */
export type JanelaDeExtensao =
  | { painel: string; parametro?: string; titulo?: string }
  | { tela: "personagem"; personagemId: string }
  | {
      tela:
        | "personagens"
        | "configuracao"
        | "rolagens"
        | "cenas"
        | "quadros"
        | "retratos"
        | "imagens"
        | "sons"
        | "camadas"
        | "estante"
        | "miniplayer";
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

  /**
   * Abre e fecha janelas, as do plugin e as de fábrica.
   *
   * Onde a janela já estiver -- atracada numa coluna ou flutuando --, `abrir`
   * a traz à vista em vez de duplicar. Ver `abrirJanela`.
   */
  janelas: {
    abrir: (janela: JanelaDeExtensao) => void;
    fechar: (janela: JanelaDeExtensao) => void;
  };

  ui: {
    /** Aviso na tela, no mesmo canto em que o aplicativo já avisa. */
    aviso: (texto: string) => void;
    erro: (texto: string) => void;
    /**
     * Os componentes do aplicativo, para o plugin parecer parte dele.
     *
     * `componentes` é compromisso: as props que estão lá ficam. `experimental`
     * funciona e pode mudar sem aviso. Ver `lib/extensoes/componentes.ts`.
     */
    componentes: Componentes;
    experimental: Experimental;
    /**
     * Ícones pelo nome -- `icones.caveira`, `icones.ficha`. Só os que o
     * aplicativo já carrega; ver `lib/extensoes/icones.ts` para a lista e para
     * o motivo de não ser o `lucide-react` inteiro.
     */
    icones: Readonly<Record<string, LucideIcon>>;
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
