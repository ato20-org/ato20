"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from "react";

import { cn } from "@/lib/utils";

/** Folga das bordas da tela. */
const MARGEM = 16;
/** Quanto o dedo anda antes de o toque virar arrasto. */
const LIMIAR_DO_ARRASTO = 6;
/** Vão entre a bolinha e o painel. */
const VAO = 8;

/**
 * Onde a bolinha mora, em FRAÇÃO da área livre -- 0 é a borda da esquerda (ou
 * de cima), 1 a da direita (ou de baixo) --, e não em pixel: girar o celular
 * troca as duas medidas, e a fração continua caindo no mesmo lugar relativo.
 */
export type Lugar = { x: number; y: number };

/** A faixa em que a bolinha anda: o que fica livre em cima e embaixo. */
export type Reservas = { emcima: number; embaixo: number };

type Janela = { largura: number; altura: number };

function janelaAgora(): Janela {
  if (typeof window === "undefined") return { largura: 0, altura: 0 };
  return { largura: window.innerWidth, altura: window.innerHeight };
}

/**
 * Lido do aparelho na primeira pintura. Sem `localStorage` (aba privada,
 * navegador que o proíbe), o lugar de fábrica.
 */
function lugarGuardado(chave: string, padrao: Lugar): Lugar {
  const fracao = (valor: unknown) =>
    typeof valor === "number" && valor >= 0 && valor <= 1 ? valor : null;

  try {
    const cru = JSON.parse(window.localStorage.getItem(chave) ?? "null") as Record<string, unknown> | null;
    if (!cru) return padrao;

    const x = fracao(cru.x);
    const y = fracao(cru.y);
    if (x !== null && y !== null) return { x, y };

    // O formato de antes, quando a bolinha encostava num lado: o lado vira a
    // borda e a altura continua a mesma. Quem já a tinha posto num lugar não o
    // perde com a troca.
    const altura = fracao(cru.altura);
    if ((cru.lado === "esquerda" || cru.lado === "direita") && altura !== null) {
      return { x: cru.lado === "esquerda" ? 0 : 1, y: altura };
    }
  } catch {
    // Sem onde ler, o padrão.
  }
  return padrao;
}

function guardar(chave: string, lugar: Lugar) {
  try {
    window.localStorage.setItem(chave, JSON.stringify(lugar));
  } catch {
    // Sem onde guardar, vale só nesta aba.
  }
}

/** A área livre do canto de cima à esquerda da bolinha, em pixel. */
function area(janela: Janela, reservas: Reservas, tamanho: number) {
  const xMin = MARGEM;
  const xMax = Math.max(xMin, janela.largura - MARGEM - tamanho);
  const yMin = reservas.emcima;
  const yMax = Math.max(yMin, janela.altura - reservas.embaixo - tamanho);
  return { xMin, xMax, yMin, yMax };
}

/** O canto de cima à esquerda da bolinha, em pixel, para um lugar. */
function pontoDo(lugar: Lugar, janela: Janela, reservas: Reservas, tamanho: number) {
  const { xMin, xMax, yMin, yMax } = area(janela, reservas, tamanho);
  return { x: xMin + lugar.x * (xMax - xMin), y: yMin + lugar.y * (yMax - yMin) };
}

/**
 * O lugar onde a bolinha foi solta, LIVRE: fica onde o dedo a deixou. Só é
 * puxada para dentro da área quando solta fora dela -- sobre a barra de baixo,
 * colada na borda.
 */
function lugarDo(ponto: { x: number; y: number }, janela: Janela, reservas: Reservas, tamanho: number): Lugar {
  const { xMin, xMax, yMin, yMax } = area(janela, reservas, tamanho);
  const fracao = (valor: number, min: number, max: number) =>
    max > min ? Math.min(1, Math.max(0, (valor - min) / (max - min))) : 1;
  return { x: fracao(ponto.x, xMin, xMax), y: fracao(ponto.y, yMin, yMax) };
}

/**
 * Uma bolinha que flutua sobre a tela, arrastável, e o painel que abre colado
 * nela. É a mochila e, deitado, o saquinho -- como as bolhas de conversa do
 * celular e o saquinho flutuante do Mestre.
 *
 * Arrastável porque nenhum canto fixo serve a todo mundo: ela cobre o pedaço da
 * tela que estiver embaixo dela, e quem joga sabe qual pedaço quer ver. Solta,
 * fica ONDE foi solta -- encostar na borda mais perto, como as bolhas de
 * conversa, puxava a bolinha para longe de onde o jogador a queria --, e o
 * lugar fica guardado no aparelho, um por bolinha (`chave`).
 *
 * O painel abre para o lado que tem mais espaço -- acima da bolinha embaixo,
 * abaixo dela no alto -- e a acompanha se ela for arrastada aberta.
 *
 * Abre e fecha no CLIQUE, que é também o que o Enter e o Espaço disparam; o
 * clique que o navegador manda logo depois de um arrasto é engolido.
 */
export function BolinhaFlutuante({
  chave,
  padrao,
  reservas,
  tamanho = 48,
  rotulo,
  bolinha,
  classeDaBolinha,
  painel,
  larguraDoPainel = 352,
  classeDoPainel,
  fecharAoTocarFora = true,
  refDaBolinha,
}: {
  /** Onde o lugar fica guardado no aparelho. */
  chave: string;
  /** O lugar de fábrica. */
  padrao: Lugar;
  reservas: Reservas;
  tamanho?: number;
  rotulo: (aberta: boolean) => string;
  /** O que a bolinha mostra. */
  bolinha: (aberta: boolean) => ReactNode;
  classeDaBolinha?: (aberta: boolean) => string | false | undefined;
  /** O que o painel mostra; `fechar` para o X de dentro. */
  painel: (fechar: () => void) => ReactNode;
  larguraDoPainel?: number;
  classeDoPainel?: string;
  /**
   * Tocar fora fecha. Desligado no saquinho: o arremesso acontece FORA dele,
   * sobre a tela, e cada dado jogado fecharia o painel.
   */
  fecharAoTocarFora?: boolean;
  /** Para quem precisa saber onde a bolinha está: a boca do saquinho. */
  refDaBolinha?: Ref<HTMLButtonElement>;
}) {
  const [janela, setJanela] = useState(janelaAgora);
  const [lugar, setLugar] = useState(() => lugarGuardado(chave, padrao));
  /** Onde a bolinha está DURANTE o arrasto. `null` = parada no `lugar`. */
  const [mao, setMao] = useState<{ x: number; y: number } | null>(null);
  const [aberta, setAberta] = useState(false);

  const arrasto = useRef<{ dx: number; dy: number; x0: number; y0: number; moveu: boolean } | null>(null);
  /** O clique que o navegador manda logo depois de um arrasto: não é toque. */
  const engolirClique = useRef(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const medir = () => setJanela(janelaAgora());
    window.addEventListener("resize", medir);
    window.addEventListener("orientationchange", medir);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("orientationchange", medir);
    };
  }, []);

  // Fecha com Esc e, quando pode, com toque fora -- menos quando o toque é num
  // diálogo aberto por cima, como o de item novo: ele mora num portal.
  useEffect(() => {
    if (!aberta) return;

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAberta(false);
    };
    const aoTocar = (evento: PointerEvent) => {
      const alvo = evento.target as Node;
      if (caixa.current?.contains(alvo)) return;
      if (alvo instanceof Element && alvo.closest(`[data-bolinha="${chave}"]`)) return;
      if (document.querySelector('[data-slot="dialog-content"]')) return;
      setAberta(false);
    };

    window.addEventListener("keydown", aoTeclar);
    if (fecharAoTocarFora) document.addEventListener("pointerdown", aoTocar);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("pointerdown", aoTocar);
    };
  }, [aberta, fecharAoTocarFora, chave]);

  const ponto = mao ?? pontoDo(lugar, janela, reservas, tamanho);

  function aoApertar(evento: ReactPointerEvent<HTMLButtonElement>) {
    evento.currentTarget.setPointerCapture(evento.pointerId);
    // Um arrasto cancelado pelo navegador não manda o clique que a trava
    // esperava; cada toque novo começa sem ela.
    engolirClique.current = false;
    arrasto.current = {
      dx: evento.clientX - ponto.x,
      dy: evento.clientY - ponto.y,
      x0: evento.clientX,
      y0: evento.clientY,
      moveu: false,
    };
  }

  function aoMover(evento: ReactPointerEvent<HTMLButtonElement>) {
    const atual = arrasto.current;
    if (!atual) return;

    if (!atual.moveu && Math.hypot(evento.clientX - atual.x0, evento.clientY - atual.y0) < LIMIAR_DO_ARRASTO) {
      return;
    }
    atual.moveu = true;
    setMao({
      x: Math.min(janela.largura - tamanho, Math.max(0, evento.clientX - atual.dx)),
      y: Math.min(janela.altura - tamanho, Math.max(0, evento.clientY - atual.dy)),
    });
  }

  function aoSoltar() {
    const atual = arrasto.current;
    arrasto.current = null;
    // Não andou: foi um toque, e quem abre é o `onClick`.
    if (!atual?.moveu) return;

    engolirClique.current = true;
    if (mao) {
      const novo = lugarDo(mao, janela, reservas, tamanho);
      setLugar(novo);
      guardar(chave, novo);
    }
    setMao(null);
  }

  // O painel, colado na bolinha, para o lado com mais espaço.
  const largura = Math.min(larguraDoPainel, janela.largura - MARGEM * 2);
  const naDireita = ponto.x + tamanho / 2 >= janela.largura / 2;
  const esquerdaDoPainel = Math.min(
    janela.largura - MARGEM - largura,
    Math.max(MARGEM, naDireita ? ponto.x + tamanho - largura : ponto.x),
  );
  const espacoAcima = ponto.y - VAO - MARGEM;
  const espacoAbaixo = janela.altura - (ponto.y + tamanho) - VAO - MARGEM;
  const paraCima = espacoAcima >= espacoAbaixo;

  return (
    <>
      <button
        ref={refDaBolinha}
        data-bolinha={chave}
        type="button"
        aria-label={rotulo(aberta)}
        aria-expanded={aberta}
        onPointerDown={aoApertar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        onClick={() => {
          if (engolirClique.current) {
            engolirClique.current = false;
            return;
          }
          setAberta((antes) => !antes);
        }}
        style={{ left: ponto.x, top: ponto.y, width: tamanho, height: tamanho }}
        className={cn(
          "fixed z-30 grid touch-none place-items-center rounded-full border shadow-lg select-none",
          classeDaBolinha?.(aberta),
          // Desliza para dentro quando solta fora da área; durante o arrasto,
          // segue o dedo seco.
          !mao && "transition-[left,top,transform] duration-200 ease-out motion-reduce:transition-none",
          mao && "scale-110",
        )}
      >
        {bolinha(aberta)}
      </button>

      {aberta ? (
        <div
          ref={caixa}
          role="dialog"
          aria-label={rotulo(true)}
          style={{
            left: esquerdaDoPainel,
            width: largura,
            maxHeight: Math.max(160, paraCima ? espacoAcima : espacoAbaixo),
            ...(paraCima ? { bottom: janela.altura - ponto.y + VAO } : { top: ponto.y + tamanho + VAO }),
          }}
          className={cn(
            "bg-popover text-popover-foreground animate-in fade-in zoom-in-95 fixed z-40 flex flex-col overflow-hidden rounded-2xl border shadow-xl duration-150",
            paraCima ? "slide-in-from-bottom-2" : "slide-in-from-top-2",
            classeDoPainel,
          )}
        >
          {painel(() => setAberta(false))}
        </div>
      ) : null}
    </>
  );
}
