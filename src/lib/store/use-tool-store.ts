"use client";

import { create } from "zustand";

import { RAIO_DA_BORRACHA_DOS_RISCOS_PADRAO } from "@/lib/geometry/pincel";
import { METROS_DA_PAREDE_PADRAO } from "@/lib/geometry/sombra";

import {
  CORES_POSTIT,
  FORMA_ESPESSURA,
  TEXTO_TAMANHO,
  type FamiliaDoTexto,
  type Texto,
  type CorPostit,
  type FormaDaRegua,
  type FormatoDeArea,
  type FormatoDeParede,
  type TipoDeForma,
} from "@/types/scene";

/**
 * `select` é o modo normal, `hand` desloca a cena no arrasto, `fog` desenha uma
 * área escondida -- no arrasto se ela for retângulo ou elipse, vértice a
 * vértice se for polígono, conforme `formatoDeArea` --, `pin` crava um ponto de
 * anotação no clique,
 * `postit` cola um papel de texto no clique, e `lapis`/`borracha` riscam e
 * apagam à mão livre.
 *
 * `pin` e `postit` são os dois do mestre e ficam lado a lado, mas não são a
 * mesma coisa: o alfinete é uma coordenada com nota fechada atrás dela — bom
 * para a preparação que não pode estar à vista o tempo todo —, e o postit é
 * texto ABERTO sobre uma região, que é o que se quer para o que precisa ser
 * lido de relance no meio da sessão.
 *
 * `parede` e `luz` são as duas do escuro: a parede diz onde a luz para, a luz
 * crava uma tocha no clique. Nenhuma das duas aparece na mesa como desenho --
 * o que a mesa vê é o efeito delas, a sombra e a luz. Ver `LuzLayer`.
 *
 * `regua` coloca um medidor no arrasto -- régua, círculo, cone ou retângulo,
 * conforme `formaMedidor` -- e mora colada na grade, na pílula do mapa: ela só
 * significa algo com a grade ligada, porque é o quadrado que diz quanto vale
 * um metro. Ver `METROS_POR_QUADRADO` e `Regua`.
 *
 * As duas de mira são de gesto diferente de propósito: área é arrasto, porque
 * ela tem tamanho; ponto é clique, porque ele não tem — pedir um arrasto para
 * cravar um alfinete faria o mestre desenhar uma caixa invisível sem saber.
 *
 * `hand` não substitui o espaço segurado, que continua sendo o caminho
 * momentâneo. Ver `usePanMode`, que junta os dois.
 */
export type Tool =
  | "select"
  | "hand"
  // `laser` aponta sem marcar: o rastro some sozinho, e nada entra na cena.
  // Ver `RastroDoLaser`.
  | "laser"
  | "fog"
  // `borrachaDaNevoa` fura, no arrasto, a área escondida SELECIONADA -- só
  // ela, para a passada não abrir a área vizinha sem querer. Não mora na
  // barra: entra e sai pelo botão do gizmo da área. Ver `FogRegion.furos`.
  | "borrachaDaNevoa"
  | "pin"
  | "postit"
  | "lapis"
  | "borracha"
  | "regua"
  // `parede` traça, no arrasto, o segmento em que a luz para. É do MAPA e só
  // dele: num quadro não há chão em que a sombra caia.
  | "parede"
  // `luz` crava uma luz no clique -- a tocha, a fogueira. Clique e não arrasto:
  // a luz não tem tamanho, tem alcance, e o alcance se ajusta no anel dela.
  // Também só do mapa. Ver `Luz`.
  | "luz"
  // `porta` traça a folha no arrasto, da dobradiça à ponta. Só do mapa, como
  // a parede de que ela é um pedaço. Ver `Porta`.
  | "porta"
  // `efeito` desenha uma ÁREA DE EFEITO -- o chão em chamas --, com as mesmas
  // três geometrias da área escondida. Só do mapa. Ver `AreaDeEfeito`.
  | "efeito"
  // As três do QUADRO: `texto` escreve direto na folha no clique, `ligacao`
  // amarra duas coisas com uma seta em dois cliques -- de onde, para onde --, e
  // `forma` desenha retângulo, elipse ou linha no arrasto, conforme
  // `tipoDeForma`.
  | "texto"
  | "ligacao"
  | "forma"
  // A de uma EXTENSAO, no formato `ext:{extensaoId}/{ferramentaId}`.
  //
  // Prefixo e nao um campo separado no store porque a ferramenta e UM valor em
  // dezenas de comparacoes espalhadas pelo palco: um par obrigaria todas elas a
  // comparar duas coisas, e a primeira esquecida deixaria a ferramenta do
  // plugin agindo como `select`.
  | `ext:${string}`;

/** O prefixo que separa ferramenta de plugin das de fabrica. */
export const PREFIXO_FERRAMENTA_EXT = "ext:";

/** Esta ferramenta e de extensao? Devolve quem a trouxe e qual e. */
export function ferramentaDeExtensao(
  tool: Tool,
): { extensaoId: string; ferramentaId: string } | null {
  if (!tool.startsWith(PREFIXO_FERRAMENTA_EXT)) return null;

  const [extensaoId, ferramentaId] = tool.slice(PREFIXO_FERRAMENTA_EXT.length).split("/");

  return extensaoId && ferramentaId ? { extensaoId, ferramentaId } : null;
}

/** O que o painel de texto escolhe para o próximo texto. Ver `textoNovo`. */
export type TextoNovo = Pick<
  Texto,
  | "cor"
  | "fundo"
  | "negrito"
  | "italico"
  | "sublinhado"
  | "alinhamento"
  | "opacidade"
> & {
  tamanho: number;
  familia?: FamiliaDoTexto;
};

/**
 * As quatro naturezas de um elemento desenhado: a mesma geometria, quatro
 * significados. Ver `PainelDeElementos`.
 */
export type NaturezaDoElemento = "parede" | "area" | "elemento" | "efeito";

/**
 * O que a borracha dos riscos apaga: o pedaço por onde o anel passa -- o risco
 * cortado vira dois -- ou o risco inteiro que ele encostar.
 */
export type ModoDaBorracha = "pedaco" | "inteiro";

/**
 * As cores do lápis.
 *
 * Poucas e de propósito: um seletor contínuo pede decisão a cada risco, e o que
 * o mestre quer é "o vermelho" — a cor aqui é código combinado na mesa ("o
 * caminho é o azul"), não escolha de arte. Fortes e saturadas porque o risco
 * vive sobre um mapa que já é cheio de cor.
 */
export const CORES_LAPIS = [
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#ffffff",
] as const;

/**
 * Espessuras, em unidades de cena. A do meio é o padrão.
 *
 * Os degraus da FORMA do quadro. O lápis tinha os mesmos, e passou a ter uma
 * régua contínua -- ver `LARGURA_DO_LAPIS_MAXIMA` --, porque com Alt+roda e o
 * marca-texto largo quatro degraus não bastavam.
 */
export const ESPESSURAS_LAPIS = [3, 6, 12, 24] as const;

type ToolStore = {
  tool: Tool;
  setTool: (tool: Tool) => void;

  /**
   * O próximo risco: a cor, a largura, a opacidade e o quanto a ponta é
   * suavizada.
   *
   * No store da ferramenta e não na cena: é preferência de quem desenha, e vale
   * para a cena seguinte também. O risco guarda a cópia do que estava escolhido
   * quando ele nasceu — mudar a cor depois não repinta o que já está no mapa.
   * O suavizar não chega ao risco: ele age na mão, enquanto o risco é traçado.
   *
   * Não persiste: escolher a cor é um clique, e restaurá-la ao abrir o
   * aplicativo não vale um arquivo.
   */
  cor: string;
  /** Em unidade de cena, de `LARGURA_DO_LAPIS_MINIMA` a `_MAXIMA`. */
  espessura: number;
  /** De 0,1 a 1. */
  opacidade: number;
  /** De 0 a 1: zero é o lápis cru. Ver `pontaNaCorda`. */
  suavizar: number;
  setLapis: (lapis: {
    cor?: string;
    espessura?: number;
    opacidade?: number;
    suavizar?: number;
  }) => void;
  /**
   * A régua de tamanho do painel está na mão -- a largura do lápis, o raio de
   * uma das borrachas. Enquanto está, o anel do pincel sai do ponteiro, que
   * está no painel, longe do mapa, e vai para o meio do palco: a referência do
   * tamanho real, no zoom de agora. Ver `AnelDoPincel`.
   */
  tamanhoEmAjuste: boolean;
  setTamanhoEmAjuste: (tamanhoEmAjuste: boolean) => void;

  /**
   * A borracha dos riscos: o raio do anel, em unidade de cena, e o que ela
   * apaga -- só o PEDAÇO por onde passa, ou o risco INTEIRO que encostar.
   *
   * Raio próprio, e não o da borracha da névoa: risco pede pincel fino, névoa
   * pede largo, e trocar de ferramenta não pode desfazer o ajuste da outra.
   */
  raioDaBorracha: number;
  modoDaBorracha: ModoDaBorracha;
  setBorracha: (borracha: {
    raio?: number;
    modo?: ModoDaBorracha;
  }) => void;

  /**
   * A cor do PRÓXIMO postit colado.
   *
   * Aqui e não na cena pela mesma razão da cor do lápis: é preferência de quem
   * anota, e vale para a cena seguinte. Cada postit guarda a cópia da cor que
   * estava escolhida quando ele nasceu — trocar esta não repinta o que já está
   * no mapa, e trocar a cor de um papel já colado é botão dele.
   *
   * É o que faz colar três pistas em rosa seguidas ser três cliques, e não seis.
   */
  corPostit: CorPostit;
  setCorPostit: (cor: CorPostit) => void;

  /**
   * O formato da PRÓXIMA parede. Ver `FormatoDeParede`.
   *
   * Irmão do `formatoDeArea` e do `tipoDeForma`, e os três são a mesma pergunta
   * feita a três naturezas: qual é o desenho. A pílula da barra escolhe a
   * natureza e o formato no mesmo gesto, mas cada natureza guarda o SEU -- quem
   * traça paredes em laço e esconde áreas em retângulo não quer que uma troque
   * a outra.
   */
  formatoDaParede: FormatoDeParede;
  setFormatoDaParede: (formato: FormatoDeParede) => void;

  /**
   * A forma e a cor do PRÓXIMO medidor.
   *
   * Aqui pelas mesmas razões do lápis: preferência de quem mede, vale para a
   * cena seguinte, e cada medidor guarda a cópia da cor com que nasceu. A
   * régua reta é o padrão porque é a pergunta mais comum -- "quanto tem daqui
   * até ali". As cores são as do lápis: o medidor vive sobre o mesmo mapa.
   */
  formaMedidor: FormaDaRegua;
  corMedidor: string;
  setMedidor: (medidor: { formaMedidor?: FormaDaRegua; corMedidor?: string }) => void;

  /**
   * O tipo, a cor, a espessura e o fundo da PRÓXIMA forma do quadro.
   *
   * Aqui pelas mesmas razões do lápis: é preferência de quem desenha, vale para
   * a cena seguinte, e cada forma guarda a cópia do que estava escolhido quando
   * nasceu. As cores são as do lápis -- é o mesmo gesto de marcar, e duas
   * paletas diferentes para a mesma folha seriam duas linguagens.
   *
   * Sem fundo por padrão: uma caixa cheia sobre o quadro esconderia o que está
   * atrás dela, e o uso normal é CERCAR. Ver `Forma`.
   */
  /**
   * O recorte da PRÓXIMA área escondida.
   *
   * Aqui pelas mesmas razões do tipo de forma: é preferência de quem esconde, e
   * cada área guarda o formato com que nasceu -- trocar este não remodela o que
   * já está no mapa. O retângulo é o padrão porque é o que a área sempre foi, e
   * é o que cobre uma sala.
   */
  formatoDeArea: FormatoDeArea;
  setFormatoDeArea: (formato: FormatoDeArea) => void;

  /**
   * O recorte da PRÓXIMA área de efeito. Cada natureza guarda o seu, pela
   * razão da parede: quem esconde em retângulo e incendeia em laço não quer
   * que uma troque a outra.
   */
  formatoDoEfeito: FormatoDeArea;
  setFormatoDoEfeito: (formato: FormatoDeArea) => void;

  /**
   * O que o PRÓXIMO elemento desenhado é: parede, área escondida, forma ou
   * área de efeito. É a última escolhida no painel de Elementos, e é o que o
   * ícone da barra pega de volta ao ser clicado. Ver `PainelDeElementos`.
   */
  naturezaDoElemento: NaturezaDoElemento;
  setNaturezaDoElemento: (natureza: NaturezaDoElemento) => void;

  /**
   * Com que a PRÓXIMA área de efeito nasce. Ausente = sem efeito, como ela
   * sempre nasceu -- e o gizmo continua trocando depois.
   */
  efeitoDaArea?: string;
  setEfeitoDaArea: (efeito: string | undefined) => void;

  /**
   * Com que a PRÓXIMA parede nasce: a altura, em metros como no gizmo, se tem
   * teto, e a cor da face no mapa de esguelha (ausente = lida do mapa). Cada
   * parede guarda a cópia: mudar aqui não mexe nas que já estão no mapa.
   */
  paredeNova: { metros: number; comTeto: boolean; cor?: string };
  setParedeNova: (parede: {
    metros?: number;
    comTeto?: boolean;
    /** `null` volta à cor lida do mapa. */
    cor?: string | null;
  }) => void;

  /** A PRÓXIMA área escondida já nasce dinâmica. Ver `FogRegion.dinamica`. */
  nevoaNovaDinamica: boolean;
  setNevoaNovaDinamica: (dinamica: boolean) => void;

  /**
   * Como o PRÓXIMO texto nasce: o painel de texto com a ferramenta T na mão.
   * Cada texto guarda a cópia, como o risco: mudar aqui não mexe nos que já
   * estão no mapa -- esses o mesmo painel edita quando estão selecionados.
   *
   * `familia` ausente = a da campanha (a letra de mão do quadro), que é como o
   * texto sempre nasceu. Ver `camposDoTextoNovo`.
   */
  textoNovo: TextoNovo;
  setTextoNovo: (patch: Partial<TextoNovo>) => void;

  tipoDeForma: TipoDeForma;
  /** Ausente = a cor do tema. Ver `Forma`. */
  corForma?: string;
  espessuraForma: number;
  fundoForma?: string;
  setForma: (forma: {
    tipoDeForma?: TipoDeForma;
    /** `null` volta à cor do tema, como `fundoForma` volta ao vazado. */
    corForma?: string | null;
    espessuraForma?: number;
    /** `null` tira o fundo -- `undefined` deixaria o valor como está. */
    fundoForma?: string | null;
  }) => void;
};

export const useToolStore = create<ToolStore>((set) => ({
  tool: "select",
  setTool: (tool) => set({ tool }),

  cor: CORES_LAPIS[0],
  espessura: ESPESSURAS_LAPIS[1],
  opacidade: 1,
  // Um pouco ligado: com o mouse, o risco cru sai tremido, e quem quer o
  // traço exato desliga com um gesto.
  suavizar: 0.3,
  setLapis: (lapis) => set(lapis),
  tamanhoEmAjuste: false,
  setTamanhoEmAjuste: (tamanhoEmAjuste) => set({ tamanhoEmAjuste }),

  raioDaBorracha: RAIO_DA_BORRACHA_DOS_RISCOS_PADRAO,
  // O pedaço por padrão: é o que uma borracha faz. O risco inteiro é o atalho
  // de quem quer limpar rápido, e fica a um clique no painel.
  modoDaBorracha: "pedaco",
  setBorracha: ({ raio, modo }) =>
    set({
      ...(raio !== undefined ? { raioDaBorracha: raio } : {}),
      ...(modo !== undefined ? { modoDaBorracha: modo } : {}),
    }),

  corPostit: CORES_POSTIT[0],
  setCorPostit: (corPostit) => set({ corPostit }),


  // `retangulo` e não `linha`: a pílula oferece quadrado, círculo e traço
  // livre, e uma parede reta é um retângulo fino -- que ainda por cima é o
  // desenho mais honesto de uma parede com grossura.
  formatoDaParede: "retangulo",
  setFormatoDaParede: (formatoDaParede) => set({ formatoDaParede }),

  formaMedidor: "linha",
  corMedidor: CORES_LAPIS[5],
  setMedidor: (medidor) => set(medidor),

  formatoDeArea: "retangulo",
  setFormatoDeArea: (formatoDeArea) => set({ formatoDeArea }),

  formatoDoEfeito: "retangulo",
  setFormatoDoEfeito: (formatoDoEfeito) => set({ formatoDoEfeito }),

  // A forma: é a única que vale nos três tipos de cena, e o primeiro clique
  // no ícone tem de dar algo que se desenha em qualquer um.
  naturezaDoElemento: "elemento",
  setNaturezaDoElemento: (naturezaDoElemento) => set({ naturezaDoElemento }),

  efeitoDaArea: undefined,
  setEfeitoDaArea: (efeitoDaArea) => set({ efeitoDaArea }),

  paredeNova: { metros: METROS_DA_PAREDE_PADRAO, comTeto: true },
  setParedeNova: ({ cor, ...resto }) =>
    set((estado) => {
      const proxima = { ...estado.paredeNova, ...resto };
      if (cor === null) delete proxima.cor;
      else if (cor !== undefined) proxima.cor = cor;
      return { paredeNova: proxima };
    }),

  nevoaNovaDinamica: false,
  setNevoaNovaDinamica: (nevoaNovaDinamica) => set({ nevoaNovaDinamica }),

  textoNovo: { tamanho: TEXTO_TAMANHO },
  setTextoNovo: (patch) =>
    set((estado) => ({ textoNovo: { ...estado.textoNovo, ...patch } })),

  tipoDeForma: "retangulo",
  corForma: undefined,
  espessuraForma: FORMA_ESPESSURA,
  fundoForma: undefined,
  setForma: ({ corForma, fundoForma, ...resto }) =>
    set({
      ...resto,
      ...(corForma !== undefined ? { corForma: corForma ?? undefined } : {}),
      ...(fundoForma !== undefined ? { fundoForma: fundoForma ?? undefined } : {}),
    }),
}));
