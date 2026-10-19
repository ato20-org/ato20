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

/**
 * Tamanho de um token cuja imagem nao declara dimensao.
 *
 * Menor que o do acervo (480x270, medida de mapa): token e figura de pessoa
 * sobre a grade, e nascer do tamanho de um mapa faria o mestre encolher toda
 * vez.
 *
 * Em pe, e nao quadrado. Era quadrado, e o resultado era uma pessoa esticada
 * na largura -- e o gizmo do item trava a proporcao, entao redimensionar depois
 * mantinha o erro: o token nascia quadrado e continuava quadrado para sempre. A
 * unica saida era apagar e por de novo.
 *
 * Continua sendo chute, porque sem a medida do arquivo nao ha o que preservar.
 * Chute de figura em pe erra menos que chute de quadrado, e e usado so quando o
 * acervo nao sabe a dimensao -- ver `PorNoMapa`, que exige o registro do
 * acervo justamente para nao precisar chutar.
 */
const TAMANHO_PADRAO = { x: 140, y: 187 };

/**
 * Com que tamanho o token entra no mapa, em unidades de cena.
 *
 * Uma funcao e nao duas contas porque os dois gestos que poem o token -- o
 * botao, que poe no centro, e o arrasto, que poe onde a mao soltou -- tem de
 * concordar: o arrasto ainda multiplica isto pelo que a roda pediu, e uma base
 * diferente faria a roda parada dar um token de outro tamanho que o botao.
 */
export function tamanhoDoToken(miniatura: AssetMeta | undefined): { x: number; y: number } {
  return miniatura?.naturalWidth && miniatura.naturalHeight
    ? fitInitialSize(miniatura.naturalWidth, miniatura.naturalHeight)
    : TAMANHO_PADRAO;
}
