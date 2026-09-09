"use client";

import { useMemo, useState } from "react";
import { PersonStanding, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAssetList } from "@/hooks/use-asset-list";
import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import { useCharacters } from "@/hooks/use-characters";
import { useCharacterOwners } from "@/hooks/use-character-owners";
import { centeredBox, fitInitialSize } from "@/lib/geometry/transform";
import { normaliza } from "@/lib/search";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useWindowStore } from "@/lib/store/use-window-store";
import { createCharacter } from "@/lib/vault/characters";
import type { Personagem } from "@/types/character";
import type { AssetMeta } from "@/types/scene";
import { cn } from "@/lib/utils";

/**
 * Tamanho de um token cuja imagem nao declara dimensao.
 *
 * Menor que o do acervo (480x270, medida de mapa): token e figura de pessoa
 * sobre a grade, e nascer do tamanho de um mapa faria o mestre encolher toda
 * vez.
 *
 * Em pe, e nao quadrado. Era quadrado, e o resultado era uma pessoa esticada
 * na largura -- e o gizmo do item trava a proporcao, entao redimensionar depois
 * mantinha o erro: o token nascia quadrado e continuava quadrado para sempre. A
 * unica saida era apagar e por de novo.
 *
 * Continua sendo chute, porque sem a medida do arquivo nao ha o que preservar.
 * Chute de figura em pe erra menos que chute de quadrado, e e usado so quando o
 * acervo nao sabe a dimensao -- ver `PorNoMapa`, que exige o registro do
 * acervo justamente para nao precisar chutar.
 */
const TAMANHO_PADRAO = { x: 140, y: 187 };

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
  const abrir = useAbrirJanela();

  /** Quem joga cada personagem. É o que a busca também alcança. */
  const donos = useCharacterOwners(jogadores);

  // Uma leitura do acervo para a lista inteira, e não uma por linha: o botão de
  // pôr no mapa precisa do tamanho natural da miniatura, e um `useAssetList`
  // dentro dele custaria uma ida ao IPC por personagem. Mesma razão do cache de
  // personagens — ver `useCharactersStore`.
  const { assets } = useAssetList("image");

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
                <li
                  key={personagem.id}
                  className={cn(
                    "flex items-center gap-1 rounded-md pr-1",
                    // Marcado é "a ficha dele está aberta", e não "foi o
                    // último clicado": com várias fichas na tela, o destaque
                    // tem de dizer quais são elas. Subiu do botão para a linha
                    // porque agora há dois alvos nela.
                    escolhidos.has(personagem.id) ? "bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left"
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

                  <PorNoMapa
                    personagem={personagem}
                    miniatura={assets.find((asset) => asset.id === personagem.miniatura)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </>
  );
}

/**
 * Poe o token do personagem no mapa.
 *
 * A miniatura JA e um asset do acervo -- e por isso que ela e asset e nao anexo,
 * para alcancar a TV --, entao isto reusa o mesmo caminho do `+` do acervo:
 * nasce centrado no que o mestre esta vendo, no tamanho que a imagem pede, e ja
 * selecionado, porque o gesto seguinte e arrastar para o lugar.
 *
 * A diferenca e o `personagemId`: o item passa a saber de quem ele e. Sem isso o
 * token e uma imagem como outra qualquer, e a lista de camadas o chama de
 * "Personagem - Edgar.png" em vez de "Edgar".
 *
 * Sem miniatura o botao fica desabilitado com o motivo, e nao escondido: o lugar
 * onde ele apareceria e a pista de que existe um campo a preencher.
 */
function PorNoMapa({
  personagem,
  /**
   * A miniatura no acervo, quando ela existe la.
   *
   * Vem de fora porque quem le o acervo e a lista, uma vez para todas as
   * linhas. Serve para o tamanho natural: uma miniatura de 512 pixels e uma de
   * 64 nao podem entrar no mapa do mesmo tamanho.
   */
  miniatura,
}: {
  personagem: Personagem;
  miniatura: AssetMeta | undefined;
}) {
  const scene = useSceneStore(selectEditingScene);
  const addItem = useSceneStore((state) => state.addItem);
  const select = useSelectionStore((state) => state.select);

  const impedimento = !personagem.miniatura
    ? "Sem miniatura. Anexe uma na ficha dele."
    : !scene
      ? "Nenhuma cena aberta."
      : // Sem o registro do acervo nao se sabe a proporcao da imagem, e por o
        // token com tamanho chutado o deixa esticado PARA SEMPRE: o gizmo do
        // item trava a proporcao, entao nem redimensionando se corrige.
        //
        // Vale para os dois casos em que o registro falta -- o acervo ainda
        // nao respondeu, ou a imagem foi apagada de lá. No segundo, desabilitar
        // e o certo de qualquer jeito: nao ha imagem para por no mapa.
        !miniatura
        ? "Lendo o acervo. Se insistir, a imagem da miniatura pode ter sido apagada."
        : null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground shrink-0"
            aria-label={`Por o token de ${personagem.nome} no mapa`}
            disabled={impedimento !== null}
            onClick={() => {
              if (!scene || !personagem.miniatura) return;

              const tamanho =
                miniatura?.naturalWidth && miniatura.naturalHeight
                  ? fitInitialSize(miniatura.naturalWidth, miniatura.naturalHeight)
                  : TAMANHO_PADRAO;

              select([
                addItem(scene.id, {
                  assetId: personagem.miniatura,
                  personagemId: personagem.id,
                  ...centeredBox(tamanho.x, tamanho.y),
                }),
              ]);
            }}
          >
            <PersonStanding />
          </Button>
        }
      />
      <TooltipContent>
        <p className="max-w-48">{impedimento ?? `Por ${personagem.nome} no mapa`}</p>
      </TooltipContent>
    </Tooltip>
  );
}
