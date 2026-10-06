import {
  useConfiguracao,
  useConfiguracoesStore,
  valorDe,
} from "@/lib/configuracoes/registro";
import type { Definicao } from "@/lib/configuracoes/valor";

/**
 * Como os elementos NOVOS do quadro nascem nesta campanha.
 *
 * Da CAMPANHA, e não da máquina: é a cara da mesa -- a campanha de terror com
 * rabisco a lápis, a de ficção científica com canto vivo --, e ela vai junto
 * quando a campanha muda de computador.
 *
 * Padrão de NASCIMENTO, e não um modo que redesenha tudo: cada elemento guarda
 * o próprio jeito (`arredondado`, `aMao`), e é isso que o faz chegar à TV pela
 * cena, sem canal novo. Trocar o padrão não mexe no que já está no quadro; o
 * elemento troca o dele no próprio gizmo.
 *
 * No registro, como os ajustes de plugin: a Configuração da campanha desenha um
 * controle à mão para os dois, e a lista gerada de Ajustes mostra os mesmos.
 */
export const CHAVE_DO_QUADRO = {
  arredondado: "quadro.cantosArredondados",
  aMao: "quadro.tracoAMao",
} as const;

const DEFINICOES_DO_QUADRO: Definicao[] = [
  {
    chave: CHAVE_DO_QUADRO.arredondado,
    titulo: "Cantos arredondados",
    descricao: "Retângulos e polígonos novos nascem com canto redondo.",
    tipo: "booleano",
    padrao: false,
    escopo: "campanha",
    dono: "ato20",
  },
  {
    chave: CHAVE_DO_QUADRO.aMao,
    titulo: "Traço à mão",
    descricao:
      "Formas e setas novas saem com traço tremido, e o texto solto nasce em letra de mão.",
    tipo: "booleano",
    padrao: false,
    escopo: "campanha",
    dono: "ato20",
  },
];

useConfiguracoesStore.getState().definir(DEFINICOES_DO_QUADRO);

export type PadraoDoQuadro = { arredondado: boolean; aMao: boolean };

/** O padrão que vale agora, lido na hora -- para quem cria o elemento. */
export function padraoDoQuadro(): PadraoDoQuadro {
  return {
    arredondado: valorDe(CHAVE_DO_QUADRO.arredondado) === true,
    aMao: valorDe(CHAVE_DO_QUADRO.aMao) === true,
  };
}

/** O mesmo, como hook, para quem mostra o controle. */
export function usePadraoDoQuadro(): PadraoDoQuadro {
  return {
    arredondado: useConfiguracao(CHAVE_DO_QUADRO.arredondado) === true,
    aMao: useConfiguracao(CHAVE_DO_QUADRO.aMao) === true,
  };
}

/**
 * Muda o padrão da campanha.
 *
 * Voltar ao padrão de fábrica APAGA a chave em vez de gravar `false`: o
 * arquivo da campanha guarda só o que difere, e é o que ele promete a quem o
 * abre à mão.
 */
export function definirPadraoDoQuadro(patch: Partial<PadraoDoQuadro>): void {
  const { gravar, limpar } = useConfiguracoesStore.getState();

  for (const campo of ["arredondado", "aMao"] as const) {
    const valor = patch[campo];
    if (valor === undefined) continue;

    if (valor) gravar(CHAVE_DO_QUADRO[campo], true, "campanha");
    else limpar(CHAVE_DO_QUADRO[campo], "campanha");
  }
}
