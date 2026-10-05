import { efeitoValido } from "@/lib/efeitos";
import type { CamadasDoMedidor, RotuloDoMedidor } from "@/lib/extensoes/manifesto";
import type { NoSvg } from "@/lib/extensoes/svg-modelo";
import type { DefinicaoDeEfeito } from "@/types/efeito";

/**
 * O que os plugins DECLARAM para a mesa desenhar: os estilos de medidor, os
 * efeitos de condição, e quais plugins estão ligados.
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
  titulo: string;
  /** A altura da forma, em fração da largura do medidor. */
  altura: number;
  /** Ausente é `acima`. Ver `RotuloDoMedidor`. */
  rotulo?: RotuloDoMedidor;
} & (
  | { tipo: "svg"; modelo: NoSvg }
  | {
      /**
       * As camadas viajam como o JSON que o plugin escreveu, e as imagens não:
       * cada tela as busca pelo endereço dela -- o protocolo `ato20-ext` no
       * Mestre, `/plugin/{id}/...` no daemon para a TV e o celular. Ver
       * `urlDaImagemDoEstilo`.
       */
      tipo: "camadas";
      plugin: string;
      /** A versão do plugin, que vai na URL para a TV não desenhar a moldura velha. */
      versao: string;
      camadas: CamadasDoMedidor;
    }
);

export type Declarativo = {
  versao: number;
  /** Por `{extensaoId}/{estiloId}`, a chave que o medidor guarda. */
  estilos: Record<string, EstiloDeMedidorPublicado>;
  /**
   * Por `{extensaoId}/{efeitoId}`, o id que a condição guarda. O `id` de cada
   * um já vem com o prefixo. Ver `definicaoDoEfeito`.
   */
  efeitos: Record<string, DefinicaoDeEfeito>;
  /**
   * Os ids dos plugins habilitados no Mestre.
   *
   * O guardado de um plugin no personagem fica no arquivo quando ele é
   * desligado ou desinstalado, para voltar se ele voltar. O celular só sabe
   * que um plugin saiu por aqui: sem a lista, a seção dele seguia na ficha do
   * jogador, com um botão que manda ação para ninguém.
   */
  plugins: string[];
};

export const DECLARATIVO_VAZIO: Declarativo = {
  versao: 0,
  estilos: {},
  efeitos: {},
  plugins: [],
};

/** Busca o declarativo atual, do lado de quem assiste. */
export async function buscarDeclarativo(codigo: string, base = ""): Promise<Declarativo> {
  const response = await fetch(`${base}/sala/declarativo?codigo=${encodeURIComponent(codigo)}`);
  if (!response.ok) return DECLARATIVO_VAZIO;

  const lido = (await response.json()) as Partial<Declarativo> | null;

  return {
    versao: typeof lido?.versao === "number" ? lido.versao : 0,
    estilos: lido?.estilos ?? {},
    efeitos: lerEfeitos(lido?.efeitos),
    plugins: Array.isArray(lido?.plugins)
      ? lido.plugins.filter((id): id is string => typeof id === "string")
      : [],
  };
}

/**
 * Os efeitos que chegaram pela rede, só os que têm casca de efeito.
 *
 * Quem publicou foi o Mestre, com o JSON que o Rust validou. A casca é
 * conferida mesmo assim, pela razão do kit: um efeito torto não pode derrubar
 * a TV -- cai no selo, como o efeito que ela não conhece.
 */
function lerEfeitos(cru: unknown): Record<string, DefinicaoDeEfeito> {
  if (!cru || typeof cru !== "object") return {};

  const efeitos: Record<string, DefinicaoDeEfeito> = {};
  for (const [id, efeito] of Object.entries(cru)) {
    if (!efeitoValido(id) || !efeito || typeof efeito !== "object") continue;
    if (typeof (efeito as DefinicaoDeEfeito).titulo !== "string") continue;

    efeitos[id] = { ...(efeito as DefinicaoDeEfeito), id };
  }

  return efeitos;
}
