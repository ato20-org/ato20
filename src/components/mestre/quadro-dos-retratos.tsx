"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Eye, EyeOff, FlipHorizontal, Group, Trash2 } from "lucide-react";

import { ItensDeExtensao } from "@/components/mestre/itens-de-extensao";
import { PortraitAnchors } from "@/components/playground/portrait-anchors";
import { PortraitLayer } from "@/components/playground/portrait-layer";
import { PalcoSoTela } from "@/components/playground/scene-stage";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { KIT_CONTEXTO } from "@/components/ui/menu-kit";
import { useCharacters } from "@/hooks/use-characters";
import { useFontesDeRetrato } from "@/hooks/use-fontes-de-retrato";
import {
  boundsToBox,
  boxBounds,
  translateBounds,
  type Bounds,
} from "@/lib/geometry/bounds";
import {
  areasDeRetrato,
  portraitBox,
  portraitsBounds,
  retratosDaCena,
  scalePortraitGroup,
} from "@/lib/geometry/portrait";
import { computeSnap, SNAP_THRESHOLD_PX, type Guide } from "@/lib/geometry/snap";
import { removePortraitSelection } from "@/lib/mestre/item-actions";
import { uniaoDoRetrato } from "@/lib/mestre/unioes";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import { useRolagensStore } from "@/lib/store/use-rolagens-store";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { cn } from "@/lib/utils";
import {
  itensVisiveis,
  type AncoraRetrato,
  type Portrait,
  type UniaoDeRetratos,
  type Viewport,
} from "@/types/scene";

/** Acima dos retratos e das seis áreas: é o que o mestre está pegando. */
const SELECAO_Z = 20_000;

/** Abaixo disto o gesto é clique, e não arrasto. Em pixel de tela. */
const FOLGA_DO_CLIQUE = 4;

/** O menor lado que uma alça deixa sobrar, em pixel do quadro. */
const LADO_MINIMO = 12;

/** Os quatro cantos, pelo lado para onde cada um puxa. */
const CANTOS = [
  { sx: -1, sy: -1, cursor: "nwse-resize" },
  { sx: 1, sy: -1, cursor: "nesw-resize" },
  { sx: -1, sy: 1, cursor: "nesw-resize" },
  { sx: 1, sy: 1, cursor: "nwse-resize" },
] as const;

type Canto = (typeof CANTOS)[number];

/**
 * A tela da mesa em miniatura, com os retratos onde a mesa vai vê-los.
 *
 * Era o palco do Mestre que fazia isto: os retratos apareciam sobre o mapa
 * enquanto a aba Retratos estava aberta, e eram arrastados e escalados ali. O
 * mapa é o assunto daquele palco, e as cabeças flutuando sobre ele competiam
 * com o que o mestre estava montando. Aqui a tela é lisa e só tem os retratos.
 *
 * O desenho é o da mesa, e não um esquema: `PalcoSoTela` com o `PortraitLayer`
 * no espaço `tela`, o mesmo par do kit de retratos. Medidores, nome, selos e o
 * dado caindo no rosto aparecem como a TV os mostra, e os fora do ar aparecem
 * apagados -- é aqui que o mestre os posiciona antes de mostrar.
 *
 * ## Por que o gesto é próprio
 *
 * O `TransformHandles` do palco usa `useSceneDrag`, e ele captura o ponteiro no
 * CHÃO quando há um tripé no ar. Aqui não há chão nenhum: o arrasto sairia na
 * régua de outro elemento. A conta deste quadro é mais simples que a do palco
 * -- um pixel daqui dividido pela largura dele é a fração que o retrato guarda
 * --, e ela cabe em três gestos: mover, escalar pelo canto e levar uma união
 * para outra área.
 */
export function QuadroDosRetratos() {
  const scene = useSceneStore(selectEditingScene);
  const { personagens } = useCharacters();
  const guardados = usePortraitStore((state) => state.portraits);
  const layoutDaSessao = usePortraitStore((state) => state.layout);
  const unioes = usePortraitStore((state) => state.unioes);
  const updateMany = usePortraitStore((state) => state.updateMany);
  const unir = usePortraitStore((state) => state.unir);
  const ajustarUniao = usePortraitStore((state) => state.ajustar);
  const fontes = useFontesDeRetrato();
  // O dado cai no rosto aqui também: tirado do mapa do Mestre, este é o único
  // lugar em que ele vê de quem foi a rolagem. A fileira do canto continua.
  const bandeja = useRolagensStore((state) => state.bandeja);

  const selecionados = useSelectionStore((state) => state.selectedPortraitIds);
  const selectPortrait = useSelectionStore((state) => state.selectPortrait);
  const selectPortraits = useSelectionStore((state) => state.selectPortraits);
  const togglePortrait = useSelectionStore((state) => state.togglePortrait);

  const quadroRef = useRef<HTMLDivElement | null>(null);
  const [tamanho, setTamanho] = useState<{
    largura: number;
    altura: number;
  } | null>(null);

  useEffect(() => {
    const no = quadroRef.current;
    if (!no) return;

    // `client*`, sem a borda: é a caixa em que o `PalcoSoTela` se posiciona.
    const medir = () =>
      setTamanho((antes) =>
        antes?.largura === no.clientWidth && antes.altura === no.clientHeight
          ? antes
          : { largura: no.clientWidth, altura: no.clientHeight },
      );

    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(no);

    return () => observador.disconnect();
  }, []);

  /** A régua: a tela da mesa em pixel deste quadro, ancorada na origem. */
  const tela = useMemo<Viewport | null>(
    () =>
      tamanho && tamanho.largura > 0 && tamanho.altura > 0
        ? { x: 0, y: 0, width: tamanho.largura, height: tamanho.altura }
        : null,
    [tamanho],
  );

  /**
   * Os retratos da cena em edição, pela mesma função do publicador.
   *
   * Com os medidores ESCONDIDOS, como o palco do Mestre os pedia: eles desenham
   * apagados, e o mestre precisa vê-los sem que a mesa veja.
   */
  const portraits = useMemo(
    () =>
      retratosDaCena(
        guardados,
        itensVisiveis(scene?.items ?? [], scene?.grupos),
        personagens ?? [],
        fontes,
        true,
        layoutDaSessao,
      ),
    [guardados, scene?.items, scene?.grupos, personagens, fontes, layoutDaSessao],
  );

  const escolhidos = portraits.filter((portrait) =>
    selecionados.includes(portrait.id),
  );

  /** Os membros de uma união que estão NO AR, na ordem dela. */
  const membrosNoAr = (uniao: UniaoDeRetratos): Portrait[] =>
    uniao.retratos
      .map((id) => portraits.find((atual) => atual.id === id))
      .filter((atual): atual is Portrait => Boolean(atual?.visible));

  /**
   * A união inteiramente escolhida, se a escolha for exatamente uma.
   *
   * Numa união, a alça manda no tamanho e a união manda na posição: deixar as
   * duas escreverem no mesmo quadro faria o retrato pular de volta para a fila.
   */
  const uniaoEscolhida =
    unioes.find((uniao) => {
      const membros = membrosNoAr(uniao);

      return (
        membros.length > 0 &&
        membros.length === selecionados.length &&
        membros.every((retrato) => selecionados.includes(retrato.id))
      );
    }) ?? null;

  const [guias, setGuias] = useState<Guide[]>([]);
  /** A área sob o ponteiro enquanto uma união é levada. `null` fora do gesto. */
  const [areaDaUniao, setAreaDaUniao] = useState<AncoraRetrato | null>(null);
  const [levandoUniao, setLevandoUniao] = useState(false);

  /**
   * O botão direito caiu num retrato. O menu só abre nesse caso: no vazio do
   * quadro não há nada a oferecer.
   */
  const menuNoRetrato = useRef(false);
  const [menuAberto, setMenuAberto] = useState(false);

  /** Ponteiro em pixel do quadro. */
  function noQuadro(clientX: number, clientY: number) {
    const caixa = quadroRef.current?.getBoundingClientRect();

    return {
      x: clientX - (caixa?.left ?? 0),
      y: clientY - (caixa?.top ?? 0),
    };
  }

  function aoApertarRetrato(event: ReactPointerEvent, portrait: Portrait) {
    const jaEscolhido = selecionados.includes(portrait.id);

    if (event.button === 2) {
      // Aponta para o clicado, sem desfazer uma escolha de vários que já o
      // inclua: é o que casa o que o menu diz com o que ele faz.
      event.stopPropagation();
      menuNoRetrato.current = true;
      if (!jaEscolhido) selectPortrait(portrait.id);
      return;
    }

    if (event.button !== 0) return;

    if (event.shiftKey) {
      event.stopPropagation();
      togglePortrait(portrait.id);
      return;
    }

    // Retrato de união não se mexe sozinho: o clique escolhe a união inteira,
    // e arrastar a leva para outra área. Fora do ar não -- aí ele é o fantasma
    // que o mestre posiciona à mão, e a união não governa quem ninguém vê.
    const uniao = portrait.visible
      ? uniaoDoRetrato(unioes, portrait.id)
      : null;

    if (uniao) {
      selectPortraits(membrosNoAr(uniao).map((atual) => atual.id));
      levarUniao(event, uniao);
      return;
    }

    // Arrastar um dos escolhidos leva todos: quem escolheu vários quer mexer
    // nos vários.
    const movendo = jaEscolhido ? escolhidos : [portrait];
    if (!jaEscolhido) selectPortrait(portrait.id);

    mover(event, movendo);
  }

  function aoApertarFundo(event: ReactPointerEvent) {
    menuNoRetrato.current = false;

    // Só quando há retrato escolhido: escolher limpa a seleção do palco, e um
    // clique no vazio daqui não pode desfazer o que o mestre marcou no mapa.
    if (event.button === 0 && !event.shiftKey && selecionados.length > 0)
      selectPortraits([]);
  }

  /**
   * Arrasta os retratos, alinhando aos outros e às bordas da tela.
   *
   * Alt desliga o alinhamento, como no palco.
   */
  function mover(event: ReactPointerEvent, movendo: Portrait[]) {
    if (!tela) return;

    const caixa = portraitsBounds(movendo, tela);
    if (!caixa) return;

    const origens = movendo.map(({ id, x, y }) => ({ id, x, y }));
    const ids = new Set(origens.map((origem) => origem.id));
    const alvos = portraits
      .filter((atual) => !ids.has(atual.id))
      .map((atual) => boxBounds(portraitBox(atual, tela)));
    const moldura: Bounds = {
      minX: 0,
      minY: 0,
      maxX: tela.width,
      maxY: tela.height,
    };

    seguir(
      event,
      (dx, dy, nativo) => {
        let x = dx;
        let y = dy;

        if (nativo.altKey) setGuias([]);
        else {
          const encaixe = computeSnap(
            translateBounds(caixa, dx, dy),
            alvos,
            SNAP_THRESHOLD_PX,
            moldura,
          );

          x += encaixe.dx;
          y += encaixe.dy;
          setGuias(encaixe.guides);
        }

        updateMany(
          origens.map((origem) => ({
            id: origem.id,
            patch: {
              x: origem.x + x / tela.width,
              y: origem.y + y / tela.height,
            },
          })),
        );
      },
      () => setGuias([]),
    );
  }

  /**
   * Escala pelo canto, com a proporção travada: retrato deformado fica
   * grotesco. Um fator só para todos os escolhidos, tirado do lado que mais
   * andou -- escalar cada rosto à mão sempre termina com um maior que o outro
   * sem motivo.
   */
  function escalar(event: ReactPointerEvent, canto: Canto) {
    if (!tela || escolhidos.length === 0) return;

    const inicio = portraitsBounds(escolhidos, tela);
    if (!inicio) return;

    const congelados = escolhidos;
    const soTamanho = uniaoEscolhida !== null;
    const largura = inicio.maxX - inicio.minX;
    const altura = inicio.maxY - inicio.minY;
    if (largura <= 0 || altura <= 0) return;

    // O canto oposto fica parado.
    const fixoX = canto.sx > 0 ? inicio.minX : inicio.maxX;
    const fixoY = canto.sy > 0 ? inicio.minY : inicio.maxY;
    const fatorMinimo = LADO_MINIMO / Math.min(largura, altura);

    seguir(event, (dx, dy) => {
      const fator = Math.max(
        fatorMinimo,
        (largura + canto.sx * dx) / largura,
        (altura + canto.sy * dy) / altura,
      );
      const novaLargura = largura * fator;
      const novaAltura = altura * fator;
      const minX = canto.sx > 0 ? fixoX : fixoX - novaLargura;
      const minY = canto.sy > 0 ? fixoY : fixoY - novaAltura;

      const escalados = scalePortraitGroup(
        congelados,
        inicio,
        { minX, minY, maxX: minX + novaLargura, maxY: minY + novaAltura },
        tela,
      );

      updateMany(
        soTamanho
          ? escalados.map(({ id, patch }) => ({
              id,
              patch: { width: patch.width, height: patch.height },
            }))
          : escalados,
      );
    });
  }

  /**
   * Leva uma união para outra área.
   *
   * A união não segue o ponteiro: as seis áreas acendem, a de baixo do cursor
   * destaca, e soltar troca a âncora. Só depois de o ponteiro andar -- o clique
   * parado é para escolher a união, e soltá-lo numa área vizinha a trocaria sem
   * o mestre pedir.
   */
  function levarUniao(event: ReactPointerEvent, uniao: UniaoDeRetratos) {
    if (!tela) return;

    const areas = areasDeRetrato(tela);
    const sob = (clientX: number, clientY: number) => {
      const ponto = noQuadro(clientX, clientY);

      return (
        areas.find(
          ({ box }) =>
            ponto.x >= box.x &&
            ponto.x <= box.x + box.width &&
            ponto.y >= box.y &&
            ponto.y <= box.y + box.height,
        )?.ancora ?? null
      );
    };

    let andou = false;

    seguir(
      event,
      (dx, dy, nativo) => {
        if (!andou && Math.hypot(dx, dy) < FOLGA_DO_CLIQUE) return;

        andou = true;
        setLevandoUniao(true);
        setAreaDaUniao(sob(nativo.clientX, nativo.clientY));
      },
      (nativo) => {
        if (andou) {
          const escolhida = sob(nativo.clientX, nativo.clientY);
          if (escolhida) ajustarUniao(uniao.id, { ancora: escolhida });
        }

        setLevandoUniao(false);
        setAreaDaUniao(null);
      },
    );
  }

  const caixaDaEscolha = tela ? portraitsBounds(escolhidos, tela) : null;
  const rotulo =
    escolhidos.length > 1
      ? uniaoEscolhida
        ? `${uniaoEscolhida.nome} · ${escolhidos.length}`
        : `${escolhidos.length} retratos`
      : null;

  const todosEspelhados =
    escolhidos.length > 0 && escolhidos.every((retrato) => retrato.flipX);
  const todosNoAr =
    escolhidos.length > 0 && escolhidos.every((retrato) => retrato.visible);

  return (
    <ContextMenu
      open={menuAberto}
      // A seleção pelo store, e não pela do render: o botão direito escolhe o
      // retrato no `pointerdown`, e o `contextmenu` chega logo atrás.
      onOpenChange={(aberto) =>
        setMenuAberto(
          aberto &&
            menuNoRetrato.current &&
            useSelectionStore.getState().selectedPortraitIds.length > 0,
        )
      }
    >
      <ContextMenuTrigger
        render={
          // `ring` e não `border`: a borda come do 16:9 por dentro, e a régua
          // do retrato é a proporção exata da tela da mesa.
          <div
            ref={quadroRef}
            role="group"
            aria-label="Tela da mesa"
            className="bg-muted/30 ring-border relative isolate aspect-video w-full touch-none overflow-hidden rounded-md ring-1"
            onPointerDown={aoApertarFundo}
          >
            {tamanho ? (
              <PalcoSoTela largura={tamanho.largura} altura={tamanho.altura}>
                <PortraitLayer
                  portraits={portraits}
                  variant="mestre"
                  espaco="tela"
                  rolagens={bandeja}
                  onPortraitPointerDown={aoApertarRetrato}
                />

                {levandoUniao && tela ? (
                  <PortraitAnchors camera={tela} alvo={areaDaUniao} />
                ) : null}

                {uniaoEscolhida && !levandoUniao && tela ? (
                  <AreasDaUniao
                    uniao={uniaoEscolhida}
                    tela={tela}
                    onEscolher={(ancora) =>
                      ajustarUniao(uniaoEscolhida.id, { ancora })
                    }
                  />
                ) : null}

                {guias.map((guia) => (
                  <div
                    key={`${guia.axis}:${guia.position}`}
                    aria-hidden
                    className="bg-primary pointer-events-none absolute"
                    style={
                      guia.axis === "x"
                        ? { left: guia.position, top: 0, width: 1, height: "100%", zIndex: SELECAO_Z }
                        : { top: guia.position, left: 0, height: 1, width: "100%", zIndex: SELECAO_Z }
                    }
                  />
                ))}

                {caixaDaEscolha && !levandoUniao ? (
                  <Escolha
                    caixa={caixaDaEscolha}
                    rotulo={rotulo}
                    onEscalar={escalar}
                  />
                ) : null}
              </PalcoSoTela>
            ) : null}

            {portraits.length === 0 ? (
              <p className="text-muted-foreground pointer-events-none absolute inset-0 grid place-items-center p-4 text-center text-[11px] leading-snug">
                Nenhum retrato nesta cena. Ligue o olho de alguém no Elenco.
              </p>
            ) : null}
          </div>
        }
      />

      {menuAberto ? (
        <ContextMenuContent className="w-52">
          <ContextMenuItem
            onClick={() =>
              updateMany(
                escolhidos.map((retrato) => ({
                  id: retrato.id,
                  patch: { visible: !todosNoAr },
                })),
              )
            }
          >
            {todosNoAr ? <EyeOff /> : <Eye />}
            {todosNoAr ? "Tirar do ar" : "Pôr no ar"}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() =>
              updateMany(
                escolhidos.map((retrato) => ({
                  id: retrato.id,
                  patch: { flipX: !todosEspelhados },
                })),
              )
            }
          >
            <FlipHorizontal />
            Espelhar
          </ContextMenuItem>
          {escolhidos.length > 1 && !uniaoEscolhida ? (
            <ContextMenuItem
              onClick={() => unir(escolhidos.map((retrato) => retrato.id))}
            >
              <Group />
              Unir os {escolhidos.length}
            </ContextMenuItem>
          ) : null}

          {/* O alvo continua `palco.retrato`: é o botão direito no retrato, e
              o plugin que já se pendurou nele não precisa saber que o retrato
              mudou de tela. */}
          <ItensDeExtensao
            alvo="palco.retrato"
            contexto={{ alvo: "palco.retrato", retratoIds: selecionados }}
            kit={KIT_CONTEXTO}
          />

          <ContextMenuSeparator />
          {/* Mesma ação do Delete: implementações separadas divergem no
              primeiro ajuste. */}
          <ContextMenuItem variant="destructive" onClick={removePortraitSelection}>
            <Trash2 />
            Esquecer a posição
          </ContextMenuItem>
        </ContextMenuContent>
      ) : null}
    </ContextMenu>
  );
}

/** O nome de cada área, para o rótulo do alvo. */
const LUGAR: Record<AncoraRetrato, string> = {
  "cima-esquerda": "cima, à esquerda",
  "cima-centro": "cima, ao centro",
  "cima-direita": "cima, à direita",
  "baixo-esquerda": "baixo, à esquerda",
  "baixo-centro": "baixo, ao centro",
  "baixo-direita": "baixo, à direita",
};

/**
 * As seis áreas de uma união escolhida, com um alvo no meio de cada.
 *
 * Com a união na mão, a pergunta seguinte é "para onde ela vai", e as áreas
 * só apareciam no meio de um arrasto -- quem clicava na união e soltava não
 * via para onde podia mandá-la. Agora elas ficam à vista enquanto a união
 * está escolhida, e um clique no alvo basta.
 *
 * O contorno fica ATRÁS dos retratos e não ouve o ponteiro: a área cobre um
 * terço da tela, e clicar no vazio dela tem de continuar desescolhendo. Quem
 * escolhe é o alvo, pequeno e na frente.
 */
function AreasDaUniao({
  uniao,
  tela,
  onEscolher,
}: {
  uniao: UniaoDeRetratos;
  tela: Viewport;
  onEscolher: (ancora: AncoraRetrato) => void;
}) {
  return (
    <>
      {areasDeRetrato(tela).map(({ ancora, box }) => {
        const atual = uniao.ancora === ancora;

        return (
          <div key={ancora}>
            <div
              aria-hidden
              className={cn(
                "border-primary/40 pointer-events-none absolute rounded-sm border border-dashed",
                atual ? "bg-primary/15" : "bg-primary/5",
              )}
              style={{
                left: box.x,
                top: box.y,
                width: box.width,
                height: box.height,
                zIndex: 1,
              }}
            />
            <button
              type="button"
              aria-label={`Levar ${uniao.nome} para ${LUGAR[ancora]}`}
              aria-pressed={atual}
              className={cn(
                "absolute flex h-5 -translate-x-1/2 -translate-y-1/2 items-center rounded-full border px-1 text-[9px] leading-none shadow-sm transition-colors",
                atual
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-primary/60 bg-background/90 text-foreground hover:bg-primary/30",
              )}
              style={{
                left: box.x + box.width / 2,
                top: box.y + box.height / 2,
                zIndex: SELECAO_Z,
              }}
              // Para aqui: sem isto o fundo do quadro desescolheria a união no
              // mesmo toque que a manda para outra área.
              onPointerDown={(evento) => evento.stopPropagation()}
              onClick={() => onEscolher(ancora)}
            >
              {/* As duas setas, como no seletor da aba Posição: uma só deixaria
                  "cima, à esquerda" igual a "baixo, à esquerda". */}
              {ancora.startsWith("cima") ? "▲" : "▼"}
              {ancora.endsWith("esquerda")
                ? "◀"
                : ancora.endsWith("direita")
                  ? "▶"
                  : "●"}
            </button>
          </div>
        );
      })}
    </>
  );
}

/**
 * O contorno do que está na mão e as quatro alças de canto.
 *
 * O rótulo vai por cima da caixa, e para dentro dela quando a caixa encosta no
 * alto do quadro -- a união no canto de cima é o caso comum, e o rótulo
 * cortado pela borda não diria nada.
 */
function Escolha({
  caixa,
  rotulo,
  onEscalar,
}: {
  caixa: Bounds;
  rotulo: string | null;
  onEscalar: (event: ReactPointerEvent, canto: Canto) => void;
}) {
  const box = boundsToBox(caixa);
  const rotuloDentro = box.y < 16;

  return (
    <div
      aria-hidden
      className="border-primary pointer-events-none absolute border border-dashed"
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        zIndex: SELECAO_Z,
      }}
    >
      {rotulo ? (
        <span
          className={cn(
            "bg-primary text-primary-foreground absolute rounded-sm px-1 text-[10px] leading-4 whitespace-nowrap",
            rotuloDentro ? "top-0.5 left-0.5" : "-top-4.5 left-0",
          )}
        >
          {rotulo}
        </span>
      ) : null}

      {CANTOS.map((canto) => (
        <span
          key={`${canto.sx}:${canto.sy}`}
          className="border-primary bg-background pointer-events-auto absolute size-2 rounded-xs border"
          style={{
            left: canto.sx > 0 ? "100%" : 0,
            top: canto.sy > 0 ? "100%" : 0,
            transform: "translate(-50%, -50%)",
            cursor: canto.cursor,
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            onEscalar(event, canto);
          }}
        />
      ))}
    </div>
  );
}

/**
 * Segue o ponteiro até ele soltar, entregando o deslocamento desde o aperto.
 *
 * Pela janela, e não por captura no elemento: a alça é pequena, e o ponteiro sai
 * dela no primeiro quadro do gesto.
 */
function seguir(
  event: ReactPointerEvent,
  onMover: (dx: number, dy: number, nativo: PointerEvent) => void,
  onSoltar?: (nativo: PointerEvent) => void,
) {
  event.preventDefault();
  event.stopPropagation();

  const { pointerId, clientX: x0, clientY: y0 } = event;

  const mover = (nativo: PointerEvent) => {
    if (nativo.pointerId !== pointerId) return;
    onMover(nativo.clientX - x0, nativo.clientY - y0, nativo);
  };
  const soltar = (nativo: PointerEvent) => {
    if (nativo.pointerId !== pointerId) return;

    window.removeEventListener("pointermove", mover);
    window.removeEventListener("pointerup", soltar);
    window.removeEventListener("pointercancel", soltar);
    onSoltar?.(nativo);
  };

  window.addEventListener("pointermove", mover);
  window.addEventListener("pointerup", soltar);
  window.addEventListener("pointercancel", soltar);
}
