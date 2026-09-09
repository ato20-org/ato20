"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePlayerStore } from "@/lib/store/use-player-store";

type SaveState = "idle" | "saving" | "saved";

/**
 * O jogador se renomeia.
 *
 * Um campo, sem cadastro — a identidade é o token guardado neste aparelho, e o
 * nome existe só para o mestre saber quem é quem.
 */
export function PlayerIdentity({ codigo }: { codigo: string }) {
  const sheet = usePlayerStore((state) => state.sheet);
  const atualizar = usePlayerStore((state) => state.atualizar);

  const [nome, setNome] = useState(sheet?.nome ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    if (saveState !== "saved") return;

    const timer = setTimeout(() => setSaveState("idle"), 1500);

    return () => clearTimeout(timer);
  }, [saveState]);

  if (!sheet) return null;

  const inalterado = nome.trim() === sheet.nome || nome.trim().length === 0;

  return (
    <section className="space-y-2">
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSaveState("saving");
          void atualizar(codigo, { nome: nome.trim() }).then(() => setSaveState("saved"));
        }}
      >
        <Label htmlFor="player-nome">Teu nome</Label>
        <div className="flex gap-2">
          <Input
            id="player-nome"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            maxLength={60}
            spellCheck={false}
          />
          <Button type="submit" variant="outline" size="sm" disabled={inalterado}>
            {saveState === "saving" ? (
              <Loader2 className="animate-spin" />
            ) : saveState === "saved" ? (
              <Check />
            ) : null}
            Salvar
          </Button>
        </div>
      </form>

      {/* O apelido do mestre, quando existe. Só de leitura: nem o dono da linha
          escreve nele — `PATCH /eu` não tem esse campo. */}
    </section>
  );
}
