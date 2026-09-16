"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { daemonAddr, isDesktop } from "@/lib/vault/bridge";
import { SCENE_HEIGHT, SCENE_WIDTH } from "@/types/scene";

/**
 * Modo de depuração do palco.
 *
 * Existe porque o palco tem dois planos, duas formas de ampliar e um motor
 * (WebKitGTK) que às vezes pinta uma camada onde o layout não a pôs. Nada disso
 * aparece em teste nem em log: aparece na tela, e só de quem está olhando. Este
 * modo põe na tela o que a geometria ACHA que está acontecendo -- e manda o
 * mesmo para o daemon, de onde um terminal lê sem depender de print.
 *
 * Liga e desliga com `Ctrl+Alt+D`, em qualquer tela (Mestre, Espectador,
 * Jogador). Persistido em `localStorage`, então sobrevive ao recarregar.
 * Desligado, custa um ouvinte de teclado e nada mais.
 *
 * Ver `.claude/skills/debug-do-palco/SKILL.md` para como ler e o que gravar.
 */
const CHAVE = "ato20.debug-palco";

/**
 * Um store mínimo em volta do `localStorage`, para o `useSyncExternalStore`.
 *
 * E não `useState` + efeito: escrever estado dentro de efeito é o que a regra
 * `react-hooks/set-state-in-effect` proíbe, e com razão -- cascateia render.
 * Aqui o valor do servidor é sempre `false` (o HUD nunca é pré-renderizado) e
 * o do cliente vem do storage; o React reconcilia sem erro de hidratação.
 */
const ouvintes = new Set<() => void>();

function lerLigado(): boolean {
  try {
    return window.localStorage.getItem(CHAVE) === "1";
  } catch {
    return false;
  }
}

function alternar(): void {
  try {
    window.localStorage.setItem(CHAVE, lerLigado() ? "0" : "1");
  } catch {
    // Sem storage (modo privado) não há como persistir; o modo fica como está.
  }
  for (const avisar of ouvintes) avisar();
}

function inscrever(avisar: () => void): () => void {
  ouvintes.add(avisar);
  return () => {
    ouvintes.delete(avisar);
  };
}

export function useDebugDoPalco(): boolean {
  const ligado = useSyncExternalStore(inscrever, lerLigado, () => false);

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (!(evento.ctrlKey && evento.altKey && evento.key.toLowerCase() === "d"))
        return;
      evento.preventDefault();
      alternar();
    };

    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  return ligado;
}

type Retangulo = { x: number; y: number; w: number; h: number };

/** Quanto sobra para fora da caixa do plano, por lado, e o pior filho. */
export type Transbordo = {
  esquerda: number;
  cima: number;
  direita: number;
  baixo: number;
  /** `tag.classe` do filho que mais transborda, ou vazio. */
  pior: string;
};

/** Uma amostra: o que a geometria espera e o que o DOM mede. */
export type AmostraDoPalco = {
  tela: string;
  quando: number;
  n: number;
  /** Maior intervalo entre quadros desde a amostra anterior, em ms. */
  stall: number;
  zoom: number;
  scale: number;
  dpr: number;
  modo: "zoom" | "transform";
  /** Largura rasterizada em pixels físicos: `1920 × scale × dpr`. */
  raster: number;
  viewport: { x: number; y: number; width: number; height: number };
  esperado: { x: number; y: number; w: number };
  conteudo: Retangulo | null;
  controles: Retangulo | null;
  /**
   * Quanto os filhos de cada plano passam da caixa dele, em px de tela, e
   * quem passa mais. É a armadilha número um do WebKitGTK medida em vez de
   * adivinhada: filho que transborda infla a camada composta, e o motor pinta
   * o mapa deslocado ou preto. Zero é o normal; centenas é o culpado.
   */
  transbordo: {
    conteudo: Transbordo | null;
    controles: Transbordo | null;
  };
  /** Centro medido da mira de cada plano, contra o centro esperado. */
  miras: {
    esperado: { x: number; y: number };
    magenta: { x: number; y: number; cadeia: string } | null;
    cyan: { x: number; y: number; cadeia: string } | null;
  };
};

/**
 * Para onde as amostras vão.
 *
 * No Mestre é o loopback do daemon; no Espectador e no Jogador a página veio
 * do próprio daemon, e caminho relativo resolve sozinho. Falha em silêncio: é
 * telemetria de depuração, e derrubar o palco por causa dela seria inverter a
 * prioridade.
 */
async function enviar(amostra: AmostraDoPalco): Promise<void> {
  try {
    const base = isDesktop() ? (await daemonAddr()).url : "";
    await fetch(`${base}/debug/palco`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(amostra),
      keepalive: false,
    });
  } catch {
    // ver acima
  }
}

export function DebugPalco({
  tela,
  frame,
  conteudo,
  controles,
  scale,
  offsetX,
  offsetY,
  modoZoom,
  viewport,
}: {
  tela: string;
  frame: HTMLDivElement | null;
  conteudo: HTMLDivElement | null;
  controles: HTMLDivElement | null;
  scale: number;
  offsetX: number;
  offsetY: number;
  modoZoom: boolean;
  viewport: { x: number; y: number; width: number; height: number };
}) {
  const [m, setM] = useState<AmostraDoPalco | null>(null);

  useEffect(() => {
    let vivo = true;
    let ultimo = 0;
    let anterior = 0;
    let piorGap = 0;
    let n = 0;
    let ultimoEnvio = 0;

    const tick = (t: number) => {
      if (!vivo) return;
      if (anterior) piorGap = Math.max(piorGap, t - anterior);
      anterior = t;

      if (t - ultimo > 100 && frame) {
        ultimo = t;
        n += 1;
        const f = frame.getBoundingClientRect();
        const rel = (el: HTMLElement | null): Retangulo | null => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.left - f.left, y: r.top - f.top, w: r.width, h: r.height };
        };
        const dpr = window.devicePixelRatio || 1;
        const centro = {
          x: offsetX + (SCENE_WIDTH / 2) * scale,
          y: offsetY + (SCENE_HEIGHT / 2) * scale,
        };
        const mira = (raiz: HTMLElement | null) => {
          const el = raiz?.querySelector<HTMLElement>("[data-mira]") ?? null;
          const r = rel(el);
          if (!r || !raiz || !el) return null;
          // A cadeia de ancestrais até o plano, com a origem de cada um relativa
          // à do plano: quem introduz um deslocamento aparece aqui nomeado.
          const base = raiz.getBoundingClientRect();
          const cadeia: string[] = [];
          let no: HTMLElement | null = el.parentElement;
          while (no && no !== raiz && cadeia.length < 6) {
            const b = no.getBoundingClientRect();
            const cls = (no.className || "").toString().slice(0, 24);
            cadeia.unshift(
              `${no.tagName.toLowerCase()}.${cls}@(${(b.left - base.left).toFixed(0)},${(b.top - base.top).toFixed(0)})`,
            );
            no = no.parentElement;
          }
          return {
            x: r.x + r.w / 2,
            y: r.y + r.h / 2,
            cadeia: cadeia.join(" > ") || "(filho direto)",
          };
        };

        /**
         * Filhos diretos e netos do plano contra a caixa do plano. Dois níveis
         * bastam: o que fura o plano é sempre um retângulo grande posicionado
         * nele, e não uma folha fundo na árvore.
         */
        const transbordo = (raiz: HTMLElement | null): Transbordo | null => {
          if (!raiz) return null;
          const caixa = raiz.getBoundingClientRect();
          const t: Transbordo = { esquerda: 0, cima: 0, direita: 0, baixo: 0, pior: "" };
          let maior = 0;
          const olhar = (el: HTMLElement) => {
            const b = el.getBoundingClientRect();
            if (b.width === 0 && b.height === 0) return;
            const e = Math.max(0, caixa.left - b.left);
            const c = Math.max(0, caixa.top - b.top);
            const d = Math.max(0, b.right - caixa.right);
            const x = Math.max(0, b.bottom - caixa.bottom);
            t.esquerda = Math.max(t.esquerda, e);
            t.cima = Math.max(t.cima, c);
            t.direita = Math.max(t.direita, d);
            t.baixo = Math.max(t.baixo, x);
            const total = e + c + d + x;
            if (total > maior) {
              maior = total;
              t.pior = `${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 32)}`;
            }
          };
          for (const filho of Array.from(raiz.children) as HTMLElement[]) {
            olhar(filho);
            for (const neto of Array.from(filho.children) as HTMLElement[]) olhar(neto);
          }
          return {
            esquerda: Math.round(t.esquerda),
            cima: Math.round(t.cima),
            direita: Math.round(t.direita),
            baixo: Math.round(t.baixo),
            pior: t.pior,
          };
        };

        const amostra: AmostraDoPalco = {
          tela,
          quando: Date.now(),
          n,
          stall: Math.round(piorGap),
          zoom: Math.round((SCENE_WIDTH / viewport.width) * 100),
          scale,
          dpr,
          modo: modoZoom ? "zoom" : "transform",
          raster: Math.round(SCENE_WIDTH * scale * dpr),
          viewport,
          esperado: { x: offsetX, y: offsetY, w: SCENE_WIDTH * scale },
          conteudo: rel(conteudo),
          controles: rel(controles),
          transbordo: { conteudo: transbordo(conteudo), controles: transbordo(controles) },
          miras: { esperado: centro, magenta: mira(conteudo), cyan: mira(controles) },
        };
        piorGap = 0;
        setM(amostra);

        // Duas por segundo para o daemon: o suficiente para um terminal
        // acompanhar sem encher o anel a cada quadro.
        if (t - ultimoEnvio > 500) {
          ultimoEnvio = t;
          void enviar(amostra);
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    return () => {
      vivo = false;
    };
  }, [tela, frame, conteudo, controles, scale, offsetX, offsetY, modoZoom, viewport]);

  const transTxt = (t: Transbordo | null) =>
    !t
      ? "-"
      : t.esquerda + t.cima + t.direita + t.baixo === 0
        ? "0 (ok)"
        : `E${t.esquerda} C${t.cima} D${t.direita} B${t.baixo}px  pior: ${t.pior}  <-- FILHO FORA DO PLANO`;
  const fmt = (r: Retangulo | null) =>
    r ? `x=${r.x.toFixed(1)} y=${r.y.toFixed(1)} w=${r.w.toFixed(0)}` : "—";
  const desvio = (r: Retangulo | null) =>
    r
      ? `dx=${(r.x - offsetX).toFixed(1)} dy=${(r.y - offsetY).toFixed(1)} dw=${(r.w - SCENE_WIDTH * scale).toFixed(0)}`
      : "";
  const miraTxt = (q: { x: number; y: number; cadeia: string } | null) =>
    q && m
      ? `centro=(${q.x.toFixed(0)},${q.y.toFixed(0)}) desvio=(${(q.x - m.miras.esperado.x).toFixed(0)},${(q.y - m.miras.esperado.y).toFixed(0)})\n   cadeia: ${q.cadeia}`
      : "—";

  return (
    <pre
      aria-hidden
      className="pointer-events-none absolute top-2 left-2 z-[99999] rounded bg-black/80 px-2 py-1 font-mono text-[11px] leading-snug text-lime-300"
    >
      {`DEBUG PALCO [${tela}]  Ctrl+Alt+D desliga   amostra#${m?.n ?? 0}  stall=${m?.stall ?? 0}ms
zoom=${m?.zoom ?? 0}%  scale=${scale.toFixed(3)}  dpr=${m?.dpr ?? 1}  modo=${modoZoom ? "ZOOM (layout)" : "TRANSFORM (compositor)"}  raster=${m?.raster ?? 0}px
viewport x=${viewport.x.toFixed(0)} y=${viewport.y.toFixed(0)} w=${viewport.width.toFixed(0)} h=${viewport.height.toFixed(0)}
esperado   x=${offsetX.toFixed(1)} y=${offsetY.toFixed(1)} w=${(SCENE_WIDTH * scale).toFixed(0)}
conteudo   ${fmt(m?.conteudo ?? null)}   ${desvio(m?.conteudo ?? null)}
controles  ${fmt(m?.controles ?? null)}   ${desvio(m?.controles ?? null)}
transbordo conteudo  ${transTxt(m?.transbordo.conteudo ?? null)}
transbordo controles ${transTxt(m?.transbordo.controles ?? null)}
magenta ${miraTxt(m?.miras.magenta ?? null)}
cyan    ${miraTxt(m?.miras.cyan ?? null)}
(as duas miras marcam o CENTRO do plano; separadas = os planos se descolaram na pintura)`}
    </pre>
  );
}

/**
 * Cruz no centro do plano, em unidade de cena. Uma por plano, cores
 * diferentes: alinhadas, os planos concordam; separadas, um deles foi pintado
 * fora do lugar -- e a distância diz quanto.
 */
export function MiraDebug({ cor }: { cor: string }) {
  const cx = SCENE_WIDTH / 2;
  const cy = SCENE_HEIGHT / 2;
  const estilo = { background: cor, opacity: 0.85, zIndex: 99998 } as const;
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute" style={{ ...estilo, left: cx - 200, top: cy - 3, width: 400, height: 6 }} />
      <div aria-hidden className="pointer-events-none absolute" style={{ ...estilo, left: cx - 3, top: cy - 200, width: 6, height: 400 }} />
      <div
        aria-hidden
        data-mira
        className="pointer-events-none absolute rounded-full"
        style={{ left: cx - 40, top: cy - 40, width: 80, height: 80, border: `6px solid ${cor}`, opacity: 0.85, zIndex: 99998 }}
      />
    </>
  );
}
