import type { Portrait, Scene, SessionTrack } from "@/types/scene";

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

/**
 * Todo `assetId` que a mesa depende — cenas, fundos, retratos e trilha.
 *
 * É o que a faxina do bucket nunca apaga: o binário no Storage é a fonte da TV
 * e do celular do jogador, e tirá-lo de lá deixaria a mesa com retângulos
 * vazios no meio da sessão.
 */
export function collectUsedAssetIds(
  scenes: Scene[],
  portraits: Portrait[],
  track: SessionTrack | null,
): Set<string> {
  const used = new Set<string>();

  for (const scene of scenes) {
    if (scene.backgroundAssetId) used.add(scene.backgroundAssetId);
    for (const item of scene.items) used.add(item.assetId);
  }

  for (const portrait of portraits) used.add(portrait.assetId);
  if (track) used.add(track.assetId);

  return used;
}
