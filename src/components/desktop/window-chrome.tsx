"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Clapperboard, Maximize2, Minimize2, Minus, X } from "lucide-react";

import logo from "@/assets/logo-white.png";
import { isDesktop } from "@/lib/vault/bridge";
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
}) {
  const noApp = useIsDesktop();
  const [maximizada, setMaximizada] = useState(false);

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
        {/* Ponta esquerda: o nome, e o que quem chama quiser pôr ao lado dele
            — hoje a campanha. */}
        <span
          data-tauri-drag-region
          className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs"
        >
          {/* `pointer-events-none` no logo pelo mesmo motivo do subtitulo: uma
              imagem no meio da faixa de arraste roubaria o gesto. */}
          <Image
            src={logo}
            alt=""
            priority
            className="pointer-events-none h-3.5 w-auto opacity-70"
          />
          ATO20
        </span>
        {inicio}

        {/* Centro da barra: o que está sendo editado.
            Centrado DENTRO do espaço que sobra, e não na largura da janela.
            A primeira versão usava posição absoluta para acertar o meio exato,
            e o preço apareceu numa janela de 830px: o texto passava por cima do
            nome da campanha. Num gerenciador de janelas de mosaico o `minWidth`
            é ignorado, então "estreito" acontece de verdade.
            Perde-se o centro perfeito quando as pontas têm larguras muito
            diferentes; ganha-se nunca sobrepor.
            `pointer-events-none` para o texto não roubar o gesto de arrastar:
            sem ele, o alvo do clique seria este span, e a janela só se moveria
            pelas beiradas. */}
        <span
          data-tauri-drag-region
          className="flex min-w-0 flex-1 items-center justify-center"
        >
          {subtitulo ? (
            <span className="pointer-events-none flex min-w-0 items-center gap-1.5 text-xs">
              <Clapperboard
                className="text-muted-foreground size-3.5 shrink-0"
                aria-hidden
              />
              <span className="truncate">Editando {subtitulo}</span>
            </span>
          ) : null}
        </span>

        <div className="flex items-center">
          {acoes}

          <ChromeButton
            label="Minimizar"
            onClick={() => void janela.minimize()}
            icon={<Minus className="size-3.5" />}
          />
          <ChromeButton
            label={maximizada ? "Restaurar" : "Maximizar"}
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
            label="Fechar"
            // Vermelho só neste: é o único irreversível dos três, e é o vizinho
            // imediato do maximizar.
            className="hover:bg-destructive hover:text-destructive-foreground"
            onClick={() => void janela.close()}
            icon={<X className="size-3.5" />}
          />
        </div>
      </div>
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
