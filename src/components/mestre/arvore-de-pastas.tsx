"use client";

import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  FolderClosed,
  FolderPlus,
  MoreVertical,
  TextCursorInput,
  Ungroup,
} from "lucide-react";

import { KIT_CONTEXTO, KIT_TRES_PONTOS, type Kit } from "@/components/ui/menu-kit";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  aoApertarF2,
  useRenomearPeloMenu,
} from "@/hooks/use-renomear-pelo-menu";
import { descendentes } from "@/lib/mestre/arvore-de-pastas";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { cn } from "@/lib/utils";
import type { Pasta } from "@/types/scene";

/**
 * As peças da árvore de pastas que os painéis desenham: a linha da pasta, o
 * campo de renomear, os três pontos e o "Mover para".
 *
 * Nasceram no Arquivos e saíram de lá quando Mapas, Fundos e Personagens
 * ganharam pastas: a mesma pasta com quatro desenhos seria quatro jeitos de
 * renomear, recolher e desfazer. A conta da árvore mora em
 * `lib/mestre/arvore-de-pastas`.
 */

/** Recuo por nível, em pixels. O mesmo da lista de camadas. */
export const RECUO_PX = 14;
/** Id de arrasto de uma pasta, para não colidir com id de item. */
export const PREFIXO_PASTA = "pasta:";
/** Quanto o ponteiro anda antes de a linha virar arrasto. Abaixo é clique. */
export const LIMIAR_ARRASTO_PX = 5;

/**
 * O campo de renomear no lugar do nome. Um só para todas as linhas: é o mesmo
 * campo, e uma cópia por linha seria um jeito diferente de ele se comportar.
 */
export function CampoDeNome({
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
 * Os três pontos de uma linha, com o mesmo menu do botão direito. Escondidos
 * até o ponteiro chegar ou o foco entrar, como no acervo e nas camadas: três
 * pontos em cada linha viram ruído. `stopPropagation` porque a linha começa
 * arrasto no `pointerdown`.
 */
export function TresPontos({
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
export function ItensDeMover({
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

/**
 * A linha de uma pasta: seta, nome, contagem e o menu.
 *
 * `pastas` são as da MESMA lista: é delas que saem os destinos do "Mover
 * para" e o número da "Nova subpasta". `itensDeCriar` são os "Novo X aqui" do
 * painel, no topo do menu -- a única parte que muda de uma lista para a outra.
 */
export function PastaRow({
  pasta,
  pastas,
  depth,
  total,
  dropTarget,
  onReorderStart,
  itensDeCriar,
  alvo,
  aberta = false,
}: {
  pasta: Pasta;
  pastas: Pasta[];
  depth: number;
  total: number;
  dropTarget: boolean;
  /**
   * Mostrada aberta, recolhida ou não na árvore: é a busca, que abre as pastas
   * de quem achou. A seta fica desligada ali -- fechar uma pasta de achados
   * mexeria na árvore que não está na tela.
   */
  aberta?: boolean;
  /**
   * Ausente = a pasta não se arrasta: nos achados da busca, e nos Personagens,
   * onde a linha já arrasta o token. Ali ela muda de mãe pelo "Mover para".
   */
  onReorderStart?: (event: ReactPointerEvent, id: string, limiar?: number) => void;
  itensDeCriar?: (kit: Kit) => ReactNode;
  /**
   * Os atributos que fazem a linha ser alvo de um arrasto vindo de FORA da
   * lista -- a nota arrastada do Arquivos, por exemplo. Ver `destinoSob`.
   */
  alvo?: Record<`data-${string}`, string>;
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
        {itensDeCriar?.(kit)}
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
        {/* Desfazer solta o que há dentro um nível acima. Nunca apaga o que
            está dentro: é organização, não remoção. */}
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
              "group hover:bg-accent/50 flex items-center gap-1 rounded-md p-1",
              onReorderStart && "cursor-grab touch-none",
              dropTarget && "ring-primary ring-1",
            )}
            style={{ paddingLeft: 4 + depth * RECUO_PX }}
            {...alvo}
            data-pasta-id={pasta.id}
            onPointerDown={
              onReorderStart
                ? (event) =>
                    onReorderStart(event, `${PREFIXO_PASTA}${pasta.id}`, LIMIAR_ARRASTO_PX)
                : undefined
            }
          />
        }
      >
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={pasta.recolhido ? `Abrir ${pasta.nome}` : `Fechar ${pasta.nome}`}
          aria-expanded={aberta || !pasta.recolhido}
          disabled={aberta}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={alternar}
        >
          {pasta.recolhido && !aberta ? <ChevronRight /> : <ChevronDown />}
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

/**
 * O fim da lista, que é alvo de arrasto: soltar ali tira da pasta. Mesmo
 * desenho em todo painel com árvore. `alvo` faz dele raiz também para o
 * arrasto que vem de fora da lista, como o de `PastaRow`.
 */
export function FimDaLista({
  ativo,
  alvo,
}: {
  ativo: boolean;
  alvo?: Record<`data-${string}`, string>;
}) {
  return (
    <div
      {...alvo}
      className={cn(
        "mx-2 mb-2 min-h-8 rounded-md",
        ativo && "ring-primary/60 bg-primary/10 ring-1",
      )}
    >
      {ativo ? (
        <p className="text-muted-foreground px-2 py-2 text-[10px]">
          Solte aqui para tirar da pasta
        </p>
      ) : null}
    </div>
  );
}
