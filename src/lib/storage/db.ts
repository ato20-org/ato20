import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { AssetKind, AssetMeta, Board, SessionTrack } from "@/types/scene";

/**
 * Chave do banco no browser, não o nome do projeto — por isso não acompanhou
 * a renomeação para ATO20. Trocá-la faz o browser abrir um IndexedDB novo e
 * vazio, e todo o board, imagem e som já gravados ficam órfãos no disco.
 */
const DB_NAME = "rpg-show";
const DB_VERSION = 2;

/** Metadados + binário. O binário nunca vira base64: infla 33% e estoura cota. */
export type AssetRecord = AssetMeta & { blob: Blob };

export const BOARD_KEY = "default";
export const SESSION_KEY = "default";

interface RpgShowDB extends DBSchema {
  assets: {
    key: string;
    value: AssetRecord;
    indexes: { "by-kind": AssetKind };
  };
  boards: {
    key: string;
    value: Board;
  };
  /** Estado da sessão que não pertence a nenhuma cena. */
  session: {
    key: string;
    value: { track: SessionTrack | null };
  };
}

let dbPromise: Promise<IDBPDatabase<RpgShowDB>> | null = null;

/**
 * IndexedDB só existe no browser. Todo consumidor daqui precisa ser client
 * component — chamar isso no servidor é bug, não caso de fallback.
 */
export function getDb(): Promise<IDBPDatabase<RpgShowDB>> {
  if (typeof indexedDB === "undefined") {
    throw new Error("getDb() chamado fora do browser");
  }

  dbPromise ??= openDB<RpgShowDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("assets")) {
        const assets = db.createObjectStore("assets", { keyPath: "id" });
        assets.createIndex("by-kind", "kind");
      }
      if (!db.objectStoreNames.contains("boards")) {
        db.createObjectStore("boards");
      }
      // Versão 2. Criar um store novo preserva os existentes: o board, as
      // imagens e os sons já gravados continuam onde estão.
      if (!db.objectStoreNames.contains("session")) {
        db.createObjectStore("session");
      }
    },
  });

  return dbPromise;
}
