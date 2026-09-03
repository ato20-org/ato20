import type { Scene } from "@/types/scene";

/**
 * Em quantas cenas o asset é usado — como fundo, como item ou como ambiente.
 *
 * Serve para barrar a exclusão de um arquivo que está em uso: apagar deixaria
 * itens apontando para um `assetId` inexistente, renderizando um retângulo
 * vazio que o mestre não entende de onde veio.
 */
export function countAssetUsage(scenes: Scene[], assetId: string): number {
  return scenes.filter(
    (scene) =>
      scene.backgroundAssetId === assetId ||
      scene.audio?.assetId === assetId ||
      scene.items.some((item) => item.assetId === assetId),
  ).length;
}
