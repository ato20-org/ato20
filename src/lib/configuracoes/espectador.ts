import { useMemo } from "react";

import {
  useConfiguracao,
  useConfiguracoesStore,
} from "@/lib/configuracoes/registro";
import type { Definicao } from "@/lib/configuracoes/valor";
import { t } from "@/lib/i18n/mestre";
import {
  ajusteParaGuardar,
  CANAIS_DA_IMAGEM,
  FAIXA_DA_IMAGEM,
  type AjusteDeImagem,
  type CanalDaImagem,
} from "@/lib/imagem-do-espectador";

/**
 * O ajuste de imagem da CAMPANHA na janela do espectador. Ver
 * `lib/imagem-do-espectador`.
 *
 * Da campanha, e não da máquina: é o tom da mesa inteira, e vai no zip quando
 * ela muda de computador. A calibração da TV também mora aqui -- quem mestra
 * na mesma sala sempre ajusta uma vez e esquece.
 *
 * No registro, como o padrão do quadro: a Configuração da campanha desenha as
 * réguas à mão, e a lista gerada de Ajustes mostra os mesmos quatro números.
 * Chega à mesa pelo `LiveState`, e não pela cena: vale para todas elas.
 */
export const CHAVE_DA_IMAGEM: Record<CanalDaImagem, string> = {
  brilho: "espectador.brilho",
  contraste: "espectador.contraste",
  saturacao: "espectador.saturacao",
  matiz: "espectador.matiz",
};

const DEFINICOES_DA_IMAGEM: Definicao[] = CANAIS_DA_IMAGEM.map((canal) => ({
  chave: CHAVE_DA_IMAGEM[canal],
  titulo: t.definicoes.imagem[canal],
  descricao: t.definicoes.imagemDescricao,
  tipo: "numero",
  padrao: FAIXA_DA_IMAGEM[canal].neutro,
  escopo: "campanha",
  minimo: FAIXA_DA_IMAGEM[canal].minimo,
  maximo: FAIXA_DA_IMAGEM[canal].maximo,
  passo: 1,
  dono: "ato20",
}));

useConfiguracoesStore.getState().definir(DEFINICOES_DA_IMAGEM);

/**
 * O ajuste da campanha que vale agora, ou `undefined` quando é neutro.
 *
 * A MESMA referência enquanto os números não mudam: o `usePublisher` compara
 * campo por identidade, e um objeto novo a cada render faria o Mestre publicar
 * por quadro.
 */
export function useImagemDaCampanha(): AjusteDeImagem | undefined {
  const brilho = useConfiguracao<number>(CHAVE_DA_IMAGEM.brilho);
  const contraste = useConfiguracao<number>(CHAVE_DA_IMAGEM.contraste);
  const saturacao = useConfiguracao<number>(CHAVE_DA_IMAGEM.saturacao);
  const matiz = useConfiguracao<number>(CHAVE_DA_IMAGEM.matiz);

  return useMemo(
    () => ajusteParaGuardar({ brilho, contraste, saturacao, matiz }),
    [brilho, contraste, saturacao, matiz],
  );
}

/**
 * Muda o ajuste da campanha.
 *
 * Canal de volta ao neutro APAGA a chave em vez de gravar 100: o arquivo da
 * campanha guarda só o que difere, como o padrão do quadro.
 */
export function definirImagemDaCampanha(ajuste: AjusteDeImagem | undefined): void {
  const { gravar, limpar } = useConfiguracoesStore.getState();
  const guardado = ajusteParaGuardar(ajuste) ?? {};

  for (const canal of CANAIS_DA_IMAGEM) {
    const valor = guardado[canal];

    if (valor === undefined) limpar(CHAVE_DA_IMAGEM[canal], "campanha");
    else gravar(CHAVE_DA_IMAGEM[canal], valor, "campanha");
  }
}
