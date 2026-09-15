import type { ItemBox } from "@/lib/geometry/transform";

/**
 * Onde uma imagem cabe dentro de uma caixa, sem deformar e sem cortar.
 *
 * É o que `object-fit: contain` faz, feito aqui -- e a razão de não ser o CSS é
 * medida, não gosto: dentro do palco, `contain` e `cover` ERRAM.
 *
 * ## O que foi medido
 *
 * O plano de conteúdo troca `transform` por `zoom` quando a câmera para (ver
 * `conteudoNoLayout`, no `SceneStage`), e `contain` calcula a caixa com o
 * tamanho NATURAL do arquivo -- que, sob `zoom`, o WebKitGTK mede já
 * multiplicado pela ampliação. Passado o teto do motor, o número volta cortado
 * e a proporção sai errada.
 *
 * Comparando o DESENHO em `zoom` contra o mesmo quadro em `transform`, com a
 * câmera parada no mesmo lugar:
 *
 *   ajuste      escala 2,0                  escala 3,0
 *   contain     comprime x em 6%            não desenha
 *   cover       desenha fora do lugar       não desenha
 *   fill        idêntico                    idêntico
 *
 * `fill` passa porque não tem proporção para calcular: estica para a caixa que
 * mandarem. Então a conta vem para cá, e o CSS só recebe números.
 *
 * Quando o defeito ALCANÇA depende do arquivo, e o teto do palco é 800%. Numa
 * caixa do tamanho de um retrato:
 *
 *   arquivo    200%   400%   600%    800%
 *   1024px     ok     ok     ok      ok
 *   2048px     ok     ok     ok      ok
 *   4096px     ok     ok     ok      quebra
 *   8192px     ok     ok     quebra  quebra
 *
 * Arquivo pequeno nunca alcança, e é por isso que o palco conviveu com isto:
 * quem estourava era o MAPA, o único arquivo grande que sempre esteve lá.
 *
 * ## O que ela devolve
 *
 * Posição e tamanho em unidade de cena, relativos à caixa -- para entrarem
 * direto num `style` de elemento `absolute` dentro dela. Zero em qualquer lado
 * do arquivo é medida que não veio: aí a imagem ocupa a caixa inteira, que é o
 * que o `contain` também faria sem proporção para respeitar.
 */
export function caberEm(
  natural: { largura: number; altura: number },
  caixa: { width: number; height: number },
): Pick<ItemBox, "x" | "y" | "width" | "height"> {
  if (natural.largura <= 0 || natural.altura <= 0)
    return { x: 0, y: 0, width: caixa.width, height: caixa.height };

  const cabe = Math.min(
    caixa.width / natural.largura,
    caixa.height / natural.altura,
  );
  const width = natural.largura * cabe;
  const height = natural.altura * cabe;

  return {
    x: (caixa.width - width) / 2,
    y: (caixa.height - height) / 2,
    width,
    height,
  };
}
