"use client";

import { Smartphone } from "lucide-react";

import { PlateiaStage } from "@/components/plateia/plateia-stage";
import { SessionAudio } from "@/components/playground/session-audio";
import { useSubscription } from "@/hooks/use-scene-broadcast";

/**
 * A visão do jogador.
 *
 * Já é outro aparelho de novo: o daemon serve esta página pela rede local e a
 * cena chega por SSE. O que ainda falta é a **ficha do personagem** — nome,
 * anexos e notas.
 *
 * Ela dependia da tabela `players` com a RLS isolando a ficha de um jogador da
 * do outro, e isso não desaparece por trocar de armazenamento: vira código no
 * daemon, com token por jogador. É o passo seguinte, e com ela volta o layout
 * de abas — que sem um segundo painel seria uma aba só.
 */
export function PlateiaShell({
  codigo,
  nomeDaMesa,
}: {
  codigo: string;
  nomeDaMesa: string;
}) {
  const { scene, track, portraits, synced, stalled } = useSubscription(codigo);

  return (
    // `h-dvh` fixa a altura na viewport real do celular, já descontando a
    // barra do navegador.
    <main className="flex h-dvh min-w-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-2 [@media(max-height:520px)]:py-1">
        <Smartphone className="text-muted-foreground size-4 shrink-0" aria-hidden />
        {/* O nome da mesa, e não o código: quem já entrou não precisa mais do
            código, e precisa saber que entrou na mesa certa. */}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{nomeDaMesa}</span>
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
