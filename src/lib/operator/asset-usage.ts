import type { Scene, SessionTrack } from "@/types/scene";

/**
 * Em quantos lugares o asset é usado: cenas onde aparece, mais a trilha da
 * sessão.
 *
 * Serve para barrar a exclusão de um arquivo em uso: apagar deixaria a cena
 * apontando para um `assetId` inexistente, renderizando um retângulo vazio
 * que o mestre não entende de onde veio — ou a trilha apontando para o nada.
 */
export function countAssetUsage(
  scenes: Scene[],
  assetId: string,
  track?: SessionTrack | null,
): number {
  const inScenes = scenes.filter(
    (scene) =>
      scene.backgroundAssetId === assetId ||
      scene.items.some((item) => item.assetId === assetId),
  ).length;

  return inScenes + (track?.assetId === assetId ? 1 : 0);
}
