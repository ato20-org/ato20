"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCharacters } from "@/hooks/use-characters";
import { useCharacterOwners } from "@/hooks/use-character-owners";
import { normaliza } from "@/lib/search";
import { useWindowStore } from "@/lib/store/use-window-store";
import { createCharacter } from "@/lib/vault/characters";
import { cn } from "@/lib/utils";

/**
 * A lista de personagens da campanha.
 *
 * Só a lista. Antes isto era a coluna esquerda de um diálogo de 768 pixels que
 * trazia a ficha grudada à direita, e o par inteiro era modal — consultar quem
 * era o Edgar cobria o mapa e travava o resto do aplicativo.
 *
 * Clicar num nome abre a ficha como OUTRA janela, e esta continua aberta: é o
 * que permite abrir dois personagens lado a lado, ou fechar a lista e ficar só
 * com a ficha de quem está em cena.
 *
 * O que este caminho escreve é conteúdo de campanha: vai para `personagens/` no
 * vault e viaja no zip.
 */
export function CharactersBody() {
  const { personagens, jogadores, recarregar } = useCharacters();
  const abrir = useWindowStore((state) => state.abrir);

  /** Quem joga cada personagem. É o que a busca também alcança. */
  const donos = useCharacterOwners(jogadores);

  const [busca, setBusca] = useState("");

  const achados = useMemo(() => {
    const termo = normaliza(busca.trim());
    if (!termo || !personagens) return personagens;

    // No nome do personagem E no de quem joga: numa mesa em que todos se
    // chamam pelo nome do personagem, metade da sala é lembrada pelo outro —
    // "quem era o personagem do Dayvson?" é a pergunta real. Mesmo par da
    // busca de jogadores, pelo lado invertido.
    return personagens.filter(
      (personagem) =>
        normaliza(personagem.nome).includes(termo) ||
        (donos.get(personagem.id) ?? []).some((nome) => normaliza(nome).includes(termo)),
    );
  }, [personagens, donos, busca]);

  const abertas = useWindowStore((state) => state.janelas);
  const escolhidos = new Set(
    abertas
      .map((aberta) => (aberta.conteudo.tipo === "personagem" ? aberta.conteudo.personagemId : null))
      .filter((id): id is string => id !== null),
  );

  async function criar() {
    try {
      const novo = await createCharacter("Novo personagem");
      recarregar();
      // Já com a ficha aberta: o gesto seguinte é sempre dar um nome a ele.
      abrir({ tipo: "personagem", personagemId: novo.id });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao criar.");
    }
  }

  return (
    <>
      <div className="space-y-2 p-2">
        <Button variant="outline" size="sm" className="w-full" onClick={() => void criar()}>
          <Plus />
          Novo
        </Button>

        {/* Sempre, e não a partir de um punhado de nomes: com o campo
            aparecendo e desaparecendo conforme a campanha cresce, o mestre não
            pode contar com ele — e é justamente digitar sem olhar que ele quer.
            Mesma decisão da busca de jogadores.

            Sem `autoFocus`, ao contrário de lá: aquele campo vive num popover,
            que abre para receber teclado e fecha ao sair. Esta é uma janela que
            FICA, e roubar o foco do palco a cada abertura atrapalharia quem
            abriu a lista para clicar num nome. */}
        <div className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar personagem ou jogador"
            aria-label="Buscar personagem ou jogador"
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {personagens === null || achados === null ? (
          <p className="text-muted-foreground p-3 text-xs">Lendo…</p>
        ) : personagens.length === 0 ? (
          <p className="text-muted-foreground p-3 text-xs leading-snug">
            Nenhum personagem ainda. Crie um e anexe a ficha dele.
          </p>
        ) : achados.length === 0 ? (
          <p className="text-muted-foreground p-3 text-xs">Nenhum personagem com esse nome.</p>
        ) : (
          <ul className="space-y-0.5 p-2 pt-0">
            {achados.map((personagem) => {
              const quem = donos.get(personagem.id) ?? [];

              return (
                <li key={personagem.id}>
                  <button
                    type="button"
                    className={cn(
                      "w-full rounded-md px-2 py-1.5 text-left",
                      // Marcado é "a ficha dele está aberta", e não "foi o
                      // último clicado": com várias fichas na tela, o destaque
                      // tem de dizer quais são elas.
                      escolhidos.has(personagem.id) ? "bg-accent" : "hover:bg-accent/50",
                    )}
                    onClick={() => abrir({ tipo: "personagem", personagemId: personagem.id })}
                  >
                    <span className="block truncate text-xs">{personagem.nome}</span>

                    {/* Quem joga, embaixo do nome do personagem — o espelho da
                        lista de jogadores, que mostra o personagem embaixo do
                        nome da pessoa. Sem dono não sobra linha em branco: o
                        que importa ali é distinguir o PNJ de quem foi
                        entregue, e um rótulo "sem dono" repetido em vinte
                        linhas de bestiário viraria ruído. */}
                    {quem.length > 0 ? (
                      <span className="text-muted-foreground block truncate text-[10px]">
                        {quem.join(", ")}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </>
  );
}
