"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  FolderPlus,
  MoreVertical,
  Pencil,
  PersonStanding,
  Plus,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { MiniaturaDoAcervo, useAnimada } from "@/components/mestre/miniatura-do-acervo";
import {
  FimDaLista,
  ItensDeMover,
  PastaRow,
  PREFIXO_PASTA,
  RECUO_PX,
} from "@/components/mestre/arvore-de-pastas";
import { CampoDeBusca } from "@/components/mestre/campo-de-busca";
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
import { ItensDeExtensao } from "@/components/mestre/itens-de-extensao";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAssetList } from "@/hooks/use-asset-list";
import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import { useCharacters } from "@/hooks/use-characters";
import { useCharacterOwners } from "@/hooks/use-character-owners";
import {
  aoApertarF2,
  useRenomearPeloMenu,
} from "@/hooks/use-renomear-pelo-menu";
import { useCampoDeNome } from "@/hooks/use-campo-de-nome";
import { useListReorder } from "@/hooks/use-list-reorder";
import { OQueVaiJunto } from "@/components/mestre/character-window";
import { centeredBox, fitInitialSize } from "@/lib/geometry/transform";
import { useTokenDrag } from "@/hooks/use-token-drag";
import {
  achatarArvore,
  caminhoDaPasta,
  pastaDoMembro,
  pastasDaLista,
} from "@/lib/mestre/arvore-de-pastas";
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
import type { AssetMeta, Pasta } from "@/types/scene";

/** A seção de um personagem na lista, que é também a lista das pastas dela. */
type Secao = "players" | "npcs";

/** Onde a linha está: a seção, as pastas dela e o nível na árvore. */
type LugarDaLinha = {
  secao: Secao;
  pastas: Pasta[];
  depth: number;
  /** O caminho da pasta, mostrado no achado da busca. */
  caminho?: string;
};
import { cn } from "@/lib/utils";
import { SubmenuDeAparencias } from "@/components/mestre/aparencias-personagem";

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
/**
 * O campo que renomeia a linha.
 *
 * Componente, e nao JSX solto dentro de `linha`: aquela e uma FUNCAO, chamada
 * durante o desenho, e hook nao entra ali. As tres saidas do renome -- clicar
 * fora grava, Enter grava, Escape desiste -- vem de `useCampoDeNome`, que e o
 * mesmo das outras telas que renomeiam.
 */
function CampoDoNome({
  personagem,
  aoGravar,
  aoSair,
}: {
  personagem: Personagem;
  aoGravar: (nome: string) => void;
  aoSair: () => void;
}) {
  const campo = useCampoDeNome({ nome: personagem.nome, aoGravar, aoSair });

  return (
    <Input
      autoFocus
      {...campo}
      className="h-7 flex-1 text-xs"
      aria-label={`Novo nome de ${personagem.nome}`}
    />
  );
}

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
  const buscando = busca.trim() !== "";

  const todasAsPastas = useSceneStore((state) => state.board?.pastas);
  const pastasDe = useMemo(
    () => ({
      players: pastasDaLista(todasAsPastas, "players"),
      npcs: pastasDaLista(todasAsPastas, "npcs"),
    }),
    [todasAsPastas],
  );

  /**
   * A seção é DERIVADA do vínculo -- ver `grupos` abaixo --, e a pasta é da
   * seção: o NPC que vira Player sai da pasta de NPCs na tela, e volta para
   * ela se o jogador sair.
   */
  const caminhoDe = useCallback(
    (personagem: Personagem) => {
      const secao: Secao =
        (donos.get(personagem.id) ?? []).length > 0 ? "players" : "npcs";
      const pastas = pastasDe[secao];
      return caminhoDaPasta(pastas, pastaDoMembro(pastas, personagem.id));
    },
    [donos, pastasDe],
  );

  const achados = useMemo(() => {
    const termo = normaliza(busca.trim());
    if (!termo || !personagens) return personagens;

    // No nome do personagem E no de quem joga: numa mesa em que todos se
    // chamam pelo nome do personagem, metade da sala é lembrada pelo outro —
    // "quem era o personagem do Dayvson?" é a pergunta real. Mesmo par da
    // busca de jogadores, pelo lado invertido.
    //
    // E no nome da pasta: "taverna" traz quem mora na pasta Taverna, que é o
    // jeito de achar o dono da estalagem sem lembrar o nome dele.
    return personagens.filter(
      (personagem) =>
        normaliza(personagem.nome).includes(termo) ||
        (donos.get(personagem.id) ?? []).some((nome) =>
          normaliza(nome).includes(termo),
        ) ||
        normaliza(caminhoDe(personagem)).includes(termo),
    );
  }, [personagens, donos, busca, caminhoDe]);

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

    // A seção sem ninguém continua de pé quando tem pasta, fora da busca: é a
    // pasta vazia recém-criada, esperando quem entre nela.
    return (
      [
        { tag: "Players", secao: "players", personagens: jogadores },
        { tag: "NPCs", secao: "npcs", personagens: pnjs },
      ] as const
    ).filter(
      (grupo) =>
        grupo.personagens.length > 0 ||
        (!buscando && pastasDe[grupo.secao].length > 0),
    );
  }, [achados, donos, buscando, pastasDe]);

  /**
   * Soltar o personagem sobre uma pasta da seção dele o põe lá dentro. É o
   * MESMO arrasto que leva o token ao mapa: a linha inteira já é esse gesto, e
   * um segundo arrasto na mesma linha brigaria com ele. Ver `aceita`.
   */
  useEffect(
    () =>
      useTokenDragStore.getState().registrarAlvo("personagens", (solto, destino) => {
        if (solto.fonte.tipo !== "personagem" || destino.tipo !== "pasta-personagens") return;
        useSceneStore
          .getState()
          .moverPersonagemParaPasta(solto.fonte.personagemId, destino.lista, destino.pastaId);
      }),
    [],
  );

  /**
   * Onde o personagem arrastado cai, como `secao:pastaId` -- `secao:` é a raiz
   * dela --, para a borda acender só ali.
   */
  const alvoDoArrasto = useTokenDragStore((state) =>
    state.arrasto?.destino?.tipo === "pasta-personagens"
      ? `${state.arrasto.destino.lista}:${state.arrasto.destino.pastaId ?? ""}`
      : null,
  );

  function criarPasta(secao: Secao) {
    useSceneStore
      .getState()
      .criarPasta(`Pasta ${pastasDe[secao].length + 1}`, undefined, secao);
  }

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

  /**
   * Grava o nome novo. Sair do campo e o vazio sao tratados em
   * `useCampoDeNome`, que e o mesmo das outras telas que renomeiam.
   */
  function gravarRenome(personagem: Personagem, nome: string) {
    void renameCharacter(personagem.id, nome).then(recarregar, (cause) =>
      toast.error(cause instanceof Error ? cause.message : "Falha ao renomear."),
    );
  }

  function entregar(personagem: Personagem, jogadorId: string) {
    void linkCharacter(jogadorId, personagem.id).then(recarregar, (cause) =>
      toast.error(cause instanceof Error ? cause.message : "Falha ao entregar."),
    );
  }

  /** Uma linha da lista. Função e não componente: partilha `donos`, `assets` e os gestos daqui. */
  function linha(personagem: Personagem, lugar: LugarDaLinha) {
    const pastaAtual = pastaDoMembro(lugar.pastas, personagem.id);
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
    const itens = (kit: Kit) => {
      const { Item, Separator, Sub, SubTrigger, SubContent } = kit;

      return (
      <>
        <Item onClick={() => pedirRenome(personagem)}>
          <Pencil />
          Renomear
        </Item>

        <Item disabled={impedimento !== null} onClick={porNoMapa}>
          <PersonStanding />
          Pôr no mapa
        </Item>

        {/* Ao lado de "Pôr no mapa" porque os dois falam da peça: um a põe lá,
            o outro troca a cara dela. */}
        <SubmenuDeAparencias
          kit={kit}
          personagem={personagem}
          onChanged={recarregar}
        />

        {/* As pastas da seção dele. É também o caminho de quem não tem
            miniatura, e por isso não arrasta. */}
        <ItensDeMover
          kit={kit}
          atual={pastaAtual}
          destinos={lugar.pastas}
          onMover={(destino) =>
            useSceneStore
              .getState()
              .moverPersonagemParaPasta(personagem.id, lugar.secao, destino)
          }
        />

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

        <ItensDeExtensao
          alvo="linha.personagem"
          contexto={{ alvo: "linha.personagem", personagemId: personagem.id }}
          kit={kit}
        />
      </>
      );
    };

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
                // Todo personagem arrasta: com miniatura ele vai ao mapa, e
                // com ou sem ela entra numa pasta e vira menção na nota.
                "cursor-grab select-none active:cursor-grabbing",
                noAr === personagem.id && "opacity-40",
              )}
              style={
                lugar.depth > 0
                  ? { paddingLeft: lugar.depth * RECUO_PX }
                  : undefined
              }
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

                const tamanho = tamanhoDoToken(miniatura);

                arrastarToken(event, {
                  fonte: {
                    tipo: "personagem",
                    personagemId: personagem.id,
                    // Vazio sem miniatura: o palco recusa, a pasta aceita.
                    // Ver `aceita`.
                    assetId: miniatura?.id ?? "",
                    secao: lugar.secao,
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
            <CampoDoNome
              personagem={personagem}
              aoGravar={(nome) => gravarRenome(personagem, nome)}
              aoSair={() => setRenomeando(null)}
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
                  {quem.length > 0 || lugar.caminho ? (
                    <span className="text-muted-foreground block truncate text-[10px]">
                      {[lugar.caminho, quem.join(", ")].filter(Boolean).join(" · ")}
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
        {/* Sem fundo, ao contrario do resto dos campos: aqui ele divide a
            linha com o botao redondo, e duas caixas preenchidas lado a lado
            competiam pelo olho. A borda sozinha ja diz que se digita aqui. */}
        <CampoDeBusca
          valor={busca}
          onMudar={setBusca}
          placeholder="Buscar personagem ou jogador"
          rotulo="Buscar personagem ou jogador"
          dica="Acha pelo nome do personagem, de quem joga e da pasta. Esc limpa."
        />

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
                      <SecaoDaLista
                        key={grupo.tag}
                        tag={grupo.tag}
                        secao={grupo.secao}
                        personagens={grupo.personagens}
                        pastas={pastasDe[grupo.secao]}
                        buscando={buscando}
                        alvoDoArrasto={alvoDoArrasto}
                        linha={linha}
                        onCriarPasta={() => criarPasta(grupo.secao)}
                      />
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
          {/* As duas, porque o vazio não é de seção nenhuma: a pasta tem de
              saber de qual é para nascer no lugar certo. */}
          <ContextMenuItem onClick={() => criarPasta("npcs")}>
            <FolderPlus />
            Nova pasta em NPCs
          </ContextMenuItem>
          <ContextMenuItem onClick={() => criarPasta("players")}>
            <FolderPlus />
            Nova pasta em Players
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
 * Uma seção da lista -- Players ou NPCs -- com a árvore de pastas dela.
 *
 * Componente, e não um trecho do `CharactersBody`, porque cada seção tem o seu
 * `useListReorder`: é ele que arrasta uma PASTA para dentro de outra. A linha
 * do personagem não passa por ele -- ela já é o arrasto do token, que entra na
 * pasta pelo alvo `pasta-personagens`.
 */
function SecaoDaLista({
  tag,
  secao,
  personagens,
  pastas,
  buscando,
  alvoDoArrasto,
  linha,
  onCriarPasta,
}: {
  tag: string;
  secao: Secao;
  personagens: Personagem[];
  pastas: Pasta[];
  buscando: boolean;
  /** `secao:pastaId` sob o personagem arrastado. Ver `CharactersBody`. */
  alvoDoArrasto: string | null;
  linha: (personagem: Personagem, lugar: LugarDaLinha) => ReactNode;
  onCriarPasta: () => void;
}) {
  const linhas = buscando
    ? null
    : achatarArvore(personagens, pastas, (personagem) =>
        pastaDoMembro(pastas, personagem.id),
      );

  const { listRef, dropIndex, startReorder } = useListReorder<string>(
    (arrastado, index) => {
      if (!linhas || !arrastado.startsWith(PREFIXO_PASTA)) return;

      const pastaId = arrastado.slice(PREFIXO_PASTA.length);
      const alvo = linhas[index];
      // Sobre uma pasta, entra nela; sobre um personagem, vai para a pasta
      // dele; no fim da lista, raiz. O store recusa ciclo.
      const destino = !alvo
        ? undefined
        : alvo.tipo === "pasta"
          ? alvo.pasta.id
          : pastaDoMembro(pastas, alvo.item.id);
      if (destino !== pastaId) useSceneStore.getState().moverPasta(pastaId, destino);
    },
    "sobre",
  );

  const alvo = { "data-pasta-personagens": secao };

  return (
    <section aria-label={tag}>
      {/* O cabeçalho é a RAIZ da seção para o arrasto: soltar nele tira o
          personagem da pasta. */}
      <h3
        {...alvo}
        className={cn(
          "group text-muted-foreground flex items-center gap-1.5 rounded-md px-2 pt-1 pb-1 text-[10px] font-medium tracking-wide uppercase",
          alvoDoArrasto === `${secao}:` && "ring-primary ring-1",
        )}
      >
        {tag}
        <span className="tabular-nums opacity-70">{personagens.length}</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="ml-auto opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                aria-label={`Nova pasta em ${tag}`}
                onClick={onCriarPasta}
              >
                <FolderPlus />
              </Button>
            }
          />
          <TooltipContent>Nova pasta em {tag}</TooltipContent>
        </Tooltip>
      </h3>

      <ul ref={listRef} className="space-y-0.5">
        {linhas === null
          ? // Na busca, os achados em lista, com a pasta de cada um embaixo do
            // nome: abrir a árvore mostraria as pastas sem quem foi achado.
            personagens.map((personagem) =>
              linha(personagem, {
                secao,
                pastas,
                depth: 0,
                caminho: caminhoDaPasta(pastas, pastaDoMembro(pastas, personagem.id)),
              }),
            )
          : linhas.map((linhaDaArvore, index) =>
              linhaDaArvore.tipo === "pasta" ? (
                <PastaRow
                  key={linhaDaArvore.pasta.id}
                  pasta={linhaDaArvore.pasta}
                  pastas={pastas}
                  depth={linhaDaArvore.depth}
                  total={linhaDaArvore.total}
                  dropTarget={
                    dropIndex === index ||
                    alvoDoArrasto === `${secao}:${linhaDaArvore.pasta.id}`
                  }
                  onReorderStart={startReorder}
                  alvo={alvo}
                />
              ) : (
                linha(linhaDaArvore.item, {
                  secao,
                  pastas,
                  depth: linhaDaArvore.depth,
                })
              ),
            )}
      </ul>

      {/* O fim da seção também é raiz, para a pasta arrastada e para o
          personagem. Só com pasta: sem nenhuma, o aviso falaria do que não
          existe. */}
      {linhas && pastas.length > 0 ? (
        <FimDaLista
          ativo={
            dropIndex === linhas.length || alvoDoArrasto === `${secao}:`
          }
          alvo={alvo}
        />
      ) : null}
    </section>
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
  const rosto = personagem.retrato ?? personagem.miniatura;
  const animada = useAnimada(rosto);

  return (
    <span className="bg-muted/60 relative size-7 shrink-0 overflow-hidden rounded border">
      {/* Sem selo: num quadrado de 28px ele cobriria o rosto. O hover na
          linha continua animando. */}
      <MiniaturaDoAcervo assetId={rosto} animada={animada} selo={false} />
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
