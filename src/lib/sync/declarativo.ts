import type { NoSvg } from "@/lib/extensoes/svg-modelo";

/**
 * O que os plugins DECLARAM para a mesa desenhar: hoje, os estilos de medidor.
 *
 * Viaja por um canal próprio (`/sala/declarativo`), e não dentro do quadro de
 * 10 Hz: o quadro leva só `declarativoVersao`, um número, e quem assiste busca
 * este objeto quando o número muda. Um modelo de SVG dentro do quadro seria
 * serializado dez vezes por segundo para cada aparelho da mesa, por um dado
 * que muda quando o mestre instala um plugin -- uma vez por semana.
 *
 * Sem código: é árvore filtrada (ver `svg-modelo.ts`), e a TV a desenha com o
 * React. Nada do plugin roda fora do Mestre.
 */
export type EstiloDeMedidorPublicado = {
  /** A altura da forma, em fração da largura do medidor. */
  altura: number;
  modelo: NoSvg;
};

export type Declarativo = {
  versao: number;
  /** Por `{extensaoId}/{estiloId}`, a chave que o medidor guarda. */
  estilos: Record<string, EstiloDeMedidorPublicado>;
};

export const DECLARATIVO_VAZIO: Declarativo = { versao: 0, estilos: {} };

/** Busca o declarativo atual, do lado de quem assiste. */
export async function buscarDeclarativo(codigo: string, base = ""): Promise<Declarativo> {
  const response = await fetch(`${base}/sala/declarativo?codigo=${encodeURIComponent(codigo)}`);
  if (!response.ok) return DECLARATIVO_VAZIO;

  const lido = (await response.json()) as Partial<Declarativo> | null;

  return {
    versao: typeof lido?.versao === "number" ? lido.versao : 0,
    estilos: lido?.estilos ?? {},
  };
}
