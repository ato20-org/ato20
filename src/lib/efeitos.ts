import type { EfeitoPedido } from "@/lib/condicao";
import { urlDaImagemDoEstilo } from "@/lib/extensoes/medidor-em-camadas";
import { SCENE_HEIGHT, SCENE_WIDTH } from "@/types/scene";
import type {
  AnimacaoDoEfeito,
  DefinicaoDeEfeito,
  ExternoDoEfeito,
} from "@/types/efeito";

/**
 * O catálogo de efeitos: o que cada id de `Condicao.efeito` desenha.
 *
 * Três fontes, no MESMO formato: a fábrica, que vem no aplicativo; os plugins,
 * que declaram efeitos no manifesto; e a campanha, que cria os seus. A fábrica
 * é escrita como um plugin escreveria -- se o formato não desse conta dela,
 * não daria conta de pack nenhum.
 *
 * A fábrica mora aqui; os de plugin chegam pelo declarativo, que é o mesmo
 * caminho na TV e no Mestre (`Declarativo.efeitos`). Id que o catálogo não
 * conhece -- o efeito de um plugin desligado, de uma versão futura -- desenha
 * só o selo.
 */

/** Os efeitos que não são de fábrica, pelo id completo. Ver `Declarativo.efeitos`. */
export type EfeitosDeFora = Readonly<Record<string, DefinicaoDeEfeito>>;

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

/**
 * O efeito deste id, ou `undefined` se o catálogo não o conhece.
 *
 * Fábrica primeiro, e é seguro: id de fábrica não tem barra, e id de fora tem
 * sempre -- um nunca toma o lugar do outro.
 */
export function definicaoDoEfeito(
  id: string | undefined,
  deFora?: EfeitosDeFora,
): DefinicaoDeEfeito | undefined {
  if (!id) return undefined;

  return POR_ID.get(id) ?? (deFora && Object.hasOwn(deFora, id) ? deFora[id] : undefined);
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
  /** A textura de dentro, já com o endereço de quem desenha. */
  textura?: { url: string; forca: number };
  /** A imagem de fora, já com o endereço e os padrões preenchidos. */
  externo?: ExternoResolvido;
  cinza: boolean;
  translucido: boolean;
  tremor: boolean;
};

/** O externo pronto para desenhar: nenhum campo ausente, nenhum fora do limite. */
export type ExternoResolvido = Required<Omit<ExternoDoEfeito, "imagem" | "animacao">> & {
  url: string;
  animacao?: Required<AnimacaoDoEfeito>;
};

export function camadasDaFigura(
  efeitos: ReadonlyArray<EfeitoPedido> | undefined,
  deFora?: EfeitosDeFora,
): CamadasDaFigura {
  const camadas: CamadasDaFigura = { cinza: false, translucido: false, tremor: false };

  for (const pedido of efeitos ?? []) {
    const figura = definicaoDoEfeito(pedido.efeito, deFora)?.figura;
    if (!figura) continue;

    if (figura.halo && !camadas.halo) camadas.halo = pedido.cor;
    if (typeof figura.tinta === "number" && !camadas.tinta) {
      camadas.tinta = { cor: pedido.cor, forca: figura.tinta };
    }
    camadas.cinza ||= Boolean(figura.cinza);
    camadas.translucido ||= Boolean(figura.translucido);
    camadas.tremor ||= Boolean(figura.tremor);
  }

  for (const pedido of efeitos ?? []) {
    const definicao = definicaoDoEfeito(pedido.efeito, deFora);
    if (!definicao) continue;

    if (definicao.interno && !camadas.textura) {
      const url = urlDaImagem(definicao, definicao.interno.textura);
      if (url) camadas.textura = { url, forca: fracao(definicao.interno.forca, 1) };
    }
    if (definicao.externo && !camadas.externo) {
      camadas.externo = resolverExterno(definicao, definicao.externo);
    }
  }

  return camadas;
}

/**
 * O endereço de uma imagem do efeito para ESTA tela, ou `null`.
 *
 * O mesmo endereço das imagens do estilo de medidor: o protocolo `ato20-ext`
 * no Mestre, o daemon na TV e no celular, com a versão do plugin na URL.
 * Efeito sem origem -- o de fábrica -- não tem de onde puxar arquivo.
 */
function urlDaImagem(definicao: DefinicaoDeEfeito, arquivo: string): string | null {
  const origem = definicao.origem;
  if (!origem) return null;

  return urlDaImagemDoEstilo(origem.plugin, arquivo, origem.versao);
}

/** O tamanho do externo quando o efeito não disse. Um halo largo, não um segundo token. */
export const TAMANHO_DO_EXTERNO = 1.5;

/** Os limites do tamanho. Espelho de `TAMANHO_DO_EXTERNO_MIN/MAX`, no Rust. */
const TAMANHO_MIN = 0.25;
const TAMANHO_MAX = 2;

function resolverExterno(
  definicao: DefinicaoDeEfeito,
  externo: ExternoDoEfeito,
): ExternoResolvido | undefined {
  const url = urlDaImagem(definicao, externo.imagem);
  if (!url) return undefined;

  const tamanho =
    typeof externo.tamanho === "number" && Number.isFinite(externo.tamanho)
      ? Math.min(TAMANHO_MAX, Math.max(TAMANHO_MIN, externo.tamanho))
      : TAMANHO_DO_EXTERNO;

  return {
    url,
    tamanho,
    lado: externo.lado === "frente" ? "frente" : "atras",
    ancora: externo.ancora === "base" || externo.ancora === "topo" ? externo.ancora : "centro",
    opacidade: fracao(externo.opacidade, 1),
    ...(externo.animacao ? { animacao: resolverAnimacao(externo.animacao) } : {}),
  };
}

function resolverAnimacao(animacao: AnimacaoDoEfeito): Required<AnimacaoDoEfeito> {
  const periodo =
    typeof animacao.periodo === "number" && Number.isFinite(animacao.periodo)
      ? Math.min(30, Math.max(0.2, animacao.periodo))
      : 2;

  return { tipo: animacao.tipo, periodo, intensidade: fracao(animacao.intensidade, 0.5) };
}

/** Um número entre 0 e 1, ou o padrão se ele não veio ou veio torto. */
function fracao(valor: number | undefined, padrao: number): number {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return padrao;

  return Math.min(1, Math.max(0, valor));
}

/** A caixa de um item no plano: o que `translate(x, y) rotate(θ)` posiciona. */
export type CaixaNoPlano = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

/**
 * O maior tamanho do externo, até o pedido, que não sai do plano.
 *
 * É a regra do palco: o que passa da caixa de um plano infla a camada composta
 * do WebKitGTK -- e o fogo de um token encostado na borda do mapa seria isso.
 * Encolher, e não recortar: um recorte exigiria um envelope do tamanho do
 * plano em cada token, e o que se perde é o fogo ficar menor só ali.
 *
 * A conta é exata, e por isso barata: cada canto do externo é linear no
 * tamanho, já girado com o item, então cada borda do plano dá um teto. O
 * menor deles vence. Item que já está fora do plano não ganha externo maior
 * que ele mesmo: 1, a caixa da própria figura.
 */
export function tamanhoNoPlano(
  caixa: CaixaNoPlano,
  pedido: number,
  ancora: ExternoResolvido["ancora"],
): number {
  if (pedido <= 1) return pedido;

  const { width: w, height: h } = caixa;
  const angulo = (caixa.rotation * Math.PI) / 180;
  const cos = Math.cos(angulo);
  const sin = Math.sin(angulo);
  const cx = caixa.x + w / 2;
  const cy = caixa.y + h / 2;

  // Cada canto como `a + t * b`, no referencial do item, com o centro nele.
  // O `y` depende da âncora; o `x` cresce sempre para os dois lados.
  const ys: Array<[number, number]> =
    ancora === "base"
      ? [
          [h / 2, 0],
          [h / 2, -h],
        ]
      : ancora === "topo"
        ? [
            [-h / 2, 0],
            [-h / 2, h],
          ]
        : [
            [0, -h / 2],
            [0, h / 2],
          ];
  const xs: Array<[number, number]> = [
    [0, -w / 2],
    [0, w / 2],
  ];

  let teto = pedido;
  for (const [ax, bx] of xs) {
    for (const [ay, by] of ys) {
      // O `rotate` do CSS, com o y para baixo.
      const a = { x: cx + ax * cos - ay * sin, y: cy + ax * sin + ay * cos };
      const b = { x: bx * cos - by * sin, y: bx * sin + by * cos };

      for (const [inicio, passo, limite] of [
        [a.x, b.x, SCENE_WIDTH],
        [a.y, b.y, SCENE_HEIGHT],
      ] as const) {
        if (passo > 0) teto = Math.min(teto, (limite - inicio) / passo);
        if (passo < 0) teto = Math.min(teto, -inicio / passo);
      }
    }
  }

  return Math.max(1, teto);
}
