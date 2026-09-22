"use client";

import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Blend,
  ChevronsDown,
  ChevronsUp,
  ClipboardPaste,
  Copy,
  Crosshair,
  CopyPlus,
  Eye,
  EyeOff,
  FlipHorizontal,
  FlipVertical,
  Focus,
  Group,
  Images,
  Lock,
  LockOpen,
  Maximize,
  MousePointerSquareDashed,
  Plus,
  Radio,
  ScanSearch,
  Scissors,
  Trash2,
  Ungroup,
} from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  copySelection,
  cutSelection,
  DEGRAUS_OPACIDADE,
  duplicateSelection,
  flipSelection,
  moveSelectionZ,
  opacidadeDaSelecao,
  pasteClipboard,
  removeFogSelection,
  guardarSelecaoNoHandout,
  removeSelection,
  selectAllItems,
  setSelectionOpacity,
  toggleFogRevealed,
  toggleSelectionLock,
  agruparSelecao,
  desagruparSelecao,
} from "@/lib/mestre/item-actions";
import {
  alternarTransmissao,
  enquadrarAqui,
  enquadrarSelecao,
  mostrarCenaInteira,
  novaCamera,
} from "@/lib/mestre/camera-actions";
import { useCameraLockStore } from "@/lib/store/use-camera-lock-store";
import { useClipboardStore } from "@/lib/store/use-clipboard-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import type { Scene } from "@/types/scene";

/**
 * Menu de botão direito do palco. Um único menu para a cena inteira em vez de
 * um por item: o item clicado já entra na seleção no pointerdown, então o
 * menu só precisa olhar o que está selecionado.
 */
export function StageContextMenu({
  scene,
  children,
}: {
  scene: Scene;
  children: ReactNode;
}) {
  const selectedIds = useSelectionStore((state) => state.selectedIds);
  const selectedTextoIds = useSelectionStore((state) => state.selectedTextoIds);
  const selectedFormaIds = useSelectionStore((state) => state.selectedFormaIds);
  const selectedFogId = useSelectionStore((state) => state.selectedFogId);
  const hasClipboard = useClipboardStore(
    (state) => state.drafts.length > 0 || state.textos.length > 0,
  );

  const selectedItems = scene.items.filter((item) =>
    selectedIds.includes(item.id),
  );
  const hasSelection = selectedItems.length > 0;
  /**
   * Só coisa do QUADRO na mão: texto solto, forma, ou os dois.
   *
   * Ganha um bloco curto em vez do menu de item inteiro: espelhar, opacidade,
   * empilhamento, travar e handout são coisas de imagem, e oferecê-las para
   * uma frase seria um menu de sete itens dos quais cinco não fazem nada. Com
   * imagem junto, o menu de sempre já leva as três listas -- as quatro ações da
   * área de transferência tratam todas.
   */
  const doQuadro = selectedTextoIds.length + selectedFormaIds.length;
  const soQuadro = !hasSelection && doQuadro > 0;
  const selecionadaId = useCameraLockStore((state) => state.selecionadaId);
  const prenderNaSelecao = useCameraLockStore(
    (state) => state.prenderNaSelecao,
  );
  const soltar = useCameraLockStore((state) => state.soltar);
  const cameraSelecionada = scene.cameras?.find(
    (camera) => camera.id === selecionadaId,
  );
  const segue = Boolean(cameraSelecionada?.alvoIds);
  const allLocked = hasSelection && selectedItems.every((item) => item.locked);
  const opacidade = opacidadeDaSelecao(selectedItems);
  const selectedFog = scene.fog.find((region) => region.id === selectedFogId);

  return (
    <ContextMenu>
      <ContextMenuTrigger className="flex min-h-0 flex-1 flex-col">
        {children}
      </ContextMenuTrigger>

      <ContextMenuContent className="w-56">
        {selectedFog ? (
          <>
            <ContextMenuItem onClick={() => toggleFogRevealed()}>
              {selectedFog.revealed ? <EyeOff /> : <Eye />}
              {selectedFog.revealed
                ? "Esconder de novo"
                : "Revelar para a mesa"}
            </ContextMenuItem>
            <ContextMenuItem variant="destructive" onClick={removeFogSelection}>
              <Trash2 />
              Remover área
              <ContextMenuShortcut>Del</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSeparator />
          </>
        ) : null}

        {soQuadro ? (
          <>
            <ContextMenuItem onClick={copySelection}>
              <Copy />
              Copiar
              <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={cutSelection}>
              <Scissors />
              Recortar
              <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={duplicateSelection}>
              <CopyPlus />
              Duplicar
              <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem variant="destructive" onClick={removeSelection}>
              <Trash2 />
              Remover
              <ContextMenuShortcut>Del</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSeparator />
          </>
        ) : null}

        {hasSelection ? (
          <>
            <ContextMenuItem onClick={copySelection}>
              <Copy />
              Copiar
              <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={cutSelection}>
              <Scissors />
              Recortar
              <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={duplicateSelection}>
              <CopyPlus />
              Duplicar
              <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onClick={() => flipSelection("x")}>
              <FlipHorizontal />
              Espelhar na horizontal
              <ContextMenuShortcut>Shift+H</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => flipSelection("y")}>
              <FlipVertical />
              Espelhar na vertical
              <ContextMenuShortcut>Shift+V</ContextMenuShortcut>
            </ContextMenuItem>

            {/* Vizinho do espelhar, e não do travar: os dois mudam como a
                imagem APARECE, e a mesa vê os dois. O travar e a ordem de
                empilhamento são arrumação de bancada. */}
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Blend />
                Opacidade
              </ContextMenuSubTrigger>
              {/* O submenu NÃO fecha ao escolher — é o padrão do item de
                  rádio, e aqui ele vale: escolher opacidade é olhar o palco e
                  corrigir, e um menu que fecha cobraria dois cliques por
                  tentativa. Fecha com Esc ou com um clique fora. */}
              <ContextMenuSubContent className="min-w-28">
                <ContextMenuRadioGroup
                  // `null` quando a seleção discorda: nenhum degrau marcado,
                  // que é o que se sabe. Escolher um iguala os dois.
                  value={opacidade ?? null}
                  onValueChange={(valor: number) => setSelectionOpacity(valor)}
                >
                  {DEGRAUS_OPACIDADE.map((degrau) => (
                    <ContextMenuRadioItem key={degrau} value={degrau}>
                      {degrau === 1 ? "Normal" : `${Math.round(degrau * 100)}%`}
                    </ContextMenuRadioItem>
                  ))}
                </ContextMenuRadioGroup>
              </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuSeparator />

            <ContextMenuItem onClick={() => moveSelectionZ("front")}>
              <ChevronsUp />
              Trazer para frente
              <ContextMenuShortcut>Ctrl+Shift+]</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => moveSelectionZ("forward")}>
              <ArrowUp />
              Avançar
              <ContextMenuShortcut>Ctrl+]</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => moveSelectionZ("backward")}>
              <ArrowDown />
              Recuar
              <ContextMenuShortcut>Ctrl+[</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => moveSelectionZ("back")}>
              <ChevronsDown />
              Enviar para trás
              <ContextMenuShortcut>Ctrl+Shift+[</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSeparator />

            {/* Junto das ações DO ITEM, e não lá embaixo com a câmera: quem
                clica com o botão direito num token está pensando nele, e
                "a câmera segue este" é uma coisa que se faz com o token. */}
            <ContextMenuItem
              disabled={!cameraSelecionada}
              onClick={segue ? soltar : prenderNaSelecao}
            >
              <Crosshair />
              {segue
                ? "Câmera deixa de seguir"
                : selectedItems.length > 1
                  ? "Câmera segue estes"
                  : "Câmera segue este"}
              <ContextMenuShortcut>L</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!cameraSelecionada}
              onClick={enquadrarSelecao}
            >
              <Focus />
              {selectedItems.length > 1
                ? "Enquadrar estes na câmera"
                : "Enquadrar este na câmera"}
              <ContextMenuShortcut>F</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onClick={() => void agruparSelecao()}>
              <Group />
              Agrupar
              <ContextMenuShortcut>Ctrl+G</ContextMenuShortcut>
            </ContextMenuItem>
            {selectedItems.some((item) => item.grupoId) ? (
              <ContextMenuItem onClick={desagruparSelecao}>
                <Ungroup />
                Desagrupar
                <ContextMenuShortcut>Ctrl+Shift+G</ContextMenuShortcut>
              </ContextMenuItem>
            ) : null}
            <ContextMenuItem onClick={toggleSelectionLock}>
              {allLocked ? <LockOpen /> : <Lock />}
              {allLocked ? "Destravar" : "Travar"}
            </ContextMenuItem>
            {/* Atalho do arrasto até a bolinha: sai da mesa, fica na manga.
                Token de personagem não vai -- ver `guardarNoHandout`. */}
            <ContextMenuItem
              disabled={selectedItems.every((item) => item.personagemId)}
              onClick={guardarSelecaoNoHandout}
            >
              <Images />
              Guardar no handout
            </ContextMenuItem>
            <ContextMenuItem variant="destructive" onClick={removeSelection}>
              <Trash2 />
              Remover
              <ContextMenuShortcut>Del</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSeparator />
          </>
        ) : null}

        {/* Imagens e textos copiados voltam juntos, como no Ctrl+V. */}
        <ContextMenuItem disabled={!hasClipboard} onClick={pasteClipboard}>
          <ClipboardPaste />
          Colar
          <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={
            scene.items.length === 0 &&
            !scene.textos?.length &&
            !scene.formas?.length
          }
          onClick={selectAllItems}
        >
          <MousePointerSquareDashed />
          Selecionar tudo
          <ContextMenuShortcut>Ctrl+A</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem
          disabled={!cameraSelecionada}
          onClick={enquadrarAqui}
        >
          <ScanSearch />
          Trazer a câmera para aqui
          <ContextMenuShortcut>C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => void novaCamera()}>
          <Plus />
          Nova câmera
          <ContextMenuShortcut>N</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!cameraSelecionada}
          onClick={alternarTransmissao}
        >
          <Radio />
          {cameraSelecionada && scene.cameraNoArId === cameraSelecionada.id
            ? "Tirar do ar"
            : "Transmitir a câmera"}
          <ContextMenuShortcut>T</ContextMenuShortcut>
        </ContextMenuItem>
        {scene.cameraNoArId ? (
          <ContextMenuItem onClick={mostrarCenaInteira}>
            <Maximize />
            Mostrar a cena inteira
            <ContextMenuShortcut>Shift+C</ContextMenuShortcut>
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}
