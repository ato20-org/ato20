import {
  boundsOfItems,
  boxBounds,
  itemBounds,
  unionBounds,
  type Bounds,
} from "@/lib/geometry/bounds";
import { PLANO } from "@/lib/geometry/viewport";
import { caixaDoTexto } from "@/lib/mestre/ligacoes";
import type { Scene, Traco } from "@/types/scene";

/**
 * A área que a cena OCUPA de fato: o plano mais tudo o que foi colocado fora
 * dele.
 *
 * É a caixa que o palco do Mestre desenha e a que os limites de navegação
 * medem. Duas caixas e não uma: esta é o que existe, e `comFolga` a estica no
 * vazio alcançável em volta. Desenhar a caixa com a folga dentro mostraria uma
 * borda a um plano inteiro de distância do token mais afastado, que não é
 * informação nenhuma.
 *
 * O PLANO entra como piso, nunca como teto. Com tudo dentro dele o resultado é
 * o próprio plano, e o palco se comporta exatamente como antes destes limites
 * existirem — é o que garante que a cena comum não mudou.
 *
 * O fundo não é medido: ele preenche o plano e nada além, então já está contido
 * no piso.
 *
 * Alfinetes e postits contam mesmo NUNCA chegando à mesa (`sceneForTable` corta
 * os dois). O que se mede aqui é o espaço de trabalho do mestre, e foi
 * justamente poder estacionar uma nota fora do mapa que criou a necessidade de
 * alcançar o lado de fora — ver `FOLGA_X`.
 */
export function limitesDoConteudo(scene: Scene): Bounds {
  const caixas: Bounds[] = [PLANO];

  // Itens pelo `boundsOfItems`, e não pelo `x/y/width/height` cru: ele resolve
  // o giro pelos quatro cantos, e um token torto ocupa mais que a caixa dele.
  const itens = boundsOfItems(scene.items);
  if (itens) caixas.push(itens);

  // Pela caixa GIRADA, como os itens e pela mesma razão: uma área torta ocupa
  // mais que o retângulo cru dela, e o que se mede aqui é até onde o mestre
  // precisa alcançar.
  for (const regiao of scene.fog)
    caixas.push(itemBounds({ ...regiao, rotation: regiao.rotation ?? 0 }));

  for (const pin of scene.pins ?? [])
    caixas.push({ minX: pin.x, minY: pin.y, maxX: pin.x, maxY: pin.y });

  for (const postit of scene.postits ?? [])
    caixas.push(
      boxBounds({
        x: postit.x,
        y: postit.y,
        width: postit.largura,
        height: postit.altura,
      }),
    );

  const riscos = limitesDosTracos(scene.tracos);
  if (riscos) caixas.push(riscos);

  for (const texto of scene.textos ?? []) caixas.push(caixaDoTexto(texto));

  const formas = boundsOfItems(scene.formas ?? []);
  if (formas) caixas.push(formas);

  for (const documento of scene.documentos ?? [])
    caixas.push(
      boxBounds({
        x: documento.x,
        y: documento.y,
        width: documento.largura,
        height: documento.altura,
      }),
    );

  // Nunca `null`: o PLANO está sempre na lista.
  return unionBounds(caixas)!;
}

/**
 * A caixa de UM risco, que guarda os pontos ACHATADOS — `x0, y0, x1, y1, ...`.
 *
 * Percorrida em laço e não por `Math.min(...pontos)`: um risco de três
 * segundos tem umas duzentas amostras, e espalhar as amostras como argumentos
 * é o caminho para estourar a pilha de chamada num lugar onde o laço custa o
 * mesmo.
 *
 * `null` no risco sem ponto nenhum: não há o que medir, e uma caixa de
 * `Infinity` contaminaria a união inteira.
 *
 * Exportada porque a ÁREA DE SELEÇÃO mira nela: é por esta caixa que o laço
 * decide se pegou o risco, do mesmo jeito que `caixaDoTexto` decide pela
 * frase. Encostar já inclui — a mesma medida do resto do palco.
 */
export function caixaDoTraco(traco: Traco): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i + 1 < traco.pontos.length; i += 2) {
    const x = traco.pontos[i]!;
    const y = traco.pontos[i + 1]!;

    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

/** A união das caixas de todos os riscos da cena. */
function limitesDosTracos(tracos: Scene["tracos"]): Bounds | null {
  if (!tracos?.length) return null;

  const caixas: Bounds[] = [];
  for (const traco of tracos) {
    const caixa = caixaDoTraco(traco);
    if (caixa) caixas.push(caixa);
  }

  return unionBounds(caixas);
}

/**
 * Se duas caixas são a mesma.
 *
 * Existe para o palco poder recalcular os limites a cada quadro de arrasto sem
 * que isso vire um `set` por quadro: durante quase todo arrasto o item anda
 * DENTRO da caixa, e a caixa não muda. Medido: a conta inteira custa 0,4% de um
 * quadro numa cena pesada, então o que valia evitar nunca foi a conta — era a
 * onda de re-render que um estado novo por quadro provocaria.
 */
export function mesmosLimites(a: Bounds, b: Bounds): boolean {
  return (
    a.minX === b.minX &&
    a.minY === b.minY &&
    a.maxX === b.maxX &&
    a.maxY === b.maxY
  );
}
