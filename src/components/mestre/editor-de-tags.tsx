"use client";

import { useState } from "react";
import { Plus, Tags, X } from "lucide-react";

import { falhou, type EdicaoDeTags } from "@/components/mestre/compendio-cartao";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { t } from "@/lib/i18n/mestre";
import { temTag } from "@/lib/mestre/compendio";
import { definirTags, definirTagsNoAto20 } from "@/lib/vault/compendio";

const texto = t.compendio;

/** Quantas tags cabem numa coisa. Espelho de `MAX_TAGS`, em `compendio.rs`. */
const MAX_TAGS = 16;

/**
 * As tags de UMA coisa, num quadro pequeno: as que ela tem, para tirar, e as
 * da lista que ela não tem, para pôr. Uma nova se escreve embaixo.
 *
 * O diálogo é o do Compêndio, aberto pelo "Tags…" do menu de um card. A ficha
 * do molde usa o mesmo miolo num popover, ao lado das tags dela -- ver
 * `TagsNaFicha`.
 *
 * O conteúdo remonta por coisa (`key`), e não reaproveita estado: abrir as
 * tags do Orc depois das do Goblin não pode começar com as do Goblin.
 */
export function EditorDeTags({
  edicao,
  sugestoes,
  onFechar,
  onMudou,
}: {
  edicao: EdicaoDeTags | null;
  sugestoes: string[];
  onFechar: () => void;
  onMudou: (edicao: EdicaoDeTags) => void;
}) {
  return (
    <Dialog
      open={edicao !== null}
      onOpenChange={(aberto) => {
        if (!aberto) onFechar();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        {edicao ? (
          <>
            <DialogHeader className="pr-8">
              <DialogTitle className="leading-snug break-words">{texto.tagsDe(edicao.nome)}</DialogTitle>
              <DialogDescription>{texto.tagsDica}</DialogDescription>
            </DialogHeader>
            <TagsDaCoisa
              key={`${edicao.onde}:${edicao.tipo}:${edicao.id}`}
              edicao={edicao}
              sugestoes={sugestoes}
              onMudou={onMudou}
            />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * As tags na ficha do molde: as que ele tem, e o botão que abre o mesmo quadro
 * do Compêndio num popover, sem sair da ficha. É onde o mestre está quando
 * pensa "isto é um morto-vivo" -- preparando o goblin --, e ir ao Compêndio
 * para dizer isso era uma volta.
 */
export function TagsNaFicha({
  edicao,
  sugestoes,
  onMudou,
}: {
  edicao: EdicaoDeTags;
  sugestoes: string[];
  onMudou: (edicao: EdicaoDeTags) => void;
}) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {edicao.tags.map((tag) => (
        <span
          key={tag}
          title={tag}
          className="bg-muted inline-flex h-4 max-w-full items-center rounded-full px-1.5 text-[10px]"
        >
          <span className="truncate">{tag}</span>
        </span>
      ))}

      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={texto.tagsDe(edicao.nome)}
              title={texto.tagsDe(edicao.nome)}
              className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring inline-flex h-4 shrink-0 items-center gap-0.5 rounded-full px-1 text-[10px] outline-none focus-visible:ring-2"
            >
              {edicao.tags.length === 0 ? (
                <>
                  <Plus className="size-3" aria-hidden />
                  {texto.tags}
                </>
              ) : (
                <Tags className="size-3" aria-hidden />
              )}
            </button>
          }
        />
        <PopoverContent align="start" className="w-72 space-y-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium break-words">{texto.tagsDe(edicao.nome)}</p>
            <p className="text-muted-foreground text-xs">{texto.tagsDica}</p>
          </div>
          <TagsDaCoisa
            key={`${edicao.onde}:${edicao.tipo}:${edicao.id}`}
            edicao={edicao}
            sugestoes={sugestoes}
            onMudou={onMudou}
          />
        </PopoverContent>
      </Popover>
    </span>
  );
}

/**
 * O miolo do quadro: tirar, escrever, pôr das já usadas.
 *
 * Grava a cada gesto, sem botão de salvar: é a mesma regra do resto do
 * aplicativo, que edita no lugar. O Rust devolve as tags como ficaram --
 * limpas, sem repetida --, e é isso que o quadro mostra.
 */
function TagsDaCoisa({
  edicao,
  sugestoes,
  onMudou,
}: {
  edicao: EdicaoDeTags;
  sugestoes: string[];
  onMudou: (edicao: EdicaoDeTags) => void;
}) {
  const [tags, setTags] = useState(edicao.tags);
  const [nova, setNova] = useState("");
  const livres = sugestoes.filter((tag) => !temTag(tags, tag));
  const cheia = tags.length >= MAX_TAGS;

  function gravar(proximas: string[]) {
    // Já na tela, e corrigida pela resposta: esperar o disco para a tag
    // aparecer faria o clique parecer não ter pegado.
    setTags(proximas);

    const definir = edicao.onde === "campanha" ? definirTags : definirTagsNoAto20;
    void definir(edicao.tipo, edicao.id, proximas).then(
      (ficaram) => {
        setTags(ficaram);
        onMudou({ ...edicao, tags: ficaram });
      },
      (cause: unknown) => {
        setTags(tags);
        falhou(cause);
      },
    );
  }

  function acrescentar(tag: string) {
    const limpa = tag.trim();
    if (!limpa || cheia || temTag(tags, limpa)) return;
    gravar([...tags, limpa]);
  }

  return (
    <div className="space-y-3">
      {tags.length === 0 ? (
        <p className="text-muted-foreground text-xs">{texto.semTags}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5" aria-label={texto.tagsDe(edicao.nome)}>
          {tags.map((tag) => (
            <li key={tag}>
              <span className="bg-muted inline-flex h-6 items-center gap-1 rounded-full pr-1 pl-2.5 text-xs">
                {tag}
                <button
                  type="button"
                  aria-label={texto.tirarTag(tag)}
                  title={texto.tirarTag(tag)}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring grid size-4 place-items-center rounded-full outline-none focus-visible:ring-2"
                  onClick={() => gravar(tags.filter((atual) => atual !== tag))}
                >
                  <X className="size-3" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex gap-2"
        onSubmit={(evento) => {
          evento.preventDefault();
          acrescentar(nova);
          setNova("");
        }}
      >
        <Input
          value={nova}
          onChange={(evento) => setNova(evento.target.value)}
          placeholder={cheia ? texto.noMaximo : texto.novaTag}
          aria-label={texto.novaTag}
          maxLength={32}
          disabled={cheia}
          className="h-8 text-xs"
          // Esc fecha o quadro, como em todo diálogo; o campo não segura.
          autoFocus
        />
        <Button type="submit" size="sm" variant="outline" disabled={cheia || !nova.trim()}>
          <Plus />
          {texto.acrescentar}
        </Button>
      </form>

      {livres.length > 0 && !cheia ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-muted-foreground text-[11px]">{texto.usadasNaLista}</p>
          <div className="flex flex-wrap gap-1.5">
            {livres.map((tag) => (
              <button
                key={tag}
                type="button"
                title={texto.porTag(tag)}
                onClick={() => acrescentar(tag)}
                className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring inline-flex h-6 items-center gap-1 rounded-full border border-dashed px-2.5 text-xs outline-none focus-visible:ring-2"
              >
                <Plus className="size-3" />
                {tag}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
