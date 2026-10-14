"use client";

import { useState, type ReactElement } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { abrirItem, abrirItemNovo } from "@/components/mestre/acoes-do-item";
import { ImagemDoItem } from "@/components/mestre/imagem-do-item";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { t as textoDosItens } from "@/lib/i18n/itens";
import { t } from "@/lib/i18n/personagens";
import { entregarItem } from "@/lib/mestre/entregar-item";
import { normaliza } from "@/lib/search";
import { itensMudaram, useItens } from "@/lib/store/use-itens-store";
import { addItem } from "@/lib/vault/inventory";
import type { Personagem } from "@/types/character";
import type { Item, ItemInventario } from "@/types/inventory";

/**
 * O `+` da mochila: criar um item novo, ou pôr um que a campanha já tem.
 *
 * As duas portas no MESMO painel, e não um menu de duas linhas que abre outro:
 * o caso comum é "dar a poção de cura que já existe", e um clique a mais para
 * chegar à lista seria cobrado toda vez. Criar fica no alto, sempre à mão; a
 * busca embaixo já nasce com o cursor, e o que se digita serve às duas -- acha
 * o item, ou vira o nome do novo quando não acha.
 *
 * O existente é DADO, como no arrasto da janela de Itens: se a mochila já tem,
 * soma um. O painel avisa antes do clique ("tem ×2"), para o mestre saber que
 * vai somar e não criar uma segunda linha.
 */
export function AdicionarAoInventario({
  personagem,
  naMochila,
  gatilho,
}: {
  personagem: Pick<Personagem, "id" | "nome">;
  /** O que a mochila já tem, para o "tem ×2" de cada linha. */
  naMochila: ItemInventario[];
  /** O botão que abre o painel. Sem `onClick`: quem abre é o painel. */
  gatilho: ReactElement;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger render={gatilho} />
      <PopoverContent side="bottom" align="end" className="w-72 p-0">
        {/* Montado só aberto: a busca começa vazia a cada abertura, e a lista
            não fica viva atrás de um painel fechado. */}
        {aberto ? (
          <Escolha personagem={personagem} naMochila={naMochila} onFeito={() => setAberto(false)} />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function Escolha({
  personagem,
  naMochila,
  onFeito,
}: {
  personagem: Pick<Personagem, "id" | "nome">;
  naMochila: ItemInventario[];
  onFeito: () => void;
}) {
  const itens = useItens();
  const [busca, setBusca] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const digitado = busca.trim();
  const termo = normaliza(digitado);
  const quantos = new Map(naMochila.map((item) => [item.id, item.quantidade]));

  // Por nome, como no catálogo: a lista é para ACHAR.
  const achados = (itens ?? [])
    .filter(
      (item) =>
        !termo || normaliza(item.nome).includes(termo) || normaliza(item.descricao).includes(termo),
    )
    .sort((a, b) => a.nome.localeCompare(b.nome, undefined, { sensitivity: "base" }));

  async function criar() {
    if (ocupado) return;
    setOcupado(true);

    try {
      const item = await addItem(personagem.id, { nome: digitado || textoDosItens.semNome });
      itensMudaram([personagem.id]);
      onFeito();

      // Com nome digitado, o item já nasce chamado -- abre para o resto. Sem,
      // abre com o nome em edição, que é o gesto seguinte.
      if (digitado) abrirItem(item, personagem.id);
      else abrirItemNovo(item, personagem.id);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t.inventario.falhaAoCriar);
    } finally {
      setOcupado(false);
    }
  }

  async function dar(item: Item) {
    if (ocupado) return;
    setOcupado(true);

    // O mesmo caminho do arrasto: soma se já tem, avisa, e as fichas releem.
    await entregarItem(item.id, personagem);
    setOcupado(false);
    onFeito();
  }

  return (
    <div className="flex flex-col">
      <button
        type="button"
        disabled={ocupado}
        className="hover:bg-accent focus-visible:bg-accent flex items-center gap-2 rounded-t-lg px-3 py-2.5 text-left text-sm font-medium outline-none disabled:opacity-60"
        onClick={() => void criar()}
      >
        <span className="bg-primary text-primary-foreground grid size-6 shrink-0 place-items-center rounded-md">
          <Plus className="size-3.5" aria-hidden />
        </span>
        <span className="min-w-0 truncate">
          {digitado ? t.inventario.criarChamado(digitado) : t.inventario.criarNovo}
        </span>
      </button>

      <div className="space-y-1.5 border-t p-2">
        <span className="text-muted-foreground block px-1 text-[10px] font-semibold tracking-[0.12em] uppercase">
          {t.inventario.itemExistente}
        </span>

        <div className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
            aria-hidden
          />
          <Input
            autoFocus
            value={busca}
            aria-label={t.inventario.buscarNoCatalogo}
            placeholder={t.inventario.buscarNoCatalogo}
            className="h-8 pl-7 text-xs"
            onChange={(evento) => setBusca(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key !== "Enter") return;

              // Enter dá o primeiro achado; sem achado, cria com o nome
              // digitado. É o gesto de quem digita sem olhar a lista.
              evento.preventDefault();
              const primeiro = termo ? achados[0] : undefined;
              if (primeiro) void dar(primeiro);
              else if (digitado) void criar();
            }}
          />
        </div>

        {itens === null ? (
          <p className="text-muted-foreground px-1 py-2 text-xs">{textoDosItens.janela.lendo}</p>
        ) : itens.length === 0 ? (
          <p className="text-muted-foreground px-1 py-2 text-xs">{t.inventario.catalogoVazio}</p>
        ) : achados.length === 0 ? (
          <p className="text-muted-foreground px-1 py-2 text-xs">{t.inventario.nenhumAchado}</p>
        ) : (
          <ul className="-mx-1 max-h-64 overflow-y-auto">
            {achados.map((item) => {
              const tem = quantos.get(item.id);

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={ocupado}
                    className="hover:bg-accent focus-visible:bg-accent flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left outline-none disabled:opacity-60"
                    onClick={() => void dar(item)}
                  >
                    <span className="bg-muted/60 relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded border">
                      <ImagemDoItem
                        imagem={item.imagem}
                        className="absolute inset-0 size-full object-cover"
                        classeDoIcone="size-4"
                      />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs">{item.nome}</span>
                    {tem ? (
                      <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
                        {t.inventario.temNaMochila(tem)}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-muted-foreground px-1 text-[10px]">{t.inventario.dicaDoEnter}</p>
      </div>
    </div>
  );
}
