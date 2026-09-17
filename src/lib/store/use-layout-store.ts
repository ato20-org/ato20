"use client";

import { create } from "zustand";

import { chaveDe, type ConteudoJanela } from "@/lib/store/use-window-store";

/** Os dois lados que recebem janela atracada. O palco fica no meio. */
export type Lado = "esquerda" | "direita";

/**
 * Um grupo de abas: uma região da coluna.
 *
 * Grupo e não janela solta porque soltar no MEIO de uma região funde a janela
 * como aba dela — é o gesto que faz Cenas, Áreas e Retratos serem três abas de
 * um grupo em vez de três regiões empilhadas. Uma região com uma aba só é o
 * caso comum, e não um caso especial.
 *
 * `ativa` guarda a CHAVE, não o índice: remover uma aba reordena os índices, e
 * um índice guardado passaria a apontar para a vizinha.
 */
export type Grupo = {
  id: string;
  abas: ConteudoJanela[];
  ativa: string;
};

export type Coluna = {
  /**
   * Largura em PIXELS, e não fração da linha.
   *
   * Sidebar que guarda a largura é o que se espera: aumentar a janela do
   * aplicativo dá o espaço novo ao palco, não à lista de cenas. Em fração, a
   * lista engordaria junto e o mapa nunca ganharia nada.
   */
  largura: number;
  grupos: Grupo[];
  /**
   * Quanto da altura cada grupo ocupa, na ordem deles. Soma 1.
   *
   * Fração aqui, ao contrário da largura, e pelo motivo inverso: encolher a
   * janela do aplicativo tem de encolher as regiões junto, senão a última
   * ficaria empurrada para fora da coluna. É a mesma decisão que o `h-2/5` do
   * painel direito já tomava na mão.
   */
  fracoes: number[];
};

export type Layout = { esquerda: Coluna; direita: Coluna };

/**
 * Onde uma janela vai encostar, quando soltarem.
 *
 * `antes`/`depois` DIVIDEM: a região de referência cede metade da altura dela
 * para a que chega. `aba` FUNDE: a janela entra como aba do grupo, sem mexer em
 * altura nenhuma. `coluna` é o caso da coluna vazia, que não tem região de
 * referência para dividir.
 *
 * A distinção entre dividir e fundir é a razão de o dock existir com grupos em
 * vez de uma pilha simples de janelas: é ela que faz Cenas, Áreas e Retratos
 * caberem no mesmo espaço em vez de ocuparem um terço da coluna cada.
 */
export type AlvoDock =
  | { lado: Lado; onde: "antes" | "depois"; indice: number }
  | { lado: Lado; onde: "aba"; grupoId: string }
  | { lado: Lado; onde: "coluna" };

const CHAVE_DISCO = "ato20:layout";

/**
 * Largura mínima e máxima de uma coluna, em pixels.
 *
 * Exportadas pela mesma razão da fração mínima: o divisor mexe no DOM durante o
 * gesto e só confirma ao soltar, então precisa dos mesmos limites — sem eles a
 * coluna esticaria sem freio sob a mão e pularia de volta ao soltar.
 */
export const MIN_LARGURA_PX = 200;
export const MAX_LARGURA_PX = 640;

/**
 * Fração mínima de um grupo: abaixo disto a tira de abas some.
 *
 * Exportada porque o divisor precisa do mesmo limite: ele mexe no DOM durante o
 * gesto e só confirma no store ao soltar, então sem conhecer o mínimo a região
 * encolheria até desaparecer sob a mão e voltaria ao mínimo ao soltar.
 */
export const MIN_FRACAO = 0.12;

/**
 * O layout de fábrica: exatamente a tela que existia antes do dock.
 *
 * À esquerda, as três abas que o painel de cenas tinha mais Personagens, que
 * antes era uma pílula no canto do palco. À direita,
 * dois grupos empilhados — porque o painel direito já era dois: as abas em cima
 * e as camadas da cena embaixo, com uma altura de `h-2/5` cravada no CSS. O que
 * mudou é que agora aquela divisão tem um divisor que se arrasta.
 */
function padrao(): Layout {
  return {
    esquerda: {
      largura: 288,
      grupos: [
        {
          id: "esquerda-1",
          // Personagens entra aqui, e não numa pílula no canto do palco: as
          // quatro são "o que existe na sessão", e a de personagens é a que
          // alimenta as outras -- token no mapa vem dela, e a de retratos
          // deriva dos tokens.
          abas: [
            { tipo: "cenas" },
            { tipo: "quadros" },
            { tipo: "areas" },
            { tipo: "retratos" },
            { tipo: "personagens" },
          ],
          ativa: "cenas",
        },
      ],
      fracoes: [1],
    },
    direita: {
      largura: 288,
      grupos: [
        { id: "direita-1", abas: [{ tipo: "imagens" }, { tipo: "sons" }], ativa: "imagens" },
        { id: "direita-2", abas: [{ tipo: "camadas" }], ativa: "camadas" },
      ],
      fracoes: [0.6, 0.4],
    },
  };
}

/**
 * Confere o layout lido do disco, campo por campo.
 *
 * `localStorage` é entrada não confiável: a chave pode ter sido escrita por uma
 * versão anterior, editada à mão ou truncada. E aqui o risco é maior que nas
 * posições de janela — um layout meio válido não desalinha um cartão, deixa o
 * mestre sem painel nenhum. Qualquer suspeita cai no padrão inteiro, que é uma
 * tela conhecida.
 */
function eColuna(valor: unknown): valor is Coluna {
  if (typeof valor !== "object" || valor === null) return false;

  const coluna = valor as Coluna;
  if (typeof coluna.largura !== "number") return false;
  if (!Array.isArray(coluna.grupos) || !Array.isArray(coluna.fracoes)) return false;
  if (coluna.grupos.length !== coluna.fracoes.length) return false;
  if (coluna.fracoes.some((fracao) => typeof fracao !== "number")) return false;

  return coluna.grupos.every((grupo) => {
    if (typeof grupo?.id !== "string" || typeof grupo?.ativa !== "string") return false;
    if (!Array.isArray(grupo.abas) || grupo.abas.length === 0) return false;

    // Só o `tipo` é conferido: o resto do descritor é do conteúdo, e uma aba
    // apontando para personagem que já não existe se resolve na tela — a ficha
    // se fecha sozinha. Ver `CharacterBody`.
    return grupo.abas.every((aba) => typeof (aba as ConteudoJanela)?.tipo === "string");
  });
}

function ler(): Layout {
  try {
    const cru = localStorage.getItem(CHAVE_DISCO);
    if (!cru) return padrao();

    const lido: unknown = JSON.parse(cru);
    if (typeof lido !== "object" || lido === null) return padrao();

    const { esquerda, direita } = lido as Layout;
    if (!eColuna(esquerda) || !eColuna(direita)) return padrao();

    return { esquerda: semRetratos(esquerda), direita: semRetratos(direita) };
  } catch {
    return padrao();
  }
}

/**
 * Nenhum grupo volta do disco com Retratos ativo.
 *
 * A aba ativa tem EFEITO no palco: com a lista de retratos à vista, o palco
 * desenha todos eles para o mestre arrastar — ver `selectAbaAtiva`. Abrir o
 * aplicativo já nesse estado surpreenderia quem só quer montar a cena, e era
 * justamente por isso que a aba do painel esquerdo nunca foi persistida.
 * Guardar a escolha das outras abas não tem efeito nenhum além dela mesma, e
 * por isso continua guardada.
 */
function semRetratos(coluna: Coluna): Coluna {
  return {
    ...coluna,
    grupos: coluna.grupos.map((grupo) =>
      grupo.ativa === "retratos" ? { ...grupo, ativa: chaveDe(grupo.abas[0]) } : grupo,
    ),
  };
}

function gravar(layout: Layout) {
  try {
    localStorage.setItem(CHAVE_DISCO, JSON.stringify(layout));
  } catch {
    // Cota cheia ou armazenamento bloqueado: a bancada continua montada nesta
    // sessão, e só não é reencontrada na próxima. Não vale um aviso na tela.
  }
}

/**
 * Id de um grupo criado agora.
 *
 * Sorteado, e não sequencial: o layout volta do disco com ids que já existem, e
 * um contador reiniciado a cada abertura do aplicativo daria colisão na
 * primeira região nova — dois grupos com o mesmo id fariam `ativarAba` mexer
 * nos dois.
 */
function novoId(): string {
  return `grupo-${Math.random().toString(36).slice(2, 9)}`;
}

/** Normaliza para somar 1, respeitando o mínimo de cada grupo. */
function normalizaFracoes(fracoes: number[]): number[] {
  const limitadas = fracoes.map((fracao) => Math.max(fracao, MIN_FRACAO));
  const total = limitadas.reduce((soma, fracao) => soma + fracao, 0);

  return total > 0 ? limitadas.map((fracao) => fracao / total) : limitadas.map(() => 1 / limitadas.length);
}

type LayoutStore = {
  layout: Layout;
  /** Lê o layout guardado. Depois da montagem — ver `restaurar` das janelas. */
  restaurar: () => void;

  larguraColuna: (lado: Lado, largura: number) => void;
  /** Redistribui a altura entre dois grupos vizinhos. Ver `Splitter`. */
  redimensionarGrupos: (lado: Lado, indice: number, fracaoAntes: number) => void;
  ativarAba: (lado: Lado, grupoId: string, chave: string) => void;
  /**
   * Encosta a janela no alvo.
   *
   * Tira a aba de onde ela estava antes, sempre: mover uma ficha de um grupo
   * para outro é atracar de novo, e sem essa limpeza ela apareceria nos dois.
   */
  atracar: (alvo: AlvoDock, conteudo: ConteudoJanela) => void;
  /** Tira a aba de onde ela estiver. Grupo que fica vazio desaparece. */
  removerAba: (chave: string) => void;
  /** Grava no disco. Chamado no fim de um arrasto, não a cada quadro. */
  guardar: () => void;
};

/**
 * A bancada: o que está atracado em cada lado, e de que tamanho.
 *
 * Separado do `useWindowStore` porque uma janela tem dois endereços possíveis e
 * eles têm ciclos de vida diferentes: FLUTUANDO ela tem canto e tamanho na tela
 * e vive na pilha daquele store; ATRACADA ela é uma aba de um grupo e o tamanho
 * dela é a divisão da coluna. Guardar as duas coisas na mesma lista obrigaria
 * cada campo a ser opcional e cada leitor a perguntar em que estado ela está.
 *
 * Antes disto, as duas colunas eram markup fixo — dois `aside w-72` com abas
 * dentro. O que o dock acrescenta é que aquelas abas passam a ser janelas como
 * as outras: dá para tirar Retratos da esquerda e deixar embaixo da direita, ou
 * empilhar a ficha do Edgar sob o acervo. Etapa 1 monta a estrutura e os
 * divisores; atracar por arrasto vem depois.
 *
 * Estado de máquina, não de campanha: nada disto entra no vault nem viaja para
 * a mesa. Fica em `localStorage`, que é a estante da máquina do mestre.
 */
export const useLayoutStore = create<LayoutStore>((set, get) => ({
  layout: padrao(),

  restaurar() {
    set({ layout: ler() });
  },

  larguraColuna(lado, largura) {
    set((state) => ({
      layout: {
        ...state.layout,
        [lado]: {
          ...state.layout[lado],
          largura: Math.round(Math.min(Math.max(largura, MIN_LARGURA_PX), MAX_LARGURA_PX)),
        },
      },
    }));
  },

  redimensionarGrupos(lado, indice, fracaoAntes) {
    const coluna = get().layout[lado];
    const par = coluna.fracoes[indice] + coluna.fracoes[indice + 1];
    if (par === undefined || Number.isNaN(par)) return;

    // Os dois vizinhos dividem o que era deles: mexer num divisor não pode
    // reflowar a coluna inteira, senão arrastar o de baixo mexeria no de cima.
    const antes = Math.min(Math.max(fracaoAntes, MIN_FRACAO), par - MIN_FRACAO);

    const fracoes = [...coluna.fracoes];
    fracoes[indice] = antes;
    fracoes[indice + 1] = par - antes;

    set((state) => ({
      layout: { ...state.layout, [lado]: { ...state.layout[lado], fracoes } },
    }));
  },

  ativarAba(lado, grupoId, chave) {
    set((state) => ({
      layout: {
        ...state.layout,
        [lado]: {
          ...state.layout[lado],
          grupos: state.layout[lado].grupos.map((grupo) =>
            grupo.id === grupoId ? { ...grupo, ativa: chave } : grupo,
          ),
        },
      },
    }));

    get().guardar();
  },

  atracar(alvo, conteudo) {
    const chave = chaveDe(conteudo);

    // Primeiro sai de onde estava. `removerAba` já normaliza e grava; o que
    // vem depois lê o layout novo.
    get().removerAba(chave);

    const coluna = get().layout[alvo.lado];
    const novo: Grupo = { id: novoId(), abas: [conteudo], ativa: chave };

    let grupos: Grupo[];
    let fracoes: number[];

    const alvoGrupo =
      alvo.onde === "aba" ? coluna.grupos.find((grupo) => grupo.id === alvo.grupoId) : undefined;

    if (alvoGrupo) {
      grupos = coluna.grupos.map((grupo) =>
        grupo.id === alvoGrupo.id
          ? { ...grupo, abas: [...grupo.abas, conteudo], ativa: chave }
          : grupo,
      );
      fracoes = coluna.fracoes;
    } else if (coluna.grupos.length === 0) {
      // Coluna vazia, ou o grupo de destino sumiu porque a aba que saiu era a
      // última dele: vira a primeira região, com a coluna toda.
      grupos = [novo];
      fracoes = [1];
    } else {
      // `coluna` e `aba` só chegam aqui quando o grupo de destino não existe
      // mais; nesses casos a referência é a primeira região.
      const pedido = alvo.onde === "antes" || alvo.onde === "depois" ? alvo.indice : 0;
      const indice = Math.min(Math.max(pedido, 0), coluna.grupos.length - 1);
      const posicao = alvo.onde === "antes" ? indice : indice + 1;

      // A referência cede metade da altura dela, e não uma fatia do bolo
      // inteiro: dividir a região de baixo não pode reflowar a de cima.
      const parte = (coluna.fracoes[indice] ?? 1) / 2;

      grupos = [...coluna.grupos];
      grupos.splice(posicao, 0, novo);

      fracoes = [...coluna.fracoes];
      fracoes[indice] = parte;
      fracoes.splice(posicao, 0, parte);
    }

    set((state) => ({
      layout: {
        ...state.layout,
        [alvo.lado]: { ...state.layout[alvo.lado], grupos, fracoes: normalizaFracoes(fracoes) },
      },
    }));

    get().guardar();
  },

  removerAba(chave) {
    const layout = { ...get().layout };

    for (const lado of ["esquerda", "direita"] as const) {
      const coluna = layout[lado];

      const grupos: Grupo[] = [];
      const fracoes: number[] = [];

      coluna.grupos.forEach((grupo, indice) => {
        const abas = grupo.abas.filter((aba) => chaveDe(aba) !== chave);

        // Grupo sem aba nenhuma some, e a fração dele volta para o bolo: uma
        // região vazia na coluna seria uma faixa cinza sem nada que a explique.
        if (abas.length === 0) return;

        grupos.push({
          ...grupo,
          abas,
          // A ativa saiu: assume a primeira que restou, e não "nenhuma" — grupo
          // sem aba ativa desenharia corpo vazio com abas em cima.
          ativa: abas.some((aba) => chaveDe(aba) === grupo.ativa) ? grupo.ativa : chaveDe(abas[0]),
        });
        fracoes.push(coluna.fracoes[indice] ?? 1);
      });

      layout[lado] = { ...coluna, grupos, fracoes: normalizaFracoes(fracoes) };
    }

    set({ layout });
    get().guardar();
  },

  guardar() {
    gravar(get().layout);
  },
}));

/**
 * A aba está atracada E ativa em algum lado?
 *
 * Existe por causa dos retratos: o palco só os desenha editáveis quando a lista
 * deles está à vista, e antes isso era `leftTab === "retratos"` no
 * `usePanelsStore`. Com o dock, "à vista" deixou de ser uma aba fixa do painel
 * esquerdo e passou a ser esta pergunta — a lista pode estar em qualquer grupo
 * de qualquer coluna, ou flutuando.
 */
export function selectAbaAtiva(chave: string) {
  return (state: LayoutStore): boolean =>
    (["esquerda", "direita"] as const).some((lado) =>
      state.layout[lado].grupos.some((grupo) => grupo.ativa === chave),
    );
}
