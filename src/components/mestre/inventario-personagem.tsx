"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  Minus,
  MoreHorizontal,
  PackageMinus,
  PackageOpen,
  Plus,
  Radio,
  RadioTower,
} from "lucide-react";
import { toast } from "sonner";

import { ImagemDoItem, imagemDesenhada } from "@/components/mestre/imagem-do-item";
import { abrirItem } from "@/components/mestre/acoes-do-item";
import { AdicionarAoInventario } from "@/components/mestre/adicionar-ao-inventario";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTokenDrag } from "@/hooks/use-token-drag";
import { useTransmissaoDoItem } from "@/hooks/use-transmissao-do-item";
import { t } from "@/lib/i18n/personagens";
import { fitInitialSize } from "@/lib/geometry/transform";
import { useVersaoInventario } from "@/lib/store/use-inventario-store";
import { itensMudaram } from "@/lib/store/use-itens-store";
import { useTokenDragStore } from "@/lib/store/use-token-drag-store";
import { entregarItem } from "@/lib/mestre/entregar-item";
import {
  listInventory,
  removeItem,
  updateItem,
} from "@/lib/vault/inventory";
import { cn } from "@/lib/utils";
import type { Personagem } from "@/types/character";
import { medidoresDoItem, type ItemInventario } from "@/types/inventory";

import { SecaoFicha } from "./secao-ficha";

/**
 * O que a ficha sabe do inventário: os itens, e o gesto de receber um.
 *
 * Mora na FICHA, e não na grade, desde que o inventário virou aba. A aba
 * fechada desmonta a grade, e duas coisas não podiam ir junto: a contagem no
 * rótulo da aba, que precisa dos itens, e o alvo de arrasto, que precisa estar
 * registrado para o item largado no rótulo chegar. Uma leitura só, levantada,
 * em vez de uma na ficha para contar e outra na grade para mostrar.
 */
export type InventarioDaFicha = {
  /** `null` enquanto lê. */
  itens: ItemInventario[] | null;
  /** O inventário mudou, e com ele o que a lista de arquivos deve esconder. */
  mudou: () => void;
};

export function useInventarioDaFicha(
  personagem: Personagem,
  /**
   * A lista de ARQUIVOS do personagem precisa reler.
   *
   * A foto que o jogador sobe para um item é um anexo, e a aba de arquivos
   * subtrai justamente os que algum item usa — ver `character_attachments`.
   * Sem este aviso, apagar um item devolvia a imagem dele à lista de arquivos só
   * depois de fechar e reabrir a ficha.
   */
  onChangedAnexos: () => void,
): InventarioDaFicha {
  const [itens, setItens] = useState<ItemInventario[] | null>(null);

  const recarregar = useCallback(() => {
    listInventory(personagem.id).then(setItens, (cause: unknown) => {
      toast.error(
        cause instanceof Error ? cause.message : t.inventario.falhaAoLer,
      );
      setItens([]);
    });
  }, [personagem.id]);

  // Releitura pedida de FORA, e é o mesmo caminho da de dentro: a ficha de
  // outro personagem recebeu um item que saiu daqui, a janela de Itens deu um
  // item a este, ou o catálogo trocou o nome de um que está aqui. Quem mudou
  // chama `itensMudaram`, e o número desta ficha sobe.
  const versao = useVersaoInventario(personagem.id);

  useEffect(recarregar, [recarregar, versao]);

  const mudou = useCallback(() => {
    itensMudaram([personagem.id]);
    onChangedAnexos();
  }, [personagem.id, onChangedAnexos]);

  /**
   * Este inventário como destino do gesto.
   *
   * Uma chave por personagem, porque há mais de uma ficha aberta ao mesmo
   * tempo e cada uma recebe na própria pasta. Quem recusa o item do próprio
   * dono é `aceita`, no store -- aqui a conferência é a do CONTEÚDO, que é a
   * verdade, e sobrevive à ficha ter fechado no meio do gesto.
   *
   * Quem se anuncia como alvo na tela é a grade E o rótulo da aba, pelos
   * mesmos `data-inventario`: os dois caem aqui.
   */
  useEffect(
    () =>
      useTokenDragStore
        .getState()
        .registrarAlvo(`inventario:${personagem.id}`, (arrasto) => {
          if (
            arrasto.fonte.tipo !== "item" ||
            arrasto.fonte.personagemId === personagem.id
          ) {
            return;
          }

          // Vindo de outra ficha muda de mão; de onde não é de ninguém, é dado.
          // Ver `entregarItem`.
          void entregarItem(
            arrasto.fonte.itemId,
            personagem,
            arrasto.fonte.personagemId,
          );
        }),
    [personagem],
  );

  return { itens, mudou };
}

/**
 * Um item está pairando sobre este inventário — de outra ficha, ou de onde não
 * é de ninguém.
 *
 * Booleano tirado do arrasto, e não estado próprio alimentado por
 * `dragenter`/`dragleave`: o gesto já sabe sobre que alvo o ponteiro está, e
 * quem decide se este inventário aceita é `aceita`, num lugar só. Antes eram
 * duas respostas para a mesma pergunta — a borda acendia pela marca de
 * módulo, o drop conferia o conteúdo — e elas podiam discordar.
 */
export function useRecebendoItem(personagemId: string): boolean {
  return useTokenDragStore((state) => {
    const destino = state.arrasto?.destino;

    return destino?.tipo === "inventario" && destino.personagemId === personagemId;
  });
}

/**
 * O inventário do personagem, na janela do mestre.
 *
 * A grade é de LISTA, não de slots fixos: os itens ocupam as posições em ordem
 * de chegada, e um quadro vazio no fim é onde se clica para somar outro. Slot
 * fixo pediria uma capacidade para o mestre configurar — uma pergunta que a mesa
 * não faz — e deixaria buraco no meio quando um item saísse.
 *
 * Mostra os escondidos, e é o único lugar que mostra: o escondido existe para o
 * mestre ver o que o jogador não vê, e o daemon o corta antes de responder ao
 * celular.
 *
 * É também ALVO de arrasto: o item vindo da ficha de outro personagem muda de
 * mão, e o vindo da janela de Itens é dado a este.
 */
export function InventarioPersonagem({
  personagem,
  inventario,
}: {
  personagem: Personagem;
  inventario: InventarioDaFicha;
}) {
  const { itens, mudou } = inventario;
  const recebendo = useRecebendoItem(personagem.id);

  // O botao de adicionar fica no cabecalho da secao, e nao aqui dentro: com a
  // secao fechada ele continua a mao, e por um item novo nao valer abrir a
  // grade antes. Ele abre o painel de criar ou escolher -- ver
  // `AdicionarAoInventario`.
  const adicionar = (
    <AdicionarAoInventario
      personagem={personagem}
      naMochila={itens ?? []}
      gatilho={
        <Button variant="ghost" size="icon-xs" aria-label={t.inventario.adicionar}>
          <Plus />
        </Button>
      }
    />
  );

  if (itens === null) {
    return (
      <SecaoFicha secao="inventario" titulo={t.inventario.titulo} acao={adicionar}>
        <p className="text-muted-foreground text-xs">{t.geral.lendo}</p>
      </SecaoFicha>
    );
  }

  return (
    <SecaoFicha
      secao="inventario"
      titulo={t.inventario.titulo}
      contagem={itens.length}
      acao={adicionar}
    >
      <Grade recebendo={recebendo} personagemId={personagem.id}>
        {itens.map((item) => (
          <ItemTile
            key={item.id}
            personagemId={personagem.id}
            item={item}
            onChanged={mudou}
          />
        ))}

        {/* UM vazio, no fim, e não os que completariam a linha: com `auto-fill`
            o número de colunas é decidido pelo navegador a cada largura, e o
            JavaScript não o conhece para contar quantos faltam. O quadro que
            importa é este — o lugar onde se clica para adicionar. Abre o mesmo
            painel do `+` do cabeçalho. */}
        <AdicionarAoInventario
          personagem={personagem}
          naMochila={itens}
          gatilho={
            <button
              type="button"
              aria-label={t.inventario.adicionar}
              className="text-muted-foreground hover:border-ring hover:text-foreground focus-visible:ring-ring flex aspect-square items-center justify-center rounded border border-dashed focus-visible:ring-2 focus-visible:outline-none"
            >
              <Plus className="size-4" aria-hidden />
            </button>
          }
        />
      </Grade>
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

/** Usado quando a imagem do item não disse a medida dela. */
const TAMANHO_DE_RESERVA = { x: 160, y: 160 };

/** As linhas do menu do quadro, menores que o padrão do componente. */
const ITEM_MENU =
  "text-xs whitespace-nowrap [&_svg:not([class*='size-'])]:size-3.5";

function Grade({
  recebendo,
  personagemId,
  children,
}: {
  /** Acende a borda: há um item pairando aqui. */
  recebendo: boolean;
  /** De quem é esta grade. O gesto lê daqui para saber quem recebe. */
  personagemId: string;
  children: React.ReactNode;
}) {
  return (
    <div
      // O alvo se anuncia por atributo, e não por handlers de arrasto nativo:
      // quem procura é o gesto próprio do quadro, com `elementFromPoint`. Ver
      // `useTokenDrag`.
      data-inventario
      data-personagem-id={personagemId}
      className={cn(
        "grid gap-1.5 rounded-md border border-transparent transition-colors motion-reduce:transition-none",
        // A borda é do CONTÊINER e não de um quadro: o alvo é o inventário
        // inteiro, e não uma posição dentro dele -- a ordem dos itens é a de
        // chegada, e soltar entre dois não significa nada.
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
 * ARRASTÁVEL sempre: para outra ficha ele muda de mão, para um ponto ou o
 * handout fica guardado ali, e para o mapa — só com imagem, que é o que a peça
 * desenha — vira peça.
 */
function ItemTile({
  personagemId,
  item,
  onChanged,
}: {
  personagemId: string;
  item: ItemInventario;
  onChanged: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);

  const [menuAberto, setMenuAberto] = useState(false);

  const arrastar = useTokenDrag();

  // O quadro desbota enquanto o item está no ar, como a linha do personagem:
  // ele está na mão, e vê-lo inteiro nos dois lugares contradiz o gesto.
  const naMao = useTokenDragStore(
    (state) =>
      state.arrasto?.fonte.tipo === "item" &&
      state.arrasto.fonte.personagemId === personagemId &&
      state.arrasto.fonte.itemId === item.id,
  );

  const { noAr, alternar: alternarTransmissao } = useTransmissaoDoItem(item);

  async function mexer(quanto: number) {
    // Zero tiraria do inventário, e o Rust eleva para 1 — então a subtração
    // para de descer aqui. Quem chegou a zero quer o "Tirar", no menu ao lado.
    const alvo = Math.max(1, item.quantidade + quanto);
    if (alvo === item.quantidade) return;

    setOcupado(true);

    try {
      await updateItem(personagemId, item.id, { quantidade: alvo });
      onChanged();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : t.inventario.falhaQuantidade,
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
        cause instanceof Error ? cause.message : t.inventario.falhaAoMudar,
      );
    } finally {
      setOcupado(false);
    }
  }

  /**
   * Tira daqui, sem perguntar.
   *
   * Perguntava quando tirar era apagar: o item morava só nesta mochila, e ia
   * embora com a foto. Agora ele continua na campanha — na janela de Itens, e
   * com quem mais o tiver —, e voltar é arrastá-lo de lá de novo.
   */
  async function tirar() {
    try {
      await removeItem(personagemId, item.id);
      onChanged();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : t.inventario.falhaAoRemover,
      );
    }
  }

  return (
    <div
      className={cn(
        "group/item bg-card relative aspect-square cursor-grab overflow-hidden rounded border select-none active:cursor-grabbing",
        // Escondido tem marca PERMANENTE, e não só o ícone no canto: o mestre
        // olha a grade inteira de relance para saber o que a mesa já viu, e um
        // ícone de 12px não responde isso à distância.
        item.escondido && "border-dashed",
        naMao && "opacity-40",
      )}
      // O arrasto vai no contêiner e não no botão: o que se arrasta é o item
      // inteiro, não a imagem dentro dele. O clique que abre o item continua
      // valendo — o gesto só levanta depois que o ponteiro anda, e a partir daí
      // o clique do fim é engolido.
      //
      // Gesto próprio e não o arrasto do navegador: é o que permite a sombra no
      // mapa e a roda escolhendo o tamanho no ar. Ver `useTokenDrag`.
      onPointerDown={(event) => {
        // A imagem do quadro é a prévia: ela já está resolvida na tela, e pedir
        // de novo ao disco travaria o `pointerdown`, que é síncrono. A medida é
        // a da MINIATURA quando a imagem é do acervo: a proporção é a
        // verdadeira, e quem decide o tamanho é a roda.
        const desenhada = imagemDesenhada(event.currentTarget);

        const tamanho =
          desenhada && desenhada.largura > 0 && desenhada.altura > 0
            ? fitInitialSize(desenhada.largura, desenhada.altura)
            : TAMANHO_DE_RESERVA;

        arrastar(event, {
          fonte: {
            tipo: "item",
            itemId: item.id,
            personagemId,
            url: desenhada?.url,
          },
          largura: tamanho.x,
          altura: tamanho.y,
        });
      }}
    >
      {/* O botão preenche o quadro e é o que abre o item. Fica ATRÁS dos
          controles, que são irmãos com `z` maior: aninhar botão dentro de botão
          é HTML inválido, e o clique no `+` subiria para abrir o diálogo. */}
      <button
        type="button"
        onClick={() => abrirItem(item, personagemId)}
        aria-label={item.escondido ? t.inventario.escondido(item.nome) : item.nome}
        title={t.inventario.arrasteParaAMesa(item.nome)}
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
          imagem={item.imagem}
          className="absolute inset-0 size-full object-cover opacity-90 group-hover:opacity-100"
        />

        <span className="relative line-clamp-2 text-[10px] leading-tight font-medium wrap-break-word">
          {item.nome}
        </span>

        <BarraDoPrimeiroMedidor item={item} />
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
            rotulo={t.inventario.menosUm(item.nome)}
            Icone={Minus}
            desabilitado={ocupado || item.quantidade <= 1}
            onClick={() => void mexer(-1)}
          />

          <span className="min-w-3 text-center text-[10px] leading-4 font-semibold tabular-nums">
            {item.quantidade}
          </span>

          <Passo
            rotulo={t.inventario.maisUm(item.nome)}
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
                    ? t.inventario.mostrarAoJogador(item.nome)
                    : t.inventario.esconderDoJogador(item.nome)
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
                ? t.inventario.jogadorNaoVe
                : t.inventario.jogadorVe}
            </p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Abrir, transmitir e tirar atrás dos três pontos, e não como botões
          soltos: com a tira cheia eram quatro alvos disputando um quadro de 80
          pixels, e nenhum destes é gesto de repetição. O que ficou à vista é o
          que se repete: o olho e a quantidade. */}
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
                aria-label={t.inventario.maisAcoes(item.nome)}
                className="bg-background/90 hover:bg-background size-5 border shadow-sm"
              >
                <MoreHorizontal />
              </Button>
            }
          />

          {/* `text-xs` e rótulos curtos: o menu nasce de um quadro de 80
              pixels, e um popup mais largo que o próprio item era o que
              "Mostrar na mesa" em `text-sm` produzia. O ícone diz o resto. */}
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className={ITEM_MENU}
              onClick={() => abrirItem(item, personagemId)}
            >
              <PackageOpen />
              {t.inventario.abrir}
            </DropdownMenuItem>

            <DropdownMenuItem className={ITEM_MENU} onClick={alternarTransmissao}>
              {noAr ? <RadioTower /> : <Radio />}
              {noAr ? t.inventario.tirar : t.inventario.mostrar}
            </DropdownMenuItem>

            <DropdownMenuItem className={ITEM_MENU} onClick={() => void tirar()}>
              <PackageMinus />
              {t.inventario.remover}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/**
 * O primeiro medidor do item NESTA mochila, numa barra da largura do quadro.
 *
 * Só o primeiro, e só a proporção: o quadro tem 80 pixels, e o que ele precisa
 * dizer de relance é "a varinha está quase sem carga". O número e os outros
 * medidores estão na janela do item, a um clique.
 */
function BarraDoPrimeiroMedidor({ item }: { item: ItemInventario }) {
  const [medidor] = medidoresDoItem(item, item.atuais);
  if (!medidor) return null;

  return (
    <span
      className="relative h-1 w-full overflow-hidden rounded-full bg-black/40"
      title={`${medidor.nome} ${medidor.atual}/${medidor.maximo}`}
    >
      <span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: `${(medidor.atual / medidor.maximo) * 100}%`,
          backgroundColor: medidor.cor,
        }}
      />
    </span>
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

