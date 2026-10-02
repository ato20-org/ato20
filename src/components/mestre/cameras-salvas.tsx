"use client";

import { useEffect, useRef, useState } from "react";
import {
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
import { useSceneStore } from "@/lib/store/use-scene-store";
import { cn } from "@/lib/utils";
import { camerasDoModo, type Scene } from "@/types/scene";

/**
 * As câmeras da cena, como chips numerados ao lado do zoom.
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
 * REC valem para as duas. As DUAS listas ficam à vista, cada uma na sua barra
 * (pedido do usuário): a do modo embaixo, inteira; a do outro em cima,
 * compacta -- só os chips, com o REC. Ver `BarraDoOutroModo`.
 */
export function CamerasSalvas({ scene }: { scene: Scene }) {
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
  const lista = camerasDoModo(scene, deEsguelha);
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
  }, [lista.length]);

  // `#000` é só "opaco aqui": a cor não conta, a máscara lê o canal alfa, e o
  // transparente da ponta revela o fundo da pílula por baixo do chip.
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
    <div className="flex flex-col items-end gap-1.5">
      <BarraDoOutroModo
        scene={scene}
        deEsguelha={deEsguelha}
        cenaNoAr={cenaNoAr}
      />
      <div className="bg-background/85 pointer-events-auto flex items-center gap-0.5 rounded-lg border p-1 backdrop-blur">
        <RotuloDaBarra>{deEsguelha ? "Tripés" : "Câmeras"}</RotuloDaBarra>
        {/* A faixa das câmeras rola dentro de uma largura fixa; o novo, o
          transmitir e o menu ficam à vista ao lado. Sem o teto, a pílula
          crescia com cada câmera até atravessar a tela. Agora ela para, e as
          que não cabem esperam na rolagem -- o número no chip é a tecla, e
          Shift+n chega a elas sem precisar vê-las. */}
        <div
          ref={faixaRef}
          className="rolagem-limpa flex max-w-xl items-center gap-0.5 overflow-x-auto"
          style={
            mascara
              ? { maskImage: mascara, WebkitMaskImage: mascara }
              : undefined
          }
        >
          {lista.map((camera, index) => (
            <Chip
              key={camera.id}
              sceneId={scene.id}
              camera={camera}
              tipo={deEsguelha ? "tripe" : "recorte"}
              posicao={index + 1}
              selecionada={camera.id === selecionadaId}
              transmissao={transmissaoDaCamera(scene, camera.id, cenaNoAr)}
            />
          ))}
        </div>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                aria-label={deEsguelha ? "Nova câmera daqui" : "Nova câmera"}
                onClick={() => novaCamera()}
              >
                <Plus />
              </Button>
            }
          />
          <TooltipContent>
            <p className="font-medium">
              {deEsguelha ? "Nova câmera daqui" : "Nova câmera"}
            </p>
            <p className="text-muted-foreground max-w-52">
              {deEsguelha
                ? "Um tripé no lugar de onde você está olhando, fora do ar. O T o transmite, e aí a janela do espectador passa a ver de esguelha por ele."
                : "Nasce sobre a selecionada, ou sobre o que você vê, e já no ar."}
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
                    ? "Tirar do ar"
                    : transmissao === "preparada"
                      ? "Desfazer a preparação"
                      : "Transmitir a câmera selecionada"
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
                ? "Tirar do ar"
                : transmissao === "preparada"
                  ? "Preparada"
                  : "Transmitir"}
            </p>
            <p className="text-muted-foreground max-w-52">
              {transmissao === "no-ar"
                ? "A mesa volta a ver o mapa inteiro."
                : transmissao === "preparada"
                  ? "A mesa vê esta câmera quando o mapa for ao ar. Clique desfaz."
                  : "A mesa passa a ver a câmera selecionada."}
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
                aria-label="Mais comandos da câmera"
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
                Trazer para aqui
                <DropdownMenuShortcut>C</DropdownMenuShortcut>
              </DropdownMenuItem>
            ) : null}
            {recorte ? (
              <>
                <DropdownMenuItem onClick={irParaCamera}>
                  <LocateFixed />
                  Ir até a câmera
                  <DropdownMenuShortcut>Home</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!temSelecao}
                  onClick={enquadrarSelecao}
                >
                  <Focus />
                  Enquadrar a seleção
                  <DropdownMenuShortcut>F</DropdownMenuShortcut>
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
                  Seguir a seleção
                  <DropdownMenuShortcut>L</DropdownMenuShortcut>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={espelhoMestre}
                  onCheckedChange={alternarEspelho}
                >
                  <Eye />
                  Espelhar o palco
                  <DropdownMenuShortcut>Shift+L</DropdownMenuShortcut>
                </DropdownMenuCheckboxItem>
              </>
            ) : null}
            <DropdownMenuCheckboxItem
              checked={fantasmasVisiveis}
              onCheckedChange={alternarFantasmas}
            >
              {fantasmasVisiveis ? <Eye /> : <EyeOff />}
              Outras câmeras no mapa
            </DropdownMenuCheckboxItem>

            {scene.cameraNoArId ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={mostrarCenaInteira}>
                  <Maximize />
                  Mostrar a cena inteira
                  <DropdownMenuShortcut>Shift+C</DropdownMenuShortcut>
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
              Remover a câmera
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
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

/**
 * A lista do OUTRO modo, compacta, em cima da barra do modo: os tripés no 2D,
 * as câmeras 2D no 2.5D.
 *
 * Só os chips, com o REC de quem está no ar: o novo, o transmitir e o menu
 * agem sobre a câmera do modo, e repeti-los aqui seria um segundo T que não
 * transmite o que diz. O clique leva ao modo da câmera, já com ela
 * selecionada, porque é lá que ela se ajusta; o menu do chip (transmitir,
 * renomear, remover) vale daqui mesmo. Vazia, não aparece.
 */
function BarraDoOutroModo({
  scene,
  deEsguelha,
  cenaNoAr,
}: {
  scene: Scene;
  deEsguelha: boolean;
  cenaNoAr: boolean;
}) {
  const lista = camerasDoModo(scene, !deEsguelha);
  if (lista.length === 0) return null;

  return (
    <div className="bg-background/70 pointer-events-auto flex items-center gap-0.5 rounded-lg border p-1 backdrop-blur">
      <RotuloDaBarra>{deEsguelha ? "Câmeras" : "Tripés"}</RotuloDaBarra>
      <div className="rolagem-limpa flex max-w-xl items-center gap-0.5 overflow-x-auto">
        {lista.map((camera, index) => (
          <Chip
            key={camera.id}
            sceneId={scene.id}
            camera={camera}
            tipo={deEsguelha ? "recorte" : "tripe"}
            posicao={index + 1}
            selecionada={false}
            transmissao={transmissaoDaCamera(scene, camera.id, cenaNoAr)}
            doOutroModo
          />
        ))}
      </div>
    </div>
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
};

function Chip({
  sceneId,
  camera,
  tipo,
  posicao,
  selecionada,
  transmissao,
  doOutroModo = false,
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
        aria-label="Nome da câmera"
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
          title={
            doOutroModo
              ? `${camera.nome}: clique para ir ao ${tipo === "tripe" ? "2.5D" : "2D"}`
              : `${camera.nome} (Shift+${posicao})`
          }
          onClick={() => {
            // A troca primeiro: ela escolhe a câmera do modo novo, e a do
            // clique passa por cima. Ver o seguidor da troca no
            // `useCameraLockStore`.
            if (doOutroModo) alternarModo();
            selecionar(camera.id);
          }}
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
          aria-label={`Remover ${camera.nome}`}
          title="Remover a câmera"
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
            ? "Tirar do ar"
            : transmissao === "preparada"
              ? "Desfazer a preparação"
              : "Transmitir"}
          {selecionada ? <ContextMenuShortcut>T</ContextMenuShortcut> : null}
        </ContextMenuItem>
        {doOutroModo ? null : (
          <ContextMenuItem
            onClick={() => {
              selecionar(camera.id);
              enquadrarAqui();
            }}
          >
            <ScanSearch />
            Trazer para onde estou
            {selecionada ? <ContextMenuShortcut>C</ContextMenuShortcut> : null}
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={renomear.pedir}>
          <TextCursorInput />
          Renomear
          <ContextMenuShortcut>F2</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem
          variant="destructive"
          onClick={() => removerCamera(sceneId, camera.id)}
        >
          <Trash2 />
          Remover
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
