"use client";

import { Backpack, FolderOpen, IdCard, MessagesSquare, NotebookPen, Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { AnotacoesJogador } from "@/components/jogador/anotacoes-jogador";
import { ChatJogador } from "@/components/jogador/chat-jogador";
import { PontoDeAviso } from "@/components/jogador/jogador-toolbar";
import { BuscaDoJogador } from "@/components/jogador/busca-do-jogador";
import { ConteudoDaMochila } from "@/components/jogador/mochila-jogador";
import { MyCharacters } from "@/components/jogador/my-characters";
import { usePersonagensDoJogador } from "@/hooks/use-personagens-do-jogador";
import { t } from "@/lib/i18n/jogador";
import { useFioStore } from "@/lib/store/use-fio-store";
import { cn } from "@/lib/utils";

type Aba = "personagem" | "mochila" | "chat" | "anotacoes" | "arquivos";

const ABAS: Record<Aba, { rotulo: string; icone: ReactNode }> = {
  personagem: { rotulo: t.ferramentas.personagem, icone: <IdCard /> },
  mochila: { rotulo: t.mochila.titulo, icone: <Backpack /> },
  chat: { rotulo: t.ferramentas.chat, icone: <MessagesSquare /> },
  anotacoes: { rotulo: t.ferramentas.anotacoes, icone: <NotebookPen /> },
  arquivos: { rotulo: t.ferramentas.arquivos, icone: <FolderOpen /> },
};

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
  const personagens = usePersonagensDoJogador(codigo);
  const soChat = personagens !== null && personagens.length === 0;

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
    return <aside className="bg-background w-[min(22.75rem,42%)] shrink-0 border-l" />;
  }

  if (soChat) {
    return (
      <aside className="bg-background flex w-[min(22.75rem,42%)] shrink-0 flex-col border-l">
        <div className="min-h-0 flex-1">
          <ChatJogador codigo={codigo} emCena={emCena} />
        </div>
      </aside>
    );
  }

  return (
    <aside className="bg-background flex w-[min(22.75rem,42%)] shrink-0 border-l">
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
  );
}
