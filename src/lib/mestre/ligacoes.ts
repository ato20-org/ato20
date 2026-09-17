import { itemBounds, type Bounds } from "@/lib/geometry/bounds";
import { rotateVec, type Vec } from "@/lib/geometry/transform";
import type {
  Ligacao,
  PontaDeLigacao,
  RefLigacao,
  Scene,
  Texto,
} from "@/types/scene";

/**
 * A geometria das setas do quadro: onde cada ponta encosta, o que há sob um
 * clique, e quais ligações morrem quando algo é apagado.
 *
 * Tudo em coordenadas de cena e sem DOM: a seta se desenha num `<svg>` que já
 * vive nessas coordenadas (ver `PinTethers`), e medir o elemento na tela a
 * cada quadro custaria um `getBoundingClientRect` por ponta por ligação.
 */

/**
 * A caixa estimada de um texto solto. Sem medir a fonte: 0,55 do tamanho por
 * letra é a média de uma sem serifa, e errar uns pixels na borda de uma seta
 * não se nota. O `<textarea>` que edita usa a mesma conta para nascer do
 * tamanho certo.
 */
export function caixaDoTexto(texto: Texto): Bounds {
  const reta = caixaRetaDoTexto(texto);
  if (!texto.rotation) return reta;

  // Girada: a caixa que contém os quatro cantos girados, como `itemBounds`.
  const centro = centroDe(reta);
  const meiaLargura = (reta.maxX - reta.minX) / 2;
  const meiaAltura = (reta.maxY - reta.minY) / 2;
  const cantos = [
    { x: -meiaLargura, y: -meiaAltura },
    { x: meiaLargura, y: -meiaAltura },
    { x: meiaLargura, y: meiaAltura },
    { x: -meiaLargura, y: meiaAltura },
  ].map((canto) => rotateVec(canto, texto.rotation ?? 0));

  return {
    minX: centro.x + Math.min(...cantos.map((c) => c.x)),
    minY: centro.y + Math.min(...cantos.map((c) => c.y)),
    maxX: centro.x + Math.max(...cantos.map((c) => c.x)),
    maxY: centro.y + Math.max(...cantos.map((c) => c.y)),
  };
}

/**
 * A caixa do texto SEM o giro: é a que o gizmo de transformação recebe, com a
 * rotação à parte, e a que o `<textarea>` ocupa.
 */
export function caixaRetaDoTexto(texto: Texto): Bounds {
  const linhas = texto.texto.split("\n");
  const maior = Math.max(1, ...linhas.map((linha) => linha.length));
  // A medida real quando o mestre já desenhou o texto; a estimativa antes.
  const largura = texto.largura ?? maior * texto.tamanho * LARGURA_POR_LETRA;
  const altura = texto.altura ?? linhas.length * texto.tamanho * ALTURA_DA_LINHA;

  return {
    minX: texto.x,
    minY: texto.y,
    maxX: texto.x + largura,
    maxY: texto.y + altura,
  };
}

/** Largura média de uma letra e altura de linha, em fração do tamanho da fonte. */
export const LARGURA_POR_LETRA = 0.55;
export const ALTURA_DA_LINHA = 1.25;

/** A caixa de uma ponta. `null` quando o alvo não existe mais na cena. */
export function caixaDe(scene: Scene, ref: RefLigacao): Bounds | null {
  switch (ref.tipo) {
    case "item": {
      const item = scene.items.find((atual) => atual.id === ref.id);
      return item ? itemBounds(item) : null;
    }
    case "postit": {
      const postit = scene.postits?.find((atual) => atual.id === ref.id);
      return postit
        ? {
            minX: postit.x,
            minY: postit.y,
            maxX: postit.x + postit.largura,
            maxY: postit.y + postit.altura,
          }
        : null;
    }
    case "texto": {
      const texto = scene.textos?.find((atual) => atual.id === ref.id);
      return texto ? caixaDoTexto(texto) : null;
    }
    case "documento": {
      const documento = scene.documentos?.find((atual) => atual.id === ref.id);
      return documento
        ? {
            minX: documento.x,
            minY: documento.y,
            maxX: documento.x + documento.largura,
            maxY: documento.y + documento.altura,
          }
        : null;
    }
    case "pin": {
      const pin = scene.pins?.find((atual) => atual.id === ref.id);
      // O alfinete é um ponto: caixa de tamanho zero, e a seta chega nele.
      return pin ? { minX: pin.x, minY: pin.y, maxX: pin.x, maxY: pin.y } : null;
    }
  }
}

export function centroDe(caixa: Bounds): Vec {
  return {
    x: (caixa.minX + caixa.maxX) / 2,
    y: (caixa.minY + caixa.maxY) / 2,
  };
}

/**
 * Onde a reta do centro da caixa até `alvo` cruza a borda dela.
 *
 * É daí que a seta sai e é aí que ela chega: uma seta que nascesse no centro
 * atravessaria o próprio postit. Caixa de tamanho zero devolve o centro.
 */
export function ancoraNaBorda(caixa: Bounds, alvo: Vec): Vec {
  const centro = centroDe(caixa);
  const dx = alvo.x - centro.x;
  const dy = alvo.y - centro.y;
  const meiaLargura = (caixa.maxX - caixa.minX) / 2;
  const meiaAltura = (caixa.maxY - caixa.minY) / 2;

  if ((dx === 0 && dy === 0) || (meiaLargura === 0 && meiaAltura === 0))
    return centro;

  // O menor fator que leva o vetor até uma das quatro bordas.
  const tx = dx === 0 ? Infinity : meiaLargura / Math.abs(dx);
  const ty = dy === 0 ? Infinity : meiaAltura / Math.abs(dy);
  const t = Math.min(tx, ty);

  return { x: centro.x + dx * t, y: centro.y + dy * t };
}

/** Raio do alfinete para efeito de clique, em unidades de cena. */
const RAIO_DO_PIN = 24;

function dentro(caixa: Bounds, ponto: Vec): boolean {
  return (
    ponto.x >= caixa.minX &&
    ponto.x <= caixa.maxX &&
    ponto.y >= caixa.minY &&
    ponto.y <= caixa.maxY
  );
}

/**
 * O que há sob um ponto do quadro, na ordem de quem está por cima: texto e
 * postit primeiro (são os controles do mestre, acima do conteúdo), alfinete
 * depois, imagem por último e da frente para o fundo.
 */
export function ligavelEm(scene: Scene, ponto: Vec): RefLigacao | null {
  for (const texto of [...(scene.textos ?? [])].reverse())
    if (dentro(caixaDoTexto(texto), ponto))
      return { tipo: "texto", id: texto.id };

  for (const postit of [...(scene.postits ?? [])].reverse())
    if (
      dentro(
        {
          minX: postit.x,
          minY: postit.y,
          maxX: postit.x + postit.largura,
          maxY: postit.y + postit.altura,
        },
        ponto,
      )
    )
      return { tipo: "postit", id: postit.id };

  for (const documento of [...(scene.documentos ?? [])].reverse())
    if (
      dentro(
        {
          minX: documento.x,
          minY: documento.y,
          maxX: documento.x + documento.largura,
          maxY: documento.y + documento.altura,
        },
        ponto,
      )
    )
      return { tipo: "documento", id: documento.id };

  for (const pin of scene.pins ?? [])
    if (Math.hypot(pin.x - ponto.x, pin.y - ponto.y) <= RAIO_DO_PIN)
      return { tipo: "pin", id: pin.id };

  const itens = [...scene.items].sort((a, b) => b.z - a.z);
  for (const item of itens)
    if (dentro(itemBounds(item), ponto)) return { tipo: "item", id: item.id };

  return null;
}

export function mesmaRef(a: RefLigacao, b: RefLigacao): boolean {
  return a.tipo === b.tipo && a.id === b.id;
}

/** A ponta está presa a uma coisa do quadro, e não solta na folha? */
export function ancorada(ponta: PontaDeLigacao): ponta is RefLigacao {
  return "tipo" in ponta;
}

/** As duas pontas ancoradas na mesma coisa. Seta de um postit para ele mesmo. */
export function mesmaPonta(a: PontaDeLigacao, b: PontaDeLigacao): boolean {
  return ancorada(a) && ancorada(b) && mesmaRef(a, b);
}

/**
 * As ligações que sobrevivem quando `ids` somem da cena. Por id só, sem tipo:
 * os ids são únicos entre todas as listas, e conferir o tipo aqui obrigaria
 * cada `remove*` do store a dizer o seu.
 *
 * Devolve `undefined` quando esvazia, como as outras listas da cena: é a
 * ausência do campo que `sceneForTable` reconhece.
 */
export function semReferencia(
  ligacoes: Ligacao[] | undefined,
  ids: Iterable<string>,
): Ligacao[] | undefined {
  if (!ligacoes?.length) return ligacoes;
  const mortos = new Set(ids);
  const morta = (ponta: PontaDeLigacao) => ancorada(ponta) && mortos.has(ponta.id);
  const vivas = ligacoes.filter(
    (ligacao) => !morta(ligacao.de) && !morta(ligacao.para),
  );
  return vivas.length > 0 ? vivas : undefined;
}

/** Uma seta pronta para desenhar: a ligação e as duas pontas na borda. */
export type Seta = { ligacao: Ligacao; a: Vec; b: Vec };

/**
 * As setas da cena, com as pontas resolvidas. Ponta sem alvo não deveria
 * existir -- `semReferencia` cuida --, mas um arquivo editado à mão não pode
 * derrubar o quadro: a seta órfã só não desenha.
 */
export function setasDe(scene: Scene): Seta[] {
  return (scene.ligacoes ?? []).flatMap((ligacao) => {
    const pontas = pontasDe(scene, ligacao.de, ligacao.para);
    return pontas ? [{ ligacao, ...pontas }] : [];
  });
}

/**
 * Onde as duas pontas de uma seta ficam de fato. Ponta livre é o próprio
 * ponto; ponta ancorada encosta na borda da caixa, virada para a outra ponta
 * -- para o centro da outra caixa quando ela também é ancorada, e para o ponto
 * quando é livre. `null` quando uma âncora perdeu o alvo.
 */
export function pontasDe(
  scene: Scene,
  de: PontaDeLigacao,
  para: PontaDeLigacao,
): { a: Vec; b: Vec } | null {
  const caixaDe_ = ancorada(de) ? caixaDe(scene, de) : null;
  const caixaPara = ancorada(para) ? caixaDe(scene, para) : null;
  if ((ancorada(de) && !caixaDe_) || (ancorada(para) && !caixaPara)) return null;

  const miraDe = caixaPara ? centroDe(caixaPara) : (para as Vec);
  const miraPara = caixaDe_ ? centroDe(caixaDe_) : (de as Vec);

  return {
    a: caixaDe_ ? ancoraNaBorda(caixaDe_, miraDe) : (de as Vec),
    b: caixaPara ? ancoraNaBorda(caixaPara, miraPara) : (para as Vec),
  };
}

/** A ponta que um solte neste ponto cria: ancorada no que há ali, ou livre. */
export function pontaEm(scene: Scene, ponto: Vec): PontaDeLigacao {
  return (
    ligavelEm(scene, ponto) ?? { x: Math.round(ponto.x), y: Math.round(ponto.y) }
  );
}
