"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  Image as ImageIcon,
  Minus,
  MoreHorizontal,
  Package,
  Plus,
  Radio,
  RadioTower,
  Trash2,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MINIATURA } from "@/lib/miniatura";
import {
  hasItemDrag,
  itemEmArrasto,
  limparItemEmArrasto,
  readAssetDrag,
  writeItemDrag,
} from "@/lib/mestre/asset-drag";
import {
  useInventarioStore,
  useVersaoInventario,
} from "@/lib/store/use-inventario-store";
import { useSpotlightStore } from "@/lib/store/use-spotlight-store";
import { characterAttachmentUrl } from "@/lib/vault/characters";
import { assetUrl } from "@/lib/vault/assets";
import {
  addItem,
  escolherImagemDoDisco,
  listInventory,
  moveItem,
  removeItem,
  transmitirItem,
  updateItem,
} from "@/lib/vault/inventory";
import { cn } from "@/lib/utils";
import type { Personagem } from "@/types/character";
import type { ImagemItem, ItemInventario } from "@/types/inventory";
import { chaveDaImagem } from "@/types/inventory";

import { AcervoPicker } from "./acervo-picker";
import { SecaoFicha } from "./secao-ficha";

/**
 * O inventário do personagem, na janela do mestre.
 *
 * A grade é de LISTA, não de slots fixos: os itens ocupam as posições em ordem
 * de criação, e um quadro vazio no fim é onde se clica para somar outro. Slot
 * fixo pediria uma capacidade para o mestre configurar — uma pergunta que a mesa
 * não faz — e deixaria buraco no meio quando um item saísse.
 *
 * Mostra os escondidos, e é o único lugar que mostra: o escondido existe para o
 * mestre ver o que o jogador não vê, e o daemon o corta antes de responder ao
 * celular.
 *
 * É também ALVO de arrasto: um item largado aqui vindo da ficha de outro
 * personagem muda de dono. O caminho de teclado para o mesmo movimento é o
 * "Mover" do diálogo do item, que continua existindo — arrasto não é alcançável
 * por quem não usa mouse.
 */
export function InventarioPersonagem({
  personagem,
  outros,
  onChangedAnexos,
}: {
  personagem: Personagem;
  /** Os demais personagens, destino possível de uma transferência. */
  outros: Personagem[];
  /**
   * A lista de ARQUIVOS do personagem precisa reler.
   *
   * A imagem de item do jogador é um anexo, e a aba de arquivos subtrai
   * justamente os que o inventário usa — ver `character_attachments`. Sem este
   * aviso, apagar um item devolvia a imagem dele à lista de arquivos só depois
   * de fechar e reabrir a ficha.
   */
  onChangedAnexos: () => void;
}) {
  const [itens, setItens] = useState<ItemInventario[] | null>(null);
  const [aberto, setAberto] = useState<ItemInventario | "novo" | null>(null);
  /** Um item de outra ficha está pairando sobre esta grade. */
  const [recebendo, setRecebendo] = useState(false);

  const invalidar = useInventarioStore((state) => state.invalidar);

  const recarregar = useCallback(() => {
    listInventory(personagem.id).then(setItens, (cause: unknown) => {
      toast.error(
        cause instanceof Error ? cause.message : "Falha ao ler o inventário.",
      );
      setItens([]);
    });
  }, [personagem.id]);

  /** O inventário mudou, e com ele o que a lista de arquivos deve esconder. */
  const mudou = useCallback(() => {
    recarregar();
    onChangedAnexos();
  }, [recarregar, onChangedAnexos]);

  // Releitura pedida de FORA: a ficha de outro personagem recebeu um item que
  // saiu daqui, e quem executou o movimento foi ela. Sem este sinal, esta
  // janela seguiria mostrando um item que já não está mais na pasta.
  const versao = useVersaoInventario(personagem.id);

  useEffect(recarregar, [recarregar, versao]);

  /**
   * Este arrasto pode cair aqui?
   *
   * O tipo diz que é item; QUEM é o dono vem da marca de módulo, porque o
   * conteúdo do arrasto é ilegível enquanto o ponteiro passa por cima — ver
   * `itemEmArrasto`. Sem a segunda parte, a grade de origem acenderia a borda
   * para o próprio item, prometendo um movimento que o Rust recusa.
   */
  function podeReceber(transfer: DataTransfer): boolean {
    if (!hasItemDrag(transfer)) return false;

    const arrasto = itemEmArrasto();

    return Boolean(arrasto && arrasto.personagemId !== personagem.id);
  }

  async function receber(de: string, itemId: string) {
    try {
      const item = await moveItem(de, personagem.id, itemId);

      // Os DOIS: aqui ganhou um item, e a ficha de onde ele saiu perdeu um --
      // e ela é outra janela, que não fica sabendo de nada sozinha.
      mudou();
      invalidar(de);

      toast.success(`${item.nome} chegou em ${personagem.nome}.`);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Falha ao mover o item.",
      );
    }
  }

  async function criar() {
    try {
      const item = await addItem(personagem.id, { nome: "Item sem nome" });
      recarregar();

      // Abre já no item criado: o gesto do mestre é "adicionar um item", e
      // parar num quadro sem nome para ele clicar de novo seria meio gesto.
      setAberto(item);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Falha ao criar o item.",
      );
    }
  }

  // O botao de adicionar fica no cabecalho da secao, e nao aqui dentro: com a
  // secao fechada ele continua a mao, e por um item novo nao valer abrir a
  // grade antes.
  const adicionar = (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label="Adicionar item"
      onClick={() => void criar()}
    >
      <Plus />
    </Button>
  );

  if (itens === null) {
    return (
      <SecaoFicha secao="inventario" titulo="Inventário" acao={adicionar}>
        <p className="text-muted-foreground text-xs">Lendo…</p>
      </SecaoFicha>
    );
  }

  return (
    <SecaoFicha
      secao="inventario"
      titulo="Inventário"
      contagem={itens.length}
      acao={adicionar}
    >
      <Grade
        recebendo={recebendo}
        onDragOver={(event) => {
          if (!podeReceber(event.dataTransfer)) return;

          // `preventDefault` é o que declara "aceito aqui". Sem ele o navegador
          // recusa o drop e o cursor mostra a placa de proibido.
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDragEnter={(event) => {
          if (podeReceber(event.dataTransfer)) setRecebendo(true);
        }}
        onDragLeave={(event) => {
          // Só quando sai da grade de verdade: `dragleave` também dispara ao
          // passar de um quadro para o vizinho, e sem esta guarda a borda
          // piscaria a cada item sobrevoado.
          if (event.currentTarget === event.target) setRecebendo(false);
        }}
        onDrop={(event) => {
          setRecebendo(false);
          if (!podeReceber(event.dataTransfer)) return;

          event.preventDefault();

          const payload = readAssetDrag(event.dataTransfer);
          // Confere no CONTEÚDO, e não na marca de módulo que o `dragover`
          // usou: aqui ele é legível, e é a verdade.
          if (!payload?.item || payload.item.personagemId === personagem.id)
            return;

          void receber(payload.item.personagemId, payload.item.itemId);
        }}
      >
        {itens.map((item) => (
          <ItemTile
            key={item.id}
            personagemId={personagem.id}
            item={item}
            onAbrir={() => setAberto(item)}
            onChanged={mudou}
          />
        ))}

        {/* UM vazio, no fim, e não os que completariam a linha: com `auto-fill`
            o número de colunas é decidido pelo navegador a cada largura, e o
            JavaScript não o conhece para contar quantos faltam. O quadro que
            importa é este — o lugar onde se clica para adicionar. */}
        <SlotVazio onAdicionar={() => void criar()} />
      </Grade>

      <ItemDialog
        personagem={personagem}
        outros={outros}
        item={aberto === "novo" ? null : aberto}
        onFechar={() => setAberto(null)}
        onChanged={mudou}
      />
    </SecaoFicha>
  );
}

/**
 * A grade dos itens.
 *
 * `auto-fill` com um PISO por quadro, e não cinco colunas fixas. Cinco fixas era
 * o pedido, e funcionava enquanto a ficha era uma coluna só; com o inventário na
 * metade direita de uma janela de 700 pixels, a coluna tem 326 e cinco quadros
 * dão 60 pixels cada — pequenos demais para caber a tira de ações, e pequenos
 * demais para reconhecer a imagem, que é o que o quadro existe para fazer.
 *
 * Assim são cinco quando há largura, e quatro ou três quando não há. O que se
 * fixou foi o TAMANHO do quadro; o número de colunas responde à janela, como
 * tudo o mais nesta ficha.
 *
 * O piso é o que a TIRA de ações pede: três botões de 24 pixels, mais os vãos e
 * o respiro das pontas. Abaixo disso o último botão saía para fora do quadro.
 */
const PISO_QUADRO_PX = 80;

/** As linhas do menu do quadro, menores que o padrão do componente. */
const ITEM_MENU =
  "text-xs whitespace-nowrap [&_svg:not([class*='size-'])]:size-3.5";

function Grade({
  recebendo,
  children,
  ...arrasto
}: {
  /** Acende a borda: há um item de outra ficha pairando aqui. */
  recebendo: boolean;
  children: React.ReactNode;
} & Pick<
  React.ComponentProps<"div">,
  "onDragOver" | "onDragEnter" | "onDragLeave" | "onDrop"
>) {
  return (
    <div
      {...arrasto}
      className={cn(
        "grid gap-1.5 rounded-md border border-transparent transition-colors motion-reduce:transition-none",
        // A borda é do CONTÊINER e não de um quadro: o alvo é o inventário
        // inteiro, e não uma posição dentro dele -- a ordem dos itens é a de
        // criação, e soltar entre dois não significa nada.
        recebendo && "border-primary bg-primary/5",
      )}
      // Inline porque o valor é um número, e não classe: uma classe Tailwind por
      // valor possível exigiria a lista inteira no safelist.
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${PISO_QUADRO_PX}px, 1fr))`,
      }}
    >
      {children}
    </div>
  );
}

/**
 * O quadro de um item.
 *
 * O nome fica embaixo da imagem e não some: um inventário de ícones sem legenda
 * obriga a passar o mouse em cada um para saber o que é, e a mesa está com
 * pressa. A quantidade só aparece acima de 1, porque "1" em todo quadro é
 * ruído — mas no hover ela aparece sempre, como stepper, porque é ali que se
 * sobe de 1 para 2.
 *
 * ARRASTÁVEL quando tem imagem: soltar no palco põe a peça no mapa. Só com
 * imagem, porque o que vai para o mapa é ela — um item sem imagem não teria o
 * que desenhar lá.
 */
function ItemTile({
  personagemId,
  item,
  onAbrir,
  onChanged,
}: {
  personagemId: string;
  item: ItemInventario;
  onAbrir: () => void;
  onChanged: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);

  const [menuAberto, setMenuAberto] = useState(false);

  const { noAr, alternar: alternarTransmissao } = useTransmissaoDoItem(
    personagemId,
    item,
  );

  async function mexer(quanto: number) {
    // Zero remove, e o Rust eleva para 1 — então a subtração para de descer
    // aqui. Quem chegou a zero quer o botão da lixeira, que está ao lado.
    const alvo = Math.max(1, item.quantidade + quanto);
    if (alvo === item.quantidade) return;

    setOcupado(true);

    try {
      await updateItem(personagemId, item.id, { quantidade: alvo });
      onChanged();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Falha ao mudar a quantidade.",
      );
    } finally {
      setOcupado(false);
    }
  }

  async function esconder(escondido: boolean) {
    setOcupado(true);

    try {
      await updateItem(personagemId, item.id, { escondido });
      onChanged();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Falha ao mudar o item.",
      );
    } finally {
      setOcupado(false);
    }
  }

  async function apagar() {
    try {
      await removeItem(personagemId, item.id);
      onChanged();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Falha ao remover o item.",
      );
    }
  }

  return (
    <div
      className={cn(
        "group/item bg-card relative aspect-square overflow-hidden rounded border",
        // Escondido tem marca PERMANENTE, e não só o ícone no canto: o mestre
        // olha a grade inteira de relance para saber o que a mesa já viu, e um
        // ícone de 12px não responde isso à distância.
        item.escondido && "border-dashed",
      )}
      // O arrasto vai no contêiner e não no botão: arrastar um `<button>` briga
      // com o clique dele em alguns navegadores, e o que se arrasta é o item
      // inteiro, não a imagem dentro dele.
      draggable={Boolean(item.imagem)}
      onDragStart={(event) => {
        if (!item.imagem) return;

        writeItemDrag(event.dataTransfer, personagemId, item.id);
      }}
      // Solto ou abandonado, o arrasto acabou: a marca de módulo não pode
      // sobreviver a ele e acender a borda de um inventário no gesto seguinte.
      onDragEnd={limparItemEmArrasto}
    >
      {/* O botão preenche o quadro e é o que abre o item. Fica ATRÁS dos
          controles, que são irmãos com `z` maior: aninhar botão dentro de botão
          é HTML inválido, e o clique no `+` subiria para abrir o diálogo. */}
      <button
        type="button"
        onClick={onAbrir}
        aria-label={`${item.nome}${item.escondido ? " (escondido)" : ""}`}
        title={item.imagem ? `${item.nome} — arraste para a mesa` : item.nome}
        className={cn(
          "focus-visible:ring-ring absolute inset-0 flex flex-col items-center justify-end gap-0.5 p-1 text-center focus-visible:ring-2 focus-visible:outline-none",
          // A opacidade é do CONTEÚDO, e não do quadro inteiro: no quadro ela
          // apagava junto a tira de ações e o olho do canto, e o mestre ficava
          // mexendo em botões desbotados justamente no item que ele foi ali
          // revelar.
          item.escondido && "opacity-60",
        )}
      >
        <ImagemDoItem
          key={chaveDaImagem(item.imagem)}
          personagemId={personagemId}
          imagem={item.imagem}
        />

        <span className="relative line-clamp-2 text-[10px] leading-tight font-medium wrap-break-word">
          {item.nome}
        </span>
      </button>

      {/* A quantidade: badge parado, stepper no hover. O badge já morava neste
          canto, então subir de 3 para 4 acontece onde o 3 estava -- em vez de
          num campo dentro de um diálogo, que era o único caminho antes. */}
      <div className="absolute top-1 right-1 z-10 flex items-center">
        {item.quantidade > 1 ? (
          <span className="bg-primary text-primary-foreground rounded px-1 text-[10px] leading-4 font-semibold tabular-nums group-hover/item:hidden group-focus-within/item:hidden">
            {item.quantidade}
          </span>
        ) : null}

        <div className="bg-background/90 hidden items-center rounded border shadow-sm group-hover/item:flex group-focus-within/item:flex">
          <Passo
            rotulo={`Menos um ${item.nome}`}
            Icone={Minus}
            desabilitado={ocupado || item.quantidade <= 1}
            onClick={() => void mexer(-1)}
          />

          <span className="min-w-3 text-center text-[10px] leading-4 font-semibold tabular-nums">
            {item.quantidade}
          </span>

          <Passo
            rotulo={`Mais um ${item.nome}`}
            Icone={Plus}
            desabilitado={ocupado}
            onClick={() => void mexer(1)}
          />
        </div>
      </div>

      {/* O olho no canto, e não numa tira embaixo: ele é marca E botão ao mesmo
          tempo. Aceso quando o item está escondido -- e aí fica visível SEM
          hover, porque é o sinal que o mestre lê de relance na grade inteira --,
          e só no hover quando o jogador vê, onde não há nada a avisar.

          Mesma forma do ⚡ do Retrato ao vivo, e pelo mesmo motivo: um estado
          que vale a pena ver sem tocar em nada. */}
      <div className="absolute top-1 left-1 z-10">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={
                  item.escondido
                    ? `Mostrar ${item.nome} ao jogador`
                    : `Esconder ${item.nome} do jogador`
                }
                aria-pressed={item.escondido}
                disabled={ocupado}
                className={cn(
                  "size-5",
                  item.escondido
                    ? "bg-background/90 text-foreground hover:bg-background border shadow-sm"
                    : "bg-background/80 text-muted-foreground hover:text-foreground hidden group-hover/item:flex group-focus-within/item:flex",
                )}
                onClick={() => void esconder(!item.escondido)}
              >
                {item.escondido ? <EyeOff /> : <Eye />}
              </Button>
            }
          />
          <TooltipContent>
            <p className="max-w-48">
              {item.escondido
                ? "O jogador não vê. Clique para revelar."
                : "O jogador vê. Clique para esconder."}
            </p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Transmitir e remover atrás dos três pontinhos, e não como botões
          soltos: com a tira cheia eram quatro alvos disputando um quadro de 80
          pixels, e os dois que sobraram aqui não são gestos de repetição --
          transmite-se um item uma vez, e remove-se uma vez só. O que ficou à
          vista é o que se repete: o olho e a quantidade. */}
      <div
        className={cn(
          "absolute right-1 bottom-1 z-10",
          // Enquanto o menu está aberto o gatilho NÃO pode sumir. Ele vivia só
          // de `group-hover`/`group-focus-within`, e abrir o menu manda o foco
          // para o popup -- que é portalado para fora deste quadro. Os dois
          // grupos caíam juntos, o gatilho virava `display:none`, e o menu
          // perdia a âncora e ia parar no canto da tela.
          menuAberto
            ? "block"
            : "hidden group-hover/item:block group-focus-within/item:block",
        )}
      >
        <DropdownMenu open={menuAberto} onOpenChange={setMenuAberto}>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Mais ações para ${item.nome}`}
                className="bg-background/90 hover:bg-background size-5 border shadow-sm"
              >
                <MoreHorizontal />
              </Button>
            }
          />

          {/* `text-xs` e rótulos de uma palavra: o menu nasce de um quadro de
              80 pixels, e um popup mais largo que o próprio item era o que
              "Mostrar na mesa" em `text-sm` produzia. O ícone diz o resto. */}
          <DropdownMenuContent align="end">
            {item.imagem ? (
              <DropdownMenuItem
                className={ITEM_MENU}
                onClick={alternarTransmissao}
              >
                {noAr ? <RadioTower /> : <Radio />}
                {noAr ? "Tirar" : "Mostrar"}
              </DropdownMenuItem>
            ) : null}

            <DropdownMenuItem
              className={ITEM_MENU}
              variant="destructive"
              onClick={() => void apagar()}
            >
              <Trash2 />
              Remover
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/** Um passo do stepper. Existe só para o `-` e o `+` não serem duas cópias. */
function Passo({
  rotulo,
  Icone,
  desabilitado,
  onClick,
}: {
  rotulo: string;
  Icone: typeof Plus;
  desabilitado: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      disabled={desabilitado}
      onClick={onClick}
      className="hover:bg-accent focus-visible:ring-ring flex size-4 items-center justify-center rounded-sm disabled:opacity-30 focus-visible:ring-2 focus-visible:outline-none"
    >
      <Icone className="size-2.5" aria-hidden />
    </button>
  );
}

function SlotVazio({ onAdicionar }: { onAdicionar: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdicionar}
      aria-label="Adicionar item"
      className="text-muted-foreground hover:border-ring hover:text-foreground focus-visible:ring-ring flex aspect-square items-center justify-center rounded border border-dashed focus-visible:ring-2 focus-visible:outline-none"
    >
      <Plus className="size-4" aria-hidden />
    </button>
  );
}

/**
 * A imagem do item, venha ela de onde vier.
 *
 * Os dois braços da união têm transportes diferentes, e esconder isso aqui é o
 * que deixa o resto da tela tratar item como item: `asset` é o acervo, que a
 * janela alcança pelo endereço do daemon; `anexo` está atrás do token de quem o
 * mandou, e o mestre chega a ele pelo IPC, como blob — mesma razão de
 * `AnexoThumb` em `character-window`.
 */
function ImagemDoItem({
  personagemId,
  imagem,
}: {
  personagemId: string;
  imagem: ImagemItem | undefined;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    if (!imagem) return;

    let ativo = true;
    let criada: string | null = null;

    const pedido =
      imagem.tipo === "asset"
        ? assetUrl(imagem.id, "mini")
        : characterAttachmentUrl(personagemId, {
            autor: imagem.autor,
            arquivo: imagem.arquivo,
            mimeType: mimeDaImagem(imagem.arquivo),
            tamanho: 0,
          });

    void pedido.then(
      (endereco) => {
        if (!ativo) {
          // Trocou a imagem enquanto os bytes vinham. A blob nova não serve
          // mais a ninguém, e guardá-la seria vazamento. O endereço do acervo
          // não é blob e não precisa disso.
          if (endereco.startsWith("blob:")) URL.revokeObjectURL(endereco);
          return;
        }

        if (endereco.startsWith("blob:")) criada = endereco;
        setUrl(endereco);
      },
      () => {
        if (ativo) setFalhou(true);
      },
    );

    return () => {
      ativo = false;
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [personagemId, imagem]);

  if (!imagem || falhou || !url) {
    return (
      <Package
        className="text-muted-foreground/40 size-6 shrink-0"
        aria-hidden
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      draggable={false}
      className="absolute inset-0 size-full object-cover opacity-90 group-hover:opacity-100"
      onError={() => setFalhou(true)}
      {...MINIATURA}
    />
  );
}

/**
 * O tipo do arquivo, pela extensão.
 *
 * A blob precisa de um tipo declarado para o `<img>` a desenhar, e o item guarda
 * só o NOME do anexo — o tamanho e o mime que `AnexoPersonagem` carrega vêm da
 * listagem de arquivos, que aqui não foi feita. Imagem é o único caso que chega
 * como imagem de item, e `image/png` é o palpite que o navegador corrige
 * sozinho quando erra o subtipo.
 */
function mimeDaImagem(arquivo: string): string {
  const extensao = arquivo.toLowerCase().split(".").pop() ?? "";

  const conhecidos: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    svg: "image/svg+xml",
  };

  return conhecidos[extensao] ?? "image/png";
}

/**
 * O item aberto: nome, descrição, quantidade, imagem — e o que só o mestre faz.
 *
 * Grava no `blur` de cada campo, e não num botão "salvar": é IPC para um arquivo
 * no disco da própria máquina, e o mestre que fecha a janela depois de digitar
 * não deveria perder o que escreveu. Mesma decisão da nota do jogador nesta
 * mesma janela.
 */
function ItemDialog({
  personagem,
  outros,
  item,
  onFechar,
  onChanged,
}: {
  personagem: Personagem;
  outros: Personagem[];
  item: ItemInventario | null;
  onFechar: () => void;
  onChanged: () => void;
}) {
  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="sm:max-w-md">
        {item ? (
          <ItemForm
            key={item.id}
            personagem={personagem}
            outros={outros}
            item={item}
            onFechar={onFechar}
            onChanged={onChanged}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ItemForm({
  personagem,
  outros,
  item,
  onFechar,
  onChanged,
}: {
  personagem: Personagem;
  outros: Personagem[];
  item: ItemInventario;
  onFechar: () => void;
  onChanged: () => void;
}) {
  const [atual, setAtual] = useState(item);
  const [escolhendo, setEscolhendo] = useState(false);

  const invalidar = useInventarioStore((state) => state.invalidar);

  async function salvar(patch: Parameters<typeof updateItem>[2]) {
    try {
      setAtual(await updateItem(personagem.id, item.id, patch));
      onChanged();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Falha ao salvar o item.",
      );
    }
  }

  async function apagar() {
    try {
      await removeItem(personagem.id, item.id);
      onChanged();
      onFechar();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Falha ao remover o item.",
      );
    }
  }

  async function mover(para: Personagem) {
    try {
      await moveItem(personagem.id, para.id, item.id);

      onChanged();
      // O destino também: se a ficha dele estiver aberta noutra janela, ela não
      // fica sabendo de nada sozinha. É o mesmo par de avisos que o arrasto
      // entre inventários dá, do outro lado.
      invalidar(para.id);

      onFechar();
      toast.success(`${atual.nome} foi para ${para.nome}.`);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Falha ao mover o item.",
      );
    }
  }

  return (
    <>
      <DialogTitle className="sr-only">{atual.nome}</DialogTitle>
      <DialogDescription className="sr-only">
        Nome, descrição, quantidade e imagem do item.
      </DialogDescription>

      <div className="flex gap-3">
        <div className="relative size-20 shrink-0 overflow-hidden rounded border">
          <ImagemDoItem
            key={chaveDaImagem(atual.imagem)}
            personagemId={personagem.id}
            imagem={atual.imagem}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Input
            defaultValue={atual.nome}
            aria-label="Nome do item"
            onBlur={(event) => void salvar({ nome: event.target.value })}
          />

          <div className="flex items-center gap-2">
            <Label htmlFor={`qtd-${item.id}`} className="text-xs">
              Quantidade
            </Label>
            <Input
              id={`qtd-${item.id}`}
              type="number"
              min={1}
              className="w-20"
              defaultValue={atual.quantidade}
              onBlur={(event) =>
                void salvar({ quantidade: Number(event.target.value) || 1 })
              }
            />
          </div>
        </div>
      </div>

      <Textarea
        defaultValue={atual.descricao}
        placeholder="O que é, o que faz, de onde veio."
        aria-label="Descrição do item"
        className="min-h-20 text-sm"
        onBlur={(event) => void salvar({ descricao: event.target.value })}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void escolherImagemDoDisco(personagem.id, item.id).then(
              (novo) => {
                if (!novo) return;
                setAtual(novo);
                onChanged();
              },
              (cause: unknown) =>
                toast.error(
                  cause instanceof Error ? cause.message : "Falha ao importar.",
                ),
            )
          }
        >
          <ImageIcon /> Do disco
        </Button>

        {/* Escolher do acervo, e não só importar: a mesma poção serve cinco
            personagens, e reimportá-la em cada um encheria a biblioteca de
            cópias do mesmo arquivo. */}
        <Button variant="outline" size="sm" onClick={() => setEscolhendo(true)}>
          <Package /> Do acervo
        </Button>

        <TransmitirItem personagemId={personagem.id} item={atual} />

        {outros.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm">
                  <Send /> Mover
                </Button>
              }
            />
            <DropdownMenuContent align="start">
              {outros.map((destino) => (
                <DropdownMenuItem
                  key={destino.id}
                  onClick={() => void mover(destino)}
                >
                  {destino.nome}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <DialogFooter className="sm:justify-between">
        <label className="flex items-center gap-2 text-xs">
          <Switch
            checked={atual.escondido}
            onCheckedChange={(escondido) => void salvar({ escondido })}
          />
          {atual.escondido ? (
            <EyeOff className="size-3.5" />
          ) : (
            <Eye className="size-3.5" />
          )}
          {atual.escondido ? "Escondido do jogador" : "O jogador vê"}
        </label>

        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={() => void apagar()}
        >
          <Trash2 /> Remover
        </Button>
      </DialogFooter>

      <AcervoPicker
        aberto={escolhendo}
        onFechar={() => setEscolhendo(false)}
        onEscolher={(assetId) => {
          setEscolhendo(false);
          void salvar({ imagem: { tipo: "asset", id: assetId } });
        }}
      />
    </>
  );
}

/**
 * Põe a imagem do item na frente de tudo, na mesa.
 *
 * Existe aqui, e não só na ficha, porque é o que dá sentido a esconder um item:
 * esconder só vale a pena se revelar for um ato. O mestre tira o anel do
 * escondido e o põe na TV no mesmo diálogo.
 *
 * Os dois braços da imagem viram evidência por caminhos diferentes, e quem os
 * resolve é `transmitirItem`. O que fica aqui é só saber se ESTE item é o que
 * está no ar — para o botão poder tirá-lo.
 */
/**
 * Pôr a imagem do item na frente de tudo, na mesa — e saber se é ela que está lá.
 *
 * Hook e não componente porque os dois lugares que transmitem desenham coisas
 * diferentes: o diálogo tem um botão com rótulo, e o quadro tem uma linha de
 * menu. O que eles compartilham é o rastreio de "o que está no ar é MEU", que
 * precisa de estado — e duplicá-lo faria o botão de um deles mentir sobre o
 * outro.
 */
function useTransmissaoDoItem(personagemId: string, item: ItemInventario) {
  const spotlight = useSpotlightStore((state) => state.spotlight);
  const transmit = useSpotlightStore((state) => state.transmit);
  const transmitShared = useSpotlightStore((state) => state.transmitShared);
  const clear = useSpotlightStore((state) => state.clear);

  const [meu, setMeu] = useState<string | null>(null);
  const noAr =
    Boolean(meu) && (spotlight?.assetId === meu || spotlight?.sharedId === meu);

  async function transmitir() {
    try {
      // O endereço sai antes de a evidência subir: pedi-lo pode falhar, e
      // falhar tem de virar aviso na tela do mestre, não evidência vazia na TV.
      const { assetId, sharedId } = await transmitirItem(personagemId, item);

      if (assetId) {
        setMeu(assetId);
        transmit(assetId);
        return;
      }

      if (sharedId) {
        setMeu(sharedId);
        transmitShared(sharedId, item.nome);
      }
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Falha ao transmitir.",
      );
    }
  }

  return { noAr, alternar: () => (noAr ? clear() : void transmitir()) };
}

function TransmitirItem({
  personagemId,
  item,
}: {
  personagemId: string;
  item: ItemInventario;
}) {
  const { noAr, alternar } = useTransmissaoDoItem(personagemId, item);

  if (!item.imagem) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={noAr ? "default" : "outline"}
            size="sm"
            aria-pressed={noAr}
            onClick={alternar}
          >
            {noAr ? <RadioTower /> : <Radio />}
            {noAr ? "No ar" : "Mostrar"}
          </Button>
        }
      />
      <TooltipContent>
        <p className="max-w-48">
          {noAr
            ? "No ar agora. Clique para tirar."
            : "Põe a imagem deste item na frente de tudo, na mesa."}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
