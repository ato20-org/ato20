import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type {
  AssetFolder,
  AssetKind,
  AssetMeta,
  Board,
  Portrait,
  SessionTrack,
} from "@/types/scene";

/**
 * Chave do banco no browser, não o nome do projeto — por isso não acompanhou
 * a renomeação para ATO20. Trocá-la faz o browser abrir um IndexedDB novo e
 * vazio, e todo o board, imagem e som já gravados ficam órfãos no disco.
 */
const DB_NAME = "rpg-show";
const DB_VERSION = 5;

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
  /**
   * O que este navegador sabe da cópia na nuvem, por mesa.
   *
   * Fica fora do board de propósito: `version` e `dirty` descrevem a relação
   * com o servidor, não a cena — gravá-los dentro do JSON os faria viajar para
   * dentro da própria coluna que eles versionam.
   */
  sync: {
    key: string;
    value: { version: number; dirty: boolean };
  };
  /**
   * Retratos da sessão.
   *
   * Store próprio, e não um campo dentro do registro da sessão: dois
   * escritores no mesmo registro se sobrescrevem, e a trilha grava a cada
   * ajuste de volume enquanto o retrato grava a cada frame de arrasto.
   */
  portraits: {
    key: string;
    value: { portraits: Portrait[] };
  };
  /** Pastas do acervo. Existem sozinhas: pasta vazia continua na lista. */
  folders: {
    key: string;
    value: AssetFolder;
  };
}

let dbPromise: Promise<IDBPDatabase<RpgShowDB>> | null = null;

/**
 * Quanto se espera por uma atualização bloqueada antes de desistir.
 *
 * Uma versão nova do schema só entra quando toda conexão antiga fecha. Se uma
 * aba velha continuar aberta, o `openDB` fica pendente **para sempre** — e o
 * sintoma não é erro nenhum: é a tela carregando sem fim, com os botões
 * inertes. Melhor falhar dizendo o que fazer.
 */
const BLOCKED_TIMEOUT_MS = 2500;

/**
 * IndexedDB só existe no browser. Todo consumidor daqui precisa ser client
 * component — chamar isso no servidor é bug, não caso de fallback.
 */
export function getDb(): Promise<IDBPDatabase<RpgShowDB>> {
  if (typeof indexedDB === "undefined") {
    throw new Error("getDb() chamado fora do browser");
  }

  dbPromise ??= open();

  return dbPromise;
}

function open(): Promise<IDBPDatabase<RpgShowDB>> {
  let blockedBy: number | null = null;

  const opening = openDB<RpgShowDB>(DB_NAME, DB_VERSION, {
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
      // Versão 3, junto com o board na nuvem. O store `boards` passou a ser
      // indexado por sala, e o registro antigo — chave `default` — é adotado
      // pela primeira mesa que abrir (ver `board.ts`).
      if (!db.objectStoreNames.contains("sync")) {
        db.createObjectStore("sync");
      }
      // Versão 4, com os retratos de personagem.
      if (!db.objectStoreNames.contains("portraits")) {
        db.createObjectStore("portraits");
      }
      // Versão 5, com as pastas do acervo.
      if (!db.objectStoreNames.contains("folders")) {
        db.createObjectStore("folders", { keyPath: "id" });
      }
    },

    /** Outra aba mantém uma versão antiga aberta e trava esta atualização. */
    blocked(currentVersion) {
      blockedBy = currentVersion;
    },

    /**
     * Esta aba é a antiga, e é ela que está travando outra.
     *
     * Fechar aqui é o que faz a aba nova conseguir subir a versão. A conexão
     * é recriada na próxima chamada — para o Assistir aberto na TV, isso
     * significa uma leitura a mais, não uma tela quebrada.
     */
    blocking(currentVersion, blockedVersion, event) {
      (event.target as IDBDatabase).close();
      dbPromise = null;
    },

    /** O browser derrubou a conexão (aba dormindo, memória). */
    terminated() {
      dbPromise = null;
    },
  });

  const guard = new Promise<never>((_, reject) => {
    setTimeout(() => {
      if (blockedBy === null) return;

      dbPromise = null;
      reject(
        new Error(
          "Uma atualização do armazenamento local está esperando. Feche as outras abas do ATO20 (Assistir, Plateia) e recarregue esta.",
        ),
      );
    }, BLOCKED_TIMEOUT_MS);
  });

  return Promise.race([opening, guard]);
}
