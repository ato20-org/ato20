"use client";

import {
  memo,
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Columns2,
  CopyPlus,
  FilePlus,
  FileText,
  FolderPlus,
  Import,
  Presentation,
  Radio,
  TextCursorInput,
  Trash2,
} from "lucide-react";

import {
  CampoDeNome,
  FimDaLista,
  ItensDeMover,
  LIMIAR_ARRASTO_PX,
  PastaRow,
  PREFIXO_PASTA,
  RECUO_PX,
  TresPontos,
} from "@/components/mestre/arvore-de-pastas";
import { CampoDeBusca } from "@/components/mestre/campo-de-busca";
import { ConfirmarRemocao } from "@/components/mestre/confirmar-remocao";
import {
  BotaoDeImportar,
  ICONE_DA_ORIGEM,
  ORIGENS,
  useImportarDeFora,
  useRotuloDoArrasto,
} from "@/components/mestre/importar-de-fora";
import { KIT_CONTEXTO, type Kit } from "@/components/ui/menu-kit";
import { ItensDeExtensao } from "@/components/mestre/itens-de-extensao";
import { PainelVazio } from "@/components/mestre/painel-vazio";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useArrastoDeArquivo } from "@/hooks/use-arrasto-de-arquivo";
import { useListReorder } from "@/hooks/use-list-reorder";
import {
  aoApertarF2,
  useRenomearPeloMenu,
} from "@/hooks/use-renomear-pelo-menu";
import { useTokenDrag } from "@/hooks/use-token-drag";
import { achatarArvore, pastasDaLista } from "@/lib/mestre/arvore-de-pastas";
import { buscarArquivos, type Trecho } from "@/lib/mestre/busca-de-arquivos";
import { useArquivoAbertoStore } from "@/lib/store/use-arquivo-aberto-store";
import { usePaineisStore } from "@/lib/store/use-paineis-store";
import { zonaDeSplitSob } from "@/components/mestre/paineis/zona-de-split";
import type { ForaDaLista } from "@/hooks/use-list-reorder";
import {
  abrirNota as abrirNotaOndeEstiver,
  abrirNotaAoLado,
  fecharNotaEmTodaParte,
} from "@/lib/mestre/abrir-nota";
import { useDocumentoStore } from "@/lib/store/use-documento-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useTokenDragStore } from "@/lib/store/use-token-drag-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import { t } from "@/lib/i18n/arquivos";
import { cn } from "@/lib/utils";
import {
  apagarDocumento,
  criarDocumento,
  medirDocumentos,
  type MedidaDeDocumento,
} from "@/lib/vault/documentos";
import {
  DOCUMENTO_ALTURA,
  DOCUMENTO_LARGURA,
  ehQuadro,
  type Nota,
  type Pasta,
  type Scene,
} from "@/types/scene";

/** A marca do painel que aceita o arquivo do sistema. Ver `useArrastoDeArquivo`. */
const ZONA_DE_ARQUIVOS = "[data-arquivos-solto]";

/**
 * A aba Arquivos: quadros e notas na mesma árvore de pastas, como o painel de
 * arquivos do Obsidian.
 *
 * Separada da lista de Cenas de propósito. Cena é fila de sessão -- miniatura,
 * contagem, botão de pôr no ar à vista -- porque o mestre a escolhe olhando.
 * Arquivo é nome numa árvore: ícone, título, e o resto no BOTÃO DIREITO. É a
 * convenção de todo gerenciador de arquivos, e é a que o mestre já tem no
 * dedo. Cada linha tem também os três pontos, que só aparecem no hover: são o
 * MESMO menu do botão direito, para quem não sabe (ou não pode) clicar com o
 * direito. Um só conjunto de itens, desenhado pelos dois `Kit`s. O vazio também
 * tem menu.
 *
 * Quem sabe dos dados é o `useSceneStore`: quadro é `Scene`, nota é
 * `board.notas`, pasta é `board.pastas`. Aqui é só a árvore.
 */
export function ArquivosList({ ready }: { ready: boolean }) {
  const scenes = useSceneStore((state) => state.board?.scenes);
  const todasAsPastas = useSceneStore((state) => state.board?.pastas);
  // Só as do Arquivos: Mapas, Fundos e Personagens têm as deles no mesmo
  // `board.pastas`. Ver `ListaDePastas`.
  const pastas = useMemo(
    () => pastasDaLista(todasAsPastas, undefined),
    [todasAsPastas],
  );
  const notas = useSceneStore((state) => state.board?.notas);
  const editingSceneId = useSceneStore((state) => state.board?.editingSceneId);
  const liveSceneId = useSceneStore((state) => state.board?.liveSceneId);
  const notaAbertaId = useArquivoAbertoStore((state) => state.notaId);
  // As notas divididas ao lado do mapa também contam como abertas. Um
  // conjunto, e não uma pergunta por linha: a lista tem uma linha por nota.
  const ordemDosPaineis = usePaineisStore((state) => state.ordem);
  const notasAoLado = useMemo(
    () =>
      new Set(
        ordemDosPaineis.flatMap((painel) =>
          painel.tipo === "abas"
            ? painel.abas.flatMap((aba) => (aba.tipo === "nota" ? [aba.notaId] : []))
            : [],
        ),
      ),
    [ordemDosPaineis],
  );
  const medidas = useMedidasDasNotas(ready, notas ?? []);

  const quadros = useMemo(
    () => (scenes ?? []).filter((scene) => ehQuadro(scene)),
    [scenes],
  );
  const linhas = useMemo(
    () => achatar(quadros, pastas, notas ?? []),
    [quadros, pastas, notas],
  );

  const { listRef, dropIndex, startReorder } = useListReorder<string>(
    (arrastado, index) => {
      if (!scenes) return;
      const store = useSceneStore.getState();
      const alvo = linhas[index];
      const pastaDoAlvo = !alvo
        ? undefined
        : alvo.tipo === "pasta"
          ? alvo.pasta.id
          : alvo.tipo === "nota"
            ? alvo.nota.pastaId
            : alvo.scene.pastaId;

      // Pasta arrastada: só muda de mãe. O store recusa ciclo.
      if (arrastado.startsWith(PREFIXO_PASTA)) {
        const pastaId = arrastado.slice(PREFIXO_PASTA.length);
        if (pastaDoAlvo !== pastaId) store.moverPasta(pastaId, pastaDoAlvo);
        return;
      }

      // Quadro: assume a pasta de quem está na linha e o lugar dele; sobre uma
      // pasta ou uma nota, entra e vai para o fim.
      store.moverParaPasta(arrastado, pastaDoAlvo);
      const destino =
        alvo?.tipo === "cena"
          ? scenes.findIndex((scene) => scene.id === alvo.scene.id)
          : scenes.length - 1;
      store.moveSceneToIndex(arrastado, destino);
    },
    // A linha SOB o cursor: soltar em cima da pasta é entrar nela.
    "sobre",
    QUADRO_PARA_O_SPLIT,
  );

  // A árvore é alvo do arrasto de nota também: soltar sobre uma pasta move.
  // Ver `data-pasta-arquivos` em `PastaRow` e `destinoSob`.
  useEffect(
    () =>
      useTokenDragStore.getState().registrarAlvo("arquivos", (solto, destino) => {
        if (solto.fonte.tipo !== "nota" || destino.tipo !== "pasta-arquivos") return;
        useSceneStore.getState().moverNotaParaPasta(solto.fonte.notaId, destino.pastaId);
      }),
    [],
  );

  const criar = useCriar(pastas.length, notas?.length ?? 0);

  /** Os "Novo X aqui" do menu da pasta: o que só o Arquivos cria. */
  const itensDeCriarNa = (pastaId: string) =>
    function itensDeCriar({ Item }: Kit) {
      return (
        <>
          <Item onClick={() => criar.quadro(pastaId)}>
            <Presentation />
            {t.arquivosList.novoQuadroAqui}
          </Item>
          <Item onClick={() => criar.nota(pastaId)}>
            <FilePlus />
            {t.arquivosList.novaNotaAqui}
          </Item>
        </>
      );
    };

  /**
   * A busca: com texto no campo, a árvore dá lugar aos achados. Ver
   * `buscarArquivos` para o que cada tipo acha e por quê.
   */
  const [busca, setBusca] = useState("");
  const importar = useImportarDeFora();
  // O que vem do sistema e cai no painel: pasta, vault ou arquivos, pelo mesmo
  // import do botão. Sempre na raiz, como no acervo: o arrasto do sistema não
  // tem retorno visual fino o bastante para mirar uma pasta da árvore.
  const noAr = useArrastoDeArquivo(ZONA_DE_ARQUIVOS, (caminhos) => {
    if (ready) importar.soltar(caminhos);
  });
  const vem = useRotuloDoArrasto(noAr?.caminhos);
  const buscando = busca.trim() !== "";

  // O texto das notas entra na PRIMEIRA tecla, e não antes: só a nota aberta e
  // as que estão em cartão ficam na memória, e ler todas ao montar o painel
  // seria ler a campanha inteira para uma busca que talvez nunca venha. Lido,
  // fica -- é o mesmo store dos cartões, e a próxima busca não pede de novo.
  const carregar = useDocumentoStore((state) => state.carregar);
  useEffect(() => {
    if (!buscando) return;
    for (const nota of notas ?? []) carregar(nota.arquivo);
  }, [buscando, notas, carregar]);

  // Os textos SÓ durante a busca: fora dela o painel não pode redesenhar a
  // cada tecla do editor -- ver o comentário em `NotaRow`.
  const textos = useDocumentoStore((state) => (buscando ? state.textos : null));
  const lendoNotas = useDocumentoStore(
    (state) => buscando && Object.keys(state.lendo).length > 0,
  );
  const achados = useMemo(
    () =>
      buscando
        ? buscarArquivos(
            { quadros, pastas, notas: notas ?? [], textos: textos ?? {} },
            busca,
          )
        : null,
    [buscando, busca, quadros, pastas, notas, textos],
  );

  return (
    <div
      data-arquivos-solto
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        // Por dentro, como o do acervo: o painel atracado encosta na borda da
        // coluna, e um anel por fora sairia cortado.
        noAr && "ring-primary/60 bg-primary/5 ring-2 ring-inset",
      )}
    >
      {/* Três botões iguais: criar é criar, seja o que for. O que cada um cria
          está no ícone e na dica; o título da aba já diz "Arquivos".

          Redondos e encostados à direita, e não três barras dividindo a
          largura: esticados, cada um virava um retângulo grande com um ícone
          perdido no meio, e os três juntos pesavam mais que a árvore que eles
          servem. Mesmo arranjo da Biblioteca e de Personagens. */}
      <div className="flex items-center justify-end gap-2 p-2">
        {/* A busca DIVIDE a linha com os botões, como em Sons e Personagens: é
            o que se faz no cabeçalho de uma lista, e empilhar gastaria uma
            linha inteira de altura. Sempre, e não só com a lista cheia: um
            campo que aparece e some conforme a campanha cresce é um campo com
            que o mestre não conta -- a decisão da busca de Personagens. */}
        <CampoDeBusca
          valor={busca}
          onMudar={setBusca}
          placeholder={t.arquivosList.buscarPlaceholder}
          rotulo={t.arquivosList.buscarRotulo}
          dica={t.arquivosList.buscarDica}
        />
        <BotaoDeCriar
          rotulo={t.arquivosList.novoQuadro}
          dica={t.arquivosList.novoQuadroDica}
          disabled={!ready}
          onClick={() => criar.quadro()}
        >
          <Presentation />
        </BotaoDeCriar>
        <BotaoDeCriar
          rotulo={t.arquivosList.novaNota}
          dica={t.arquivosList.novaNotaDica}
          disabled={!ready}
          onClick={() => criar.nota()}
        >
          <FilePlus />
        </BotaoDeCriar>
        <BotaoDeCriar
          rotulo={t.geral.novaPasta}
          dica={t.arquivosList.novaPastaDica}
          disabled={!ready}
          onClick={() => criar.pasta()}
        >
          <FolderPlus />
        </BotaoDeCriar>
        {/* Junto dos de criar: importar é o outro jeito de encher esta lista.
            Um botão só, com as origens no menu. Ver `useImportarDeFora`. */}
        <BotaoDeImportar disabled={!ready} onEscolher={importar.iniciar} />
      </div>

      {/* O que está vindo, antes de soltar: a borda acesa diz que o painel
          aceita; esta linha diz o quê. */}
      {noAr && vem ? (
        <p className="border-primary/60 bg-primary/10 mx-2 mb-2 flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1 text-[11px]">
          <Import className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{vem}</span>
        </p>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        {/* O fundo da lista, e SÓ ele, é o gatilho do menu do vazio. Envolver
            as linhas faria os menus delas disputarem o mesmo botão direito. */}
        <div className="relative min-h-full">
          <ContextMenu>
            <ContextMenuTrigger render={<div className="absolute inset-0" aria-hidden />} />
            <ContextMenuContent className="w-60">
              <ContextMenuItem onClick={() => criar.quadro()}>
                <Presentation />
                {t.arquivosList.novoQuadro}
              </ContextMenuItem>
              <ContextMenuItem onClick={() => criar.nota()}>
                <FilePlus />
                {t.arquivosList.novaNota}
              </ContextMenuItem>
              <ContextMenuItem onClick={() => criar.pasta()}>
                <FolderPlus />
                {t.geral.novaPasta}
              </ContextMenuItem>
              <ContextMenuSeparator />
              {ORIGENS.map((origem) => {
                const Icone = ICONE_DA_ORIGEM[origem];
                return (
                  <ContextMenuItem key={origem} onClick={() => importar.iniciar(origem)}>
                    <Icone />
                    {t.importarDeFora.botao}: {t.importarDeFora[origem].toLowerCase()}
                  </ContextMenuItem>
                );
              })}
            </ContextMenuContent>
          </ContextMenu>

          {/* `pointer-events-none`: o aviso cobre a area toda, e o gatilho do
              menu do vazio esta DEBAIXO dele -- sem isto, o botao direito no
              meio do painel vazio nao abriria mais "Novo quadro / Nova nota /
              Nova pasta", que e justamente o que se quer ali. */}
          {ready && linhas.length === 0 && !buscando ? (
            <PainelVazio conteudo={{ tipo: "quadros" }} className="pointer-events-none absolute inset-0">
              {t.arquivosList.vazio}
            </PainelVazio>
          ) : null}

          {achados ? (
            <ul className="relative z-10 space-y-0.5 p-2 pt-0">
              {lendoNotas ? (
                <li className="text-muted-foreground px-2 py-1 text-[10px]">
                  {t.arquivosList.lendoNotas}
                </li>
              ) : null}
              {achados.length === 0 && !lendoNotas ? (
                <li className="text-muted-foreground px-2 py-2 text-xs">
                  {t.geral.nadaCom(busca.trim())}
                </li>
              ) : null}
              {/* Sem reordenar enquanto busca: soltar numa lista filtrada
                  deixaria o lugar ambíguo -- "depois deste" na lista de
                  achados não é um lugar da árvore. Arrastar a nota para o
                  quadro continua valendo, que é o gesto de achar e usar. */}
              {achados.map((achado) =>
                achado.tipo === "pasta" ? (
                  <PastaRow
                    key={achado.pasta.id}
                    pasta={achado.pasta}
                    pastas={pastas}
                    depth={achado.depth}
                    total={achado.total}
                    dropTarget={false}
                    aberta
                    itensDeCriar={itensDeCriarNa(achado.pasta.id)}
                    alvo={ALVO_DE_NOTA}
                  />
                ) : achado.tipo === "nota" ? (
                  <NotaRow
                    key={achado.nota.id}
                    nota={achado.nota}
                    pastas={pastas}
                    depth={achado.depth}
                    aberta={
                      achado.nota.id === notaAbertaId || notasAoLado.has(achado.nota.id)
                    }
                    medida={medidas.get(achado.nota.arquivo)}
                    trecho={achado.trecho}
                  />
                ) : (
                  <QuadroRow
                    key={achado.scene.id}
                    scene={achado.scene}
                    pastas={pastas}
                    depth={achado.depth}
                    aberto={achado.scene.id === editingSceneId && !notaAbertaId}
                    noAr={achado.scene.id === liveSceneId}
                    dropTarget={false}
                    onReorderStart={SEM_REORDENAR}
                    trecho={achado.trecho}
                  />
                ),
              )}
            </ul>
          ) : (
            <ul ref={listRef} className="relative z-10 space-y-0.5 p-2 pt-0">
              {linhas.map((linha, index) =>
                linha.tipo === "pasta" ? (
                  <PastaRow
                    key={linha.pasta.id}
                    pasta={linha.pasta}
                    pastas={pastas}
                    depth={linha.depth}
                    total={linha.total}
                    dropTarget={dropIndex === index}
                    onReorderStart={startReorder}
                    itensDeCriar={itensDeCriarNa(linha.pasta.id)}
                    alvo={ALVO_DE_NOTA}
                  />
                ) : linha.tipo === "nota" ? (
                  <NotaRow
                    key={linha.nota.id}
                    nota={linha.nota}
                    pastas={pastas}
                    depth={linha.depth}
                    aberta={
                      linha.nota.id === notaAbertaId || notasAoLado.has(linha.nota.id)
                    }
                    medida={medidas.get(linha.nota.arquivo)}
                  />
                ) : (
                  <QuadroRow
                    key={linha.scene.id}
                    scene={linha.scene}
                    pastas={pastas}
                    depth={linha.depth}
                    aberto={linha.scene.id === editingSceneId && !notaAbertaId}
                    noAr={linha.scene.id === liveSceneId}
                    dropTarget={dropIndex === index}
                    onReorderStart={(event) =>
                      startReorder(event, linha.scene.id, LIMIAR_ARRASTO_PX)
                    }
                  />
                ),
              )}
            </ul>
          )}

          {/* O vazio abaixo da lista é alvo: soltar aqui tira da pasta. */}
          <FimDaLista ativo={dropIndex === linhas.length} />
        </div>
      </ScrollArea>

      {importar.dialogo}
    </div>
  );
}

function BotaoDeCriar({
  rotulo,
  dica,
  disabled,
  onClick,
  children,
}: {
  rotulo: string;
  dica: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            className="shrink-0 rounded-full"
            variant="outline"
            size="icon"
            aria-label={rotulo}
            disabled={disabled}
            onClick={onClick}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>
        <p className="font-medium">{rotulo}</p>
        <p className="text-muted-foreground max-w-48">{dica}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Criar quadro, nota e pasta, do botão de cima e do menu do vazio e da pasta.
 * A pasta de destino vem de quem chamou: do menu de uma pasta, nasce dentro
 * dela; do botão ou do vazio, na raiz.
 */
function useCriar(totalDePastas: number, totalDeNotas: number) {
  const addScene = useSceneStore((state) => state.addScene);
  const setEditingSceneId = useSceneStore((state) => state.setEditingSceneId);
  const clearSelection = useSelectionStore((state) => state.clear);
  const fitViewport = useViewportStore((state) => state.fit);
  const abrirNota = useArquivoAbertoStore((state) => state.abrirNota);
  const fecharNota = useArquivoAbertoStore((state) => state.fechar);

  return {
    quadro(pastaId?: string) {
      const id = addScene(undefined, "quadro");
      if (pastaId) useSceneStore.getState().moverParaPasta(id, pastaId);
      fecharNota();
      setEditingSceneId(id);
      clearSelection();
      fitViewport();
    },
    nota(pastaId?: string) {
      const titulo = t.nomesPadrao.nota(totalDeNotas + 1);
      void criarDocumento(titulo)
        .then((arquivo) => {
          const id = useSceneStore.getState().addNota({ titulo, arquivo, pastaId });
          // Escrever é o gesto seguinte: abre já no editor.
          abrirNota(id);
        })
        .catch((cause: unknown) => {
          console.error("falha ao criar a nota", cause);
        });
    },
    pasta(parentId?: string) {
      const store = useSceneStore.getState();
      if (parentId) store.atualizarPasta(parentId, { recolhido: false });
      store.criarPasta(t.nomesPadrao.pasta(totalDePastas + 1), parentId);
    },
  };
}

// --- medidas ----------------------------------------------------------------

/**
 * As medidas de cada nota, por nome de arquivo.
 *
 * Uma chamada ao Rust, não uma leitura por linha: ver `medirDocumentos`. Mede
 * de novo quando a lista de arquivos muda -- nota criada, nota apagada -- e
 * quando o editor grava, que é o carimbo `atualizadoEm` tocado por
 * `tocarDocumentos`. A nota ABERTA não espera por isso: `NotaRow` conta o
 * texto que já está na memória a cada tecla.
 */
function useMedidasDasNotas(ready: boolean, notas: Nota[]) {
  const [medidas, setMedidas] = useState<Map<string, MedidaDeDocumento>>(new Map());
  const chave = notas
    .map((nota) => nota.arquivo)
    .sort()
    .join("\u0000");

  useEffect(() => {
    // Sem campanha ou sem nota nenhuma não há o que medir, e o mapa antigo
    // não incomoda: quem o consulta é uma linha de nota, e não há nenhuma.
    if (!ready || chave === "") return;
    let vivo = true;
    void medirDocumentos()
      .then((lista) => {
        if (vivo) setMedidas(new Map(lista.map((medida) => [medida.arquivo, medida])));
      })
      .catch((cause: unknown) => {
        console.error("falha ao medir os documentos", cause);
      });
    return () => {
      vivo = false;
    };
  }, [ready, chave]);

  return medidas;
}

/**
 * As mesmas três contas do Rust, feitas no texto que está na tela. Existe para
 * a nota aberta: enquanto o mestre escreve, o que vale é o que ele digitou, e
 * esperar a gravação deixaria os números um passo atrás. Tem de bater com
 * `documentos::medir`: bytes em UTF-8, linhas como `str::lines`, palavras
 * separadas por espaço em branco.
 */
function medirTexto(texto: string): Omit<MedidaDeDocumento, "arquivo"> {
  const semUltimaQuebra = texto.endsWith("\n") ? texto.slice(0, -1) : texto;
  return {
    bytes: new TextEncoder().encode(texto).length,
    linhas: semUltimaQuebra === "" ? 0 : semUltimaQuebra.split("\n").length,
    palavras: texto.split(/\s+/).filter(Boolean).length,
  };
}

/**
 * O tamanho em bytes, curto o bastante para caber ao lado do nome. Nota nova
 * tem dezenas de bytes, então abaixo de 1 KB mostra os bytes mesmo -- o
 * `formatBytes` do jogador arredonda tudo para "1 KB" e esconderia a
 * diferença entre a nota vazia e a que já tem um parágrafo.
 */
function tamanhoCurto(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * Quantas coisas há num quadro: imagens, textos, setas, cartões de documento,
 * postits, pontos e medidores. É o número que responde "este quadro tem algo
 * dentro?", e a mesma conta que a lista de camadas mostra.
 */
function elementosDoQuadro(scene: Scene): number {
  return (
    scene.items.length +
    (scene.textos?.length ?? 0) +
    (scene.ligacoes?.length ?? 0) +
    (scene.documentos?.length ?? 0) +
    (scene.postits?.length ?? 0) +
    (scene.pins?.length ?? 0) +
    (scene.medidores?.length ?? 0)
  );
}

/** O peso do quadro: os bytes que ele ocupa no `board.json`. */
function bytesDoQuadro(scene: Scene): number {
  return new TextEncoder().encode(JSON.stringify(scene)).length;
}

/** A linha de números embaixo do nome, cinza e pequena. */
/**
 * Onde a busca achou o termo, com ele em destaque. Toma o lugar das medidas na
 * linha: numa busca, a pergunta é "por que isto apareceu", e não o tamanho.
 */
function TrechoAchado({ trecho }: { trecho: Trecho }) {
  return (
    <span className="text-muted-foreground max-w-full truncate text-[10px]">
      {trecho.antes}
      <mark className="bg-primary/25 text-foreground rounded-sm px-px">{trecho.achado}</mark>
      {trecho.depois}
    </span>
  );
}

/** A busca não reordena. Ver a lista de achados em `ArquivosList`. */
const SEM_REORDENAR = () => undefined;

/**
 * O quadro arrastado para FORA da lista vai para a área de split, ao lado do
 * mapa, só para ver. Pasta não: ela não abre em lugar nenhum.
 *
 * Pelo gesto de reordenar, que já é o do quadro nesta lista -- trocar por
 * outro tiraria o reordenar. Ver `ForaDaLista` e `ZonasDeSplit`.
 */
const QUADRO_PARA_O_SPLIT: ForaDaLista<string> = {
  mover(id, native) {
    if (id.startsWith(PREFIXO_PASTA)) return;

    const paineis = usePaineisStore.getState();
    if (!native) {
      paineis.mirarSplit(null);
      return;
    }

    paineis.pegarParaSplit({ tipo: "quadro", sceneId: id });
    paineis.mirarSplit(zonaDeSplitSob(native.clientX, native.clientY));
  },
  soltar(id, native) {
    if (id.startsWith(PREFIXO_PASTA)) return false;

    const alvo = zonaDeSplitSob(native.clientX, native.clientY);
    if (!alvo) return false;

    usePaineisStore.getState().abrirEm({ tipo: "quadro", sceneId: id }, alvo);
    return true;
  },
  fim() {
    usePaineisStore.getState().largarSplit();
  },
};

/** A pasta do Arquivos é alvo da nota arrastada. Ver `destinoSob`. */
const ALVO_DE_NOTA = { "data-pasta-arquivos": "" };

function Detalhe({ children }: { children: ReactNode }) {
  return (
    <span className="text-muted-foreground truncate text-[10px] tabular-nums">
      {children}
    </span>
  );
}

// --- a árvore ---------------------------------------------------------------

type Linha =
  | { tipo: "pasta"; pasta: Pasta; depth: number; total: number }
  | { tipo: "cena"; scene: Scene; depth: number }
  | { tipo: "nota"; nota: Nota; depth: number };

type ItemDoArquivo = { tipo: "cena"; scene: Scene } | { tipo: "nota"; nota: Nota };

/**
 * A árvore achatada em linhas, na ordem em que aparecem: em cada nível as
 * pastas, depois os quadros na ordem do board, depois as notas por título. A
 * conta da árvore é a de todo painel -- ver `achatarArvore`.
 */
function achatar(quadros: Scene[], pastas: Pasta[], notas: Nota[]): Linha[] {
  const itens: ItemDoArquivo[] = [
    ...quadros.map((scene) => ({ tipo: "cena" as const, scene })),
    ...[...notas]
      .sort((a, b) => a.titulo.localeCompare(b.titulo))
      .map((nota) => ({ tipo: "nota" as const, nota })),
  ];

  return achatarArvore(itens, pastas, (item) =>
    item.tipo === "cena" ? item.scene.pastaId : item.nota.pastaId,
  ).map((linha) =>
    linha.tipo === "pasta" ? linha : { ...linha.item, depth: linha.depth },
  );
}

// --- quadro -----------------------------------------------------------------

function QuadroRow({
  scene,
  pastas,
  depth,
  aberto,
  noAr,
  dropTarget,
  onReorderStart,
  trecho,
}: {
  scene: Scene;
  pastas: Pasta[];
  depth: number;
  aberto: boolean;
  noAr: boolean;
  dropTarget: boolean;
  onReorderStart: (event: ReactPointerEvent) => void;
  /** Onde a busca achou o termo dentro do quadro. No lugar das medidas. */
  trecho?: Trecho;
}) {
  const [renomeando, setRenomeando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const renomear = useRenomearPeloMenu(() => setRenomeando(true));
  const store = () => useSceneStore.getState();
  const elementos = elementosDoQuadro(scene);

  function abrir() {
    useArquivoAbertoStore.getState().fechar();
    store().setEditingSceneId(scene.id);
    // Seleção e zoom são por cena. Ver a lista de Cenas.
    useSelectionStore.getState().clear();
    useViewportStore.getState().fit();
  }

  const itens = (kit: Kit) => {
    const { Item, Separator } = kit;
    return (
      <>
        <Item onClick={abrir}>
          <Presentation />
          {t.geral.abrir}
        </Item>
        {/* Só para ver: editar é no palco, que é um só. Ver `VistaDoQuadro`. */}
        <Item
          onClick={() =>
            usePaineisStore.getState().abrir({ tipo: "quadro", sceneId: scene.id })
          }
        >
          <Columns2 />
          {t.geral.abrirAoLado}
        </Item>
        <Item disabled={noAr} onClick={() => store().setLiveSceneId(scene.id)}>
          <Radio />
          {t.arquivosList.colocarNoAr}
        </Item>
        <Separator />
        <Item onClick={renomear.pedir}>
          <TextCursorInput />
          {t.geral.renomear}
        </Item>
        <Item onClick={() => store().duplicateScene(scene.id)}>
          <CopyPlus />
          {t.arquivosList.duplicar}
        </Item>
        <ItensDeMover
          kit={kit}
          atual={scene.pastaId}
          destinos={pastas}
          onMover={(destino) => store().moverParaPasta(scene.id, destino)}
        />
        <Separator />
        <Item variant="destructive" onClick={() => setConfirmando(true)}>
          <Trash2 />
          {t.arquivosList.removerQuadro}
        </Item>

        <ItensDeExtensao
          alvo="linha.quadro"
          contexto={{ alvo: "linha.quadro", cenaId: scene.id }}
          kit={kit}
        />
      </>
    );
  };

  return (
    <>
    <ContextMenu onOpenChangeComplete={renomear.aoFechar}>
      <ContextMenuTrigger
        render={
          <li
            className={cn(
              "group flex cursor-grab touch-none items-center gap-1 rounded-md p-1",
              aberto ? "bg-accent" : "hover:bg-accent/50",
              dropTarget && "ring-primary ring-1",
            )}
            style={{ paddingLeft: 4 + depth * RECUO_PX }}
            onPointerDown={onReorderStart}
          />
        }
      >
        <Presentation className="text-muted-foreground ml-1 size-3.5 shrink-0" aria-hidden />
        {renomeando ? (
          <CampoDeNome
            valor={scene.name}
            rotulo={t.arquivosList.nomeDoQuadro}
            onConfirmar={(nome) => {
              const limpo = nome.trim();
              if (limpo && limpo !== scene.name) store().renameScene(scene.id, limpo);
              setRenomeando(false);
            }}
            onCancelar={() => setRenomeando(false)}
          />
        ) : (
          <button
            type="button"
            className="flex min-w-0 flex-1 flex-col items-start text-left text-sm"
            aria-current={aberto}
            onClick={abrir}
            onDoubleClick={() => setRenomeando(true)}
            onKeyDown={aoApertarF2(() => setRenomeando(true))}
          >
            <span className="flex max-w-full min-w-0 items-center gap-1">
              <span className="truncate">{scene.name}</span>
              {/* Ponto vermelho: o que a mesa vê, legível de relance. */}
              {noAr ? (
                <span
                  className="ml-1 size-2 shrink-0 rounded-full bg-red-500 shadow-[0_0_6px] shadow-red-500/70"
                  aria-label={t.arquivosList.noAr}
                />
              ) : null}
            </span>
            {trecho ? (
              <TrechoAchado trecho={trecho} />
            ) : (
              <Detalhe>
                {t.arquivosList.contarElementos(elementos)} ·{" "}
                {tamanhoCurto(bytesDoQuadro(scene))}
              </Detalhe>
            )}
          </button>
        )}
        <TresPontos rotulo={scene.name} aoFechar={renomear.aoFechar} itens={itens} />
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52">{itens(KIT_CONTEXTO)}</ContextMenuContent>
    </ContextMenu>
    <ConfirmarRemocao
      aberto={confirmando}
      onAberto={setConfirmando}
      titulo={t.arquivosList.removerTitulo(scene.name)}
      itens={[
        t.arquivosList.removerOQuadro,
        t.arquivosList.removerElementos(elementos),
      ]}
      acao={t.geral.remover}
      onConfirmar={() => store().removeScene(scene.id)}
    />
    </>
  );
}

// --- nota -------------------------------------------------------------------

/**
 * `memo` porque a lista re-renderiza a cada commit do board -- e com o quadro
 * no ar, um arrasto é um commit a cada 100 ms. As props são estáveis fora de
 * uma mudança de verdade: a nota e as pastas vêm do board, a medida do mapa
 * do Rust, e `aberta` só muda ao abrir outra nota.
 */
const NotaRow = memo(NotaRowSemMemo);

function NotaRowSemMemo({
  nota,
  pastas,
  depth,
  aberta,
  medida,
  trecho,
}: {
  nota: Nota;
  pastas: Pasta[];
  depth: number;
  aberta: boolean;
  medida: MedidaDeDocumento | undefined;
  /** Onde a busca achou o termo no texto da nota. No lugar das medidas. */
  trecho?: Trecho;
}) {
  const [renomeando, setRenomeando] = useState(false);
  const renomear = useRenomearPeloMenu(() => setRenomeando(true));
  // O mesmo gesto da imagem do acervo: a nota sai da árvore com a sombra do
  // cartão e cai no quadro como cartão, ou numa pasta da própria árvore.
  const arrastar = useTokenDrag();
  const naMao = useTokenDragStore(
    (state) =>
      state.arrasto?.fonte.tipo === "nota" && state.arrasto.fonte.notaId === nota.id,
  );
  const store = () => useSceneStore.getState();
  // O texto vivo SÓ da nota aberta no editor: contar o que está na tela é o
  // que faz os números andarem junto com as teclas. Fechada, valem as
  // medidas do disco -- mesmo que o texto esteja na memória, porque um cartão
  // no quadro o carregou. Era "sempre que o texto estiver na memória", e num
  // quadro com sessenta cartões abertos eram sessenta notas medidas de novo
  // (TextEncoder e dois `split`) a cada render da bancada -- que, com o
  // quadro no ar, acontece dez vezes por segundo durante um arrasto. Medido
  // no cenário `quadro` da bancada, na webview: 3 ms por quadro.
  //
  // O seletor devolve `undefined` para a nota fechada, e não o texto dela: é
  // o que deixa a linha fora dos acordes do store enquanto outra nota é
  // escrita.
  const textoVivo = useDocumentoStore((state) =>
    aberta ? state.textos[nota.arquivo] : undefined,
  );
  const numeros = useMemo(
    () => (textoVivo !== undefined ? medirTexto(textoVivo) : medida),
    [textoVivo, medida],
  );

  // Onde ela já estiver -- ao lado do mapa, se o mestre a dividiu --, e no
  // centro se em lugar nenhum. Ver `abrirNota` em `lib/mestre/abrir-nota`.
  const abrir = () => abrirNotaOndeEstiver(nota.id);
  const [confirmando, setConfirmando] = useState(false);

  function apagar() {
    fecharNotaEmTodaParte(nota.id);
    store().removerNota(nota.id);
    void apagarDocumento(nota.arquivo).catch((cause: unknown) => {
      console.error("falha ao apagar a nota", cause);
    });
  }

  const itens = (kit: Kit) => {
    const { Item, Separator } = kit;
    return (
      <>
        <Item onClick={abrir}>
          <FileText />
          {t.geral.abrir}
        </Item>
        <Item onClick={() => abrirNotaAoLado(nota.id)}>
          <Columns2 />
          {t.geral.abrirAoLado}
        </Item>
        <Separator />
        <Item onClick={renomear.pedir}>
          <TextCursorInput />
          {t.geral.renomear}
        </Item>
        <ItensDeMover
          kit={kit}
          atual={nota.pastaId}
          destinos={pastas}
          onMover={(destino) => store().moverNotaParaPasta(nota.id, destino)}
        />
        <Separator />
        <Item variant="destructive" onClick={() => setConfirmando(true)}>
          <Trash2 />
          {t.arquivosList.apagarNota}
        </Item>

        <ItensDeExtensao
          alvo="linha.nota"
          contexto={{ alvo: "linha.nota", notaId: nota.id }}
          kit={kit}
        />
      </>
    );
  };

  return (
    <>
    <ContextMenu onOpenChangeComplete={renomear.aoFechar}>
      <ContextMenuTrigger
        render={
          <li
            className={cn(
              "group flex cursor-grab touch-none items-center gap-1 rounded-md p-1",
              aberta ? "bg-accent" : "hover:bg-accent/50",
              naMao && "opacity-40",
            )}
            style={{ paddingLeft: 4 + depth * RECUO_PX }}
            onPointerDown={(event) =>
              arrastar(event, {
                fonte: {
                  tipo: "nota",
                  notaId: nota.id,
                  arquivo: nota.arquivo,
                  titulo: nota.titulo,
                },
                largura: DOCUMENTO_LARGURA,
                altura: DOCUMENTO_ALTURA,
              })
            }
          />
        }
      >
        <FileText className="text-muted-foreground ml-1 size-3.5 shrink-0" aria-hidden />
        {renomeando ? (
          <CampoDeNome
            valor={nota.titulo}
            rotulo={t.geral.tituloDaNota}
            onConfirmar={(titulo) => {
              store().renomearNota(nota.id, titulo);
              setRenomeando(false);
            }}
            onCancelar={() => setRenomeando(false)}
          />
        ) : (
          <button
            type="button"
            className="flex min-w-0 flex-1 flex-col items-start text-left text-sm"
            aria-current={aberta}
            onClick={abrir}
            onDoubleClick={() => setRenomeando(true)}
            onKeyDown={aoApertarF2(() => setRenomeando(true))}
          >
            <span className="max-w-full truncate">{nota.titulo}</span>
            {trecho ? (
              <TrechoAchado trecho={trecho} />
            ) : numeros ? (
              <Detalhe>
                {tamanhoCurto(numeros.bytes)} · {t.arquivosList.contarLinhas(numeros.linhas)} ·{" "}
                {t.arquivosList.contarPalavras(numeros.palavras)}
              </Detalhe>
            ) : null}
          </button>
        )}
        <TresPontos rotulo={nota.titulo} aoFechar={renomear.aoFechar} itens={itens} />
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52">{itens(KIT_CONTEXTO)}</ContextMenuContent>
    </ContextMenu>
    <ConfirmarRemocao
      aberto={confirmando}
      onAberto={setConfirmando}
      titulo={t.geral.apagarNotaTitulo(nota.titulo)}
      itens={[t.geral.apagarNotaArquivo, t.geral.apagarNotaCartoes]}
      onConfirmar={apagar}
    />
    </>
  );
}
