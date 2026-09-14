"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Package, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberField } from "@/components/ui/number-field";
import { Textarea } from "@/components/ui/textarea";
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
import type { ImagemItem, ItemInventario } from "@/types/inventory";
import { chaveDaImagem, colunasPara, meuItem, vazios } from "@/types/inventory";

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
}: {
  codigo: string;
  personagemId: string;
}) {
  const [itens, setItens] = useState<ItemInventario[] | null>(null);
  const [aberto, setAberto] = useState<ItemInventario | null>(null);

  const [grade, colunas] = useColunas();

  const recarregar = useCallback(() => {
    myInventory(codigo, personagemId).then(setItens, () => setItens([]));
  }, [codigo, personagemId]);

  useEffect(recarregar, [recarregar]);

  async function criar() {
    try {
      const item = await addItem(codigo, personagemId, {
        nome: "Item sem nome",
      });
      recarregar();
      setAberto(item);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Falha ao criar o item.",
      );
    }
  }

  // Nada ainda e nenhum item: a seção inteira sai da tela em vez de mostrar uma
  // grade vazia com um título. O botão de adicionar mora no cabeçalho, então
  // ele volta assim que houver o que mostrar — e o jogador que quer criar o
  // primeiro item usa o mesmo botão, que fica visível abaixo.
  if (itens === null) return null;

  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-medium tracking-wide uppercase">
          <Package className="size-3" aria-hidden />
          Inventário
        </p>

        <Button variant="ghost" size="sm" onClick={() => void criar()}>
          <Plus /> Item
        </Button>
      </div>

      <div
        ref={grade}
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` }}
      >
        {itens.map((item) => (
          <ItemTile
            key={item.id}
            codigo={codigo}
            personagemId={personagemId}
            item={item}
            onAbrir={() => setAberto(item)}
          />
        ))}

        {Array.from({ length: vazios(itens.length, colunas) }, (_, n) => (
          <button
            key={`vazio-${n}`}
            type="button"
            onClick={() => void criar()}
            aria-label="Adicionar item"
            className="text-muted-foreground hover:text-foreground flex aspect-square items-center justify-center rounded border border-dashed"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        ))}
      </div>

      <Dialog
        open={Boolean(aberto)}
        onOpenChange={(open) => !open && setAberto(null)}
      >
        <DialogContent className="sm:max-w-md">
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

function ItemTile({
  codigo,
  personagemId,
  item,
  onAbrir,
}: {
  codigo: string;
  personagemId: string;
  item: ItemInventario;
  onAbrir: () => void;
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
}: {
  codigo: string;
  personagemId: string;
  imagem: ImagemItem | undefined;
  alt: string;
}) {
  // O asset sai no próprio render: a rota é pública e o endereço é o id, sem
  // nada a buscar. Só o anexo precisa de efeito, porque a blob dele vem de uma
  // requisição com cabeçalho.
  const doAcervo = imagem?.tipo === "asset" ? `/asset/${imagem.id}/mini` : null;

  const [doAnexo, setDoAnexo] = useState<string | null>(null);

  useEffect(() => {
    if (imagem?.tipo !== "anexo") return;

    let ativo = true;

    void characterFileThumbUrl(
      codigo,
      personagemId,
      imagem.autor,
      imagem.arquivo,
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
  }, [codigo, personagemId, imagem]);

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
      className="absolute inset-0 size-full object-cover opacity-90"
      {...MINIATURA}
    />
  );
}

/**
 * O item aberto.
 *
 * Os campos só são editáveis no item do próprio jogador — `meuItem`. No do
 * mestre viram leitura, e é assim que a tela não oferece um botão que o daemon
 * recusaria com 409. A recusa continua existindo lá, porque a tela não é onde
 * uma permissão se decide.
 */
function ItemForm({
  codigo,
  personagemId,
  item,
  onFechar,
  onChanged,
}: {
  codigo: string;
  personagemId: string;
  item: ItemInventario;
  onFechar: () => void;
  onChanged: () => void;
}) {
  const [atual, setAtual] = useState(item);
  const [enviando, setEnviando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const meu = meuItem(atual);

  async function salvar(patch: Parameters<typeof updateItem>[3]) {
    try {
      setAtual(await updateItem(codigo, personagemId, item.id, patch));
      onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao salvar.");
    }
  }

  async function apagar() {
    try {
      await removeItem(codigo, personagemId, item.id);
      onChanged();
      onFechar();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao remover.");
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
        cause instanceof Error ? cause.message : "Falha ao enviar a foto.",
      );
    } finally {
      setEnviando(false);
      // Limpa a entrada para o MESMO arquivo poder ser escolhido de novo: sem
      // isto, mandar a mesma foto depois de um erro não disparava `change`.
      if (entrada.current) entrada.current.value = "";
    }
  }

  return (
    <>
      <DialogTitle className="sr-only">{atual.nome}</DialogTitle>
      <DialogDescription className="sr-only">
        {meu
          ? "Nome, descrição, quantidade e foto do item."
          : "O que o mestre pôs no inventário."}
      </DialogDescription>

      {/* O quadro da imagem só aparece quando HÁ imagem. Vazio, ele era um
          retângulo cinza de 80px ao lado do nome, empurrando o campo para uma
          faixa estreita e dizendo nada — o item sem foto é a maioria, e a foto
          se põe pelo botão lá embaixo. */}
      <div className="flex gap-3">
        {atual.imagem ? (
          <div className="bg-muted relative size-20 shrink-0 overflow-hidden rounded border">
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
          {/* `pr-8` na primeira linha: o X de fechar do diálogo é absoluto no
              canto, e sem a folga ele ficava POR CIMA do fim do campo de nome —
              mirar no fechar apagava uma letra. */}
          {meu ? (
            <Input
              defaultValue={atual.nome}
              aria-label="Nome do item"
              className="pr-8"
              onBlur={(event) => void salvar({ nome: event.target.value })}
            />
          ) : (
            <p className="pr-8 text-sm font-medium">{atual.nome}</p>
          )}

          <div className="flex items-center gap-2">
            <Label htmlFor={`qtd-${item.id}`} className="text-xs">
              Quantidade
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
          placeholder="O que é, o que faz, de onde veio."
          aria-label="Descrição do item"
          className="min-h-20 text-sm"
          onBlur={(event) => void salvar({ descricao: event.target.value })}
        />
      ) : atual.descricao ? (
        <p className="text-muted-foreground text-sm whitespace-pre-wrap">
          {atual.descricao}
        </p>
      ) : null}

      {meu ? (
        <DialogFooter className="sm:justify-between">
          {/* `capture` ausente de propósito: o jogador tanto tira a foto na
              hora quanto escolhe uma que já está no rolo, e forçar a câmera
              tiraria metade dos casos. */}
          <input
            ref={entrada}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => void enviarFoto(event.target.files?.[0])}
          />

          <Button
            variant="outline"
            size="sm"
            disabled={enviando}
            onClick={() => entrada.current?.click()}
          >
            <Camera />{" "}
            {enviando ? "Enviando…" : atual.imagem ? "Trocar foto" : "Foto"}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => void apagar()}
          >
            <Trash2 /> Remover
          </Button>
        </DialogFooter>
      ) : (
        <p className="text-muted-foreground text-[10px]">
          Este item foi o mestre que pôs aqui.
        </p>
      )}
    </>
  );
}

/**
 * Quantas colunas cabem na grade, medindo a própria grade.
 *
 * Por `ResizeObserver` e não por `media query`: quem manda é a largura do
 * ELEMENTO, e ela não é função da janela — o inventário está numa coluna que
 * divide espaço com o retrato do personagem, e a mesma tela dá larguras
 * diferentes conforme haja retrato ou não.
 *
 * O número também não pode ficar só no CSS: os quadros vazios que completam a
 * última linha são contados em JavaScript, e uma grade de quatro colunas com a
 * conta feita para três deixaria a fileira de baixo quebrada. Uma medida só,
 * usada pelos dois.
 *
 * Começa em três — o caso do celular em pé, que é a maioria — para a primeira
 * pintura não vir larga e encolher no quadro seguinte.
 */
function useColunas(): [React.RefObject<HTMLDivElement | null>, number] {
  const grade = useRef<HTMLDivElement>(null);
  const [colunas, setColunas] = useState(3);

  useEffect(() => {
    const alvo = grade.current;
    if (!alvo) return;

    const observer = new ResizeObserver(([entrada]) => {
      if (entrada) setColunas(colunasPara(entrada.contentRect.width));
    });

    observer.observe(alvo);

    return () => observer.disconnect();
  }, []);

  return [grade, colunas];
}
