import { CONTORNO_DE_JOGADOR, CONTORNO_DE_NPC } from "@/lib/contorno";
import type { CanvasItem } from "@/types/scene";

/**
 * Que cor de contorno cada item do mapa recebe.
 *
 * A regra tem uma porta só: contorno é para TOKEN, e token é o item que aponta
 * para um personagem. Mobília, mapa dentro do mapa e marca de sangue ficam sem
 * -- contornar tudo seria a mesma tinta em cima de um mapa inteiro, e a leitura
 * que se quer ("onde estão as pessoas") morreria no meio do ruído. Ver
 * `personagemId` em `CanvasItem`.
 *
 * Entre os tokens, a divisão é o VÍNCULO: personagem que alguém na mesa
 * interpreta sai azul, o resto sai branco. É por vínculo e não por um campo
 * "é NPC" no personagem porque o vínculo já existe, já é o que a ficha e as
 * listas do palco usam, e não cria um segundo lugar para a mesma verdade
 * discordar de si mesma. A consequência a conhecer: um inimigo que o mestre
 * largou no mapa como imagem solta, sem personagem, não recebe contorno nenhum.
 *
 * Devolve um mapa por ID DE ITEM porque é assim que quem desenha pergunta, um
 * item por vez, e porque o valor sai primitivo -- o `memo` do `CanvasItemView`
 * continua valendo durante o arrasto.
 */
export function contornoDosItens(
  items: readonly CanvasItem[],
  /** Os personagens que têm jogador. Ver `usePersonagensDeJogador`. */
  comJogador: ReadonlySet<string>,
): Map<string, string> {
  const cores = new Map<string, string>();

  for (const item of items) {
    if (!item.personagemId) continue;

    cores.set(
      item.id,
      comJogador.has(item.personagemId)
        ? CONTORNO_DE_JOGADOR
        : CONTORNO_DE_NPC,
    );
  }

  return cores;
}
