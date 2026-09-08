"use client";

import { Smartphone } from "lucide-react";

import { PlateiaStage } from "@/components/plateia/plateia-stage";
import { SessionAudio } from "@/components/playground/session-audio";
import { useSubscription } from "@/hooks/use-scene-broadcast";

/**
 * A visão do jogador — por enquanto, só a cena.
 *
 * Duas coisas saíram daqui junto com o Supabase, e voltam em passos diferentes:
 *
 * A **porta do código** existia para achar a mesa na nuvem. Enquanto o
 * transporte é o `BroadcastChannel`, esta tela só recebe cena sendo uma aba da
 * máquina do Operador, e não há mesa remota a procurar. Ela volta com o SSE do
 * daemon, e o código passa a valer de novo.
 *
 * A **ficha do personagem** — nome, anexos e notas — dependia da tabela
 * `players` e do bucket de anexos, com a RLS isolando a ficha de um jogador da
 * do outro. Isso não desaparece por mudar de armazenamento: vira código no
 * daemon, com token por jogador, e é por isso que volta depois, e não agora.
 * Deixá-la na tela ligada a nada seria pior que não tê-la.
 *
 * Com a ficha foi o layout de abas: sem um segundo painel, "Cena" e
 * "Personagem" seriam uma aba só.
 */
export function PlateiaShell() {
  const { scene, track, portraits, synced, stalled } = useSubscription();

  return (
    // `h-dvh` fixa a altura na viewport real do celular, já descontando a
    // barra do navegador.
    <main className="flex h-dvh min-w-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-2 [@media(max-height:520px)]:py-1">
        <Smartphone className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <span className="text-sm font-medium">Mesa</span>
      </header>

      <div className="min-h-0 flex-1 p-2">
        <PlateiaStage scene={scene} portraits={portraits} synced={synced} stalled={stalled} />
      </div>

      {/* Fora do palco: a trilha pertence à sessão, e não à cena que está no
          ar — trocar de cena não pode cortar a música. */}
      <SessionAudio track={track} />
    </main>
  );
}
