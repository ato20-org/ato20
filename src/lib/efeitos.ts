import chamas from "../../public/efeitos/chamas/efeito.json";
import type { EfeitoPedido } from "@/lib/condicao";
import { normalizarHex } from "@/lib/cor";
import { urlDaImagemDoEstilo } from "@/lib/extensoes/medidor-em-camadas";
import {
  EFEITOS_DA_LUZ,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type EfeitoDaLuz,
} from "@/types/scene";
import type {
  AnimacaoDoEfeito,
  DefinicaoDeEfeito,
  ExternoDoEfeito,
  QuadrosDoEfeito,
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
 * Um pack de FÁBRICA: a pasta em `public/` com o `efeito.json` e as imagens --
 * o mesmo formato de um efeito de plugin, só que vem no aplicativo. A versão
 * do JSON vai na URL das imagens, para a TV não desenhar a arte velha.
 */
function daFabrica(
  json: Omit<DefinicaoDeEfeito, "origem"> & { versao: string },
  pasta: string,
): DefinicaoDeEfeito {
  const { versao, ...definicao } = json;

  return { ...definicao, origem: { app: pasta, versao } };
}

/**
 * Os efeitos de fábrica. Um só, por decisão: o fogo de "Em chamas" é o efeito
 * que o ATO20 traz, e é por ele que o formato -- quadros, mipmaps, mapa de
 * cores, máscara e profundidade -- se prova antes de crescer.
 *
 * Os climas de antes do catálogo (`aura`, `tingido`, ...) saíram: a condição
 * que ainda os aponta mostra só o selo, e o id continua gravado nela.
 */
export const EFEITOS_DE_FABRICA: ReadonlyArray<DefinicaoDeEfeito> = [
  daFabrica(chamas as Parameters<typeof daFabrica>[0], "efeitos/chamas"),
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

/**
 * O externo pronto para desenhar: os endereços já desta tela, nenhum número
 * fora do limite. O que precisa de forno -- o mapa de cores, a máscara, a
 * profundidade -- vai como pedido para `assarExterno`.
 */
export type ExternoResolvido = Required<
  Pick<ExternoDoEfeito, "tamanho" | "lado" | "ancora" | "opacidade">
> & {
  /** A `imagem`: o nível que vale quando não há mipmap. */
  url: string;
  /** Os mipmaps, do menor ao maior, pelo lado do QUADRO. Vazio = só `url`. */
  niveis: ReadonlyArray<{ lado: number; url: string }>;
  animacao?: Required<AnimacaoDoEfeito>;
  quadros?: QuadrosDoEfeito;
  /** A cor da rampa (`condicao`), ou o endereço da imagem da rampa. */
  cores?: { cor: string } | { rampa: string };
  mascara?: string;
  profundidade?: string;
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
      camadas.externo = resolverExterno(definicao, definicao.externo, pedido.cor);
    }
  }

  return camadas;
}

/**
 * O endereço de uma imagem do efeito para ESTA tela, ou `null`.
 *
 * Do plugin, o mesmo endereço das imagens do estilo de medidor: o protocolo
 * `ato20-ext` no Mestre, o daemon na TV e no celular. Da fábrica, a pasta do
 * próprio bundle, relativa -- o Mestre e a TV leem o mesmo `out/`. As duas
 * com a versão na URL. Efeito sem origem não tem de onde puxar arquivo.
 */
function urlDaImagem(definicao: DefinicaoDeEfeito, arquivo: string): string | null {
  const origem = definicao.origem;
  if (!origem) return null;

  if ("app" in origem) {
    const caminho = arquivo.split("/").map(encodeURIComponent).join("/");
    return `/${origem.app}/${caminho}?v=${encodeURIComponent(origem.versao)}`;
  }

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
  cor: string,
): ExternoResolvido | undefined {
  const url = urlDaImagem(definicao, externo.imagem);
  if (!url) return undefined;

  const imagem = (arquivo: string | undefined) =>
    arquivo ? (urlDaImagem(definicao, arquivo) ?? undefined) : undefined;
  const niveis = Object.entries(externo.mipmaps ?? {})
    .map(([lado, arquivo]) => ({ lado: Number(lado), url: imagem(arquivo) }))
    .filter(
      (nivel): nivel is { lado: number; url: string } =>
        Number.isFinite(nivel.lado) && nivel.lado > 0 && Boolean(nivel.url),
    )
    .sort((a, b) => a.lado - b.lado);
  const quadros = quadrosValidos(externo.quadros);
  const mascara = imagem(externo.mascara);
  const profundidade = imagem(externo.profundidade);
  const rampa = externo.cores && externo.cores !== "condicao" ? imagem(externo.cores) : undefined;

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
    niveis,
    ...(externo.animacao ? { animacao: resolverAnimacao(externo.animacao) } : {}),
    ...(quadros ? { quadros } : {}),
    ...(externo.cores === "condicao" ? { cores: { cor } } : rampa ? { cores: { rampa } } : {}),
    ...(mascara ? { mascara } : {}),
    ...(profundidade ? { profundidade } : {}),
  };
}

/**
 * A grade, se ela faz sentido: colunas e total inteiros, total múltiplo das
 * colunas, fps entre 1 e 60. Torta = imagem parada, inteira, e não um recorte
 * que mostra metade de um quadro.
 */
function quadrosValidos(quadros: QuadrosDoEfeito | undefined): QuadrosDoEfeito | undefined {
  if (!quadros) return undefined;

  const { colunas, total, fps } = quadros;
  const inteiro = (n: number) => Number.isInteger(n) && n > 0;
  if (!inteiro(colunas) || !inteiro(total) || total % colunas !== 0) return undefined;
  if (typeof fps !== "number" || !(fps >= 1 && fps <= 60)) return undefined;

  return { colunas, total, fps };
}

/**
 * O nível de mipmap para um quadro que aparece com `pixels` de lado na tela:
 * o menor que o cobre, ou o maior se nenhum cobre. Sem níveis, a `url`.
 */
export function nivelDoExterno(externo: ExternoResolvido, pixels: number): string {
  const { niveis } = externo;
  if (niveis.length === 0) return externo.url;

  return (niveis.find((nivel) => nivel.lado >= pixels) ?? niveis[niveis.length - 1]!).url;
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

/** A luz de um efeito pronta para entrar na cena: tudo preenchido e no limite. */
export type LuzResolvida = {
  /** Em vezes o lado maior da figura. Ver `LuzDoEfeito.raio`. */
  raio: number;
  cor: string;
  intensidade: number;
  efeito?: EfeitoDaLuz;
};

/**
 * A luz que os efeitos de uma figura pedem, ou `undefined`.
 *
 * A primeira que pede fica com ela, como as outras camadas. Separada de
 * `camadasDaFigura` porque quem a lê é a `LuzLayer`, a cada render do palco, e
 * ela não precisa de URL de imagem nenhuma -- e guardada pela lista de
 * pedidos, que é a mesma enquanto a condição não muda.
 */
export function luzDosEfeitos(
  efeitos: ReadonlyArray<EfeitoPedido> | undefined,
  deFora?: EfeitosDeFora,
): LuzResolvida | undefined {
  if (!efeitos?.length) return undefined;

  const guardada = luzesGuardadas.get(efeitos);
  if (guardada && guardada.deFora === deFora) return guardada.luz;

  let luz: LuzResolvida | undefined;
  for (const pedido of efeitos) {
    const pedida = definicaoDoEfeito(pedido.efeito, deFora)?.luz;
    if (!pedida || typeof pedida.raio !== "number" || !Number.isFinite(pedida.raio)) continue;

    const efeito = EFEITOS_DA_LUZ.find((cada) => cada === pedida.efeito);
    luz = {
      raio: Math.min(10, Math.max(0.5, pedida.raio)),
      cor: (pedida.cor && normalizarHex(pedida.cor)) || pedido.cor,
      intensidade: fracao(pedida.intensidade, 1),
      ...(efeito ? { efeito } : {}),
    };
    break;
  }

  luzesGuardadas.set(efeitos, { deFora, luz });
  return luz;
}

const luzesGuardadas = new WeakMap<
  ReadonlyArray<EfeitoPedido>,
  { deFora: EfeitosDeFora | undefined; luz: LuzResolvida | undefined }
>();
