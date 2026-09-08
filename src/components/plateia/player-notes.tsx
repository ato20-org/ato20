"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePlayerStore } from "@/lib/store/use-player-store";

/** Espera de digitação antes de gravar. Curto o bastante para não perder nada. */
const AUTOSAVE_DELAY_MS = 800;

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Bloco de notas do jogador. Campo livre, sem estrutura imposta.
 *
 * Salva sozinho: num celular, no meio da sessão, ninguém vai procurar um botão
 * de gravar antes de trocar de aba.
 */
export function PlayerNotes({ codigo }: { codigo: string }) {
  const sheet = usePlayerStore((state) => state.sheet);
  const atualizar = usePlayerStore((state) => state.atualizar);

  const [notas, setNotas] = useState(sheet?.notas ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Evita gravar de volta o mesmo texto que acabou de ser carregado.
  const savedRef = useRef(sheet?.notas ?? "");

  // Descarta o autosave pendente ao desmontar, senão um `setState` cairia num
  // componente que já saiu da árvore quando o jogador troca de aba.
  useEffect(() => () => clearTimeout(timerRef.current), []);

  useEffect(() => {
    if (saveState !== "saved") return;

    const timer = setTimeout(() => setSaveState("idle"), 1500);

    return () => clearTimeout(timer);
  }, [saveState]);

  if (!sheet) return null;

  function handleChange(valor: string) {
    setNotas(valor);

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (valor === savedRef.current) return;

      setSaveState("saving");
      savedRef.current = valor;

      void atualizar(codigo, { notas: valor }).then(() => setSaveState("saved"));
    }, AUTOSAVE_DELAY_MS);
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="player-notas">Minhas notas</Label>
        <span className="text-muted-foreground flex items-center gap-1 text-xs">
          {saveState === "saving" ? <Loader2 className="size-3 animate-spin" /> : null}
          {saveState === "saved" ? <Check className="size-3" /> : null}
          {saveState === "saving" ? "Salvando" : saveState === "saved" ? "Salvo" : null}
        </span>
      </div>

      <Textarea
        id="player-notas"
        value={notas}
        onChange={(event) => handleChange(event.target.value)}
        rows={8}
        placeholder="Nomes, pistas, o que o NPC prometeu…"
      />
    </section>
  );
}
