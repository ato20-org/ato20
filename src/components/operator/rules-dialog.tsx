"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Link2, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useUploadStore } from "@/lib/store/use-upload-store";
import { putAsset } from "@/lib/storage/assets";
import { loadRules, saveRules, type Room, type RuleLink } from "@/lib/supabase/rooms";

/**
 * Material de regras da mesa.
 *
 * Duas formas de entrar, porque os dois casos são reais: um PDF que o mestre
 * tem no disco, ou um link para uma página que ele só quer indicar. O PDF sobe
 * pelo mesmo caminho das imagens, então já ganha o bucket público e a URL
 * calculável que a Plateia usa.
 */
export function RulesDialog({ room }: { room: Room }) {
  const [rules, setRules] = useState<RuleLink[]>([]);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const enqueue = useUploadStore((state) => state.enqueue);

  const reload = useCallback(() => {
    void loadRules(room.id).then(setRules, () => setRules([]));
  }, [room.id]);

  useEffect(reload, [reload]);

  async function persist(next: RuleLink[]) {
    setRules(next);

    try {
      await saveRules(room.id, next);
    } catch {
      toast.error("Não foi possível salvar as regras.");
      reload();
    }
  }

  async function addLink() {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    await persist([
      ...rules,
      { id: crypto.randomUUID(), label: label.trim() || trimmedUrl, url: trimmedUrl },
    ]);

    setLabel("");
    setUrl("");
  }

  async function addFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    setBusy(true);

    try {
      const asset = await putAsset(file);
      // O upload para o Storage é o que torna o arquivo alcançável pelos
      // celulares; sem isso a entrada existiria apontando para o nada.
      enqueue([asset.id]);

      await persist([
        ...rules,
        { id: crypto.randomUUID(), label: label.trim() || asset.name, assetId: asset.id },
      ]);
      setLabel("");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível enviar o arquivo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" aria-label="Material de regras">
            <BookOpen />
            {rules.length > 0 ? <span className="text-xs">{rules.length}</span> : null}
          </Button>
        }
      />

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Regras</DialogTitle>
          <DialogDescription>
            Aparece na aba Regras do celular de cada jogador.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="rule-label">Nome</Label>
          <Input
            id="rule-label"
            value={label}
            placeholder="Livro do jogador"
            maxLength={80}
            onChange={(event) => setLabel(event.target.value)}
          />

          <Label htmlFor="rule-url">Link</Label>
          <div className="flex gap-2">
            <Input
              id="rule-url"
              value={url}
              placeholder="https://…"
              inputMode="url"
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void addLink();
              }}
            />
            <Button variant="outline" disabled={!url.trim()} onClick={() => void addLink()}>
              <Link2 />
              Adicionar
            </Button>
          </div>

          <Button
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Upload />}
            Enviar PDF
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="sr-only"
            onChange={(event) => {
              void addFile(event.target.files);
              // Sem isso, reenviar o mesmo arquivo não dispara `change`.
              event.target.value = "";
            }}
          />
        </div>

        {rules.length > 0 ? (
          <>
            <Separator />
            <ScrollArea className="max-h-56">
              <ul className="space-y-1 pr-3">
                {rules.map((rule) => (
                  <li
                    key={rule.id}
                    className="hover:bg-accent/50 flex items-center gap-1 rounded-md p-1"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{rule.label}</span>
                      <span className="text-muted-foreground block truncate text-[10px]">
                        {rule.url ?? "PDF enviado"}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remover ${rule.label}`}
                      onClick={() =>
                        void persist(rules.filter((candidate) => candidate.id !== rule.id))
                      }
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
