import type { EfeitoPedido } from "@/lib/condicao";
import type { DefinicaoDeEfeito } from "@/types/efeito";

/**
 * O catálogo de efeitos: o que cada id de `Condicao.efeito` desenha.
 *
 * Três fontes, no MESMO formato: a fábrica, que vem no aplicativo; os plugins,
 * que declaram efeitos no manifesto; e a campanha, que cria os seus. A fábrica
 * é escrita como um plugin escreveria -- se o formato não desse conta dela,
 * não daria conta de pack nenhum.
 *
 * Por ora só a fábrica existe. Id que o catálogo não conhece -- o efeito de um
 * plugin desligado, de uma versão futura -- desenha só o selo.
 */

/**
 * Os efeitos de fábrica. Só o que o aplicativo desenha sozinho, sem arquivo de
 * imagem: a arte fica para os packs.
 *
 * Os cinco primeiros são os climas de antes do catálogo, com os mesmos ids:
 * uma campanha gravada antes dele abre com os mesmos efeitos.
 */
export const EFEITOS_DE_FABRICA: ReadonlyArray<DefinicaoDeEfeito> = [
  {
    id: "aura",
    titulo: "Aura",
    dica: "Um halo na cor da condição, atrás da figura.",
    figura: { halo: true },
  },
  {
    id: "tingido",
    titulo: "Tingido",
    dica: "A figura ganha a cor da condição por cima.",
    // Metade: a figura continua sendo quem é, e a cor diz o que aconteceu com
    // ela. Cheia, o goblin envenenado virava um vulto verde.
    figura: { tinta: 0.5 },
  },
  {
    id: "translucido",
    titulo: "Translúcido",
    dica: "Meio transparente, tremulando.",
    figura: { translucido: true },
  },
  {
    id: "tremendo",
    titulo: "Tremendo",
    dica: "A figura treme no lugar.",
    figura: { tremor: true },
  },
  {
    id: "apagado",
    titulo: "Apagado",
    dica: "Cinza e escura.",
    figura: { cinza: true },
  },
];

const POR_ID = new Map(EFEITOS_DE_FABRICA.map((efeito) => [efeito.id, efeito]));

/** O efeito deste id, ou `undefined` se o catálogo não o conhece. */
export function definicaoDoEfeito(
  id: string | undefined,
): DefinicaoDeEfeito | undefined {
  return id ? POR_ID.get(id) : undefined;
}

/**
 * Um slug: minúsculas, dígitos e hífen, até 64. A regra de `id_valido`.
 */
const SLUG = /^[a-z0-9-]{1,64}$/;

/**
 * O id tem a forma de um efeito -- um slug, ou dois separados por `/`?
 *
 * Espelho de `efeito_valido`, no Rust. Serve a quem recebe efeito de fora do
 * Rust -- o kit de retratos, pelo `postMessage` de uma página de plugin.
 */
export function efeitoValido(id: unknown): id is string {
  if (typeof id !== "string") return false;

  const partes = id.split("/");
  return partes.length <= 2 && partes.every((parte) => SLUG.test(parte));
}

/**
 * O que a figura desenha, camada por camada, com a cor de quem pediu cada uma.
 *
 * Junta TODOS os pedidos, e a primeira que pede uma camada fica com ela. Hoje
 * chega um pedido só -- vale o último efeito, ver `efeitosDaFigura` --, e
 * juntar aqui é o que deixa voltar a compor sem mexer em quem desenha.
 *
 * Pedido de id que o catálogo não conhece não ocupa camada nenhuma.
 */
export type CamadasDaFigura = {
  /** A cor do halo. Ausente = sem halo. */
  halo?: string;
  tinta?: { cor: string; forca: number };
  cinza: boolean;
  translucido: boolean;
  tremor: boolean;
};

export function camadasDaFigura(
  efeitos: ReadonlyArray<EfeitoPedido> | undefined,
): CamadasDaFigura {
  const camadas: CamadasDaFigura = { cinza: false, translucido: false, tremor: false };

  for (const pedido of efeitos ?? []) {
    const figura = definicaoDoEfeito(pedido.efeito)?.figura;
    if (!figura) continue;

    if (figura.halo && !camadas.halo) camadas.halo = pedido.cor;
    if (typeof figura.tinta === "number" && !camadas.tinta) {
      camadas.tinta = { cor: pedido.cor, forca: figura.tinta };
    }
    camadas.cinza ||= Boolean(figura.cinza);
    camadas.translucido ||= Boolean(figura.translucido);
    camadas.tremor ||= Boolean(figura.tremor);
  }

  return camadas;
}
