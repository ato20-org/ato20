"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { DadoLayer } from "@/components/operator/dado-layer";
import { SceneLayer } from "@/components/playground/scene-layer";
import { SceneStage } from "@/components/playground/scene-stage";
import { MINIATURA } from "@/lib/miniatura";
import { SCENE_BROADCAST_INTERVAL_MS } from "@/lib/sync/channel";
import { useDadosStore } from "@/lib/store/use-dados-store";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import { SCENE_HEIGHT, SCENE_WIDTH, type CanvasItem, type Scene } from "@/types/scene";

/**
 * O que `public/perf.html` deixou de fora.
 *
 * Aquele spike mediu o MOTOR: DOM na mesma forma, o mesmo CSS, e a conclusão de
 * que a webview do WebKitGTK aguenta cem itens interpolando. Ele diz, na
 * própria nota, o que não cobre — "React e zustand fora do caminho (o custo de
 * reconciliação é o mesmo em qualquer motor, mas não é zero)". Esta página é
 * esse pedaço: os componentes de verdade, o store de verdade, o caminho de
 * commit de verdade.
 *
 * A diferença entre as duas não é detalhe de método. Em `perf.html` mover um
 * item é uma linha de `style.transform`; aqui é `updateItem` -> `updateScene` ->
 * `commit` -> `pushHistory` -> assinantes do zustand -> render do palco ->
 * reconciliação de N itens. É esse caminho que uma refatoração quebra sem
 * ninguém notar, e é ele que esta página cronometra.
 *
 * ## Cenários
 *
 * `arrasto`     O gesto do mestre. Um item muda por quadro, ATRAVÉS DO STORE,
 *               com histórico e persistência ligados como na sessão real.
 * `amostras`    O espectador. Cena nova a cada 100 ms, e cada item chega como
 *               OBJETO NOVO — que é o que o `JSON.parse` do SSE produz, e o
 *               que faz o `memo` do `CanvasItemView` não valer nada. Quantos
 *               itens de fato se movem é `?movidos=` (padrão 1, `todos` para o
 *               pior caso): o mestre arrasta UM token, e o resto do mapa está
 *               parado.
 * `amostras-id` A mesma coisa, preservando a identidade dos itens que não
 *               mudaram. Existe para responder por número se vale a pena
 *               reconciliar o quadro recebido antes de entregá-lo à árvore.
 * `dados`       N dados caindo ao mesmo tempo: `requestAnimationFrame` +
 *               `quadroDaQueda` + vinte polígonos por dado.
 * `biblioteca`  Abrir o acervo com N arquivos. Não é sobre quadro: é sobre
 *               quantos MEGABYTES a tela busca e decodifica para desenhar
 *               quadradinhos de 40px, porque o acervo guarda o original. Com
 *               `?lazy=0` desliga os atributos de `MINIATURA`, e a diferença
 *               entre as duas corridas é o que eles valem. `?rolar=1` percorre
 *               a lista, que é o outro gesto real.
 *
 * Parâmetros: `?cenario=amostras&n=100&segundos=10`
 *
 * Quem dirige é `scripts/perf/medir.mjs`, que serve o `out/`, responde
 * `/asset/*` com bitmap sintético e lê `window.__resultado`. Abrir à mão
 * também funciona — inclusive dentro da janela do aplicativo, que é a única
 * medida que fala pela webview.
 */

/** Quanto do começo se joga fora. Mesmo valor de `perf.html`, para comparar. */
const AQUECIMENTO_MS = 2500;

/** Acima disto um quadro de 60Hz já escapou. É a métrica que a mesa sente. */
const QUADRO_PERDIDO_MS = 20;

type Cenario = "arrasto" | "amostras" | "amostras-id" | "dados" | "biblioteca";

function montarCena(n: number): Scene {
  const agora = Date.now();

  const items: CanvasItem[] = Array.from({ length: n }, (_, i) => {
    const lado = 180 + ((i * 37) % 140);

    return {
      // Id estável e derivado do índice: duas montagens da mesma medida têm de
      // produzir a mesma cena, senão a comparação entre corridas não vale.
      id: `perf-item-${i}`,
      // Um asset por item, e não um repetido: o custo de compor N texturas
      // distintas era parte do que o spike do motor mediu, e trocar isso aqui
      // mudaria a base de comparação.
      assetId: `perf-token-${i}`,
      x: (i * 173) % (SCENE_WIDTH - lado),
      y: (i * 291) % (SCENE_HEIGHT - lado),
      width: lado,
      height: lado,
      rotation: (i * 23) % 360,
      z: i + 1,
      locked: false,
    };
  });

  return {
    id: "perf-cena",
    name: "medida",
    backgroundAssetId: "perf-fundo",
    items,
    fog: [],
    createdAt: agora,
    updatedAt: agora,
  };
}

/**
 * Onde cada item está no instante `t`.
 *
 * Órbita curta, uma fase por item. A fase importa: itens em sincronia deixariam
 * o compositor agrupar o que numa cena real nunca está agrupado.
 */
function moverItem(item: CanvasItem, indice: number, total: number, t: number): CanvasItem {
  const a = t / 1000 + (indice / total) * Math.PI * 2;

  return {
    ...item,
    x: item.x + Math.cos(a) * 60,
    y: item.y + Math.sin(a) * 60,
    rotation: item.rotation + Math.sin(a) * 25,
  };
}

type Resultado = {
  rotulo: string;
  cenario: Cenario;
  n: number;
  fps: number;
  p50: number;
  p95: number;
  pior: number;
  perdidosPct: number;
  quadros: number;
  dpr: number;
  ua: string;
  em: string;
};

function percentil(ordenados: number[], p: number): number {
  if (ordenados.length === 0) return 0;

  return ordenados[Math.min(ordenados.length - 1, Math.floor((p / 100) * ordenados.length))];
}

/**
 * O relógio da medida.
 *
 * Um `requestAnimationFrame` que só anota o instante de cada quadro e não
 * desenha nada: o trabalho de verdade é dos cenários abaixo, e este laço existe
 * para saber quanto ele custou. Devolve `pronto` para a página parar de mexer na
 * cena quando a janela fecha.
 */
function useMedida(cenario: Cenario, n: number, segundos: number, rotulo: string) {
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [decorrido, setDecorrido] = useState(0);

  useEffect(() => {
    const instantes: number[] = [];
    let quadro = 0;
    let comecou = 0;
    let vivo = true;

    const passo = (t: number) => {
      if (!vivo) return;

      if (comecou === 0) comecou = t;
      instantes.push(t);

      const elapsed = (t - comecou) / 1000;
      if (elapsed < segundos) {
        setDecorrido(elapsed);
        quadro = requestAnimationFrame(passo);
        return;
      }

      // Descarta o aquecimento: subida de textura para a GPU, JIT e mapeamento
      // da janela não são o regime que a mesa vive. Com 500 ms, o spike do
      // motor mediu 40 itens PIOR que 100 -- impossível, e o sinal de que o que
      // estava sendo medido era a abertura da janela.
      const quentes = instantes.filter((instante) => instante - comecou > AQUECIMENTO_MS);
      const deltas: number[] = [];
      for (let i = 1; i < quentes.length; i++) deltas.push(quentes[i] - quentes[i - 1]);
      deltas.sort((a, b) => a - b);

      const total = quentes.length > 1 ? quentes[quentes.length - 1] - quentes[0] : 0;
      const perdidos = deltas.filter((d) => d > QUADRO_PERDIDO_MS).length;

      setResultado({
        rotulo,
        cenario,
        n,
        fps: total > 0 ? Number((((quentes.length - 1) / total) * 1000).toFixed(1)) : 0,
        p50: Number(percentil(deltas, 50).toFixed(2)),
        p95: Number(percentil(deltas, 95).toFixed(2)),
        pior: Number((deltas.at(-1) ?? 0).toFixed(2)),
        perdidosPct: deltas.length
          ? Number(((perdidos / deltas.length) * 100).toFixed(1))
          : 0,
        quadros: quentes.length,
        dpr: window.devicePixelRatio,
        ua: navigator.userAgent,
        em: new Date().toISOString(),
      });
    };

    quadro = requestAnimationFrame(passo);

    return () => {
      vivo = false;
      cancelAnimationFrame(quadro);
    };
  }, [cenario, n, segundos, rotulo]);

  return { resultado, decorrido };
}

/**
 * Espectador: a cena inteira trocada a cada amostra.
 *
 * `identidade` é a pergunta que o cenário existe para responder. Desligado, cada
 * item chega como objeto novo — exatamente o que sai do `JSON.parse` do SSE — e
 * o `memo` do `CanvasItemView` falha em todos, movidos ou não. Ligado, o item
 * que não mudou volta como a MESMA referência, e o `memo` passa a cortar a
 * subárvore.
 */
function PalcoEspectador({
  n,
  identidade,
  movidos,
}: {
  n: number;
  identidade: boolean;
  movidos: number;
}) {
  const base = useMemo(() => montarCena(n), [n]);
  const [cena, setCena] = useState(base);
  const anterior = useRef(base);

  useEffect(() => {
    const amostra = setInterval(() => {
      const t = performance.now();

      const items = base.items.map((item, i) => {
        // Quantos itens mudam por amostra é a variável que decide esta medida,
        // e o padrão é UM: o mestre arrasta um token, e os outros trinta e
        // nove estão parados no mapa. Medir todos se movendo é medir um gesto
        // que ninguém faz -- e é justamente o caso em que preservar
        // identidade não pode ajudar, porque nada permaneceu igual.
        const proximo = i < movidos ? moverItem(item, i, base.items.length, t) : { ...item };
        if (!identidade) return proximo;

        const antes = anterior.current.items[i];
        const igual =
          antes &&
          antes.x === proximo.x &&
          antes.y === proximo.y &&
          antes.width === proximo.width &&
          antes.height === proximo.height &&
          antes.rotation === proximo.rotation &&
          antes.z === proximo.z;

        return igual ? antes : proximo;
      });

      const nova = { ...base, items };
      anterior.current = nova;
      setCena(nova);
      // A cadência é a do Operador de verdade -- 10 Hz. Ver
      // `SCENE_BROADCAST_INTERVAL_MS`.
    }, SCENE_BROADCAST_INTERVAL_MS);

    return () => clearInterval(amostra);
  }, [base, identidade, movidos]);

  return (
    <SceneStage viewport={cena.camera} smooth>
      <SceneLayer scene={cena} smooth />
    </SceneStage>
  );
}

/**
 * Operador: um item por quadro, atravessando o store.
 *
 * O caminho inteiro, e é o ponto desta página: `updateItem` refaz a cena, funde
 * o passo de histórico, notifica os assinantes e agenda a gravação. O
 * `saveBoard` do fim vai falhar -- não há aplicativo aqui --, e falhar rápido é
 * o certo: o que se quer medir é o React, não o disco.
 */
function PalcoOperador({ n }: { n: number }) {
  const cena = useSceneStore(selectEditingScene);

  useEffect(() => {
    const base = montarCena(n);

    useSceneStore.setState({
      board: { scenes: [base], editingSceneId: base.id, liveSceneId: base.id },
      status: "ready",
      campaignPath: "/perf",
    });

    let quadro = 0;
    const primeiro = base.items[0];
    const comecou = performance.now();

    const passo = () => {
      if (primeiro) {
        const a = (performance.now() - comecou) / 1000;

        useSceneStore.getState().updateItem(base.id, primeiro.id, {
          x: primeiro.x + Math.cos(a) * 300,
          y: primeiro.y + Math.sin(a) * 200,
        });
      }

      quadro = requestAnimationFrame(passo);
    };

    quadro = requestAnimationFrame(passo);

    return () => {
      cancelAnimationFrame(quadro);
      useSceneStore.setState({ board: null, status: "idle", campaignPath: null });
    };
  }, [n]);

  if (!cena) return null;

  return (
    <SceneStage bounds>
      <SceneLayer scene={cena} variant="operator" />
    </SceneStage>
  );
}

/**
 * N dados caindo de uma vez, sobre uma cena com N itens parados.
 *
 * Relançados quando todos assentam. Sem isso a medida cronometraria sobretudo
 * mesa parada: uma queda dura uns dois segundos, e o `requestAnimationFrame` do
 * `DadoLayer` MORRE quando o último assenta -- de propósito, e é a razão de a
 * mesa não pagar nada por dado parado. O que se quer medir aqui é a queda.
 */
function PalcoDados({ n }: { n: number }) {
  const cena = useMemo(() => montarCena(n), [n]);

  useEffect(() => {
    const jogar = () => {
      const { lancar } = useDadosStore.getState();

      for (let i = 0; i < n; i++) {
        lancar(
          ([4, 6, 8, 10, 12, 20] as const)[i % 6],
          200 + ((i * 137) % (SCENE_WIDTH - 400)),
          200 + ((i * 211) % (SCENE_HEIGHT - 400)),
          { x: Math.cos(i) * 400, y: Math.sin(i) * 400 },
          i + 1,
        );
      }
    };

    jogar();

    const relance = setInterval(() => {
      useDadosStore.getState().recolher();
      jogar();
    }, 2500);

    return () => {
      clearInterval(relance);
      useDadosStore.getState().recolher();
    };
  }, [n]);

  return (
    <SceneStage>
      <SceneLayer scene={cena} variant="operator" />
      <DadoLayer />
    </SceneStage>
  );
}

/** Nada a assinar: o que se lê aqui não muda depois da abertura. */
const inerte = () => () => {};

/**
 * O acervo aberto: N linhas, miniatura de 40px, arquivo inteiro na origem.
 *
 * A MARCAÇÃO é a do `AssetRow` de verdade — `size-10`, `object-cover`, `<img>`
 * cru — e os atributos vêm da mesma constante que a lista usa, e não de uma
 * cópia: se `MINIATURA` mudar, esta medida muda com ela. O que não é o
 * componente real é a fonte da lista, que lá vem do vault e aqui é uma
 * contagem: montar um vault com sessenta mapas de verdade para medir o
 * `<img>` seria medir o vault.
 *
 * Os ids começam com `mapa-`, e o servidor da medida responde a esse prefixo com
 * um PNG de 2048x2048. É a ordem de grandeza de um mapa que alguém baixou para
 * usar na mesa — o problema não aparece com ícone de 256px.
 */
function PalcoBiblioteca({
  n,
  lazy,
  rolar,
}: {
  n: number;
  lazy: boolean;
  rolar: boolean;
}) {
  const lista = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!rolar) return;

    const alvo = lista.current;
    if (!alvo) return;

    let quadro = 0;
    const comecou = performance.now();

    const passo = () => {
      // Vai e volta, no ritmo de quem procura um mapa na lista.
      const fase = (1 - Math.cos((performance.now() - comecou) / 1600)) / 2;
      alvo.scrollTop = fase * (alvo.scrollHeight - alvo.clientHeight);
      quadro = requestAnimationFrame(passo);
    };

    quadro = requestAnimationFrame(passo);

    return () => cancelAnimationFrame(quadro);
  }, [rolar]);

  return (
    <ul ref={lista} className="w-80 flex-1 overflow-y-auto p-1">
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="flex items-center gap-1 rounded-md p-1">
          <span className="bg-muted size-10 shrink-0 overflow-hidden rounded">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/asset/mapa-${i}`}
              alt=""
              className="size-full object-cover"
              draggable={false}
              {...(lazy ? MINIATURA : {})}
            />
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-neutral-300">
            mapa-{i}.png
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function PerfPage() {
  /**
   * "Já estou no cliente?", pelo mesmo caminho que o `WindowChrome` usa para
   * perguntar "estou no aplicativo?": `useSyncExternalStore` com instantâneo de
   * servidor `false`.
   *
   * Não é estilo. Os parâmetros da medida vêm da URL, e o HTML pré-renderizado
   * não tem URL nenhuma: lê-la com `useEffect` + `setState` faria o primeiro
   * quadro medir a cena padrão e o segundo trocá-la — dois montes de itens
   * dentro da janela de aquecimento, que é justamente o que ela existe para não
   * medir.
   */
  const noCliente = useSyncExternalStore(
    inerte,
    () => true,
    () => false,
  );

  useEffect(() => {
    // A gravação do board falha por construção nesta página -- não há
    // aplicativo por baixo --, e a rejeição não tratada polui o console de quem
    // está lendo a medida. Engolir aqui, e só aqui.
    const engolir = (evento: PromiseRejectionEvent) => evento.preventDefault();
    window.addEventListener("unhandledrejection", engolir);

    return () => window.removeEventListener("unhandledrejection", engolir);
  }, []);

  if (!noCliente) return null;

  return <Medida params={new URLSearchParams(window.location.search)} />;
}

function Medida({ params }: { params: URLSearchParams }) {
  const cenario = (params.get("cenario") ?? "amostras") as Cenario;
  const n = Number(params.get("n") ?? 100);
  const segundos = Number(params.get("segundos") ?? 10);
  const rotulo = params.get("rotulo") ?? "chrome";
  /** Quantos itens mudam por amostra. `todos` para o pior caso. */
  const movidos = params.get("movidos") === "todos" ? n : Number(params.get("movidos") ?? 1);
  /** `biblioteca`: com ou sem os atributos de `MINIATURA`, e percorrendo ou não. */
  const lazy = params.get("lazy") !== "0";
  const rolar = params.get("rolar") === "1";

  const { resultado, decorrido } = useMedida(cenario, n, segundos, rotulo);

  useEffect(() => {
    if (!resultado) return;

    // O contrato com o `medir.mjs`: ele espera este objeto aparecer.
    (window as unknown as { __resultado?: Resultado }).__resultado = resultado;
  }, [resultado]);

  return (
    <main className="flex h-dvh flex-col bg-black">
      {cenario === "arrasto" ? (
        <PalcoOperador n={n} />
      ) : cenario === "dados" ? (
        <PalcoDados n={n} />
      ) : cenario === "biblioteca" ? (
        <PalcoBiblioteca n={n} lazy={lazy} rolar={rolar} />
      ) : (
        <PalcoEspectador
          n={n}
          identidade={cenario === "amostras-id"}
          movidos={movidos}
        />
      )}

      <pre
        className="pointer-events-none fixed top-3 left-3 z-[99999] border border-neutral-700 bg-black/85 p-3 font-mono text-xs whitespace-pre text-neutral-200"
        data-perf-hud
      >
        {resultado
          ? [
              `${resultado.rotulo} / ${resultado.cenario} / n=${resultado.n}`,
              `fps      ${resultado.fps}`,
              `p50      ${resultado.p50} ms`,
              `p95      ${resultado.p95} ms`,
              `pior     ${resultado.pior} ms`,
              `perdidos ${resultado.perdidosPct}%`,
            ].join("\n")
          : `medindo ${cenario} n=${n}\n${decorrido.toFixed(1)}s / ${segundos}s`}
      </pre>
    </main>
  );
}
