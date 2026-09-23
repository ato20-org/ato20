"use client";

import { useEffect, useMemo } from "react";
import Image from "next/image";
import { PanelLeftOpen, PanelRightOpen } from "lucide-react";

import logo from "@/assets/logo-white.png";

import { AbrirEspectador } from "@/components/mestre/abrir-espectador";
import { PlayersChip } from "@/components/mestre/players-chip";
import { TableInvite } from "@/components/mestre/table-invite";
import { DockRow } from "@/components/mestre/dock/dock-row";
import { TrackBar } from "@/components/mestre/track-bar";
import { WindowLayer } from "@/components/mestre/window-layer";
import { OnAirControl } from "@/components/mestre/on-air-control";
import { MestreStage } from "@/components/mestre/mestre-stage";
import {
  MestreToolbar,
  ReguaDeDesenho,
} from "@/components/mestre/mestre-toolbar";
import { PaletaDeComandos } from "@/components/mestre/paleta-de-comandos";
import { PinIndex } from "@/components/mestre/pin-index";
import { HandoutMestre } from "@/components/mestre/handout-mestre";
import { SaquinhoDados } from "@/components/mestre/saquinho-dados";
import { SpotlightChip } from "@/components/mestre/spotlight-chip";
import { StageContextMenu } from "@/components/mestre/stage-context-menu";
import { CamerasSalvas } from "@/components/mestre/cameras-salvas";
import { ViewportControls } from "@/components/mestre/viewport-controls";
import { SessionAudio } from "@/components/playground/session-audio";
import { useSomDaMesa } from "@/hooks/use-som-da-mesa";
import { SceneStage } from "@/components/playground/scene-stage";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCharacters } from "@/hooks/use-characters";
import { useEscopoDosAssets } from "@/hooks/use-escopo-dos-assets";
import { useUnioesDeRetratos } from "@/hooks/use-unioes-de-retratos";
import { useFontesDeRetrato } from "@/hooks/use-fontes-de-retrato";
import { useMestreShortcuts } from "@/hooks/use-mestre-shortcuts";
import { limitesDoConteudo } from "@/lib/geometry/limites";
import { PLANO } from "@/lib/geometry/viewport";
import { usePanMode } from "@/hooks/use-pan-mode";
import { usePublisher } from "@/hooks/use-scene-broadcast";
import { useJanelaDeRolagens } from "@/hooks/use-janela-de-rolagens";
import { useRolagensDaMesa } from "@/hooks/use-rolagens-da-mesa";
import { useSpacePan } from "@/hooks/use-space-pan";
import { usePanelsStore } from "@/lib/store/use-panels-store";
import { useLayoutStore } from "@/lib/store/use-layout-store";
import { useLeitorStore } from "@/lib/store/use-leitor-store";
import { useDadosStore } from "@/lib/store/use-dados-store";
import { useHandoutStore } from "@/lib/store/use-handout-store";
import { usePinWindowStore } from "@/lib/store/use-pin-window-store";
import { useWindowStore } from "@/lib/store/use-window-store";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import { retratosDaCena } from "@/lib/geometry/portrait";
import {
  selectEditingScene,
  selectLiveScene,
  useSceneStore,
} from "@/lib/store/use-scene-store";
import { useRolagensStore } from "@/lib/store/use-rolagens-store";
import { useSpotlightStore } from "@/lib/store/use-spotlight-store";
import { usePreferenciasStore } from "@/lib/store/use-preferencias-store";
import { useTrackStore } from "@/lib/store/use-track-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import { ehQuadro, type Scene } from "@/types/scene";
import { NotaEditor } from "@/components/mestre/editor-markdown";
import { useArquivoAbertoStore } from "@/lib/store/use-arquivo-aberto-store";

/**
 * A mesa.
 *
 * Monta com tudo já lido: quem carrega a campanha é o `CampaignBoot`, e este
 * componente antes disparava as hidratações nos próprios efeitos — o que fazia
 * a mesa aparecer aos pedaços e deixava os efeitos de publicação rodarem antes
 * de haver cena.
 */
export function MestreShell() {
  const status = useSceneStore((state) => state.status);
  const error = useSceneStore((state) => state.error);
  // Duas cenas distintas: a que o mestre edita e a que a mesa vê.
  const editingScene = useSceneStore(selectEditingScene);
  // Com nota aberta o palco não está na tela: índice de pontos e chip de
  // jogadores são do palco, e sobre um editor de texto seriam mobília.
  const lendoNota = useArquivoAbertoStore((state) => state.notaId !== null);
  const liveScene = useSceneStore(selectLiveScene);

  const leftOpen = usePanelsStore((state) => state.left);
  const rightOpen = usePanelsStore((state) => state.right);
  const toggleLeft = usePanelsStore((state) => state.toggleLeft);
  const toggleRight = usePanelsStore((state) => state.toggleRight);
  const restorePanels = usePanelsStore((state) => state.restore);
  const restorePinNotes = usePinWindowStore((state) => state.restaurar);
  const restoreSaquinho = useDadosStore((state) => state.restaurar);
  const restoreHandout = useHandoutStore((state) => state.restaurar);
  const restoreLayout = useLayoutStore((state) => state.restaurar);
  const restoreWindows = useWindowStore((state) => state.restaurar);
  const restoreLeitor = useLeitorStore((state) => state.restaurar);

  const track = useTrackStore((state) => state.track);
  // Os quatro faders vêm da preferência da MÁQUINA e não da campanha, mas
  // continuam viajando: o mestre regula e a TV e os celulares seguem. Ver
  // `Guardado` em `use-preferencias-store`.
  const trackVolume = usePreferenciasStore((state) => state.volumeSistema);
  const volumeTrilha = usePreferenciasStore((state) => state.volumeTrilha);
  const volumeAmbiente = usePreferenciasStore((state) => state.volumeAmbiente);
  const volumeDisparo = usePreferenciasStore((state) => state.volumeDisparo);
  const ambientes = useTrackStore((state) => state.ambientes);
  const disparos = useTrackStore((state) => state.disparos);

  // A cena no ar acende o ambiente que ela lembra, e a bandeja de disparos
  // vence sozinha. Ver `useSomDaMesa`.
  useSomDaMesa(liveScene?.id);

  const guardados = usePortraitStore((state) => state.portraits);
  const { personagens } = useCharacters();

  /**
   * O que a mesa vê: os retratos de quem tem token na cena NO AR.
   *
   * Pela cena no ar, e não pela que está sendo editada -- é a mesma promessa
   * que o resto da publicação faz. O mestre monta a cena seguinte com os
   * retratos dela já armados e posicionados, e nada disso chega à TV antes de
   * a cena subir. Ver `retratosDaCena`, que o painel usa com a outra cena.
   */
  const fontes = useFontesDeRetrato();
  /**
   * `useMemo`, e isto é um conserto de LAÇO, não uma economia.
   *
   * `retratosDaCena` constrói uma lista nova a cada chamada, e ela vai para o
   * `usePublisher`, cujo efeito tem `portraits` nas dependências. Sem memo, a
   * lista era nova em todo render, o efeito disparava em todo render, e a cena
   * inteira ia para a mesa de novo -- o que acorda esta árvore outra vez. O
   * resultado, medido com a bancada PARADA: o `MestreShell` renderizando 28
   * vezes por segundo, o palco e as trinta camadas de texto do quadro junto
   * com ele, e uma publicação por volta. Ver o comentário de `usePublisher`
   * sobre "dependências nos campos, não no objeto": ele evita o mesmo laço um
   * nível acima, e esta lista escapava por baixo.
   *
   * As quatro entradas são estáveis: o store dá `guardados` e `personagens`,
   * `items` é a lista imutável da cena e `useFontesDeRetrato` já memoiza.
   */
  const portraits = useMemo(
    () =>
      retratosDaCena(guardados, liveScene?.items ?? [], personagens ?? [], fontes),
    [guardados, liveScene?.items, personagens, fontes],
  );

  const spotlight = useSpotlightStore((state) => state.spotlight);
  const rolagens = useRolagensStore((state) => state.bandeja);

  // Depois da montagem, não na criação do store: o HTML pré-renderizado usa os
  // padrões, e ler `localStorage` antes disso divergiria na hidratação. Vale
  // para os painéis, para onde cada nota de ponto foi deixada, e para o canto
  // onde a bolinha dos dados ficou.
  useEffect(() => {
    restorePanels();
    restorePinNotes();
    restoreWindows();
    restoreLayout();
    restoreSaquinho();
    restoreHandout();
    restoreLeitor();
  }, [
    restorePanels,
    restorePinNotes,
    restoreWindows,
    restoreLayout,
    restoreSaquinho,
    restoreHandout,
    restoreLeitor,
  ]);

  // Publica a cena NO AR, não a que está sendo editada — é o que permite
  // montar a próxima cena sem a mesa ver o rascunho.
  //
  // A cena entra aqui inteira, com os pontos de anotação; quem os remove é o
  // próprio `usePublisher`, e não este chamador. Ver `sceneForTable`.
  //
  // O volume viaja FORA da faixa: é da sessão, e trocar de música não mexe
  // nele.
  // As rolagens dos jogadores entram no quadro publicado, e é a única coisa
  // dele que não nasceu nesta janela: ela chega do daemon, pelo fluxo que
  // `useRolagensDaMesa` escuta, e sai daqui com o personagem já resolvido. O
  // Mestre continua sendo quem publica -- aqui ele é mensageiro.
  usePublisher({
    scene: liveScene,
    track,
    ambientes,
    disparos,
    volume: trackVolume,
    volumeTrilha,
    volumeAmbiente,
    volumeDisparo,
    portraits,
    spotlight,
    rolagens,
  });

  // As uniões arrumam o elenco da cena EM EDIÇÃO, que é a que o mestre vê no
  // palco.
  // A publicação acima usa a que está no ar. Ver `useUnioesDeRetratos`.
  useUnioesDeRetratos(editingScene);

  // Passagem única: marca o dono dos arquivos que entraram antes de o escopo
  // existir, senão eles ficariam na biblioteca para sempre.
  useEscopoDosAssets(status === "ready");

  // O outro sentido do fluxo: o que os celulares jogam na mesa. Só esta janela
  // escuta -- a rota é de loopback. Ver `useRolagensDaMesa`.
  useRolagensDaMesa();
  // E a janela que as mostra, que aparece sozinha quando alguém rola: o dado
  // chega do outro lado da mesa, e ninguém desta bancada pediu por ele. Ver
  // `useJanelaDeRolagens`.
  useJanelaDeRolagens();
  useMestreShortcuts();
  useSpacePan();

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Ctrl+K. Vive aqui, e não em `mestre.tsx`, porque lista cenas, livros e
          acervo: só existe com a campanha aberta. */}
      <PaletaDeComandos />
      {/* `flex-wrap`: abaixo de ~1000px a barra quebra em duas linhas em vez
          de comprimir os controles ou vazar para fora da tela. Duas linhas em
          janela estreita é honesto; controle inalcançável não é. */}
      {/* O que sobrou aqui é o que pertence à SESSÃO: o que está no ar, o som,
          e quem alcança a mesa. Saíram os controles de gesto — ferramentas e
          zoom foram para o canto do palco, onde a mão já está —, os dois
          toggles de painel, que agora moram nos próprios painéis, e desfazer e
          refazer, que são Ctrl+Z e Ctrl+Y e não precisavam de alvo na tela.
          Jogadores saiu junto: virou pílula com contador no canto do palco.
          A campanha subiu para a barra da janela. */}
      <header className="flex flex-wrap items-center gap-2 gap-y-1 border-b px-3 py-2 select-none">
        <OnAirControl editing={editingScene} />

        {/* As duas juntas, na mesma ponta: são a mesma pergunta — como as
            outras telas entram na mesa. Uma dá o QR para o celular e para a TV
            de outro aparelho; a outra abre a TV aqui. Quem JÁ entrou é outra
            coisa, e mora no canto do palco — ver `PlayersChip`. */}
        <div className="ml-auto flex items-center gap-2">
          <TableInvite />
          <AbrirEspectador />
        </div>
      </header>

      {/* `relative` porque é este retângulo que as janelas internas medem: elas
          vão POR CIMA dos painéis, e a posição delas é relativa a ele. Antes a
          camada morava dentro do palco, e o painel de imagens cortava a janela
          no meio — arrastar a ficha para a direita a levava para debaixo da
          biblioteca em vez de sobre ela.

          A linha, e não a raiz do shell: a barra de cima é o que está NO AR e
          quem alcança a mesa, e a de baixo é o que está tocando. Uma janela
          cobrindo qualquer das duas esconderia controle de sessão atrás de
          consulta de ficha. */}
      <div className="relative flex min-h-0 min-w-0 flex-1">
        <DockRow>
          <main className="relative flex min-w-0 flex-1 flex-col bg-neutral-950 p-4">
            {/* Painel fechado deixa um alvo flutuando no canto de cima do palco,
                do lado dele. É o caminho de volta: sem isso, fechar um painel o
                deixaria inalcançável. */}
            {/* Canto de cima à esquerda: o caminho de volta do painel fechado, e
                o índice de pontos.

                Os dois são a mesma coisa — alcançar o que está fora da vista:
                um devolve o painel recolhido, o outro leva a um ponto de
                anotação que pode estar fora do enquadramento. E nenhum é gesto
                sobre o mapa, que é o que mora embaixo.

                Na mesma fila e não em blocos separados porque eles se
                sobreporiam: este bloco fica na folga do `main`, e o palco
                começa 16 pixels adentro. */}
            <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
              {leftOpen ? null : (
                <FloatingPanelToggle
                  onToggle={toggleLeft}
                  // "o painel esquerdo", e não "Cenas e áreas": o que mora na
                  // coluna agora é escolha do mestre, e o rótulo mentiria no
                  // dia em que ele arrastasse Cenas para o outro lado.
                  label="o painel esquerdo"
                  icon={<PanelLeftOpen />}
                />
              )}

              {/* Quadro não tem ponto de anotação: o índice deles some com ele. */}
              {editingScene && !lendoNota && !ehQuadro(editingScene) ? (
                <PinIndex scene={editingScene} />
              ) : null}
            </div>

            {/* Quem está na mesa fica aqui, e não no cabeçalho: é consulta, como
                o índice de pontos, e a contagem só serve se estiver à vista o
                tempo todo. Fora do `StageBoundary`: uma mesa cheia continua
                cheia sem cena nenhuma selecionada. */}
            <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
              {/* Só jogadores. Personagens tinha uma pílula ao lado desta, e ela
                  saiu quando a lista virou aba padrão da bancada: um atalho no
                  canto do palco para uma tela que já está à vista é um segundo
                  caminho para o mesmo lugar, e o contador dela repetia o que a
                  própria lista mostra.

                  Jogadores fica: quem entrou pelo Jogador não tem aba nenhuma,
                  e a contagem é o que responde "quantos entraram?" sem abrir
                  nada. O chip sai sem moldura; a moldura é esta. */}
              {/* Rolagens não tem mais chip aqui: a janela abre sozinha quando
                  chega dado (ver `useJanelaDeRolagens`) e vive no catálogo do
                  dock. Um botão para o que já se abre era mobília. */}
              {lendoNota ? null : (
                <div className="bg-background/85 pointer-events-auto flex items-center gap-0.5 rounded-lg border p-1 backdrop-blur">
                  <PlayersChip />
                </div>
              )}
              {rightOpen ? null : (
                <FloatingPanelToggle
                  onToggle={toggleRight}
                  label="o painel direito"
                  icon={<PanelRightOpen />}
                />
              )}
            </div>

            {status === "error" ? (
              <p className="text-destructive m-auto max-w-sm text-center text-sm">
                {error}
              </p>
            ) : (
              <StageBoundary scene={editingScene} status={status} />
            )}
          </main>
        </DockRow>

        {/* Por último na marcação: as janelas ficam acima de tudo o que está
            nesta linha, e deixar a ordem do DOM concordar com a ordem visual é
            o que mantém a navegação por Tab indo do mapa e dos painéis para a
            janela, e não o contrário. */}
        <WindowLayer />
      </div>

      {/* A linha de baixo: o que está tocando, com onde está e quanto falta.
          Só aparece quando há trilha escolhida. */}
      <TrackBar />

      {/* A trilha é da sessão, não da cena: trocar de cena não corta a
          música. */}
      <SessionAudio
        track={track}
        ambientes={ambientes}
        disparos={disparos}
        volume={trackVolume}
        volumeTrilha={volumeTrilha}
        volumeAmbiente={volumeAmbiente}
        volumeDisparo={volumeDisparo}
      />
    </div>
  );
}

/**
 * O alvo que devolve um painel fechado.
 *
 * Flutua sobre o canto de cima do palco, do lado do painel que ele reabre —
 * quem o posiciona é o grupo que o envolve.
 * Substituiu os dois botões que viviam nas pontas do cabeçalho: eles ficavam
 * longe do que controlavam, e eram dois dos itens que faziam a barra parecer
 * cheia.
 */
function FloatingPanelToggle({
  onToggle,
  label,
  icon,
}: {
  onToggle: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="secondary"
            size="icon-sm"
            // Sem sombra e semitransparente: ele fica sobre a cena, e um
            // botão opaco ali competiria com o mapa.
            className="bg-background/85 backdrop-blur"
            aria-label={`Mostrar ${label}`}
            onClick={onToggle}
          >
            {icon}
          </Button>
        }
      />
      <TooltipContent>
        <p>Mostrar {label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * O menu de contexto só existe quando há cena — sem ela não há ação nenhuma
 * para oferecer, e o `ContextMenuTrigger` ficaria envolvendo um aviso.
 */
function StageBoundary({
  scene,
  status,
}: {
  scene: Scene | null;
  status: string;
}) {
  const viewport = useViewportStore((state) => state.viewport);
  const setViewport = useViewportStore((state) => state.setViewport);
  const setConteudo = useViewportStore((state) => state.setConteudo);
  const definirMesaDeDados = useDadosStore((state) => state.definirMesa);
  // A mesma resposta que o `MestreStage` usa para soltar os itens.
  const panMode = usePanMode();

  const notaAbertaId = useArquivoAbertoStore((state) => state.notaId);
  const notaAberta = useSceneStore((state) =>
    notaAbertaId
      ? (state.board?.notas?.find((nota) => nota.id === notaAbertaId) ?? null)
      : null,
  );

  // Recalculado a cada versão da cena, o que durante um arrasto é a cada
  // quadro. Medido numa cena de 80 itens e 12 mil pontos de risco: 0,4% de um
  // quadro de 60fps. O que precisava de cuidado não era a conta, era propagar
  // um valor novo por quadro -- e disso cuida o `setConteudo`, que devolve o
  // estado intocado quando a caixa não mudou.
  const conteudo = useMemo(
    () => (scene ? limitesDoConteudo(scene) : PLANO),
    [scene],
  );

  /**
   * Qual mesa de dados está na tela: a do mapa, ou a do quadro.
   *
   * Aqui e não na camada que desenha, porque quem sabe o que está no palco é
   * esta: o saquinho pergunta a mesma coisa para contar o que há para recolher
   * e para listar as últimas rolagens, e ele vive FORA do palco.
   *
   * Sem cena a mesa fica como estava: o palco vazio é passagem -- fechar uma
   * nota, trocar de campanha --, e recolher os dados nesse intervalo seria
   * perder a jogada que está em cima do mapa. Ver `Mesa`.
   */
  useEffect(() => {
    if (scene) definirMesaDeDados(ehQuadro(scene) ? "quadro" : "mapa");
  }, [scene, definirMesaDeDados]);

  // No efeito e não no render: `setConteudo` escreve num store que outros
  // componentes leem, e escrever durante o render de um deles é o que o React
  // proíbe.
  useEffect(() => {
    setConteudo(conteudo);
  }, [conteudo, setConteudo]);

  const stage = (
    // Com espaço segurado, o arrasto de botão esquerdo passa a deslocar a cena
    // — o mesmo caminho que o botão do meio já usava.
    <SceneStage
      viewport={viewport}
      onViewportChange={setViewport}
      panOnDrag={panMode}
      plano={scene && ehQuadro(scene) ? "quadro" : "mapa"}
      limites={conteudo}
    >
      {scene ? <MestreStage scene={scene} /> : null}
    </SceneStage>
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Nota aberta ocupa o lugar do palco, como o Obsidian abre um arquivo
          no painel principal. O palco continua montado por baixo? Não: uma
          nota por vez, e o palco volta ao abrir uma cena. Ver
          `useArquivoAbertoStore`. */}
      {notaAberta ? (
        <NotaEditor key={notaAberta.id} nota={notaAberta} />
      ) : scene ? (
        <StageContextMenu scene={scene}>{stage}</StageContextMenu>
      ) : (
        /* Sem cena, o palco NÃO é montado: o vazio ocupa o lugar dele.

           O `SceneStage` vazio desenhava a grade de bolinhas e respondia à
           roda e ao espaço -- zoom e arrasto de um plano sem nada em cima, e
           o aviso flutuando por cima dele ficava parado enquanto o fundo se
           mexia. Nada dependia do palco montado aqui: o menu de contexto e o
           arquivo solto do sistema já exigiam cena. O aviso em pixel de tela,
           fora de qualquer plano escalado, continua a valer -- ver a §3 da
           `debug-do-palco`, que é o motivo de ele nunca ter sido filho do
           palco. */
        <PalcoVazio carregando={status !== "ready"} />
      )}

      {/* Fora do gatilho do menu de contexto, e independente de haver cena: uma
          imagem transmitida continua no ar mesmo sem cena nenhuma no palco, e é
          justamente aí que esquecê-la é mais fácil. */}
      <SpotlightChip />

      {/* Fora do gatilho do menu de contexto: botão direito sobre os controles
          não deve abrir o menu da cena.

          As ferramentas à esquerda e o zoom à direita, um canto para cada
          grupo. Estavam juntas à esquerda, e o lápis com a borracha levaram a
          fila a seis alvos: com o zoom emendado, a barra atravessava metade do
          palco e as duas pontas dela não tinham relação nenhuma. */}
      {/* Com uma nota aberta o palco não está na tela, e ferramenta de palco
          sobre um editor de texto seria botão para o nada. */}
      {scene && !notaAberta ? (
        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <MestreToolbar scene={scene} />
        </div>
      ) : null}

      {/* A régua de desenho, encostada na borda esquerda e no meio da altura.

          À vista, e não numa bolsa do rodapé: desenhar é trocar de ferramenta a
          cada gesto, e a bolsa cobrava dois cliques por troca. À esquerda
          porque é a borda que todo editor de desenho usa para isto, porque fica
          longe do zoom e das câmeras da direita, e porque deixa o rodapé
          inteiro para o que é do PALCO -- selecionar, deslocar, riscar.

          Nos DOIS tipos de cena: o que muda é o que ela carrega. Ver
          `ReguaDeDesenho`. */}
      {scene && !notaAberta ? (
        <div className="absolute top-1/2 left-3 -translate-y-1/2">
          <ReguaDeDesenho scene={scene} />
        </div>
      ) : null}

      {scene && !notaAberta ? (
        <div className="absolute right-3 bottom-3 flex items-center gap-2">
          {/* Os chips de câmera só no MAPA: o quadro vai inteiro para a mesa,
              e enquadrar um pedaço dele é o contrário do que ele serve para
              fazer. Os controles de zoom ficam nos dois -- eles são do palco
              do mestre, e não da mesa. Ver `lerCena` em `camera-actions`. */}
          {ehQuadro(scene) ? null : <CamerasSalvas scene={scene} />}
          <ViewportControls />
        </div>
      ) : null}

      {/* Flutuante, sem canto fixo: os quatro já têm dono, e o mestre leva a
          bolinha para o vazio do mapa dele. Ver `SaquinhoDados`.

          Só com cena: o dado cai SOBRE o mapa, e sem mapa a jogada não teria
          onde pousar -- a camada que a desenha vive dentro do palco. */}
      {scene && !notaAberta ? <SaquinhoDados /> : null}

      {/* A carta na manga, irmã do saquinho: mesma bolinha, e por cena.

          Só em MAPA. O handout é o que o mestre separou para MOSTRAR à mesa --
          a carta do vilão, o retrato da testemunha --, e o quadro é a mesa de
          trabalho dele: lá a imagem que ele quer à mão já entra como cartão ou
          como token, à vista, e a bolinha só somava um alvo permanente sobre a
          folha que ele está montando. */}
      {scene && !notaAberta && !ehQuadro(scene) ? (
        <HandoutMestre scene={scene} />
      ) : null}
    </div>
  );
}

/**
 * Os atalhos que valem antes de haver cena.
 *
 * Cinco, e não a tabela inteira: a lista completa mora em Configurações >
 * Teclado, e o palco vazio não é lugar de estudar teclado -- é o primeiro
 * quadro depois de abrir a campanha, e o que ele deve ensinar é como sair
 * dele. Por isso a paleta vem primeiro: é o caminho para todo o resto.
 *
 * Escritos aqui e não lidos de `ATALHOS_BASE`: a tabela é ordenada por
 * PRECEDÊNCIA de captura, não por importância, e filtrar cinco dela por
 * `tecla` seria uma lista que se desfaz no dia em que alguém remapear uma. O
 * preço é lembrar deste arquivo ao trocar uma tecla -- e é por isso que os
 * rótulos são os mesmos da tabela.
 */
const ATALHOS_DO_VAZIO = [
  { tecla: "Ctrl+K", rotulo: "Abrir a paleta de comandos" },
  { tecla: "Espaço + arrastar", rotulo: "Mover o palco" },
  { tecla: "Ctrl+0", rotulo: "Enquadrar o mapa" },
  { tecla: "= / -", rotulo: "Aproximar e afastar a câmera" },
  { tecla: "T", rotulo: "Transmitir a câmera selecionada" },
] as const;

/**
 * O lugar do palco enquanto não há cena aberta.
 *
 * Era uma frase solta no meio de um retângulo preto. A marca em cima dá um
 * centro à tela vazia, e os atalhos embaixo transformam a espera em leitura
 * útil: quem acabou de abrir a campanha ainda não sabe que existe paleta.
 *
 * Fundo preto liso, sem grade nem câmera: é uma tela de espera, e não um
 * mapa sem conteúdo. `bg-black` e não o fundo do tema, o mesmo que o palco de
 * mapa usa, para a troca por uma cena não piscar de cor.
 *
 * Enquanto carrega, só a marca e "Carregando...": os atalhos ainda não valem --
 * não há mesa onde usá-los -- e uma lista que aparece por meio segundo e é
 * substituída pisca.
 */
function PalcoVazio({ carregando }: { carregando: boolean }) {
  return (
    <div className="text-muted-foreground flex min-h-0 flex-1 flex-col items-center justify-center gap-6 bg-black p-6 select-none">
      <div className="flex flex-col items-center gap-3">
        <Image
          src={logo}
          alt=""
          aria-hidden
          className="h-12 w-auto opacity-40"
        />
        <p className="text-base">
          {carregando
            ? "Carregando\u2026"
            : "Abra um mapa ou um arquivo para visualizar aqui"}
        </p>
      </div>

      {carregando ? null : (
        <ul className="flex flex-col gap-1.5">
          {ATALHOS_DO_VAZIO.map((atalho) => (
            <li
              key={atalho.tecla}
              className="flex items-center justify-between gap-6 text-xs"
            >
              <span className="min-w-0">{atalho.rotulo}</span>
              <Kbd>{atalho.tecla}</Kbd>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
