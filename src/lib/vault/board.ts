"use client";

import { call } from "@/lib/vault/bridge";
import type { Board, Scene } from "@/types/scene";

/**
 * Carrega o board do disco. `null` = campanha sem board ainda.
 *
 * Quem cria o primeiro é a tela, e não o Rust, porque é ela que é dona do
 * formato de `Scene` — o Rust trata cena como JSON opaco de propósito, para o
 * formato não ter duas fontes de verdade que precisam migrar juntas.
 */
export function loadBoard(): Promise<Board | null> {
  return call<Board | null>("board_load");
}

/**
 * Grava o board.
 *
 * O Rust grava por diferença: `ordem.json` mais só as cenas cujo JSON mudou.
 * Sem isso, mover um token dez pixels reescreveria as trinta cenas da campanha
 * e encheria o `git diff` de ruído.
 *
 * O `roomId` que esta função recebia saiu junto com a nuvem: uma campanha é uma
 * pasta, e a pasta aberta é a única que existe. Também não há mais marca de
 * sincronia — `version` e `dirty` descreviam a relação com o servidor, e não
 * existe servidor.
 */
export function saveBoard(board: Board): Promise<void> {
  return call("board_save", { board });
}

/**
 * O board como se manda quando só algumas cenas mudaram.
 *
 * `ordem` é SEMPRE completa: é ela que diz o que existe, e cena que sai dela
 * tem o arquivo apagado. O que encurta é o corpo das cenas — e é aí que está o
 * ganho, porque o corpo é tudo: itens, áreas, traços.
 */
export type BoardPatch = {
  /** Todos os ids, na ordem da lista. */
  ordem: string[];
  /** Só as cenas cujo conteúdo mudou. Vazio é normal — navegar não muda cena. */
  scenes: Scene[];
  editingSceneId: string | null;
  liveSceneId: string | null;
};

/**
 * Grava só as cenas que mudaram.
 *
 * O Rust já gravava por diferença — compara o JSON com o disco e não reescreve
 * cena intocada —, mas a diferença começava tarde: o board INTEIRO atravessava
 * o IPC para ele descobrir que vinte e nove das trinta cenas estavam iguais.
 * Medido no formato real, com `JSON.stringify`: 0,60 MB numa campanha de trinta
 * cenas e 3,71 MB numa de oitenta com traço em todas — a cada 400 ms de pausa
 * na edição, e são 25 ms só de serializar antes de o IPC começar.
 *
 * Quem decide o que mudou é a IDENTIDADE do objeto, e é de graça: cena é
 * imutável aqui, e `updateScene` só troca a que foi editada. Ver `persistir` no
 * `use-scene-store`.
 */
export function saveBoardPatch(patch: BoardPatch): Promise<void> {
  return call("board_save_patch", { patch });
}
