"use client";

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { CircleOff, Cylinder, PersonStanding } from "lucide-react";

import { Slider } from "@/components/ui/slider";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import {
  ALTURA_DA_FIGURA_MAX,
  ALTURA_DA_FIGURA_MIN,
} from "@/lib/geometry/sombra";
import { handleCursor, rotateVec } from "@/lib/geometry/transform";
import { cn } from "@/lib/utils";
import type { ModoDaSombra } from "@/types/scene";

/**
 * A sombra do item, como o gizmo a mostra e a muda. Ver `TransformHandles`.
 *
 * Um par estado/ação como o da opacidade, e pela mesma razão: o painel MOSTRA
 * como o item deita, e um controle que não soubesse o modo atual começaria
 * sempre no primeiro e mentiria sobre o item.
 */
export type SombraNoGizmo = {
  modo: ModoDaSombra | "nenhuma";
  /**
   * A linha do chão, em fração da altura da caixa -- a que o mestre pôs ou, sem
   * ela, a que o forno achou. `undefined` enquanto o forno não respondeu: uma
   * linha na borda de baixo que pulasse para o pé um instante depois seria o
   * controle se mexendo sozinho.
   */
  base?: number;
  /** A linha foi posta pelo mestre. É o que acende o "Automática". */
  baseManual: boolean;
  /** Na vista de cima, em múltiplos do lado. Ver `SombraDoItem.altura`. */
  altura: number;
  /**
   * A cena tem de onde a sombra sair: sol, luz cravada ou lanterna. Sem
   * nenhum, o painel continua ajustando -- a escolha vale quando a luz vier
   * --, mas avisa que nada vai aparecer agora.
   */
  acesa: boolean;
  onModo: (modo: ModoDaSombra | "nenhuma") => void;
  /** `null` devolve a linha ao forno. */
  onBase: (base: number | null) => void;
  onAltura: (altura: number) => void;
};

const MODOS: ReadonlyArray<{
  valor: SombraNoGizmo["modo"];
  rotulo: string;
  dica: string;
  Icone: typeof PersonStanding;
}> = [
  {
    valor: "base",
    rotulo: "Na base",
    dica: "Em pé: a sombra nasce da linha do chão e se deita para longe da luz.",
    Icone: PersonStanding,
  },
  {
    valor: "inteira",
    rotulo: "Inteira",
    dica: "Vista de cima: o objeto inteiro deita a sombra, colada nele.",
    Icone: Cylinder,
  },
  {
    valor: "nenhuma",
    rotulo: "Nenhuma",
    dica: "Pintado no chão: tapete, mancha, área de efeito.",
    Icone: CircleOff,
  },
];

/**
 * O que vai dentro do painel da sombra: o jeito de deitar e o ajuste dele.
 *
 * Três opções num controle só, e não um interruptor mais uma escolha: "não
 * lança sombra" é a terceira resposta para a mesma pergunta -- o que este
 * desenho é no mapa --, e separá-la pediria dois cliques para ir do barril em
 * pé ao tapete.
 */
export function PainelDaSombra({ sombra }: { sombra: SombraNoGizmo }) {
  return (
    <div className="flex w-56 flex-col gap-2">
      <span className="text-muted-foreground text-[10px]">Sombra</span>

      <div
        role="radiogroup"
        aria-label="Como este item deita a sombra"
        className="bg-muted flex rounded-md p-0.5"
      >
        {MODOS.map(({ valor, rotulo, dica, Icone }) => (
          <Opcao
            key={valor}
            marcada={sombra.modo === valor}
            rotulo={rotulo}
            dica={dica}
            onClick={() => sombra.onModo(valor)}
          >
            <Icone />
            {rotulo}
          </Opcao>
        ))}
      </div>

      {sombra.modo === "base" ? (
        <div className="flex items-start justify-between gap-2">
          <p className="text-muted-foreground text-[10px] leading-snug">
            Arraste a linha amarela até onde a figura pisa. O que fica abaixo
            dela é chão.
          </p>
          {sombra.baseManual ? (
            <button
              type="button"
              className="text-foreground hover:bg-muted shrink-0 rounded px-1.5 py-0.5 text-[10px] underline-offset-2 hover:underline"
              onClick={() => sombra.onBase(null)}
            >
              Automática
            </button>
          ) : null}
        </div>
      ) : null}

      {sombra.modo === "inteira" ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[10px]">Altura</span>
            <span className="text-muted-foreground text-[10px] tabular-nums">
              {sombra.altura.toFixed(1).replace(".", ",")}×
            </span>
          </div>
          <Slider
            aria-label="Altura do objeto, em múltiplos da largura"
            value={[sombra.altura]}
            min={ALTURA_DA_FIGURA_MIN}
            max={ALTURA_DA_FIGURA_MAX}
            step={0.1}
            onValueChange={(valor) =>
              sombra.onAltura(Array.isArray(valor) ? (valor[0] ?? 1) : valor)
            }
          />
        </div>
      ) : null}

      {!sombra.acesa && sombra.modo !== "nenhuma" ? (
        <p className="text-muted-foreground text-[10px] leading-snug italic">
          Sem sol nem luz nesta cena: a sombra aparece quando houver.
        </p>
      ) : null}
    </div>
  );
}

function Opcao({
  marcada,
  rotulo,
  dica,
  onClick,
  children,
}: {
  marcada: boolean;
  rotulo: string;
  dica: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={marcada}
      aria-label={rotulo}
      title={dica}
      className={cn(
        "focus-visible:ring-ring flex h-6 flex-1 items-center justify-center gap-1 rounded-[5px] text-[11px] outline-none focus-visible:ring-2 [&_svg]:size-3.5",
        marcada
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** A espessura da linha, em pixel de tela. */
const LINHA_PX = 1.5;
/** A faixa em volta da linha que ainda pega o arrasto, em pixel de tela. */
const MIRA_PX = 12;
/** O puxador no meio da linha, em pixel de tela. */
const PUXADOR_PX = { largura: 22, altura: 8 };
const COR_DA_LINHA = "var(--color-amber-400)";

/**
 * A LINHA DO CHÃO, por cima da figura: o segmento de onde a sombra nasce.
 *
 * Mora dentro da caixa do gizmo, que já está no referencial girado do item --
 * a linha gira com ele de graça, e "subir" no arrasto é subir na figura, e não
 * na tela. É por isso que o delta é desgirado antes de virar fração.
 *
 * Só aparece com o painel da sombra aberto e o item em pé: no resto do tempo
 * ela seria uma faixa amarela atravessando todo token clicado, e o arrasto
 * dela competiria com o arrasto do próprio item.
 *
 * O gesto escreve a cada quadro, como o slider da opacidade: a sombra tem de
 * andar junto com a mão, e o histórico já funde uma edição contínua num passo
 * só.
 */
export function LinhaDoChao({
  base,
  altura,
  rotation,
  scale,
  onBase,
}: {
  base: number;
  /** A altura da caixa, em unidades de cena. */
  altura: number;
  rotation: number;
  scale: number;
  onBase: (base: number) => void;
}) {
  const startDrag = useSceneDrag();
  const cursor = handleCursor("s", rotation);

  const arrastar = (event: ReactPointerEvent) => {
    if (altura <= 0) return;

    const inicio = base;

    startDrag(event, {
      onMove: (delta) => {
        const subida = rotateVec(delta, -rotation).y;
        onBase(Math.min(1, Math.max(0, inicio + subida / altura)));
      },
    });
  };

  return (
    <div
      role="slider"
      aria-label="Linha do chão"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(base * 100)}
      className="pointer-events-auto absolute left-0 w-full touch-none"
      style={{
        top: `${base * 100}%`,
        // A faixa de mira tem altura CONSTANTE em pixel de layout, e a
        // ampliação do plano é desfeita por `scaleY` -- a mesma regra do traço
        // da caixa: caixa que muda a cada notch da roda refaz o layout do
        // documento inteiro. Ver `TracoDaCaixa`.
        height: MIRA_PX,
        transform: `scaleY(${1 / scale}) translateY(-50%)`,
        transformOrigin: "0 0",
        // SEM `zIndex`, e antes das alças no DOM: rente à base, a mira passa
        // por cima das alças de canto, e ali quem tem de ganhar é a alça -- o
        // canto continua sendo redimensionar, e o meio da linha é a linha.
        cursor,
      }}
      onPointerDown={arrastar}
    >
      <div
        className="absolute left-0 w-full"
        style={{
          top: "50%",
          height: LINHA_PX,
          transform: "translateY(-50%)",
          backgroundColor: COR_DA_LINHA,
          boxShadow: "0 0 0 0.5px rgb(0 0 0 / 0.45)",
          willChange: "transform",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          left: "50%",
          top: "50%",
          width: PUXADOR_PX.largura,
          height: PUXADOR_PX.altura,
          // O comprido desfaz a ampliação também: o puxador é um controle, e
          // controle tem o mesmo tamanho em qualquer zoom.
          transform: `translate(-50%, -50%) scaleX(${1 / scale})`,
          backgroundColor: COR_DA_LINHA,
          boxShadow: "0 0 0 1px rgb(0 0 0 / 0.5)",
          willChange: "transform",
        }}
      />
    </div>
  );
}
