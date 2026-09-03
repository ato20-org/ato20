import { getAssetUrl } from "@/lib/storage/assets";

/**
 * Toca um som avulso e esquece: porta rangendo, grito, trovão.
 *
 * Cria um elemento por disparo em vez de reusar um só, para dois cliques
 * seguidos soarem sobrepostos em vez de o segundo cortar o primeiro.
 *
 * Sempre nasce de um clique do mestre, então o bloqueio de autoplay do
 * browser não se aplica — mas o `catch` existe porque `play()` também rejeita
 * quando o arquivo está corrompido.
 */
export async function playOneShot(assetId: string, volume: number): Promise<boolean> {
  const url = await getAssetUrl(assetId);
  if (!url) return false;

  const element = new Audio(url);
  element.volume = Math.max(0, Math.min(1, volume));

  try {
    await element.play();
    return true;
  } catch {
    return false;
  }
}
