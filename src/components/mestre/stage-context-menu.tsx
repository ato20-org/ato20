"use client";

import { useState, type ReactNode } from "react";
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
  Layers,
  LocateFixed,
  Lock,
  LockOpen,
  Maximize,
  MousePointerSquareDashed,
  Plus,
  Radio,
  RectangleHorizontal,
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
  irParaCamera,
  mostrarCenaInteira,
  novaCamera,
  transmissaoDaCamera,
  voltarAoFormatoDaMesa,
} from "@/lib/mestre/camera-actions";
import { temFormatoDaMesa } from "@/lib/geometry/viewport";
import { useCameraLockStore } from "@/lib/store/use-camera-lock-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import {
  temAlgoParaColar,
  useClipboardStore,
} from "@/lib/store/use-clipboard-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { temCamera, temLuz, type CameraSalva, type Scene } from "@/types/scene";
import { BlocoDaLuz, SubmenuDaLanterna } from "@/components/mestre/menu-da-luz";
import { SubmenuDeAparencias } from "@/components/mestre/aparencias-personagem";
import { SubmenuDeCondicoes } from "@/components/mestre/menu-de-condicoes";
import { KIT_CONTEXTO } from "@/components/ui/menu-kit";
import {
  ItensDeExtensao,
  useTemItensDeExtensao,
} from "@/components/mestre/itens-de-extensao";
import { useCharactersStore } from "@/lib/store/use-characters-store";

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
  const selectedPostitIds = useSelectionStore(
    (state) => state.selectedPostitIds,
  );
  const selectedDocumentoIds = useSelectionStore(
    (state) => state.selectedDocumentoIds,
  );
  const selectedTracoIds = useSelectionStore((state) => state.selectedTracoIds);
  const selectedFogId = useSelectionStore((state) => state.selectedFogId);
  const selectedLuzId = useSelectionStore((state) => state.selectedLuzId);
  const selectedParedeId = useSelectionStore((state) => state.selectedParedeId);
  const selectedPortraitIds = useSelectionStore((state) => state.selectedPortraitIds);
  /**
   * Parede e retrato não têm menu de fábrica, e o botão direito neles caía no
   * menu do vazio. Ganham um bloco SÓ quando algum plugin declarou item para
   * eles: sem plugin, nada muda -- e é o que separa "abrir o encaixe" de
   * "decidir que parede tem menu", que é outra decisão.
   */
  const paredeComItens = useTemItensDeExtensao("palco.parede");
  const retratoComItens = useTemItensDeExtensao("palco.retrato");
  const hasClipboard = useClipboardStore(temAlgoParaColar);
  /**
   * A moldura de câmera que levou o botão direito, se foi numa.
   *
   * Lida do ALVO do evento, e não de um estado que a moldura acende: a moldura
   * não sabe quando o menu abre, e uma marca esquecida acesa faria o próximo
   * botão direito no vazio abrir o menu da câmera. Guardada ao abrir e não
   * limpa ao fechar, para o menu não trocar de conteúdo durante a saída.
   */
  const [cameraDoMenuId, setCameraDoMenuId] = useState<string | null>(null);

  const selectedItems = scene.items.filter((item) =>
    selectedIds.includes(item.id),
  );
  const hasSelection = selectedItems.length > 0;
  /**
   * O personagem do token na mão, quando há UM só e ele é de alguém.
   *
   * Um só de propósito: trocar a aparência de cinco tokens de uma vez pediria
   * uma lista de aparências que nenhum deles tem igual -- são personagens
   * diferentes, com estados diferentes. O gesto que existe é "este aqui está
   * ferido".
   */
  const personagens = useCharactersStore((state) => state.personagens);
  const recarregarPersonagens = useCharactersStore(
    (state) => state.recarregar,
  );
  const doToken =
    selectedItems.length === 1 && selectedItems[0]?.personagemId
      ? personagens?.find((p) => p.id === selectedItems[0]?.personagemId)
      : undefined;
  /** Algum token da seleção é de um personagem que ainda existe. */
  const deAlguem = selectedItems.some(
    (item) =>
      item.personagemId &&
      personagens?.some((personagem) => personagem.id === item.personagemId),
  );
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
  /**
   * Papel, cartão e risco na mão -- o que a área laça sem ser imagem.
   *
   * Entram no mesmo bloco curto. Papel e risco copiam; o cartão não (ver
   * `copySelection`), e um cartão sozinho na mão só ganha a linha de apagar:
   * oferecer "Copiar" para ele seria um item de menu que não faz nada.
   */
  const daMargem =
    selectedPostitIds.length +
    selectedDocumentoIds.length +
    selectedTracoIds.length;
  const soQuadro = !hasSelection && doQuadro + daMargem > 0;
  const copiavel =
    doQuadro + selectedPostitIds.length + selectedTracoIds.length;
  const selecionadaId = useCameraLockStore((state) => state.selecionadaId);
  const prenderNaSelecao = useCameraLockStore(
    (state) => state.prenderNaSelecao,
  );
  const soltar = useCameraLockStore((state) => state.soltar);
  /**
   * A câmera em edição -- nenhuma no QUADRO, que não tem câmera.
   *
   * Com ela indefinida, as entradas de câmera somem do bloco de baixo e as
   * duas do bloco do item ("segue este", "enquadrar este") ficariam apagadas;
   * elas também saem por `temCamera`, porque item cinza permanente num menu é
   * ruído em toda cena de quadro. Ver `lerCena` em `camera-actions`.
   */
  const comCamera = temCamera(scene);
  const cameraSelecionada = comCamera
    ? scene.cameras?.find((camera) => camera.id === selecionadaId)
    : undefined;
  const segue = Boolean(cameraSelecionada?.alvoIds);
  const cenaNoAr = useSceneStore(
    (state) => state.board?.liveSceneId === scene.id,
  );
  const transmissao = transmissaoDaCamera(
    scene,
    cameraSelecionada?.id,
    cenaNoAr,
  );
  /**
   * O menu é da moldura pelo id, e não por achar a câmera: removida pelo
   * próprio menu, ela some da cena enquanto ele ainda está saindo, e o menu do
   * vazio piscaria no lugar. O id só é guardado quando a moldura existia.
   */
  const naCamera = comCamera && cameraDoMenuId !== null;
  const cameraNoMenu = naCamera
    ? scene.cameras?.find((camera) => camera.id === cameraDoMenuId)
    : undefined;
  const allLocked = hasSelection && selectedItems.every((item) => item.locked);
  /** O texto e a forma da mão, para o bloco curto saber se estão todos presos. */
  const doQuadroNaMao = [
    ...(scene.textos ?? []).filter((texto) =>
      selectedTextoIds.includes(texto.id),
    ),
    ...(scene.formas ?? []).filter((forma) =>
      selectedFormaIds.includes(forma.id),
    ),
  ];
  const quadroTravado =
    doQuadroNaMao.length > 0 && doQuadroNaMao.every((coisa) => coisa.locked);
  const opacidade = opacidadeDaSelecao(selectedItems);
  const selectedFog = scene.fog.find((region) => region.id === selectedFogId);
  const selectedLuz = scene.luzes?.find((luz) => luz.id === selectedLuzId);
  const paredeNaMao = Boolean(selectedParedeId) && paredeComItens;
  const retratoNaMao = selectedPortraitIds.length > 0 && retratoComItens;
  /** Nada selecionado: o botão direito foi no vazio. Ver o bloco da cena. */
  const nadaNaMao =
    !naCamera &&
    !hasSelection &&
    !soQuadro &&
    !selectedFog &&
    !selectedLuz &&
    !paredeNaMao &&
    !retratoNaMao;

  return (
    <ContextMenu
      onOpenChange={(aberto, detalhes) => {
        if (!aberto) return;
        const alvo = detalhes.event?.target;
        setCameraDoMenuId(
          alvo instanceof Element
            ? (alvo.closest("[data-camera-id]")?.getAttribute("data-camera-id") ??
                null)
            : null,
        );
      }}
    >
      <ContextMenuTrigger className="flex min-h-0 flex-1 flex-col">
        {children}
      </ContextMenuTrigger>

      {/* O separador que sobra no fim some. Cada bloco termina com um porque
          o da cena vinha embaixo de todos; agora ele só aparece no vazio, e
          com algo na mão o último separador ficaria pendurado no pé do menu.
          Uma regra aqui, e não um condicional em cada bloco: são quatro, e o
          próximo que entrar nasceria com o mesmo pé solto. */}
      <ContextMenuContent className="w-56 [&>[data-slot=context-menu-separator]:last-child]:hidden">
        {cameraNoMenu ? (
          <BlocoDaCamera scene={scene} camera={cameraNoMenu} />
        ) : null}

        {selectedLuz && !naCamera ? (
          <>
            <BlocoDaLuz sceneId={scene.id} luz={selectedLuz} />
            <ItensDeExtensao
              alvo="palco.luz"
              contexto={{ alvo: "palco.luz", luzId: selectedLuz.id }}
              kit={KIT_CONTEXTO}
            />
          </>
        ) : null}

        {selectedFog && !naCamera ? (
          <>
            <ContextMenuItem onClick={() => toggleFogRevealed()}>
              {selectedFog.revealed ? <EyeOff /> : <Eye />}
              {selectedFog.revealed
                ? "Esconder de novo"
                : "Revelar para a mesa"}
            </ContextMenuItem>
            <ContextMenuItem onClick={toggleSelectionLock}>
              {selectedFog.locked ? <LockOpen /> : <Lock />}
              {selectedFog.locked ? "Destravar" : "Travar"}
            </ContextMenuItem>
            {/* Apagado na travada, e não sumido: ver o da luz. */}
            <ContextMenuItem
              variant="destructive"
              disabled={Boolean(selectedFog.locked)}
              onClick={removeFogSelection}
            >
              <Trash2 />
              Remover área
              <ContextMenuShortcut>Del</ContextMenuShortcut>
            </ContextMenuItem>
            <ItensDeExtensao
              alvo="palco.area"
              contexto={{ alvo: "palco.area", areaId: selectedFog.id }}
              kit={KIT_CONTEXTO}
            />

            <ContextMenuSeparator />
          </>
        ) : null}

        {soQuadro && !naCamera ? (
          <>
            {/* As três da área de transferência só aparecem com algo que ela
                saiba recriar: um cartão sozinho não copia, não recorta e não
                duplica -- e um item de menu que não faz nada é pior que item
                nenhum. Ver `copySelection`. */}
            {copiavel > 0 ? (
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
              </>
            ) : null}
            {doQuadroNaMao.length > 0 ? (
              <ContextMenuItem onClick={toggleSelectionLock}>
                {quadroTravado ? <LockOpen /> : <Lock />}
                {quadroTravado ? "Destravar" : "Travar"}
              </ContextMenuItem>
            ) : null}
            <ContextMenuItem
              variant="destructive"
              disabled={quadroTravado && daMargem === 0}
              onClick={() => removeSelection()}
            >
              <Trash2 />
              Remover
              <ContextMenuShortcut>Del</ContextMenuShortcut>
            </ContextMenuItem>
            <ItensDeExtensao
              alvo="palco.quadro"
              contexto={{
                alvo: "palco.quadro",
                textoIds: selectedTextoIds,
                formaIds: selectedFormaIds,
                postitIds: selectedPostitIds,
                documentoIds: selectedDocumentoIds,
                tracoIds: selectedTracoIds,
              }}
              kit={KIT_CONTEXTO}
            />

            <ContextMenuSeparator />
          </>
        ) : null}

        {hasSelection && !naCamera ? (
          <>
            {/* Antes de copiar porque é a ação do token COMO personagem, e as
                de baixo o tratam como imagem. Some quando o token não é de
                ninguém, que é a maioria deles. */}
            {doToken ? (
              <SubmenuDeAparencias
                kit={KIT_CONTEXTO}
                personagem={doToken}
                onChanged={recarregarPersonagens}
              />
            ) : null}
            {/* Da seleção inteira, e não só do token único: envenenar a horda
                de uma vez é o pedido. Some quando nenhum token é de alguém. */}
            {deAlguem ? (
              <>
                <SubmenuDeCondicoes itens={selectedItems} />
                <ContextMenuSeparator />
              </>
            ) : null}

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

            {/* Os submenus desta faixa são o que muda como o token APARECE,
                e a mesa vê os três. Espelhar era duas linhas soltas, e com
                as duas o menu passava de vinte e cinco: aqui cada família é
                uma linha, e quem quer o atalho o vê ao abrir. */}
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <FlipHorizontal />
                Espelhar
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="min-w-40">
                <ContextMenuItem onClick={() => flipSelection("x")}>
                  <FlipHorizontal />
                  Na horizontal
                  <ContextMenuShortcut>Shift+H</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem onClick={() => flipSelection("y")}>
                  <FlipVertical />
                  Na vertical
                  <ContextMenuShortcut>Shift+V</ContextMenuShortcut>
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>

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

            {/* Depois da opacidade, pela mesma razão: muda o que a mesa vê
                do token. Só no mapa, que é a cena que tem escuro. */}
            {temLuz(scene) ? <SubmenuDaLanterna itens={selectedItems} /> : null}

            {/* A câmera, junto das ações DO ITEM e não lá embaixo com as da
                cena: quem clica com o botão direito num token está pensando
                nele, e "a câmera segue este" é uma coisa que se faz com o
                token. Num submenu, porque são duas e têm atalho de uma letra. */}
            {comCamera ? (
              <>
                <ContextMenuSeparator />

                <ContextMenuSub>
                  <ContextMenuSubTrigger disabled={!cameraSelecionada}>
                    <Focus />
                    Câmera
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="min-w-48">
                    <ContextMenuItem
                      onClick={segue ? soltar : prenderNaSelecao}
                    >
                      <Crosshair />
                      {segue
                        ? "Deixar de seguir"
                        : selectedItems.length > 1
                          ? "Seguir estes"
                          : "Seguir este"}
                      <ContextMenuShortcut>L</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem onClick={enquadrarSelecao}>
                      <Focus />
                      {selectedItems.length > 1
                        ? "Enquadrar estes"
                        : "Enquadrar este"}
                      <ContextMenuShortcut>F</ContextMenuShortcut>
                    </ContextMenuItem>
                  </ContextMenuSubContent>
                </ContextMenuSub>
              </>
            ) : null}

            <ContextMenuSeparator />

            {/* A ordem de empilhamento é arrumação de bancada, como agrupar e
                travar, e mora com eles. Eram quatro linhas por conta própria;
                num submenu, a mão que quer só o "para a frente" abre um nível
                a mais, e quem usa todo dia tem o Ctrl+] . */}
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Layers />
                Ordem
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="min-w-56">
                <ContextMenuItem onClick={() => moveSelectionZ("front")}>
                  <ChevronsUp />
                  Trazer para a frente
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
              </ContextMenuSubContent>
            </ContextMenuSub>
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
                Token de personagem não vai -- ver `guardarNoHandout` --, e
                com a seleção toda de personagens a linha SOME em vez de ficar
                cinza: apagada ela aparecia em todo botão direito de token de
                jogador, dizendo uma coisa que não se pode fazer. */}
            {selectedItems.some((item) => !item.personagemId) ? (
              <ContextMenuItem onClick={guardarSelecaoNoHandout}>
                <Images />
                Guardar no handout
              </ContextMenuItem>
            ) : null}
            <ContextMenuItem
              variant="destructive"
              // Com texto ou forma livres junto, o Remover ainda tem o que
              // tirar: só apaga quando TUDO na mão está preso.
              disabled={
                allLocked && doQuadroNaMao.every((coisa) => coisa.locked)
              }
              onClick={() => removeSelection()}
            >
              <Trash2 />
              Remover
              <ContextMenuShortcut>Del</ContextMenuShortcut>
            </ContextMenuItem>
            <ItensDeExtensao
              alvo="palco.token"
              contexto={{
                alvo: "palco.token",
                itens: selectedItems,
                personagemIds: selectedItems
                  .map((item) => item.personagemId)
                  .filter((id): id is string => Boolean(id)),
              }}
              kit={KIT_CONTEXTO}
            />

            <ContextMenuSeparator />
          </>
        ) : null}

        {/* Parede e retrato: só o que os plugins trouxeram. Ver `paredeComItens`. */}
        {paredeNaMao && selectedParedeId && !naCamera ? (
          <>
            <ItensDeExtensao
              alvo="palco.parede"
              contexto={{ alvo: "palco.parede", paredeId: selectedParedeId }}
              kit={KIT_CONTEXTO}
            />
            <ContextMenuSeparator />
          </>
        ) : null}
        {retratoNaMao && !naCamera ? (
          <>
            <ItensDeExtensao
              alvo="palco.retrato"
              contexto={{ alvo: "palco.retrato", retratoIds: selectedPortraitIds }}
              kit={KIT_CONTEXTO}
            />
            <ContextMenuSeparator />
          </>
        ) : null}

        {/* O que é da CENA -- colar, selecionar tudo, a câmera -- só no botão
            direito do vazio. Com algo na mão o menu é daquilo que foi clicado:
            eram mais sete linhas embaixo das do token, e o menu dele passava
            de vinte e cinco. O vazio continua a um clique fora, e os atalhos
            valem com qualquer seleção. */}
        {nadaNaMao ? (
          <>
            {/* Tudo o que foi copiado volta junto, como no Ctrl+V. */}
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

            {comCamera ? (
              <>
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
                  {transmissao === "no-ar"
                    ? "Tirar do ar"
                    : transmissao === "preparada"
                      ? "Desfazer a preparação"
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
              </>
            ) : null}
            <ItensDeExtensao
              alvo="palco.vazio"
              contexto={{ alvo: "palco.vazio" }}
              kit={KIT_CONTEXTO}
            />
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * O botão direito NUMA moldura de câmera: o que se faz com aquela câmera.
 *
 * Qualquer uma, e não só a selecionada: a outra câmera do mapa também tem
 * moldura, e é nela que o mestre clica quando quer se livrar dela. Transmitir e
 * trazer não pedem que ela seja a selecionada antes -- o menu seleciona, como
 * o chip faz.
 *
 * Remover sem perguntar: a câmera entra no desfazer como qualquer edição da
 * cena, e o Ctrl+Z a devolve com o nome e o recorte. Ver `removerCamera`.
 */
function BlocoDaCamera({
  scene,
  camera,
}: {
  scene: Scene;
  camera: CameraSalva;
}) {
  const selecionar = useCameraLockStore((state) => state.selecionar);
  const selecionadaId = useCameraLockStore((state) => state.selecionadaId);
  const transmitirCamera = useSceneStore((state) => state.transmitirCamera);
  const removerCamera = useSceneStore((state) => state.removerCamera);

  const cenaNoAr = useSceneStore(
    (state) => state.board?.liveSceneId === scene.id,
  );
  const transmissao = transmissaoDaCamera(scene, camera.id, cenaNoAr);
  const selecionada = camera.id === selecionadaId;

  return (
    <>
      <ContextMenuItem
        onClick={() =>
          transmitirCamera(scene.id, transmissao ? undefined : camera.id)
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
      <ContextMenuItem
        onClick={() => {
          selecionar(camera.id);
          irParaCamera();
        }}
      >
        <LocateFixed />
        Ir até a câmera
        {selecionada ? <ContextMenuShortcut>Home</ContextMenuShortcut> : null}
      </ContextMenuItem>
      {/* Só quando há o que desfazer: na câmera 16:9 o item não faria nada, e
          um item que não faz nada ensina a não confiar no menu. */}
      {temFormatoDaMesa(camera.viewport) ? null : (
        <ContextMenuItem
          onClick={() => {
            selecionar(camera.id);
            voltarAoFormatoDaMesa();
          }}
        >
          <RectangleHorizontal />
          Voltar a 16:9
        </ContextMenuItem>
      )}

      <ContextMenuSeparator />

      <ContextMenuItem
        variant="destructive"
        onClick={() => removerCamera(scene.id, camera.id)}
      >
        <Trash2 />
        Remover câmera
      </ContextMenuItem>
    </>
  );
}
