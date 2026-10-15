import { fitInitialSize } from "@/lib/geometry/transform";
import type { AssetMeta } from "@/types/scene";

/**
 * O tamanho de quem não tem medida: o arquivo antigo, de antes de o acervo
 * guardar a largura e a altura natural. 16:9, que é o que a maioria dos mapas e
 * handouts é.
 */
const SEM_MEDIDA = { x: 480, y: 270 };

/**
 * O tamanho com que a imagem do acervo entra na cena, em unidades de cena.
 *
 * Num lugar só porque quatro portas levam a mesma imagem ao mesmo palco: a
 * linha da árvore de Arquivos, o handout, o ponto e a paleta. Duas contas
 * diferentes fariam a mesma imagem nascer de dois tamanhos.
 */
export function tamanhoNaCena(asset: AssetMeta): { x: number; y: number } {
  return asset.naturalWidth && asset.naturalHeight
    ? fitInitialSize(asset.naturalWidth, asset.naturalHeight)
    : SEM_MEDIDA;
}
