"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMyPlayer, saveMyName } from "@/lib/supabase/players";

type SaveState = "idle" | "saving" | "saved";

/**
 * O jogador se nomeia. Um campo, sem cadastro — a identidade é a sessão
 * anônima do aparelho, e o nome existe só para o mestre saber quem é quem.
 */
export function PlayerIdentity({ roomId }: { roomId: string }) {
  const [name, setName] = useState("");
  const [masterLabel, setMasterLabel] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const load = useCallback(() => {
    void getMyPlayer(roomId).then(
      (player) => {
        setName(player?.name ?? "");
        setMasterLabel(player?.master_label ?? "");
        setLoaded(true);
      },
      () => setLoaded(true),
    );
  }, [roomId]);

  useEffect(load, [load]);

  useEffect(() => {
    if (saveState !== "saved") return;

    const timer = setTimeout(() => setSaveState("idle"), 1500);

    return () => clearTimeout(timer);
  }, [saveState]);

  async function submit() {
    setSaveState("saving");

    try {
      await saveMyName(roomId, name);
      setSaveState("saved");
    } catch {
      setSaveState("idle");
      toast.error("Não foi possível salvar o nome.");
    }
  }

  if (!loaded) {
    return <Loader2 className="text-muted-foreground mx-auto size-4 animate-spin" />;
  }

  return (
    <form
      className="w-full space-y-2 text-left"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Label htmlFor="player-name">Seu nome na mesa</Label>
      <div className="flex gap-2">
        <Input
          id="player-name"
          value={name}
          maxLength={40}
          placeholder="Como o mestre te chama"
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" disabled={saveState === "saving"}>
          {saveState === "saving" ? <Loader2 className="animate-spin" /> : null}
          {saveState === "saved" ? <Check /> : null}
          Salvar
        </Button>
      </div>

      {masterLabel ? (
        <p className="text-muted-foreground text-xs">
          O mestre te anotou como <span className="text-foreground">{masterLabel}</span>.
        </p>
      ) : null}
    </form>
  );
}
