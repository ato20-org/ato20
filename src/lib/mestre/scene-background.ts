"use client";

import { invalidarAcervo } from "@/lib/store/use-assets-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { importAssets, setAssetEscopo } from "@/lib/vault/assets";

/**
 * Escolhe o fundo da cena, a partir de um arquivo do disco.
 *
 * O fundo era escolhido na biblioteca de imagens: cada linha de lá tinha um
 * botão de "usar como fundo". A lista virou o lugar onde toda imagem da campanha
 * aparecia — o fundo de cada cena, o retrato e a miniatura de cada personagem —,
 * e nela se misturava o que ainda vai ser escolhido com o que já é de alguém.
 *
 * Agora cada imagem tem UMA casa: fundo pertence à cena, retrato e miniatura ao
 * personagem, e a biblioteca fica com o que serve a qualquer cena.
 *
 * Importa com escopo `cena`, e por isso o arquivo entra sem aparecer na
 * biblioteca. O gesto é o mesmo dos três campos do personagem — escolher
 * arquivo —, e por baixo também: ver `preencherCampoComArquivo`.
 *
 * Não oferece reaproveitar o fundo de outra cena. Reusar o mesmo mapa importa o
 * arquivo de novo, e o zip cresce — foi a escolha deliberada: um seletor que
 * lista fundos de outras cenas é a biblioteca de volta, com outro nome.
 *
 * Devolve `false` quando o mestre fechou o seletor, que não é erro.
 */
export async function escolherFundoDaCena(sceneId: string): Promise<boolean> {
  const resultado = await importAssets("image", "cena");
  if (!resultado) return false;

  const primeiro = resultado.aceitos[0];
  if (!primeiro)
    throw new Error(resultado.recusados[0] ?? "Nada foi importado.");

  const anterior = fundoAtual(sceneId);

  // Entrou com dono, então a biblioteca não vai listá-lo -- mas o registro dele
  // é o que diz a dimensão natural do arquivo, e há tela que a pede pelo id.
  invalidarAcervo("image");

  useSceneStore.getState().setBackground(sceneId, primeiro.id);

  // O que era fundo deixa de ser de alguém, e volta para a biblioteca. Sem
  // isto ele ficaria marcado como `cena` sem ser fundo de nenhuma: escondido da
  // lista e sem lugar de onde ser alcançado.
  await soltarFundo(anterior);

  return true;
}

/** Tira o fundo da cena, e devolve o arquivo à biblioteca. */
export async function tirarFundoDaCena(sceneId: string): Promise<void> {
  const anterior = fundoAtual(sceneId);

  useSceneStore.getState().setBackground(sceneId, undefined);

  await soltarFundo(anterior);
}

function fundoAtual(sceneId: string): string | undefined {
  return useSceneStore
    .getState()
    .board?.scenes.find((cena) => cena.id === sceneId)?.backgroundAssetId;
}

/**
 * Desmarca o arquivo, se nenhuma outra cena ainda o usar.
 *
 * A checagem existe porque duplicar uma cena copia o `backgroundAssetId`: as
 * duas passam a apontar para o mesmo arquivo, e tirar o fundo de uma não pode
 * devolver à biblioteca algo que a outra ainda está mostrando.
 */
async function soltarFundo(assetId: string | undefined): Promise<void> {
  if (!assetId) return;

  const aindaEmUso = useSceneStore
    .getState()
    .board?.scenes.some((cena) => cena.backgroundAssetId === assetId);

  if (aindaEmUso) return;

  await setAssetEscopo(assetId, undefined);
  invalidarAcervo("image");
}
