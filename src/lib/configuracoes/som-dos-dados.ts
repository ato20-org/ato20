import { useConfiguracoesStore } from "@/lib/configuracoes/registro";
import type { Definicao } from "@/lib/configuracoes/valor";
import { t } from "@/lib/i18n/desktop";

/**
 * O som dos dados que caem no Mestre, por MÁQUINA: é a caixa de som de quem
 * está sentado nela, e exportar a campanha não leva o gosto do mestre.
 *
 * Ligado por padrão. Desligado, o dado cai calado e o resto do som da mesa
 * segue igual. Ver `tocarQueda`.
 */
export const CHAVE_DO_SOM_DOS_DADOS = "ato20.dados.som";

const DEFINICAO: Definicao = {
  chave: CHAVE_DO_SOM_DOS_DADOS,
  titulo: t.definicoes.somDosDados,
  descricao: t.definicoes.somDosDadosDescricao,
  tipo: "booleano",
  padrao: true,
  escopo: "maquina",
  dono: "ato20",
};

useConfiguracoesStore.getState().definir([DEFINICAO]);
