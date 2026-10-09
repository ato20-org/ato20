"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  FolderOpen,
  MessagesSquare,
  NotebookPen,
  User,
} from "lucide-react";

import logo from "@/assets/logo-white.png";

import { AnotacoesJogador } from "@/components/jogador/anotacoes-jogador";
import { ChatJogador } from "@/components/jogador/chat-jogador";
import { DadosNaTela } from "@/components/jogador/dados-na-tela";
import { MyCharacters } from "@/components/jogador/my-characters";
import { MochilaFlutuante } from "@/components/jogador/mochila-jogador";
import { BarraLateralDoJogador } from "@/components/jogador/barra-lateral-jogador";
import { JogadorStage } from "@/components/jogador/jogador-stage";
import {
  JogadorToolbar,
  ToolbarItem,
} from "@/components/jogador/jogador-toolbar";
import { SaquinhoFlutuante } from "@/components/jogador/saquinho-jogador";
import { PlayerEntrada } from "@/components/jogador/player-entrada";
import { PlayerMenu } from "@/components/jogador/player-menu";
import { SessionAudio } from "@/components/playground/session-audio";
import { SpotlightLayer } from "@/components/playground/spotlight-layer";
import {
  useSubscription,
  type Subscription,
} from "@/hooks/use-scene-broadcast";
import { useFioDoJogador } from "@/hooks/use-fio-do-jogador";
import { t } from "@/lib/i18n/jogador";
import { useFioStore } from "@/lib/store/use-fio-store";
import { usePlayerStore } from "@/lib/store/use-player-store";
import { cn } from "@/lib/utils";
import { useSwipeTabs } from "@/hooks/use-swipe-tabs";
import { useTabbedLayout } from "@/hooks/use-tabbed-layout";
import {
  DeclarativoProvider,
  useDeclarativoDaMesa,
} from "@/components/playground/declarativo";
import { useFichasVersaoStore } from "@/lib/store/use-fichas-versao-store";

/**
 * As abas da tela em pé, na ordem em que o arraste lateral navega.
 *
 * Só ela tem abas. Deitado o espaço dá para a cena e para as ferramentas ao
 * mesmo tempo, e lá o desenho é outro: trilhas nas bordas e gavetas por cima
 * do mapa — ver `LandscapeLayout`.
 */
// Na ordem da barra, que é a do deslizar: Personagem e Arquivos à esquerda do
// saquinho, Chat e Anotações à direita.
const STACKED_TABS = ["personagem", "arquivos", "chat", "anotacoes"] as const;

type StackedTab = (typeof STACKED_TABS)[number];



/**
 * A visão do jogador: a cena, e a ficha do personagem.
 *
 * A cena chega por SSE do daemon; a ficha, pelas rotas `/eu`. Continuam sendo
 * duas portas — o código da mesa dá acesso à cena, o nome cria a ficha —, mas
 * aqui as duas se atravessam de uma vez: esta tela é a de quem VAI jogar, e
 * quem só quer olhar o mapa tem `/espectador`, que nunca vira uma linha na
 * campanha do mestre.
 */
export function JogadorShell({
  codigo,
  nomeDaMesa,
}: {
  codigo: string;
  nomeDaMesa: string;
}) {
  const tabbed = useTabbedLayout();

  /**
   * Procura a credencial guardada assim que a tela abre.
   *
   * Aqui, e não dentro de uma aba: é o resultado disto que decide se a tela
   * mostra a mesa ou o campo do nome. A chamada é guardada contra repetição no
   * próprio store.
   */
  const boot = usePlayerStore((state) => state.boot);
  useEffect(() => {
    void boot(codigo);
  }, [boot, codigo]);

  /** Sem nome não há mesa: a tela inteira vira a porta de entrada. */
  const status = usePlayerStore((state) => state.status);
  const dentro = status === "dentro";

  // O fio da campanha, assinado aqui pelo mesmo motivo da cena logo abaixo: a
  // aba do chat desmontada não pode perder a conversa. Só com ficha — o fio é
  // do jogador, e não de quem só digitou o código.
  const eu = usePlayerStore((state) => state.sheet?.id);
  useFioDoJogador(codigo, dentro ? eu : undefined);

  // A inscrição vive aqui, e não dentro da aba Cena: aba inativa é desmontada,
  // e o jogador que fosse ver a ficha sairia do fluxo e perderia as trocas de
  // cena até voltar.
  const live = useSubscription(codigo);
  // Os estilos de medidor dos plugins, buscados quando a versão do quadro muda.
  const declarativo = useDeclarativoDaMesa(codigo, live.declarativoVersao);

  // A versão do elenco vai para um store, e não por prop: a ficha mora seis
  // camadas abaixo, em duas disposições de tela. Ver `useFichasVersaoStore`.
  const definirFichasVersao = useFichasVersaoStore((state) => state.definir);
  useEffect(() => {
    definirFichasVersao(live.fichasVersao);
  }, [definirFichasVersao, live.fichasVersao]);

  /**
   * Quem está com o retrato NO AR agora, por id de personagem.
   *
   * Sai do mesmo quadro que desenha a cena, e não de uma rota nova: o retrato
   * ligado é o que a mesa está vendo, e `visible` é o que separa o que está no
   * ar do que o mestre deixou posicionado para depois. Serve ao caderno, que
   * pinta de verde a menção de quem está na tela logo acima dele.
   *
   * Aqui e não dentro da aba, pelo mesmo motivo da inscrição: aba desmontada
   * perderia a conta e a refaria a cada volta.
   */
  const emCena = useMemo(
    () =>
      new Set(
        live.portraits
          .filter((retrato) => retrato.visible)
          .map((retrato) => retrato.personagemId),
      ),
    [live.portraits],
  );

  return (
    // `h-dvh` fixa a altura na viewport real do celular, já descontando a
    // barra do navegador.
    <main className="flex h-dvh min-w-0 flex-col overflow-hidden">
      {/* Só em pé. Deitado a altura é o que falta, e uma faixa que só diz o
          nome da mesa não é onde ela se gasta: o mapa fica com ela, e o menu
          do jogador (com o nome da mesa no topo) vai para a trilha direita. */}
      {/* A faixa de cima: de que mesa é, e quem joga com o menu (nome, idioma,
          sair). FINA deitado -- 32px em vez de 49 --, onde a altura é o que
          falta e a faixa só precisa dizer as duas coisas. */}
      <header
        className={cn(
          "flex shrink-0 items-center gap-2 border-b select-none",
          tabbed ? "px-3 py-0.5" : "px-4 py-2",
        )}
      >
        {/* A marca, e não o ícone de celular: o aparelho o jogador já sabe que
            tem na mão. O que a faixa precisa dizer é de que mesa isto é. */}
        <Image
          src={logo}
          alt="ATO20"
          priority
          className={cn("w-auto shrink-0 opacity-80", tabbed ? "h-3.5" : "h-4")}
        />
        {/* O nome da mesa, e não o código: quem já entrou não precisa mais do
            código, e precisa saber que entrou na mesa certa. */}
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-medium",
            tabbed ? "text-xs" : "text-sm",
          )}
        >
          {nomeDaMesa}
        </span>

        {/* Quem joga, no canto da faixa — e o menu de trocar de nome ou sair.
            Some sozinho enquanto não há jogador. */}
        <PlayerMenu codigo={codigo} />
      </header>

      {dentro ? (
        <DeclarativoProvider valor={declarativo}>
          {tabbed ? (
            <LandscapeLayout codigo={codigo} live={live} emCena={emCena} />
          ) : (
            <StackedLayout codigo={codigo} live={live} emCena={emCena} />
          )}
        </DeclarativoProvider>
      ) : (
        <PlayerEntrada codigo={codigo} />
      )}

      {/* Os dados, sobre a página inteira. O celular na mão é a mesa: o dado
          cai por cima do mapa, da ficha e dos arquivos, como um dado jogado
          sobre uma mesa cai sobre o que estiver nela. Fora das abas porque uma
          aba desmontada levaria a jogada junto no meio da queda.

          O saquinho que os joga não está mais aqui: ele virou a bolinha do meio
          da barra de baixo. */}
      {dentro ? (
        <>
          <DadosNaTela codigo={codigo} />

          {/* Fora das abas: a trilha não pode parar porque o jogador foi
              consultar a própria ficha. Música cortada no meio quebra a imersão
              que ela existe para criar. */}
          <SessionAudio
            track={live.track}
            ambientes={live.ambientes}
            disparos={live.disparos}
            volume={live.volume}
            volumeTrilha={live.volumeTrilha}
            volumeAmbiente={live.volumeAmbiente}
            volumeDisparo={live.volumeDisparo}
          />
        </>
      ) : null}

      {/* Fora das abas pelo mesmo motivo, e sobre a tela inteira em vez de
          dentro da moldura da cena: a imagem em evidência costuma ser um
          documento ou uma carta, e num retângulo de 16:9 no alto de um celular
          nada disso se lê.

          `dismissable` só aqui. O jogador tem também o mapa e a própria ficha,
          e uma imagem que ele não pudesse encostar de lado o deixaria preso até
          o mestre lembrar de tirá-la. Esconder é local: a imagem continua no ar
          para todo mundo. Nada disso antes de entrar: som e imagem em cima do
          campo do nome seriam a mesa falando com quem ainda não chegou. */}
      {dentro ? (
        <SpotlightLayer spotlight={live.spotlight} dismissable />
      ) : null}
    </main>
  );
}

type LayoutProps = {
  codigo: string;
  live: Subscription;
  /** Ver `emCena`, no `JogadorShell`. */
  emCena: Set<string>;
};

/**
 * Tela deitada: o mapa e, colada à direita, a barra lateral do jogador.
 *
 * O formato deitado é o da mesa: quem está com o celular de lado, ou no
 * monitor, está OLHANDO a cena. A barra lateral fica FIXA e junta em abas o
 * que é do jogador -- a ficha, a mochila, o chat, as notas, os arquivos. O
 * saquinho é uma bolinha que flutua sobre a cena, como a do Mestre, e se
 * arrasta para onde não atrapalha. Ver `BarraLateralDoJogador` e
 * `SaquinhoFlutuante`.
 */
function LandscapeLayout({ codigo, live, emCena }: LayoutProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="relative min-h-0 min-w-0 flex-1 p-1.5">
        <JogadorStage
          codigo={codigo}
          scene={live.scene}
          portraits={live.portraits}
          fichas={live.fichas}
          efeitos={live.efeitos}
          rolagens={live.rolagens}
          pings={live.pings}
          laser={live.laser}
          synced={live.synced}
          stalled={live.stalled}
        />
      </div>

      <BarraLateralDoJogador codigo={codigo} emCena={emCena} />

      {/* Abaixo da faixa fina de cima (~33px) e até perto do pé da tela. */}
      <SaquinhoFlutuante reservaEmcima={44} reservaEmbaixo={12} />
    </div>
  );
}

/**
 * Tela em pé: cena presa no topo, o resto embaixo.
 *
 * A cena não é aba aqui porque não precisa ser — sobra altura para ela e para
 * o conteúdo ao mesmo tempo. Presa, e não rolando junto: perder o mapa de
 * vista ao consultar a própria ficha é o oposto do que serve numa mesa.
 */
function StackedLayout({ codigo, live, emCena }: LayoutProps) {
  const [tab, setTab] = useState<StackedTab>("personagem");

  const swipe = useSwipeTabs(STACKED_TABS, tab, setTab);
  const naoLidas = useFioStore((state) => state.naoLidas);

  return (
    <>
      <div className="shrink-0 p-2">
        <JogadorStage
          codigo={codigo}
          scene={live.scene}
          portraits={live.portraits}
          fichas={live.fichas}
          efeitos={live.efeitos}
          rolagens={live.rolagens}
          pings={live.pings}
          laser={live.laser}
          synced={live.synced}
          stalled={live.stalled}
        />
      </div>

      <div className="min-h-0 flex-1" {...swipe}>
        <Painel codigo={codigo} tab={tab} emCena={emCena} />
      </div>

      {/* O inventário fora das abas: uma bolinha arrastável e o painel colado
          nela. Ver `MochilaFlutuante`. */}
      <MochilaFlutuante codigo={codigo} />

      <JogadorToolbar
        esquerda={
          <>
            <ToolbarItem
              ativo={tab === "personagem"}
              icone={<User />}
              rotulo={t.ferramentas.personagem}
              onClick={() => setTab("personagem")}
            />
            {/* Aba própria, e não o fim da aba Personagem: a ficha, o retrato e
                os anexos ficavam embaixo dos detalhes e do inventário, a várias
                rolagens de distância, e arquivo se abre uma vez por sessão. */}
            <ToolbarItem
              ativo={tab === "arquivos"}
              icone={<FolderOpen />}
              rotulo={t.ferramentas.arquivos}
              onClick={() => setTab("arquivos")}
            />
          </>
        }
        direita={
          <>
            <ToolbarItem
              ativo={tab === "chat"}
              icone={<MessagesSquare />}
              rotulo={t.ferramentas.chat}
              aviso={tab !== "chat" && naoLidas > 0}
              onClick={() => setTab("chat")}
            />
            <ToolbarItem
              ativo={tab === "anotacoes"}
              icone={<NotebookPen />}
              rotulo={t.ferramentas.anotacoes}
              onClick={() => setTab("anotacoes")}
            />
          </>
        }
      />
    </>
  );
}

/**
 * O que a aba escolhida mostra.
 *
 * Só a aba ativa é montada — era o que as `TabsContent` já faziam, e é o que
 * mantém um celular mediano longe de ter as duas listas de arquivos vivas ao
 * mesmo tempo.
 *
 * As anotações não rolam por fora: o campo é que ocupa a altura, e rolar é
 * dentro dele. Um caderno com duas barras de rolagem — a da página e a do
 * campo — é o tipo de coisa que só aparece depois que alguém escreveu duas
 * telas de texto no celular.
 */
function Painel({
  codigo,
  tab,
  emCena,
}: {
  codigo: string;
  tab: StackedTab;
  emCena: Set<string>;
}) {
  // `pb` maior que o resto: a bolinha do saquinho sobe metade para fora da
  // barra e cobre a faixa do meio logo acima dela. Sem a folga, a última linha
  // do caderno e o último arquivo da lista ficam atrás dela.
  if (tab === "anotacoes") {
    return (
      <div className="h-full p-3 pb-6">
        <AnotacoesJogador codigo={codigo} emCena={emCena} />
      </div>
    );
  }

  // Sem o recuo das outras abas nas laterais: a lista vai de borda a borda, e
  // o campo preso embaixo pede a folga da bolinha do saquinho, como o caderno.
  if (tab === "chat") {
    return (
      <div className="h-full pb-6">
        <ChatJogador codigo={codigo} emCena={emCena} />
      </div>
    );
  }

  if (tab === "arquivos") {
    return (
      <div className="h-full space-y-6 overflow-y-auto p-3 pb-10">
        <MyCharacters codigo={codigo} secao="arquivos" />
      </div>
    );
  }

  // Sem o esmaecido das bordas, ao contrário das outras áreas roláveis do
  // aplicativo: aqui embaixo é TEXTO de ficha, e no celular a máscara apagava
  // justamente a primeira e a última linha do que se foi ler. Numa lista de
  // cartões o degradê insinua que há mais coisa; num parágrafo ele parece
  // borrão de tela. Ver `useScrollFade`, que é a versão que mede antes de
  // esmaecer -- e que aqui também não serve, porque o problema não é a caixa
  // não rolar, é o conteúdo ser leitura.
  return (
    // Sem recuo no alto: o nome do personagem prende no topo da rolagem, e o
    // recuo deixaria uma faixa de texto passando por cima dele.
    <div className="h-full overflow-y-auto px-3 pb-10">
      <MyCharacters codigo={codigo} />
    </div>
  );
}
