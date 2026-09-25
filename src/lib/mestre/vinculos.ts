import type { Player } from "@/lib/vault/players";

/**
 * Quem joga cada personagem, cruzando os vínculos com a mesa.
 *
 * Existe porque a pergunta "este personagem é de jogador?" tinha DUAS respostas
 * no palco, e elas discordavam. A lista de personagens cruzava o vínculo com a
 * lista de jogadores e descartava o que não achasse dono; o contorno do token
 * lia o vínculo cru. Um jogador removido da mesa deixava o vínculo dele para
 * trás, e o mesmo personagem saía embaixo de "NPCs" na lista e azul no mapa --
 * a queixa que trouxe este módulo. A raiz foi tapada no `players::remove`, que
 * agora leva o vínculo junto; isto aqui é a segunda porta, para uma linha podre
 * que sobre de qualquer outro caminho nunca mais pintar token.
 *
 * O cruzamento é a própria definição, e não uma limpeza: vínculo sem jogador
 * não é um vínculo pela metade, é um vínculo de ninguém.
 *
 * Os outros hooks que leem `characterLinks` não precisam disto -- o
 * `useCharacterNames`, o `useRolagensDaMesa` e o diálogo do jogador perguntam
 * pelo lado do JOGADOR, e um id que não existe simplesmente não casa com
 * ninguém. Quem se machuca é quem pergunta pelo lado do personagem.
 */
export function donosPorPersonagem(
  /** Os pares `[jogadorId, personagemId]`, como `characterLinks` os devolve. */
  pares: ReadonlyArray<readonly [string, string]>,
  /** A mesa: todo jogador que a campanha conhece. Ver `listPlayers`. */
  jogadores: readonly Player[],
): Map<string, string[]> {
  const porId = new Map(jogadores.map((jogador) => [jogador.id, jogador.nome]));
  const mapa = new Map<string, string[]>();

  for (const [jogadorId, personagemId] of pares) {
    const nome = porId.get(jogadorId);
    // Vínculo de um jogador que não está mais na mesa: não conta para nada, nem
    // como linha em branco embaixo do nome do personagem, nem como contorno.
    if (!nome) continue;

    mapa.set(personagemId, [...(mapa.get(personagemId) ?? []), nome]);
  }

  return mapa;
}
