"use client";

import { call } from "@/lib/vault/bridge";
import type { Board } from "@/types/scene";

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
