"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { MiniMapaDaEsguelha } from "@/components/mestre/mini-mapa-da-esguelha";
import { PainelDoTripe } from "@/components/mestre/painel-do-tripe";
import { TripesNoPalco } from "@/components/mestre/tripes-no-palco";
import { CenaDeEsguelha } from "@/components/playground/cena-de-esguelha";
import {
  ALVO_DA_MAO,
  SelecaoDeEsguelha,
} from "@/components/mestre/selecao-de-esguelha";
import { PalcoSoTela } from "@/components/playground/scene-stage";
import { corDoVazioDe } from "@/lib/cor";
import { cn } from "@/lib/utils";
import { useCameraOrbital } from "@/hooks/use-camera-orbital";
import { useCharacters } from "@/hooks/use-characters";
import { efeitosDaCena } from "@/lib/condicao";
import { fichasDaCena } from "@/lib/mestre/fichas-da-cena";
import {
  OlhoAoVivo,
  useCinegrafistaDeEsguelha,
} from "@/hooks/use-cinegrafista-de-esguelha";
import {
  cameraDoRecorte,
  correnteDoTripe,
  focalDaLente,
  LENTE_DA_MESA,
  tripeDaOrbital,
  type CameraAssinavel,
} from "@/lib/geometry/camera-orbital";
import { useCameraLockStore } from "@/lib/store/use-camera-lock-store";
import {
  aplicarGesto,
  moverNoGesto,
  terminarGesto,
  useGestoStore,
} from "@/lib/store/use-gesto-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { clampViewport, PLANO } from "@/lib/geometry/viewport";
import { useEsguelhaStore, type Olhar } from "@/lib/store/use-esguelha-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import { sceneForTable } from "@/lib/sync/for-table";
import type { Scene, Tripe } from "@/types/scene";

/** A tela da mesa: o tripé alimenta uma janela 16:9. */
const PROPORCAO_DA_MESA = 16 / 9;

/**
 * O palco do Mestre no 2.5D: a mesa vista de esguelha, e só ela.
 *
 * ## Por que quase só olhar
 *
 * No 2.5D não há ferramenta: mapa, luz, parede e o resto se editam no 2D. É
 * decisão do usuário, e pelo custo -- cada ferramenta do Mestre mede o ponteiro
 * pela conta chapada (`toScene`), e ensinar todas a desfazer uma câmera em
 * perspectiva é reescrever a interação inteira. Aqui se confere a mesa.
 *
 * A exceção são as peças, a pedido dele: marcar, a barra do gizmo e arrastar
 * pelo chão. Ver `aoApertar` e `SelecaoDeEsguelha`.
 *
 * E é a mesa MESMO: `sceneForTable`, o que a janela do espectador recebe, sem
 * o que está escondido. Conferir com o que só o mestre vê seria conferir outra
 * cena.
 *
 * ## A câmera
 *
 * A orbital, com os gestos da bancada: arrastar anda, a roda aproxima no
 * cursor, o botão direito gira e deita. Abre olhando o pedaço que o 2D estava
 * olhando, e devolve o lugar ao 2D quando sai -- trocar de modo não perde a
 * mesa.
 *
 * O olhar é do MESTRE, e fica nele: andar, aproximar, girar e deitar não chegam
 * à mesa. Quem a mesa olha é a câmera no ar -- um tripé, para vê-la assim. O
 * giro e a inclinação ficam guardados pela sessão (`useEsguelhaStore`) quando o
 * gesto assenta, uma vez e não por quadro.
 *
 * ## O palco
 *
 * `PalcoSoTela` e não um `SceneStage`: o palco recorta e amplia um plano de
 * 1920x1080, e aqui quem enquadra é o olho. As camadas da cena leem o
 * contexto do palco (escala, camada da tela), e ele vem neutro -- a área do
 * palco é a janela, e a cena se desenha nela.
 */
export function MestreDeEsguelha({ scene }: { scene: Scene }) {
  const guardarOlhar = useEsguelhaStore((state) => state.guardarOlhar);

  /**
   * De onde o Mestre olha AGORA: começa no último olhar da sessão, muda a
   * cada quadro do giro, e vai ao store quando o gesto assenta.
   */
  const [olhar, setOlhar] = useState<Olhar>(
    () => useEsguelhaStore.getState().olhar,
  );

  const selecionadaId = useCameraLockStore((state) => state.selecionadaId);
  const selecionar = useCameraLockStore((state) => state.selecionar);
  const olhandoPor = useEsguelhaStore((state) => state.olhandoPor);
  const olharPor = useEsguelhaStore((state) => state.olharPor);

  /**
   * A cena com o gizmo em curso por cima, como o palco 2D faz com a moldura:
   * o board só sabe do tripé ao soltar. Ver `aplicarGesto`.
   */
  const gestoCena = useGestoStore((state) => state.sceneId);
  const gestoTripe = useGestoStore((state) => state.tripe);
  const comGesto = useMemo(
    () =>
      gestoTripe
        ? aplicarGesto(scene, {
            sceneId: gestoCena,
            patches: null,
            textos: null,
            formas: null,
            camera: null,
            tripe: gestoTripe,
          })
        : scene,
    [gestoCena, gestoTripe, scene],
  );
  const tripes = comGesto.tripes ?? [];
  const tripeEscolhido = tripes.find((tripe) => tripe.id === selecionadaId);
  const olhado = tripes.find((tripe) => tripe.id === olhandoPor);

  // Olhar por um tripé que deixou de existir -- apagado, ou de outra cena --
  // volta à navegação sozinho.
  useEffect(() => {
    if (olhandoPor && !olhado) olharPor(null);
  }, [olhado, olhandoPor, olharPor]);

  const { mesa, focal, tamanho, paraChao, corrente, assinar, instante } =
    useCameraOrbital({
    travado: Boolean(olhado),
    // O andar do cinegrafista, só ele, na câmera livre. Ver `wasd`.
    wasd: true,
    lente: LENTE_DA_MESA,
    giro: olhar.giro,
    inclinacao: olhar.inclinacao,
    onGirar: setOlhar,
    arrastar: false,
    // Sem ferramenta na mão: o botão esquerdo é da câmera -- menos sobre um
    // tripé ou o gizmo dele, que são da mão.
    podeAgarrar: (alvo) =>
      !(
        alvo instanceof Element &&
        alvo.closest(`[data-tripe-alvo], ${ALVO_DA_MAO}`)
      ),
    inicial: (tela) =>
      cameraDoRecorte(
        useViewportStore.getState().viewport,
        tela,
        olhar.giro,
        olhar.inclinacao,
      ),
    mapa: PLANO,
    onAssentar: (camera) =>
      guardarOlhar({ giro: camera.giro, inclinacao: camera.inclinacao }),
    // O 2D volta olhando o pedaço em que o 2.5D estava.
    onSair: (camera, tela) =>
      useViewportStore.getState().setViewport(
        clampViewport(
          {
            x: camera.alvo.x - tela.largura / camera.zoom / 2,
            y: camera.alvo.y - tela.altura / camera.zoom / 2,
            width: tela.largura / camera.zoom,
            height: tela.altura / camera.zoom,
          },
          PLANO,
        ),
      ),
  });

  /**
   * O olho do cinegrafista AGORA, e quem quer saber quando ele anda.
   *
   * Um canal à parte do gesto, como a câmera orbital: o mouse olhando e o WASD
   * andam a cada quadro, e passar pelo store redesenhava a mesa inteira pelo
   * React a cada evento do mouse -- a vista engasgava. Por aqui a corrente vai
   * direto ao DOM; o gesto (a TV, a ordem do pintor, o minimapa) recebe poucas
   * vezes por segundo. Ver `useCinegrafistaDeEsguelha`.
   */
  const [vivo] = useState(() => new OlhoAoVivo());

  // O Shift+L do 2.5D: o mestre dentro do tripé. Ver `alternarCinegrafista`.
  useCinegrafistaDeEsguelha(mesa, vivo.mover);
  const cinegrafista = useEsguelhaStore((state) => state.cinegrafista);

  // O "nova câmera daqui" pergunta por aqui: o tripé que veria o que o mestre
  // está vendo agora. Desmontado, ninguém responde. Ver `useEsguelhaStore`.
  const registrarOlho = useEsguelhaStore((state) => state.registrarOlho);
  useEffect(() => {
    registrarOlho(() => {
      const agora = instante();
      return agora ? tripeDaOrbital(agora.camera, agora.tela) : null;
    });
    return () => registrarOlho(null);
  }, [instante, registrarOlho]);

  /**
   * A cena com o arraste de peça em curso por cima, como o 2D: o board só
   * recebe ao soltar. À parte do `comGesto` do tripé, para o gizmo do tripé
   * não redesenhar a mesa inteira a cada quadro.
   */
  const gestoItens = useGestoStore((state) => state.patches);
  const comItens = useMemo(
    () =>
      gestoItens
        ? aplicarGesto(scene, {
            sceneId: gestoCena,
            patches: gestoItens,
            textos: null,
            formas: null,
            camera: null,
          })
        : scene,
    [gestoCena, gestoItens, scene],
  );
  const daMesa = useMemo(() => sceneForTable(comItens), [comItens]);

  /**
   * Nome, medidores, condições e o que elas fazem com a figura -- os mesmos do
   * palco 2D do mestre (ver `fichasNoPalco` em `MestreStage`): com os
   * escondidos apagados nas fichas, sem os escondidos nos efeitos, e só com o
   * interruptor da cena ligado.
   */
  const { personagens } = useCharacters();
  const fichas = useMemo(
    () =>
      fichasDaCena(
        Boolean(scene.infoDosTokens),
        daMesa?.items ?? [],
        personagens ?? [],
        true,
      ),
    [daMesa, personagens, scene.infoDosTokens],
  );
  const efeitos = useMemo(
    () => efeitosDaCena(daMesa?.items ?? [], personagens ?? []),
    [daMesa, personagens],
  );

  /**
   * A mão nas peças: clicar marca (Shift soma ou tira), arrastar anda com a
   * seleção pelo chão, e um clique no chão vazio desmarca.
   *
   * O chão sob o cursor vem da mesma conta da câmera (`paraChao`), e a peça
   * anda o que o chão andou sob a mão -- não pula para o cursor. Por quadro só
   * o gesto; o board recebe ao soltar, num passo só do desfazer, como no 2D.
   * O travado fica onde está, e é para isso que ele foi travado.
   *
   * O botão esquerdo no vazio continua da câmera: o desmarcar só vale se a mão
   * não andou, para quem arrasta o chão não perder a seleção. E é ouvido na
   * CAPTURA: o gesto da câmera para a propagação do clique no chão, e na bolha
   * o React nunca o via -- era por isso que clicar fora não desmarcava.
   *
   * A peça em pé é `data-peca` (chão inclinado); a deitada é `data-item-id`,
   * desenhada no piso pela `SceneLayer`.
   */
  const noVazio = useRef<{ x: number; y: number } | null>(null);
  function aoApertarNoVazio(event: React.PointerEvent<HTMLDivElement>) {
    const alvo = event.target instanceof Element ? event.target : null;
    // O gizmo do tripé, a barra e as peças são da mão, e não do chão vazio.
    const daMao = !alvo || alvo.closest(`[data-tripe-alvo], ${ALVO_DA_MAO}`);
    noVazio.current =
      event.button !== 0 || olhado || daMao
        ? null
        : { x: event.clientX, y: event.clientY };
  }
  function aoApertar(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || olhado) return;
    const alvo = event.target instanceof Element ? event.target : null;
    const peca = alvo?.closest<HTMLElement>("[data-peca], [data-item-id]");
    if (!peca) return;

    const id = peca.dataset.peca ?? peca.dataset.itemId;
    if (!id) return;
    const selecao = useSelectionStore.getState();
    if (event.shiftKey) {
      selecao.toggle(id);
      return;
    }
    if (!selecao.selectedIds.includes(id)) selecao.select([id]);

    const marcados = useSelectionStore.getState().selectedIds;
    const livres = scene.items.filter(
      (item) => marcados.includes(item.id) && !item.locked,
    );
    const inicio = paraChao(event.clientX, event.clientY);
    if (livres.length === 0 || !inicio) return;

    const area = event.currentTarget;
    const ponteiro = event.pointerId;
    area.setPointerCapture(ponteiro);

    function andar(movido: PointerEvent) {
      if (movido.pointerId !== ponteiro) return;
      const aqui = paraChao(movido.clientX, movido.clientY);
      if (!aqui || !inicio) return;
      const dx = aqui.x - inicio.x;
      const dy = aqui.y - inicio.y;
      moverNoGesto(
        scene.id,
        livres.map((item) => ({
          id: item.id,
          patch: { x: item.x + dx, y: item.y + dy },
        })),
      );
    }
    function soltar(solto: PointerEvent) {
      if (solto.pointerId !== ponteiro) return;
      area.removeEventListener("pointermove", andar);
      area.removeEventListener("pointerup", soltar);
      area.removeEventListener("pointercancel", soltar);
      const patches = useGestoStore.getState().patches;
      if (patches?.length) terminarGesto(scene.id, patches);
    }
    area.addEventListener("pointermove", andar);
    area.addEventListener("pointerup", soltar);
    area.addEventListener("pointercancel", soltar);
  }
  function aoSoltar(event: React.PointerEvent<HTMLDivElement>) {
    const vazio = noVazio.current;
    noVazio.current = null;
    if (!vazio) return;
    if (Math.hypot(event.clientX - vazio.x, event.clientY - vazio.y) > 4) return;
    useSelectionStore.getState().clear();
  }

  /**
   * O olhar de AGORA, com a câmera que o escreve no DOM.
   *
   * O giro do gesto entra aqui a cada quadro: a ordem do pintor e as peças em
   * pé dependem dele, e sem isto a câmera giraria com as peças olhando para o
   * lado antigo até o soltar.
   */
  const comCamera = useMemo(
    () => ({
      camera: {
        corrente,
        assinar,
        perspectiva: focal,
        // Aproximar leva o olho por cima das peças da borda de perto, e o que
        // fica atrás dele o motor desenha espelhado no céu; e as peças vão de
        // prumo na tela por ele. Ver `olho` em `CameraAssinavel`.
        olho: () => {
          const agora = instante();
          return agora
            ? { tripe: tripeDaOrbital(agora.camera, agora.tela), tela: agora.tela }
            : null;
        },
      } as CameraAssinavel,
      giro: olhar.giro,
      inclinacao: olhar.inclinacao,
    }),
    [assinar, corrente, focal, instante, olhar],
  );

  /**
   * A janela 16:9 da mesa dentro da área do palco, para o "olhar pela câmera".
   * O tripé enche ESTA caixa como enche a tela da mesa; o que sobra em volta é
   * o que a mesa não vê.
   */
  const quadro = useMemo(
    () =>
      tamanho
        ? tamanho.largura / tamanho.altura > PROPORCAO_DA_MESA
          ? {
              largura: tamanho.altura * PROPORCAO_DA_MESA,
              altura: tamanho.altura,
            }
          : {
              largura: tamanho.largura,
              altura: tamanho.largura / PROPORCAO_DA_MESA,
            }
        : null,
    [tamanho],
  );

  /**
   * O olhar do Mestre pelo tripé: a corrente do tripé, com a lente trocada pela
   * que faz a altura da janela 16:9 ver o que a mesa vê. Ver `lenteNaCaixa`.
   */
  const pelaCamera = useMemo(() => {
    if (!olhado || !tamanho || !quadro || focal <= 0) return null;
    const tela = { ...tamanho, focal };
    // O do cinegrafista, quando ele está andando; senão o do board.
    const atual = (): Tripe => {
      const base = vivo.atual() ?? olhado;
      return {
        ...base,
        lente: lenteNaCaixa(base.lente, quadro.altura, tamanho.altura),
      };
    };
    return {
      camera: {
        corrente: () => correnteDoTripe(atual(), tela),
        assinar: vivo.assinar,
        perspectiva: focal,
        // A lente trocada não muda o que está atrás: ela só amplia a imagem.
        olho: () => ({ tripe: atual(), tela }),
      } as CameraAssinavel,
      giro: olhado.giro,
      inclinacao: olhado.inclinacao,
    };
  }, [focal, olhado, quadro, tamanho, vivo]);

  // A cor do vazio em volta do chão deitado -- a mesma do 2D. Aqui o palco é
  // `PalcoSoTela`, que é transparente, então o fundo é deste container. Ausente
  // = o breu de sempre, via `bg-black`. Ver `Scene.corDoVazio`.
  const fundoDoVazio = scene.corDoVazio
    ? corDoVazioDe(scene.corDoVazio)
    : undefined;

  return (
    <>
      <div
        ref={mesa}
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden rounded-md",
          fundoDoVazio ? undefined : "bg-black",
          olhado ? undefined : "cursor-grab active:cursor-grabbing",
        )}
        style={fundoDoVazio ? { backgroundColor: fundoDoVazio } : undefined}
        onPointerDownCapture={aoApertarNoVazio}
        onPointerDown={aoApertar}
        onPointerUpCapture={aoSoltar}
      >
        {daMesa && tamanho && focal > 0 ? (
          <PalcoSoTela largura={tamanho.largura} altura={tamanho.altura}>
            <CenaDeEsguelha
              scene={daMesa}
              olhar={pelaCamera ?? comCamera}
              fichas={fichas}
              efeitos={efeitos}
            />
          </PalcoSoTela>
        ) : null}

        {cinegrafista && olhado ? (
          // As teclas do modo, à vista enquanto ele dura: é um jeito de mexer
          // que não existe em nenhum outro lugar do app.
          <div className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-md bg-black/70 px-3 py-1.5 text-xs text-white/90 backdrop-blur">
            <span className="font-medium">Cinegrafista · {olhado.nome}</span>
            <span className="text-white/60">
              {" "}
              · WASD anda · mouse olha · roda muda a lente · Q E rolam · Espaço
              sobe · C desce · Shift devagar · Esc sai
            </span>
          </div>
        ) : null}

        {olhado && quadro ? (
          // A janela da mesa, marcada: o que está fora dela a mesa não vê.
          <div
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm outline outline-2 outline-red-400/80"
            style={{
              width: quadro.largura,
              height: quadro.altura,
              boxShadow: "0 0 0 100vmax rgb(0 0 0 / 0.55)",
            }}
          />
        ) : tamanho ? (
          <>
            <SelecaoDeEsguelha
              scene={comItens}
              assinar={assinar}
              instante={instante}
              paraChao={paraChao}
            />
            <TripesNoPalco
            sceneId={scene.id}
            tripes={tripes}
            selecionadaId={selecionadaId}
            noArId={scene.cameraNoArId}
            olhar={{ assinar, instante }}
            onSelecionar={selecionar}
          />
          </>
        ) : null}
      </div>

      {/* Fora da área da mesa, e não dentro: a câmera do mestre ouve ali, e o
          clique ou a roda sobre o painel andariam com a mesa. */}
      {tripeEscolhido ? (
        <div className="absolute bottom-3 left-3">
          <PainelDoTripe sceneId={scene.id} tripe={tripeEscolhido} />
        </div>
      ) : null}

      {/* A cena vista de cima, como referência: o que a mesa vê (os itens da
          cena dela) e os tripés com o gizmo em curso. Fora da área da mesa,
          pelo mesmo motivo do painel. Ver `MiniMapaDaEsguelha`. */}
      <MiniMapaDaEsguelha
        sceneId={scene.id}
        olhar={{ assinar, instante }}
        mapaId={daMesa?.backgroundAssetId}
        itens={daMesa?.items ?? []}
        tripes={tripes}
        selecionadaId={selecionadaId}
        noArId={scene.cameraNoArId}
      />
    </>
  );
}

/**
 * A lente que, numa caixa de `alturaDaCaixa` pixels, vê o que `lente` vê numa
 * janela de `alturaDaJanela`.
 *
 * O "olhar pela câmera" desenha na área inteira do palco, e a mesa é a janela
 * 16:9 dentro dela: para a janela ver exatamente o que a mesa vê, a caixa
 * inteira precisa de uma lente proporcionalmente mais aberta.
 */
function lenteNaCaixa(
  lente: number,
  alturaDaJanela: number,
  alturaDaCaixa: number,
): number {
  const focal = focalDaLente(alturaDaJanela, lente);
  return ((2 * Math.atan(alturaDaCaixa / 2 / focal)) * 180) / Math.PI;
}

