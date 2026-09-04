"use client";

import { useState } from "react";
import { HardDrive, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { collectUsedAssetIds } from "@/lib/operator/asset-usage";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useTrackStore } from "@/lib/store/use-track-store";
import { listMasterRooms, type Room } from "@/lib/supabase/rooms";
import {
  formatBytes,
  listRoomObjects,
  listStoredRooms,
  removeRoomObjects,
  type StoredRoom,
} from "@/lib/supabase/storage-usage";

type Usage = {
  /** Arquivos desta mesa que a cena, o retrato ou a trilha usam. */
  usedBytes: number;
  usedFiles: number;
  /** Estão no bucket sem ninguém usar: candidatos a sair. */
  idle: string[];
  idleBytes: number;
  /** Prefixos do bucket que não são mesas desta conta. */
  strays: StoredRoom[];
};

/**
 * Quanto esta mesa ocupa no Storage, e o que dá para liberar.
 *
 * Existe porque cota não se administra por confiança: o bucket cresce com o
 * uso, o plano gratuito aperta primeiro nele, e nenhuma regra automática
 * substitui ver o número. Lê o bucket e não a tabela do acervo — é o bucket que
 * consome a cota, e a diferença entre os dois é justamente o que interessa.
 */
export function StorageDialog({ room }: { room: Room }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function measure() {
    setBusy(true);
    setError(null);

    try {
      const [objects, storedRooms, mineRooms] = await Promise.all([
        listRoomObjects(room.id),
        listStoredRooms(),
        listMasterRooms(),
      ]);

      const used = collectUsedAssetIds(
        useSceneStore.getState().board?.scenes ?? [],
        usePortraitStore.getState().portraits,
        useTrackStore.getState().track,
      );

      const mine = new Set(mineRooms.map((candidate) => candidate.id));
      const idle = objects.filter((object) => !used.has(object.assetId));

      setUsage({
        usedFiles: objects.length - idle.length,
        usedBytes: objects
          .filter((object) => used.has(object.assetId))
          .reduce((total, object) => total + object.size, 0),
        idle: idle.map((object) => object.assetId),
        idleBytes: idle.reduce((total, object) => total + object.size, 0),
        strays: storedRooms.filter((stored) => !mine.has(stored.roomId)),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao ler o Storage");
    } finally {
      setBusy(false);
    }
  }

  async function free(assetIds: string[], roomId = room.id) {
    setBusy(true);
    setError(null);

    try {
      await removeRoomObjects(roomId, assetIds);
      await measure();
    } catch (cause) {
      // A policy só deixa o mestre daquela sala apagar: prefixo alheio volta
      // recusado pelo servidor, e a mensagem dele é mais honesta que a nossa.
      setError(cause instanceof Error ? cause.message : "Falha ao apagar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog onOpenChange={(open) => open && !usage && void measure()}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" aria-label="Espaço no Storage">
            <HardDrive />
          </Button>
        }
      />

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Espaço da mesa</DialogTitle>
          <DialogDescription>
            O bucket guarda o que a TV e os celulares precisam alcançar. O resto do acervo vive
            só nas tuas máquinas.
          </DialogDescription>
        </DialogHeader>

        {busy && !usage ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Medindo…
          </p>
        ) : null}

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        {usage ? (
          <div className="space-y-4 text-sm">
            <dl className="space-y-1">
              <Row
                label="Em uso nesta mesa"
                value={`${formatBytes(usage.usedBytes)} · ${usage.usedFiles} arquivo(s)`}
              />
              <Row
                label="No bucket sem uso"
                value={`${formatBytes(usage.idleBytes)} · ${usage.idle.length} arquivo(s)`}
              />
            </dl>

            {usage.idle.length > 0 ? (
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={busy}
                  onClick={() => void free(usage.idle)}
                >
                  <Trash2 />
                  Liberar {formatBytes(usage.idleBytes)}
                </Button>
                {/* Reversível de propósito: o arquivo continua no teu disco, e
                    "Subir para a mesa" o devolve quando precisar. */}
                <p className="text-muted-foreground text-xs">
                  Apaga do Storage, não do teu computador. Some da outra máquina até você mandar
                  de volta.
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">
                Nada sobrando: o bucket tem só o material das cenas.
              </p>
            )}

            {usage.strays.length > 0 ? (
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs font-medium">Mesas que não são desta conta</p>
                {/* O Storage não tem chave estrangeira com `rooms`: apagar a
                    linha da mesa não apagou os arquivos dela. */}
                <p className="text-muted-foreground text-xs">
                  Sobrou de mesa apagada — ou pertence a outro mestre, e aí o servidor recusa.
                </p>

                <ul className="space-y-1">
                  {usage.strays.map((stray) => (
                    <li key={stray.roomId} className="flex items-center gap-2">
                      <code className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                        {stray.roomId}
                      </code>
                      <span className="text-muted-foreground text-xs">
                        {formatBytes(stray.bytes)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Apagar arquivos de ${stray.roomId}`}
                        disabled={busy}
                        onClick={() =>
                          void listRoomObjects(stray.roomId).then((objects) =>
                            free(
                              objects.map((object) => object.assetId),
                              stray.roomId,
                            ),
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
