"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookMarked,
  FolderPlus,
  Gift,
  MoreVertical,
  PackageOpen,
  Plus,
  Radio,
  RadioTower,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  FimDaLista,
  ItensDeMover,
  PastaRow,
  PREFIXO_PASTA,
  RECUO_PX,
} from "@/components/mestre/arvore-de-pastas";
import { CampoDeBusca } from "@/components/mestre/campo-de-busca";
import {
  ImagemDoItem,
  imagemDesenhada,
} from "@/components/mestre/imagem-do-item";
import {
  OpcoesDeDar,
  abrirItem,
  abrirItemNovo,
  apagarDaCampanha,
} from "@/components/mestre/acoes-do-item";
import { PainelVazio } from "@/components/mestre/painel-vazio";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { KIT_CONTEXTO, KIT_TRES_PONTOS, type Kit } from "@/components/ui/menu-kit";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useListReorder } from "@/hooks/use-list-reorder";
import { useTokenDrag } from "@/hooks/use-token-drag";
import { useTransmissaoDoItem } from "@/hooks/use-transmissao-do-item";
import { fitInitialSize } from "@/lib/geometry/transform";
import { t } from "@/lib/i18n/itens";
import { t as textoDoMestre } from "@/lib/i18n/mestre";
import {
  achatarArvore,
  caminhoDaPasta,
  pastaDoMembro,
  pastasDaLista,
} from "@/lib/mestre/arvore-de-pastas";
import { normaliza } from "@/lib/search";
import { itensMudaram, useItens, useItensStore } from "@/lib/store/use-itens-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useTokenDragStore } from "@/lib/store/use-token-drag-store";
import { cn } from "@/lib/utils";
import { guardarItemNoCompendio } from "@/lib/vault/compendio";
import { criarItem } from "@/lib/vault/itens";
import type { Item } from "@/types/inventory";
import type { Pasta } from "@/types/scene";

/** Usado quando a imagem do item não disse a medida dela. */
const TAMANHO_DE_RESERVA = { x: 160, y: 160 };

/** Os atributos que fazem uma linha ser pasta de Itens para o arrasto. */
const ALVO = { "data-pasta-itens": "" };

/**
 * Os itens da campanha.
 *
 * Item é item: ele é da campanha, e não de quem o carrega. Esta janela é o
 * catálogo inteiro — o que está com alguém, o que ainda não está com ninguém, o
 * que mora num ponto do mapa —, e é daqui que um item sai para onde ele vai:
 * arrastado para a linha de um personagem ou para a ficha aberta, ele vai para
 * a mochila; para o mapa, vira peça; para o cartão de um ponto ou para o
 * handout, fica guardado ali.
 *
 * Mesmo desenho da lista de Personagens, e de propósito: busca no alto, pastas
 * que se arrastam, a linha inteira como alça do arrasto, clique que abre. Quem
 * aprendeu uma aprendeu a outra.
 */
export function ItensBody() {
  const itens = useItens();

  // Relê ao abrir, quando já havia lido: o celular cria item sem avisar o
  // Mestre -- o daemon não empurra nada para cá --, e é ao abrir a janela que
  // o mestre vai procurá-lo. Depois do `garantir` do `useItens`, que roda antes
  // e cuida da primeira leitura.
  useEffect(() => {
    if (useItensStore.getState().itens !== null) useItensStore.getState().recarregar();
  }, []);

  const [busca, setBusca] = useState("");
  const buscando = busca.trim() !== "";

  const todasAsPastas = useSceneStore((state) => state.board?.pastas);
  const pastas = useMemo(() => pastasDaLista(todasAsPastas, "itens"), [todasAsPastas]);

  /**
   * Por nome, e não pela ordem de criação: o catálogo é para ACHAR, e numa
   * campanha longa a ordem em que as coisas foram escritas não diz nada a quem
   * procura a chave da cripta.
   */
  const ordenados = useMemo(
    () =>
      itens
        ? [...itens].sort((a, b) =>
            a.nome.localeCompare(b.nome, undefined, { sensitivity: "base" }),
          )
        : null,
    [itens],
  );

  const achados = useMemo(() => {
    const termo = normaliza(busca.trim());
    if (!termo || !ordenados) return ordenados;

    // No nome, na descrição e na pasta: o que o item É. Quem o carrega não
    // entra, de propósito -- o catálogo não é de ninguém, e a bandagem da
    // campanha é a mesma esteja ela em cinco mochilas ou em nenhuma. "Quem tem
    // bandagem?" se responde na ficha de cada um.
    return ordenados.filter(
      (item) =>
        normaliza(item.nome).includes(termo) ||
        normaliza(item.descricao).includes(termo) ||
        normaliza(caminhoDaPasta(pastas, pastaDoMembro(pastas, item.id))).includes(
          termo,
        ),
    );
  }, [ordenados, busca, pastas]);

  /**
   * Soltar o item sobre uma pasta o põe lá dentro. É o MESMO arrasto que o leva
   * ao mapa e aos personagens: a linha inteira já é esse gesto, e um segundo
   * arrasto na mesma linha brigaria com ele. Ver `aceita`.
   */
  useEffect(
    () =>
      useTokenDragStore.getState().registrarAlvo("itens", (solto, destino) => {
        if (solto.fonte.tipo !== "item" || destino.tipo !== "pasta-itens") return;

        useSceneStore.getState().moverItemParaPasta(solto.fonte.itemId, destino.pastaId);
      }),
    [],
  );

  /** Onde o item arrastado cai -- `""` é a raiz --, para a borda acender só ali. */
  const alvoDoArrasto = useTokenDragStore((state) =>
    state.arrasto?.destino?.tipo === "pasta-itens"
      ? (state.arrasto.destino.pastaId ?? "")
      : null,
  );

  async function criar(pastaId?: string) {
    try {
      const item = await criarItem({ nome: t.semNome });

      if (pastaId) useSceneStore.getState().moverItemParaPasta(item.id, pastaId);
      itensMudaram([]);

      // Abre já na janela do item criado, com o nome em edição: o gesto é
      // "criar um item", e parar numa linha sem nome para clicar de novo seria
      // meio gesto. Não há tela de criar -- o item se escreve na própria
      // janela.
      abrirItemNovo(item);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t.falhas.criar);
    }
  }

  function criarPasta() {
    useSceneStore.getState().criarPasta(t.janela.nomeDaPasta(pastas.length + 1), undefined, "itens");
  }

  const linhas =
    buscando || !achados
      ? null
      : achatarArvore(achados, pastas, (item) => pastaDoMembro(pastas, item.id));

  const { listRef, dropIndex, startReorder } = useListReorder<string>(
    (arrastado, index) => {
      if (!linhas || !arrastado.startsWith(PREFIXO_PASTA)) return;

      const pastaId = arrastado.slice(PREFIXO_PASTA.length);
      const alvo = linhas[index];
      // Sobre uma pasta, entra nela; sobre um item, vai para a pasta dele; no
      // fim da lista, raiz. O store recusa ciclo.
      const destino = !alvo
        ? undefined
        : alvo.tipo === "pasta"
          ? alvo.pasta.id
          : pastaDoMembro(pastas, alvo.item.id);
      if (destino !== pastaId) useSceneStore.getState().moverPasta(pastaId, destino);
    },
    "sobre",
  );

  return (
    <>
      <div className="flex items-center gap-2 p-2">
        <CampoDeBusca
          valor={busca}
          onMudar={setBusca}
          placeholder={t.janela.buscar}
          rotulo={t.janela.buscar}
          dica={t.janela.buscarDica}
        />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 rounded-full"
                aria-label={t.janela.criar}
                onClick={() => void criar()}
              >
                <Plus />
              </Button>
            }
          />
          <TooltipContent>{t.janela.criar}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 rounded-full"
                aria-label={t.janela.novaPasta}
                onClick={criarPasta}
              >
                <FolderPlus />
              </Button>
            }
          />
          <TooltipContent>{t.janela.novaPasta}</TooltipContent>
        </Tooltip>
      </div>

      {/* O menu de contexto pega a REGIÃO da lista, como em Personagens: o vazio
          abaixo do último item é onde a mão vai quando quer somar mais um. */}
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <div className="flex min-h-0 flex-1 flex-col">
              <ScrollArea className="min-h-0 flex-1">
                {achados === null ? (
                  <p className="text-muted-foreground p-3 text-xs">{t.janela.lendo}</p>
                ) : itens?.length === 0 && pastas.length === 0 ? (
                  <PainelVazio conteudo={{ tipo: "itens" }}>{t.janela.primeiro}</PainelVazio>
                ) : buscando && achados.length === 0 ? (
                  <p className="text-muted-foreground p-3 text-xs">{t.janela.nenhumAchado}</p>
                ) : (
                  <>
                    <ul ref={listRef} className="space-y-0.5 p-2 pt-0">
                      {linhas === null
                        ? // Na busca, os achados em lista, com a pasta de cada um
                          // embaixo do nome: abrir a árvore mostraria as pastas
                          // sem o que foi achado.
                          achados.map((item) => (
                            <LinhaDoItem
                              key={item.id}
                              item={item}
                              depth={0}
                              pastas={pastas}
                              caminho={caminhoDaPasta(pastas, pastaDoMembro(pastas, item.id))}
                            />
                          ))
                        : linhas.map((linha, index) =>
                            linha.tipo === "pasta" ? (
                              <PastaRow
                                key={linha.pasta.id}
                                pasta={linha.pasta}
                                pastas={pastas}
                                depth={linha.depth}
                                total={linha.total}
                                dropTarget={
                                  dropIndex === index || alvoDoArrasto === linha.pasta.id
                                }
                                onReorderStart={startReorder}
                                alvo={ALVO}
                                itensDeCriar={({ Item }) => (
                                  <Item onClick={() => void criar(linha.pasta.id)}>
                                    <Plus />
                                    {t.janela.criarAqui}
                                  </Item>
                                )}
                              />
                            ) : (
                              <LinhaDoItem
                                key={linha.item.id}
                                item={linha.item}
                                depth={linha.depth}
                                pastas={pastas}
                              />
                            ),
                          )}
                    </ul>

                    {/* O fim da lista é raiz, para a pasta arrastada e para o
                        item. Só com pasta: sem nenhuma, o aviso falaria do que
                        não existe. */}
                    {linhas && pastas.length > 0 ? (
                      <FimDaLista
                        ativo={dropIndex === linhas.length || alvoDoArrasto === ""}
                        alvo={ALVO}
                      />
                    ) : null}
                  </>
                )}
              </ScrollArea>
            </div>
          }
        />

        <ContextMenuContent>
          <ContextMenuItem onClick={() => void criar()}>
            <Plus />
            {t.janela.criar}
          </ContextMenuItem>
          <ContextMenuItem onClick={criarPasta}>
            <FolderPlus />
            {t.janela.novaPasta}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </>
  );
}

/**
 * Uma linha do catálogo: a imagem, o nome e o começo da descrição.
 *
 * Sem "com quem está", e isto é o modelo e não economia de espaço: o item é da
 * campanha, e não muda por alguém tê-lo. A bandagem pode estar com o grupo
 * inteiro menos um, em quantidades diferentes -- e isso é de cada mochila, que
 * a ficha de cada um mostra. Aqui a bandagem é a bandagem.
 *
 * A linha inteira é a alça do arrasto, como a do personagem: um quadrado de 28
 * pixels seria o menor alvo da tela. O clique abre o item — o gesto só levanta
 * depois que o ponteiro anda, e a partir daí o clique do fim é engolido.
 */
function LinhaDoItem({
  item,
  depth,
  pastas,
  caminho,
}: {
  item: Item;
  depth: number;
  pastas: Pasta[];
  /** O caminho da pasta, mostrado no achado da busca. */
  caminho?: string;
}) {
  const arrastar = useTokenDrag();
  const { noAr, alternar } = useTransmissaoDoItem(item);

  // A linha desbota enquanto o item está no ar da mão, como a do personagem.
  const naMao = useTokenDragStore(
    (state) =>
      state.arrasto?.fonte.tipo === "item" &&
      state.arrasto.fonte.personagemId === undefined &&
      state.arrasto.fonte.itemId === item.id,
  );

  const pastaAtual = pastaDoMembro(pastas, item.id);

  // A primeira linha da descrição: distingue duas poções de nome parecido sem
  // abrir as duas. Na busca, a pasta vem antes -- sem a árvore na tela, é a
  // única pista de onde o item mora.
  const subtitulo = [caminho, item.descricao.split("\n")[0]?.trim()]
    .filter(Boolean)
    .join(" · ");

  /** O botão direito e os três pontos oferecem o MESMO. Ver `Kit`. */
  const itens = (kit: Kit) => {
    const { Item: Linha, Separator, Sub, SubTrigger, SubContent } = kit;

    return (
      <>
        <Linha onClick={() => abrirItem(item)}>
          <PackageOpen />
          {t.janela.abrir}
        </Linha>

        <Linha onClick={alternar}>
          {noAr ? <RadioTower /> : <Radio />}
          {noAr ? t.transmitir.tirar : t.transmitir.mostrar}
        </Linha>

        {/* O caminho de quem não arrasta: o teclado, e a lista de personagens
            que não está à vista. */}
        <Sub>
          <SubTrigger>
            <Gift />
            {t.janela.darA}
          </SubTrigger>
          <SubContent className="max-h-72 w-48">
            <OpcoesDeDar item={item} Item={Linha} />
          </SubContent>
        </Sub>

        {/* Uma CÓPIA vira molde do Compêndio: o item do catálogo continua onde
            está, nas mochilas que o têm. */}
        <Linha
          onClick={() =>
            void guardarItemNoCompendio(item.id).then(
              (molde) => {
                itensMudaram([]);
                toast.success(textoDoMestre.compendio.guardadoNoCompendio(molde.nome));
              },
              (cause: unknown) =>
                toast.error(
                  cause instanceof Error ? cause.message : textoDoMestre.compendio.falhou,
                ),
            )
          }
        >
          <BookMarked />
          {textoDoMestre.compendio.guardarNoCompendio}
        </Linha>

        <ItensDeMover
          kit={kit}
          atual={pastaAtual}
          destinos={pastas}
          onMover={(destino) => useSceneStore.getState().moverItemParaPasta(item.id, destino)}
        />

        <Separator />

        <Linha variant="destructive" onClick={() => void apagarDaCampanha(item)}>
          <Trash2 />
          {t.janela.apagar}
        </Linha>
      </>
    );
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <li
            className={cn(
              "group flex cursor-grab items-center gap-1 rounded-md pr-1 select-none hover:bg-accent/50 active:cursor-grabbing",
              naMao && "opacity-40",
            )}
            style={depth > 0 ? { paddingLeft: depth * RECUO_PX } : undefined}
            // Para aqui, e não sobe: o envelope da lista tem o menu de "criar".
            onContextMenu={(event) => event.stopPropagation()}
            onPointerDown={(event) => {
              // Gesto próprio e não o arrasto do navegador: é o que permite a
              // sombra no mapa e a roda escolhendo o tamanho no ar. Ver
              // `useTokenDrag`.
              const desenhada = imagemDesenhada(event.currentTarget);

              const tamanho =
                desenhada && desenhada.largura > 0 && desenhada.altura > 0
                  ? fitInitialSize(desenhada.largura, desenhada.altura)
                  : TAMANHO_DE_RESERVA;

              arrastar(event, {
                // Sem imagem desenhada não leva endereço: vai a personagens,
                // pontos e handouts, e o mapa recusa. Ver `aceita`.
                fonte: { tipo: "item", itemId: item.id, url: desenhada?.url },
                largura: tamanho.x,
                altura: tamanho.y,
              });
            }}
          />
        }
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left"
          title={t.janela.arraste(item.nome)}
          onClick={() => abrirItem(item)}
        >
          <span className="bg-muted/60 relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded border">
            <ImagemDoItem
              imagem={item.imagem}
              className="absolute inset-0 size-full object-cover"
              classeDoIcone="size-4"
            />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs">{item.nome}</span>

            {subtitulo ? (
              <span className="text-muted-foreground block truncate text-[10px]">
                {subtitulo}
              </span>
            ) : null}
          </span>

          {/* O sinal de que ESTE é o que a mesa está olhando. Sem botão: tirar
              do ar está no menu, e no aviso do alto do palco. */}
          {noAr ? (
            <RadioTower className="text-primary size-3.5 shrink-0" aria-label={t.janela.noAr} />
          ) : null}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-[popup-open]:opacity-100"
                aria-label={t.janela.opcoesDe(item.nome)}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <MoreVertical />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-52">
            {itens(KIT_TRES_PONTOS)}
          </DropdownMenuContent>
        </DropdownMenu>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52">{itens(KIT_CONTEXTO)}</ContextMenuContent>
    </ContextMenu>
  );
}
