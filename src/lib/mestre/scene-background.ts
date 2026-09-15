"use client";

import { countAssetUsage } from "@/lib/mestre/asset-usage";
import { invalidarAcervo } from "@/lib/store/use-assets-store";
import { useCharactersStore } from "@/lib/store/use-characters-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { deleteAsset, importAssets, setAssetEscopo } from "@/lib/vault/assets";
import type { Scene } from "@/types/scene";

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

  // O mapa trocado sai da campanha junto com a troca. Ver `descartarFundo`.
  await descartarFundo(anterior);

  return true;
}

/** Tira o fundo da cena, e leva o arquivo junto. */
export async function tirarFundoDaCena(sceneId: string): Promise<void> {
  const anterior = fundoAtual(sceneId);

  useSceneStore.getState().setBackground(sceneId, undefined);

  await descartarFundo(anterior);
}

function fundoAtual(sceneId: string): string | undefined {
  return useSceneStore
    .getState()
    .board?.scenes.find((cena) => cena.id === sceneId)?.backgroundAssetId;
}

/**
 * Apaga o arquivo que deixou de ser fundo.
 *
 * Antes ele era só desmarcado, e voltava a aparecer na biblioteca. Estava
 * errado pelo mesmo motivo que tirou o fundo de lá: o mapa entrou na campanha
 * PARA SER o fundo daquela cena, e sem a cena não é de ninguém — quem tira o
 * fundo quer o mapa fora, e não um arquivo a mais na lista para ele apagar
 * depois. Trocar o fundo é a mesma história: o mapa velho não vira acervo.
 *
 * Duas ressalvas, e as duas existem porque o mesmo id pode ter mais de um uso:
 *
 * - Duplicar uma cena copia o `backgroundAssetId`, e as duas passam a apontar
 *   para o mesmo arquivo. Apagar deixaria a outra cena com um mapa que não
 *   existe mais.
 * - Campanhas anteriores ao escopo escolhiam o fundo NA biblioteca, então um
 *   fundo de lá pode ser também item de mapa, retrato ou miniatura. Aí o
 *   arquivo fica, e só perde o dono — que é o que esta função fazia sempre.
 */
async function descartarFundo(assetId: string | undefined): Promise<void> {
  if (!assetId) return;

  const cenas = useSceneStore.getState().board?.scenes ?? [];

  if (cenas.some((cena) => cena.backgroundAssetId === assetId)) return;

  if (usadoForaDoFundo(assetId, cenas)) {
    await setAssetEscopo(assetId, undefined);
    invalidarAcervo("image");
    return;
  }

  await deleteAsset(assetId);
  invalidarAcervo("image");
}

/**
 * O arquivo ainda serve a alguma outra coisa: item de mapa, retrato ou
 * miniatura.
 *
 * Fundo nenhum chega aqui: `descartarFundo` já saiu antes se alguma cena ainda
 * o usa como fundo, e por isso o que `countAssetUsage` acha são os itens.
 *
 * Personagens vêm do store, e `null` — ninguém leu ainda — conta como "pode
 * ser": o preço de errar para este lado é um arquivo a mais na biblioteca, e
 * para o outro é um retrato que some da ficha.
 */
function usadoForaDoFundo(assetId: string, cenas: Scene[]): boolean {
  if (countAssetUsage(cenas, assetId) > 0) return true;

  const personagens = useCharactersStore.getState().personagens;
  if (personagens === null) return true;

  return personagens.some(
    (personagem) =>
      personagem.retrato === assetId || personagem.miniatura === assetId,
  );
}
