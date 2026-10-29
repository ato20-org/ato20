"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  CircleDot,
  Crosshair,
  Eye,
  EyeOff,
  Focus,
  LocateFixed,
  Maximize,
  MoreVertical,
  Plus,
  Radio,
  ScanSearch,
  TextCursorInput,
  Trash2,
  Video,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { aoApertarF2, useRenomearPeloMenu } from "@/hooks/use-renomear-pelo-menu";
import {
  alternarTransmissao,
  enquadrarAqui,
  enquadrarSelecao,
  irParaCamera,
  mostrarCenaInteira,
  novaCamera,
  transmissaoDaCamera,
  type Transmissao,
} from "@/lib/mestre/camera-actions";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useCameraLockStore } from "@/lib/store/use-camera-lock-store";
import { useEsguelhaStore } from "@/lib/store/use-esguelha-store";
import { useFotosDasCamerasStore } from "@/lib/store/use-fotos-das-cameras-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { t } from "@/lib/i18n/ferramentas";
import { cn } from "@/lib/utils";
import { camerasDoModo, temSol, type Scene } from "@/types/scene";

/**
 * As teclas que o menu mostra ao lado de cada comando. Fora do dicionário de
 * propósito: nome de tecla é o que está gravado nela, e não muda com o idioma.
 */
const TECLA = {
  trazer: "C",
  irAte: "Home",
  enquadrar: "F",
  seguir: "L",
  espelhar: "Shift+L",
  cenaInteira: "Shift+C",
  transmitir: "T",
  renomear: "F2",
} as const;

/** A altura da faixa de cartões, em pixels: o mínimo, o máximo e a de cara. */
const ALTURA_MINIMA = 96;
const ALTURA_MAXIMA = 360;
const ALTURA_PADRAO = 150;

/**
 * Onde a faixa lembra se está aberta e a altura. No navegador desta máquina,
 * e não na campanha: é preferência de tela -- o monitor largo quer cartões
 * grandes, o notebook quer a faixa fechada --, e nada aqui precisa chegar a
 * outro lugar.
 */
const CHAVE_DA_LEMBRANCA = "ato20:barra-de-cameras";

type Lembranca = { aberta: boolean; altura: number };

function lerLembranca(): Lembranca {
  const padrao = { aberta: false, altura: ALTURA_PADRAO };
  try {
    const cru = window.localStorage.getItem(CHAVE_DA_LEMBRANCA);
    if (!cru) return padrao;
    const lida = JSON.parse(cru) as Partial<Lembranca>;
    return {
      aberta: lida.aberta === true,
      altura: limitarAltura(Number(lida.altura) || ALTURA_PADRAO),
    };
  } catch {
    // Janela privada, armazenamento bloqueado: a faixa nasce fechada.
    return padrao;
  }
}

function gravarLembranca(lembranca: Lembranca) {
  try {
    window.localStorage.setItem(CHAVE_DA_LEMBRANCA, JSON.stringify(lembranca));
  } catch {
    // Sem onde gravar, a faixa só não lembra da próxima vez.
  }
}

function limitarAltura(altura: number): number {
  return Math.round(Math.min(ALTURA_MAXIMA, Math.max(ALTURA_MINIMA, altura)));
}

/** A lista que a aba mostra: os recortes do 2D, os tripés do 2.5D, ou os dois. */
type Aba = "recortes" | "tripes" | "todos";

const ABAS: readonly Aba[] = ["recortes", "tripes", "todos"];

/**
 * As câmeras da cena, numa FAIXA encaixada embaixo do palco.
 *
 * Era uma pílula ao lado do zoom, com a lista do outro modo numa segunda
 * pílula em cima. Virou uma faixa de ponta a ponta da coluna do palco, que
 * COLAPSA -- fica só o cabeçalho, com os chips -- e CRESCE pela borda de cima:
 * aberta, cada câmera vira um cartão com a FOTO da última posição dela --
 * tirada quando a cena para de mudar, e não ao vivo; ver
 * `useFotografoDasCameras`. Encaixada, e não por cima: o palco encolhe quando
 * ela cresce, e nada cobre o mapa. As listas viraram ABAS, que abrem na do
 * modo atual.
 *
 * Chips e não uma lista num popover: trocar de câmera no meio da sessão é um
 * gesto de um toque, e um menu que abre e fecha é dois. O número no chip é a
 * tecla: `Shift+1` seleciona a primeira. A ordem é a da lista, sem uma
 * segunda numeração para divergir.
 *
 * O chip aceso é a SELECIONADA, a que o mestre edita. O REC vermelho na
 * frente do nome é a que está NO AR. São coisas diferentes de propósito: o
 * mestre prepara uma enquanto a mesa vê outra, e o T troca. Com o mapa fora
 * do ar o REC é amarelo: é a câmera com que ele vai abrir, e a mesa ainda não
 * a vê. Ver `transmissaoDaCamera`.
 *
 * Depois dos chips: novo, transmitir, e um menu com o resto. Eram nove botões
 * espalhados por duas pílulas; à vista ficam só os dois que se apertam no
 * meio da sessão. O resto tem tecla, e o menu é onde se descobre qual.
 *
 * Cada modo, a sua lista: no 2D os recortes, no 2.5D os TRIPÉS
 * (`Scene.tripes`), com o ícone de câmera. Juntos numa faixa só, o 2.5D
 * mostrava câmera 2D que dali não se vê nem se ajusta. O número recomeça em
 * cada lista, e o `Shift+n` também. No 2.5D o novo vira "nova câmera daqui" --
 * um tripé onde o mestre está olhando, nascido FORA do ar --, e o que só faz sentido com recorte
 * (seguir, espelhar, ir até, enquadrar a seleção) some do menu.
 *
 * Ainda é uma câmera no ar de cada vez, de uma espécie ou de outra, e o T e o
 * REC valem para as duas. As duas listas são ABAS da faixa, e a do modo
 * atual é a que abre. Na aba do OUTRO modo, o clique num chip leva ao modo
 * dele, já com a câmera selecionada -- é lá que ela se ajusta --, e o novo, o
 * transmitir e o menu somem: eles agem sobre a câmera do modo, e ali seriam um
 * segundo T que não transmite o que diz.
 */
export function BarraDeCameras({ scene }: { scene: Scene }) {
  const cameras = scene.cameras ?? [];
  const tripes = scene.tripes ?? [];
  const deEsguelha = useEsguelhaStore((state) => state.ligada);
  const selecionadaId = useCameraLockStore((state) => state.selecionadaId);
  const fantasmasVisiveis = useCameraLockStore(
    (state) => state.fantasmasVisiveis,
  );
  const alternarFantasmas = useCameraLockStore(
    (state) => state.alternarFantasmas,
  );
  const espelhoMestre = useCameraLockStore((state) => state.espelhoMestre);
  const alternarEspelho = useCameraLockStore((state) => state.alternarEspelho);
  const prenderNaSelecao = useCameraLockStore(
    (state) => state.prenderNaSelecao,
  );
  const soltar = useCameraLockStore((state) => state.soltar);
  const removerCamera = useSceneStore((state) => state.removerCamera);
  const removerTripe = useSceneStore((state) => state.removerTripe);
  const temSelecao = useSelectionStore(
    (state) => state.selectedIds.length > 0,
  );

  const cenaNoAr = useSceneStore(
    (state) => state.board?.liveSceneId === scene.id,
  );

  // Só a da espécie do modo: a da outra não tem chip aqui. Ver
  // `camerasDoModo` e o seguidor da troca no `useCameraLockStore`.
  const recorte = deEsguelha
    ? undefined
    : cameras.find((camera) => camera.id === selecionadaId);
  const tripe = deEsguelha
    ? tripes.find((cada) => cada.id === selecionadaId)
    : undefined;
  const selecionada = recorte ?? tripe;
  const segue = Boolean(recorte?.alvoIds);
  const transmissao = transmissaoDaCamera(scene, selecionada?.id, cenaNoAr);

  // A rolagem é muda: a barra fica escondida de propósito, e sem ela nada diz
  // que há câmera fora da vista. O desbotar nas pontas é esse aviso -- e só do
  // lado que ainda esconde algo, para não apagar a primeira câmera quando ela
  // está inteira à mostra. Medido no scroll e a cada câmera que entra ou sai.
  // As fotos da última posição: a faixa aberta mostra cada uma no cartão.
  const fotos = useFotosDasCamerasStore((state) => state.fotos);
  const [lembranca, setLembranca] = useState<Lembranca>(lerLembranca);
  const { aberta, altura } = lembranca;
  function lembrar(nova: Partial<Lembranca>) {
    setLembranca((atual) => {
      const proxima = { ...atual, ...nova };
      gravarLembranca(proxima);
      return proxima;
    });
  }

  /**
   * A aba que o mestre escolheu, e o modo em que escolheu. Trocar de modo leva
   * a aba junto -- a do modo novo é a que se ajusta dali --, menos "Todos",
   * que já mostra as duas. Ajustado durante o render, e não num efeito: com
   * efeito haveria um quadro com a lista errada.
   */
  const abaDoModo: Aba = deEsguelha ? "tripes" : "recortes";
  const tipoDoModo = deEsguelha ? "tripe" : "recorte";
  const [escolha, setEscolha] = useState<{ aba: Aba; modo: boolean }>({
    aba: abaDoModo,
    modo: deEsguelha,
  });
  if (escolha.modo !== deEsguelha)
    setEscolha({
      aba: escolha.aba === "todos" ? "todos" : abaDoModo,
      modo: deEsguelha,
    });
  // Tripé só onde há 2.5D: sem ele as abas nem aparecem, e a lista é a dos
  // recortes.
  const comTripes = temSol(scene);
  const aba: Aba = comTripes ? escolha.aba : "recortes";
  // O novo, o transmitir e o menu agem sobre a câmera do MODO: aparecem onde
  // a lista dele está à vista -- na aba dele e em "Todos".
  const comComandos = aba === abaDoModo || aba === "todos";
  /**
   * Os grupos que a aba mostra, na ordem das abas: as câmeras, depois os
   * tripés. Cada um com a própria numeração, que é a tecla do modo dele
   * (`Shift+n`). Em "Todos", o grupo vazio não deixa traço sobrando.
   */
  const grupos = (
    aba === "todos"
      ? (["recorte", "tripe"] as const)
      : aba === "tripes"
        ? (["tripe"] as const)
        : (["recorte"] as const)
  )
    .map((tipo) => ({ tipo, lista: camerasDoModo(scene, tipo === "tripe") }))
    .filter((grupo) => aba !== "todos" || grupo.lista.length > 0);

  /** Os chips, ou os cartões, de todos os grupos, com um traço entre eles. */
  const itens = (comoCartao: boolean) =>
    grupos.map((grupo, indiceDoGrupo) => (
      <Fragment key={grupo.tipo}>
        {indiceDoGrupo > 0 ? (
          <span
            aria-hidden
            className={cn(
              "bg-border w-px shrink-0",
              comoCartao ? "my-1 self-stretch" : "mx-0.5 h-5",
            )}
          />
        ) : null}
        {grupo.lista.map((camera, index) => {
          const doOutroModo = grupo.tipo !== tipoDoModo;
          return (
            <Chip
              key={camera.id}
              sceneId={scene.id}
              camera={camera}
              tipo={grupo.tipo}
              posicao={index + 1}
              selecionada={!doOutroModo && camera.id === selecionadaId}
              transmissao={transmissaoDaCamera(scene, camera.id, cenaNoAr)}
              doOutroModo={doOutroModo}
              cartao={
                comoCartao
                  ? {
                      altura,
                      foto: fotos[camera.id]?.url,
                    }
                  : undefined
              }
            />
          );
        })}
      </Fragment>
    ));

  return (
    <div
      role="region"
      aria-label={t.camerasSalvas.barra}
      className="bg-background/85 pointer-events-auto relative shrink-0 border-t backdrop-blur"
    >
      {aberta ? (
        <AlcaDeAltura
          altura={altura}
          onSoltar={(nova) => lembrar({ altura: nova })}
        />
      ) : null}

      <div className="flex items-center gap-0.5 p-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                aria-expanded={aberta}
                aria-label={
                  aberta ? t.camerasSalvas.recolher : t.camerasSalvas.mostrarPrevias
                }
                onClick={() => lembrar({ aberta: !aberta })}
              >
                {aberta ? <ChevronDown /> : <ChevronUp />}
              </Button>
            }
          />
          <TooltipContent>
            {aberta ? t.camerasSalvas.recolher : t.camerasSalvas.mostrarPrevias}
          </TooltipContent>
        </Tooltip>

        {comTripes ? (
          <div
            role="tablist"
            aria-label={t.camerasSalvas.barra}
            className="bg-muted flex shrink-0 rounded-md p-0.5"
          >
            {ABAS.map((cada) => (
              <button
                key={cada}
                type="button"
                role="tab"
                aria-selected={aba === cada}
                className={cn(
                  "h-6 rounded-[5px] px-2 text-[11px]",
                  aba === cada
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setEscolha({ aba: cada, modo: deEsguelha })}
              >
                {cada === "tripes"
                  ? t.camerasSalvas.tripes
                  : cada === "todos"
                    ? t.camerasSalvas.todos
                    : t.camerasSalvas.cameras}
              </button>
            ))}
          </div>
        ) : (
          <RotuloDaBarra>{t.camerasSalvas.cameras}</RotuloDaBarra>
        )}

        {/* Fechada, os chips moram no próprio cabeçalho; aberta, os cartões
            descem para a faixa, e o cabeçalho fica com os comandos. */}
        {aberta ? (
          <span className="flex-1" />
        ) : (
          <FaixaDeChips>{itens(false)}</FaixaDeChips>
        )}

        {/* O novo, o transmitir e o menu agem sobre a câmera do MODO, e na
            aba só do outro seriam um segundo T que não transmite o que diz. */}
        {comComandos ? (
          <>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0"
                  aria-label={
                    deEsguelha
                      ? t.camerasSalvas.novaCameraDaqui
                      : t.camerasSalvas.novaCamera
                  }
                  onClick={() => novaCamera()}
                >
                  <Plus />
                </Button>
              }
            />
            <TooltipContent>
              <p className="font-medium">
                {deEsguelha
                  ? t.camerasSalvas.novaCameraDaqui
                  : t.camerasSalvas.novaCamera}
              </p>
              <p className="text-muted-foreground max-w-52">
                {deEsguelha
                  ? t.camerasSalvas.novaCameraDaquiAjuda
                  : t.camerasSalvas.novaCameraAjuda}
              </p>
            </TooltipContent>
          </Tooltip>

          <span className="bg-border mx-0.5 h-5 w-px shrink-0" />

          {/* Transmitir fica à vista, e é o único que fica: é o toque que muda o
            que a mesa vê, e o mestre precisa achá-lo sem abrir nada. Vermelho
            no ar, amarelo preparada. O resto dos comandos da câmera mora no
            menu ao lado. */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={transmissao === "no-ar" ? "destructive" : "ghost"}
                  size="icon-sm"
                  className={cn(
                    "shrink-0",
                    transmissao === "preparada" &&
                      "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 hover:text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 dark:hover:bg-amber-500/30 dark:hover:text-amber-400",
                  )}
                  aria-label={
                    transmissao === "no-ar"
                      ? t.camerasSalvas.tirarDoAr
                      : transmissao === "preparada"
                        ? t.camerasSalvas.desfazerPreparacao
                        : t.camerasSalvas.transmitirSelecionada
                  }
                  disabled={!selecionada}
                  onClick={alternarTransmissao}
                >
                  <Radio />
                </Button>
              }
            />
            <TooltipContent>
              <p className="font-medium">
                {transmissao === "no-ar"
                  ? t.camerasSalvas.tirarDoAr
                  : transmissao === "preparada"
                    ? t.camerasSalvas.preparada
                    : t.camerasSalvas.transmitir}
              </p>
              <p className="text-muted-foreground max-w-52">
                {transmissao === "no-ar"
                  ? t.camerasSalvas.tirarDoArAjuda
                  : transmissao === "preparada"
                    ? t.camerasSalvas.preparadaAjuda
                    : t.camerasSalvas.transmitirAjuda}
              </p>
            </TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0"
                  aria-label={t.camerasSalvas.maisComandos}
                  disabled={!selecionada}
                >
                  <MoreVertical />
                </Button>
              }
            />
            {/* Largura fixa: sem ela o menu herda a do botão de três pontos e
              cada rótulo quebra em três linhas. */}
            <DropdownMenuContent align="end" className="w-60">
              {recorte || deEsguelha ? (
                <DropdownMenuItem onClick={enquadrarAqui}>
                  <ScanSearch />
                  {t.camerasSalvas.trazerParaAqui}
                  <DropdownMenuShortcut>{TECLA.trazer}</DropdownMenuShortcut>
                </DropdownMenuItem>
              ) : null}
              {recorte ? (
                <>
                  <DropdownMenuItem onClick={irParaCamera}>
                    <LocateFixed />
                    {t.camerasSalvas.irAteCamera}
                    <DropdownMenuShortcut>{TECLA.irAte}</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!temSelecao}
                    onClick={enquadrarSelecao}
                  >
                    <Focus />
                    {t.camerasSalvas.enquadrarSelecao}
                    <DropdownMenuShortcut>{TECLA.enquadrar}</DropdownMenuShortcut>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuCheckboxItem
                    checked={segue}
                    disabled={!segue && !temSelecao}
                    onCheckedChange={() =>
                      segue ? soltar() : prenderNaSelecao()
                    }
                  >
                    <Crosshair />
                    {t.camerasSalvas.seguirSelecao}
                    <DropdownMenuShortcut>{TECLA.seguir}</DropdownMenuShortcut>
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={espelhoMestre}
                    onCheckedChange={alternarEspelho}
                  >
                    <Eye />
                    {t.camerasSalvas.espelharPalco}
                    <DropdownMenuShortcut>
                      {TECLA.espelhar}
                    </DropdownMenuShortcut>
                  </DropdownMenuCheckboxItem>
                </>
              ) : null}
              <DropdownMenuCheckboxItem
                checked={fantasmasVisiveis}
                onCheckedChange={alternarFantasmas}
              >
                {fantasmasVisiveis ? <Eye /> : <EyeOff />}
                {t.camerasSalvas.outrasCameras}
              </DropdownMenuCheckboxItem>

              {scene.cameraNoArId ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={mostrarCenaInteira}>
                    <Maximize />
                    {t.camerasSalvas.mostrarCenaInteira}
                    <DropdownMenuShortcut>
                      {TECLA.cenaInteira}
                    </DropdownMenuShortcut>
                  </DropdownMenuItem>
                </>
              ) : null}

              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  if (recorte) removerCamera(scene.id, recorte.id);
                  if (tripe) removerTripe(scene.id, tripe.id);
                }}
              >
                <Trash2 />
                {t.camerasSalvas.removerCamera}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </>
        ) : null}
      </div>

      {aberta ? (
        <div
          className="rolagem-limpa flex gap-2 overflow-x-auto px-2 pb-2"
          style={{ height: altura }}
          // A roda de pé anda a faixa de lado: é a única direção que ela tem.
          onWheel={(evento) => {
            if (evento.deltaY === 0 || evento.shiftKey) return;
            evento.currentTarget.scrollLeft += evento.deltaY;
          }}
        >
          {itens(true)}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A faixa dos chips no cabeçalho fechado: rola de lado quando não cabe, com a
 * borda esmaecendo do lado em que ainda há câmera -- o número no chip é a
 * tecla, e Shift+n chega às que não aparecem.
 */
function FaixaDeChips({ children }: { children: React.ReactNode }) {
  const faixaRef = useRef<HTMLDivElement>(null);
  const [borda, setBorda] = useState({ inicio: false, fim: false });

  useEffect(() => {
    const faixa = faixaRef.current;
    if (!faixa) return;
    const medir = () => {
      const folga = faixa.scrollWidth - faixa.clientWidth - faixa.scrollLeft;
      setBorda({ inicio: faixa.scrollLeft > 1, fim: folga > 1 });
    };
    medir();
    faixa.addEventListener("scroll", medir, { passive: true });
    const observador = new ResizeObserver(medir);
    observador.observe(faixa);
    return () => {
      faixa.removeEventListener("scroll", medir);
      observador.disconnect();
    };
  }, []);

  const recuo = "1.5rem";
  const mascara =
    borda.inicio && borda.fim
      ? `linear-gradient(to right, transparent, #000 ${recuo}, #000 calc(100% - ${recuo}), transparent)`
      : borda.inicio
        ? `linear-gradient(to right, transparent, #000 ${recuo})`
        : borda.fim
          ? `linear-gradient(to right, #000 calc(100% - ${recuo}), transparent)`
          : undefined;

  return (
    <div
      ref={faixaRef}
      className="rolagem-limpa flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
      style={mascara ? { maskImage: mascara, WebkitMaskImage: mascara } : undefined}
    >
      {children}
    </div>
  );
}

/**
 * A alça da borda de cima da faixa aberta, que muda a altura.
 *
 * Durante o arrasto só uma LINHA-GUIA anda; a altura entra ao soltar. Mudar a
 * altura a cada quadro mudaria o tamanho do palco a cada quadro -- e o palco
 * se mede e refaz o layout do mapa inteiro quando a moldura muda. Um gesto de
 * ajuste não vale sessenta relayouts.
 */
function AlcaDeAltura({
  altura,
  onSoltar,
}: {
  altura: number;
  onSoltar: (altura: number) => void;
}) {
  const [guia, setGuia] = useState<number | null>(null);

  function comecar(evento: React.PointerEvent) {
    evento.preventDefault();
    const inicioY = evento.clientY;
    let nova = altura;

    const mover = (movimento: PointerEvent) => {
      nova = limitarAltura(altura + (inicioY - movimento.clientY));
      setGuia(nova);
    };
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
      setGuia(null);
      if (nova !== altura) onSoltar(nova);
    };

    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
  }

  return (
    <>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={t.camerasSalvas.alturaDaBarra}
        title={t.camerasSalvas.alturaDaBarra}
        className="hover:bg-primary/40 absolute inset-x-0 top-0 z-20 h-1.5 -translate-y-1/2 cursor-row-resize touch-none"
        onPointerDown={comecar}
      />
      {guia !== null ? (
        // A linha onde a borda vai parar: acima da faixa ao crescer, dentro
        // dela ao encolher. Por cima do palco, sem pegar o ponteiro.
        <div
          aria-hidden
          className="bg-primary pointer-events-none absolute inset-x-0 z-20 h-0.5"
          style={{ top: altura - guia }}
        />
      ) : null}
    </>
  );
}

/** O nome da barra, pequeno: com as duas à vista, qual é qual. */
function RotuloDaBarra({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-muted-foreground shrink-0 px-1.5 text-[10px] font-medium tracking-wide uppercase select-none">
      {children}
    </span>
  );
}

type ChipProps = {
  sceneId: string;
  camera: { id: string; nome: string; alvoIds?: string[] };
  /** Recorte (`Scene.cameras`) ou tripé (`Scene.tripes`). */
  tipo: "recorte" | "tripe";
  posicao: number;
  selecionada: boolean;
  transmissao: Transmissao;
  /**
   * Chip da barra do outro modo: o clique troca de modo e seleciona, e o que
   * só vale no modo dela ("trazer para onde estou") sai do menu. Ver
   * `BarraDoOutroModo`.
   */
  doOutroModo?: boolean;
  /**
   * Presente = o chip é um CARTÃO da faixa aberta: a miniatura em cima, o
   * número e o nome embaixo. O clique, o duplo clique, o X e o menu são os
   * mesmos do chip. Ver `BarraDeCameras`.
   */
  cartao?: {
    /** A altura da faixa: o cartão ocupa ela inteira. */
    altura: number;
    /**
     * A foto da última posição, do cache desta máquina: vista de cima no
     * recorte, em perspectiva no tripé. Ausente na câmera que ainda não foi
     * fotografada. Ver `useFotografoDasCameras`.
     */
    foto?: string;
  };
};

function Chip({
  sceneId,
  camera,
  tipo,
  posicao,
  selecionada,
  transmissao,
  doOutroModo = false,
  cartao,
}: ChipProps) {
  const atualizarRecorte = useSceneStore((state) => state.atualizarCamera);
  const atualizarTripe = useSceneStore((state) => state.atualizarTripe);
  const removerRecorte = useSceneStore((state) => state.removerCamera);
  const removerTripe = useSceneStore((state) => state.removerTripe);
  const atualizarCamera = tipo === "tripe" ? atualizarTripe : atualizarRecorte;
  const removerCamera = tipo === "tripe" ? removerTripe : removerRecorte;
  const transmitirCamera = useSceneStore((state) => state.transmitirCamera);
  const selecionar = useCameraLockStore((state) => state.selecionar);
  const alternarModo = useEsguelhaStore((state) => state.alternar);
  const [renomeando, setRenomeando] = useState(false);
  const renomear = useRenomearPeloMenu(() => setRenomeando(true));

  const segue = (camera.alvoIds?.length ?? 0) > 0;

  function confirmar(nome: string) {
    const limpo = nome.trim();
    if (limpo && limpo !== camera.nome)
      atualizarCamera(sceneId, camera.id, { nome: limpo });
    setRenomeando(false);
  }

  if (renomeando) {
    return (
      <input
        autoFocus
        defaultValue={camera.nome}
        className="bg-accent h-7 w-24 rounded-md px-2 text-xs outline-none"
        aria-label={t.camerasSalvas.nomeDaCamera}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={(event) => confirmar(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") confirmar(event.currentTarget.value);
          if (event.key === "Escape") setRenomeando(false);
          // Nem o palco nem os atalhos: o mestre está digitando.
          event.stopPropagation();
        }}
      />
    );
  }

  const selecionarEsta = () => {
    // A troca primeiro: ela escolhe a câmera do modo novo, e a do clique
    // passa por cima. Ver o seguidor da troca no `useCameraLockStore`.
    if (doOutroModo) alternarModo();
    selecionar(camera.id);
  };
  const titulo = doOutroModo
    ? t.camerasSalvas.irAoOutroModo(camera.nome, tipo === "tripe")
    : t.camerasSalvas.comAtalho(camera.nome, posicao);

  if (cartao) {
    // A miniatura em 16:9, como a tela da mesa, na altura que sobra do nome.
    const alturaDaPrevia = Math.max(32, cartao.altura - 30);
    return (
      <ContextMenu onOpenChangeComplete={renomear.aoFechar}>
        <ContextMenuTrigger
          className={cn(
            "flex shrink-0 flex-col gap-1 rounded-md border p-1 text-xs",
            selecionada
              ? "border-primary ring-primary ring-1"
              : "hover:bg-accent border-transparent",
          )}
          style={{ width: (alturaDaPrevia * 16) / 9 + 10 }}
        >
          <button
            type="button"
            className="relative block w-full overflow-hidden rounded-sm bg-black"
            style={{ height: alturaDaPrevia }}
            title={titulo}
            onClick={selecionarEsta}
            onDoubleClick={() => setRenomeando(true)}
            onKeyDown={aoApertarF2(() => setRenomeando(true))}
          >
            {cartao.foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cartao.foto}
                alt=""
                className="size-full object-cover"
                draggable={false}
              />
            ) : (
              // A câmera recém-criada ainda não foi fotografada: a foto sai
              // quando a cena para de mudar.
              <Video className="text-muted-foreground absolute inset-0 m-auto size-6" />
            )}
          </button>
          <div className="flex min-w-0 items-center gap-1 px-0.5">
            <span className="tabular-nums opacity-70">{posicao}</span>
            {transmissao ? (
              <CircleDot
                className={cn(
                  "size-3 shrink-0",
                  transmissao === "no-ar" ? "text-red-400" : "text-amber-400",
                )}
              />
            ) : null}
            <span className="min-w-0 flex-1 truncate">{camera.nome}</span>
            {segue ? <Crosshair className="size-3 shrink-0 opacity-80" /> : null}
            <button
              type="button"
              className="flex size-4 shrink-0 items-center justify-center rounded-sm opacity-60 hover:bg-black/15 hover:opacity-100"
              aria-label={t.camerasSalvas.removerNome(camera.nome)}
              title={t.camerasSalvas.removerCamera}
              onClick={() => removerCamera(sceneId, camera.id)}
            >
              <X className="size-3" />
            </button>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onClick={() =>
              transmitirCamera(sceneId, transmissao ? undefined : camera.id)
            }
          >
            <Radio />
            {transmissao === "no-ar"
              ? t.camerasSalvas.tirarDoAr
              : transmissao === "preparada"
                ? t.camerasSalvas.desfazerPreparacao
                : t.camerasSalvas.transmitir}
            {selecionada ? (
              <ContextMenuShortcut>{TECLA.transmitir}</ContextMenuShortcut>
            ) : null}
          </ContextMenuItem>
          {doOutroModo ? null : (
            <ContextMenuItem
              onClick={() => {
                selecionar(camera.id);
                enquadrarAqui();
              }}
            >
              <ScanSearch />
              {t.camerasSalvas.trazerParaOndeEstou}
              {selecionada ? (
                <ContextMenuShortcut>{TECLA.trazer}</ContextMenuShortcut>
              ) : null}
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={renomear.pedir}>
            <TextCursorInput />
            {t.camerasSalvas.renomear}
            <ContextMenuShortcut>{TECLA.renomear}</ContextMenuShortcut>
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem
            variant="destructive"
            onClick={() => removerCamera(sceneId, camera.id)}
          >
            <Trash2 />
            {t.camerasSalvas.remover}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  return (
    <ContextMenu onOpenChangeComplete={renomear.aoFechar}>
      {/* O chip é DOIS botões lado a lado, e não um com o X dentro: botão
          dentro de botão não é HTML válido, e o clique no X subiria como um
          clique de selecionar. O fundo aceso mora no invólucro, para os dois
          lerem como uma peça só. */}
      <ContextMenuTrigger
        className={cn(
          "hover:bg-accent flex h-7 max-w-36 shrink-0 items-center rounded-md text-xs",
          selecionada &&
            "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        <button
          type="button"
          className="flex h-full min-w-0 items-center gap-1 pr-1 pl-2"
          title={titulo}
          onClick={selecionarEsta}
          onDoubleClick={() => setRenomeando(true)}
          onKeyDown={aoApertarF2(() => setRenomeando(true))}
        >
          {/* O número É a tecla. Fora do nome para não sumir no corte. */}
          <span className="tabular-nums opacity-70">{posicao}</span>
          {transmissao ? (
            <CircleDot
              className={cn(
                "size-3 shrink-0",
                transmissao === "no-ar" ? "text-red-400" : "text-amber-400",
              )}
            />
          ) : null}
          {/* O tripé leva a câmera na frente do nome: é o que diz que a mesa,
              com ele no ar, vê de esguelha. */}
          {tipo === "tripe" ? (
            <Video className="size-3 shrink-0 opacity-80" />
          ) : null}
          <span className="truncate">{camera.nome}</span>
          {/* Segue tokens, e não um lugar: a mira diz isso sem ocupar o
              nome. */}
          {segue ? <Crosshair className="size-3 shrink-0 opacity-80" /> : null}
        </button>
        {/* Remover a um toque, como fechar uma aba. Sem pergunta: a câmera
            entra no desfazer, e o Ctrl+Z a devolve com nome e recorte. */}
        <button
          type="button"
          className="mr-1 flex size-4 shrink-0 items-center justify-center rounded-sm opacity-60 hover:bg-black/15 hover:opacity-100"
          aria-label={t.camerasSalvas.removerNome(camera.nome)}
          title={t.camerasSalvas.removerCamera}
          onClick={() => removerCamera(sceneId, camera.id)}
        >
          <X className="size-3" />
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onClick={() =>
            transmitirCamera(sceneId, transmissao ? undefined : camera.id)
          }
        >
          <Radio />
          {transmissao === "no-ar"
            ? t.camerasSalvas.tirarDoAr
            : transmissao === "preparada"
              ? t.camerasSalvas.desfazerPreparacao
              : t.camerasSalvas.transmitir}
          {selecionada ? (
            <ContextMenuShortcut>{TECLA.transmitir}</ContextMenuShortcut>
          ) : null}
        </ContextMenuItem>
        {doOutroModo ? null : (
          <ContextMenuItem
            onClick={() => {
              selecionar(camera.id);
              enquadrarAqui();
            }}
          >
            <ScanSearch />
            {t.camerasSalvas.trazerParaOndeEstou}
            {selecionada ? (
              <ContextMenuShortcut>{TECLA.trazer}</ContextMenuShortcut>
            ) : null}
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={renomear.pedir}>
          <TextCursorInput />
          {t.camerasSalvas.renomear}
          <ContextMenuShortcut>{TECLA.renomear}</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem
          variant="destructive"
          onClick={() => removerCamera(sceneId, camera.id)}
        >
          <Trash2 />
          {t.camerasSalvas.remover}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
