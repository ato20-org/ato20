import {
  METROS_DA_PAREDE_PADRAO,
  UNIDADES_POR_METRO,
} from "@/lib/geometry/sombra";
import type {
  AreaDeEfeito,
  FogRegion,
  Forma,
  FormatoDeArea,
  FormatoDeParede,
  NewAreaDeEfeito,
  NewFogRegion,
  NewForma,
  NewParede,
  Parede,
} from "@/types/scene";

/**
 * Os campos com que a PRÓXIMA parede nasce, a partir do painel de Elementos.
 *
 * O padrão não grava campo, a regra que o gizmo já segue: a parede de dois
 * metros, coberta e com a cor lida do mapa é a parede de sempre, e não leva
 * `altura`, `semTeto` nem `cor` para o arquivo da cena. O teto só vale na
 * parede que cerca um miolo -- a `linha` não tem, e nasce sem o campo.
 */
export function camposDaParedeNova(
  nova: { metros: number; comTeto: boolean; cor?: string },
  formato: FormatoDeParede,
): Pick<Parede, "altura" | "semTeto" | "cor"> {
  return {
    ...(nova.metros !== METROS_DA_PAREDE_PADRAO
      ? { altura: nova.metros * UNIDADES_POR_METRO }
      : {}),
    ...(!nova.comTeto && formato !== "linha" ? { semTeto: true } : {}),
    ...(nova.cor ? { cor: nova.cor } : {}),
  };
}

/**
 * O que os quatro elementos do mapa -- forma, parede, área escondida e área de
 * efeito -- têm em comum: a CAIXA, o desenho dentro dela, o giro e a trava.
 *
 * É o que deixa um virar o outro sem perder o lugar: os quatro guardam a mesma
 * caixa e os vértices do laço na mesma fração dela (ver `pontosNaCaixa`), e o
 * que muda entre eles é o que o desenho FAZ -- cercar, parar a luz, esconder,
 * pegar fogo. Trocar o tipo é tirar de uma lista e pôr noutra com a mesma
 * caixa; o que é só daquele tipo (a cor da forma, a altura da parede, o efeito
 * da área) nasce como nasceria se o mestre o desenhasse agora.
 */
export type CaixaDoElemento = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  formato: "retangulo" | "elipse" | "poligono" | "linha";
  pontos?: number[];
  diagonal?: "secundaria";
  locked?: boolean;
  /** A forma e a área de efeito dizem se a mesa vê; a névoa e a parede, não. */
  naMesa?: boolean;
};

/** Um elemento do mapa, com o tipo dele. Ver `CaixaDoElemento`. */
export type ElementoDoMapa =
  | { natureza: "elemento"; forma: Forma }
  | { natureza: "parede"; parede: Parede }
  | { natureza: "area"; nevoa: FogRegion }
  | { natureza: "efeito"; area: AreaDeEfeito };

/** A caixa de um elemento, sem o que é só do tipo dele. */
export function caixaDoElemento(elemento: ElementoDoMapa): CaixaDoElemento {
  const fonte =
    elemento.natureza === "elemento"
      ? { ...elemento.forma, formato: elemento.forma.tipo }
      : elemento.natureza === "parede"
        ? elemento.parede
        : elemento.natureza === "area"
          ? { ...elemento.nevoa, formato: elemento.nevoa.formato ?? "retangulo" }
          : { ...elemento.area, formato: elemento.area.formato ?? "retangulo" };

  return semAusentes({
    x: fonte.x,
    y: fonte.y,
    width: fonte.width,
    height: fonte.height,
    rotation: fonte.rotation || undefined,
    formato: fonte.formato,
    pontos: fonte.formato === "poligono" ? fonte.pontos : undefined,
    diagonal: "diagonal" in fonte ? fonte.diagonal : undefined,
    locked: fonte.locked,
    naMesa:
      elemento.natureza === "elemento"
        ? elemento.forma.naMesa
        : elemento.natureza === "efeito"
          ? elemento.area.naMesa
          : undefined,
  });
}

/** Quantos vértices a elipse vira, quando passa a laço. Redonda à vista, e poucas alças. */
const VERTICES_DA_ELIPSE = 16;

/**
 * A caixa com outro desenho: quadrado, círculo ou laço.
 *
 * Virar laço precisa de vértices, e eles saem do desenho que estava: os quatro
 * cantos do quadrado, ou a volta do círculo -- o mestre começa do que via, e
 * arrasta as alças dali. Sair do laço só esquece os vértices: a caixa fica.
 */
export function comFormato(
  caixa: CaixaDoElemento,
  formato: "retangulo" | "elipse" | "poligono",
): CaixaDoElemento {
  const resto = { ...caixa };
  delete resto.pontos;
  delete resto.diagonal;
  if (formato !== "poligono") return { ...resto, formato };
  if (caixa.formato === "poligono" && caixa.pontos) return caixa;

  return { ...resto, formato, pontos: verticesDe(caixa.formato) };
}

function verticesDe(formato: CaixaDoElemento["formato"]): number[] {
  if (formato !== "elipse") return [0, 0, 1, 0, 1, 1, 0, 1];

  const pontos: number[] = [];
  for (let i = 0; i < VERTICES_DA_ELIPSE; i++) {
    const angulo = (i / VERTICES_DA_ELIPSE) * Math.PI * 2;
    pontos.push(arredondar(0.5 + 0.5 * Math.cos(angulo)), arredondar(0.5 + 0.5 * Math.sin(angulo)));
  }
  return pontos;
}

/**
 * Os tipos sem `linha` -- a área escondida e a de efeito -- recebem a linha
 * como o quadrado dela: uma área de dois pixels não esconderia nem queimaria
 * nada, e a caixa da diagonal é o que o mestre desenhou.
 */
function semLinha(caixa: CaixaDoElemento): CaixaDoElemento {
  return caixa.formato === "linha" ? comFormato(caixa, "retangulo") : caixa;
}

/** A caixa como FORMA, com o traço que o painel escolheu para a próxima. */
export function comoForma(
  caixa: CaixaDoElemento,
  estilo: { cor?: string; espessura: number; fundo?: string },
): NewForma {
  return semAusentes({
    x: caixa.x,
    y: caixa.y,
    width: caixa.width,
    height: caixa.height,
    rotation: caixa.rotation ?? 0,
    tipo: caixa.formato,
    pontos: caixa.pontos,
    diagonal: caixa.diagonal,
    locked: caixa.locked,
    naMesa: caixa.naMesa,
    cor: estilo.cor,
    espessura: estilo.espessura,
    fundo: estilo.fundo,
  });
}

/** A caixa como PAREDE, com a altura, o teto e a cor da próxima. */
export function comoParede(
  caixa: CaixaDoElemento,
  nova: { metros: number; comTeto: boolean; cor?: string },
): NewParede {
  return semAusentes({
    x: caixa.x,
    y: caixa.y,
    width: caixa.width,
    height: caixa.height,
    rotation: caixa.rotation,
    formato: caixa.formato,
    pontos: caixa.pontos,
    diagonal: caixa.diagonal,
    locked: caixa.locked,
    ...camposDaParedeNova(nova, caixa.formato),
  });
}

/** A caixa como ÁREA ESCONDIDA. Nasce escondendo, como a desenhada. */
export function comoNevoa(caixa: CaixaDoElemento, dinamica: boolean): NewFogRegion {
  const area = semLinha(caixa);

  return semAusentes({
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height,
    rotation: area.rotation,
    formato: area.formato === "retangulo" ? undefined : (area.formato as FormatoDeArea),
    pontos: area.pontos,
    locked: area.locked,
    dinamica: dinamica ? (true as const) : undefined,
  });
}

/** A caixa como ÁREA DE EFEITO, com o efeito que o painel escolheu. */
export function comoAreaDeEfeito(caixa: CaixaDoElemento, efeito: string | null): NewAreaDeEfeito {
  const area = semLinha(caixa);

  return semAusentes({
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height,
    rotation: area.rotation,
    formato: area.formato === "retangulo" ? undefined : (area.formato as FormatoDeArea),
    pontos: area.pontos,
    locked: area.locked,
    naMesa: area.naMesa,
    efeito: efeito ?? undefined,
  });
}

function arredondar(valor: number): number {
  return Math.round(valor * 10000) / 10000;
}

/** Sem as chaves `undefined`: o arquivo da cena não ganha campo vazio. */
function semAusentes<T extends object>(objeto: T): T {
  return Object.fromEntries(
    Object.entries(objeto).filter(([, valor]) => valor !== undefined),
  ) as T;
}
