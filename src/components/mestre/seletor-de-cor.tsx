"use client";

import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { ARCO_IRIS } from "@/components/mestre/menu-da-luz";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { hexParaHsv, hsvParaHex, normalizarHex, type Hsv } from "@/lib/cor";
import { t } from "@/lib/i18n/ferramentas";
import { cn } from "@/lib/utils";

/** O quanto uma seta anda no quadrado, em fração. Shift anda dez vezes isso. */
const PASSO = 0.01;
/** E na faixa do matiz, em graus. */
const PASSO_DO_MATIZ = 2;

/** A faixa do matiz: a volta inteira, de vermelho a vermelho. */
const ARCO_DO_MATIZ =
  "linear-gradient(to right, #f00 0%, #ff0 16.66%, #0f0 33.33%, #0ff 50%, #00f 66.66%, #f0f 83.33%, #f00 100%)";

function entre0e1(valor: number): number {
  return Math.min(1, Math.max(0, valor));
}

/**
 * Um seletor de cor pequeno: o quadrado, a faixa e o hexadecimal.
 *
 * Próprio, e não o do sistema nem o de uma biblioteca: o do sistema é uma
 * janela do GTK que abre longe de onde o mestre está olhando, com um visual que
 * não é o do aplicativo, e o seletor que acompanha o kit de componentes é
 * pago. A pergunta aqui é uma só -- "de que cor é esta luz" --, e ela cabe em
 * três controles.
 *
 * ## O matiz mora aqui, e não na cor
 *
 * O estado é HSV, e a cor de fora só o ALIMENTA. Quem guarda só o hexadecimal
 * perde o matiz no cinza e no preto: arrastar o quadrado até o canto escuro e
 * voltar levaria a luz para o vermelho, porque `#000000` não tem matiz nenhum.
 * A cor de fora só entra de novo quando muda por outro caminho -- a paleta, o
 * desfazer --, e aí ela manda.
 *
 * Tudo muda AO VIVO: `onChange` a cada movimento, porque é olhando a luz na
 * tela que se acerta a cor, e não olhando o quadrado.
 */
export function SeletorDeCor({
  cor,
  onChange,
  className,
}: {
  /** Em `#rrggbb`. */
  cor: string;
  onChange: (cor: string) => void;
  className?: string;
}) {
  const [hsv, setHsv] = useState<Hsv>(
    () => hexParaHsv(cor) ?? { h: 0, s: 0, v: 1 },
  );
  /** A última cor de fora que este seletor viu. Ver o cabeçalho. */
  const [corVista, setCorVista] = useState(cor);
  const [rascunho, setRascunho] = useState<string | null>(null);

  // A cor mudou por outro caminho: ela manda. Durante o render, e não num
  // efeito, que é o jeito do React para estado derivado de prop -- com efeito
  // haveria um quadro com o quadrado na cor velha.
  if (cor !== corVista) {
    setCorVista(cor);
    if (normalizarHex(cor) !== hsvParaHex(hsv)) {
      const novo = hexParaHsv(cor);
      if (novo) setHsv(novo);
    }
  }

  function mudar(novo: Hsv) {
    const hex = hsvParaHex(novo);
    setHsv(novo);
    // A cor que este seletor acabou de mandar não volta como "mudou lá fora".
    setCorVista(hex);
    onChange(hex);
  }

  const hex = hsvParaHex(hsv);
  const puro = hsvParaHex({ h: hsv.h, s: 1, v: 1 });

  function gravarRascunho() {
    const valor = rascunho === null ? null : normalizarHex(rascunho);
    setRascunho(null);
    const novo = valor ? hexParaHsv(valor) : null;
    if (novo && valor !== hex) mudar(novo);
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div
        role="slider"
        tabIndex={0}
        aria-label={t.seletorDeCor.saturacaoEBrilho}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={t.seletorDeCor.saturacaoEBrilhoValor(
          Math.round(hsv.s * 100),
          Math.round(hsv.v * 100),
        )}
        className="focus-visible:ring-ring relative h-28 w-full cursor-crosshair touch-none rounded-md outline-none focus-visible:ring-2"
        style={{
          // Branco à esquerda até o matiz puro à direita, e o preto subindo
          // de baixo por cima dos dois: é o quadrado de todo seletor.
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${puro})`,
        }}
        onPointerDown={(evento) =>
          arrastar(evento, (fx, fy) => mudar({ ...hsv, s: fx, v: 1 - fy }))
        }
        onKeyDown={(evento) =>
          setas(evento, (dx, dy) =>
            mudar({
              ...hsv,
              s: entre0e1(hsv.s + dx),
              v: entre0e1(hsv.v - dy),
            }),
          )
        }
      >
        <Polegar x={hsv.s} y={1 - hsv.v} cor={hex} />
      </div>

      <div
        role="slider"
        tabIndex={0}
        aria-label={t.seletorDeCor.matiz}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        className="focus-visible:ring-ring relative h-3 w-full cursor-pointer touch-none rounded-full outline-none focus-visible:ring-2"
        style={{ background: ARCO_DO_MATIZ }}
        onPointerDown={(evento) =>
          arrastar(evento, (fx) => mudar({ ...hsv, h: fx * 360 }))
        }
        onKeyDown={(evento) =>
          setas(evento, (dx) =>
            mudar({
              ...hsv,
              h: Math.min(
                360,
                Math.max(0, hsv.h + (dx / PASSO) * PASSO_DO_MATIZ),
              ),
            }),
          )
        }
      >
        <Polegar x={hsv.h / 360} y={0.5} cor={puro} />
      </div>

      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="size-6 shrink-0 rounded border border-white/20"
          style={{ backgroundColor: hex }}
        />
        <input
          aria-label={t.seletorDeCor.hexadecimal}
          spellCheck={false}
          maxLength={7}
          value={rascunho ?? hex.toUpperCase()}
          className="border-input focus-visible:ring-ring h-7 min-w-0 flex-1 rounded-md border bg-transparent px-2 font-mono text-xs uppercase outline-none focus-visible:ring-2"
          onFocus={(evento) => evento.currentTarget.select()}
          onChange={(evento) => setRascunho(evento.target.value)}
          onBlur={gravarRascunho}
          onKeyDown={(evento) => {
            // Dentro de um menu, a letra digitada iria para a busca por
            // inicial dele, e as setas para a navegação. O campo fica com elas.
            evento.stopPropagation();
            if (evento.key === "Enter") evento.currentTarget.blur();
            if (evento.key === "Escape") {
              setRascunho(null);
              evento.currentTarget.blur();
            }
          }}
        />
      </div>
    </div>
  );
}

/** A bolinha que marca onde a cor está, com a própria cor dentro. */
function Polegar({ x, y, cor }: { x: number; y: number; cor: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, backgroundColor: cor }}
    />
  );
}

/**
 * Segue o ponteiro sobre a área, em fração dela, de 0 a 1 nos dois eixos.
 *
 * Pela caixa na TELA a cada movimento, e não por um tamanho guardado: o
 * seletor mora dentro de um painel que desfaz o zoom do palco com `scale`, e a
 * caixa que o `getBoundingClientRect` devolve já vem com isso resolvido.
 *
 * O ponteiro é capturado: arrastar para fora do quadrado continua mexendo na
 * cor, presa à borda, em vez de largar o gesto no meio.
 */
function arrastar(
  evento: ReactPointerEvent<HTMLElement>,
  aoMover: (fx: number, fy: number) => void,
) {
  if (evento.button !== 0) return;
  // O palco e o menu não ficam sabendo: um largaria a seleção, o outro
  // entenderia um clique num item.
  evento.stopPropagation();
  evento.preventDefault();

  const alvo = evento.currentTarget;
  alvo.focus();
  alvo.setPointerCapture(evento.pointerId);

  const ler = (x: number, y: number) => {
    const caixa = alvo.getBoundingClientRect();
    if (caixa.width === 0 || caixa.height === 0) return;
    aoMover(
      entre0e1((x - caixa.left) / caixa.width),
      entre0e1((y - caixa.top) / caixa.height),
    );
  };

  ler(evento.clientX, evento.clientY);

  const mover = (nativo: PointerEvent) => ler(nativo.clientX, nativo.clientY);
  const soltar = () => {
    alvo.removeEventListener("pointermove", mover);
    alvo.removeEventListener("pointerup", soltar);
    alvo.removeEventListener("pointercancel", soltar);
  };

  alvo.addEventListener("pointermove", mover);
  alvo.addEventListener("pointerup", soltar);
  alvo.addEventListener("pointercancel", soltar);
}

/** As setas do teclado, em passos. Shift dá dez. As outras teclas passam. */
function setas(
  evento: ReactKeyboardEvent,
  aoAndar: (dx: number, dy: number) => void,
) {
  const passo = evento.shiftKey ? PASSO * 10 : PASSO;
  const direcao: Record<string, [number, number]> = {
    ArrowLeft: [-passo, 0],
    ArrowRight: [passo, 0],
    ArrowUp: [0, -passo],
    ArrowDown: [0, passo],
  };
  const andar = direcao[evento.key];
  if (!andar) return;

  // Só as setas param aqui: sem isto elas também chegariam ao palco, que as
  // usa para empurrar a seleção, e ao menu, que as usa para navegar.
  evento.preventDefault();
  evento.stopPropagation();
  aoAndar(andar[0], andar[1]);
}

/** Quanto o tom precisa ficar parado para ser gravado, em ms. Ver `CorLivre`. */
const ESPERA_DO_TOM = 200;

/**
 * O TOM fora da paleta: o botão de arco-íris no fim de uma fileira de cores,
 * que abre este seletor num popover. Pintado com o tom quando ele é o
 * escolhido, para a fileira mostrar que a cor é livre.
 *
 * Num popover, e não aberto embaixo da fileira como no `TomDeCor`: ele mora
 * em quatro lugares -- a paleta do gizmo, a aparência da condição, a luz e o
 * efeito em área --, dois deles já dentro de um popover ou de um painel que o
 * gizmo escala, e o popover é o que cabe igual em todos.
 *
 * O seletor anda AO VIVO por dentro, mas a cor só sai quando o tom PARA (ou o
 * popover fecha): a cor da condição vai ao disco a cada gravação, e a da área
 * vira um passo do desfazer. Arrastar o quadrado seria uma gravação por
 * quadro.
 */
export function CorLivre({
  cor,
  paleta,
  rotulo = t.seletorDeCor.outraCor,
  className = (livre) =>
    cn("size-5 rounded-full border-2", livre ? "border-foreground" : "border-transparent"),
  onCor,
}: {
  /** A cor de agora. Ausente = nenhuma (a do tema, a da condição). */
  cor: string | undefined;
  /** As bolinhas ao lado: a cor fora delas é a livre, e o botão a mostra. */
  paleta: readonly string[];
  rotulo?: string;
  /** O botão, vestido como as bolinhas da fileira em que mora. */
  className?: (livre: boolean) => string;
  onCor: (cor: string) => void;
}) {
  const livre = cor !== undefined && !paleta.includes(cor);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendente = useRef<string | null>(null);

  function gravar() {
    if (espera.current) clearTimeout(espera.current);
    espera.current = null;
    if (pendente.current) onCor(pendente.current);
    pendente.current = null;
  }

  return (
    <Popover
      onOpenChange={(aberto) => {
        if (!aberto) gravar();
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={rotulo}
            aria-pressed={livre}
            title={rotulo}
            className={cn("shrink-0", className(livre))}
            style={{ background: livre ? cor : ARCO_IRIS }}
          />
        }
      />
      <PopoverContent className="w-60 p-2" onPointerDown={(evento) => evento.stopPropagation()}>
        <SeletorDeCor
          cor={cor ?? "#ffffff"}
          onChange={(hex) => {
            pendente.current = hex;
            if (espera.current) clearTimeout(espera.current);
            espera.current = setTimeout(gravar, ESPERA_DO_TOM);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
