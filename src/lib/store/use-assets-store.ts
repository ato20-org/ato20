"use client";

import { create } from "zustand";

import { listAssets } from "@/lib/vault/assets";
import type { AssetKind, AssetMeta } from "@/types/scene";

type Acervo = {
  /** `null` é "ainda não leu", e não um acervo vazio. */
  assets: AssetMeta[] | null;
  /** Número do pedido mais novo. Ver `buscar`. */
  pedido: number;
  /** Há leitura a caminho. Separado do número porque `esquecer` zera um e não o outro. */
  emVoo: boolean;
};

type AssetsStore = {
  image: Acervo;
  audio: Acervo;
  file: Acervo;

  /** Lê se ninguém leu ainda. É o que cada tela chama ao montar. */
  garantir: (kind: AssetKind) => void;
  /**
   * Relê agora: alguém mexeu no acervo.
   *
   * Sem `kind` relê os dois — é o que serve a quem muda o ESCOPO de um arquivo
   * e não quer decidir de que tipo ele era.
   */
  recarregar: (kind?: AssetKind) => void;
  /**
   * Joga fora o que foi lido. Para quando o acervo passa a ser OUTRO.
   *
   * Uma campanha é uma pasta, e trocar de pasta troca o acervo inteiro. Sem
   * isto, os arquivos da campanha anterior ficariam guardados e nenhum
   * `garantir` os substituiria — o store veria uma leitura já feita.
   */
  esquecer: () => void;
};

const VAZIO: Acervo = { assets: null, pedido: 0, emVoo: false };

/**
 * O acervo da campanha, lido UMA vez por tipo.
 *
 * Isto era estado de cada componente, dentro do `useAssetList`, e as duas
 * consequências apareceram juntas. A primeira é custo: oito telas do mestre
 * pedem a lista de imagens — a biblioteca, a lista de personagens, a ficha, a
 * lista de camadas, os retratos, o post-it, o alfinete, o holofote —, e cada
 * uma fazia a sua ida ao IPC.
 *
 * A segunda é a que doía. Cada cópia envelhecia sozinha: anexar a miniatura na
 * ficha importava o arquivo e recarregava os PERSONAGENS, mas a lista de
 * imagens que a janela de personagens tinha lido ao abrir continuava sem ele —
 * e o botão de pôr o token no mapa, que precisa da dimensão natural da
 * miniatura para não deixá-lo esticado, ficava desabilitado dizendo "Lendo o
 * acervo". Só reabrir o aplicativo destravava. Ver `PorNoMapa`.
 *
 * Mesmo desenho do `useCharactersStore`, e pelo mesmo motivo: o disco continua
 * sendo a verdade, ninguém escreve aqui, e quem mexe em arquivo chama
 * `invalidarAcervo` para todas as telas receberem a leitura nova de uma vez.
 */
export const useAssetsStore = create<AssetsStore>((set, get) => ({
  image: VAZIO,
  audio: VAZIO,
  file: VAZIO,

  garantir(kind) {
    const atual = get()[kind];

    // Nunca lido e nada em voo: a primeira tela a montar dispara, as outras
    // pegam o resultado dela.
    if (atual.assets === null && !atual.emVoo) buscar(set, get, kind);
  },

  recarregar(kind) {
    for (const alvo of kind ? [kind] : TIPOS) {
      const atual = get()[alvo];

      // Tipo que ninguém pediu ainda continua sem ser lido: importar uma
      // miniatura não é razão para acordar a lista de sons que nenhuma tela
      // aberta está mostrando. Quando ela montar, o `garantir` lê.
      if (atual.assets === null && !atual.emVoo) continue;

      buscar(set, get, alvo);
    }
  },

  esquecer() {
    // O número sobe, e é o que descarta a resposta de uma leitura da campanha
    // anterior que ainda esteja a caminho. `emVoo` volta a falso para o
    // `garantir` da próxima tela poder disparar de novo.
    for (const alvo of TIPOS)
      guardar(set, alvo, {
        assets: null,
        pedido: get()[alvo].pedido + 1,
        emVoo: false,
      });
  },
}));

const TIPOS = ["image", "audio", "file"] as const;

type Set = (parcial: Partial<AssetsStore>) => void;
type Get = () => AssetsStore;

function guardar(set: Set, kind: AssetKind, acervo: Acervo) {
  set({ [kind]: acervo });
}

/**
 * Lê um tipo e guarda, se a resposta ainda for a mais nova.
 *
 * O número do pedido é o que descarta resposta velha, como no store de
 * personagens: importar uma imagem e apagar outra em seguida dispara duas
 * leituras, e sem isto a primeira a voltar por último gravaria o estado de
 * antes da segunda mudança.
 */
function buscar(set: Set, get: Get, kind: AssetKind) {
  const meu = get()[kind].pedido + 1;
  guardar(set, kind, { assets: get()[kind].assets, pedido: meu, emVoo: true });

  void listAssets(kind).then(
    (lista) => {
      if (get()[kind].pedido !== meu) return;

      guardar(set, kind, { assets: lista, pedido: meu, emVoo: false });
    },
    () => {
      // Sem campanha aberta a lista é vazia, não quebrada: a porta de escolher
      // pasta está na frente desta tela. Sem aviso, de propósito — é o estado
      // normal antes de abrir a campanha, e não um erro para relatar.
      if (get()[kind].pedido !== meu) return;

      guardar(set, kind, { assets: [], pedido: meu, emVoo: false });
    },
  );
}

/**
 * Relê o acervo de fora do React.
 *
 * Para quem mexe em arquivo sem passar pelo `useAssetList`: preencher um campo
 * da ficha, trocar o fundo da cena, dar imagem a um item. Todos importam ou
 * mudam o dono de um arquivo, e todos precisam que as telas abertas saibam.
 */
export function invalidarAcervo(kind?: AssetKind): void {
  useAssetsStore.getState().recarregar(kind);
}

/** O acervo passou a ser outro: esqueça o que foi lido. Ver `esquecer`. */
export function esquecerAcervo(): void {
  useAssetsStore.getState().esquecer();
}
