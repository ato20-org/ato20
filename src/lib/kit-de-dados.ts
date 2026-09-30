import {
  alcanceDaQueda,
  impulsoSemeado,
  sementeDoId,
  type LimitesDaMesa,
} from "@/lib/geometry/dado";
import { rotulosDoDado, TIPOS_DADO, type FacesDado } from "@/types/dado";

/**
 * O kit de dados: uma página do bundle (`/kit/dados`) que desenha dados caindo
 * sobre fundo transparente, para a página de um PLUGIN embutir num `<iframe>`.
 *
 * Existe porque a página do plugin roda no navegador de outra máquina, e o
 * dado de verdade -- a física da queda, os sólidos, a tombada semeada -- é
 * código do aplicativo, mil e setecentas linhas que nenhum plugin deveria
 * copiar. O kit desenha; quem decide QUAIS dados, QUANDO e POR QUANTO TEMPO é
 * a página do plugin, pelo `postMessage`. É o `api.ui.componentes` das páginas
 * que saem do Mestre.
 *
 * O protocolo, todo com `ato20: "dados"`:
 *
 * - página → kit: `{ lancar: [dado...] }`, `{ tirar: [id...] }`, `{ limpar: true }`
 * - kit → página: `{ pronto: true }`, quando já escuta. Antes disso, pedido se perde.
 *
 * Ver `docs/extensoes.md`.
 */

/** Um dado que a página pede para cair. */
export type DadoParaLancar = {
  id: string;
  faces: FacesDado;
  /** A face GRAVADA que ele mostra ao parar -- no d10, o zero é zero. */
  face: number;
  /** A tombada. Ausente = tirada do id, a mesma da janela do espectador. */
  semente: number;
  /** O arremesso, em unidades por segundo. Ausente = um sorteado pela semente. */
  impulso: { x: number; y: number } | null;
  /** Escrito embaixo do dado quando ele para. */
  rotulo: string | null;
  /** Segundos que ele fica depois de parar. Ausente = até a página pedir `tirar`. */
  prazo: number | null;
};

export type PedidoAoKit =
  | { tipo: "lancar"; dados: DadoParaLancar[] }
  | { tipo: "tirar"; ids: string[] }
  | { tipo: "limpar" };

const FACES = new Set<number>(TIPOS_DADO.map((tipo) => tipo.faces));

/** Quantos dados um pedido pode lançar. Mais que isso não é jogada, é tela cheia. */
const LANCE_MAX = 50;

function texto(valor: unknown, maximo: number): string | null {
  return typeof valor === "string" && valor.length > 0 && valor.length <= maximo ? valor : null;
}

function numero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

function lerDado(cru: unknown): DadoParaLancar | null {
  if (!cru || typeof cru !== "object") return null;
  const dado = cru as Record<string, unknown>;

  const id = texto(dado.id, 128);
  const faces = numero(dado.faces);
  const face = numero(dado.face);
  if (!id || faces === null || !FACES.has(faces) || face === null) return null;
  // Face que o dado não tem não tem pose: a queda não saberia onde parar.
  if (!rotulosDoDado(faces as FacesDado).includes(face)) return null;

  const semente = numero(dado.semente);
  const impulso =
    dado.impulso && typeof dado.impulso === "object"
      ? (dado.impulso as Record<string, unknown>)
      : null;
  const ix = numero(impulso?.x);
  const iy = numero(impulso?.y);
  const prazo = numero(dado.prazo);

  return {
    id,
    faces: faces as FacesDado,
    face,
    semente: semente === null ? sementeDoId(id) : semente >>> 0,
    impulso: ix !== null && iy !== null ? { x: ix, y: iy } : null,
    rotulo: texto(dado.rotulo, 40),
    prazo: prazo === null ? null : Math.min(600, Math.max(0.5, prazo)),
  };
}

/**
 * Lê o que chegou pelo `postMessage`. `null` para o que não é do kit.
 *
 * Validado aqui, e não confiado: quem manda é código de plugin, e dado torto
 * que chegasse à física desenharia um sólido sem face, ou um laço infinito
 * atrás de uma pose que não existe. O dado malformado some; os outros caem.
 */
export function lerPedido(dados: unknown): PedidoAoKit | null {
  if (!dados || typeof dados !== "object") return null;
  const pedido = dados as Record<string, unknown>;
  if (pedido.ato20 !== "dados") return null;

  if (Array.isArray(pedido.lancar)) {
    const lancar = pedido.lancar
      .slice(0, LANCE_MAX)
      .map(lerDado)
      .filter((dado): dado is DadoParaLancar => dado !== null);
    return { tipo: "lancar", dados: lancar };
  }
  if (Array.isArray(pedido.tirar)) {
    return {
      tipo: "tirar",
      ids: pedido.tirar.filter((id): id is string => typeof id === "string"),
    };
  }
  if (pedido.limpar === true) return { tipo: "limpar" };

  return null;
}

/** O arremesso do dado no kit: o que a página mandou, ou o sorteado pela semente. */
export function impulsoNoKit(
  dado: Pick<DadoParaLancar, "semente" | "impulso">,
): { x: number; y: number } {
  return dado.impulso ?? impulsoSemeado(dado.semente);
}

/**
 * Onde um dado está no LOTE que chegou com ele: o d20 e o d4 de dano que o
 * mestre jogou juntos, a iniciativa da mesa inteira.
 */
export type LugarNoLote = { indice: number; total: number };

/** Mistura os bits da semente (o final do murmur3), para semente pequena não ir sempre ao mesmo canto. */
function misturar(valor: number): number {
  let h = valor >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * De onde o dado parte no kit, e com que força.
 *
 * A mesa do mestre é o mapa e a do jogador é o celular; nenhuma das duas é a
 * tela do kit, então o PONTO de onde o dado saiu não quer dizer nada aqui. O
 * que se leva é o gesto, quando a página o manda.
 *
 * O ponto de CHEGADA é sorteado no miolo da tela, e a partida sai dele
 * recuando o alcance do arremesso. Partir do miolo e deixar o impulso decidir
 * mandaria o peteleco forte para a beirada, e metade das jogadas pousaria
 * grudada na borda.
 */
export function lancamentoNoKit(
  dado: Pick<DadoParaLancar, "semente" | "impulso">,
  limites: LimitesDaMesa,
  lugar: LugarNoLote = { indice: 0, total: 1 },
): { x: number; y: number; impulso: { x: number; y: number } } {
  const impulso = impulsoNoKit(dado);
  const alcance = alcanceDaQueda(impulso);

  const fx = misturar(dado.semente) / 0x1_0000_0000;
  const fy = misturar(dado.semente ^ 0x27d4eb2f) / 0x1_0000_0000;

  // Sozinho, o dado pousa em qualquer ponto do miolo. Em lote, cada um ganha
  // uma faixa da largura, na ordem do lote, e sorteia dentro da metade dela:
  // sorteados no mesmo miolo, três dados jogados juntos se encostavam, e o
  // número de um ficava embaixo do outro.
  const total = Math.max(1, lugar.total);
  const faixa = 0.7 / total;
  const x =
    total === 1 ? 0.3 + fx * 0.4 : 0.15 + faixa * (lugar.indice + 0.5) + (fx - 0.5) * faixa * 0.5;

  const chegada = {
    x: limites.largura * x,
    y: limites.altura * (0.3 + fy * 0.4),
  };

  return { x: chegada.x - alcance.x, y: chegada.y - alcance.y, impulso };
}
