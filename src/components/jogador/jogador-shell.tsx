"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Dices, FolderOpen, NotebookPen, Package, User } from "lucide-react";

import logo from "@/assets/logo-white.png";

import { AnotacoesJogador } from "@/components/jogador/anotacoes-jogador";
import { DadosNaTela } from "@/components/jogador/dados-na-tela";
import { MyCharacters } from "@/components/jogador/my-characters";
import { JogadorStage } from "@/components/jogador/jogador-stage";
import {
  JogadorToolbar,
  ToolbarItem,
} from "@/components/jogador/jogador-toolbar";
import { Dock, DockButton, Drawer } from "@/components/jogador/jogador-rails";
import { ConteudoDoSaquinho } from "@/components/jogador/saquinho-jogador";
import { PlayerEntrada } from "@/components/jogador/player-entrada";
import { PlayerMenu } from "@/components/jogador/player-menu";
import { SessionAudio } from "@/components/playground/session-audio";
import { SpotlightLayer } from "@/components/playground/spotlight-layer";
import {
  useSubscription,
  type Subscription,
} from "@/hooks/use-scene-broadcast";
import { usePlayerStore } from "@/lib/store/use-player-store";
import { cn } from "@/lib/utils";
import { useSwipeTabs } from "@/hooks/use-swipe-tabs";
import { useTabbedLayout } from "@/hooks/use-tabbed-layout";

/**
 * As abas da tela em pé, na ordem em que o arraste lateral navega.
 *
 * Só ela tem abas. Deitado o espaço dá para a cena e para as ferramentas ao
 * mesmo tempo, e lá o desenho é outro: trilhas nas bordas e gavetas por cima
 * do mapa — ver `LandscapeLayout`.
 */
const STACKED_TABS = ["personagem", "anotacoes"] as const;

type StackedTab = (typeof STACKED_TABS)[number];

/** As ferramentas das trilhas da tela deitada. */
const FERRAMENTAS = {
  personagem: { lado: "esquerda", rotulo: "Personagem", icone: <User /> },
  inventario: { lado: "esquerda", rotulo: "Inventário", icone: <Package /> },
  arquivos: { lado: "esquerda", rotulo: "Arquivos", icone: <FolderOpen /> },
  dados: { lado: "direita", rotulo: "Saquinho", icone: <Dices /> },
  anotacoes: { lado: "direita", rotulo: "Anotações", icone: <NotebookPen /> },
} as const;

type Ferramenta = keyof typeof FERRAMENTAS;

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

  // A inscrição vive aqui, e não dentro da aba Cena: aba inativa é desmontada,
  // e o jogador que fosse ver a ficha sairia do fluxo e perderia as trocas de
  // cena até voltar.
  const live = useSubscription(codigo);

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
      {/* Baixo quando deitado: 40px em vez de 48. A altura é o que falta nesse
          formato, e uma faixa que só diz o nome da mesa não é onde ela se
          gasta. */}
      <header
        className={cn(
          "flex shrink-0 items-center gap-2 border-b px-4 select-none",
          tabbed ? "py-1.5" : "py-2",
        )}
      >
        {/* A marca, e não o ícone de celular: o aparelho o jogador já sabe que
            tem na mão. O que a faixa precisa dizer é de que mesa isto é. */}
        <Image
          src={logo}
          alt="ATO20"
          priority
          className="h-4 w-auto shrink-0 opacity-80"
        />
        {/* O nome da mesa, e não o código: quem já entrou não precisa mais do
            código, e precisa saber que entrou na mesa certa. */}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {nomeDaMesa}
        </span>

        {/* Quem joga, no canto da faixa — e o menu de trocar de nome ou sair.
            Some sozinho enquanto não há jogador. */}
        <PlayerMenu codigo={codigo} />
      </header>

      {dentro ? (
        tabbed ? (
          <LandscapeLayout codigo={codigo} live={live} emCena={emCena} />
        ) : (
          <StackedLayout codigo={codigo} live={live} emCena={emCena} />
        )
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
 * Tela deitada: a cena ocupa tudo, e as ferramentas vivem nas bordas.
 *
 * O formato deitado é o da mesa: quem está com o celular de lado, ou no
 * monitor, está OLHANDO a cena — e tudo o que não é ela é ferramenta. Por isso
 * aqui não há aba nem painel fixo: duas docas flutuantes seguram cinco
 * ferramentas nas bordas, e o mapa fica com a tela inteira por baixo delas.
 *
 * Uma gaveta por vez, e as duas trilhas dividem o mesmo estado. Duas gavetas
 * abertas ao mesmo tempo cercariam a cena pelos dois lados, que é exatamente o
 * que os painéis fixos faziam de errado. Tocar na ferramenta aberta fecha —
 * o mesmo botão que abriu.
 */
function LandscapeLayout({ codigo, live, emCena }: LayoutProps) {
  const [aberta, setAberta] = useState<Ferramenta | null>(null);

  /**
   * O botão do saquinho na doca — que aqui é a BOCA dele.
   *
   * Deitado não há bolinha: o saquinho é este botão da borda, e a gaveta que
   * ele abre é o interior. Recolher suga os dados para cá, e não para o botão
   * de recolher lá dentro — o dado entra pela boca, e a boca é o que continua à
   * vista com a gaveta aberta.
   */
  const botaoDoSaquinho = useRef<HTMLButtonElement>(null);

  function bocaDoSaquinho(): { clientX: number; clientY: number } | undefined {
    const rect = botaoDoSaquinho.current?.getBoundingClientRect();
    if (!rect) return undefined;

    return {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
  }

  function alternar(ferramenta: Ferramenta) {
    setAberta((atual) => (atual === ferramenta ? null : ferramenta));
  }

  function botoes(lado: "esquerda" | "direita") {
    return (Object.keys(FERRAMENTAS) as Ferramenta[])
      .filter((chave) => FERRAMENTAS[chave].lado === lado)
      .map((chave) => (
        <DockButton
          key={chave}
          ref={chave === "dados" ? botaoDoSaquinho : undefined}
          ativo={aberta === chave}
          rotulo={FERRAMENTAS[chave].rotulo}
          icone={FERRAMENTAS[chave].icone}
          onClick={() => alternar(chave)}
        />
      ));
  }

  return (
    // `relative`: é a moldura em que as docas e a gaveta se posicionam. A cena
    // ocupa tudo por baixo — o jogador confere a ficha sem perder de vista o
    // que está acontecendo no mapa.
    <div className="relative min-h-0 min-w-0 flex-1 p-2">
      <JogadorStage
        scene={live.scene}
        portraits={live.portraits}
        rolagens={live.rolagens}
        synced={live.synced}
        stalled={live.stalled}
      />

      <Dock lado="esquerda">{botoes("esquerda")}</Dock>
      <Dock lado="direita">{botoes("direita")}</Dock>

      {aberta ? (
        <Drawer
          lado={FERRAMENTAS[aberta].lado}
          titulo={FERRAMENTAS[aberta].rotulo}
          icone={FERRAMENTAS[aberta].icone}
          onFechar={() => setAberta(null)}
        >
          <ConteudoDaFerramenta
            codigo={codigo}
            ferramenta={aberta}
            emCena={emCena}
            bocaDoSaquinho={bocaDoSaquinho}
          />
        </Drawer>
      ) : null}
    </div>
  );
}

/** O que cada gaveta mostra. */
function ConteudoDaFerramenta({
  codigo,
  ferramenta,
  emCena,
  bocaDoSaquinho,
}: {
  codigo: string;
  ferramenta: Ferramenta;
  emCena: Set<string>;
  /** Para onde os dados são sugados ao recolher. Ver `LandscapeLayout`. */
  bocaDoSaquinho: () => { clientX: number; clientY: number } | undefined;
}) {
  if (ferramenta === "dados")
    return <ConteudoDoSaquinho boca={bocaDoSaquinho} />;
  if (ferramenta === "anotacoes")
    return <AnotacoesJogador codigo={codigo} emCena={emCena} />;

  // As três do personagem são o mesmo componente, cada uma pedindo o seu
  // pedaço: a ficha com o retrato, o inventário, os arquivos.
  return <MyCharacters codigo={codigo} secao={ferramenta} />;
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

  return (
    <>
      <div className="shrink-0 p-2">
        <JogadorStage
          scene={live.scene}
          portraits={live.portraits}
          rolagens={live.rolagens}
          synced={live.synced}
          stalled={live.stalled}
        />
      </div>

      <div className="min-h-0 flex-1" {...swipe}>
        <Painel codigo={codigo} tab={tab} emCena={emCena} />
      </div>

      <JogadorToolbar
        esquerda={
          <ToolbarItem
            ativo={tab === "personagem"}
            icone={<User />}
            rotulo="Personagem"
            onClick={() => setTab("personagem")}
          />
        }
        direita={
          <ToolbarItem
            ativo={tab === "anotacoes"}
            icone={<NotebookPen />}
            rotulo="Anotações"
            onClick={() => setTab("anotacoes")}
          />
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

  // Sem o esmaecido das bordas, ao contrário das outras áreas roláveis do
  // aplicativo: aqui embaixo é TEXTO de ficha, e no celular a máscara apagava
  // justamente a primeira e a última linha do que se foi ler. Numa lista de
  // cartões o degradê insinua que há mais coisa; num parágrafo ele parece
  // borrão de tela. Ver `useScrollFade`, que é a versão que mede antes de
  // esmaecer -- e que aqui também não serve, porque o problema não é a caixa
  // não rolar, é o conteúdo ser leitura.
  return (
    <div className="h-full space-y-4 overflow-y-auto p-3 pb-10">
      <MyCharacters codigo={codigo} />
    </div>
  );
}
