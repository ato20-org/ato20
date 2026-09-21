"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { DadoLayer } from "@/components/mestre/dado-layer";
import { LayerList } from "@/components/mestre/layer-list";
import { SceneLayer } from "@/components/playground/scene-layer";
import { ScenePreview } from "@/components/playground/scene-preview";
import { SceneStage } from "@/components/playground/scene-stage";
import { MestreShell } from "@/components/mestre/mestre-shell";
import { MestreStage } from "@/components/mestre/mestre-stage";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCameraLockStore } from "@/lib/store/use-camera-lock-store";
import { usePanelsStore } from "@/lib/store/use-panels-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import { PaginaFolha } from "@/components/mestre/leitor/pagina-folha";
import { useRolagemDoLivro } from "@/hooks/use-rolagem-do-livro";
import { pdfjs, RUNTIME } from "@/lib/leitor/pdfjs";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  clampViewport,
  FULL_VIEWPORT,
  PLANO,
  zoomViewport,
} from "@/lib/geometry/viewport";
import { MINIATURA } from "@/lib/miniatura";
import { SCENE_BROADCAST_INTERVAL_MS } from "@/lib/sync/channel";
import { useDadosStore } from "@/lib/store/use-dados-store";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type CameraSalva,
  type CanvasItem,
  type Scene,
} from "@/types/scene";

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
 * `dados`       N dados caindo ao mesmo tempo, com `?zoom=` para reproduzir o
 *               palco ampliado do mestre -- que é onde o canvas dos dados
 *               cobra o backing dele.
 * `lista`      A LISTA DE CENAS enquanto o mestre arrasta um token. Cada linha
 *               monta um `SceneStage` completo -- plano de 1920x1080, fundo,
 *               itens --, e `?n=` é quantas linhas. O palco é o mesmo do
 *               cenário `arrasto`, então a diferença entre `n=0` e `n=30` é o
 *               que a lista custa. Cada prévia com mapa PRÓPRIO, que é o caso
 *               de uma campanha de verdade.
 * `lista-mesmo-mapa` A mesma coisa com todas as prévias apontando para o mesmo
 *               arquivo, para separar o custo de DECODIFICAR do custo de
 *               montar e compor. Medido: com trinta cenas, os dois têm os
 *               MESMOS 409 nós no DOM -- o que pesa é o bitmap por linha, não a
 *               montagem.
 * `camadas`    A JANELA DE CAMADAS enquanto o mestre arrasta um token. Uma
 *               linha por item da cena, e `?n=` é quantos itens -- que é
 *               também o tamanho da lista, porque na janela real os dois são o
 *               mesmo número. O palco é o do cenário `arrasto`, então a
 *               comparação que responde "quanto o painel custa" é contra
 *               `arrasto` no MESMO `n`, e não contra outro `n` deste cenário.
 *
 *               O que ele isola é o RENDER: as miniaturas já pedem a variante
 *               `mini`, e o servidor da medida responde `no-store`, então nem
 *               o bitmap do original nem a revalidação de cache entram na
 *               conta. Sobra o que se quer ver -- N linhas reconciliando a
 *               cada quadro do arrasto, com quatro botões de ícone cada.
 *
 *               Sem IPC nesta página os nomes vêm vazios e a linha diz
 *               "Imagem removida". É um `<span>` truncado de qualquer forma:
 *               muda o texto, não a contagem de nós nem o número de renders.
 *
 * `camera`     A CÂMERA mudando de ampliação a cada quadro, com N itens na
 *               cena. Os outros cenários mexem no CONTEÚDO com a câmera
 *               parada; este mexe na câmera, que é o outro gesto do mestre e o
 *               único que faz o plano inteiro se redesenhar. Nasceu medindo uma
 *               tentativa de conserto do borrão do palco ampliado -- pôr a
 *               ampliação no layout, com `zoom`, em vez de na composição -- e
 *               ficou: era o custo do gesto de zoom que ninguém tinha medido.
 *
 * `jogador`    O CELULAR do jogador: as mesmas amostras de 10 Hz, mas com um
 *               mapa de 3537x3750 no fundo e pedindo a variante `tela`.
 *               `--sem-variante` mede o que ele fazia antes -- baixar o
 *               arquivo inteiro. A coluna que importa aqui é `rede`.
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

type Cenario =
  | "leitor"
  | "arrasto"
  | "camera-gesto"
  | "bancada"
  | "amostras"
  | "amostras-id"
  | "dados"
  | "biblioteca"
  | "lista"
  | "lista-mesmo-mapa"
  | "camadas"
  | "camera"
  | "mestre-camera"
  | "jogador";

/** Um degrau do `leitor`: o que custou trocar o zoom para ele. */
type Passo = {
  zoom: number;
  /** Do degrau mudar ate a pagina sob os olhos estar pintada. */
  atualMs: number;
  /** Ate TODAS as mantidas estarem pintadas. */
  todasMs: number;
  /** Megapixels de canvas pintados no degrau. */
  mp: number;
  mantidas: number;
};

function montarCena(n: number, cameras = 0, noAr = true): Scene {
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

  const salvas = montarCameras(cameras);

  return {
    id: "perf-cena",
    name: "medida",
    backgroundAssetId: "perf-fundo",
    items,
    fog: [],
    cameras: salvas,
    // No ar por padrão porque é assim que o mestre trabalha: ele mexe na
    // câmera que a mesa está vendo. E é o que faz o gesto gravar no board no
    // ritmo do canal em vez de ficar só no `useGestoStore` -- a diferença que
    // `?noar=0` existe para medir.
    cameraNoArId: noAr ? salvas[0]?.id : undefined,
    createdAt: agora,
    updatedAt: agora,
  };
}

/**
 * N câmeras salvas espalhadas pelo plano, sobrepostas, em ampliações
 * diferentes -- que é como a bancada de uma sessão de verdade fica.
 *
 * Não em grade e não todas do mesmo tamanho de propósito: o custo de uma
 * moldura depende de quanto dela está na tela, e uma fileira certinha fora do
 * recorte mediria molduras que o mestre não está vendo. Estas se cruzam no
 * meio do plano, como as cinco da captura que motivou a medida.
 *
 * A primeira é a que nasce no ar e a que o `useCameraLockStore` seleciona; as
 * outras viram fantasma. É a divisão que importa: uma moldura de verdade e
 * N-1 fantasmas, e não N iguais.
 */
function montarCameras(quantas: number): CameraSalva[] {
  return Array.from({ length: quantas }, (_, i) => {
    // 16:9 sempre -- `clampViewport` re-deriva a altura da largura, e um
    // recorte fora da proporção seria corrigido no primeiro gesto e a cena
    // deixaria de ser a mesma entre corridas.
    const width = Math.round(SCENE_WIDTH / (1.6 + ((i * 0.45) % 1.8)));
    const height = Math.round((width * SCENE_HEIGHT) / SCENE_WIDTH);

    return {
      id: `perf-camera-${i}`,
      nome: `Câmera ${i + 1}`,
      viewport: {
        x: Math.round(((i * 337) % Math.max(1, SCENE_WIDTH - width))),
        y: Math.round(((i * 211) % Math.max(1, SCENE_HEIGHT - height))),
        width,
        height,
      },
    };
  });
}

/**
 * Uma cena para a lista, com o mapa que a prévia vai desenhar.
 *
 * `mapaG-*` é o prefixo que o servidor da medida responde com 3537x3750 -- a
 * ordem de grandeza de um mapa que alguém baixou para usar na mesa. É ele que
 * faz a conta de memória ser o que ela é: 3537 x 3750 x 4 bytes são 53 MB de
 * bitmap por arquivo distinto.
 */
function cenaDaLista(indice: number, mesmoMapa: boolean): Scene {
  const agora = Date.now();

  return {
    id: `perf-lista-${indice}`,
    name: `Cena ${indice + 1}`,
    backgroundAssetId: mesmoMapa ? "mapaG-comum" : `mapaG-${indice}`,
    items: [
      {
        id: `perf-lista-${indice}-token`,
        assetId: "perf-token-0",
        x: 700,
        y: 300,
        width: 180,
        height: 380,
        rotation: 0,
        z: 1,
        locked: false,
      },
    ],
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
function moverItem(
  item: CanvasItem,
  indice: number,
  total: number,
  t: number,
): CanvasItem {
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

  return ordenados[
    Math.min(ordenados.length - 1, Math.floor((p / 100) * ordenados.length))
  ];
}

/**
 * O relógio da medida.
 *
 * Um `requestAnimationFrame` que só anota o instante de cada quadro e não
 * desenha nada: o trabalho de verdade é dos cenários abaixo, e este laço existe
 * para saber quanto ele custou. Devolve `pronto` para a página parar de mexer na
 * cena quando a janela fecha.
 */
function useMedida(
  cenario: Cenario,
  n: number,
  segundos: number,
  rotulo: string,
) {
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
      const quentes = instantes.filter(
        (instante) => instante - comecou > AQUECIMENTO_MS,
      );
      const deltas: number[] = [];
      for (let i = 1; i < quentes.length; i++)
        deltas.push(quentes[i] - quentes[i - 1]);
      deltas.sort((a, b) => a - b);

      const total =
        quentes.length > 1 ? quentes[quentes.length - 1] - quentes[0] : 0;
      const perdidos = deltas.filter((d) => d > QUADRO_PERDIDO_MS).length;

      setResultado({
        rotulo,
        cenario,
        n,
        fps:
          total > 0
            ? Number((((quentes.length - 1) / total) * 1000).toFixed(1))
            : 0,
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
  variante,
  mapaGrande,
}: {
  n: number;
  identidade: boolean;
  movidos: number;
  /** Qual tamanho de arquivo a tela pede. Ver `SceneLayer.variante`. */
  variante?: "mini" | "tela";
  /** Fundo de 3537x3750, do tamanho de um mapa de mesa. */
  mapaGrande?: boolean;
}) {
  const base = useMemo(
    () => ({
      ...montarCena(n),
      backgroundAssetId: mapaGrande ? "mapaG-jogador" : "perf-fundo",
    }),
    [n, mapaGrande],
  );
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
        const proximo =
          i < movidos ? moverItem(item, i, base.items.length, t) : { ...item };
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
      // A cadência é a do Mestre de verdade -- 10 Hz. Ver
      // `SCENE_BROADCAST_INTERVAL_MS`.
    }, SCENE_BROADCAST_INTERVAL_MS);

    return () => clearInterval(amostra);
  }, [base, identidade, movidos]);

  return (
    <SceneStage viewport={cena.camera} smooth>
      <SceneLayer scene={cena} smooth variante={variante} />
    </SceneStage>
  );
}

/**
 * Mestre: um item por quadro, atravessando o store.
 *
 * O caminho inteiro, e é o ponto desta página: `updateItem` refaz a cena, funde
 * o passo de histórico, notifica os assinantes e agenda a gravação. O
 * `saveBoard` do fim vai falhar -- não há aplicativo aqui --, e falhar rápido é
 * o certo: o que se quer medir é o React, não o disco.
 */
function PalcoMestre({ n }: { n: number }) {
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
      useSceneStore.setState({
        board: null,
        status: "idle",
        campaignPath: null,
      });
    };
  }, [n]);

  if (!cena) return null;

  return (
    <SceneStage limites={PLANO}>
      <SceneLayer scene={cena} variant="mestre" />
    </SceneStage>
  );
}

/**
 * A CÂMERA mudando de ampliação a cada quadro, com N itens na cena.
 *
 * Sessenta mudanças de zoom por segundo é mais do que a pinça de um touchpad
 * pede, e é o ponto: os outros cenários todos medem a câmera PARADA, e o custo
 * de mexer nela nunca tinha aparecido em número nenhum.
 *
 * Medido aqui: com a ampliação na composição -- `transform: scale`, que é o que
 * o palco faz -- mexer no zoom não custa refluxo nenhum, 24 ms de estilo com
 * sessenta itens. Trocando para `zoom`, que entra no LAYOUT, os mesmos oito
 * segundos pagam 889 ms de estilo e 164 ms de layout. Foi essa a medida que
 * matou aquela tentativa de conserto do borrão -- junto com o que ela fazia com
 * as bordas de meio pixel dos controles.
 */
function PalcoCamera({ n }: { n: number }) {
  const cena = useMemo(() => montarCena(n), [n]);
  const [viewport, setViewport] = useState(FULL_VIEWPORT);

  useEffect(() => {
    let quadro = 0;
    const comecou = performance.now();

    const passo = () => {
      const a = (performance.now() - comecou) / 1000;
      // Vai e volta entre o plano inteiro e umas quatro vezes de ampliação,
      // que é a faixa onde o borrão aparecia.
      const fator = 2.5 + Math.cos(a) * 1.5;

      setViewport(
        zoomViewport(FULL_VIEWPORT, fator, {
          x: SCENE_WIDTH / 2,
          y: SCENE_HEIGHT / 2,
        }),
      );

      quadro = requestAnimationFrame(passo);
    };

    quadro = requestAnimationFrame(passo);

    return () => cancelAnimationFrame(quadro);
  }, []);

  return (
    <SceneStage viewport={viewport} limites={PLANO}>
      <SceneLayer scene={cena} variant="mestre" />
    </SceneStage>
  );
}

/**
 * O palco do MESTRE com a câmera andando a cada quadro, N itens na cena.
 *
 * `camera` mede só o `SceneStage`: dois planos e o conteúdo. O que o mestre
 * sente ao dar zoom passa por cima disso: o `StageBoundary` assina o
 * `useViewportStore`, recria o `MestreStage` a cada quadro, e ele -- mil e
 * oitocentas linhas, quarenta hooks, todas as camadas de controle e o
 * `SceneLayer` -- renderiza de novo. Este cenário monta exatamente esse
 * caminho: o store do viewport anda, e a árvore real do mestre responde.
 *
 * Leia `script`: é a coluna que o `camera` não tem como mostrar.
 */
function PalcoMestreCamera({ n, cameras }: { n: number; cameras: number }) {
  const cena = useSceneStore(selectEditingScene);
  const viewport = useViewportStore((state) => state.viewport);
  const setViewport = useViewportStore((state) => state.setViewport);

  useEffect(() => {
    const base = montarCena(n, cameras);

    useSceneStore.setState({
      board: { scenes: [base], editingSceneId: base.id, liveSceneId: base.id },
      status: "ready",
      campaignPath: "/perf",
    });

    // A primeira câmera selecionada à mão, e não pelo `garantirCameraInicial`:
    // ele roda num efeito do `MestreStage`, um quadro depois, e o primeiro
    // quadro da medida montaria N fantasmas e nenhuma moldura -- que não é a
    // bancada de ninguém. Com `null` a moldura nunca aparece: o
    // `useCameraLockStore` guarda a seleção entre cenas, e a cena anterior da
    // matriz deixou um id que não existe nesta.
    useCameraLockStore.setState({
      selecionadaId: base.cameras?.[0]?.id ?? null,
      espelhoMestre: false,
      fantasmasVisiveis: true,
    });

    let quadro = 0;
    const comecou = performance.now();

    const passo = () => {
      const a = (performance.now() - comecou) / 1000;
      // A mesma faixa do `camera`, mais um deslocamento: zoom e arrasto juntos,
      // que é o gesto que pesava na mão.
      const fator = 2.5 + Math.cos(a) * 1.5;

      useViewportStore.getState().setViewport(
        zoomViewport(FULL_VIEWPORT, fator, {
          x: SCENE_WIDTH / 2 + Math.sin(a) * 300,
          y: SCENE_HEIGHT / 2 + Math.cos(a * 0.7) * 200,
        }),
      );

      quadro = requestAnimationFrame(passo);
    };

    quadro = requestAnimationFrame(passo);

    return () => {
      cancelAnimationFrame(quadro);
      useViewportStore.getState().setViewport(FULL_VIEWPORT);
      useSceneStore.setState({
        board: null,
        status: "idle",
        campaignPath: null,
      });
    };
  }, [n, cameras]);

  if (!cena) return null;

  return (
    <SceneStage viewport={viewport} onViewportChange={setViewport} limites={PLANO}>
      <MestreStage scene={cena} />
    </SceneStage>
  );
}

/**
 * O GESTO SOBRE A MOLDURA, que é outro caminho e outra conta.
 *
 * O `mestre-camera` move o palco: o mestre dá zoom e arrasta a CENA. Este move
 * a CÂMERA: pegar a moldura pela borda, puxar um canto, rodar a roda com a
 * alça na mão -- e arrastar uma das outras, a que está desenhada apagada. São
 * quatro gestos que passam por lugares diferentes do código, e só um deles é o
 * que o `mestre-camera` já media:
 *
 * `mover`         a borda da moldura selecionada. Vai pelo `useGestoStore`,
 *                 que não toca o board -- exceto se a câmera estiver no ar, e
 *                 aí grava no ritmo do canal. A cena de medida põe a primeira
 *                 no ar, porque é assim que o mestre trabalha.
 * `redimensionar` o canto da moldura selecionada, pelo `TransformHandles`.
 *                 Mesmo caminho do `mover`, mas refaz a geometria por quadro.
 * `zoom`          a alça segurada mais a roda: o caminho que junta dois
 *                 emissores num commit só (ver `pedir` em `camera-frame`).
 * `fantasma`      arrastar UMA DAS OUTRAS. Este não passa pelo gesto: o
 *                 `Fantasma` chama `atualizarCamera` direto, e cada quadro é
 *                 um commit de board inteiro. É a suspeita que a medida existe
 *                 para confirmar ou desmentir.
 *
 * O ponteiro é sintético, e é a única concessão: no Wayland não há como
 * injetar mouse de verdade numa janela, e sem gesto nenhum destes caminhos
 * roda. O resto é o de sempre -- o robô mira em COORDENADAS DE TELA, pergunta
 * ao `elementFromPoint` quem está lá e despacha nele, então alvo coberto ou
 * fora do recorte reprova aqui como reprovaria na mão.
 */
function PalcoGestoDeCamera({
  n,
  cameras,
  gesto,
  sonda,
  roda,
}: {
  n: number;
  cameras: number;
  gesto: Gesto;
  sonda: boolean;
  roda: number;
}) {
  const cena = useSceneStore(selectEditingScene);
  const viewport = useViewportStore((state) => state.viewport);
  const setViewport = useViewportStore((state) => state.setViewport);

  useEffect(() => {
    const base = montarCena(n, cameras);

    useSceneStore.setState({
      board: { scenes: [base], editingSceneId: base.id, liveSceneId: base.id },
      status: "ready",
      campaignPath: "/perf",
    });
    useCameraLockStore.setState({
      selecionadaId: base.cameras?.[0]?.id ?? null,
      espelhoMestre: false,
      fantasmasVisiveis: true,
    });

    // O palco enquadra a câmera que o robô vai pegar, com folga -- que é onde
    // o mestre está quando mexe numa delas. Um zoom fixo no meio do plano
    // deixava a moldura pela metade fora da tela, e o robô mirava no vazio:
    // a medida saía com sessenta quadros por segundo de tela PARADA, que é o
    // pior resultado possível porque parece o melhor.
    const alvo =
      (gesto === "fantasma" ? base.cameras?.[1] : base.cameras?.[0])?.viewport ??
      FULL_VIEWPORT;
    const folga = 1.45;
    useViewportStore.getState().setViewport(
      clampViewport(
        {
          x: alvo.x + alvo.width / 2 - (alvo.width * folga) / 2,
          y: alvo.y + alvo.height / 2 - (alvo.height * folga) / 2,
          width: alvo.width * folga,
          height: alvo.height * folga,
        },
        PLANO,
      ),
    );

    return () => {
      useViewportStore.getState().setViewport(FULL_VIEWPORT);
      useSceneStore.setState({ board: null, status: "idle", campaignPath: null });
    };
  }, [n, cameras, gesto]);

  if (!cena) return null;

  return (
    <SceneStage viewport={viewport} onViewportChange={setViewport} limites={PLANO}>
      <MestreStage scene={cena} />
      <MaoSintetica gesto={gesto} sonda={sonda} roda={roda} />
    </SceneStage>
  );
}

/**
 * A BANCADA INTEIRA: o `MestreShell` de verdade, com o gesto do robô por cima.
 *
 * O `camera-gesto` monta o palco e mais nada, e diz que arrastar a moldura com
 * cinco câmeras custa sessenta quadros por segundo -- o que é verdade e não é
 * a tela de ninguém. A tela do mestre tem a lista de mapas à esquerda, cada
 * linha com uma prévia que é um `SceneStage` completo; tem a biblioteca e os
 * personagens à direita; tem a régua de câmeras embaixo e a barra de sessão em
 * cima. Todos eles assinam o board -- e o gesto sobre uma câmera grava no
 * board.
 *
 * É por isso que este cenário existe e por que ele monta o `MestreShell` em
 * vez de uma aproximação: o que se quer medir é justamente o que uma
 * aproximação deixa de fora. Sem IPC os nomes vêm vazios e o acervo vem
 * vazio; o que conta -- quantos componentes acordam a cada commit -- é o
 * mesmo.
 *
 * `?mapas=` é quantas cenas o board tem, e portanto quantas linhas com prévia
 * a lista desenha. Sete é o que a captura que motivou a medida mostrava.
 */
function PalcoBancada({
  n,
  cameras,
  gesto,
  mapas,
  noAr,
  painel,
  sonda,
  roda,
}: {
  n: number;
  cameras: number;
  gesto: Gesto;
  mapas: number;
  noAr: boolean;
  painel: "ambos" | "esquerdo" | "direito" | "nenhum";
  sonda: boolean;
  roda: number;
}) {
  const status = useSceneStore((state) => state.status);

  useEffect(() => {
    const primeira = montarCena(n, cameras, noAr);
    // As outras cenas entram VAZIAS e com mapa próprio: é a lista que se quer
    // pesar, não o conteúdo delas -- e uma cena de fundo distinto por linha é
    // o que faz cada prévia decodificar o bitmap dela, como na campanha real.
    const outras = Array.from({ length: Math.max(0, mapas - 1) }, (_, i) => ({
      ...montarCena(0),
      id: `perf-mapa-${i}`,
      name: `Mapa ${i + 2}`,
      backgroundAssetId: `perf-fundo-${i}`,
    }));

    useSceneStore.setState({
      board: {
        scenes: [primeira, ...outras],
        editingSceneId: primeira.id,
        liveSceneId: primeira.id,
      },
      status: "ready",
      campaignPath: "/perf",
    });
    useCameraLockStore.setState({
      selecionadaId: primeira.cameras?.[0]?.id ?? null,
      espelhoMestre: false,
      fantasmasVisiveis: true,
    });

    // As colunas laterais, para a medida poder perguntar o que cada uma custa
    // no gesto. `restored` é o que impede o `restore()` do shell de ler o
    // `localStorage` por cima -- sem ele a medida herdaria a bancada de quem
    // abriu a página por último, e duas corridas mediriam telas diferentes.
    usePanelsStore.setState({
      left: painel === "ambos" || painel === "esquerdo",
      right: painel === "ambos" || painel === "direito",
      restored: true,
    });

    // Os perfis de zoom do palco partem do plano INTEIRO: é de onde a roda
    // começa a subir, e enquadrar uma câmera antes deixaria o `profundo` sem
    // caminho para percorrer -- ele já estaria a meio do teto.
    if ((ZOOM_DO_PALCO as readonly string[]).includes(gesto)) {
      useViewportStore.getState().setViewport(FULL_VIEWPORT);
    } else {
      const alvo =
        (gesto === "fantasma" ? primeira.cameras?.[1] : primeira.cameras?.[0])
          ?.viewport ?? FULL_VIEWPORT;
      const folga = 1.45;
      useViewportStore.getState().setViewport(
        clampViewport(
          {
            x: alvo.x + alvo.width / 2 - (alvo.width * folga) / 2,
            y: alvo.y + alvo.height / 2 - (alvo.height * folga) / 2,
            width: alvo.width * folga,
            height: alvo.height * folga,
          },
          PLANO,
        ),
      );
    }

    return () => {
      useViewportStore.getState().setViewport(FULL_VIEWPORT);
      useSceneStore.setState({ board: null, status: "idle", campaignPath: null });
    };
  }, [n, cameras, gesto, mapas, noAr, painel]);

  if (status !== "ready") return null;

  return (
    <TooltipProvider>
      <MestreShell />
      {/* Fora do `SceneStage`, e sem nada a mudar por isso: a projeção sai do
          DOM nos dois cenários. Ver `projecaoDoDom`. */}
      <MaoSintetica gesto={gesto} sonda={sonda} roda={roda} />
    </TooltipProvider>
  );
}

/**
 * O RETÂNGULO, na tela, da moldura que este gesto vai pegar.
 *
 * Do DOM e não de conta nenhuma: a primeira versão projetava o recorte da
 * câmera em pixels de tela pela escala do palco, e errava -- a webview estava
 * com `devicePixelRatio` 0,7, o plano aplica a ampliação ora em `zoom` ora em
 * `transform`, e reimplementar a projeção do `SceneStage` aqui era manter uma
 * segunda verdade sobre onde as coisas estão. O robô agora faz o que a mão
 * faz: olha onde a moldura ESTÁ desenhada e encosta na borda dela.
 *
 * A moldura selecionada e as apagadas se distinguem pelo `z` que cada uma
 * declara -- `FRAME_Z` em `camera-frame` e `FANTASMA_Z` em `camera-fantasma`.
 * Se um dia mudarem, a medida sai com zero movimentos e a bancada recusa a
 * linha em voz alta, que é o comportamento certo para uma sonda que perdeu o
 * alvo.
 */
function molduraNaTela(gesto: Gesto): DOMRect | null {
  const z = gesto === "fantasma" ? 11_800 : 12_000;
  const caixas = Array.from(
    document.querySelectorAll<HTMLElement>(`div[style*="z-index: ${z}"]`),
  )
    .map((el) => el.getBoundingClientRect())
    // A maior: com várias apagadas na tela, a que dá mais borda para pegar é
    // a que o robô alcança com mais folga.
    .sort((a, b) => b.width * b.height - a.width * a.height);

  return caixas[0] ?? null;
}

/**
 * `nenhum` é a linha de base: a bancada montada, viva, e a mão parada.
 *
 * Sem ela não há como separar "a tela custa caro" de "o gesto custa caro", e
 * as duas pedem conserto em lugares diferentes.
 */
type Gesto =
  | "nenhum"
  | "mover"
  | "redimensionar"
  | "zoom"
  | "fantasma"
  | "cinegrafista"
  | "palco-rapido"
  | "palco-profundo"
  | "palco-variado";

/** Os três são a roda sobre o MAPA, e não sobre a câmera. Ver `PROGRAMA`. */
const ZOOM_DO_PALCO = [
  "palco-rapido",
  "palco-profundo",
  "palco-variado",
] as const;

/**
 * O que a roda faz, segmento a segmento, em cada perfil de zoom do palco.
 *
 * `notches` é quantos passos da roda o segmento tem e para que lado; `pausaMs`
 * é quanto a mão fica parada depois dele. A pausa não é enfeite: o plano de
 * conteúdo volta do `transform` para o `zoom` 350 ms depois da última mudança
 * de recorte, e essa volta é um layout de `1920 × scale` pixels -- a 16x, uma
 * caixa de trinta mil. Um perfil sem pausa nunca paga isso e mediria só metade
 * do que o mestre sente; um perfil só de pausas mediria só a outra metade.
 *
 * `rapido`    vaivém curto e contínuo perto de onde se trabalha. Sem pausa: é
 *             o compositor sozinho, esticando a textura que já tem.
 * `profundo`  do afastado ao teto de 16x e de volta, sem parar no meio. É onde
 *             o raster fica grande o bastante para o motor pintar em pedaços.
 * `variado`   rajadas de tamanhos diferentes com pausas entre elas, em
 *             profundidades diferentes. É o gesto de verdade -- aproxima,
 *             olha, corrige, afasta -- e o único que paga as duas contas.
 */
const PROGRAMA: Record<
  (typeof ZOOM_DO_PALCO)[number],
  { notches: number; pausaMs: number }[]
> = {
  "palco-rapido": [
    { notches: 8, pausaMs: 0 },
    { notches: -8, pausaMs: 0 },
  ],
  // Vinte notches de 1,15 levam de uma vez a dezesseis: `1.15 ** 20` = 16,4.
  "palco-profundo": [
    { notches: 20, pausaMs: 0 },
    { notches: -20, pausaMs: 0 },
  ],
  "palco-variado": [
    { notches: 6, pausaMs: 400 },
    { notches: -3, pausaMs: 400 },
    { notches: 12, pausaMs: 600 },
    { notches: -15, pausaMs: 400 },
    { notches: 4, pausaMs: 0 },
    { notches: -4, pausaMs: 500 },
  ],
};

/**
 * A mão sintética: mira num ponto da tela, pergunta quem está lá e arrasta.
 *
 * A mesma nos dois cenários -- o palco sozinho e a bancada inteira --, porque
 * a comparação entre eles só significa alguma coisa se o gesto for o mesmo.
 * Um robô que arrastasse diferente em cada um mediria duas coisas e as
 * apresentaria como uma.
 *
 * O ponteiro é sintético, e é a única concessão: no Wayland não há como
 * injetar mouse de verdade numa janela, e sem gesto nenhum dos caminhos que
 * interessam roda. O resto é o de sempre -- o robô mira em COORDENADAS DE
 * TELA, pergunta ao `elementFromPoint` quem está lá e despacha nele, então
 * alvo coberto ou fora do recorte reprova aqui como reprovaria na mão.
 */
function MaoSintetica({
  gesto,
  sonda,
  roda,
}: {
  gesto: Gesto;
  sonda: boolean;
  /**
   * Quantos eventos de roda o robô despacha por quadro.
   *
   * Um mouse não emite um notch por quadro: roda de alta resolução e trackpad
   * entregam vários, e quem escuta a roda sem agrupar paga por cada um. Este
   * eixo existe para a medida poder mostrar isso em vez de supor -- e para
   * provar que um agrupamento por quadro segura o caso ruim, que é justamente
   * o que o mestre descreveu ("quando uso o scroll tudo fica muito travado").
   */
  roda: number;
}) {
  useEffect(() => {
    if (gesto === "nenhum") return;

    let vivo = true;
    let quadro = 0;
    let limpar: (() => void) | null = null;

    /**
     * O diário do robô, alcançável de fora.
     *
     * Existe pela mesma razão do `--console` da bancada: um roteiro que não
     * pega a moldura mede uma tela PARADA, e tela parada dá sessenta quadros
     * por segundo e zero por cento de perdidos -- a tabela mais bonita da
     * matriz, dizendo nada. Quem lê a medida tem de conseguir perguntar
     * quantos arrastos o robô de fato completou e em que ele estava mirando,
     * e recusar a célula em que `movimentos` for zero.
     */
    const diario = {
      gesto,
      gestos: 0,
      movimentos: 0,
      /** `tag.classe` do que estava sob a mira. Vazio = nunca achou nada. */
      alvo: "",
      /**
       * A projeção e o ponto do último gesto, para o erro de mira dizer ONDE.
       *
       * "o robô mirou no `main`" não conserta nada sozinho: ou o ponto caiu
       * fora da moldura, ou a moldura não está onde a conta diz. Com a escala,
       * o canto e o ponto em mãos a diferença se lê de relance.
       */
      vista: "",
      ponto: "",
      /** Quanto a câmera andou na cena desde o início, em unidades. */
      andou: 0,
      /**
       * Quantas MUTAÇÕES de DOM o gesto provocou, e onde.
       *
       * É a sonda que separa as duas explicações possíveis para "com os
       * painéis abertos o gesto pesa". Ou o React está mexendo neles a cada
       * quadro -- e aí `fora` sobe junto com o custo, e o conserto é parar de
       * acordá-los --, ou eles não são tocados e o que pesa é o motor compor
       * uma tela com mais coisa -- e aí `fora` fica parado, o conserto é
       * outro, e procurar render seria procurar no lugar errado.
       *
       * Um `MutationObserver` e não contagem de render porque o `Profiler` do
       * React não reporta em build de produção, e é o build de produção que o
       * mestre roda.
       */
      mutacoes: { palco: 0, fora: 0 },
      /**
       * O que muda por quadro, do que mais muda para o que menos muda.
       *
       * Saber QUANTAS mutações há não diz onde mexer; saber que são sempre os
       * mesmos quinze elementos, e que o que muda neles é `style`, diz. E
       * separa as duas famílias de mudança que o motor cobra de forma
       * completamente diferente: `transform` e `opacity` o compositor resolve
       * sozinho, enquanto `left`, `top`, `width` e `height` marcam o documento
       * para refazer o layout -- e layout é do DOCUMENTO INTEIRO, o que
       * explica uma tela com mais painéis pagar mais caro pelo mesmo gesto.
       */
      quemMuda: [] as string[],
    };
    (window as unknown as { __robo?: typeof diario }).__robo = diario;

    /** Por `tag.classe#atributo`, quantas vezes mudou, e se força layout. */
    const contagem = new Map<string, number>();
    /** As propriedades de estilo que marcam o documento para refazer layout. */
    const DE_LAYOUT =
      /(?:^|;)\s*(left|top|right|bottom|width|height|margin|padding|border-width|inset|zoom|font-size|gap)\s*:\s*([^;]*)/g;

    /**
     * As propriedades de layout de um `style`, como texto comparável.
     *
     * A sonda marca LAYOUT quando elas MUDARAM, e não quando existem: uma
     * tarja escrita como caixa de 1px esticada por `transform` tem `width` e
     * `height` no estilo e não mexe em layout nenhum -- e a primeira versão
     * desta sonda a acusava do mesmo crime que ela tinha acabado de deixar de
     * cometer. Uma ferramenta que não distingue o antes do depois não serve
     * para dizer se uma correção funcionou.
     */
    const layoutDe = (estilo: string): string =>
      [...estilo.matchAll(DE_LAYOUT)]
        .map(([, prop, valor]) => `${prop}:${valor.trim()}`)
        .sort()
        .join(";");

    const olheiro = new MutationObserver((registros) => {
      for (const registro of registros) {
        const no =
          registro.target instanceof Element
            ? registro.target
            : registro.target.parentElement;
        // O palco é tudo que está sob o envelope que o Mestre marca; o resto
        // da tela -- colunas, barras, réguas -- é `fora`.
        if (no?.closest("[data-palco]")) diario.mutacoes.palco += 1;
        else diario.mutacoes.fora += 1;

        if (!no) continue;

        const mudouLayout =
          registro.attributeName === "style" &&
          layoutDe(no.getAttribute("style") ?? "") !==
            layoutDe(registro.oldValue ?? "");
        const chave =
          `${no.tagName.toLowerCase()}.${(no.className || "").toString().slice(0, 56)}` +
          ` [${registro.type === "attributes" ? registro.attributeName : registro.type}]` +
          (mudouLayout ? " LAYOUT" : "");
        contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
      }

      diario.quemMuda = [...contagem.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([chave, vezes]) => `${String(vezes).padStart(5)}x ${chave}`);
    });
    // Desligada por padrão, e essa é a diferença entre uma sonda e um viés:
    // ela roda uma regex sobre o `style` de cada mutação, milhares por medida,
    // e esse trabalho entra no mesmo thread que se está cronometrando. Serve
    // para descobrir ONDE mexer; o número que se leva para a tabela sai da
    // corrida sem ela.
    if (sonda)
      olheiro.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
        // Sem o valor ANTIGO não há como saber se a mudança mexeu em layout ou
        // só em `transform`, que é toda a pergunta desta sonda.
        attributeOldValue: true,
      });

    const doPalco = (ZOOM_DO_PALCO as readonly string[]).includes(gesto);

    const ondeEsta = () => {
      // Nos perfis de zoom do palco quem se mexe é o RECORTE DA VISTA, e não
      // nenhuma câmera: perguntar à câmera daria zero e a bancada reprovaria
      // uma medida que estava correndo bem.
      if (doPalco) return useViewportStore.getState().viewport;

      const scene = selectEditingScene(useSceneStore.getState());
      const selecionadaId = useCameraLockStore.getState().selecionadaId;
      const camera =
        gesto === "fantasma"
          ? scene?.cameras?.find((c) => c.id !== selecionadaId)
          : scene?.cameras?.find((c) => c.id === selecionadaId);

      return camera?.viewport ?? null;
    };
    const partida = ondeEsta();

    /**
     * O único ponto em que a medida difere do ponteiro de verdade.
     *
     * `setPointerCapture` recusa um `pointerId` que não pertence a um ponteiro
     * ativo, e o `useSceneDrag` chama isso antes de qualquer coisa: sem o
     * remendo o gesto morre na primeira linha e a medida cronometraria uma
     * tela parada. O que a captura faz é entregar o movimento quando o cursor
     * sai do elemento -- e o robô nunca sai, porque despacha no próprio alvo.
     * Nada do que ela custa entra na conta de nenhum dos dois motores.
     */
    const original = Element.prototype.setPointerCapture;
    const originalSolta = Element.prototype.releasePointerCapture;
    Element.prototype.setPointerCapture = function () {};
    Element.prototype.releasePointerCapture = function () {};

    /**
     * Onde pegar, conforme o gesto -- em ordem de preferência.
     *
     * Uma LISTA e não um ponto: a moldura pode estar com um lado fora da
     * janela, e insistir num único ponto é o que fazia a medida cronometrar
     * uma tela parada sem dizer nada. O robô tenta na ordem e fica no primeiro
     * que esteja dentro da janela e tenha alguém debaixo.
     */
    const mira = (): { x: number; y: number }[] => {
      const caixa = molduraNaTela(gesto);
      if (!caixa) return [];

      // Três pixels para dentro da borda: a faixa de arraste tem catorze, e a
      // mão de verdade encosta aí.
      const d = 3;

      if (gesto === "redimensionar")
        // Os cantos, onde o `TransformHandles` põe as alças de escala.
        return [
          { x: caixa.right, y: caixa.bottom },
          { x: caixa.left, y: caixa.bottom },
          { x: caixa.right, y: caixa.top },
          { x: caixa.left, y: caixa.top },
        ];

      // `mover`, `zoom` e `fantasma` pegam pela borda: qualquer uma das
      // quatro serve.
      return [
        { x: caixa.left + caixa.width / 2, y: caixa.top + d },
        { x: caixa.left + caixa.width / 2, y: caixa.bottom - d },
        { x: caixa.left + d, y: caixa.top + caixa.height / 2 },
        { x: caixa.right - d, y: caixa.top + caixa.height / 2 },
      ];
    };

    const despachar = (
      alvo: Element,
      tipo: string,
      x: number,
      y: number,
      extra: PointerEventInit = {},
    ) => {
      alvo.dispatchEvent(
        new PointerEvent(tipo, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          button: tipo === "pointermove" ? -1 : 0,
          buttons: tipo === "pointerup" ? 0 : 1,
          clientX: x,
          clientY: y,
          ...extra,
        }),
      );
    };

    /** Um gesto completo: pega, arrasta por `PASSOS` quadros, solta. */
    const PASSOS = 90;
    /**
     * O modo cinegrafista: V segurado, o mouse passeia e a roda aproxima.
     *
     * Roteiro próprio porque ele não é um arrasto: nada é apertado, nada é
     * solto, e o `useModoCinegrafista` recusa o movimento se algum botão
     * estiver pressionado (`evento.buttons !== 0`) -- no meio de um arrasto o
     * gesto é do item. Os eventos vão na JANELA, com captura, que é onde ele
     * escuta para ganhar da roda do `SceneStage`.
     *
     * A roda dispara junto com o movimento de propósito: é o que o mestre faz
     * -- aponta para o beco e aproxima -- e é onde ele disse que trava.
     */
    const cinegrafar = () => {
      if (!vivo) return;

      const caixa = molduraNaTela(gesto);
      if (!caixa) {
        quadro = requestAnimationFrame(cinegrafar);
        return;
      }

      diario.gestos += 1;
      diario.vista = `moldura ${caixa.width.toFixed(0)}x${caixa.height.toFixed(0)}@(${caixa.left.toFixed(0)},${caixa.top.toFixed(0)})`;

      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "v", bubbles: true }),
      );

      let passo = 0;
      const centro = {
        x: caixa.left + caixa.width / 2,
        y: caixa.top + caixa.height / 2,
      };

      const passear = () => {
        if (!vivo) return;

        passo += 1;
        const a = (passo / PASSOS) * Math.PI * 2;
        const x = centro.x + Math.cos(a) * 150;
        const y = centro.y + Math.sin(a) * 100;

        const sob = document.elementFromPoint(x, y);
        if (sob) {
          diario.alvo = `${sob.tagName.toLowerCase()}.${(sob.className || "").toString().slice(0, 40)}`;
          diario.ponto = `(${x.toFixed(0)},${y.toFixed(0)}) de ${window.innerWidth}x${window.innerHeight}`;

          sob.dispatchEvent(
            new PointerEvent("pointermove", {
              bubbles: true,
              composed: true,
              pointerId: 1,
              pointerType: "mouse",
              isPrimary: true,
              // Sem botão: com qualquer um apertado o cinegrafista não segue.
              button: -1,
              buttons: 0,
              clientX: x,
              clientY: y,
            }),
          );
          diario.movimentos += 1;

          // A roda a cada quadro, vaivém, como a mão que aproxima e recua.
          for (let i = 0; i < roda; i += 1)
            sob.dispatchEvent(
              new WheelEvent("wheel", {
                bubbles: true,
                cancelable: true,
                composed: true,
                deltaY: passo % 20 < 10 ? -100 : 100,
                clientX: x,
                clientY: y,
              }),
            );

          const agora = ondeEsta();
          if (partida && agora)
            diario.andou = Math.max(
              diario.andou,
              Math.hypot(agora.x - partida.x, agora.y - partida.y) +
                Math.abs(agora.width - partida.width),
            );
        }

        if (passo < PASSOS) {
          quadro = requestAnimationFrame(passear);
          return;
        }

        window.dispatchEvent(
          new KeyboardEvent("keyup", { key: "v", bubbles: true }),
        );
        quadro = requestAnimationFrame(cinegrafar);
      };

      quadro = requestAnimationFrame(passear);
      limpar = () =>
        window.dispatchEvent(
          new KeyboardEvent("keyup", { key: "v", bubbles: true }),
        );
    };

    /**
     * A roda sobre o MAPA, seguindo o programa do perfil.
     *
     * Despacha no que estiver no meio do palco, e não na janela: o
     * `SceneStage` escuta a roda na moldura dele, e um evento na janela não
     * borbulha para lá. Mirar no meio também é o que garante que o zoom tem
     * âncora estável -- a roda amplia em volta do cursor.
     */
    const rodarNoPalco = () => {
      if (!vivo) return;

      const caixa = molduraNaTela("mover");
      const alvoPonto = caixa
        ? { x: caixa.left + caixa.width / 2, y: caixa.top + caixa.height / 2 }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 };

      const sob = document.elementFromPoint(alvoPonto.x, alvoPonto.y);
      if (!sob) {
        quadro = requestAnimationFrame(rodarNoPalco);
        return;
      }

      diario.gestos += 1;
      diario.alvo = `${sob.tagName.toLowerCase()}.${(sob.className || "").toString().slice(0, 40)}`;
      diario.ponto = `(${alvoPonto.x.toFixed(0)},${alvoPonto.y.toFixed(0)}) de ${window.innerWidth}x${window.innerHeight}`;

      const programa = PROGRAMA[gesto as (typeof ZOOM_DO_PALCO)[number]];
      let segmento = 0;
      let dados = 0;

      const passar = () => {
        if (!vivo) return;

        const atual = programa[segmento];
        if (!atual) {
          quadro = requestAnimationFrame(rodarNoPalco);
          return;
        }

        const total = Math.abs(atual.notches);
        const sentido = atual.notches < 0 ? 1 : -1;
        // `deltaY` negativo aproxima, no `SceneStage` como na roda de verdade.

        for (let i = 0; i < roda && dados < total; i += 1, dados += 1)
          sob.dispatchEvent(
            new WheelEvent("wheel", {
              bubbles: true,
              cancelable: true,
              composed: true,
              deltaY: sentido * 100,
              clientX: alvoPonto.x,
              clientY: alvoPonto.y,
            }),
          );

        diario.movimentos += 1;

        const agora = ondeEsta();
        if (partida && agora)
          diario.andou = Math.max(
            diario.andou,
            Math.abs(agora.width - partida.width),
          );

        if (dados < total) {
          quadro = requestAnimationFrame(passar);
          return;
        }

        // Segmento cumprido: a mão para pelo tempo do perfil. É a pausa que
        // faz o plano voltar para o `zoom` e pagar o layout -- ver `PROGRAMA`.
        segmento += 1;
        dados = 0;
        if (atual.pausaMs > 0) {
          window.setTimeout(() => {
            if (vivo) quadro = requestAnimationFrame(passar);
          }, atual.pausaMs);
          return;
        }

        quadro = requestAnimationFrame(passar);
      };

      quadro = requestAnimationFrame(passar);
    };

    const comecar = () => {
      if (!vivo) return;


      let ponto: { x: number; y: number } | null = null;
      let alvo: Element | null = null;

      for (const candidato of mira()) {
        const naJanela =
          candidato.x >= 0 &&
          candidato.y >= 0 &&
          candidato.x < window.innerWidth &&
          candidato.y < window.innerHeight;
        if (!naJanela) continue;

        const achado = document.elementFromPoint(candidato.x, candidato.y);
        if (!achado) continue;

        ponto = candidato;
        alvo = achado;
        break;
      }

      if (!ponto || !alvo) {
        // Nenhuma borda alcançável neste quadro. Tenta no próximo em vez de
        // desistir -- e se nunca der, o diário fica com zero movimentos e a
        // bancada recusa a linha em voz alta.
        quadro = requestAnimationFrame(comecar);
        return;
      }

      diario.gestos += 1;
      diario.alvo = `${alvo.tagName.toLowerCase()}.${(alvo.className || "").toString().slice(0, 40)}`;
      const caixa = molduraNaTela(gesto);
      diario.vista = caixa
        ? `moldura ${caixa.width.toFixed(0)}x${caixa.height.toFixed(0)}@(${caixa.left.toFixed(0)},${caixa.top.toFixed(0)})`
        : "moldura nao encontrada";
      diario.ponto = `(${ponto.x.toFixed(0)},${ponto.y.toFixed(0)}) de ${window.innerWidth}x${window.innerHeight}`;
      despachar(alvo, "pointerdown", ponto.x, ponto.y);

      let passo = 0;
      const andar = () => {
        if (!vivo) return;

        passo += 1;
        const a = (passo / PASSOS) * Math.PI * 2;
        const x = ponto.x + Math.cos(a) * 120;
        const y = ponto.y + Math.sin(a) * 80;

        despachar(alvo, "pointermove", x, y);
        diario.movimentos += 1;

        // O que o gesto MOVEU, e não o que ele despachou: um `pointermove`
        // que o palco recusou conta como movimento e não muda nada, e a
        // diferença entre os dois é a que distingue medir o gesto de medir a
        // tela parada.
        const agora = ondeEsta();
        if (partida && agora)
          diario.andou = Math.max(
            diario.andou,
            Math.hypot(agora.x - partida.x, agora.y - partida.y) +
              Math.abs(agora.width - partida.width),
          );

        // O zoom soma a roda ao arrasto, que é o caso que junta dois emissores
        // no mesmo quadro -- o que o `pedir` da moldura existe para agrupar.
        if (gesto === "zoom")
          for (let i = 0; i < roda; i += 1)
            window.dispatchEvent(
              new WheelEvent("wheel", {
                bubbles: true,
                cancelable: true,
                deltaY: passo % 20 < 10 ? -100 : 100,
                clientX: x,
                clientY: y,
              }),
            );

        if (passo < PASSOS) {
          quadro = requestAnimationFrame(andar);
          return;
        }

        despachar(alvo, "pointerup", x, y);
        // Sem pausa entre um gesto e o outro: a medida quer a mão em
        // movimento pelos oito segundos, e um intervalo parado entraria na
        // média como quadro barato que o mestre não está vivendo.
        quadro = requestAnimationFrame(comecar);
      };

      quadro = requestAnimationFrame(andar);
      limpar = () => despachar(alvo, "pointerup", ponto.x, ponto.y);
    };

    quadro = requestAnimationFrame(
      doPalco ? rodarNoPalco : gesto === "cinegrafista" ? cinegrafar : comecar,
    );

    return () => {
      vivo = false;
      cancelAnimationFrame(quadro);
      limpar?.();
      olheiro.disconnect();
      Element.prototype.setPointerCapture = original;
      Element.prototype.releasePointerCapture = originalSolta;
    };
  }, [gesto, sonda, roda]);

  return null;
}

/**
 * N dados caindo de uma vez, sobre uma cena com N itens parados.
 *
 * Relançados quando todos assentam. Sem isso a medida cronometraria sobretudo
 * mesa parada: uma queda dura uns dois segundos, e o `requestAnimationFrame` do
 * `DadoLayer` MORRE quando o último assenta -- de propósito, e é a razão de a
 * mesa não pagar nada por dado parado. O que se quer medir aqui é a queda.
 */
function PalcoDados({
  n,
  zoom,
}: {
  n: number;
  /** Ampliação do palco. O mestre joga dado com a cena ampliada. */
  zoom: number;
}) {
  const cena = useMemo(() => montarCena(n), [n]);
  const recorte = useMemo(
    () =>
      zoom <= 1
        ? undefined
        : zoomViewport(
            { x: 0, y: 0, width: SCENE_WIDTH, height: SCENE_HEIGHT },
            zoom,
            { x: SCENE_WIDTH / 2, y: SCENE_HEIGHT / 2 },
          ),
    [zoom],
  );

  useEffect(() => {
    const jogar = () => {
      const { lancar } = useDadosStore.getState();

      // Dentro do RECORTE quando o palco está ampliado: com o zoom do mestre a
      // vista é um pedaço pequeno do plano, e dado jogado no canto dele cairia
      // fora da tela -- a medida cronometraria uma cena vazia.
      const area = recorte ?? {
        x: 0,
        y: 0,
        width: SCENE_WIDTH,
        height: SCENE_HEIGHT,
      };
      const folga = Math.min(200, area.width / 5);

      // A bancada mede DESENHO, e o teto da mesa é regra de jogo: sem levantá-lo
      // aqui, `?n=100` cronometraria cinquenta dados e o número diria outra
      // coisa. Ver `TETO_DA_MESA`.
      useDadosStore.getState().definirTeto(Number.POSITIVE_INFINITY);

      for (let i = 0; i < n; i++) {
        lancar(
          ([4, 6, 8, 10, 12, 20] as const)[i % 6],
          area.x + folga + ((i * 137) % Math.max(1, area.width - folga * 2)),
          area.y + folga + ((i * 211) % Math.max(1, area.height - folga * 2)),
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
  }, [n, recorte]);

  return (
    <SceneStage viewport={recorte}>
      <SceneLayer scene={cena} variant="mestre" />
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
    <ul ref={lista} className="scroll-fade w-80 flex-1 overflow-y-auto p-1">
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

/**
 * A lista de cenas ao lado do palco que o mestre está arrastando.
 *
 * A coluna tem largura fixa e existe nas duas corridas: sem isso, `n=0`
 * deixaria o palco mais largo, a escala mudaria, e a comparação mediria layout
 * em vez de custo da lista.
 */
function PalcoComLista({ n, mesmoMapa }: { n: number; mesmoMapa: boolean }) {
  const cenas = useMemo(
    () => Array.from({ length: n }, (_, i) => cenaDaLista(i, mesmoMapa)),
    [n, mesmoMapa],
  );

  return (
    <div className="flex flex-1">
      <aside className="w-[340px] shrink-0 overflow-y-auto border-r border-neutral-800 bg-neutral-950">
        <ul className="p-1">
          {cenas.map((cena) => (
            <li key={cena.id} className="flex items-center gap-2 p-1.5">
              <ScenePreview scene={cena} className="h-8 w-14 shrink-0" />
              <span className="truncate text-xs text-neutral-400">
                {cena.name}
              </span>
            </li>
          ))}
        </ul>
      </aside>

      {/* O mesmo gesto do cenário `arrasto`: um item por quadro, pelo store. */}
      <PalcoMestre n={40} />
    </div>
  );
}

/**
 * A janela de camadas ao lado do palco, com o mesmo gesto de arrasto.
 *
 * A cena sai do store -- a MESMA que `PalcoMestre` monta e mexe --, e não de
 * uma cópia montada aqui: o ponto do cenário é que arrastar um item notifica os
 * assinantes do zustand, e `LayerList` é um deles. Montar cena própria para o
 * painel mediria uma lista parada.
 */
function PalcoComCamadas({ n }: { n: number }) {
  const cena = useSceneStore(selectEditingScene);

  return (
    <div className="flex flex-1">
      <aside className="flex w-[340px] shrink-0 flex-col border-r border-neutral-800 bg-neutral-950">
        {cena ? <LayerList scene={cena} /> : null}
      </aside>

      <PalcoMestre n={n} />
    </div>
  );
}

/**
 * Leitor: um livro aberto, e os degraus de zoom em sequencia.
 *
 * Monta as pecas de baixo do leitor -- `useRolagemDoLivro` e `PaginaFolha` --,
 * e nao o `LeitorLivro`: ele depende da estante e do daemon pelo IPC do Tauri,
 * que nao existe aqui. O documento vem de `/livro/perf`, que o `medir.mjs`
 * serve com `Range` como o daemon faz.
 *
 * O roteiro: abre na pagina pedida, espera tudo pronto, e a cada degrau mede
 * do `setZoom` ate a folha sob os olhos ganhar `data-pronta`, e ate todas as
 * mantidas ganharem. Le o DOM num `requestAnimationFrame`, e nao um callback
 * da folha: e o que a tela mostra que se quer cronometrar. `window.__leitorFase`
 * anuncia "meio" e "fim" de cada degrau para o `medir.mjs` fotografar.
 */
function PalcoLeitor({
  pagina,
  degraus,
  rajada,
}: {
  pagina: number;
  degraus: number[];
  /** Troca de degrau a cada 150 ms sem esperar o anterior, e mede so o fim. */
  rajada: boolean;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [natural, setNatural] = useState<{ largura: number; razao: number } | null>(null);
  const paginas = doc?.numPages ?? 0;
  const { caixa, registrar, atual, mantidas, irPara } = useRolagemDoLivro(paginas);
  const [zoom, setZoom] = useState(degraus[0] ?? 1);
  const largura = natural ? Math.round(natural.largura * zoom) : 0;

  useEffect(() => {
    let ativo = true;

    void (async () => {
      const mod = await pdfjs();
      const aberto = await mod.getDocument({ url: "/livro/perf", ...RUNTIME }).promise;
      const primeira = await aberto.getPage(1);
      const viewport = primeira.getViewport({ scale: 1 });
      if (!ativo) return;

      setNatural({ largura: viewport.width, razao: viewport.height / viewport.width });
      setDoc(aberto);
    })();

    return () => {
      ativo = false;
    };
  }, []);

  const foi = useRef(false);
  useEffect(() => {
    if (foi.current || !doc || largura <= 0) return;

    foi.current = true;
    // As folhas ja existem com altura reservada neste ponto: o `largura > 0`
    // e a mesma condicao que o leitor usa para retomar a pagina lembrada.
    requestAnimationFrame(() => irPara(pagina));
  }, [doc, largura, pagina, irPara]);

  // O que o observador tem AGORA, e nao o que tinha quando o roteiro nasceu:
  // o laco abaixo vive num efeito so, e ler `mantidas` pela closure mediria o
  // conjunto do primeiro render -- a pagina 1, pronta antes do salto.
  const mantidasRef = useRef(mantidas);
  const atualRef = useRef(atual);
  useEffect(() => {
    mantidasRef.current = mantidas;
    atualRef.current = atual;
  }, [mantidas, atual]);

  useEffect(() => {
    // Para o `medir.mjs` dizer onde o roteiro parou quando estoura o prazo.
    (window as unknown as { __leitorEstado?: () => unknown }).__leitorEstado = () => ({
      aberto: Boolean(doc),
      paginas,
      natural,
      largura,
      atual: atualRef.current,
      mantidas: [...mantidasRef.current],
      prontas: [...(caixa.current?.querySelectorAll<HTMLElement>("[data-pronta]") ?? [])].map(
        (folha) => Number(folha.dataset.pagina),
      ),
    });
  }, [doc, paginas, natural, largura, caixa]);

  // O roteiro, num laco so: espera a abertura na pagina pedida ficar pronta, e
  // entao um degrau por vez.
  useEffect(() => {
    if (!doc || largura <= 0) return;

    let vivo = true;
    let quadro = 0;
    let espera = 0;
    const passos: Passo[] = [];
    let estado: "abrindo" | "esperando" | "medindo" | "fim" = "abrindo";
    let proximo = 0;
    let inicio = 0;
    let atualMs: number | null = null;
    // As folhas que o degrau tem de pintar: fixadas no instante em que ele
    // comeca, porque a lista de mantidas muda quando uma folha corrige a
    // propria altura ao desenhar.
    let alvo: number[] = [];

    const fase = (texto: string) => {
      (window as unknown as { __leitorFase?: string }).__leitorFase = texto;
    };

    const prontas = (numeros: number[]) => {
      const raiz = caixa.current;
      let mp = 0;
      let todas = numeros.length > 0;
      let atualPronta = false;
      for (const numero of numeros) {
        const folha = raiz?.querySelector<HTMLElement>(`[data-pagina="${numero}"]`);
        const pronta = folha?.dataset.pronta === "1";
        if (numero === atualRef.current) atualPronta = pronta;
        if (!pronta) todas = false;
        // So o canvas visivel: a folha tem dois, e o de fundo pode estar
        // encolhido a 0x0 ou com o degrau anterior.
        const canvas = folha?.querySelector<HTMLCanvasElement>("canvas:not(.invisible)");
        if (pronta && canvas) mp += (canvas.width * canvas.height) / 1e6;
      }

      return { atualPronta, todas, mp: Number(mp.toFixed(1)) };
    };

    const iniciarDegrau = () => {
      if (!vivo) return;

      if (proximo >= degraus.length) {
        estado = "fim";
        (window as unknown as { __resultado?: unknown }).__resultado = {
          rotulo: "chrome",
          cenario: "leitor",
          n: pagina,
          paginas,
          passos,
          fps: 0,
          p50: 0,
          p95: 0,
          pior: 0,
          perdidosPct: 0,
          quadros: 0,
          dpr: window.devicePixelRatio,
          ua: navigator.userAgent,
          em: new Date().toISOString(),
        };
        fase("pronto");
        return;
      }

      alvo = [...mantidasRef.current];
      atualMs = null;
      estado = "medindo";
      inicio = performance.now();
      setZoom(degraus[proximo]);
      fase(`${degraus[proximo]}:meio`);

      // Rajada: o proximo degrau vem por relogio, no meio do render deste. So
      // o ULTIMO degrau e medido ate "todas"; os outros registram o que
      // conseguiram em 150 ms, que e o que interessa -- foram cancelados.
      if (rajada && proximo < degraus.length - 1) {
        espera = window.setTimeout(() => {
          if (!vivo || estado !== "medindo") return;
          const { atualPronta, todas, mp } = prontas(alvo);
          const agora = performance.now() - inicio;
          passos.push({
            zoom: degraus[proximo],
            atualMs: atualPronta ? (atualMs ?? Math.round(agora)) : -1,
            todasMs: todas ? Math.round(agora) : -1,
            mp,
            mantidas: alvo.length,
          });
          proximo += 1;
          iniciarDegrau();
        }, 150);
      }
    };

    const passo = () => {
      if (!vivo) return;

      if (estado === "abrindo") {
        // A pagina pedida em vista e tudo pintado. Nao `atual === pagina`: o
        // salto encosta a pagina no topo, e quem cruza a linha do meio da caixa
        // e a seguinte -- o que e correto para "onde estou lendo", e errado
        // como condicao de partida.
        const emVista = [...mantidasRef.current];
        if (emVista.includes(pagina) && prontas(emVista).todas) {
          estado = "esperando";
          espera = window.setTimeout(iniciarDegrau, 300);
        }
      } else if (estado === "medindo") {
        const { atualPronta, todas, mp } = prontas(alvo);
        const agora = performance.now() - inicio;
        if (atualPronta && atualMs === null) atualMs = Math.round(agora);
        if (todas) {
          passos.push({
            zoom: degraus[proximo],
            atualMs: atualMs ?? Math.round(agora),
            todasMs: Math.round(agora),
            mp,
            mantidas: alvo.length,
          });
          fase(`${degraus[proximo]}:fim`);
          proximo += 1;
          estado = "esperando";
          espera = window.setTimeout(iniciarDegrau, 400);
        }
      }

      quadro = requestAnimationFrame(passo);
    };

    quadro = requestAnimationFrame(passo);

    return () => {
      vivo = false;
      cancelAnimationFrame(quadro);
      clearTimeout(espera);
    };
    // `largura > 0` e nao `largura`: o proprio roteiro muda a largura a cada
    // degrau, e reiniciar o efeito nisso zeraria a medida no meio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, largura > 0, degraus, pagina, paginas, caixa, rajada]);

  return (
    <div ref={caixa} className="flex-1 overflow-y-auto bg-neutral-800 p-4">
      {doc && natural && largura > 0
        ? Array.from({ length: paginas }, (_, i) => i + 1).map((numero) => (
            <div key={numero} className="mb-3">
              <PaginaFolha
                doc={doc}
                numero={numero}
                largura={largura}
                razaoPadrao={natural.razao}
                desenhar={mantidas.has(numero)}
                prioridade={Math.abs(numero - atual)}
                registrar={registrar(numero)}
                lupa={false}
                ampliacao={3}
                aoAmpliar={() => undefined}
              />
            </div>
          ))
        : null}
    </div>
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
  const movidos =
    params.get("movidos") === "todos" ? n : Number(params.get("movidos") ?? 1);
  /** `biblioteca`: com ou sem os atributos de `MINIATURA`, e percorrendo ou não. */
  /** `jogador`: pedir a variante `tela` ou o arquivo inteiro. */
  const comVariante = params.get("variante") !== "0";
  /** `dados`: ampliação do palco, que é o que estoura o backing do canvas. */
  const zoomDoPalco = Number(params.get("zoom") ?? 1);
  const lazy = params.get("lazy") !== "0";
  const rolar = params.get("rolar") === "1";
  /** `leitor`: onde abrir e que degraus de zoom percorrer. */
  const pagina = Number(params.get("pagina") ?? 20);
  const degraus = useMemo(
    () => (params.get("degraus") ?? "0.5,1,2,3,1").split(",").map(Number),
    [params],
  );
  const rajada = params.get("rajada") === "1";
  /** `mestre-camera`: quantas câmeras salvas a cena tem. Uma é a moldura. */
  const cameras = Number(params.get("cameras") ?? 1);
  /** `camera-gesto` e `bancada`: qual gesto sobre a moldura o robô repete. */
  const gesto = (params.get("gesto") ?? "mover") as Gesto;
  /** `bancada`: quantas cenas o board tem, e portanto quantas linhas na lista. */
  const mapas = Number(params.get("mapas") ?? 7);
  /** `bancada`: a câmera que o robô pega está transmitindo? Padrão: está. */
  const noAr = params.get("noar") !== "0";
  /**
   * Liga o `MutationObserver` que conta o que muda por quadro.
   *
   * Desligado por padrão: ele custa, e o custo cai dentro da medida.
   */
  const sonda = params.get("sonda") === "1";
  /** Quantos eventos de roda por quadro o robô despacha. Ver `MaoSintetica`. */
  const roda = Math.max(1, Number(params.get("roda") ?? 1));
  /** `bancada`: que colunas laterais ficam à vista. */
  const painel = (params.get("painel") ?? "ambos") as
    | "ambos"
    | "esquerdo"
    | "direito"
    | "nenhum";

  const { resultado, decorrido } = useMedida(cenario, n, segundos, rotulo);

  useEffect(() => {
    // O `leitor` escreve o proprio resultado, com outra forma; o relogio de
    // quadros aqui e so o HUD.
    if (!resultado || cenario === "leitor") return;

    // O contrato com o `medir.mjs`: ele espera este objeto aparecer.
    (window as unknown as { __resultado?: Resultado }).__resultado = resultado;
  }, [resultado, cenario]);

  useEffect(() => {
    /**
     * O store dos dados, alcançável de fora.
     *
     * Existe para o teste de GESTO: pegar um dado e arremessar é ponteiro, e a
     * única forma de verificar isso sem mão humana é despachar os eventos pelo
     * protocolo de depuração e depois perguntar ao store o que aconteceu. Sem
     * isto, "o dado travou na mão" só se descobre no aplicativo, com o mestre
     * reclamando -- que foi exatamente como se descobriu.
     */
    (window as unknown as { __dados?: () => unknown }).__dados = () => {
      const { dados, naMao, arremesso } = useDadosStore.getState();

      // Id e instante de cada dado, e não só a contagem: relançar no lugar
      // troca o dado por um novo, e a contagem não muda -- foi o que fez a
      // primeira versão deste teste dizer "não relançou" sobre um relance que
      // tinha acontecido.
      return {
        dados: dados.map((dado) => ({
          id: dado.id,
          lancadoEm: dado.lancadoEm,
        })),
        naMao,
        arremesso,
      };
    };
  }, []);

  return (
    <main className="flex h-dvh flex-col bg-black">
      {cenario === "leitor" ? (
        <PalcoLeitor pagina={pagina} degraus={degraus} rajada={rajada} />
      ) : cenario === "arrasto" ? (
        <PalcoMestre n={n} />
      ) : cenario === "camera" ? (
        <PalcoCamera n={n} />
      ) : cenario === "mestre-camera" ? (
        <PalcoMestreCamera n={n} cameras={cameras} />
      ) : cenario === "camera-gesto" ? (
        <PalcoGestoDeCamera
          n={n}
          cameras={cameras}
          gesto={gesto}
          sonda={sonda}
          roda={roda}
        />
      ) : cenario === "bancada" ? (
        <PalcoBancada
          n={n}
          cameras={cameras}
          gesto={gesto}
          mapas={mapas}
          noAr={noAr}
          painel={painel}
          sonda={sonda}
          roda={roda}
        />
      ) : cenario === "dados" ? (
        <PalcoDados n={n} zoom={zoomDoPalco} />
      ) : cenario === "lista" || cenario === "lista-mesmo-mapa" ? (
        <PalcoComLista n={n} mesmoMapa={cenario === "lista-mesmo-mapa"} />
      ) : cenario === "camadas" ? (
        <PalcoComCamadas n={n} />
      ) : cenario === "biblioteca" ? (
        <PalcoBiblioteca n={n} lazy={lazy} rolar={rolar} />
      ) : (
        <PalcoEspectador
          n={n}
          identidade={cenario === "amostras-id"}
          movidos={movidos}
          variante={cenario === "jogador" && comVariante ? "tela" : undefined}
          mapaGrande={cenario === "jogador"}
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
