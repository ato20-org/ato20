"use client";

import {
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  CopyPlus,
  FilePlus,
  FileText,
  FolderClosed,
  FolderPlus,
  MoreVertical,
  Presentation,
  Radio,
  TextCursorInput,
  Trash2,
  Ungroup,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useListReorder } from "@/hooks/use-list-reorder";
import {
  aoApertarF2,
  useRenomearPeloMenu,
} from "@/hooks/use-renomear-pelo-menu";
import { useTokenDrag } from "@/hooks/use-token-drag";
import { useArquivoAbertoStore } from "@/lib/store/use-arquivo-aberto-store";
import { useDocumentoStore } from "@/lib/store/use-documento-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useTokenDragStore } from "@/lib/store/use-token-drag-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
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
  const pastas = useSceneStore((state) => state.board?.pastas);
  const notas = useSceneStore((state) => state.board?.notas);
  const editingSceneId = useSceneStore((state) => state.board?.editingSceneId);
  const liveSceneId = useSceneStore((state) => state.board?.liveSceneId);
  const notaAbertaId = useArquivoAbertoStore((state) => state.notaId);
  const medidas = useMedidasDasNotas(ready, notas ?? []);

  const quadros = useMemo(
    () => (scenes ?? []).filter((scene) => ehQuadro(scene)),
    [scenes],
  );
  const linhas = useMemo(
    () => achatar(quadros, pastas ?? [], notas ?? []),
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

  const criar = useCriar(pastas?.length ?? 0, notas?.length ?? 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Três botões iguais: criar é criar, seja o que for. O que cada um cria
          está no ícone e na dica; o título da aba já diz "Arquivos". */}
      <div className="flex gap-1 p-2">
        <BotaoDeCriar
          rotulo="Novo quadro"
          dica="Um quadro: folha para imagens, notas e setas."
          disabled={!ready}
          onClick={() => criar.quadro()}
        >
          <Presentation />
        </BotaoDeCriar>
        <BotaoDeCriar
          rotulo="Nova nota"
          dica="Uma nota: arquivo .md que abre no editor."
          disabled={!ready}
          onClick={() => criar.nota()}
        >
          <FilePlus />
        </BotaoDeCriar>
        <BotaoDeCriar
          rotulo="Nova pasta"
          dica="Uma pasta. Arraste quadros e notas para dentro."
          disabled={!ready}
          onClick={() => criar.pasta()}
        >
          <FolderPlus />
        </BotaoDeCriar>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {/* O fundo da lista, e SÓ ele, é o gatilho do menu do vazio. Envolver
            as linhas faria os menus delas disputarem o mesmo botão direito. */}
        <div className="relative min-h-full">
          <ContextMenu>
            <ContextMenuTrigger render={<div className="absolute inset-0" aria-hidden />} />
            <ContextMenuContent className="w-48">
              <ContextMenuItem onClick={() => criar.quadro()}>
                <Presentation />
                Novo quadro
              </ContextMenuItem>
              <ContextMenuItem onClick={() => criar.nota()}>
                <FilePlus />
                Nova nota
              </ContextMenuItem>
              <ContextMenuItem onClick={() => criar.pasta()}>
                <FolderPlus />
                Nova pasta
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>

          <ul ref={listRef} className="relative z-10 space-y-0.5 p-2 pt-0">
            {linhas.map((linha, index) =>
              linha.tipo === "pasta" ? (
                <PastaRow
                  key={linha.pasta.id}
                  pasta={linha.pasta}
                  pastas={pastas ?? []}
                  depth={linha.depth}
                  total={linha.total}
                  dropTarget={dropIndex === index}
                  onReorderStart={startReorder}
                  onCriarNota={() => criar.nota(linha.pasta.id)}
                  onCriarQuadro={() => criar.quadro(linha.pasta.id)}
                />
              ) : linha.tipo === "nota" ? (
                <NotaRow
                  key={linha.nota.id}
                  nota={linha.nota}
                  pastas={pastas ?? []}
                  depth={linha.depth}
                  aberta={linha.nota.id === notaAbertaId}
                  medida={medidas.get(linha.nota.arquivo)}
                />
              ) : (
                <QuadroRow
                  key={linha.scene.id}
                  scene={linha.scene}
                  pastas={pastas ?? []}
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

          {/* O vazio abaixo da lista é alvo: soltar aqui tira da pasta. */}
          <div
            className={cn(
              "mx-2 mb-2 min-h-8 rounded-md",
              dropIndex === linhas.length && "ring-primary/60 bg-primary/10 ring-1",
            )}
          >
            {dropIndex === linhas.length ? (
              <p className="text-muted-foreground px-2 py-2 text-[10px]">
                Solte aqui para tirar da pasta
              </p>
            ) : null}
          </div>
        </div>
      </ScrollArea>
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
            className="flex-1"
            variant="outline"
            size="sm"
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
      const titulo = `Nota ${totalDeNotas + 1}`;
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
      store.criarPasta(`Pasta ${totalDePastas + 1}`, parentId);
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

/** Recuo por nível, em pixels. O mesmo da lista de camadas. */
const RECUO_PX = 14;
/** Id de arrasto de uma pasta, para não colidir com id de cena. */
const PREFIXO_PASTA = "pasta:";
/** Quanto o ponteiro anda antes de a linha virar arrasto. Abaixo é clique. */
const LIMIAR_ARRASTO_PX = 5;

/**
 * A árvore achatada em linhas, na ordem em que aparecem: em cada nível as
 * pastas, depois os quadros na ordem do board, depois as notas por título.
 * Pasta recolhida esconde as linhas de dentro, mas continua contando. Quem
 * aponta para pasta que sumiu cai na raiz em vez de sumir da lista.
 */
function achatar(quadros: Scene[], pastas: Pasta[], notas: Nota[]): Linha[] {
  const linhas: Linha[] = [];
  const existe = new Set(pastas.map((pasta) => pasta.id));
  const pastaDe = (coisa: { pastaId?: string }) =>
    coisa.pastaId && existe.has(coisa.pastaId) ? coisa.pastaId : undefined;

  function contar(pastaId: string): number {
    let total =
      quadros.filter((scene) => pastaDe(scene) === pastaId).length +
      notas.filter((nota) => pastaDe(nota) === pastaId).length;
    for (const filha of pastas)
      if (filha.parentId === pastaId) total += contar(filha.id);
    return total;
  }

  function nivel(parentId: string | undefined, depth: number) {
    for (const pasta of pastas) {
      if (pasta.parentId !== parentId) continue;
      linhas.push({ tipo: "pasta", pasta, depth, total: contar(pasta.id) });
      if (!pasta.recolhido) nivel(pasta.id, depth + 1);
    }
    for (const scene of quadros)
      if (pastaDe(scene) === parentId) linhas.push({ tipo: "cena", scene, depth });
    for (const nota of [...notas].sort((a, b) => a.titulo.localeCompare(b.titulo)))
      if (pastaDe(nota) === parentId) linhas.push({ tipo: "nota", nota, depth });
  }

  nivel(undefined, 0);
  return linhas;
}

/** A pasta e todas as descendentes dela, por id. */
function descendentes(pastas: Pasta[], id: string): string[] {
  const ids = [id];
  let cresceu = true;
  while (cresceu) {
    cresceu = false;
    for (const pasta of pastas)
      if (pasta.parentId && ids.includes(pasta.parentId) && !ids.includes(pasta.id)) {
        ids.push(pasta.id);
        cresceu = true;
      }
  }
  return ids;
}

/**
 * O campo de renomear no lugar do nome. Um só para as três linhas: é o mesmo
 * campo, e três cópias seriam três jeitos de ele se comportar.
 */
function CampoDeNome({
  valor,
  rotulo,
  onConfirmar,
  onCancelar,
}: {
  valor: string;
  rotulo: string;
  onConfirmar: (valor: string) => void;
  onCancelar: () => void;
}) {
  return (
    <input
      autoFocus
      defaultValue={valor}
      className="bg-background h-6 min-w-0 flex-1 rounded px-1.5 text-sm outline-none"
      aria-label={rotulo}
      onPointerDown={(event) => event.stopPropagation()}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={(event) => onConfirmar(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onConfirmar(event.currentTarget.value);
        if (event.key === "Escape") onCancelar();
        event.stopPropagation();
      }}
    />
  );
}

/**
 * As peças de um menu. O botão direito e os três pontos são dois menus
 * diferentes (contexto e dropdown), mas os itens têm de ser os MESMOS; cada
 * linha escreve os itens uma vez, recebendo o kit de quem os desenha.
 */
type Kit = {
  Item: typeof ContextMenuItem;
  Separator: typeof ContextMenuSeparator;
  Sub: typeof ContextMenuSub;
  SubTrigger: typeof ContextMenuSubTrigger;
  SubContent: typeof ContextMenuSubContent;
};

const KIT_CONTEXTO: Kit = {
  Item: ContextMenuItem,
  Separator: ContextMenuSeparator,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent,
};

const KIT_TRES_PONTOS: Kit = {
  Item: DropdownMenuItem as Kit["Item"],
  Separator: DropdownMenuSeparator as Kit["Separator"],
  Sub: DropdownMenuSub as Kit["Sub"],
  SubTrigger: DropdownMenuSubTrigger as Kit["SubTrigger"],
  SubContent: DropdownMenuSubContent as Kit["SubContent"],
};

/**
 * Os três pontos de uma linha, com o mesmo menu do botão direito. Escondidos
 * até o ponteiro chegar ou o foco entrar, como no acervo e nas camadas: três
 * pontos em cada linha viram ruído. `stopPropagation` porque a linha começa
 * arrasto no `pointerdown`.
 */
function TresPontos({
  rotulo,
  aoFechar,
  itens,
}: {
  rotulo: string;
  aoFechar: (aberto: boolean) => void;
  itens: (kit: Kit) => ReactNode;
}) {
  return (
    <DropdownMenu onOpenChangeComplete={aoFechar}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Opções de ${rotulo}`}
            onPointerDown={(event) => event.stopPropagation()}
            className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-[popup-open]:opacity-100"
          >
            <MoreVertical />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-52">
        {itens(KIT_TRES_PONTOS)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Os itens "Mover para" de um menu: raiz e cada pasta permitida. */
function ItensDeMover({
  kit: { Item, Separator, Sub, SubTrigger, SubContent },
  atual,
  destinos,
  onMover,
}: {
  kit: Kit;
  atual: string | undefined;
  destinos: Pasta[];
  onMover: (pastaId: string | undefined) => void;
}) {
  if (destinos.length === 0 && !atual) return null;
  return (
    <Sub>
      <SubTrigger>
        <FolderClosed />
        Mover para
      </SubTrigger>
      <SubContent className="w-48">
        <Item disabled={!atual} onClick={() => onMover(undefined)}>
          Raiz
        </Item>
        {destinos.length > 0 ? <Separator /> : null}
        {destinos.map((pasta) => (
          <Item
            key={pasta.id}
            disabled={pasta.id === atual}
            onClick={() => onMover(pasta.id)}
          >
            <span className="truncate">{pasta.nome}</span>
          </Item>
        ))}
      </SubContent>
    </Sub>
  );
}

// --- pasta ------------------------------------------------------------------

function PastaRow({
  pasta,
  pastas,
  depth,
  total,
  dropTarget,
  onReorderStart,
  onCriarNota,
  onCriarQuadro,
}: {
  pasta: Pasta;
  pastas: Pasta[];
  depth: number;
  total: number;
  dropTarget: boolean;
  onReorderStart: (event: ReactPointerEvent, id: string, limiar?: number) => void;
  onCriarNota: () => void;
  onCriarQuadro: () => void;
}) {
  const [renomeando, setRenomeando] = useState(false);
  const renomear = useRenomearPeloMenu(() => setRenomeando(true));

  // Destinos válidos: nem ela, nem descendente dela.
  const proibidos = new Set(descendentes(pastas, pasta.id));
  const destinos = pastas.filter((outra) => !proibidos.has(outra.id));

  const store = () => useSceneStore.getState();
  const alternar = () => store().atualizarPasta(pasta.id, { recolhido: !pasta.recolhido });

  const itens = (kit: Kit) => {
    const { Item, Separator } = kit;
    return (
      <>
        <Item onClick={onCriarQuadro}>
          <Presentation />
          Novo quadro aqui
        </Item>
        <Item onClick={onCriarNota}>
          <FilePlus />
          Nova nota aqui
        </Item>
        <Item
          onClick={() => {
            store().atualizarPasta(pasta.id, { recolhido: false });
            store().criarPasta(`Pasta ${pastas.length + 1}`, pasta.id);
          }}
        >
          <FolderPlus />
          Nova subpasta
        </Item>
        <Separator />
        <Item onClick={renomear.pedir}>
          <TextCursorInput />
          Renomear
        </Item>
        <ItensDeMover
          kit={kit}
          atual={pasta.parentId}
          destinos={destinos}
          onMover={(destino) => store().moverPasta(pasta.id, destino)}
        />
        <Separator />
        {/* Desfazer solta o que há dentro um nível acima. Nunca apaga quadro
            nem nota: é organização, não remoção. */}
        <Item onClick={() => store().removerPasta(pasta.id)}>
          <Ungroup />
          Desfazer pasta
        </Item>
      </>
    );
  };

  return (
    <ContextMenu onOpenChangeComplete={renomear.aoFechar}>
      <ContextMenuTrigger
        render={
          <li
            className={cn(
              "group hover:bg-accent/50 flex cursor-grab touch-none items-center gap-1 rounded-md p-1",
              dropTarget && "ring-primary ring-1",
            )}
            style={{ paddingLeft: 4 + depth * RECUO_PX }}
            data-pasta-arquivos=""
            data-pasta-id={pasta.id}
            onPointerDown={(event) =>
              onReorderStart(event, `${PREFIXO_PASTA}${pasta.id}`, LIMIAR_ARRASTO_PX)
            }
          />
        }
      >
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={pasta.recolhido ? `Abrir ${pasta.nome}` : `Fechar ${pasta.nome}`}
          aria-expanded={!pasta.recolhido}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={alternar}
        >
          {pasta.recolhido ? <ChevronRight /> : <ChevronDown />}
        </Button>
        <FolderClosed className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
        {renomeando ? (
          <CampoDeNome
            valor={pasta.nome}
            rotulo="Nome da pasta"
            onConfirmar={(nome) => {
              const limpo = nome.trim();
              if (limpo && limpo !== pasta.nome)
                store().atualizarPasta(pasta.id, { nome: limpo });
              setRenomeando(false);
            }}
            onCancelar={() => setRenomeando(false)}
          />
        ) : (
          <>
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-sm font-medium"
              onClick={alternar}
              onDoubleClick={() => setRenomeando(true)}
              onKeyDown={aoApertarF2(() => setRenomeando(true))}
            >
              {pasta.nome}
            </button>
            <span className="text-muted-foreground text-[10px] tabular-nums">{total}</span>
          </>
        )}
        <TresPontos rotulo={pasta.nome} aoFechar={renomear.aoFechar} itens={itens} />
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52">{itens(KIT_CONTEXTO)}</ContextMenuContent>
    </ContextMenu>
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
}: {
  scene: Scene;
  pastas: Pasta[];
  depth: number;
  aberto: boolean;
  noAr: boolean;
  dropTarget: boolean;
  onReorderStart: (event: ReactPointerEvent) => void;
}) {
  const [renomeando, setRenomeando] = useState(false);
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
          Abrir
        </Item>
        <Item disabled={noAr} onClick={() => store().setLiveSceneId(scene.id)}>
          <Radio />
          Colocar no ar
        </Item>
        <Separator />
        <Item onClick={renomear.pedir}>
          <TextCursorInput />
          Renomear
        </Item>
        <Item onClick={() => store().duplicateScene(scene.id)}>
          <CopyPlus />
          Duplicar
        </Item>
        <ItensDeMover
          kit={kit}
          atual={scene.pastaId}
          destinos={pastas}
          onMover={(destino) => store().moverParaPasta(scene.id, destino)}
        />
        <Separator />
        <Item variant="destructive" onClick={() => store().removeScene(scene.id)}>
          <Trash2 />
          Remover o quadro
        </Item>
      </>
    );
  };

  return (
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
            rotulo="Nome do quadro"
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
                  aria-label="No ar"
                />
              ) : null}
            </span>
            <Detalhe>
              {elementos} {elementos === 1 ? "elemento" : "elementos"} ·{" "}
              {tamanhoCurto(bytesDoQuadro(scene))}
            </Detalhe>
          </button>
        )}
        <TresPontos rotulo={scene.name} aoFechar={renomear.aoFechar} itens={itens} />
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52">{itens(KIT_CONTEXTO)}</ContextMenuContent>
    </ContextMenu>
  );
}

// --- nota -------------------------------------------------------------------

function NotaRow({
  nota,
  pastas,
  depth,
  aberta,
  medida,
}: {
  nota: Nota;
  pastas: Pasta[];
  depth: number;
  aberta: boolean;
  medida: MedidaDeDocumento | undefined;
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
  // O texto vivo, quando o arquivo já está aberto: contar o que está na tela
  // é o que faz os números andarem junto com as teclas. Fechado, valem as
  // medidas do disco.
  const textoVivo = useDocumentoStore((state) => state.textos[nota.arquivo]);
  const numeros = textoVivo !== undefined ? medirTexto(textoVivo) : medida;

  const abrir = () => useArquivoAbertoStore.getState().abrirNota(nota.id);

  function apagar() {
    useArquivoAbertoStore.getState().fechar();
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
          Abrir
        </Item>
        <Separator />
        <Item onClick={renomear.pedir}>
          <TextCursorInput />
          Renomear
        </Item>
        <ItensDeMover
          kit={kit}
          atual={nota.pastaId}
          destinos={pastas}
          onMover={(destino) => store().moverNotaParaPasta(nota.id, destino)}
        />
        <Separator />
        <Item variant="destructive" onClick={apagar}>
          <Trash2 />
          Apagar a nota
        </Item>
      </>
    );
  };

  return (
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
            rotulo="Título da nota"
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
            {numeros ? (
              <Detalhe>
                {tamanhoCurto(numeros.bytes)} · {numeros.linhas}{" "}
                {numeros.linhas === 1 ? "linha" : "linhas"} · {numeros.palavras}{" "}
                {numeros.palavras === 1 ? "palavra" : "palavras"}
              </Detalhe>
            ) : null}
          </button>
        )}
        <TresPontos rotulo={nota.titulo} aoFechar={renomear.aoFechar} itens={itens} />
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52">{itens(KIT_CONTEXTO)}</ContextMenuContent>
    </ContextMenu>
  );
}
