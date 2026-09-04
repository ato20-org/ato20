import type { AssetMeta } from "@/types/scene";

/**
 * Tipo próprio no `dataTransfer`.
 *
 * Não `text/plain`: com um tipo genérico, qualquer texto arrastado de outra
 * aba viraria tentativa de inserir imagem, e o palco precisaria adivinhar o
 * que recebeu. Um tipo dedicado faz o navegador filtrar por nós.
 */
export const ASSET_DRAG_TYPE = "application/x-ato20-asset";

/**
 * O que viaja no arrasto.
 *
 * As medidas naturais vão junto porque o palco não conhece o acervo: ele
 * recebe o que foi solto, não um id para consultar numa lista que vive noutro
 * painel.
 */
export type AssetDragPayload = {
  assetId: string;
  naturalWidth?: number;
  naturalHeight?: number;
};

export function writeAssetDrag(transfer: DataTransfer, asset: AssetMeta): void {
  const payload: AssetDragPayload = {
    assetId: asset.id,
    naturalWidth: asset.naturalWidth,
    naturalHeight: asset.naturalHeight,
  };

  transfer.setData(ASSET_DRAG_TYPE, JSON.stringify(payload));
  transfer.effectAllowed = "copy";
}

/** `null` quando o que foi solto não é imagem do acervo. */
export function readAssetDrag(transfer: DataTransfer): AssetDragPayload | null {
  const raw = transfer.getData(ASSET_DRAG_TYPE);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as AssetDragPayload;

    return parsed.assetId ? parsed : null;
  } catch {
    // Arrasto de outra origem com o mesmo tipo: ignorar é melhor que quebrar.
    return null;
  }
}

/** O arrasto atual carrega imagem do acervo. */
export function hasAssetDrag(transfer: DataTransfer): boolean {
  // Durante `dragover` o conteúdo é ilegível por segurança — só os tipos são.
  return transfer.types.includes(ASSET_DRAG_TYPE);
}
