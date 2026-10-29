import { useConfiguracoesStore } from "@/lib/configuracoes/registro";
import type { Definicao } from "@/lib/configuracoes/valor";
import { t } from "@/lib/i18n/mestre";
import { gravarConfiguracoes, lerConfiguracoes } from "@/lib/vault/configuracoes";

/**
 * Como a seção de atributos se desenha nesta CAMPANHA: `""` são os cartões de
 * fábrica, e `{plugin}/{estilo}` é a imagem de um plugin com o número de cada
 * sigla no lugar dela -- o ritual do Ordem.
 *
 * Quem decide é o SISTEMA, e não um seletor: campanha de Ordem é ritual. Aplicar
 * um sistema que declara o desenho o põe aqui (`estiloDoSistema`), e não há
 * outra porta -- a chave é `oculta` na lista de Ajustes.
 *
 * No registro de configurações, e não num arquivo próprio: é da campanha,
 * viaja no zip com ela, e o celular a recebe pelo declarativo, que já assina o
 * registro. Texto, e não escolha: o valor de um plugin desligado tem de esperar
 * no arquivo pela volta dele, como espera o estilo do medidor.
 */
export const CHAVE_ESTILO_DOS_ATRIBUTOS = "ato20.ficha.estiloDosAtributos";

const DEFINICAO: Definicao = {
  chave: CHAVE_ESTILO_DOS_ATRIBUTOS,
  titulo: t.definicoes.estiloDosAtributos,
  descricao: t.definicoes.estiloDosAtributosDescricao,
  tipo: "texto",
  padrao: "",
  escopo: "campanha",
  oculta: true,
  dono: "ato20",
};

useConfiguracoesStore.getState().definir([DEFINICAO]);

/**
 * O desenho que um sistema aplicado traz. Sistema sem desenho não mexe: a
 * campanha de Ordem que ganha o sistema de outro plugin, só de condições,
 * continua no ritual.
 *
 * Com o registro da campanha lido, pelo registro. Na criação da campanha o
 * sistema é aplicado ANTES de o Mestre abrir e ler o registro, e uma gravação
 * por ele seria apagada pela leitura: aí vai direto ao arquivo, que a abertura
 * lê logo em seguida.
 */
export async function estiloDoSistema(chave: string | null | undefined): Promise<void> {
  if (!chave) return;

  const registro = useConfiguracoesStore.getState();
  if (registro.carregado.campanha) {
    registro.gravar(CHAVE_ESTILO_DOS_ATRIBUTOS, chave, "campanha");
    return;
  }

  const lido = await lerConfiguracoes("campanha");
  await gravarConfiguracoes("campanha", { ...lido, [CHAVE_ESTILO_DOS_ATRIBUTOS]: chave });
}
