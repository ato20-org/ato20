import type { EfeitoPedido } from "@/lib/condicao";
import { PACKS_DE_FABRICA } from "@/efeitos";
import { normalizarHex } from "@/lib/cor";
import { idioma } from "@/lib/i18n/idioma";
import { t as textosDeFabrica } from "@/lib/i18n/efeitos";
import { urlDaImagemDoEstilo } from "@/lib/extensoes/medidor-em-camadas";
import { daemonAddrSeConhecido, isDesktop } from "@/lib/vault/bridge";
import type { ParticulasResolvidas } from "@/lib/particulas";
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
 * Um slug: minúsculas, dígitos e hífen, até 64. A regra de `id_valido`.
 */
const SLUG = /^[a-z0-9-]{1,64}$/;

/**
 * Os efeitos de fábrica, em ordem de título: os packs de `src/efeitos/`,
 * descobertos (ver `PACKS_DE_FABRICA`). "Em chamas" é o que o ATO20 traz, e é
 * por ele que o formato -- quadros, mipmaps, mapa de cores, máscara,
 * profundidade e partículas -- se provou.
 *
 * Pack de id torto ou repetido fica de fora: o id vira chave no disco e na
 * rede (ver `efeito_valido`), e dois iguais disputariam a mesma condição.
 *
 * Os climas de antes do catálogo (`aura`, `tingido`, ...) saíram: a condição
 * que ainda os aponta mostra só o selo, e o id continua gravado nela.
 */
export const EFEITOS_DE_FABRICA: ReadonlyArray<DefinicaoDeEfeito> = (() => {
  const vistos = new Set<string>();

  return PACKS_DE_FABRICA.map(
    ({ pasta, definicao, arquivos }): DefinicaoDeEfeito => ({
      ...definicao,
      ...textoDeFabrica(definicao.id),
      origem: { app: pasta, arquivos },
    }),
  )
    .filter((efeito) => {
      if (!efeitoValido(efeito.id) || efeito.id.includes("/") || vistos.has(efeito.id)) {
        return false;
      }
      vistos.add(efeito.id);
      return true;
    })
    .sort((a, b) => a.titulo.localeCompare(b.titulo, idioma));
})();

const POR_ID = new Map(EFEITOS_DE_FABRICA.map((efeito) => [efeito.id, efeito]));

/**
 * O título e a dica de um efeito de fábrica no idioma da tela.
 *
 * O `efeito.json` é JSON, e JSON não importa dicionário: o texto dele fica como
 * está, e vale de reserva para o pack cujo id o dicionário não conhece -- o que
 * acabou de ganhar pasta e ainda não ganhou tradução.
 */
function textoDeFabrica(id: string): { titulo: string; dica: string } | undefined {
  const textos: Readonly<Record<string, { titulo: string; dica: string }>> =
    textosDeFabrica;

  return Object.hasOwn(textos, id) ? textos[id] : undefined;
}

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
 * `ato20-ext` no Mestre, o daemon na TV e no celular, com a versão na URL. Da
 * fábrica, o asset do build que o pack trouxe -- o Mestre e a TV leem o mesmo
 * `out/`. Efeito sem origem, ou arquivo que o pack não tem, não desenha.
 */
function urlDaImagem(definicao: DefinicaoDeEfeito, arquivo: string): string | null {
  const origem = definicao.origem;
  if (!origem) return null;

  if ("app" in origem) return origem.arquivos[arquivo] ?? null;
  if ("acervo" in origem) return urlDaImagemDaCampanha(arquivo);

  return urlDaImagemDoEstilo(origem.plugin, arquivo, origem.versao);
}

/**
 * O endereço de uma imagem de efeito da CAMPANHA para esta tela.
 *
 * Três formas, porque o efeito da campanha pode ter nascido de outro:
 *
 * - o id de um arquivo do acervo -- relativo na TV e no celular, que o daemon
 *   serve; no Mestre, o do daemon, que é outra origem;
 * - `fabrica:{pasta}/{arquivo}` -- a arte de um pack de fábrica, quando a
 *   condição configurou o fogo de "Em chamas" e a cópia ficou com a arte dele;
 * - `plugin:{id}@{versao}/{caminho}` -- a arte de um plugin, pelo mesmo motivo.
 *
 * O que não é nenhuma das três não vira caminho nenhum.
 */
export function urlDaImagemDaCampanha(referencia: string): string | null {
  if (referencia.startsWith("fabrica:")) {
    const [pasta, ...resto] = referencia.slice("fabrica:".length).split("/");
    const pack = PACKS_DE_FABRICA.find((cada) => cada.pasta === pasta);
    return pack?.arquivos[resto.join("/")] ?? null;
  }

  if (referencia.startsWith("plugin:")) {
    const corpo = referencia.slice("plugin:".length);
    const barra = corpo.indexOf("/");
    const [plugin, versao = ""] = corpo.slice(0, barra).split("@");
    if (barra < 0 || !plugin || !efeitoValido(plugin)) return null;
    return urlDaImagemDoEstilo(plugin, corpo.slice(barra + 1), versao);
  }

  if (!/^[A-Za-z0-9-]{1,64}$/.test(referencia)) return null;
  if (!isDesktop()) return `/asset/${referencia}`;

  const daemon = daemonAddrSeConhecido();
  return daemon ? `${daemon.url}/asset/${referencia}` : null;
}

/**
 * Uma cópia do efeito para a CAMPANHA, com outro id e outro nome: o que a
 * condição configura quando ainda usava o fogo de fábrica ou o de um plugin. A
 * arte não é copiada -- cada imagem passa a apontar para onde já estava (ver
 * `urlDaImagemDaCampanha`), e a origem vira a do acervo.
 */
export function copiaParaACampanha(
  definicao: DefinicaoDeEfeito,
  id: string,
  titulo: string,
): DefinicaoDeEfeito {
  const origem = definicao.origem;
  const referencia = (arquivo: string | undefined): string | undefined => {
    if (!arquivo || !origem) return arquivo;
    if ("app" in origem) return `fabrica:${origem.app}/${arquivo}`;
    if ("plugin" in origem) return `plugin:${origem.plugin}@${origem.versao}/${arquivo}`;
    return arquivo;
  };

  const copia: DefinicaoDeEfeito = JSON.parse(JSON.stringify(definicao));
  delete copia.origem;
  copia.id = id;
  copia.titulo = titulo;

  if (copia.externo) {
    const externo = copia.externo;
    externo.imagem = referencia(externo.imagem) ?? "";
    if (externo.mascara) externo.mascara = referencia(externo.mascara);
    if (externo.profundidade) externo.profundidade = referencia(externo.profundidade);
    if (externo.cores && externo.cores !== "condicao") externo.cores = referencia(externo.cores);
    if (externo.mipmaps) {
      externo.mipmaps = Object.fromEntries(
        Object.entries(externo.mipmaps).map(([lado, arquivo]) => [lado, referencia(arquivo) ?? arquivo]),
      );
    }
  }
  const imagens = (campos: { imagem: string; cores?: string; mipmaps?: Record<string, string> }) => {
    campos.imagem = referencia(campos.imagem) ?? "";
    if (campos.cores && campos.cores !== "condicao") campos.cores = referencia(campos.cores);
    if (campos.mipmaps) {
      campos.mipmaps = Object.fromEntries(
        Object.entries(campos.mipmaps).map(([lado, arquivo]) => [lado, referencia(arquivo) ?? arquivo]),
      );
    }
  };
  if (copia.area?.foco) imagens(copia.area.foco);
  if (copia.base) imagens(copia.base);
  if (copia.interno) copia.interno.textura = referencia(copia.interno.textura) ?? "";
  if (copia.particulas?.imagem) copia.particulas.imagem = referencia(copia.particulas.imagem);

  return copia;
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
  const niveis = niveisDe(definicao, externo.mipmaps);
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

/** Os mipmaps com endereço, do menor ao maior. Os tortos ficam de fora. */
function niveisDe(
  definicao: DefinicaoDeEfeito,
  mipmaps: Record<string, string> | undefined,
): Array<{ lado: number; url: string }> {
  return Object.entries(mipmaps ?? {})
    .map(([lado, arquivo]) => ({ lado: Number(lado), url: urlDaImagem(definicao, arquivo) }))
    .filter(
      (nivel): nivel is { lado: number; url: string } =>
        Number.isFinite(nivel.lado) && nivel.lado > 0 && Boolean(nivel.url),
    )
    .sort((a, b) => a.lado - b.lado);
}

/** Uma imagem animada pronta para desenhar: a do foco da área, a da base. */
export type ImagemResolvida = {
  url: string;
  /** Os mipmaps, do menor ao maior, pelo lado do QUADRO. Vazio = só `url`. */
  niveis: ReadonlyArray<{ lado: number; url: string }>;
  quadros?: QuadrosDoEfeito;
  cores?: { cor: string } | { rampa: string };
};

/** Os campos de imagem que o foco e a base dividem, resolvidos para esta tela. */
function resolverImagem(
  definicao: DefinicaoDeEfeito,
  campos: { imagem: string; quadros?: QuadrosDoEfeito; mipmaps?: Record<string, string>; cores?: string },
  cor: string,
): ImagemResolvida | undefined {
  const url = urlDaImagem(definicao, campos.imagem);
  if (!url) return undefined;

  const quadros = quadrosValidos(campos.quadros);
  const rampa =
    campos.cores && campos.cores !== "condicao"
      ? (urlDaImagem(definicao, campos.cores) ?? undefined)
      : undefined;

  return {
    url,
    niveis: niveisDe(definicao, campos.mipmaps),
    ...(quadros ? { quadros } : {}),
    ...(campos.cores === "condicao" ? { cores: { cor } } : rampa ? { cores: { rampa } } : {}),
  };
}

/**
 * O foco da área do efeito do pedido, com a cor dele. Ausente sem `area.foco`
 * -- a área cai no `externo`. Ver `AreaDoEfeito.foco`.
 */
export function focoDaArea(
  pedido: EfeitoPedido,
  deFora?: EfeitosDeFora,
): ImagemResolvida | undefined {
  const definicao = definicaoDoEfeito(pedido.efeito, deFora);
  const foco = definicao?.area?.foco;
  return definicao && foco ? resolverImagem(definicao, foco, pedido.cor) : undefined;
}

/** A base pronta para desenhar: endereços desta tela, nada fora do limite. */
export type BaseResolvida = ImagemResolvida & {
  opacidade: number;
  /** O ladrilho, em vezes a casa da grade. */
  escala: number;
  /** O chão embaixo, de 0 a 1. Ver `BaseDoEfeito.escurece`. */
  escurece: number;
};

/**
 * A base do efeito do pedido, com a cor dele. Ausente sem base, ou com a
 * imagem que o pack não tem. Ver `BaseDoEfeito`.
 */
export function baseDoEfeito(
  pedido: EfeitoPedido,
  deFora?: EfeitosDeFora,
): BaseResolvida | undefined {
  const definicao = definicaoDoEfeito(pedido.efeito, deFora);
  const base = definicao?.base;
  if (!definicao || !base) return undefined;

  const imagem = resolverImagem(definicao, base, pedido.cor);
  if (!imagem) return undefined;

  const escala =
    typeof base.escala === "number" && Number.isFinite(base.escala)
      ? Math.min(4, Math.max(0.5, base.escala))
      : 1;

  return {
    ...imagem,
    opacidade: fracao(base.opacidade, 1),
    escurece: fracao(base.escurece, 0),
    escala,
  };
}

/** O nível de um mipmap para um quadro de `pixels` de lado. Ver `nivelDoExterno`. */
export function nivelDaImagem(imagem: ImagemResolvida, pixels: number): string {
  if (imagem.niveis.length === 0) return imagem.url;
  return (imagem.niveis.find((nivel) => nivel.lado >= pixels) ?? imagem.niveis[imagem.niveis.length - 1]!).url;
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

/**
 * As partículas que os efeitos de uma figura pedem, ou `undefined`.
 *
 * A primeira que pede fica com elas, como a luz. Guardadas pela lista de
 * pedidos, pela razão da luz: quem pergunta é o palco, a cada render.
 */
export function particulasDosEfeitos(
  efeitos: ReadonlyArray<EfeitoPedido> | undefined,
  deFora?: EfeitosDeFora,
): ParticulasResolvidas | undefined {
  if (!efeitos?.length) return undefined;

  const guardadas = particulasGuardadas.get(efeitos);
  if (guardadas && guardadas.deFora === deFora) return guardadas.particulas;

  let particulas: ParticulasResolvidas | undefined;
  for (const pedido of efeitos) {
    const definicao = definicaoDoEfeito(pedido.efeito, deFora);
    const pedidas = definicao?.particulas;
    if (!definicao || !pedidas) continue;

    const quantidade = Math.round(Number(pedidas.quantidade));
    if (!Number.isFinite(quantidade) || quantidade < 1) continue;

    const numero = (valor: number | undefined, padrao: number, min: number, max: number) =>
      typeof valor === "number" && Number.isFinite(valor)
        ? Math.min(max, Math.max(min, valor))
        : padrao;
    const imagem = pedidas.imagem ? urlDaImagem(definicao, pedidas.imagem) : null;
    const emissor = pedidas.emissor ?? {};

    particulas = {
      quantidade: Math.min(24, quantidade),
      ...(imagem ? { imagem } : {}),
      pintar: Boolean(pedidas.pintar),
      cor: (pedidas.cor && normalizarHex(pedidas.cor)) || pedido.cor,
      giro: numero(pedidas.giro, 0, -1440, 1440),
      ...(imagem && quadrosDaParticula(pedidas.quadros)
        ? { quadros: quadrosDaParticula(pedidas.quadros)! }
        : {}),
      tamanho: numero(pedidas.tamanho, 0.06, 0.01, 0.5),
      variacao: fracao(pedidas.variacao, 0.5),
      direcao: numero(pedidas.direcao, 270, -360, 720),
      abertura: numero(pedidas.abertura, 40, 0, 360),
      velocidade: numero(pedidas.velocidade, 1, 0, 10),
      vida: numero(pedidas.vida, 1.5, 0.3, 6),
      emissor: {
        largura: numero(emissor.largura, 0.8, 0, 2),
        altura: numero(emissor.altura, 0.3, 0, 2),
        ancora: emissor.ancora === "centro" || emissor.ancora === "topo" ? emissor.ancora : "base",
      },
    };
    break;
  }

  particulasGuardadas.set(efeitos, { deFora, particulas });
  return particulas;
}

const particulasGuardadas = new WeakMap<
  ReadonlyArray<EfeitoPedido>,
  { deFora: EfeitosDeFora | undefined; particulas: ParticulasResolvidas | undefined }
>();

/**
 * O sprite da partícula, se a grade faz sentido -- a regra da do externo,
 * com o `fps` opcional: sem ele, o sprite toca uma vez na vida.
 */
function quadrosDaParticula(
  quadros: { colunas: number; total: number; fps?: number } | undefined,
): { colunas: number; total: number; fps?: number } | undefined {
  if (!quadros) return undefined;
  if (quadros.fps === undefined) {
    const grade = quadrosValidos({ ...quadros, fps: 1 });
    return grade ? { colunas: grade.colunas, total: grade.total } : undefined;
  }

  return quadrosValidos({ ...quadros, fps: quadros.fps });
}
