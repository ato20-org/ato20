import type { EfeitoPedido } from "@/lib/condicao";
import { caixaDaComposicao } from "@/lib/geometry/portrait";
import { EFEITOS_NA_FIGURA, type EfeitoNaFigura } from "@/types/character";
import { rotulosDoDado, TIPOS_DADO, type FacesDado, type RolagemDaMesa } from "@/types/dado";
import { SCENE_HEIGHT, SCENE_WIDTH, type Portrait } from "@/types/scene";

/**
 * O kit de retratos: uma página do bundle (`/kit/retratos`) que desenha
 * retratos de personagem sobre fundo transparente, para a página de um PLUGIN
 * embutir num `<iframe>`.
 *
 * O irmão do kit de dados, e pelo mesmo motivo: o retrato da mesa -- a imagem
 * ou a página viva, as barras com o estilo de fábrica e os de plugin, os
 * selos, a aura da condição, os dados caindo embaixo -- é código do
 * aplicativo, e o plugin não deveria copiá-lo. O kit desenha com o MESMO
 * `PortraitLayer` da janela do espectador; o que aparece, e onde, é da página.
 *
 * O protocolo, todo com `ato20: "retratos"`:
 *
 * - página → kit: `{ mostrar: [retrato...] }` (a lista inteira, é estado) e
 *   `{ rolagens: [rolagem...] }` (os dados que caem embaixo de cada retrato)
 * - kit → página: `{ pronto: true }`, quando já escuta.
 *
 * O retrato é o que `api.retratos` entrega no Mestre, passado adiante sem
 * mexer: o plugin não precisa conhecer o formato. Ver `docs/extensoes.md`.
 */

/** Um retrato para o kit: o da mesa, com os efeitos de condição junto. */
export type RetratoParaKit = Portrait & { efeitos?: EfeitoPedido[] };

export type PedidoDeRetratos =
  | { tipo: "mostrar"; retratos: RetratoParaKit[] }
  | { tipo: "rolagens"; rolagens: RolagemDaMesa[] };

const FACES = new Set<number>(TIPOS_DADO.map((tipo) => tipo.faces));

/** Mais que isso não é mesa, é mural. */
const RETRATOS_MAX = 24;
const ROLAGENS_MAX = 60;

function texto(valor: unknown, maximo: number): valor is string {
  return typeof valor === "string" && valor.length <= maximo;
}

function fracao(valor: unknown): valor is number {
  // Um pouco além de 0..1: o retrato pode encostar na borda e passar dela.
  return typeof valor === "number" && Number.isFinite(valor) && valor > -2 && valor < 3;
}

function lerEfeitos(cru: unknown): EfeitoPedido[] {
  if (!Array.isArray(cru)) return [];

  return cru.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { efeito, cor } = item as Record<string, unknown>;
    if (!EFEITOS_NA_FIGURA.includes(efeito as EfeitoNaFigura)) return [];
    // A cor vai para um estilo: só a forma de cor que o aplicativo grava.
    if (typeof cor !== "string" || !/^#[0-9a-f]{3,8}$/i.test(cor)) return [];

    return [{ efeito: efeito as EfeitoNaFigura, cor }];
  });
}

/**
 * Um retrato que chegou pelo `postMessage`, ou `null`.
 *
 * Confere a CASCA -- ids, geometria, as listas serem listas -- e confia no
 * miolo, que é o que `api.retratos` montou no Mestre. Um miolo torto não
 * derruba o kit: quem desenha está dentro de uma barreira de erro, e o pedido
 * seguinte recomeça. Ver `KitDeRetratos`.
 */
function lerRetrato(cru: unknown): RetratoParaKit | null {
  if (!cru || typeof cru !== "object") return null;
  const r = cru as Record<string, unknown>;

  if (!texto(r.id, 128) || !r.id || !texto(r.personagemId, 128) || !r.personagemId) return null;
  if (!texto(r.assetId, 128)) return null;
  if (!fracao(r.x) || !fracao(r.y) || !fracao(r.width) || !fracao(r.height)) return null;
  if (r.width <= 0 || r.height <= 0) return null;
  if (r.medidores !== undefined && !Array.isArray(r.medidores)) return null;
  if (r.condicoes !== undefined && !Array.isArray(r.condicoes)) return null;
  if (r.layout !== undefined && (typeof r.layout !== "object" || r.layout === null)) return null;
  // A página viva abre dentro do kit: só `https`, como a fonte de retrato exige.
  if (r.url !== undefined && (!texto(r.url, 2048) || !r.url.startsWith("https://"))) return null;

  return {
    ...(r as unknown as Portrait),
    nome: texto(r.nome, 120) ? r.nome : undefined,
    // Na mesa só se desenha o que está no ar; aqui, tudo o que a página pediu.
    visible: true,
    efeitos: lerEfeitos(r.efeitos),
  };
}

function lerRolagem(cru: unknown): RolagemDaMesa | null {
  if (!cru || typeof cru !== "object") return null;
  const r = cru as Record<string, unknown>;

  if (!texto(r.id, 128) || !r.id) return null;
  if (typeof r.faces !== "number" || !FACES.has(r.faces)) return null;
  if (typeof r.valor !== "number" || !rotulosDoDado(r.faces as FacesDado).includes(r.valor)) return null;
  // Sem personagem a rolagem não tem retrato onde pousar -- é o que a janela
  // do espectador faz com ela também.
  if (!texto(r.personagemId, 128) || !r.personagemId) return null;

  return {
    id: r.id,
    faces: r.faces as FacesDado,
    valor: r.valor,
    quando: typeof r.quando === "number" ? r.quando : 0,
    jogadorId: texto(r.jogadorId, 128) ? r.jogadorId : "",
    jogador: texto(r.jogador, 120) ? r.jogador : "",
    personagemId: r.personagemId,
  };
}

/** Lê o que chegou pelo `postMessage`. `null` para o que não é do kit. */
export function lerPedidoDeRetratos(dados: unknown): PedidoDeRetratos | null {
  if (!dados || typeof dados !== "object") return null;
  const pedido = dados as Record<string, unknown>;
  if (pedido.ato20 !== "retratos") return null;

  if (Array.isArray(pedido.mostrar)) {
    return {
      tipo: "mostrar",
      retratos: pedido.mostrar
        .slice(0, RETRATOS_MAX)
        .map(lerRetrato)
        .filter((retrato): retrato is RetratoParaKit => retrato !== null),
    };
  }
  if (Array.isArray(pedido.rolagens)) {
    return {
      tipo: "rolagens",
      rolagens: pedido.rolagens
        .slice(0, ROLAGENS_MAX)
        .map(lerRolagem)
        .filter((rolagem): rolagem is RolagemDaMesa => rolagem !== null),
    };
  }

  return null;
}

/** A proporção da câmera da mesa, de onde vêm as frações do retrato. */
const ASPECTO_DA_MESA = SCENE_WIDTH / SCENE_HEIGHT;

/** Quanto da altura o retrato ocupa no encaixe. O resto é dos dados, embaixo. */
const ALTURA_NO_ENCAIXE = 0.6;
/** Quanto da largura de cada coluna a composição inteira pode ocupar. */
const LARGURA_NO_ENCAIXE = 0.9;
const TOPO_NO_ENCAIXE = 0.04;

/**
 * Os retratos arrumados para caber na tela do kit, lado a lado.
 *
 * É o `?encaixar=1`: o card de uma pessoa numa caixa do OBS, de qualquer
 * proporção. Cada retrato ganha uma coluna, e a COMPOSIÇÃO inteira dele -- a
 * figura, a coluna de barras, o nome, os selos -- cabe nela, centrada, no alto;
 * embaixo sobra lugar para os dados caírem.
 *
 * A figura guarda a proporção que tinha na mesa. As frações do registro são de
 * uma câmera 16:9; a da tela do kit é outra, e sem a conversão o retrato
 * sairia achatado numa caixa quadrada.
 */
export function encaixarRetratos<T extends RetratoParaKit>(
  retratos: readonly T[],
  aspectoDaTela: number,
): T[] {
  const colunas = retratos.length;
  if (colunas === 0 || !(aspectoDaTela > 0)) return [...retratos];

  const coluna = 1 / colunas;

  // A composição é medida como o DESENHO a mede: em pixel, com as peças
  // (`larguraDaColuna`, o nome, os dados) derivadas da caixa na mesma unidade
  // -- ver `MedidoresDoRetrato`. Aqui a unidade é a altura da tela, e a
  // largura dela é o aspecto. Medida em fração da câmera, a coluna de barras
  // saía 16/9 maior que a desenhada, e o card ficava fora do centro.
  const paraTela = 1 / aspectoDaTela;

  return retratos.map((retrato, indice) => {
    const medir = (altura: number) => {
      // A figura guarda, em pixel, a proporção que tinha na mesa 16:9.
      const largura = ((altura * retrato.width) / retrato.height) * ASPECTO_DA_MESA;
      const composicao = caixaDaComposicao({ ...retrato, width: largura, height: altura });

      return {
        largura: largura * paraTela,
        composicao: composicao.largura * paraTela,
        recuo: composicao.recuo * paraTela,
      };
    };

    let altura = ALTURA_NO_ENCAIXE;
    let medida = medir(altura);
    const cabe = coluna * LARGURA_NO_ENCAIXE;
    if (medida.composicao > cabe) {
      altura *= cabe / medida.composicao;
      medida = medir(altura);
    }

    return {
      ...retrato,
      x: indice * coluna + (coluna - medida.composicao) / 2 + medida.recuo,
      y: TOPO_NO_ENCAIXE,
      width: medida.largura,
      height: altura,
    };
  });
}
