"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ImagePlus, Package, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberField } from "@/components/ui/number-field";
import { Textarea } from "@/components/ui/textarea";
import { comum } from "@/lib/i18n/comum";
import { t } from "@/lib/i18n/jogador";
import { normaliza } from "@/lib/search";
import { MINIATURA } from "@/lib/miniatura";
import { characterFileThumbUrl } from "@/lib/player/characters";
import {
  addItem,
  myInventory,
  removeItem,
  updateItem,
  uploadItemImage,
} from "@/lib/player/inventory";
import { cn } from "@/lib/utils";
import type { ImagemItem, ItemInventario, NovoItem } from "@/types/inventory";
import { chaveDaImagem, meuItem } from "@/types/inventory";

/** Os itens de um personagem, e como reler. `null` = ainda lendo. */
export function useItensDoPersonagem(codigo: string, personagemId: string) {
  const [itens, setItens] = useState<ItemInventario[] | null>(null);

  const recarregar = useCallback(() => {
    myInventory(codigo, personagemId).then(setItens, () => setItens([]));
  }, [codigo, personagemId]);

  useEffect(recarregar, [recarregar]);

  return { itens, recarregar };
}

/**
 * Grava o item que o jogador acabou de nomear e, quando ele escolheu uma, sobe
 * a foto em seguida -- a rota da foto pede um item que já existe.
 *
 * Nada é gravado antes do nome. Era o contrário: o "+" criava um "Item sem
 * nome" na hora e abria a edição, e quem fechava o diálogo sem escrever deixava
 * o item vazio na grade.
 *
 * A foto que falha não desfaz o item: ele fica, e quem chamou o abre para
 * tentar a foto de novo. `null` = nem o item foi gravado; o aviso já saiu.
 */
export async function criarItem(
  codigo: string,
  personagemId: string,
  item: NovoItem,
  foto: File | null,
): Promise<{ criado: ItemInventario; fotoFalhou: boolean } | null> {
  let criado: ItemInventario;
  try {
    criado = await addItem(codigo, personagemId, item);
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : t.inventario.falhaCriar);
    return null;
  }

  if (!foto) return { criado, fotoFalhou: false };

  try {
    await uploadItemImage(codigo, personagemId, criado.id, foto);
    return { criado, fotoFalhou: false };
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : t.inventario.falhaFoto);
    return { criado, fotoFalhou: true };
  }
}

/**
 * O inventário do personagem, no celular do jogador.
 *
 * O que chega aqui já vem SEM os itens escondidos: o daemon os corta antes de
 * responder. Filtrar nesta tela seria tarde demais — o nome do item estaria no
 * JSON que o navegador guardou, visível na aba de rede do próprio celular.
 *
 * O jogador vê tudo o que não está escondido, e mexe só no que ele criou. O
 * item que o mestre pôs ali é leitura para ele — o outro lado da mesma
 * segmentação que já vale para os anexos.
 */
export function InventarioJogador({
  codigo,
  personagemId,
  busca = "",
}: {
  codigo: string;
  personagemId: string;
  /**
   * O que o jogador procura, já normalizado. Com busca, só os itens que casam
   * no nome ou na descrição, e sem os botões de criar: procurar não é a hora de
   * pôr item novo. Nenhum casou, a seção some.
   */
  busca?: string;
}) {
  const { itens, recarregar } = useItensDoPersonagem(codigo, personagemId);
  const [aberto, setAberto] = useState<ItemInventario | null>(null);
  /** O diálogo de item NOVO, ainda sem nada gravado. Ver `NovoItemForm`. */
  const [novo, setNovo] = useState(false);

  async function criar(item: NovoItem, foto: File | null) {
    const feito = await criarItem(codigo, personagemId, item, foto);
    if (!feito) return;
    recarregar();
    setNovo(false);
    if (feito.fotoFalhou) setAberto(feito.criado);
  }

  // Nada ainda e nenhum item: a seção inteira sai da tela em vez de mostrar uma
  // grade vazia com um título. O botão de adicionar mora no cabeçalho, então
  // ele volta assim que houver o que mostrar — e o jogador que quer criar o
  // primeiro item usa o mesmo botão, que fica visível abaixo.
  if (itens === null) return null;

  const visiveis = busca
    ? itens.filter((item) =>
        [item.nome, item.descricao].some((texto) => normaliza(texto).includes(busca)),
      )
    : itens;
  if (busca && visiveis.length === 0) return null;

  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-medium tracking-wide uppercase">
          <Package className="size-3" aria-hidden />
          {t.inventario.titulo}
        </p>

        {busca ? null : (
          <Button variant="ghost" size="sm" onClick={() => setNovo(true)}>
            <Plus /> {t.inventario.item}
          </Button>
        )}
      </div>

      {/* Quantas colunas couberem com quadros de no mínimo 4rem: cinco num
          celular em pé, mais na gaveta larga do tablet. O CSS mede sozinho
          porque não há mais conta de vazios a casar com o número de colunas --
          ver o quadro de adicionar abaixo. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(4rem,1fr))] gap-1.5">
        {visiveis.map((item) => (
          <ItemTile
            key={item.id}
            codigo={codigo}
            personagemId={personagemId}
            item={item}
            onAbrir={() => setAberto(item)}
          />
        ))}

        {/* UM quadro de adicionar, no fim. Completar a última linha com
            tracejados dava três quadrados vazios para um item só, e a seção
            parecia maior que o que guardava. */}
        {busca ? null : (
          <button
            type="button"
            onClick={() => setNovo(true)}
            aria-label={t.inventario.adicionar}
            className="text-muted-foreground hover:text-foreground flex aspect-square items-center justify-center rounded border border-dashed"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {/* Dois diálogos, e não um que muda de cara: criar é um formulário vazio
          que só grava no "Adicionar"; abrir um item é ler o que ele é, e
          editar um passo adiante. Sem o X do canto nos dois: ele é absoluto no
          topo, e caía por cima do fim do campo de nome. O fechar mora na
          linha do nome. */}
      <Dialog open={novo} onOpenChange={setNovo}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          {novo ? <NovoItemForm onCriar={criar} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(aberto)}
        onOpenChange={(open) => !open && setAberto(null)}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          {aberto ? (
            <ItemForm
              key={aberto.id}
              codigo={codigo}
              personagemId={personagemId}
              item={aberto}
              onFechar={() => setAberto(null)}
              onChanged={recarregar}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/**
 * O item novo, no mesmo desenho da edição: o quadro da foto à esquerda, o nome
 * ao lado, a descrição embaixo. Nada é gravado até o "Adicionar", que só
 * acende com nome. Sem quantidade: nasce com um, e quem tem três tochas ajusta
 * na edição -- é o caso raro, e o campo pesava no caso comum.
 *
 * A foto escolhida aqui fica só no aparelho, em prévia, até o item existir: a
 * rota da foto pede o id dele. Ver `criar`.
 */
export function NovoItemForm({
  onCriar,
}: {
  onCriar: (item: NovoItem, foto: File | null) => Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [foto, setFoto] = useState<{ arquivo: File; url: string } | null>(null);
  const [criando, setCriando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  // A prévia é uma URL de blob: solta ao trocar de foto e ao fechar.
  const prevista = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (prevista.current) URL.revokeObjectURL(prevista.current);
    },
    [],
  );

  function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    if (prevista.current) URL.revokeObjectURL(prevista.current);
    const url = URL.createObjectURL(arquivo);
    prevista.current = url;
    setFoto({ arquivo, url });
  }

  const pronto = nome.trim() !== "" && !criando;

  async function enviar() {
    if (!pronto) return;
    setCriando(true);
    await onCriar({ nome: nome.trim(), descricao }, foto?.arquivo ?? null);
    setCriando(false);
  }

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        void enviar();
      }}
    >
      <DialogTitle className="sr-only">{t.inventario.novoItem}</DialogTitle>
      <DialogDescription className="sr-only">
        {t.inventario.descricaoMeu}
      </DialogDescription>

      <input
        ref={entrada}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => escolher(event.target.files?.[0])}
      />

      <div className="flex gap-3">
        {/* O mesmo quadro da edição: vazio diz o gesto, com foto mostra a
            prévia e a pastilha de trocar. */}
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          disabled={criando}
          aria-label={foto ? t.inventario.trocarFoto : t.inventario.escolherFoto}
          className={cn(
            "relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded border disabled:opacity-60",
            foto ? "bg-muted" : "text-muted-foreground border-dashed",
          )}
        >
          {foto ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={foto.url}
                alt=""
                draggable={false}
                className="absolute inset-0 size-full object-cover"
              />
              <span className="bg-background/80 absolute right-0.5 bottom-0.5 flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] leading-none font-medium">
                <ImagePlus className="size-2.5" aria-hidden />
                {t.inventario.trocar}
              </span>
            </>
          ) : (
            <span className="flex flex-col items-center gap-1">
              <ImagePlus className="size-5" aria-hidden />
              <span className="text-[10px] leading-none font-medium">
                {t.inventario.porFoto}
              </span>
            </span>
          )}
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-center gap-1">
            <Input
              autoFocus
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              placeholder={t.inventario.nome}
              aria-label={t.inventario.nome}
              enterKeyHint="done"
              className="flex-1"
            />
            <DialogClose
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={comum.fechar}
                  className="shrink-0"
                />
              }
            >
              <X />
            </DialogClose>
          </div>
        </div>
      </div>

      <Textarea
        value={descricao}
        onChange={(event) => setDescricao(event.target.value)}
        placeholder={t.inventario.descricaoDica}
        aria-label={t.inventario.descricao}
        className="min-h-20 text-sm"
      />

      <DialogFooter>
        <Button type="submit" className="w-full" disabled={!pronto}>
          <Plus /> {t.inventario.adicionarBotao}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ItemTile({
  codigo,
  personagemId,
  item,
  onAbrir,
  selecionado = false,
}: {
  codigo: string;
  personagemId: string;
  item: ItemInventario;
  onAbrir: () => void;
  /** O item mostrado no painel da mochila. Ver `MochilaJogador`. */
  selecionado?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={item.nome}
      className={cn(
        "bg-card relative flex aspect-square flex-col items-center justify-end gap-0.5 overflow-hidden rounded border p-1 text-center",
        // O que é do mestre tem borda cheia; o que é do jogador, não. É a
        // mesma diferença que a lista de arquivos já faz entre "o que a mesa me
        // deu" e "o que eu juntei" — e aqui ela também diz onde há lixeira.
        !meuItem(item) && "border-primary/40",
        selecionado && "ring-primary ring-2",
      )}
    >
      <ImagemDoItem
        key={chaveDaImagem(item.imagem)}
        codigo={codigo}
        personagemId={personagemId}
        imagem={item.imagem}
        alt={item.nome}
      />

      <span className="relative line-clamp-2 text-[10px] leading-tight font-medium wrap-break-word">
        {item.nome}
      </span>

      {item.quantidade > 1 ? (
        <span className="bg-primary text-primary-foreground absolute top-1 right-1 rounded px-1 text-[10px] leading-4 font-semibold tabular-nums">
          {item.quantidade}
        </span>
      ) : null}
    </button>
  );
}

/**
 * A imagem do item no celular.
 *
 * `asset` vai direto por `/asset/{id}/mini`: a rota é aberta para a mesa, e o
 * celular a alcança sem credencial própria — mesma coisa que o retrato e a
 * miniatura já fazem neste cartão.
 *
 * `anexo` está atrás do token, e `<img src>` não manda cabeçalho. Vai pela
 * variante `mini` da rota do anexo, que devolve alguns KB em vez dos megabytes
 * do original — um print de 6 MB atravessando o 4G para virar um quadrado de
 * 80px é exatamente o que ela evita, e são N celulares na mesa.
 */
function ImagemDoItem({
  codigo,
  personagemId,
  imagem,
  alt,
  variante = "mini",
  className = "absolute inset-0 size-full object-cover opacity-90",
}: {
  codigo: string;
  personagemId: string;
  imagem: ImagemItem | undefined;
  alt: string;
  /** `tela` na foto grande do item aberto: a `mini` de 80px borraria ali. */
  variante?: "mini" | "tela";
  className?: string;
}) {
  // O asset sai no próprio render: a rota é pública e o endereço é o id, sem
  // nada a buscar. Só o anexo precisa de efeito, porque a blob dele vem de uma
  // requisição com cabeçalho.
  const doAcervo = imagem?.tipo === "asset" ? `/asset/${imagem.id}/${variante}` : null;

  const [doAnexo, setDoAnexo] = useState<string | null>(null);

  useEffect(() => {
    if (imagem?.tipo !== "anexo") return;

    let ativo = true;

    void characterFileThumbUrl(
      codigo,
      personagemId,
      imagem.autor,
      imagem.arquivo,
      variante,
    ).then(
      (endereco) => {
        if (ativo) setDoAnexo(endereco);
      },
      () => {
        // Silencioso: a grade cai no ícone, e um toast por imagem que não
        // carregou encheria a tela de quem tem dez itens e uma rede ruim.
      },
    );

    return () => {
      ativo = false;
    };
  }, [codigo, personagemId, imagem, variante]);

  const url = doAcervo ?? doAnexo;

  if (!url)
    return (
      <Package
        className="text-muted-foreground/40 size-6 shrink-0"
        aria-hidden
      />
    );

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      draggable={false}
      className={className}
      {...MINIATURA}
    />
  );
}

/**
 * O item aberto: primeiro LIDO -- a foto grande, o nome, a quantidade e a
 * descrição --, e editado só pelo "Editar". A criação é outro diálogo, o
 * `NovoItemForm`.
 *
 * Os campos só são editáveis no item do próprio jogador — `meuItem`. No do
 * mestre viram leitura, e é assim que a tela não oferece um botão que o daemon
 * recusaria com 409. A recusa continua existindo lá, porque a tela não é onde
 * uma permissão se decide.
 */
export function ItemForm({
  codigo,
  personagemId,
  item,
  onFechar,
  onChanged,
  moldura = "dialogo",
}: {
  codigo: string;
  personagemId: string;
  item: ItemInventario;
  onFechar: () => void;
  onChanged: () => void;
  /**
   * Num diálogo (a grade da aba, a busca, a gaveta deitada) ou no PAINEL da
   * mochila, embaixo da grade: ali não há título escondido nem X -- quem fecha
   * é a mochila --, e o rodapé é uma linha do painel.
   */
  moldura?: "dialogo" | "painel";
}) {
  const painel = moldura === "painel";
  const Rodape = painel ? RodapeDoPainel : DialogFooter;

  const [atual, setAtual] = useState(item);
  const [enviando, setEnviando] = useState(false);
  // Abre LENDO, e editar é um toque a mais. Era um formulário de saída: o item
  // que se abria só para conferir a descrição já chegava com cursor no nome.
  const [editando, setEditando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const meu = meuItem(atual);

  async function salvar(patch: Parameters<typeof updateItem>[3]) {
    try {
      setAtual(await updateItem(codigo, personagemId, item.id, patch));
      onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t.erros.falhaSalvar);
    }
  }

  async function apagar() {
    try {
      await removeItem(codigo, personagemId, item.id);
      onChanged();
      onFechar();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t.erros.falhaRemover);
    }
  }

  async function enviarFoto(file: File | undefined) {
    if (!file) return;

    setEnviando(true);

    try {
      setAtual(await uploadItemImage(codigo, personagemId, item.id, file));
      onChanged();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : t.inventario.falhaFoto,
      );
    } finally {
      setEnviando(false);
      // Limpa a entrada para o MESMO arquivo poder ser escolhido de novo: sem
      // isto, mandar a mesma foto depois de um erro não disparava `change`.
      if (entrada.current) entrada.current.value = "";
    }
  }

  if (!editando) {
    const leitura = (
      <>
        {painel ? null : <TituloEscondido nome={atual.nome} meu={meu} />}

        {/* A foto GRANDE, inteira e sem corte: aberto, o item é o assunto. Pela
            variante `tela`, e não pela `mini` do quadro da grade. */}
        {/* No painel da mochila a foto ESTICA até onde a coluna deixar: lá o
            item escolhido é o assunto, e o vão que sobrava entre os botões e a
            grade vira foto. O nome, a descrição e os botões ficam embaixo dela. */}
        {atual.imagem ? (
          <div
            className={cn(
              "bg-muted overflow-hidden rounded-md border",
              painel
                ? "relative min-h-32 w-full flex-1"
                : "flex max-h-64 w-full items-center justify-center",
            )}
          >
            <ImagemDoItem
              key={chaveDaImagem(atual.imagem)}
              codigo={codigo}
              personagemId={personagemId}
              imagem={atual.imagem}
              alt={atual.nome}
              variante="tela"
              className={
                painel
                  ? "absolute inset-0 size-full object-contain"
                  : "max-h-64 w-full object-contain"
              }
            />
          </div>
        ) : null}

        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-lg leading-tight font-semibold break-words">
              {atual.nome}
            </p>
            {atual.quantidade > 1 ? (
              <p className="text-muted-foreground text-xs tabular-nums">
                {t.inventario.quantidade}: {atual.quantidade}
              </p>
            ) : null}
          </div>

          {painel ? null : (
<DialogClose
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={comum.fechar}
                className="-mt-1 shrink-0"
              />
            }
          >
            <X />
          </DialogClose>

          )}
        </div>

        {atual.descricao ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {atual.descricao}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t.inventario.semDescricao}
          </p>
        )}

        {meu ? (
          <Rodape className="flex-row justify-between sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => void apagar()}
            >
              <Trash2 /> {t.inventario.remover}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setEditando(true)}>
              <Pencil /> {t.inventario.editar}
            </Button>
          </Rodape>
        ) : (
          <p className="text-muted-foreground text-[10px]">
            {t.inventario.doMestre}
          </p>
        )}
      </>
    );

    // No painel, uma coluna da altura da área: a foto fica com o que sobrar.
    // Com descrição longa a coluna cresce, e quem rola é a área em volta.
    return painel ? <div className="flex min-h-full flex-col gap-3">{leitura}</div> : leitura;
  }

  // A EDIÇÃO: só do item do próprio jogador -- o do mestre nem oferece o botão.
  return (
    <>
      {painel ? null : <TituloEscondido nome={atual.nome} meu={meu} />}

      {/* `capture` ausente de propósito: o jogador tanto tira a foto na hora
          quanto escolhe uma que já está no rolo, e forçar a câmera tiraria
          metade dos casos. */}
      {meu ? (
        <input
          ref={entrada}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => void enviarFoto(event.target.files?.[0])}
        />
      ) : null}

      <div className="flex gap-3">
        {/* O quadro É o botão da foto — o mesmo gesto que a janela do mestre.
            Vazio ele diz o gesto com todas as letras: "+" sobre a foto e a
            palavra embaixo. No dedo não há hover para descobrir isso depois, e
            um quadrado tracejado mudo seria decoração. No item do mestre
            continua só moldura, e só quando há o que mostrar. */}
        {meu ? (
          <button
            type="button"
            onClick={() => entrada.current?.click()}
            disabled={enviando}
            aria-label={
              atual.imagem ? t.inventario.trocarFoto : t.inventario.escolherFoto
            }
            className={cn(
              "relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded border disabled:opacity-60",
              atual.imagem
                ? "bg-muted"
                : "text-muted-foreground border-dashed",
            )}
          >
            {atual.imagem ? (
              <>
                <ImagemDoItem
                  key={chaveDaImagem(atual.imagem)}
                  codigo={codigo}
                  personagemId={personagemId}
                  imagem={atual.imagem}
                  alt={atual.nome}
                />

                {/* Sempre visível, e não no hover: o dedo não paira. É uma
                    pastilha no canto para não cobrir a foto que o jogador
                    acabou de mandar. */}
                <span className="bg-background/80 absolute right-0.5 bottom-0.5 flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] leading-none font-medium">
                  <ImagePlus className="size-2.5" aria-hidden />
                  {t.inventario.trocar}
                </span>
              </>
            ) : (
              <span className="flex flex-col items-center gap-1">
                <ImagePlus className="size-5" aria-hidden />
                <span className="text-[10px] leading-none font-medium">
                  {t.inventario.porFoto}
                </span>
              </span>
            )}

            {enviando ? (
              <span className="bg-background/70 absolute inset-0 flex items-center justify-center text-[10px]">
                {t.inventario.enviando}
              </span>
            ) : null}
          </button>
        ) : atual.imagem ? (
          <div className="bg-muted relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded border">
            <ImagemDoItem
              key={chaveDaImagem(atual.imagem)}
              codigo={codigo}
              personagemId={personagemId}
              imagem={atual.imagem}
              alt={atual.nome}
            />
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-center gap-1">
            {meu ? (
              <Input
                defaultValue={atual.nome}
                aria-label={t.inventario.nome}
                className="flex-1"
                onBlur={(event) => {
                  // Vazio não apaga o nome -- o daemon o mantém (`update`) --,
                  // e o campo volta a mostrá-lo em vez de ficar em branco.
                  if (event.target.value.trim() === "") {
                    event.target.value = atual.nome;
                    return;
                  }
                  void salvar({ nome: event.target.value });
                }}
              />
            ) : (
              <p className="flex-1 text-sm font-medium">{atual.nome}</p>
            )}

            {painel ? null : (
<DialogClose
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={comum.fechar}
                  className="shrink-0"
                />
              }
            >
              <X />
            </DialogClose>

            )}
          </div>

          <div className="flex items-center gap-2">
            <Label htmlFor={`qtd-${item.id}`} className="text-xs">
              {t.inventario.quantidade}
            </Label>
            {meu ? (
              <NumberField
                id={`qtd-${item.id}`}
                min={1}
                defaultValue={atual.quantidade}
                // No commit, e não a cada tecla: segurar o `+` são dez cliques,
                // e gravar em cada um seria dez requisições para um número que
                // só interessa quando o dedo sai de cima.
                onValueCommitted={(valor) =>
                  void salvar({ quantidade: valor ?? 1 })
                }
              />
            ) : (
              <span className="text-sm tabular-nums">{atual.quantidade}</span>
            )}
          </div>
        </div>
      </div>

      {meu ? (
        <Textarea
          defaultValue={atual.descricao}
          placeholder={t.inventario.descricaoDica}
          aria-label={t.inventario.descricao}
          className="min-h-20 text-sm"
          onBlur={(event) => void salvar({ descricao: event.target.value })}
        />
      ) : atual.descricao ? (
        <p className="text-muted-foreground text-sm whitespace-pre-wrap">
          {atual.descricao}
        </p>
      ) : null}

      {/* "Pronto" volta à leitura. O que mudou já foi gravado ao sair de
          cada campo, e o toque no botão é justamente o que tira o foco. */}
      <Rodape className="flex-row justify-between sm:justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={() => void apagar()}
        >
          <Trash2 /> {t.inventario.remover}
        </Button>
        <Button size="sm" onClick={() => setEditando(false)}>
          <Check /> {t.inventario.pronto}
        </Button>
      </Rodape>
    </>
  );
}

/** O título e a descrição só para o leitor de tela, como pede o diálogo. */
function TituloEscondido({ nome, meu }: { nome: string; meu: boolean }) {
  return (
    <>
      <DialogTitle className="sr-only">{nome}</DialogTitle>
      <DialogDescription className="sr-only">
        {meu ? t.inventario.descricaoMeu : t.inventario.descricaoDoMestre}
      </DialogDescription>
    </>
  );
}

/** O rodapé do item no painel da mochila: uma linha, sem o fundo do diálogo. */
function RodapeDoPainel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex items-center gap-2 border-t pt-3", className)}>{children}</div>;
}
