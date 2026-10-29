"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Clapperboard, Maximize2, Minimize2, Minus, X } from "lucide-react";

import logo from "@/assets/logo-white.png";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { isDesktop } from "@/lib/vault/bridge";
import { comum } from "@/lib/i18n/comum";
import { t } from "@/lib/i18n/desktop";
import { cn } from "@/lib/utils";

/**
 * O tipo do crate nao e exportado pelo pacote, so declarado. Repetir a uniao
 * aqui e melhor que um `string` solto: se o Tauri renomear uma direcao, o
 * compilador aponta o lugar.
 */
type ResizeDirection =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

/**
 * Rodando dentro do aplicativo, de forma segura para hidratacao.
 *
 * `useSyncExternalStore` e nao `useEffect` + `setState`: isto nao e estado que
 * muda, e uma leitura do ambiente. O snapshot do servidor e `false`, que e o
 * que o HTML pre-renderizado contem, e o do cliente e a verdade -- que e
 * exatamente o problema que este hook existe para resolver. A funcao de
 * inscricao nao faz nada porque a resposta nunca muda durante a vida da aba.
 */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => isDesktop(),
    () => false,
  );
}

/**
 * A barra da janela, desenhada pelo aplicativo.
 *
 * A janela roda sem decoração do sistema (`decorations: false`), então tudo o
 * que uma barra de título faz — arrastar, minimizar, maximizar, fechar — passa
 * a ser responsabilidade daqui. E, junto, o que ninguém lembra até perder:
 * **redimensionar pelas bordas**, que a decoração do sistema dava de graça.
 *
 * Barra própria e fina, em vez de embutir os botões no cabeçalho do Mestre.
 * O cabeçalho de lá tem `flex-wrap` para quebrar em duas linhas em janela
 * estreita, e um botão de fechar que muda de lugar conforme a largura é o tipo
 * de coisa que se clica por engano. Aqui ele não se move.
 *
 * Só existe dentro do aplicativo: no navegador não há janela para controlar.
 */
export function WindowChrome({
  inicio,
  acoes,
  subtitulo,
  confirmarFechar,
}: {
  /** Vai à direita do nome, na ponta esquerda da barra. */
  inicio?: React.ReactNode;
  /**
   * Vai à esquerda dos botões da janela, na ponta direita da barra.
   *
   * Slot separado do `inicio` porque o lado da barra é o assunto: à esquerda
   * fica o que a janela É — hoje a campanha —, e aqui o que se FAZ com ela.
   * Configurações mora deste lado pelo mesmo motivo que minimizar e fechar: é
   * da máquina e da janela, não da mesa aberta.
   */
  acoes?: React.ReactNode;
  subtitulo?: string;
  /**
   * Pergunta antes de fechar a janela.
   *
   * Com a campanha aberta, fechar a janela encerra o aplicativo e o daemon
   * junto: a TV e os celulares caem no meio da sessão. E o botão de fechar é
   * o vizinho imediato do maximizar, então o clique por engano acontece.
   */
  confirmarFechar?: boolean;
}) {
  const noApp = useIsDesktop();
  const [maximizada, setMaximizada] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (!noApp) return;

    const janela = getCurrentWindow();

    void janela.isMaximized().then(setMaximizada, () => {});

    // O estado também muda por fora daqui: atalho do sistema, arrastar para o
    // topo, tecla do gerenciador de janelas. Sem escutar, o ícone mentiria.
    const parar = janela.onResized(() => {
      void janela.isMaximized().then(setMaximizada, () => {});
    });

    return () => {
      void parar.then((cancelar) => cancelar());
    };
  }, [noApp]);

  if (!noApp) return null;

  const janela = getCurrentWindow();

  function fechar() {
    if (confirmarFechar) setConfirmando(true);
    else void janela.close();
  }

  return (
    <>
      {/* Não com a janela maximizada: não há o que redimensionar, e as faixas
          roubariam 4px de clique nas beiradas dos painéis do Mestre -- onde
          moram barras de rolagem -- sem oferecer nada em troca. */}
      {maximizada ? null : <ResizeEdges />}

      <div
        // `data-tauri-drag-region` é o que faz arrastar funcionar: o Tauri
        // intercepta o gesto no elemento e pede a movimentação da janela ao
        // sistema. Precisa da permissão `core:window:allow-start-dragging`.
        data-tauri-drag-region
        className="bg-muted/40 flex h-8 shrink-0 items-center gap-2 border-b px-3 select-none"
        // Duplo clique maximiza, como em qualquer barra de título. O Tauri não
        // faz isso sozinho num elemento de arraste.
        onDoubleClick={() => void janela.toggleMaximize()}
      >
        {/* As duas pontas com `flex-1` -- base zero e o mesmo crescimento --, e
            o centro só com o tamanho dele. O que sobra da janela se divide
            igual entre as pontas, então o centro cai no meio EXATO da janela, e
            não no meio do espaço entre elas: um nome de campanha comprido não o
            arrasta mais para a direita.
            E sem `min-w-0` nas pontas, de propósito: o mínimo automático de um
            item flex é o conteúdo dele, então a ponta que não cabe na metade
            cresce, e o centro anda só o que falta para não encostar. Numa
            janela estreita demais até para isso, quem encolhe é o centro, que
            corta o nome com reticências. A primeira versão usava posição
            absoluta para acertar o meio, e numa janela de 830px o texto passava
            por cima do nome da campanha -- num gerenciador de janelas de
            mosaico o `minWidth` é ignorado, então "estreito" acontece de
            verdade.
            O `data-tauri-drag-region` vai em cada ponta porque o Tauri só
            arrasta pelo elemento que tem o atributo, e o vão vazio de cada
            ponta agora é dela, não da barra. */}
        <div data-tauri-drag-region className="flex flex-1 items-center gap-2">
          {/* Só o logo, sem o nome escrito ao lado nem a versão.

              A barra juntava sete coisas antes do meio, e duas diziam o que o
              logo já diz. A versão mudou de casa: está no rótulo do "O que
              mudou" e no topo do diálogo dele, que é onde quem vai relatar um
              problema acaba de qualquer jeito, e no Sobre das Configurações.

              `pointer-events-none` no logo pelo mesmo motivo do subtitulo: uma
              imagem no meio da faixa de arraste roubaria o gesto. */}
          <span data-tauri-drag-region className="flex shrink-0 items-center">
            <Image
              src={logo}
              alt="ATO20"
              priority
              className="pointer-events-none h-3.5 w-auto opacity-70"
            />
          </span>
          {inicio}
        </div>

        {/* Centro da barra: o que está sendo editado.
            `pointer-events-none` para o texto não roubar o gesto de arrastar:
            sem ele, o alvo do clique seria este span, e a janela só se moveria
            pelas beiradas.
            Só o nome da cena, sem "Editando" na frente: a claquete já diz que é
            a cena aberta, e a palavra era a mais larga da barra inteira. */}
        <span data-tauri-drag-region className="flex min-w-0 items-center">
          {subtitulo ? (
            <span className="pointer-events-none flex min-w-0 items-center gap-1.5 text-xs">
              <Clapperboard
                className="text-muted-foreground size-3.5 shrink-0"
                aria-hidden
              />
              <span className="truncate">{subtitulo}</span>
            </span>
          ) : null}
        </span>

        <div
          data-tauri-drag-region
          className="flex flex-1 items-center justify-end"
        >
          {acoes}

          <ChromeButton
            label={t.janela.minimizar}
            onClick={() => void janela.minimize()}
            icon={<Minus className="size-3.5" />}
          />
          <ChromeButton
            label={maximizada ? t.janela.restaurar : t.janela.maximizar}
            onClick={() => void janela.toggleMaximize()}
            icon={
              maximizada ? (
                <Minimize2 className="size-3.5" />
              ) : (
                <Maximize2 className="size-3.5" />
              )
            }
          />
          <ChromeButton
            label={t.janela.fechar}
            // Vermelho só neste: é o único irreversível dos três, e é o vizinho
            // imediato do maximizar.
            className="hover:bg-destructive hover:text-destructive-foreground"
            onClick={fechar}
            icon={<X className="size-3.5" />}
          />
        </div>
      </div>

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.janela.confirmarFechar}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.janela.confirmarFecharExplicacao}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>{comum.cancelar}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void janela.close()}>
              {t.janela.fechar}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Um botão da barra da janela.
 *
 * Exportado porque o slot `acoes` precisa do MESMO botão: um controle com outro
 * tamanho ou outro arredondamento ao lado de minimizar leria como coisa de
 * outro lugar que caiu ali.
 *
 * Repassa o resto das props ao `<button>` para poder ser o gatilho de um menu
 * ou de um diálogo -- o `render` do base-ui injeta `onClick`, `aria-expanded` e
 * a referência, e sem o repasse eles se perderiam e o gatilho não abriria nada.
 */
export function ChromeButton({
  label,
  icon,
  className,
  ...rest
}: {
  label: string;
  icon: React.ReactNode;
} & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      // Alvo de 32x28 e sem arredondamento: são botões de barra de título, e o
      // que se espera deles é a faixa inteira reagindo, não uma pílula.
      className={cn(
        "hover:bg-accent focus-visible:ring-ring grid h-7 w-8 place-items-center transition-colors focus-visible:ring-2 focus-visible:outline-none",
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}

/**
 * As bordas de redimensionar.
 *
 * Uma janela sem decoração perde os cantos e as laterais que o gerenciador de
 * janelas oferecia, e no Linux ela simplesmente para de redimensionar — o que é
 * pior que não ter barra própria. São oito áreas invisíveis, sobrepostas por
 * cima de tudo, cada uma pedindo ao sistema o arraste na direção dela.
 *
 * 4px nas laterais e 8px nos cantos: fino o bastante para não roubar clique de
 * quem mira um botão na beirada, largo o bastante para o ponteiro achar.
 */
function ResizeEdges() {
  const janela = getCurrentWindow();

  const arestas: Array<{
    dir: ResizeDirection;
    className: string;
    cursor: string;
  }> = [
    {
      dir: "North",
      className: "top-0 right-2 left-2 h-1",
      cursor: "cursor-n-resize",
    },
    {
      dir: "South",
      className: "bottom-0 right-2 left-2 h-1",
      cursor: "cursor-s-resize",
    },
    {
      dir: "West",
      className: "top-2 bottom-2 left-0 w-1",
      cursor: "cursor-w-resize",
    },
    {
      dir: "East",
      className: "top-2 right-0 bottom-2 w-1",
      cursor: "cursor-e-resize",
    },
    {
      dir: "NorthWest",
      className: "top-0 left-0 size-2",
      cursor: "cursor-nw-resize",
    },
    {
      dir: "NorthEast",
      className: "top-0 right-0 size-2",
      cursor: "cursor-ne-resize",
    },
    {
      dir: "SouthWest",
      className: "bottom-0 left-0 size-2",
      cursor: "cursor-sw-resize",
    },
    {
      dir: "SouthEast",
      className: "right-0 bottom-0 size-2",
      cursor: "cursor-se-resize",
    },
  ];

  return (
    <>
      {arestas.map(({ dir, className, cursor }) => (
        <div
          key={dir}
          aria-hidden
          // `z-[9999]` porque isto tem de vencer o palco, os painéis e qualquer
          // diálogo: uma janela que não redimensiona porque um popup cobriu a
          // borda seria um bug difícil de associar à causa.
          className={cn("fixed z-[9999]", className, cursor)}
          // `mousedown`, e não `click`: o arraste começa no aperto, e esperar o
          // clique completo significaria não redimensionar nunca.
          onMouseDown={(event) => {
            // Só o botão principal. O do meio cola texto no X11, e o direito
            // abre menu de contexto.
            if (event.button !== 0) return;

            event.preventDefault();
            void janela.startResizeDragging(dir);
          }}
        />
      ))}
    </>
  );
}
