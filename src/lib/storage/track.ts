import { getDb, SESSION_KEY } from "@/lib/storage/db";
import { DEFAULT_SESSION_VOLUME, type SessionTrack } from "@/types/scene";

/** Trilha escolhida e volume da sessão, como ficam no disco. */
export type StoredAudio = {
  track: SessionTrack | null;
  volume: number;
};

/**
 * O som da sessão, guardado fora do board.
 *
 * Fora de propósito: o histórico de desfazer tira retratos do board, e se a
 * trilha morasse lá um Ctrl+Z depois de mover uma imagem também mudaria a
 * música. Som não é conteúdo de cena.
 */
export async function loadAudio(): Promise<StoredAudio> {
  const db = await getDb();
  const record = await db.get("session", SESSION_KEY);

  return {
    track: record?.track ?? null,
    // Registro gravado antes de o volume sair da faixa guardava o ganho dentro
    // dela. Aproveitá-lo evita que quem já tinha a mesa aberta veja o som
    // saltar para o padrão na primeira vez que abrir esta versão.
    volume: record?.volume ?? legacyVolume(record?.track) ?? DEFAULT_SESSION_VOLUME,
  };
}

export async function saveAudio({ track, volume }: StoredAudio): Promise<void> {
  const db = await getDb();
  await db.put("session", { track, volume }, SESSION_KEY);
}

function legacyVolume(track: SessionTrack | null | undefined): number | null {
  const volume = (track as (SessionTrack & { volume?: unknown }) | null | undefined)?.volume;

  return typeof volume === "number" ? volume : null;
}
