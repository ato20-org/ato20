import { medidoresVisiveis } from "@/lib/medidor";
import type { Medidor } from "@/types/character";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type CanvasItem,
  type FichaNaCena,
} from "@/types/scene";

/**
 * O que desenha sobre a cabeça dos tokens, e onde.
 *
 * Fora de componente porque são duas contas puras que três telas fazem igual —
 * a do Mestre, a da TV e a do celular —, e porque conta pura se confere sem
 * palco montado. É a mesma divisão de `geometry/portrait`.
 */

/**
 * Quem tem token nesta cena, com nome e medidores.
 *
 * A lista SAI VAZIA com o interruptor desligado, e é isso que mantém a promessa
 * do campo: o nome de um PNJ que o mestre não apresentou não atravessa a rede
 * por causa de uma tela. Filtrar no desenho deixaria o nome no JSON que o
 * navegador guardou — o mesmo raciocínio de `sem_ocultos` e dos medidores
 * escondidos.
 *
 * Um personagem por token, na ordem em que entraram na cena. Dois tokens do
 * mesmo personagem — a horda de clones — dão uma ficha só, e cada token desenha
 * a partir dela.
 *
 * `incluirOcultos` é do palco do Mestre, o único que precisa ver o que a mesa
 * não vê. O default seguro é o que faz um chamador novo nascer certo.
 */
export function fichasDaCena(
  ligado: boolean,
  itens: ReadonlyArray<Pick<CanvasItem, "personagemId">>,
  personagens: ReadonlyArray<{ id: string; nome: string; medidores?: Medidor[] }>,
  incluirOcultos = false,
): FichaNaCena[] {
  if (!ligado) return [];

  const fichas = new Map(personagens.map((personagem) => [personagem.id, personagem]));

  const vistos = new Set<string>();
  const saida: FichaNaCena[] = [];

  for (const item of itens) {
    const personagemId = item.personagemId;
    if (!personagemId || vistos.has(personagemId)) continue;

    vistos.add(personagemId);

    // Token de personagem apagado: some da lista em vez de virar um rótulo sem
    // nome sobre o mapa. Mesma decisão do painel de retratos.
    const ficha = fichas.get(personagemId);
    if (!ficha) continue;

    saida.push({
      id: ficha.id,
      nome: ficha.nome,
      medidores: incluirOcultos
        ? (ficha.medidores ?? [])
        : medidoresVisiveis(ficha.medidores),
    });
  }

  return saida;
}

/**
 * Quanto do lado do token a informação ocupa, em fração da largura dele.
 *
 * Mais largo que o token de propósito: o que se escreve ali é um nome, e nome
 * de personagem não cabe em sessenta e sete unidades. A caixa cresce para os
 * dois lados a partir do centro da peça, que é onde o olho já está.
 */
export const LARGURA_DA_INFO = 2.2;

/** O respiro entre a base da caixa e o topo do token, em fração da largura. */
const FOLGA = 0.12;

/**
 * Onde a caixa de informação começa, em coordenadas de cena.
 *
 * ACIMA do token e centrada nele, e presa dentro do plano.
 *
 * A prisão não é capricho: **filho que transborda a caixa de um plano infla a
 * camada composta**, e o WebKitGTK então pinta o mapa deslocado e depois preto
 * — só no Mestre, só com a câmera parada, só ao dar zoom. Já derrubou o palco
 * três vezes, sempre com alguém pondo elemento novo dentro de um plano, e o
 * sintoma lê como bug de câmera. Ver a skill `debug-do-palco`, §3.
 *
 * E aqui o transbordo seria o caso COMUM, não a exceção: um token encostado na
 * borda de cima do mapa é onde a fila de inimigos entra, e a caixa dele nasce
 * justamente acima dele. Descendo para dentro do plano ela cobre um pedaço da
 * peça, que é o pior que pode acontecer dentro dele.
 */
export function lugarDaInfo(
  item: Pick<CanvasItem, "x" | "y" | "width">,
  altura: number,
): { x: number; y: number; largura: number } {
  const largura = item.width * LARGURA_DA_INFO;

  const centro = item.x + item.width / 2;
  const x = Math.min(
    Math.max(centro - largura / 2, 0),
    Math.max(0, SCENE_WIDTH - largura),
  );

  const acima = item.y - altura - item.width * FOLGA;
  const y = Math.min(Math.max(acima, 0), Math.max(0, SCENE_HEIGHT - altura));

  return { x, y, largura };
}
