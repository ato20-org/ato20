"use client";

import { useMemo, useRef, useState } from "react";
import {
  MoreVertical,
  Pencil,
  PersonStanding,
  Plus,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PainelVazio } from "@/components/mestre/painel-vazio";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { KIT_CONTEXTO, KIT_TRES_PONTOS, type Kit } from "@/components/ui/menu-kit";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAssetList } from "@/hooks/use-asset-list";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import { useCharacters } from "@/hooks/use-characters";
import { useCharacterOwners } from "@/hooks/use-character-owners";
import {
  aoApertarF2,
  useRenomearPeloMenu,
} from "@/hooks/use-renomear-pelo-menu";
import { OQueVaiJunto } from "@/components/mestre/character-window";
import { centeredBox, fitInitialSize } from "@/lib/geometry/transform";
import { useTokenDrag } from "@/hooks/use-token-drag";
import { MINIATURA } from "@/lib/miniatura";
import { normaliza } from "@/lib/search";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useTokenDragStore } from "@/lib/store/use-token-drag-store";
import { useWindowStore } from "@/lib/store/use-window-store";
import {
  createCharacter,
  linkCharacter,
  removeCharacter,
  renameCharacter,
} from "@/lib/vault/characters";
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
 * Com que tamanho o token entra no mapa, em unidades de cena.
 *
 * Uma funcao e nao duas contas porque os dois gestos que poem o token -- o
 * botao, que poe no centro, e o arrasto, que poe onde a mao soltou -- tem de
 * concordar: o arrasto ainda multiplica isto pelo que a roda pediu, e uma base
 * diferente faria a roda parada dar um token de outro tamanho que o botao.
 */
function tamanhoDoToken(miniatura: AssetMeta | undefined) {
  return miniatura?.naturalWidth && miniatura.naturalHeight
    ? fitInitialSize(miniatura.naturalWidth, miniatura.naturalHeight)
    : TAMANHO_PADRAO;
}

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
  const arrastarToken = useTokenDrag();
  /**
   * Quem está no ar agora, para a linha esmaecer enquanto o token viaja.
   *
   * O único sinal na lista de que o gesto pegou: a sombra do token só aparece
   * depois que o ponteiro alcança o mapa, e no caminho até lá -- sobre a
   * própria janela de personagens -- nada na tela mudava. O arrasto do
   * navegador dava esse sinal de graça, com a imagem colada no cursor.
   *
   * Só o id, e não o arrasto inteiro: este é o único campo que muda uma vez por
   * gesto em vez de uma vez por quadro.
   */
  const noAr = useTokenDragStore((state) =>
    state.arrasto?.fonte.tipo === "personagem"
      ? state.arrasto.fonte.personagemId
      : undefined,
  );

  /** Quem joga cada personagem. É o que a busca também alcança. */
  const donos = useCharacterOwners(jogadores);

  // O acervo serve à lista inteira, e não a uma linha: tanto o botão de pôr no
  // mapa quanto o arrasto precisam do tamanho natural da miniatura. A leitura é
  // compartilhada e sobrevive a quem anexa uma miniatura na ficha ao lado — ver
  // `useAssetsStore`, que é também de onde vinha o bug de o token só poder
  // entrar no mapa depois de reabrir o aplicativo.
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
        (donos.get(personagem.id) ?? []).some((nome) =>
          normaliza(nome).includes(termo),
        ),
    );
  }, [personagens, donos, busca]);

  /**
   * Jogadores em cima, PNJs embaixo.
   *
   * A tag é DERIVADA do vínculo, e não um campo do personagem: quem tem alguém
   * da mesa jogando por ele é jogador, quem não tem é PNJ. Um campo teria de
   * viajar no zip, ter espelho em Rust e ser mantido à mão -- e erraria assim
   * que o mestre entregasse um PNJ a um jogador e esquecesse de trocar.
   *
   * Dois grupos e não uma ordenação: a pergunta na mesa é "onde estão os meus
   * jogadores" e o bestiário de trinta PNJs não pode se misturar com os cinco
   * que importam. O cabeçalho é a tag; um selo repetido em cada linha viraria
   * o mesmo ruído que o "sem dono" virou.
   */
  const grupos = useMemo(() => {
    if (!achados) return null;

    const jogadores: Personagem[] = [];
    const pnjs: Personagem[] = [];
    for (const personagem of achados) {
      ((donos.get(personagem.id) ?? []).length > 0 ? jogadores : pnjs).push(
        personagem,
      );
    }

    return [
      { tag: "Players", personagens: jogadores },
      { tag: "NPCs", personagens: pnjs },
    ].filter((grupo) => grupo.personagens.length > 0);
  }, [achados, donos]);

  const abertas = useWindowStore((state) => state.janelas);
  const fecharJanela = useWindowStore((state) => state.fechar);

  // Lidos AQUI e nao dentro do botao de cada linha: agora sao duas portas para
  // o mesmo gesto -- o botao e o item dos tres pontos --, e `linha` e funcao,
  // onde nao cabe hook.
  const scene = useSceneStore(selectEditingScene);
  const addItem = useSceneStore((state) => state.addItem);
  const select = useSelectionStore((state) => state.select);
  const escolhidos = new Set(
    abertas
      .map((aberta) =>
        aberta.conteudo.tipo === "personagem"
          ? aberta.conteudo.personagemId
          : null,
      )
      .filter((id): id is string => id !== null),
  );

  /**
   * O nome vem ANTES do personagem existir.
   *
   * Antes daqui o botao criava um "Novo personagem" na hora e abria a ficha
   * para renomear. Quem desistia no meio deixava a linha para tras, e duas
   * desistencias viravam dois "Novo personagem" indistinguiveis na lista --
   * era preciso apagar os dois para descobrir qual era qual. Agora desistir
   * nao cria nada, que e o que o gesto sempre quis dizer.
   *
   * String vazia e "o dialogo esta fechado": o campo so existe enquanto ele
   * esta aberto, e nao ha nome a guardar depois.
   */
  const [criando, setCriando] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");

  async function criar() {
    const nome = nomeNovo.trim();
    // Sem nome nao cria: o botao fica desabilitado, e isto aqui e a mesma
    // regra valendo para o Enter do campo.
    if (!nome) return;

    try {
      const novo = await createCharacter(nome);

      // Fecha SO depois de dar certo: falhando, o dialogo fica de pe com o
      // nome ainda digitado, e tentar de novo e clicar em Criar. Fechar antes
      // deixava o mestre com um toast vermelho e o nome perdido.
      setCriando(false);
      setNomeNovo("");
      recarregar();
      // Ja com a ficha aberta: o gesto seguinte e anexar a ficha dele.
      abrir({ tipo: "personagem", personagemId: novo.id });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao criar.");
    }
  }

  function abrirCriacao() {
    setNomeNovo("");
    setCriando(true);
  }

  /**
   * Quem esta na fila da pergunta de apagar.
   *
   * O estado mora AQUI e nao na linha: `linha` e funcao, nao componente, e um
   * `AlertDialog` por personagem encheria a arvore de dialogos fechados numa
   * campanha de trinta nomes. Um so, e ele pergunta por quem estiver aqui.
   */
  const [aApagar, setAApagar] = useState<Personagem | null>(null);

  function apagar(personagem: Personagem) {
    void removeCharacter(personagem.id).then(
      () => {
        // A ficha aberta passaria a apontar para uma pasta que nao existe
        // mais. Quem apaga pela lixeira da propria ficha ja fecha a janela
        // dali; apagando pela lista, quem fecha e este laco.
        for (const aberta of abertas) {
          if (
            aberta.conteudo.tipo === "personagem" &&
            aberta.conteudo.personagemId === personagem.id
          ) {
            fecharJanela(aberta.chave);
          }
        }
        recarregar();
      },
      (cause) =>
        toast.error(cause instanceof Error ? cause.message : "Falha ao apagar."),
    );
  }

  /**
   * Quem esta com o campo de nome aberto, pelo id.
   *
   * Um so, e no pai: `linha` e funcao e nao componente, entao nao pode guardar
   * estado -- e duas linhas em edicao ao mesmo tempo nao e coisa que se queira
   * de qualquer jeito.
   */
  const [renomeando, setRenomeando] = useState<string | null>(null);

  /**
   * Quem o item "Renomear" pediu, enquanto o menu ainda fecha.
   *
   * O `useRenomearPeloMenu` adia a troca da linha pelo campo ate o menu
   * terminar de sair -- ver o porque la. O que ele nao carrega e QUEM foi
   * pedido, e como o hook vive aqui em cima (uma vez, e nao um por linha) o id
   * precisa de um lugar. Referencia e nao estado: ninguem desenha com ele, e
   * so um menu fica aberto por vez.
   */
  const pedidoDeRenome = useRef<string | null>(null);
  const renomear = useRenomearPeloMenu(() => {
    setRenomeando(pedidoDeRenome.current);
  });

  function pedirRenome(personagem: Personagem) {
    pedidoDeRenome.current = personagem.id;
    renomear.pedir();
  }

  function confirmarRenome(personagem: Personagem, nome: string) {
    setRenomeando(null);

    const limpo = nome.trim();
    // Nome vazio ou igual ao que ja era: sair sem escrever. Um personagem sem
    // nome nao se acha na lista nem na busca.
    if (!limpo || limpo === personagem.nome) return;

    void renameCharacter(personagem.id, limpo).then(recarregar, (cause) =>
      toast.error(cause instanceof Error ? cause.message : "Falha ao renomear."),
    );
  }

  function entregar(personagem: Personagem, jogadorId: string) {
    void linkCharacter(jogadorId, personagem.id).then(recarregar, (cause) =>
      toast.error(cause instanceof Error ? cause.message : "Falha ao entregar."),
    );
  }

  /** Uma linha da lista. Função e não componente: partilha `donos`, `assets` e os gestos daqui. */
  function linha(personagem: Personagem) {
    const quem = donos.get(personagem.id) ?? [];
    const miniatura = assets.find(
      (asset) => asset.id === personagem.miniatura,
    );

    // Por NOME e nao por id porque e o nome que o vinculo devolve -- ver
    // `useCharacterOwners`. Dois jogadores homonimos na mesma mesa sumiriam um
    // do outro aqui, e e um preco menor que uma terceira ida ao IPC so para
    // esta lista.
    const livres = jogadores.filter(
      (jogador) => !quem.includes(jogador.nome),
    );

    const impedimento = impedimentoDeMapa(personagem, miniatura, Boolean(scene));

    /**
     * Os itens da linha, escritos uma vez para as duas portas.
     *
     * O botao direito e os tres pontos oferecem o MESMO. Estavam escritos duas
     * vezes aqui, e duas listas irmas e o comeco de uma porta ganhar uma acao
     * que a outra nao tem. Ver `Kit`.
     */
    const itens = ({ Item, Separator, Sub, SubTrigger, SubContent }: Kit) => (
      <>
        <Item onClick={() => pedirRenome(personagem)}>
          <Pencil />
          Renomear
        </Item>

        <Item disabled={impedimento !== null} onClick={porNoMapa}>
          <PersonStanding />
          Pôr no mapa
        </Item>

        <Sub>
          <SubTrigger>
            <UserPlus />
            Entregar a
          </SubTrigger>
          <SubContent>
            {livres.length === 0 ? (
              <Item disabled>
                {jogadores.length === 0
                  ? "Ninguém entrou na mesa ainda"
                  : "Já está com todo mundo"}
              </Item>
            ) : (
              livres.map((jogador) => (
                <Item
                  key={jogador.id}
                  onClick={() => entregar(personagem, jogador.id)}
                >
                  {jogador.nome}
                </Item>
              ))
            )}
          </SubContent>
        </Sub>

        <Separator />

        <Item variant="destructive" onClick={() => setAApagar(personagem)}>
          <Trash2 />
          Apagar personagem
        </Item>
      </>
    );

    function porNoMapa() {
      if (!scene || !personagem.miniatura) return;

      const tamanho = tamanhoDoToken(miniatura);

      select([
        addItem(scene.id, {
          assetId: personagem.miniatura,
          personagemId: personagem.id,
          ...centeredBox(tamanho.x, tamanho.y),
        }),
      ]);
    }

    return (
      // O botao direito na linha abre o menu DELA, e nao o da regiao: o
      // `stopPropagation` e o que impede o evento de subir ate o envelope
      // da lista e trocar "apagar este" por "criar mais um" -- dois menus
      // com sentidos opostos no mesmo gesto.
      <ContextMenu
        key={personagem.id}
        onOpenChangeComplete={renomear.aoFechar}
      >
        <ContextMenuTrigger
          render={
            <li
              className={cn(
                "flex items-center gap-1 rounded-md pr-1",
                // Marcado é "a ficha dele está aberta", e não "foi o
                // último clicado": com várias fichas na tela, o destaque
                // tem de dizer quais são elas. Subiu do botão para a linha
                // porque agora há dois alvos nela.
                escolhidos.has(personagem.id)
                  ? "bg-accent"
                  : "hover:bg-accent/50",
                // Só quem pode ir ao mapa ganha a mão de arrastar: uma
                // linha que promete o gesto e não o cumpre é pior que uma
                // que não o promete.
                miniatura
                  ? "cursor-grab select-none active:cursor-grabbing"
                  : null,
                noAr === personagem.id && "opacity-40",
              )}
              // Para aqui, e nao sobe: acima desta linha ha o envelope da
              // lista, cujo menu diz "criar personagem". Deixar subir faria
              // o mesmo botao direito abrir o menu errado em cima do nome.
              onContextMenu={(event) => event.stopPropagation()}
              // Arrastável inteira, e não só o rosto: o quadrado de 28px
              // seria o menor alvo da tela.
              //
              // Gesto próprio e não o arrasto do navegador, ao contrário da
              // linha do acervo: é o que permite a sombra do token no mapa e
              // a roda escolhendo o tamanho no ar -- ver `useTokenDrag`.
              //
              // O clique no nome continua abrindo a ficha: o token só é
              // levantado depois que o ponteiro anda, e a partir daí o
              // clique do fim do gesto é engolido.
              onPointerDown={(event) => {
                // Com o campo de nome aberto o arrasto sai de cena: o clique
                // que entra no campo caia aqui primeiro e levantava um token,
                // e o gesto de posicionar o cursor no meio do nome virava um
                // token largado no mapa.
                if (renomeando === personagem.id) return;
                if (!miniatura) return;

                const tamanho = tamanhoDoToken(miniatura);

                arrastarToken(event, {
                  fonte: {
                    tipo: "personagem",
                    personagemId: personagem.id,
                    assetId: miniatura.id,
                  },
                  largura: tamanho.x,
                  altura: tamanho.y,
                });
              }}
            />
          }
        >
          {renomeando === personagem.id ? (
            // O campo NO LUGAR da linha, e nao por cima dela: o nome
            // sendo editado e a unica coisa que interessa enquanto o
            // campo existe, e os dois botoes da direita so dariam
            // alvo para o clique que confirma sem querer.
            <Input
              autoFocus
              defaultValue={personagem.nome}
              className="h-7 flex-1 text-xs"
              aria-label={`Novo nome de ${personagem.nome}`}
              // Clicar fora confirma, como na lista de cenas: o gesto
              // de quem terminou e sair, e perder o que se digitou por
              // isso seria a surpresa mais cara da tela.
              onBlur={(event) =>
                confirmarRenome(personagem, event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  confirmarRenome(personagem, event.currentTarget.value);
                }
                if (event.key === "Escape") setRenomeando(null);
              }}
            />
          ) : (
            <>
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left"
                onClick={() =>
                  abrir({ tipo: "personagem", personagemId: personagem.id })
                }
                // Duplo clique renomeia, como na lista de cenas e no
                // gerenciador de arquivos. O clique simples ja abriu a ficha
                // -- e e assim que se quer: quem errou o gesto ve a ficha
                // aparecer, nao perde nada.
                onDoubleClick={() => setRenomeando(personagem.id)}
                // F2 renomeia, para quem chegou na linha pelo teclado e nunca
                // alcancaria nem o duplo clique nem os tres pontos. Ver
                // `aoApertarF2`.
                onKeyDown={aoApertarF2(() => setRenomeando(personagem.id))}
              >
                <Rosto personagem={personagem} />

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs">
                    {personagem.nome}
                  </span>

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
                </span>
              </button>

              <PorNoMapa
                personagem={personagem}
                impedimento={impedimento}
                onPor={porNoMapa}
              />

              {/* Os tres pontos carregam TUDO o que a linha faz, o menu
                  do botao direito carrega o mesmo, e o botao de por no
                  mapa fica de fora como atalho. Mesmo arranjo da lista
                  de cenas: a acao do dia a dia a um clique, o resto
                  atras de um menu que nao ocupa a linha. */}
              <DropdownMenu onOpenChangeComplete={renomear.aoFechar}>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground shrink-0"
                      aria-label={`Opções de ${personagem.nome}`}
                    >
                      <MoreVertical />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end" className="w-52">
                  {itens(KIT_TRES_PONTOS)}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </ContextMenuTrigger>

        {/* As MESMAS acoes dos tres pontos, e nesta ordem. Duas portas para o
            mesmo lugar: o menu de contexto e o caminho de quem ja sabe onde
            clicar, os tres pontos sao o de quem esta procurando. Divergir aqui
            faria o botao direito parecer uma terceira coisa. */}
        <ContextMenuContent className="w-52">{itens(KIT_CONTEXTO)}</ContextMenuContent>
      </ContextMenu>
    );
  }

  return (
    <>
      {/* Busca e criar na MESMA linha, e a busca com a fatia maior: numa janela
          estreita, o botao de largura cheia empurrava a lista para baixo e
          gastava a altura util com uma acao que o mestre usa uma vez por
          personagem. Buscar ele faz o tempo todo. */}
      <div className="flex items-center gap-2 p-2">
        {/* Sempre, e não a partir de um punhado de nomes: com o campo
            aparecendo e desaparecendo conforme a campanha cresce, o mestre não
            pode contar com ele — e é justamente digitar sem olhar que ele quer.
            Mesma decisão da busca de jogadores.

            Sem `autoFocus`, ao contrário de lá: aquele campo vive num popover,
            que abre para receber teclado e fecha ao sair. Esta é uma janela que
            FICA, e roubar o foco do palco a cada abertura atrapalharia quem
            abriu a lista para clicar num nome. */}
        <div className="relative min-w-0 flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
            aria-hidden
          />
          {/* Sem fundo, ao contrario do resto dos campos: aqui ele divide a
              linha com o botao redondo, e duas caixas preenchidas lado a lado
              competiam pelo olho. A borda sozinha ja diz que se digita aqui. */}
          <Input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar personagem ou jogador"
            aria-label="Buscar personagem ou jogador"
            className="h-8 bg-transparent pl-8 text-xs dark:bg-transparent"
          />
        </div>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 rounded-full"
                aria-label="Criar personagem"
                onClick={abrirCriacao}
              >
                <Plus />
              </Button>
            }
          />
          <TooltipContent>Criar personagem</TooltipContent>
        </Tooltip>
      </div>

      {/* O menu de contexto pega a REGIAO da lista, e nao so as linhas: o vazio
          abaixo do ultimo nome e onde a mao vai quando quer somar mais um, e e
          o gesto que o gerenciador de arquivos ensinou. Fica fora do cabecalho
          de proposito -- botao direito no campo de busca tem de continuar
          dando o menu do sistema, com o colar dentro dele. */}
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <div className="flex min-h-0 flex-1 flex-col">
              <ScrollArea className="min-h-0 flex-1">
                {personagens === null || achados === null ? (
                  <p className="text-muted-foreground p-3 text-xs">Lendo…</p>
                ) : personagens.length === 0 ? (
                  <PainelVazio conteudo={{ tipo: "personagens" }}>
                    Crie o primeiro personagem
                  </PainelVazio>
                ) : achados.length === 0 ? (
                  <p className="text-muted-foreground p-3 text-xs">
                    Nenhum personagem com esse nome.
                  </p>
                ) : (
                  <div className="space-y-2 p-2 pt-0">
                    {grupos?.map((grupo) => (
                      <section key={grupo.tag} aria-label={grupo.tag}>
                        <h3 className="text-muted-foreground flex items-center gap-1.5 px-2 pt-1 pb-1 text-[10px] font-medium tracking-wide uppercase">
                          {grupo.tag}
                          <span className="tabular-nums opacity-70">
                            {grupo.personagens.length}
                          </span>
                        </h3>
                        <ul className="space-y-0.5">
                          {grupo.personagens.map(linha)}
                        </ul>
                      </section>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          }
        />

        <ContextMenuContent>
          <ContextMenuItem onClick={abrirCriacao}>
            <Plus />
            Criar personagem
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* O nome ANTES de existir personagem. Ver `criar`. */}
      <Dialog
        open={criando}
        onOpenChange={(aberto) => {
          setCriando(aberto);
          if (!aberto) setNomeNovo("");
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Criar novo personagem</DialogTitle>
            {/* Diz o que ESTE dialogo espera, e nao o que se pode fazer depois
                dele: aqui estava a dica de que F2 renomeia, que e verdade e nao
                e da hora -- quem abriu quer criar, e leu uma instrucao sobre
                editar. A linha agora responde a unica pergunta da tela: por que
                ela pede alguma coisa antes de criar. */}
            <DialogDescription>
              O novo personagem precisa de um nome primeiro
            </DialogDescription>
          </DialogHeader>

          <Input
            autoFocus
            value={nomeNovo}
            onChange={(event) => setNomeNovo(event.target.value)}
            placeholder="Nome do personagem"
            aria-label="Nome do personagem"
            onKeyDown={(event) => {
              if (event.key === "Enter") void criar();
            }}
          />

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCriando(false)}>
              Cancelar
            </Button>
            {/* Desabilitado sem nome: e a mesma regra do Enter, dita antes do
                clique em vez de depois. */}
            <Button disabled={!nomeNovo.trim()} onClick={() => void criar()}>
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pergunta antes, como a lixeira da ficha pergunta -- e pelo mesmo
          motivo: apagar cena ou imagem tem desfazer, isto nao tem. O menu de
          contexto e um caminho mais curto ate o gesto, e caminho curto para
          coisa sem volta e exatamente onde a pergunta precisa existir. */}
      <AlertDialog
        open={aApagar !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setAApagar(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deseja apagar {aApagar?.nome}?</AlertDialogTitle>
            {/* Ver a gemea na ficha: a descricao nasce `<p>`, e a lista
                precisa de um elemento que aceite `<ul>` dentro. */}
            <AlertDialogDescription render={<div className="space-y-2" />}>
              <OQueVaiJunto />
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (aApagar) apagar(aApagar);
              }}
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * O rosto do personagem na lista.
 *
 * RETRATO primeiro, miniatura como reserva. São duas imagens com papéis
 * diferentes — o retrato é a cara dele, a miniatura é a peça no mapa —, e a
 * pergunta que esta lista responde é "qual deles é este". Quando só existe a
 * miniatura ela serve, porque ainda é mais reconhecível que o nome.
 *
 * A variante `mini`: são alguns KB por linha contra os megabytes do original, e
 * numa campanha com trinta personagens a lista carregaria o acervo inteiro para
 * desenhar quadrados de 28 pixels.
 *
 * Quadrado vazio quando não há nenhuma das duas, e não o ícone de pessoa: a
 * lista tem PNJ sem imagem às dezenas, e um boneco repetido em vinte linhas
 * viraria ruído do mesmo jeito que o rótulo "sem dono" virava.
 */
function Rosto({ personagem }: { personagem: Personagem }) {
  const url = useAssetUrl(personagem.retrato ?? personagem.miniatura, "mini");

  return (
    <span className="bg-muted/60 size-7 shrink-0 overflow-hidden rounded border">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          draggable={false}
          className="size-full object-cover"
          {...MINIATURA}
        />
      ) : null}
    </span>
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
 *
 * O botao continua existindo ao lado do arrasto da linha porque os dois gestos
 * respondem perguntas diferentes: o botao poe no CENTRO do que o mestre esta
 * vendo, sem ele precisar mirar, e o arrasto poe ONDE a mao soltou -- e, desde
 * a sombra no mapa, com o tamanho escolhido na roda. Ver `useTokenDrag`.
 */
/**
 * Por que este personagem NAO pode ir ao mapa agora, ou `null`.
 *
 * Funcao de modulo e nao calculo dentro do botao porque duas portas fazem a
 * mesma pergunta -- o botao da linha e o item "Por no mapa" dos tres pontos --
 * e um menu que oferece o que o botao ao lado recusa e pior que nao ter menu.
 */
function impedimentoDeMapa(
  personagem: Personagem,
  miniatura: AssetMeta | undefined,
  temMapa: boolean,
): string | null {
  if (!personagem.miniatura) return "Sem miniatura. Anexe uma na ficha dele.";
  if (!temMapa) return "Nenhum mapa aberto.";

  // Sem o registro do acervo nao se sabe a proporcao da imagem, e por o token
  // com tamanho chutado o deixa esticado PARA SEMPRE: o gizmo do item trava a
  // proporcao, entao nem redimensionando se corrige.
  //
  // Vale para os dois casos em que o registro falta -- o acervo ainda nao
  // respondeu, ou a imagem foi apagada de la. No segundo, desabilitar e o
  // certo de qualquer jeito: nao ha imagem para por no mapa.
  if (!miniatura) {
    return "Lendo o acervo. Se insistir, a imagem da miniatura pode ter sido apagada.";
  }

  return null;
}

function PorNoMapa({
  personagem,
  impedimento,
  onPor,
}: {
  personagem: Personagem;
  impedimento: string | null;
  onPor: () => void;
}) {
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
            onClick={onPor}
          >
            <PersonStanding />
          </Button>
        }
      />
      <TooltipContent>
        <p className="max-w-48">
          {impedimento ??
            `Por ${personagem.nome} no centro do mapa. Arraste a linha para escolher o lugar, e role a roda no ar para o tamanho.`}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
