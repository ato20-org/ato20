"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BookOpen, Loader2, Monitor, Smartphone, User, WifiOff } from "lucide-react";

import { PlateiaStage } from "@/components/plateia/plateia-stage";
import { PlayerAttachments } from "@/components/plateia/player-attachments";
import { PlayerIdentity } from "@/components/plateia/player-identity";
import { PlayerNotes } from "@/components/plateia/player-notes";
import { PlayerRules } from "@/components/plateia/player-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTabbedLayout } from "@/hooks/use-tabbed-layout";
import { useSwipeTabs } from "@/hooks/use-swipe-tabs";
import { useRoomStore } from "@/lib/store/use-room-store";

const CODE_LENGTH = 6;

/**
 * Abas por layout, na ordem em que o arraste lateral navega.
 *
 * Em pé a cena fica presa no topo e não é aba; deitado ela disputa a altura
 * com o resto e volta a ser.
 */
const STACKED_TABS = ["personagem", "regras"] as const;
const TABBED_TABS = ["cena", "personagem", "regras"] as const;

type StackedTab = (typeof STACKED_TABS)[number];
type Tab = (typeof TABBED_TABS)[number];

export function PlateiaShell() {
  const searchParams = useSearchParams();
  const codeFromLink = (searchParams.get("code") ?? "").trim().toUpperCase();

  const status = useRoomStore((state) => state.status);
  const room = useRoomStore((state) => state.room);
  const error = useRoomStore((state) => state.error);
  const connectAsPlayer = useRoomStore((state) => state.connectAsPlayer);

  const [code, setCode] = useState(codeFromLink);

  useEffect(() => {
    // Link do mestre já traz o código: entrar sozinho poupa o jogador de
    // digitar seis caracteres na tela do celular.
    if (codeFromLink.length === CODE_LENGTH) void connectAsPlayer(codeFromLink);
  }, [codeFromLink, connectAsPlayer]);

  if (status === "offline") {
    return (
      <Centered>
        <WifiOff className="text-muted-foreground size-8" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Plateia</h1>
        <p className="text-muted-foreground text-sm">
          Esta instalação está em modo local. A visão dos jogadores precisa das chaves do Supabase
          configuradas pelo mestre.
        </p>
        <Link href="/mesa" className="text-sm underline underline-offset-4">
          Voltar
        </Link>
      </Centered>
    );
  }

  if (status === "ready" && room) {
    return <Connected roomId={room.id} code={room.code} />;
  }

  return (
    <Centered>
      <Smartphone className="text-muted-foreground size-8" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">Entrar na mesa</h1>
      <p className="text-muted-foreground text-sm">
        Digite o código que o mestre está mostrando na tela dele.
      </p>

      <form
        className="w-full space-y-3 text-left"
        onSubmit={(event) => {
          event.preventDefault();
          void connectAsPlayer(code);
        }}
      >
        <Label htmlFor="room-code">Código da mesa</Label>
        <Input
          id="room-code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          maxLength={CODE_LENGTH}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="ABC234"
          className="text-center text-lg tracking-[0.4em]"
        />

        {status === "error" ? <p className="text-destructive text-sm">{error}</p> : null}

        <Button
          type="submit"
          className="w-full"
          disabled={code.length !== CODE_LENGTH || status === "loading"}
        >
          {status === "loading" ? <Loader2 className="animate-spin" /> : null}
          Entrar
        </Button>
      </form>
    </Centered>
  );
}

/**
 * A mesa, em dois layouts.
 *
 * O que decide é a proporção da tela — ver `useTabbedLayout`.
 *
 * Mais alta que larga: a cena presa no topo cabe em no máximo 56% da altura,
 * então sobra espaço garantido para a ficha embaixo.
 *
 * Mais larga que alta: a cena pediria altura demais e sufocaria o resto, então
 * ela mesma volta a ser aba e só uma coisa aparece por vez.
 *
 * Nos dois casos a barra fica centralizada embaixo e o arraste lateral navega.
 */
function Connected({ roomId, code }: { roomId: string; code: string }) {
  const tabbed = useTabbedLayout();

  return (
    // `h-dvh` fixa a altura na viewport real do celular, já descontando a
    // barra do navegador.
    <main className="flex h-dvh min-w-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-2 [@media(max-height:520px)]:py-1">
        <Smartphone className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <span className="text-sm font-medium [@media(max-height:520px)]:hidden">Mesa</span>
        <code className="text-muted-foreground text-sm tracking-widest">{code}</code>
      </header>

      {tabbed ? <TabbedLayout roomId={roomId} /> : <StackedLayout roomId={roomId} />}
    </main>
  );
}

/**
 * Tela em pé: cena presa no topo, abas embaixo para o resto.
 *
 * A cena não é aba aqui porque não precisa ser — sobra altura para ela e para
 * o conteúdo ao mesmo tempo. Presa, e não rolando junto: perder o mapa de
 * vista ao consultar a própria ficha é o oposto do que serve numa mesa.
 */
function StackedLayout({ roomId }: { roomId: string }) {
  const [tab, setTab] = useState<StackedTab>("personagem");
  const swipe = useSwipeTabs(STACKED_TABS, tab, setTab);

  return (
    <>
      <div className="shrink-0 p-2">
        <PlateiaStage roomId={roomId} />
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as StackedTab)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="min-h-0 flex-1" {...swipe}>
          <TabsContent value="personagem" className="h-full space-y-4 overflow-y-auto p-3">
            <CharacterPanel roomId={roomId} />
          </TabsContent>

          <TabsContent value="regras" className="h-full overflow-y-auto p-3">
            <PlayerRules roomId={roomId} />
          </TabsContent>
        </div>

        <BottomBar>
          <TabsTrigger value="personagem">
            <User />
            Personagem
          </TabsTrigger>
          <TabsTrigger value="regras">
            <BookOpen />
            Regras
          </TabsTrigger>
        </BottomBar>
      </Tabs>
    </>
  );
}

/** Nome, arquivos e notas — o bloco é o mesmo nos dois layouts. */
function CharacterPanel({ roomId }: { roomId: string }) {
  return (
    <>
      <PlayerIdentity roomId={roomId} />
      <PlayerAttachments roomId={roomId} />
      <PlayerNotes roomId={roomId} />
    </>
  );
}

/**
 * Barra centralizada e compacta.
 *
 * O polegar alcança o meio da tela muito melhor que os cantos, e a barra
 * ocupar a largura inteira só afastava os alvos um do outro.
 */
function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 justify-center border-t p-1">
      <TabsList>{children}</TabsList>
    </div>
  );
}

/** Tela deitada: uma aba por vez, com arraste lateral e barra centralizada. */
function TabbedLayout({ roomId }: { roomId: string }) {
  const [tab, setTab] = useState<Tab>("cena");
  const swipe = useSwipeTabs(TABBED_TABS, tab, setTab);

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as Tab)}
      className="flex min-h-0 flex-1 flex-col gap-0"
    >
      <div className="min-h-0 flex-1" {...swipe}>
        <TabsContent value="cena" className="h-full p-2">
          <PlateiaStage roomId={roomId} />
        </TabsContent>

        <TabsContent value="personagem" className="h-full space-y-4 overflow-y-auto p-3">
          <CharacterPanel roomId={roomId} />
        </TabsContent>

        <TabsContent value="regras" className="h-full overflow-y-auto p-3">
          <PlayerRules roomId={roomId} />
        </TabsContent>
      </div>

      <BottomBar>
        <TabsTrigger value="cena">
          <Monitor />
          Cena
        </TabsTrigger>
        <TabsTrigger value="personagem">
          <User />
          Personagem
        </TabsTrigger>
        <TabsTrigger value="regras">
          <BookOpen />
          Regras
        </TabsTrigger>
      </BottomBar>
    </Tabs>
  );
}

/** Telas de antessala: uma coluna centrada, largura de celular. */
function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      {children}
    </main>
  );
}
