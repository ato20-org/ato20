/**
 * O recorte de imagem do retrato e da miniatura: que pedaço do arquivo a
 * moldura mostra.
 *
 * Tudo em PIXELS DO ARQUIVO, e não da tela: a moldura do editor tem o tamanho
 * que o diálogo deu a ela, e o pedaço que vai para o canvas não pode depender
 * disso. A tela só entra para converter o arrasto, em `arrastar`.
 *
 * A moldura sempre fica COBERTA pela imagem. Zoom 1 é o maior pedaço da
 * proporção da moldura que cabe no arquivo, e o centro fica preso de modo que o
 * pedaço nunca passe da borda. Recorte com faixa vazia num canto seria um
 * retrato com um buraco transparente que ninguém pediu.
 */

export type Tamanho = { largura: number; altura: number };

/** Onde a moldura está olhando: o zoom e o centro, em pixels do arquivo. */
export type Enquadre = { zoom: number; cx: number; cy: number };

/** O pedaço do arquivo que vai para o canvas, em pixels do arquivo. */
export type Regiao = { x: number; y: number; largura: number; altura: number };

export const ZOOM_MINIMO = 1;
export const ZOOM_MAXIMO = 8;

/**
 * O lado maior da imagem recortada, em pixels.
 *
 * O retrato maior que a mesa desenha ocupa metade da altura da TV, e 1536 cobre
 * isso numa tela 4K com folga. Gravar o pedaço na resolução do arquivo faria um
 * retrato tirado de uma foto de 6000px virar um PNG de dezenas de MB, e o PNG
 * é obrigatório aqui: é ele que guarda o canto transparente do círculo.
 */
export const LADO_MAXIMO_DA_SAIDA = 1536;

function entre(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

/** O maior pedaço da `proporcao` (largura / altura) que cabe no arquivo. */
function pedacoNoZoomUm(natural: Tamanho, proporcao: number): Tamanho {
  if (natural.largura / natural.altura > proporcao) {
    return { largura: natural.altura * proporcao, altura: natural.altura };
  }

  return { largura: natural.largura, altura: natural.largura / proporcao };
}

/** O enquadre de quando a imagem acaba de abrir: tudo que cabe, no meio. */
export function enquadreInicial(natural: Tamanho): Enquadre {
  return { zoom: ZOOM_MINIMO, cx: natural.largura / 2, cy: natural.altura / 2 };
}

/** O enquadre com zoom no intervalo e centro que não deixa a borda aparecer. */
export function prenderEnquadre(
  natural: Tamanho,
  proporcao: number,
  enquadre: Enquadre,
): Enquadre {
  const zoom = entre(enquadre.zoom, ZOOM_MINIMO, ZOOM_MAXIMO);
  const base = pedacoNoZoomUm(natural, proporcao);
  const meiaLargura = base.largura / zoom / 2;
  const meiaAltura = base.altura / zoom / 2;

  return {
    zoom,
    cx: entre(enquadre.cx, meiaLargura, natural.largura - meiaLargura),
    cy: entre(enquadre.cy, meiaAltura, natural.altura - meiaAltura),
  };
}

/** O pedaço do arquivo que este enquadre mostra. */
export function regiaoDoEnquadre(
  natural: Tamanho,
  proporcao: number,
  enquadre: Enquadre,
): Regiao {
  const preso = prenderEnquadre(natural, proporcao, enquadre);
  const base = pedacoNoZoomUm(natural, proporcao);
  const largura = base.largura / preso.zoom;
  const altura = base.altura / preso.zoom;

  return {
    x: preso.cx - largura / 2,
    y: preso.cy - altura / 2,
    largura,
    altura,
  };
}

/**
 * O enquadre depois de a mão arrastar `dx, dy` pixels de TELA sobre uma
 * moldura de `larguraDaMoldura` pixels de tela.
 *
 * A imagem acompanha a mão: arrastar para a direita mostra o que estava à
 * esquerda, e por isso o centro anda no sentido contrário.
 */
export function arrastar(
  natural: Tamanho,
  proporcao: number,
  enquadre: Enquadre,
  dx: number,
  dy: number,
  larguraDaMoldura: number,
): Enquadre {
  const regiao = regiaoDoEnquadre(natural, proporcao, enquadre);
  const porPixel = regiao.largura / larguraDaMoldura;

  return prenderEnquadre(natural, proporcao, {
    zoom: enquadre.zoom,
    cx: regiao.x + regiao.largura / 2 - dx * porPixel,
    cy: regiao.y + regiao.altura / 2 - dy * porPixel,
  });
}

/**
 * O enquadre com outro zoom, mantendo parado o ponto do arquivo que está sob
 * `ponto` -- em fração da moldura, de 0 a 1, e pode passar disso quando o
 * cursor está na margem.
 *
 * É o zoom de qualquer editor de imagem: a roda aproxima onde o cursor aponta.
 * Aproximar sempre pelo centro obrigaria a arrastar depois de cada entalhe.
 */
export function aproximar(
  natural: Tamanho,
  proporcao: number,
  enquadre: Enquadre,
  zoom: number,
  ponto: { x: number; y: number },
): Enquadre {
  const antes = regiaoDoEnquadre(natural, proporcao, enquadre);
  const alvoX = antes.x + ponto.x * antes.largura;
  const alvoY = antes.y + ponto.y * antes.altura;

  const base = pedacoNoZoomUm(natural, proporcao);
  const novoZoom = entre(zoom, ZOOM_MINIMO, ZOOM_MAXIMO);
  const largura = base.largura / novoZoom;
  const altura = base.altura / novoZoom;

  return prenderEnquadre(natural, proporcao, {
    zoom: novoZoom,
    cx: alvoX - ponto.x * largura + largura / 2,
    cy: alvoY - ponto.y * altura + altura / 2,
  });
}

/**
 * O tamanho do canvas para esta região: o da própria região, reduzido até o
 * lado maior caber em `maximo`. Nunca amplia: aumentar pixel no canvas só
 * engorda o arquivo, quem amplia bem é a tela que desenha.
 */
export function tamanhoDaSaida(
  regiao: Regiao,
  maximo: number = LADO_MAXIMO_DA_SAIDA,
): Tamanho {
  const escala = Math.min(1, maximo / Math.max(regiao.largura, regiao.altura));

  return {
    largura: Math.max(1, Math.round(regiao.largura * escala)),
    altura: Math.max(1, Math.round(regiao.altura * escala)),
  };
}
