"use client";

import { useState } from "react";
import { Monitor, Smartphone, User } from "lucide-react";

import { PlateiaStage } from "@/components/plateia/plateia-stage";
import { MyCharacters } from "@/components/plateia/my-characters";
import { PlayerGate } from "@/components/plateia/player-gate";
import { PlayerIdentity } from "@/components/plateia/player-identity";
import { SessionAudio } from "@/components/playground/session-audio";
import { SpotlightLayer } from "@/components/playground/spotlight-layer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSubscription, type Subscription } from "@/hooks/use-scene-broadcast";
import { useSwipeTabs } from "@/hooks/use-swipe-tabs";
import { useTabbedLayout } from "@/hooks/use-tabbed-layout";

/**
 * Abas por layout, na ordem em que o arraste lateral navega.
 *
 * Em pé a cena fica presa no topo e não é aba; deitado ela disputa a altura
 * com o resto e volta a ser.
 */
const STACKED_TABS = ["personagem"] as const;
const TABBED_TABS = ["cena", "personagem"] as const;

type StackedTab = (typeof STACKED_TABS)[number];
type Tab = (typeof TABBED_TABS)[number];

/**
 * A visão do jogador: a cena, e a ficha do personagem.
 *
 * A cena chega por SSE do daemon; a ficha, pelas rotas `/eu`. São dois níveis
 * de entrada de propósito — o código da mesa dá acesso à cena, e o nome cria a
 * ficha. Quem só quer olhar o mapa nunca vira uma linha na campanha do mestre.
 */
export function PlateiaShell({ codigo, nomeDaMesa }: { codigo: string; nomeDaMesa: string }) {
  const tabbed = useTabbedLayout();

  // A inscrição vive aqui, e não dentro da aba Cena: aba inativa é desmontada,
  // e o jogador que fosse ver a ficha sairia do fluxo e perderia as trocas de
  // cena até voltar.
  const live = useSubscription(codigo);

  return (
    // `h-dvh` fixa a altura na viewport real do celular, já descontando a
    // barra do navegador.
    <main className="flex h-dvh min-w-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-2 select-none [@media(max-height:520px)]:py-1">
        <Smartphone className="text-muted-foreground size-4 shrink-0" aria-hidden />
        {/* O nome da mesa, e não o código: quem já entrou não precisa mais do
            código, e precisa saber que entrou na mesa certa. */}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{nomeDaMesa}</span>
      </header>

      {tabbed ? (
        <TabbedLayout codigo={codigo} live={live} />
      ) : (
        <StackedLayout codigo={codigo} live={live} />
      )}

      {/* Fora das abas: a trilha não pode parar porque o jogador foi consultar
          a própria ficha. Música cortada no meio quebra a imersão que ela
          existe para criar. */}
      <SessionAudio track={live.track} volume={live.volume} />

      {/* Fora das abas pelo mesmo motivo, e sobre a tela inteira em vez de
          dentro da moldura da cena: a imagem em evidência costuma ser um
          documento ou uma carta, e num retângulo de 16:9 no alto de um celular
          nada disso se lê.

          `dismissable` só aqui. O jogador tem também o mapa e a própria ficha,
          e uma imagem que ele não pudesse encostar de lado o deixaria preso até
          o mestre lembrar de tirá-la. Esconder é local: a imagem continua no ar
          para todo mundo. */}
      <SpotlightLayer spotlight={live.spotlight} dismissable />
    </main>
  );
}

type LayoutProps = { codigo: string; live: Subscription };

/**
 * Tela em pé: cena presa no topo, abas embaixo para o resto.
 *
 * A cena não é aba aqui porque não precisa ser — sobra altura para ela e para
 * o conteúdo ao mesmo tempo. Presa, e não rolando junto: perder o mapa de
 * vista ao consultar a própria ficha é o oposto do que serve numa mesa.
 */
function StackedLayout({ codigo, live }: LayoutProps) {
  const [tab, setTab] = useState<StackedTab>("personagem");
  const swipe = useSwipeTabs(STACKED_TABS, tab, setTab);

  return (
    <>
      <div className="shrink-0 p-2">
        <PlateiaStage
          scene={live.scene}
          portraits={live.portraits}
          medida={live.medida}
          synced={live.synced}
          stalled={live.stalled}
        />
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as StackedTab)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="min-h-0 flex-1" {...swipe}>
          <TabsContent value="personagem" className="h-full space-y-4 overflow-y-auto p-3">
            <CharacterPanel codigo={codigo} />
          </TabsContent>
        </div>

        <BottomBar>
          <TabsTrigger value="personagem">
            <User />
            Personagem
          </TabsTrigger>
        </BottomBar>
      </Tabs>
    </>
  );
}

/**
 * Quem o jogador é, e os personagens que o mestre entregou a ele.
 *
 * Os arquivos e as notas saíram do jogador e foram para o PERSONAGEM. Antes
 * ficavam pendurados na identidade de quem joga, e o mestre não tinha onde
 * amarrar uma miniatura: se o jogador não anexasse a ficha, ou a apagasse no
 * meio da campanha, não havia nada estável a que ligar.
 *
 * `PlayerIdentity` fica: o nome continua sendo dele.
 */
function CharacterPanel({ codigo }: { codigo: string }) {
  return (
    <PlayerGate codigo={codigo}>
      <PlayerIdentity codigo={codigo} />
      <MyCharacters codigo={codigo} />
    </PlayerGate>
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
    <div className="flex shrink-0 justify-center border-t p-1 select-none">
      <TabsList>{children}</TabsList>
    </div>
  );
}

/** Tela deitada: uma aba por vez, com arraste lateral e barra centralizada. */
function TabbedLayout({ codigo, live }: LayoutProps) {
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
          <PlateiaStage
            scene={live.scene}
            portraits={live.portraits}
            medida={live.medida}
            synced={live.synced}
            stalled={live.stalled}
          />
        </TabsContent>

        <TabsContent value="personagem" className="h-full space-y-4 overflow-y-auto p-3">
          <CharacterPanel codigo={codigo} />
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
      </BottomBar>
    </Tabs>
  );
}
