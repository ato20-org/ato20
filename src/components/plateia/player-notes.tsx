"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getMyPlayer, saveMyNotes } from "@/lib/supabase/players";

/** Espera de digitação antes de gravar. Curto o bastante para não perder nada. */
const AUTOSAVE_DELAY_MS = 800;

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Bloco de notas do jogador. Campo livre, sem estrutura imposta.
 *
 * Salva sozinho: num celular, no meio da sessão, ninguém vai procurar um botão
 * de gravar antes de trocar de aba.
 */
export function PlayerNotes({ roomId }: { roomId: string }) {
  const [notes, setNotes] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Evita gravar de volta o mesmo texto que acabou de ser carregado.
  const savedRef = useRef("");

  useEffect(() => {
    let active = true;

    void getMyPlayer(roomId)
      .then((player) => {
        if (!active) return;

        const stored = player?.notes ?? "";
        savedRef.current = stored;
        setNotes(stored);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [roomId]);

  // Descarta o autosave pendente ao desmontar, senão um `setState` cairia num
  // componente que já saiu da árvore.
  useEffect(() => () => clearTimeout(timerRef.current), []);

  function handleChange(value: string) {
    setNotes(value);
    clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      if (value === savedRef.current) return;

      setSaveState("saving");
      void saveMyNotes(roomId, value).then(
        () => {
          savedRef.current = value;
          setSaveState("saved");
        },
        () => setSaveState("error"),
      );
    }, AUTOSAVE_DELAY_MS);
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="player-notes">Minhas anotações</Label>
        <span className="text-muted-foreground flex items-center gap-1 text-[10px]">
          {saveState === "saving" ? <Loader2 className="size-3 animate-spin" /> : null}
          {saveState === "saved" ? <Check className="size-3" /> : null}
          {saveState === "error" ? <span className="text-destructive">falha ao salvar</span> : null}
        </span>
      </div>

      <Textarea
        id="player-notes"
        value={notes}
        disabled={!loaded}
        rows={8}
        placeholder="Inventário, pistas, nomes de PNJ, o que quiser."
        onChange={(event) => handleChange(event.target.value)}
      />
    </section>
  );
}
