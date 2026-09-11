"use client";

import {
  copySelection,
  cutSelection,
  duplicateSelection,
  flipSelection,
  moveSelectionZ,
  nudgeSelection,
  pasteClipboard,
  removeFogSelection,
  removePortraitSelection,
  removeSelection,
  selectAllItems,
} from "@/lib/operator/item-actions";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { executarComando } from "@/lib/extensoes/carregar";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";

/** De quanto o empurrão anda, e de quanto ele anda com Shift. */
const EMPURRAO = 1;
const EMPURRAO_LARGO = 10;

const SETAS: Record<string, { x: number; y: number }> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/**
 * Os grupos, na ordem em que a lista de Configurações os mostra.
 *
 * Por ASSUNTO e não por tecla: quem abre a lista está procurando "como eu
 * mando isto para trás", não "o que o Ctrl faz".
 */
export type GrupoAtalho =
  | "Desfazer"
  | "Área de transferência"
  | "Câmera"
  | "Camadas"
  | "Seleção"
  // Extensão declara o grupo dela, ou cai no próprio nome. A união fica aberta
  // para isso -- fechar obrigaria a tabela do aplicativo a conhecer os nomes
  // que um autor de plugin vai escolher.
  | (string & {});

export type Atalho = {
  grupo: GrupoAtalho;
  /** Como o atalho se escreve, para quem lê a lista. */
  tecla: string;
  /** O que ele faz, em uma linha. */
  rotulo: string;
  /** Este evento é este atalho? */
  combina: (evento: KeyboardEvent) => boolean;
  executar: (evento: KeyboardEvent) => void;
  /**
   * Barrar o comportamento do browser.
   *
   * Verdadeiro em quase tudo -- Ctrl+D favorita a página, Backspace navega
   * para trás, Ctrl+= aumenta a fonte da webview. Falso onde não há
   * comportamento a barrar, e aí barrar seria pedir ao browser para ignorar
   * uma tecla sem motivo.
   */
  impedirPadrao: boolean;
};

/** O modificador de comando, que é o Ctrl no Linux e no Windows e o Cmd no Mac. */
function comando(evento: KeyboardEvent): boolean {
  return evento.ctrlKey || evento.metaKey;
}

/** A letra, sem depender de o Shift estar apertado. */
function letra(evento: KeyboardEvent): string {
  return evento.key.toLowerCase();
}

/**
 * A tabela dos atalhos do Operador: o que existe, o que faz, e como se escreve.
 *
 * UMA lista, e é o ponto deste arquivo. Antes o mapeamento era um encadeado de
 * `if` dentro do listener, e nenhum atalho aparecia em lugar nenhum da
 * interface -- quem senta na bancada descobria por tentativa, ou não descobria.
 * Qualquer lista escrita à mão numa tela de ajuda seria uma segunda cópia, que
 * envelhece sozinha na primeira vez que alguém mexer só no listener.
 *
 * A ORDEM é a precedência: quem casa primeiro executa, e mais ninguém é
 * consultado. Mesmo assim os pares que dependem de Shift checam o Shift dos
 * dois lados, para reordenar a tabela um dia não trocar silenciosamente o que
 * um atalho faz.
 *
 * As ações leem o estado atual por conta própria -- é o que permite ao listener
 * ser montado uma vez e nunca mais.
 */
export const ATALHOS_BASE: Atalho[] = [
  // Desfazer no alto da tabela: Ctrl+Z é o atalho que não pode falhar.
  {
    grupo: "Desfazer",
    tecla: "Ctrl+Shift+Z",
    rotulo: "Refazer",
    combina: (evento) =>
      comando(evento) && evento.shiftKey && letra(evento) === "z",
    executar: () => useSceneStore.getState().redo(),
    impedirPadrao: true,
  },
  {
    grupo: "Desfazer",
    tecla: "Ctrl+Z",
    rotulo: "Desfazer",
    combina: (evento) =>
      comando(evento) && !evento.shiftKey && letra(evento) === "z",
    executar: () => useSceneStore.getState().undo(),
    impedirPadrao: true,
  },
  {
    grupo: "Desfazer",
    tecla: "Ctrl+Y",
    rotulo: "Refazer",
    combina: (evento) => comando(evento) && letra(evento) === "y",
    executar: () => useSceneStore.getState().redo(),
    impedirPadrao: true,
  },

  {
    grupo: "Área de transferência",
    tecla: "Ctrl+A",
    rotulo: "Selecionar tudo na cena",
    combina: (evento) => comando(evento) && letra(evento) === "a",
    executar: selectAllItems,
    impedirPadrao: true,
  },
  {
    grupo: "Área de transferência",
    tecla: "Ctrl+C",
    rotulo: "Copiar",
    combina: (evento) => comando(evento) && letra(evento) === "c",
    executar: copySelection,
    impedirPadrao: true,
  },
  {
    grupo: "Área de transferência",
    tecla: "Ctrl+X",
    rotulo: "Cortar",
    combina: (evento) => comando(evento) && letra(evento) === "x",
    executar: cutSelection,
    impedirPadrao: true,
  },
  {
    grupo: "Área de transferência",
    tecla: "Ctrl+V",
    rotulo: "Colar",
    combina: (evento) => comando(evento) && letra(evento) === "v",
    executar: pasteClipboard,
    impedirPadrao: true,
  },
  {
    grupo: "Área de transferência",
    tecla: "Ctrl+D",
    rotulo: "Duplicar",
    combina: (evento) => comando(evento) && letra(evento) === "d",
    executar: duplicateSelection,
    impedirPadrao: true,
  },

  // Os mesmos atalhos que o browser usa para zoom, aplicados ao palco.
  {
    grupo: "Câmera",
    tecla: "Ctrl+0",
    rotulo: "Enquadrar a cena",
    combina: (evento) => comando(evento) && evento.key === "0",
    executar: () => useViewportStore.getState().fit(),
    impedirPadrao: true,
  },
  {
    grupo: "Câmera",
    tecla: "Ctrl+=",
    rotulo: "Aproximar",
    // `+` é o mesmo teclado com Shift, e `event.key` entrega o caractere
    // JÁ deslocado -- por isso os dois.
    combina: (evento) =>
      comando(evento) && (evento.key === "=" || evento.key === "+"),
    executar: () => useViewportStore.getState().zoomIn(),
    impedirPadrao: true,
  },
  {
    grupo: "Câmera",
    tecla: "Ctrl+-",
    rotulo: "Afastar",
    combina: (evento) =>
      comando(evento) && (evento.key === "-" || evento.key === "_"),
    executar: () => useViewportStore.getState().zoomOut(),
    impedirPadrao: true,
  },

  /*
   * Os quatro de camada, e o `}` ao lado do `]`.
   *
   * Pela mesma razão do `+` na câmera: com Shift apertado, `event.key` do `]`
   * vira `}`. A versão anterior deste código lia `event.shiftKey` DENTRO de um
   * ramo que exigia `event.key === "]"`, então "trazer para a frente" e "mandar
   * para o fundo" eram inalcançáveis pelo teclado -- os dois caíam no passo de
   * um, ou em nada. Escrever a tabela é o que fez isso aparecer.
   */
  {
    grupo: "Camadas",
    tecla: "Ctrl+Shift+]",
    rotulo: "Trazer para a frente",
    combina: (evento) =>
      comando(evento) &&
      evento.shiftKey &&
      (evento.key === "]" || evento.key === "}"),
    executar: () => moveSelectionZ("front"),
    impedirPadrao: true,
  },
  {
    grupo: "Camadas",
    tecla: "Ctrl+Shift+[",
    rotulo: "Mandar para o fundo",
    combina: (evento) =>
      comando(evento) &&
      evento.shiftKey &&
      (evento.key === "[" || evento.key === "{"),
    executar: () => moveSelectionZ("back"),
    impedirPadrao: true,
  },
  {
    grupo: "Camadas",
    tecla: "Ctrl+]",
    rotulo: "Subir uma camada",
    combina: (evento) =>
      comando(evento) && !evento.shiftKey && evento.key === "]",
    executar: () => moveSelectionZ("forward"),
    impedirPadrao: true,
  },
  {
    grupo: "Camadas",
    tecla: "Ctrl+[",
    rotulo: "Descer uma camada",
    combina: (evento) =>
      comando(evento) && !evento.shiftKey && evento.key === "[",
    executar: () => moveSelectionZ("backward"),
    impedirPadrao: true,
  },

  {
    grupo: "Seleção",
    tecla: "Esc",
    rotulo: "Largar a seleção",
    // Sem exigir a ausência do comando, como estava antes: Ctrl+Esc também
    // larga, e é o comportamento que já existia.
    combina: (evento) => evento.key === "Escape",
    executar: () => useSelectionStore.getState().clear(),
    // Escape não faz nada no browser que valha barrar.
    impedirPadrao: false,
  },

  // Espelhar. Shift sozinho, sem Ctrl: Ctrl+V já é colar.
  {
    grupo: "Seleção",
    tecla: "Shift+H",
    rotulo: "Espelhar na horizontal",
    combina: (evento) =>
      !comando(evento) && evento.shiftKey && letra(evento) === "h",
    executar: () => flipSelection("x"),
    impedirPadrao: true,
  },
  {
    grupo: "Seleção",
    tecla: "Shift+V",
    rotulo: "Espelhar na vertical",
    combina: (evento) =>
      !comando(evento) && evento.shiftKey && letra(evento) === "v",
    executar: () => flipSelection("y"),
    impedirPadrao: true,
  },

  {
    grupo: "Seleção",
    tecla: "Delete / Backspace",
    rotulo: "Apagar o que está selecionado",
    combina: (evento) =>
      !comando(evento) &&
      (evento.key === "Delete" || evento.key === "Backspace"),
    executar: () => {
      // Uma tecla, três alvos possíveis: a área escondida ganha do retrato, e
      // o retrato ganha do item da cena. É a ordem de quem está "por cima" na
      // atenção do mestre quando as duas coisas estão selecionadas.
      const selecao = useSelectionStore.getState();

      if (selecao.selectedFogId) removeFogSelection();
      else if (selecao.selectedPortraitIds.length > 0)
        removePortraitSelection();
      else removeSelection();
    },
    // Backspace navega para trás no browser se não for barrado.
    impedirPadrao: true,
  },

  {
    grupo: "Seleção",
    tecla: "Shift+Setas",
    rotulo: `Empurrar ${EMPURRAO_LARGO} de cada vez`,
    combina: (evento) =>
      !comando(evento) && evento.shiftKey && evento.key in SETAS,
    executar: (evento) => empurrar(evento, EMPURRAO_LARGO),
    impedirPadrao: true,
  },
  {
    grupo: "Seleção",
    tecla: "Setas",
    rotulo: `Empurrar ${EMPURRAO} de cada vez`,
    combina: (evento) =>
      !comando(evento) && !evento.shiftKey && evento.key in SETAS,
    executar: (evento) => empurrar(evento, EMPURRAO),
    impedirPadrao: true,
  },
];

/**
 * A tabela que vale AGORA: a de fábrica mais os comandos dos plugins.
 *
 * Os do plugin entram DEPOIS, e isso é a regra inteira de conflito. A ordem da
 * tabela é a precedência -- quem casa primeiro executa --, então um `Ctrl+Z`
 * declarado por uma extensão nunca alcança o desfazer. Não é preciso conferir
 * colisão em lugar nenhum: a ordem já decide, e decide a favor do aplicativo.
 *
 * Função e não constante porque a lista depende do que está instalado e
 * habilitado. O listener a chama a cada tecla, e isso é barato: são poucas
 * entradas, e a alternativa seria remontar o ouvinte a cada mudança de plugin.
 */
export function atalhos(): Atalho[] {
  return [...ATALHOS_BASE, ...atalhosDeExtensoes()];
}

/**
 * Os comandos de plugin que declararam tecla, como entradas da tabela.
 *
 * Só os que TÊM atalho: um comando sem tecla não tem o que fazer aqui, e
 * aparece no menu da barra da janela.
 */
function atalhosDeExtensoes(): Atalho[] {
  return useExtensoesStore
    .getState()
    .extensoes.filter((extensao) => extensao.habilitada)
    .flatMap((extensao) =>
      (extensao.contribui?.comandos ?? [])
        .filter((comando) => comando.atalho)
        .map((comando) => ({
          grupo: comando.grupo ?? extensao.nome,
          tecla: comando.atalho as string,
          rotulo: comando.titulo,
          combina: combinaCom(comando.atalho as string),
          // O módulo pode nem estar importado: é `executarComando` quem
          // garante a carga antes de chamar. Ver a ativação preguiçosa.
          executar: () => void executarComando(extensao, comando.id),
          // Sempre, e é o certo para tecla de plugin: quase toda combinação
          // com Ctrl tem dono no browser, e um atalho que dispara a ação E
          // favorita a página faz as duas coisas erradas.
          impedirPadrao: true,
        })),
    );
}

/**
 * Transforma "Ctrl+Shift+F" na pergunta "este evento é este atalho?".
 *
 * Tolerante na escrita porque quem a digita é o autor do plugin, num JSON, sem
 * autocompletar: `ctrl`, `Ctrl` e `CTRL` valem o mesmo, e `Cmd` é lido como o
 * mesmo modificador de comando que o `Ctrl` -- a mesma equivalência que o resto
 * da tabela já faz.
 *
 * Combinação sem tecla final, ou que este parser não entende, nunca casa: é
 * melhor um atalho que não funciona do que um que dispara sozinho.
 */
function combinaCom(tecla: string): (evento: KeyboardEvent) => boolean {
  const partes = tecla.split("+").map((parte) => parte.trim().toLowerCase());
  const alvo = partes.at(-1) ?? "";

  const precisaComando = partes.includes("ctrl") || partes.includes("cmd");
  const precisaShift = partes.includes("shift");
  const precisaAlt = partes.includes("alt");

  if (!alvo || ["ctrl", "cmd", "shift", "alt"].includes(alvo)) return () => false;

  return (evento) =>
    comando(evento) === precisaComando &&
    evento.shiftKey === precisaShift &&
    evento.altKey === precisaAlt &&
    letra(evento) === alvo;
}

function empurrar(evento: KeyboardEvent, passo: number): void {
  const seta = SETAS[evento.key];
  if (!seta) return;

  nudgeSelection(seta.x * passo, seta.y * passo);
}

/**
 * Os atalhos agrupados, na ordem da tabela.
 *
 * Derivado e não escrito à mão, pelo mesmo motivo que a tabela existe: um
 * agrupamento próprio seria a segunda cópia de volta.
 */
export function atalhosPorGrupo(): Array<{
  grupo: GrupoAtalho;
  atalhos: Atalho[];
}> {
  const grupos: Array<{ grupo: GrupoAtalho; atalhos: Atalho[] }> = [];

  for (const atalho of atalhos()) {
    const atual = grupos.find(({ grupo }) => grupo === atalho.grupo);

    if (atual) atual.atalhos.push(atalho);
    else grupos.push({ grupo: atalho.grupo, atalhos: [atalho] });
  }

  return grupos;
}
