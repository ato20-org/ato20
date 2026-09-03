"use client";

import { Volume2, VolumeX } from "lucide-react";

import { useAudioStore } from "@/lib/store/use-audio-store";
import { cn } from "@/lib/utils";

/**
 * Liga o som deste aparelho.
 *
 * Existe nas visões de espectador porque o som **precisa** de um gesto: o
 * browser recusa tocar antes de qualquer clique na página. Um botão resolve as
 * duas coisas de uma vez — libera o autoplay e deixa explícito qual aparelho
 * está emitindo, o que importa quando Operador e Assistir rodam na mesma
 * máquina e os dois juntos soariam como eco.
 */
export function SoundToggle({ className }: { className?: string }) {
  const enabled = useAudioStore((state) => state.enabled);
  const setEnabled = useAudioStore((state) => state.setEnabled);
  const retry = useAudioStore((state) => state.retry);

  return (
    <button
      type="button"
      aria-label={enabled ? "Desligar o som desta tela" : "Ligar o som desta tela"}
      aria-pressed={enabled}
      className={cn(
        "rounded-md bg-black/60 p-2 text-white backdrop-blur",
        !enabled && "text-white/50",
        className,
      )}
      onClick={() => {
        setEnabled(!enabled);
        // O clique é o gesto que o browser exigia: aproveita para tentar tocar
        // de novo o que estava bloqueado.
        if (!enabled) retry();
      }}
    >
      {enabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
    </button>
  );
}
