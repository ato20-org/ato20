"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  ImagePlus,
  Minus,
  PackageMinus,
  Pencil,
  Plus,
  Radio,
  RadioTower,
  Trash2,
  X,
} from "lucide-react";
import { create } from "zustand";
import { toast } from "sonner";

import {
  apagarDaCampanha,
  consumirPedidoDeNomear,
} from "@/components/mestre/acoes-do-item";
import { confirmarApagar } from "@/components/mestre/confirmar-apagar";
import { DadosDaExpressao } from "@/components/mestre/rolagem-do-detalhe";
import { DadoEstatico } from "@/components/mestre/saquinho-dados";
import { ImagemDoItem } from "@/components/mestre/imagem-do-item";
import {
  LinhaDeMedidor,
  SeloDoMedidor,
  useArrastoDoAtual,
  type PatchDaLinha,
} from "@/components/mestre/linha-de-medidor";
import { PainelVazio } from "@/components/mestre/painel-vazio";
import { DescricaoDoItem } from "@/components/playground/descricao-do-item";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCharacters } from "@/hooks/use-characters";
import { useFecharJanela } from "@/hooks/use-fechar-janela";
import { useListReorder } from "@/hooks/use-list-reorder";
import { useTransmissaoDoItem } from "@/hooks/use-transmissao-do-item";
import { t } from "@/lib/i18n/itens";
import { textoDoMedidor } from "@/lib/medidor";
import { rolarExpressao } from "@/lib/mestre/dados-actions";
import { rolagemNoValor } from "@/lib/mestre/rolagem-no-valor";
import { tipoDado } from "@/types/dado";
import {
  itensMudaram,
  useItemDaCampanha,
  useItens,
  useItensStore,
} from "@/lib/store/use-itens-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { CORES_LAPIS } from "@/lib/store/use-tool-store";
import { chaveDe } from "@/lib/store/use-window-store";
import { cn } from "@/lib/utils";
import { removeItem, updateItem } from "@/lib/vault/inventory";
import { editarItem, escolherImagemDoItem } from "@/lib/vault/itens";
import { MAX_MEDIDORES, type Medidor, type ModeloDeMedidor } from "@/types/character";
import {
  medidoresDoItem,
  type AtributoDoItem,
  type Item,
  type PatchItemDaCampanha,
  type Portador,
} from "@/types/inventory";

/** Quantos atributos cabem num item. Espelha `MAX_ATRIBUTOS_DO_ITEM`. */
const MAX_ATRIBUTOS = 24;

/** O máximo com que um medidor novo nasce: o mesmo dos modelos da campanha. */
const MAXIMO_INICIAL = 10;

/** O teto do valor de um medidor. Espelha `MAX_VALOR`, no Rust. */
const MAX_VALOR = 999;

/**
 * Valor de atributo a partir do qual ele ocupa a linha inteira: "1d8" cabe em
 * meia largura, "1d8+2 cortante, ignora resistência" não.
 */
const VALOR_LONGO = 22;

/**
 * O fundo desfocado some de cima para baixo: a cor do item fica atrás do nome e
 * da miniatura, e não chega aos atributos, onde a leitura é o que importa.
 * Máscara, e não um degradê pintado, porque a janela tem um fundo flutuando e
 * outro atracada, e um degradê precisaria saber qual.
 */
const MASCARA_DO_FUNDO: CSSProperties = {
  maskImage: "linear-gradient(to bottom, black 30%, transparent 100%)",
  WebkitMaskImage: "linear-gradient(to bottom, black 30%, transparent 100%)",
};

/**
 * Um item: o card dele, onde ele se lê E se escreve.
 *
 * Não há tela de editar. O nome vira campo no clique, a descrição se escreve no
 * "mostrar mais", o atributo vira campo no lápis dele, e o medidor é a linha da
 * ficha -- o número abre o atual e o máximo, a barra se arrasta. Uma tela de
 * editar seria a mesma coisa em forma de formulário, e o mestre teria de
 * escolher entre ler o item e mexer nele.
 *
 * Compacto de propósito: a imagem é miniatura, e a COR dela vira o fundo
 * desfocado do alto do card -- é o que dá cara ao item sem gastar a janela
 * num banner. A descrição fica logo abaixo do nome, cortada em três linhas;
 * o resto mora no "mostrar mais".
 *
 * Aberto de uma MOCHILA (`personagemId`), ele mostra o item como está lá: a
 * quantidade e o olho daquela mochila, e os medidores com o valor dela -- a
 * espada do Edgar em 7/10. Aberto do catálogo, o item como a campanha o define,
 * com os medidores cheios.
 */
export function ItemBody({
  itemId,
  personagemId,
}: {
  itemId: string;
  personagemId?: string;
}) {
  const itens = useItens();
  const item = useItemDaCampanha(itemId);
  const { personagens } = useCharacters();
  const fecharJanela = useFecharJanela();

  const entrada = useItensStore((state) =>
    personagemId
      ? state.portadores.find(
          (portador) => portador.itemId === itemId && portador.personagemId === personagemId,
        )
      : undefined,
  );
  const dono = personagemId
    ? personagens?.find((personagem) => personagem.id === personagemId)
    : undefined;

  /** O "mostrar mais": fechado, lendo, ou com a descrição em edição. */
  const [modal, setModal] = useState<"ler" | "escrever" | null>(null);

  if (itens === null) {
    return <p className="text-muted-foreground p-3 text-xs">{t.janela.lendo}</p>;
  }

  if (!item) {
    return (
      <PainelVazio conteudo={{ tipo: "item", itemId }}>{t.ver.naoExisteMais}</PainelVazio>
    );
  }

  // Da mochila, só enquanto o item está nela: tirado de lá com a janela aberta,
  // ele volta a ser o item da campanha, e a janela diz por quê.
  const naMochila = dono && entrada ? { dono, entrada } : null;
  const saiuDaMochila = Boolean(personagemId && dono && !entrada);

  function fechar() {
    fecharJanela(chaveDe({ tipo: "item", itemId, personagemId }));
  }

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <article>
          <Cabecalho
            item={item}
            onMostrarMais={() => setModal("ler")}
            onEscrever={() => setModal("escrever")}
          />

          <div className="space-y-4 px-4 pb-4">
            {naMochila ? (
              <NaMochila
                item={item}
                personagemId={naMochila.dono.id}
                nome={naMochila.dono.nome}
                entrada={naMochila.entrada}
                onTirou={fechar}
              />
            ) : saiuDaMochila ? (
              <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs">
                {t.ver.saiuDaMochila(dono!.nome)}
              </p>
            ) : null}

            <Atributos
              item={item}
              rotuloDaRolagem={(atributo) =>
                [naMochila?.dono.nome, item.nome, atributo.nome].filter(Boolean).join(" · ")
              }
            />

            <Medidores
              item={item}
              mochila={naMochila ? { personagemId: naMochila.dono.id, entrada: naMochila.entrada } : null}
            />
          </div>
        </article>
      </ScrollArea>

      {/* Sem pé: o "mostrar na mesa" e o apagar moram no cabeçalho da janela,
          ao lado do fechar -- ver `AcoesDaJanela` --, e dar o item é o arrasto
          até o personagem. O card inteiro fica para o item. */}

      <MostrarMais item={item} modo={modal} onModo={setModal} />
    </>
  );
}

/**
 * Mostrar o item na mesa, como ícone: o que mora no cabeçalho da janela, ao
 * lado do fechar. Ver `AcoesDaJanela`.
 *
 * Aberto de uma mochila, vai com os medidores dela -- a TV mostra a varinha do
 * Edgar com as cargas DELE.
 */
export function TransmitirItemNoTopo({
  itemId,
  personagemId,
}: {
  itemId: string;
  personagemId?: string;
}) {
  const item = useItemDaCampanha(itemId);
  const atuais = useItensStore((state) =>
    personagemId
      ? state.portadores.find(
          (portador) => portador.itemId === itemId && portador.personagemId === personagemId,
        )?.atuais
      : undefined,
  );
  const { noAr, alternar } = useTransmissaoDoItem(item, atuais);

  if (!item) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={noAr ? "default" : "ghost"}
            size="icon-xs"
            aria-pressed={noAr}
            aria-label={noAr ? t.transmitir.tirar : t.transmitir.mostrar}
            className={cn(noAr && "bg-amber-500 text-amber-950 hover:bg-amber-500/80")}
            onClick={alternar}
          >
            {noAr ? <RadioTower /> : <Radio />}
          </Button>
        }
      />
      <TooltipContent>
        <p className="max-w-56">{noAr ? t.transmitir.noArAgora : t.transmitir.dica}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Apagar o item da campanha, como ícone no cabeçalho da janela. Ver
 * `AcoesDaJanela`.
 *
 * No cabeçalho, e não no pé do card: era o único botão que sobrava lá, e um pé
 * inteiro para um gesto que se faz uma vez por item gastava a altura que o
 * card economizou. Vermelho só sob o cursor, como a lixeira de toda linha do
 * Mestre -- e com a pergunta antes, porque não tem volta.
 */
export function ApagarItemNoTopo({
  itemId,
  personagemId,
}: {
  itemId: string;
  personagemId?: string;
}) {
  const item = useItemDaCampanha(itemId);
  const fecharJanela = useFecharJanela();

  if (!item) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t.ver.apagar}
            className="hover:text-destructive hover:bg-destructive/15"
            onClick={() =>
              void apagarDaCampanha(item).then(
                (apagou) => apagou && fecharJanela(chaveDe({ tipo: "item", itemId, personagemId })),
              )
            }
          >
            <Trash2 />
          </Button>
        }
      />
      <TooltipContent>{t.ver.apagar}</TooltipContent>
    </Tooltip>
  );
}

/**
 * A imagem do item desfocada atrás do cabeçalho da janela. Ver `FundoDaJanela`.
 *
 * A mesma do alto do card, e MAIS forte que ela: o cabeçalho é uma faixa de 40
 * pixels, e é tudo o que sobra da janela recolhida -- ali a cor é o que diz que
 * aquela é a Serpente de Fogo, e não outra janela qualquer.
 */
export function FundoDoItem({ itemId }: { itemId: string }) {
  const item = useItemDaCampanha(itemId);
  if (!item?.imagem) return null;

  return <ImagemDesfocada item={item} forte />;
}

/**
 * A imagem do item como cor: a miniatura ampliada e desfocada.
 *
 * A MINIATURA, e não a imagem grande: desfocadas, as duas ficam iguais, e a de
 * 160 pixels custa alguns KB. Contida, de propósito -- opacidade baixa e um véu
 * escuro por cima: é a cor do item que tem de aparecer, e não a imagem
 * competindo com o texto. Mais forte que isto, o fundo tomava o card.
 */
function ImagemDesfocada({ item, forte = false }: { item: Item; forte?: boolean }) {
  return (
    <>
      <ImagemDoItem
        imagem={item.imagem}
        className={cn(
          "absolute inset-0 size-full scale-125 object-cover blur-2xl",
          forte ? "opacity-80 saturate-150" : "opacity-50 saturate-125",
        )}
        classeDoIcone="hidden"
      />
      <div className={cn("absolute inset-0", forte ? "bg-black/25" : "bg-black/30")} />
    </>
  );
}

// --- o alto do card ---------------------------------------------------------

/**
 * O alto do card: o fundo desfocado da própria imagem, a miniatura, o nome e o
 * começo da descrição.
 *
 * O fundo é a MINIATURA ampliada e desfocada, e não a imagem grande: desfocada,
 * as duas ficam iguais, e a de 160 pixels custa alguns KB.
 */
function Cabecalho({
  item,
  onMostrarMais,
  onEscrever,
}: {
  item: Item;
  onMostrarMais: () => void;
  onEscrever: () => void;
}) {
  return (
    <header className="relative overflow-hidden">
      {item.imagem ? (
        <div aria-hidden className="pointer-events-none absolute inset-0" style={MASCARA_DO_FUNDO}>
          <ImagemDesfocada item={item} />
        </div>
      ) : null}

      <div className="relative flex flex-col gap-3 p-4">
        <Miniatura item={item} />

        <div className="space-y-1.5">
          <NomeDoItem item={item} />
          <ResumoDaDescricao item={item} onMostrarMais={onMostrarMais} onEscrever={onEscrever} />
        </div>
      </div>
    </header>
  );
}

/**
 * A imagem do item, que é também o botão de trocá-la.
 *
 * Trocar a imagem troca a das PEÇAS deste item no mapa: a peça desenha o asset
 * que tinha quando foi posta, e sem isto o baú do mapa continuaria com a cara
 * antiga. Ver `trocarImagemDoItem`.
 */
function Miniatura({ item }: { item: Item }) {
  const [escolhendo, setEscolhendo] = useState(false);

  async function escolher() {
    setEscolhendo(true);

    try {
      const novo = await escolherImagemDoItem(item.id);

      if (novo?.imagem?.tipo === "asset") {
        useSceneStore.getState().trocarImagemDoItem(item.id, novo.imagem.id);
      }

      if (novo) itensMudaram();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t.falhas.imagem);
    } finally {
      setEscolhendo(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void escolher()}
      disabled={escolhendo}
      aria-label={item.imagem ? t.imagem.trocarDoItem : t.imagem.escolherDoItem}
      title={item.imagem ? t.imagem.trocar : t.imagem.escolherDoDisco}
      className={cn(
        "group focus-visible:ring-ring relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border shadow-lg focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60",
        item.imagem
          ? "border-white/15"
          : "text-muted-foreground hover:text-foreground hover:border-ring border-dashed",
      )}
    >
      {item.imagem ? (
        <>
          <ImagemDoItem
            imagem={item.imagem}
            className="absolute inset-0 size-full object-cover"
          />

          <span className="absolute inset-0 hidden flex-col items-center justify-center gap-0.5 bg-black/60 text-white group-hover:flex group-focus-visible:flex">
            <ImagePlus className="size-4" aria-hidden />
            <span className="text-[10px] leading-none font-medium">{t.imagem.trocarCurto}</span>
          </span>
        </>
      ) : (
        <span className="flex flex-col items-center gap-1">
          <ImagePlus className="size-5" aria-hidden />
          <span className="text-[10px] leading-none font-medium">{t.imagem.por}</span>
        </span>
      )}
    </button>
  );
}

/**
 * O pedido de nomear o item que acabou de nascer, lido como estado.
 *
 * Ver `abrirItemNovo`: o pedido vale uma vez. Aqui ele vira um booleano que o
 * nome lê para nascer já em edição, e que se apaga quando o mestre sai do campo
 * -- sem o campo reabrindo ao remontar a janela.
 */
const useNomeando = create<{ itemId: string | null }>(() => ({ itemId: null }));

/**
 * O nome, e o campo dele no clique.
 *
 * O lápis aparece no hover, e o próprio nome é o alvo: quem quer trocar o nome
 * mira no nome. Enter grava, Escape desiste, e sair do campo grava -- o mesmo
 * de todo campo de nome do Mestre.
 */
function NomeDoItem({ item, className }: { item: Item; className?: string }) {
  const [editando, setEditando] = useState(false);
  // O pedido do "criar": consumido uma vez, e guardado aqui até o mestre sair
  // do campo.
  const pedido = useNomeando((state) => state.itemId === item.id);
  const [rascunho, setRascunho] = useState<string | null>(null);
  const descartar = useRef(false);

  useEffect(() => {
    if (consumirPedidoDeNomear(item.id)) useNomeando.setState({ itemId: item.id });
  }, [item.id]);

  const aberto = editando || pedido;

  function sair() {
    const valor = descartar.current ? null : rascunho;
    descartar.current = false;
    setRascunho(null);
    setEditando(false);
    if (pedido) useNomeando.setState({ itemId: null });

    const limpo = valor?.trim();
    if (!limpo || limpo === item.nome) return;

    void salvarNoCatalogo(item.id, { nome: limpo });
  }

  if (aberto) {
    return (
      <Input
        autoFocus
        aria-label={t.ver.nome}
        value={rascunho ?? item.nome}
        className={cn("h-9 text-lg font-semibold", className)}
        onFocus={(evento) => evento.currentTarget.select()}
        onChange={(evento) => setRascunho(evento.target.value)}
        onBlur={sair}
        onKeyDown={(evento) => {
          if (evento.key === "Escape") descartar.current = true;
          if (evento.key === "Enter" || evento.key === "Escape") {
            // A janela e o diálogo também escutam o Escape para fechar; aqui a
            // tecla é do campo.
            evento.stopPropagation();
            evento.currentTarget.blur();
          }
        }}
      />
    );
  }

  return (
    <div className="group flex min-w-0 items-center gap-1">
      <button
        type="button"
        className={cn(
          "min-w-0 cursor-text text-left text-xl leading-tight font-semibold text-balance drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]",
          className,
        )}
        onClick={() => setEditando(true)}
      >
        {item.nome}
      </button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={t.ver.renomear}
        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        onClick={() => setEditando(true)}
      >
        <Pencil />
      </Button>
    </div>
  );
}

/**
 * O começo da descrição, em três linhas, e o "mostrar mais" quando passa disso.
 *
 * Cortado pela ALTURA, e não por caracteres: a descrição é Markdown, e uma
 * lista de três itens curtos e um parágrafo de três linhas longas ocupam o
 * mesmo lugar com números de caracteres muito diferentes. Quem decide se há
 * "mais" é a medida do que foi desenhado.
 *
 * O lápis no hover abre o "mostrar mais" já escrevendo: a descrição inteira se
 * edita onde ela se lê inteira, e não num campo de três linhas.
 */
function ResumoDaDescricao({
  item,
  onMostrarMais,
  onEscrever,
}: {
  item: Item;
  onMostrarMais: () => void;
  onEscrever: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [transborda, setTransborda] = useState(false);

  useEffect(() => {
    const elemento = caixa.current;
    if (!elemento) return;

    const medir = () => setTransborda(elemento.scrollHeight > elemento.clientHeight + 1);
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);

    return () => observador.disconnect();
  }, [item.descricao]);

  if (!item.descricao) {
    return (
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground text-sm italic"
        onClick={onEscrever}
      >
        {t.ver.adicionarDescricao}
      </button>
    );
  }

  return (
    <div className="group relative">
      <div
        ref={caixa}
        className="text-foreground/85 max-h-[4.6rem] overflow-hidden pr-6"
        style={
          transborda
            ? {
                maskImage: "linear-gradient(to bottom, black 55%, transparent)",
                WebkitMaskImage: "linear-gradient(to bottom, black 55%, transparent)",
              }
            : undefined
        }
      >
        <DescricaoDoItem texto={item.descricao} className="text-sm leading-snug" />
      </div>

      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={t.ver.editarDescricao}
        className="absolute top-0 right-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        onClick={onEscrever}
      >
        <Pencil />
      </Button>

      {transborda ? (
        <button
          type="button"
          className="mt-0.5 inline-flex items-center gap-0.5 text-xs font-medium underline-offset-2 hover:underline"
          onClick={onMostrarMais}
        >
          {t.ver.mostrarMais}
          <ChevronDown className="size-3" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/**
 * O "mostrar mais": o nome e a descrição inteira, com a imagem do item
 * desfocada e escurecida ao fundo.
 *
 * Modal, e não a janela crescendo: a descrição longa é leitura, e merece a
 * frente da tela -- com o resto do item (atributos, medidores) fora dela. É
 * também onde a descrição se ESCREVE, pelo lápis: o mestre escreve vendo como
 * ela vai ficar, no mesmo lugar em que vai lê-la.
 *
 * O fundo mais escuro que o do card: aqui o texto é longo, e a cor do item é
 * moldura, não fundo de leitura.
 */
function MostrarMais({
  item,
  modo,
  onModo,
}: {
  item: Item;
  modo: "ler" | "escrever" | null;
  onModo: (modo: "ler" | "escrever" | null) => void;
}) {
  return (
    <Dialog open={modo !== null} onOpenChange={(aberto) => !aberto && onModo(null)}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        {item.imagem ? (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <ImagemDoItem
              imagem={item.imagem}
              className="absolute inset-0 size-full scale-125 object-cover opacity-50 blur-3xl saturate-150"
              classeDoIcone="hidden"
            />
            <div className="absolute inset-0 bg-black/70" />
          </div>
        ) : null}

        <div className="relative flex max-h-[80vh] min-h-0 flex-col gap-3 p-6">
          <DialogTitle className="pr-8">
            <NomeDoItem item={item} className="text-2xl" />
          </DialogTitle>
          <DialogDescription className="sr-only">{t.ver.sobreOModal}</DialogDescription>

          {modo === "escrever" ? (
            <EscreverDescricao item={item} onSair={() => onModo("ler")} />
          ) : (
            <>
              <div className="min-h-0 overflow-y-auto pr-1">
                {item.descricao ? (
                  <DescricaoDoItem texto={item.descricao} className="text-foreground/90 text-[15px]" />
                ) : (
                  <p className="text-muted-foreground text-sm italic">{t.ver.semDescricao}</p>
                )}
              </div>

              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => onModo("escrever")}>
                  <Pencil /> {t.ver.editarDescricao}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A descrição em edição: um campo grande, e o salvar explícito.
 *
 * Salvar e cancelar, e não gravar no `blur` como o nome: a descrição é texto
 * longo, escrito com calma, e o clique fora que fecha o modal por engano não
 * pode ser o mesmo gesto que grava meia frase.
 */
function EscreverDescricao({ item, onSair }: { item: Item; onSair: () => void }) {
  const [texto, setTexto] = useState(item.descricao);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    const gravou = await salvarNoCatalogo(item.id, { descricao: texto });
    setSalvando(false);
    if (gravou) onSair();
  }

  return (
    <>
      <Textarea
        autoFocus
        value={texto}
        placeholder={t.ver.descricaoExemplo}
        aria-label={t.ver.descricao}
        className="min-h-56 bg-black/30 text-sm"
        onChange={(evento) => setTexto(evento.target.value)}
        onKeyDown={(evento) => {
          // Ctrl+Enter salva, como em todo campo longo do Mestre.
          if (evento.key === "Enter" && (evento.ctrlKey || evento.metaKey)) void salvar();
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-[10px]">{t.ver.markdown}</p>
        <div className="flex gap-1.5">
          <Button variant="ghost" size="sm" onClick={onSair} disabled={salvando}>
            {t.ver.cancelar}
          </Button>
          <Button size="sm" onClick={() => void salvar()} disabled={salvando}>
            {t.ver.salvar}
          </Button>
        </div>
      </div>
    </>
  );
}

// --- a mochila ----------------------------------------------------------------

/**
 * O que é DESTA mochila: quanto o personagem tem, se o jogador vê, e o tirar
 * daqui.
 *
 * Uma faixa só, abaixo do alto do card: a quantidade e o olho são do
 * personagem, e o resto do card é do item.
 */
function NaMochila({
  item,
  personagemId,
  nome,
  entrada,
  onTirou,
}: {
  item: Item;
  personagemId: string;
  nome: string;
  entrada: Portador;
  onTirou: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);

  async function mexer(patch: { quantidade?: number; escondido?: boolean }) {
    setOcupado(true);

    try {
      await updateItem(personagemId, item.id, patch);
      itensMudaram([personagemId]);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t.falhas.salvar);
    } finally {
      setOcupado(false);
    }
  }

  async function tirar() {
    try {
      await removeItem(personagemId, item.id);
      itensMudaram([personagemId]);
      onTirou();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t.falhas.tirar);
    }
  }

  return (
    <div className="bg-muted/30 flex items-center gap-2 rounded-lg border px-3 py-1.5">
      <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
        {t.ver.naMochilaDe}{" "}
        <span className="text-foreground font-medium">{nome}</span>
      </span>

      <div className="flex items-center rounded-md border">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t.ver.menosUm(item.nome)}
          disabled={ocupado || entrada.quantidade <= 1}
          onClick={() => void mexer({ quantidade: entrada.quantidade - 1 })}
        >
          <Minus />
        </Button>
        <span className="min-w-6 text-center text-xs font-semibold tabular-nums">
          {entrada.quantidade}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t.ver.maisUm(item.nome)}
          disabled={ocupado}
          onClick={() => void mexer({ quantidade: entrada.quantidade + 1 })}
        >
          <Plus />
        </Button>
      </div>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant={entrada.escondido ? "secondary" : "ghost"}
              size="icon-xs"
              aria-pressed={entrada.escondido}
              aria-label={entrada.escondido ? t.ver.mostrarAoJogador : t.ver.esconderDoJogador}
              disabled={ocupado}
              onClick={() => void mexer({ escondido: !entrada.escondido })}
            >
              {entrada.escondido ? <EyeOff /> : <Eye />}
            </Button>
          }
        />
        <TooltipContent>
          <p className="max-w-52">{entrada.escondido ? t.ver.jogadorNaoVe : t.ver.jogadorVe}</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t.ver.tirarDe(nome)}
              disabled={ocupado}
              onClick={() => void tirar()}
            >
              <PackageMinus />
            </Button>
          }
        />
        <TooltipContent>{t.ver.tirarDe(nome)}</TooltipContent>
      </Tooltip>
    </div>
  );
}

// --- atributos -----------------------------------------------------------------

/** O título de uma seção, com o fio que a separa e a ação dela à direita. */
function Secao({
  titulo,
  acao,
  children,
}: {
  titulo: string;
  acao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-muted-foreground after:bg-border flex flex-1 items-center gap-2 text-[10px] font-semibold tracking-[0.12em] uppercase after:h-px after:flex-1">
          {titulo}
        </h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

/**
 * A lista de um item enquanto o disco não responde.
 *
 * O rascunho é preso à lista de onde saiu, como em `useArrastoDoAtual`: quando o
 * catálogo relido chega, a lista é outra e o rascunho perde a validade sozinho.
 * Sem isto, a linha recém-apagada voltava por um quadro, e duas edições mais
 * rápidas que a volta do IPC liam a mesma lista velha -- e a segunda apagava a
 * primeira.
 */
function useListaDoItem<T>(fonte: T[] | undefined): [T[], (proxima: T[]) => void] {
  const [rascunho, setRascunho] = useState<{ de: T[] | undefined; lista: T[] } | null>(null);
  const lista = rascunho && rascunho.de === fonte ? rascunho.lista : (fonte ?? []);

  return [lista, (proxima) => setRascunho({ de: fonte, lista: proxima })];
}

/**
 * Os atributos: os que têm valor numa grade compacta, e os que são só nome como
 * TAGS.
 *
 * Duas formas para a mesma coisa, porque são duas leituras: "Dano 1d8+2" é uma
 * pergunta com resposta, e "Fogo", "Duas mãos", "Mágico" são o que o item é. Um
 * quadro com rótulo e um traço no lugar do valor seria espaço gasto para dizer
 * uma palavra.
 *
 * Tudo se escreve aqui: o lápis do atributo abre os campos dele no lugar, a tag
 * se abre no clique, e o "adicionar" é um campo só -- "Fogo" vira tag, "Dano:
 * 1d8" vira atributo com valor.
 */
function Atributos({
  item,
  rotuloDaRolagem,
}: {
  item: Item;
  rotuloDaRolagem: (atributo: AtributoDoItem) => string;
}) {
  const [lista, definir] = useListaDoItem(item.atributos);
  const [editando, setEditando] = useState<string | null>(null);
  const [adicionando, setAdicionando] = useState(false);

  function gravar(proxima: AtributoDoItem[]) {
    definir(proxima);
    void salvarNoCatalogo(item.id, { atributos: proxima });
  }

  function trocar(id: string, novo: AtributoDoItem | null) {
    gravar(
      novo
        ? lista.map((atributo) => (atributo.id === id ? novo : atributo))
        : lista.filter((atributo) => atributo.id !== id),
    );
    setEditando(null);
  }

  const comValor = lista.filter((atributo) => atributo.valor.trim() !== "");
  const tags = lista.filter((atributo) => atributo.valor.trim() === "");
  const cheio = lista.length >= MAX_ATRIBUTOS;

  return (
    <Secao
      titulo={t.ver.atributos}
      acao={
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t.ver.adicionarAtributo}
          disabled={cheio}
          onClick={() => setAdicionando(true)}
        >
          <Plus />
        </Button>
      }
    >
      {comValor.length > 0 ? (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          {comValor.map((atributo) =>
            editando === atributo.id ? (
              <EdicaoDoAtributo
                key={atributo.id}
                atributo={atributo}
                onGravar={(novo) => trocar(atributo.id, novo)}
                onApagar={() => trocar(atributo.id, null)}
                onCancelar={() => setEditando(null)}
              />
            ) : (
              <CelulaDoAtributo
                key={atributo.id}
                atributo={atributo}
                rotulo={rotuloDaRolagem(atributo)}
                onEditar={() => setEditando(atributo.id)}
              />
            ),
          )}
        </dl>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((atributo) =>
          editando === atributo.id ? (
            <EdicaoDoAtributo
              key={atributo.id}
              atributo={atributo}
              onGravar={(novo) => trocar(atributo.id, novo)}
              onApagar={() => trocar(atributo.id, null)}
              onCancelar={() => setEditando(null)}
            />
          ) : (
            <Tag
              key={atributo.id}
              atributo={atributo}
              onEditar={() => setEditando(atributo.id)}
              onTirar={() => trocar(atributo.id, null)}
            />
          ),
        )}

        {adicionando ? (
          <NovoAtributo
            onCriar={(novo) => gravar([...lista, novo])}
            onSair={() => setAdicionando(false)}
          />
        ) : (
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            disabled={cheio}
            title={cheio ? t.ver.limiteDeAtributos(MAX_ATRIBUTOS) : undefined}
            onClick={() => setAdicionando(true)}
          >
            <Plus /> {t.ver.adicionarAtributo}
          </Button>
        )}
      </div>
    </Secao>
  );
}

/**
 * Um atributo com valor: o nome pequeno em cima, o valor embaixo.
 *
 * O valor que começa com dado vira BOTÃO: "1d8+2 cortante" rola o 1d8+2 na mesa
 * e anuncia no fio com o nome do item -- "Edgar · Espada longa · Dano" --, e o
 * "cortante" fica ao lado como texto. O valor continua sendo texto; quem o lê
 * como dado é a tela. Ver `rolagemNoValor`.
 */
function CelulaDoAtributo({
  atributo,
  rotulo,
  onEditar,
}: {
  atributo: AtributoDoItem;
  rotulo: string;
  onEditar: () => void;
}) {
  const rolagem = rolagemNoValor(atributo.valor);

  return (
    <div
      className={cn(
        "group min-w-0",
        atributo.valor.length > VALOR_LONGO && "col-span-2",
        atributo.escondido && "opacity-70",
      )}
    >
      <dt className="text-muted-foreground flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase">
        <span className="truncate">{atributo.nome}</span>
        {atributo.escondido ? (
          <EyeOff className="size-3 shrink-0" aria-label={t.ver.escondido} />
        ) : null}
      </dt>

      {/* `flex-wrap`: o resto do valor ("fogo", "cortante") desce para a linha
          de baixo quando não cabe ao lado dos dados, em vez de virar reticência
          -- cortado, "f…" não diz o tipo do dano. */}
      <dd className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-medium">
        {rolagem ? (
          <>
            {/* Os dados desenhados como os da mesa, e a expressão escrita ao
                lado: o desenho é o dos detalhes da ficha. Ver
                `DadosDaExpressao`. */}
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={t.ver.rolar(rolagem.texto)}
                    className="bg-muted hover:bg-accent focus-visible:ring-ring inline-flex shrink-0 items-center gap-1 rounded-full border py-0.5 pr-2 pl-1 tabular-nums focus-visible:ring-2 focus-visible:outline-none"
                    onClick={() => rolarExpressao(rolagem.expressao, rotulo)}
                  >
                    <DadosDaExpressao expressao={rolagem.expressao} />
                    {/* A expressão escrita ao lado do desenho: o dado diz QUAL
                        dado, e "2d6+3" diz quantos e o que soma -- dois d6
                        desenhados não contam o +3. */}
                    <span className="text-sm">{rolagem.texto}</span>
                  </button>
                }
              />
              {/* "Rolar", e só: a expressão já está escrita no botão. */}
              <TooltipContent>{t.ver.rolarDica}</TooltipContent>
            </Tooltip>
            {rolagem.resto ? (
              <span className="text-foreground/80 min-w-0 wrap-break-word">{rolagem.resto}</span>
            ) : null}
          </>
        ) : (
          <span className="min-w-0 wrap-break-word">{atributo.valor}</span>
        )}

        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t.ver.editarAtributo(atributo.nome)}
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          onClick={onEditar}
        >
          <Pencil />
        </Button>
      </dd>
    </div>
  );
}

/** Um atributo sem valor: uma tag, que abre no clique e sai no X. */
function Tag({
  atributo,
  onEditar,
  onTirar,
}: {
  atributo: AtributoDoItem;
  onEditar: () => void;
  onTirar: () => void;
}) {
  return (
    <span
      className={cn(
        "bg-muted/50 inline-flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-xs font-medium",
        atributo.escondido && "border-dashed opacity-70",
      )}
    >
      {atributo.escondido ? <EyeOff className="size-3" aria-label={t.ver.escondido} /> : null}
      <button type="button" className="hover:underline" onClick={onEditar}>
        {atributo.nome}
      </button>
      <button
        type="button"
        aria-label={t.ver.tirarAtributo(atributo.nome)}
        className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-full p-0.5"
        onClick={onTirar}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

/**
 * Os campos de um atributo, no lugar dele: o nome, o valor, o olho, a lixeira, e
 * o confirmar e o desistir.
 *
 * O dado aparece DENTRO do campo do valor assim que o que se escreveu começa a
 * ler como dado: é a confirmação de que vai rolar, antes de gravar. Valor
 * incompleto ("1d") não é recusado -- é texto, e texto pode ser qualquer coisa.
 *
 * Enter confirma e Escape desiste. Valor vazio é tag.
 */
function EdicaoDoAtributo({
  atributo,
  onGravar,
  onApagar,
  onCancelar,
}: {
  atributo: AtributoDoItem;
  onGravar: (novo: AtributoDoItem) => void;
  onApagar: () => void;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(atributo.nome);
  const [valor, setValor] = useState(atributo.valor);
  const [escondido, setEscondido] = useState(Boolean(atributo.escondido));
  const dado = rolagemNoValor(valor);

  function confirmar() {
    const limpo = nome.trim();
    // Sem nome não há atributo: confirmar assim é apagar, e o Rust descartaria
    // de qualquer jeito.
    if (!limpo) {
      onApagar();
      return;
    }

    onGravar({ ...atributo, nome: limpo, valor: valor.trim(), escondido });
  }

  function teclar(evento: React.KeyboardEvent) {
    if (evento.key === "Enter") confirmar();
    if (evento.key === "Escape") {
      evento.stopPropagation();
      onCancelar();
    }
  }

  return (
    <div className="bg-muted/30 col-span-2 flex w-full items-center gap-1 rounded-lg border p-1">
      <Input
        autoFocus
        value={nome}
        aria-label={t.ver.nomeDoAtributo}
        placeholder={t.ver.nomeDoAtributo}
        className="h-7 w-24 shrink-0 px-1.5 text-[11px] font-medium tracking-wide uppercase"
        onChange={(evento) => setNome(evento.target.value)}
        onKeyDown={teclar}
      />

      <div className="relative min-w-0 flex-1">
        {/* O primeiro dado da expressão, assim que ela lê: a confirmação de que
            vai rolar, no mesmo desenho do botão que vai aparecer. */}
        {dado?.expressao.dados[0] ? (
          <span className="pointer-events-none absolute top-1/2 left-1 -translate-y-1/2">
            <DadoEstatico tipo={tipoDado(dado.expressao.dados[0].faces)} tamanho={18} />
          </span>
        ) : null}
        <Input
          value={valor}
          aria-label={t.ver.valorDoAtributo}
          placeholder={t.ver.valorExemplo}
          className={cn("h-7 text-sm", dado ? "pl-7" : "px-1.5")}
          onChange={(evento) => setValor(evento.target.value)}
          onKeyDown={teclar}
        />
      </div>

      <Button
        variant="ghost"
        size="icon-xs"
        aria-pressed={escondido}
        aria-label={escondido ? t.ver.mostrarAoJogador : t.ver.esconderDoJogador}
        title={escondido ? t.ver.atributoEscondido : t.ver.atributoAVista}
        onClick={() => setEscondido((atual) => !atual)}
      >
        {escondido ? <EyeOff /> : <Eye />}
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={t.ver.apagarAtributo}
        className="text-muted-foreground hover:text-destructive"
        onClick={onApagar}
      >
        <Trash2 />
      </Button>
      <Button variant="ghost" size="icon-xs" aria-label={t.ver.confirmar} onClick={confirmar}>
        <Check />
      </Button>
      <Button variant="ghost" size="icon-xs" aria-label={t.ver.cancelar} onClick={onCancelar}>
        <X />
      </Button>
    </div>
  );
}

/**
 * O campo de adicionar: "Fogo" vira tag, "Dano: 1d8" vira atributo com valor.
 *
 * Um campo, e não dois: na mesa o mestre escreve o atributo como fala -- "dano
 * um d oito" --, e separar nome e valor em dois campos pediria dois cliques
 * para o caso mais comum. Fica aberto depois do Enter, para o próximo; sai no
 * Escape, ou ao perder o foco.
 */
function NovoAtributo({
  onCriar,
  onSair,
}: {
  onCriar: (novo: AtributoDoItem) => void;
  onSair: () => void;
}) {
  const [texto, setTexto] = useState("");

  function criar() {
    const [nome, ...resto] = texto.split(":");
    const limpo = nome?.trim();
    if (!limpo) return;

    onCriar({ id: crypto.randomUUID(), nome: limpo, valor: resto.join(":").trim() });
    setTexto("");
  }

  return (
    <Input
      autoFocus
      value={texto}
      aria-label={t.ver.adicionarAtributo}
      placeholder={t.ver.novoAtributoExemplo}
      className="h-7 w-52 text-xs"
      onChange={(evento) => setTexto(evento.target.value)}
      onBlur={() => {
        if (texto.trim()) criar();
        onSair();
      }}
      onKeyDown={(evento) => {
        if (evento.key === "Enter") criar();
        if (evento.key === "Escape") {
          evento.stopPropagation();
          onSair();
        }
      }}
    />
  );
}

// --- medidores -----------------------------------------------------------------

/**
 * Os medidores: a mesma linha da ficha do personagem.
 *
 * É o "como os medidores já fazem": o lápis renomeia, a paleta troca cor e
 * forma, o olho esconde, e o NÚMERO abre os campos -- só o máximo no catálogo,
 * o atual e o máximo na mochila. Na mochila a barra também se arrasta, e os
 * passos de um em um ficam ao lado do número. Uma linha nova só para o item
 * seria um segundo jeito de mexer no mesmo medidor.
 *
 * O máximo, o nome, a cor e o olho são do ITEM, e mudam em toda mochila; o
 * atual é DESTA mochila.
 */
function Medidores({
  item,
  mochila,
}: {
  item: Item;
  mochila: { personagemId: string; entrada: Portador } | null;
}) {
  const [lista, definir] = useListaDoItem(item.medidores);

  function gravar(proxima: ModeloDeMedidor[]) {
    definir(proxima);
    return salvarNoCatalogo(item.id, { medidores: proxima });
  }

  function editar(id: string, patch: PatchDaLinha & { maximo?: number }) {
    return gravar(lista.map((modelo) => (modelo.id === id ? aplicarPatch(modelo, patch) : modelo)));
  }

  async function apagar(modelo: ModeloDeMedidor) {
    const ok = await confirmarApagar({
      titulo: t.ver.apagarMedidorTitulo(modelo.nome),
      itens: t.ver.apagarMedidorItens(modelo.nome),
    });
    if (ok) void gravar(lista.filter((outro) => outro.id !== modelo.id));
  }

  function criar() {
    const quantos = lista.length;

    void gravar([
      ...lista,
      {
        id: crypto.randomUUID(),
        nome: quantos === 0 ? t.ver.cargas : t.ver.medidor,
        cor: CORES_LAPIS[quantos % CORES_LAPIS.length] ?? CORES_LAPIS[0],
        estilo: "barra",
        maximo: MAXIMO_INICIAL,
        escondido: false,
      },
    ]);
  }

  const { listRef, dropIndex, startReorder } = useListReorder<string>((id, index) => {
    const de = lista.findIndex((modelo) => modelo.id === id);
    if (de < 0 || de === index) return;

    const arrumada = [...lista];
    const [movido] = arrumada.splice(de, 1);
    arrumada.splice(index, 0, movido!);
    void gravar(arrumada);
  });

  const medidores = medidoresDoItem({ medidores: lista }, mochila?.entrada.atuais);
  const cheio = lista.length >= MAX_MEDIDORES;

  return (
    <Secao
      titulo={t.ver.medidores}
      acao={
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t.ver.adicionarMedidor}
          title={cheio ? t.ver.limiteDeMedidores(MAX_MEDIDORES) : undefined}
          disabled={cheio}
          onClick={criar}
        >
          <Plus />
        </Button>
      }
    >
      {medidores.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t.ver.semMedidores}</p>
      ) : (
        <ul ref={listRef} className="-mx-1 space-y-0.5">
          {medidores.map((medidor, indice) => (
            <LinhaDoMedidor
              key={medidor.id}
              medidor={medidor}
              mochila={mochila ? { personagemId: mochila.personagemId, itemId: item.id } : null}
              dropTarget={dropIndex === indice}
              onReorderStart={(evento) => startReorder(evento, medidor.id)}
              onEditar={(patch) => editar(medidor.id, patch)}
              onApagar={() => void apagar(lista[indice]!)}
            />
          ))}
        </ul>
      )}
    </Secao>
  );
}

/** Um medidor na linha da ficha, com os números do catálogo ou da mochila. */
function LinhaDoMedidor({
  medidor,
  mochila,
  dropTarget,
  onReorderStart,
  onEditar,
  onApagar,
}: {
  medidor: Medidor;
  /** Presente, o atual é desta mochila: o número o abre, e a barra se arrasta. */
  mochila: { personagemId: string; itemId: string } | null;
  dropTarget: boolean;
  onReorderStart: (evento: React.PointerEvent) => void;
  onEditar: (patch: PatchDaLinha & { maximo?: number }) => Promise<boolean>;
  onApagar: () => void;
}) {
  /** Devolve se gravou: o arrasto da barra desfaz o rascunho quando não. */
  async function gravarAtual(atual: number): Promise<boolean> {
    if (!mochila) return false;

    try {
      await updateItem(mochila.personagemId, mochila.itemId, {
        atuais: { [medidor.id]: Math.max(0, Math.min(medidor.maximo, atual)) },
      });
      itensMudaram([mochila.personagemId]);
      return true;
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t.falhas.salvar);
      return false;
    }
  }

  // O que a linha desenha é o `mostrado`: no meio de um arrasto, a forma e o
  // número andam juntos com o ponteiro, antes de o disco responder.
  const { mostrado, arrasto } = useArrastoDoAtual(medidor, gravarAtual);
  const porcentagem = mostrado.estilo === "porcentagem";

  const campoDoMaximo = {
    rotulo: t.ver.valorMaximo,
    valor: medidor.maximo,
    onGravar: (maximo: number) => void onEditar({ maximo }),
  };

  return (
    <LinhaDeMedidor
      medidor={mostrado}
      arrasto={mochila ? arrasto : undefined}
      dropTarget={dropTarget}
      onReorderStart={onReorderStart}
      onEditar={(patch) => void onEditar(patch)}
      onApagar={onApagar}
      dicaDoOlho={{
        titulo: medidor.escondido ? t.ver.medidorEscondido : t.ver.medidorAVista,
        texto: t.ver.olhoDoMedidor,
      }}
      valores={
        mochila ? (
          <SeloDoMedidor
            texto={textoDoMedidor(mostrado)}
            dica={{ titulo: t.ver.deMaximo(mostrado.atual, mostrado.maximo), texto: t.ver.numeroDica }}
            campos={[
              {
                rotulo: t.ver.valorAtual,
                valor: mostrado.atual,
                onGravar: (atual) => arrasto.onSoltar(atual),
              },
              campoDoMaximo,
            ]}
            // Pelo mesmo caminho do arrasto, e não direto ao disco: dois cliques
            // mais rápidos que a volta do IPC liam o mesmo atual, e o segundo se
            // perdia. É o que a ficha faz.
            passos={{
              onMenos: () => arrasto.onSoltar(mostrado.atual - 1),
              onMais: () => arrasto.onSoltar(mostrado.atual + 1),
              podeMenos: mostrado.atual > 0,
              podeMais: mostrado.atual < mostrado.maximo,
            }}
          />
        ) : (
          // No catálogo, só o MÁXIMO: o atual é de cada mochila, e um campo
          // aqui pediria ao mestre uma escolha que não quer dizer nada. Mesma
          // decisão do modelo de medidor da campanha.
          <SeloDoMedidor
            texto={porcentagem ? "100%" : medidor.maximo}
            dica={{ titulo: t.ver.maximo(medidor.maximo), texto: t.ver.maximoDica }}
            campos={[campoDoMaximo]}
          />
        )
      }
    />
  );
}

/** O patch da linha aplicado ao molde, com as regras do Rust. */
function aplicarPatch(
  modelo: ModeloDeMedidor,
  patch: PatchDaLinha & { maximo?: number },
): ModeloDeMedidor {
  const { estiloExtensao, maximo, ...resto } = patch;
  const editado: ModeloDeMedidor = { ...modelo, ...resto };

  if (maximo !== undefined) editado.maximo = Math.min(MAX_VALOR, Math.max(1, Math.round(maximo)));

  // `""` volta ao estilo de fábrica, como no modelo da campanha.
  if (estiloExtensao === "") delete editado.estiloExtensao;
  else if (estiloExtensao !== undefined) editado.estiloExtensao = estiloExtensao;

  return editado;
}

/** Grava no catálogo e avisa as telas. Devolve se deu certo. */
async function salvarNoCatalogo(itemId: string, patch: PatchItemDaCampanha): Promise<boolean> {
  try {
    await editarItem(itemId, patch);
    // Todas as fichas: o que é do item aparece em qualquer mochila que o tenha.
    itensMudaram();
    return true;
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : t.falhas.salvar);
    return false;
  }
}
