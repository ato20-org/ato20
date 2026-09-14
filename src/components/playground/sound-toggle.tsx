"use client";

import { Volume2, VolumeX } from "lucide-react";

import { useAudioStore } from "@/lib/store/use-audio-store";
import { cn } from "@/lib/utils";

/**
 * Liga o som deste aparelho.
 *
 * Existe nas visões de espectador porque o som precisa de um gesto: o browser
 * recusa tocar antes de qualquer clique na página. O botão também deixa
 * explícito qual aparelho está emitindo, o que importa quando Mestre e
 * Espectador rodam na mesma máquina e os dois juntos soariam como eco.
 */
export function SoundToggle({ className }: { className?: string }) {
  const enabled = useAudioStore((state) => state.enabled);
  const blocked = useAudioStore((state) => state.blocked);
  const setEnabled = useAudioStore((state) => state.setEnabled);
  const retry = useAudioStore((state) => state.retry);

  // O aparelho quer som, mas o browser ainda não liberou. Sem distinguir este
  // caso, o botão mostraria "ligado" enquanto nada toca — e o clique, achando
  // que já está ligado, DESLIGARIA. Era por isso que só funcionava clicando
  // duas vezes.
  const needsGesture = enabled && blocked;

  return (
    <button
      type="button"
      aria-label={
        needsGesture
          ? "Tocar o som"
          : enabled
            ? "Desligar o som desta tela"
            : "Ligar o som desta tela"
      }
      aria-pressed={enabled && !blocked}
      className={cn(
        "rounded-md p-2 backdrop-blur",
        needsGesture
          ? "bg-primary text-primary-foreground animate-pulse"
          : "bg-black/60 text-white",
        !enabled && !blocked && "text-white/50",
        className,
      )}
      onClick={() => {
        // Bloqueado, o clique é o gesto que faltava — não um pedido de
        // desligar.
        if (needsGesture) {
          retry();
          return;
        }

        setEnabled(!enabled);
        if (!enabled) retry();
      }}
    >
      {needsGesture || !enabled ? (
        <VolumeX className="size-4" />
      ) : (
        <Volume2 className="size-4" />
      )}
    </button>
  );
}
