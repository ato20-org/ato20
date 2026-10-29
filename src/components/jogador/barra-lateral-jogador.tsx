"use client";

import { Backpack, FolderOpen, IdCard, MessagesSquare, NotebookPen, Search } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { AnotacoesJogador } from "@/components/jogador/anotacoes-jogador";
import { ChatJogador } from "@/components/jogador/chat-jogador";
import { PontoDeAviso } from "@/components/jogador/jogador-toolbar";
import { BuscaDoJogador } from "@/components/jogador/busca-do-jogador";
import { ConteudoDaMochila } from "@/components/jogador/mochila-jogador";
import { MyCharacters } from "@/components/jogador/my-characters";
import { Splitter } from "@/components/mestre/dock/splitter";
import { usePersonagensDoJogador } from "@/hooks/use-personagens-do-jogador";
import { t } from "@/lib/i18n/jogador";
import { useFioStore } from "@/lib/store/use-fio-store";
import { useFocoNoDetalhe } from "@/lib/store/use-foco-no-detalhe";
import { cn } from "@/lib/utils";

type Aba = "personagem" | "mochila" | "chat" | "anotacoes" | "arquivos";

const ABAS: Record<Aba, { rotulo: string; icone: ReactNode }> = {
  personagem: { rotulo: t.ferramentas.personagem, icone: <IdCard /> },
  mochila: { rotulo: t.mochila.titulo, icone: <Backpack /> },
  chat: { rotulo: t.ferramentas.chat, icone: <MessagesSquare /> },
  anotacoes: { rotulo: t.ferramentas.anotacoes, icone: <NotebookPen /> },
  arquivos: { rotulo: t.ferramentas.arquivos, icone: <FolderOpen /> },
};

/** Onde o aparelho lembra a largura que o jogador deu à barra. */
const CHAVE_DA_LARGURA = "ato20:jogador:largura-da-barra";
/** Mais estreita que isto, a faixa dos atributos e as abas da ficha espremem. */
const LARGURA_MIN = 240;
/** Nem mais larga que esta fração da tela: deitado, o que se olha é o mapa. */
const FRACAO_MAX = 0.7;
/** A largura de fábrica, a de antes de a barra se arrastar. */
const LARGURA_PADRAO = "w-[min(22.75rem,42%)]";

/**
 * A largura escolhida, em CSS, presa entre o mínimo e a fração da tela.
 *
 * O teto em PORCENTAGEM, e não calculado no arrasto: girar o celular ou
 * estreitar a janela depois não deixa a barra comer o mapa, sem nenhum código
 * escutando o tamanho da tela.
 */
function larguraEmCss(px: number): string {
  return `clamp(${LARGURA_MIN}px, ${px}px, ${FRACAO_MAX * 100}%)`;
}

function larguraGuardada(): number | null {
  try {
    const valor = Number(window.localStorage.getItem(CHAVE_DA_LARGURA));
    return Number.isFinite(valor) && valor > 0 ? valor : null;
  } catch {
    return null;
  }
}

function guardarLargura(px: number | null) {
  try {
    if (px === null) window.localStorage.removeItem(CHAVE_DA_LARGURA);
    else window.localStorage.setItem(CHAVE_DA_LARGURA, String(px));
  } catch {
    // Sem onde guardar, a largura vale só nesta página.
  }
}

/** Tela de toque: sem ponteiro que paire, a alça não teria como acender. */
function useSemHover(): boolean {
  return useSyncExternalStore(
    (aviso) => {
      const consulta = window.matchMedia("(hover: none)");
      consulta.addEventListener("change", aviso);
      return () => consulta.removeEventListener("change", aviso);
    },
    () => window.matchMedia("(hover: none)").matches,
    () => false,
  );
}

/**
 * A barra lateral FIXA da tela deitada: colada à direita, da cor da faixa de
 * cima, com as abas numa faixa VERTICAL de ícones na borda -- a ficha, a
 * mochila, o chat, as anotações e os arquivos. Vertical, e não no alto: o alto é onde a
 * busca da ficha prende, e uma fileira de abas em cima dela comia mais uma
 * linha de uma tela que já é baixa deitada.
 *
 * Fixa porque é o que se consulta o tempo todo; em abas porque são coisas do
 * mesmo jogador, e uma barra de ícones para cada uma espalhava pela tela o que
 * mora junto. O saquinho, que é de passagem, flutua sobre a cena.
 *
 * Sem cartão nem sombra: é uma coluna da tela, como a faixa de cima é uma
 * linha, e não um painel por cima do mapa. A divisa é uma borda só.
 *
 * Sem personagem, a barra é só o chat: ficha, mochila, caderno e arquivos são
 * todos de um personagem, e quatro abas dizendo "nenhum personagem ainda" eram
 * quatro jeitos de mostrar o vazio. As abas aparecem sozinhas quando o mestre
 * entregar um. Ver `usePersonagensDoJogador`.
 *
 * A LARGURA é do jogador: a divisa com o mapa se arrasta, e o aparelho lembra.
 * Quem lê a ficha no tablet quer a barra larga; quem joga no celular deitado,
 * o mapa grande. Duplo clique na divisa volta à largura de fábrica.
 */
export function BarraLateralDoJogador({
  codigo,
  emCena,
}: {
  codigo: string;
  /** Ver `emCena`, no `JogadorShell`. */
  emCena: Set<string>;
}) {
  const [aba, setAba] = useState<Aba>("personagem");
  const [buscando, setBuscando] = useState(false);
  const naoLidas = useFioStore((state) => state.naoLidas);

  // A busca achou um detalhe e mandou a ficha mostrá-lo: volta para a aba
  // Personagem, senão o salto e a piscada aconteceriam numa aba escondida. Pelo
  // `pedido`, que só sobe, e não pelo alvo, que a ficha apaga ao atender. Ver
  // `useFocoNoDetalhe`.
  const pedidoDeFoco = useFocoNoDetalhe((state) => state.pedido);
  const focoVisto = useRef(pedidoDeFoco);
  useEffect(() => {
    if (pedidoDeFoco === focoVisto.current) return;
    focoVisto.current = pedidoDeFoco;
    setAba("personagem");
  }, [pedidoDeFoco]);
  const personagens = usePersonagensDoJogador(codigo);
  const soChat = personagens !== null && personagens.length === 0;

  // Lida no primeiro render, e não num efeito: esta barra só monta depois de o
  // jogador entrar, que já é cliente -- não há HTML pré-renderizado com que
  // discordar, e ler depois piscaria a largura de fábrica antes da escolhida.
  const [largura, setLargura] = useState<number | null>(larguraGuardada);
  const barra = useRef<HTMLElement>(null);
  const noArrasto = useRef<{ inicio: number; atual: number } | null>(null);
  const semHover = useSemHover();

  const larguraDaBarra = largura === null ? LARGURA_PADRAO : undefined;
  const estiloDaBarra = largura === null ? undefined : { width: larguraEmCss(largura) };

  // O mesmo divisor das docas do Mestre. Durante o arrasto a largura vai
  // direto no elemento, e não no estado: a ficha é a parte mais pesada da
  // tela, e redesenhá-la a cada amostra do dedo engasgaria o arrasto. O estado
  // só recebe o valor ao soltar.
  const divisor = (
    <div
      className="flex"
      onDoubleClick={() => {
        if (barra.current) barra.current.style.width = "";
        setLargura(null);
        guardarLargura(null);
      }}
    >
      <Splitter
        direcao="vertical"
        rotulo={t.barraLateral.largura}
        aparente={semHover}
        aoArrastar={({ x }) => {
          const elemento = barra.current;
          if (!elemento) return;

          noArrasto.current ??= {
            inicio: elemento.getBoundingClientRect().width,
            atual: 0,
          };
          const tela = elemento.parentElement?.clientWidth ?? window.innerWidth;
          // Para a esquerda, `x` é negativo e a barra cresce.
          const nova = Math.round(
            Math.min(Math.max(noArrasto.current.inicio - x, LARGURA_MIN), tela * FRACAO_MAX),
          );

          noArrasto.current.atual = nova;
          elemento.style.width = larguraEmCss(nova);
        }}
        aoSoltar={() => {
          const final = noArrasto.current?.atual;
          noArrasto.current = null;
          if (!final) return;

          setLargura(final);
          guardarLargura(final);
        }}
      />
    </div>
  );

  // Ctrl+K (ou Cmd+K) abre a busca de qualquer lugar da tela, como nas
  // paletas de comando. Sem personagem, não há ficha nem mochila onde procurar.
  useEffect(() => {
    if (soChat) return;

    const aoTeclar = (evento: KeyboardEvent) => {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === "k") {
        evento.preventDefault();
        setBuscando(true);
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [soChat]);

  // Antes da primeira leitura, a coluna vazia: mostrar as abas e tirá-las um
  // instante depois, ou o contrário, piscaria a barra inteira ao abrir.
  if (personagens === null) {
    return (
      <>
        {divisor}
        <aside
          ref={barra}
          className={cn("bg-background shrink-0 border-l", larguraDaBarra)}
          style={estiloDaBarra}
        />
      </>
    );
  }

  if (soChat) {
    return (
      <>
        {divisor}
        <aside
          ref={barra}
          className={cn("bg-background flex shrink-0 flex-col border-l", larguraDaBarra)}
          style={estiloDaBarra}
        >
          <div className="min-h-0 flex-1">
            <ChatJogador codigo={codigo} emCena={emCena} />
          </div>
        </aside>
      </>
    );
  }

  return (
    <>
      {divisor}
      <aside
        ref={barra}
        className={cn("bg-background flex shrink-0 border-l", larguraDaBarra)}
        style={estiloDaBarra}
      >
        <div role="tabpanel" className="flex min-h-0 min-w-0 flex-1 flex-col">
          {aba === "personagem" ? (
            // Sem recuo no alto: a busca do cartão prende no topo da rolagem.
            // Sem a busca presa no alto: ela é o ícone da faixa, e abre no meio.
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              <MyCharacters codigo={codigo} comBusca={false} />
            </div>
          ) : aba === "mochila" ? (
            <ConteudoDaMochila codigo={codigo} />
          ) : aba === "chat" ? (
            // De borda a borda, com o campo preso embaixo: o chat rola por dentro.
            <div className="min-h-0 flex-1">
              <ChatJogador codigo={codigo} emCena={emCena} />
            </div>
          ) : aba === "anotacoes" ? (
            // O caderno rola por dentro e tem o campo preso embaixo.
            <div className="min-h-0 flex-1 p-3">
              <AnotacoesJogador codigo={codigo} emCena={emCena} />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <MyCharacters codigo={codigo} secao="arquivos" />
            </div>
          )}
        </div>

        {/* As abas, de cima para baixo, na borda: ícone e o nome em letra miúda,
            que é o que ensina na primeira vez. A escolhida ganha fundo e um traço
            do lado do conteúdo. */}
        <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-l py-1.5">
          {/* A busca em primeiro, separada das abas: não é uma aba, abre por
              cima de tudo no meio da tela. Ver `BuscaDoJogador`. */}
          <button
            type="button"
            title={t.busca.abrir}
            aria-label={t.busca.abrir}
            aria-haspopup="dialog"
            onClick={() => setBuscando(true)}
            className="text-muted-foreground hover:text-foreground hover:bg-accent/60 grid size-9 place-items-center rounded-md [&_svg]:size-[18px]"
          >
            <Search />
          </button>
          <span aria-hidden className="bg-border my-0.5 h-px w-6" />

          <div
            role="tablist"
            aria-orientation="vertical"
            aria-label={t.barraLateral.rotulo}
            className="flex flex-col items-center gap-1"
          >
            {(Object.keys(ABAS) as Aba[]).map((chave) => (
              <button
                key={chave}
                type="button"
                role="tab"
                aria-selected={aba === chave}
                title={ABAS[chave].rotulo}
                aria-label={ABAS[chave].rotulo}
                onClick={() => setAba(chave)}
                className={cn(
                  "relative flex w-11 flex-col items-center gap-0.5 rounded-md px-0.5 py-1.5 text-[9px] leading-none font-medium transition-colors [&_svg]:size-[18px]",
                  aba === chave
                    ? "bg-accent text-accent-foreground before:bg-foreground before:absolute before:inset-y-1.5 before:-left-0.5 before:w-0.5 before:rounded-full"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {ABAS[chave].icone}
                <span aria-hidden className="max-w-full truncate">
                  {t.barraLateral.curtos[chave]}
                </span>
                {/* A conversa andou enquanto o jogador olhava outra aba. */}
                {chave === "chat" && aba !== "chat" && naoLidas > 0 ? (
                  <PontoDeAviso className="top-1 right-2" />
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <BuscaDoJogador codigo={codigo} aberta={buscando} onFechar={() => setBuscando(false)} />
      </aside>
    </>
  );
}
