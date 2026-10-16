"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  BookCopy,
  Download,
  FolderPlus,
  Maximize2,
  Package,
  PackagePlus,
  Plus,
  Skull,
  Tags,
  Trash2,
  Upload,
  UserPlus,
  X,
} from "lucide-react";

import {
  abrirItem,
  abrirItemNovo,
  apagarDaCampanha,
} from "@/components/mestre/acoes-do-item";
import {
  ItensDeMover,
  PastaRow,
  RECUO_PX,
  TresPontos,
} from "@/components/mestre/arvore-de-pastas";
import { CampoDeBusca } from "@/components/mestre/campo-de-busca";
import { tamanhoDoToken } from "@/components/mestre/characters-window";
import { ConfirmarRemocao } from "@/components/mestre/confirmar-remocao";
import { ImagemDoItem, imagemDesenhada } from "@/components/mestre/imagem-do-item";
import { MiniaturaDoAcervo } from "@/components/mestre/miniatura-do-acervo";
import { PainelVazio } from "@/components/mestre/painel-vazio";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { KIT_CONTEXTO, type Kit } from "@/components/ui/menu-kit";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import { useAssetList } from "@/hooks/use-asset-list";
import { useCharacters } from "@/hooks/use-characters";
import { useTokenDrag } from "@/hooks/use-token-drag";
import { fitInitialSize } from "@/lib/geometry/transform";
import { t as textoDosItens } from "@/lib/i18n/itens";
import { t } from "@/lib/i18n/mestre";
import {
  achatarArvore,
  caminhoDaPasta,
  pastaDoMembro,
  pastasDaLista,
} from "@/lib/mestre/arvore-de-pastas";
import {
  blocosDaArvore,
  cortarArvore,
  filtrarNoCompendio,
  tagsDaLista,
  temTag,
  type FiltroDoCompendio,
} from "@/lib/mestre/compendio";
import { MINIATURA } from "@/lib/miniatura";
import { useCharactersStore } from "@/lib/store/use-characters-store";
import { compendioDaMaquinaMudou, useCompendioStore } from "@/lib/store/use-compendio-store";
import { itensMudaram, useMoldesDeItem } from "@/lib/store/use-itens-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useTokenDragStore } from "@/lib/store/use-token-drag-store";
import { cn } from "@/lib/utils";
import { removeCharacter } from "@/lib/vault/characters";
import {
  criarMolde,
  criarMoldeDeItem,
  definirTags,
  definirTagsNoAto20,
  imagemDoCompendio,
  itemEmJogo,
  levarAoCompendio,
  listarCompendioDaMaquina,
  porEmJogo,
  removerDoCompendio,
  trazerDoCompendio,
  type CompendioDaMaquina,
  type TipoDeMolde,
} from "@/lib/vault/compendio";
import type { Medidor, Personagem } from "@/types/character";
import type { Item } from "@/types/inventory";
import type { Pasta } from "@/types/scene";

const texto = t.compendio;

/** O que o Compêndio guarda: fichas (o bestiário) ou itens. */
type Tipo = "bestiario" | "itens";

/** De que Compêndio: o da campanha aberta, ou o da máquina. */
type Onde = "campanha" | "ato20";

/** As tags de uma coisa sendo editadas, e onde ela mora. */
type EdicaoDeTags = { onde: Onde; tipo: TipoDeMolde; id: string; nome: string; tags: string[] };

/** Uma coisa por vez, e só um diálogo de apagar aberto. */
type AApagar =
  | { onde: "campanha"; molde: Personagem }
  | { onde: "ato20"; tipo: Tipo; id: string; nome: string };

/**
 * O Compêndio da campanha: as fichas e os itens prontos, fora do jogo.
 *
 * Só da campanha. O do ATO20 -- o que serve a qualquer mesa desta máquina --
 * é outra janela, como a Estante é outra janela que Arquivos: aberto numa
 * campanha, o Compêndio é dela, e misturar os dois numa aba fazia o mestre
 * perguntar de qual lugar era o goblin que estava olhando. O botão do topo
 * abre o do ATO20 ao lado. Ver `CompendioDoAto20Body`.
 */
export function CompendioBody() {
  return <PainelDoCompendio onde="campanha" />;
}

/**
 * O Compêndio do ATO20: o que este computador guarda para qualquer campanha.
 *
 * Janela própria, como a Estante. Nada se edita aqui além das tags: o caminho
 * é trazer para a campanha, mexer, e guardar de novo. Ver `compendio.rs`.
 */
export function CompendioDoAto20Body() {
  return <PainelDoCompendio onde="ato20" />;
}

/**
 * As duas janelas, com o mesmo desenho: o Bestiário (monstros e NPCs, que são
 * fichas) ou os Itens, a busca, as tags e os cards.
 *
 * Da campanha, o molde se edita na ficha de sempre, e entra em jogo pelo botão
 * ou pelo arrasto para o mapa: vira um personagem novo, "Goblin 2", com a vida
 * dele. O item da campanha é o catálogo de Itens, o mesmo, visto daqui.
 *
 * Do ATO20 nada se edita: lá é guardado. O caminho é trazer para a campanha,
 * mexer, e guardar de novo se quiser a versão nova para as outras mesas.
 *
 * Pastas nas duas listas da campanha, e são do board como as de Personagens e
 * Itens -- é o mestre quem diz o que é "Bestiário", "NPCs da cidade",
 * "Mortos-vivos", "Armas mágicas". As dos itens são as MESMAS da janela de
 * Itens: é o mesmo catálogo, e duas arrumações dele seriam duas respostas para
 * "onde está a poção". O ATO20 se acha pela busca e pelas tags.
 *
 * TAGS nas quatro listas, e são do molde e do item, não do board: viajam com
 * eles para o ATO20 e de volta, e é por isso que filtram também lá. A fileira
 * embaixo da busca mostra as tags da lista aberta, e as ligadas somam. Editar
 * é pelo "Tags…" do menu, inclusive no ATO20 -- tag é organização, e não
 * conteúdo.
 */
function PainelDoCompendio({ onde }: { onde: Onde }) {
  const [tipo, setTipo] = useState<Tipo>("bestiario");
  const [busca, setBusca] = useState("");
  const [tagsLigadas, setTagsLigadas] = useState<string[]>([]);
  const [aApagar, setAApagar] = useState<AApagar | null>(null);
  const [editandoTags, setEditandoTags] = useState<EdicaoDeTags | null>(null);
  const maquina = useCompendioDaMaquina();
  const abrir = useAbrirJanela();
  const { recarregar } = useCharacters();
  const moldes = useCharactersStore((state) => state.moldes);
  const moldesDeItem = useMoldesDeItem();

  const filtro = useMemo<FiltroDoCompendio>(
    () => ({ busca, tags: tagsLigadas }),
    [busca, tagsLigadas],
  );

  // As tags da lista ABERTA, e não de todas: ligar "morto-vivo" na aba de
  // Itens não acharia nada, e o botão estaria ali só para confundir.
  const tagsDisponiveis = useMemo(() => {
    const lista: Array<{ tags?: string[] }> | null | undefined =
      tipo === "bestiario"
        ? onde === "campanha"
          ? moldes
          : maquina.dados?.personagens
        : onde === "campanha"
          ? moldesDeItem
          : maquina.dados?.itens;

    return tagsDaLista(lista ?? [], (coisa) => coisa.tags ?? []);
  }, [tipo, onde, moldes, moldesDeItem, maquina.dados]);

  // Trocar de lista solta o filtro: as tags de uma não são as da outra.
  function trocarTipo(proximo: Tipo) {
    setTipo(proximo);
    setTagsLigadas([]);
  }

  function alternarTag(tag: string) {
    setTagsLigadas((atuais) =>
      temTag(atuais, tag) ? atuais.filter((atual) => !temTag([atual], tag)) : [...atuais, tag],
    );
  }

  // Quem relê depende de onde a coisa mora: o índice de personagens, o
  // catálogo, ou o Compêndio da máquina.
  function tagsMudaram(edicao: EdicaoDeTags) {
    if (edicao.onde === "ato20") maquina.reler();
    else if (edicao.tipo === "personagem") recarregar();
    else itensMudaram([]);
  }

  const pastas = useSceneStore((state) => state.board?.pastas);
  const pastasDoCompendio = useMemo(
    () => pastasDaLista(pastas ?? [], "compendio"),
    [pastas],
  );
  // As do Compêndio, e não as da janela de Itens: o molde de item mora noutro
  // espaço, como o de personagem.
  const pastasDosItens = useMemo(
    () => pastasDaLista(pastas ?? [], "compendio-itens"),
    [pastas],
  );

  async function criarNoBestiario(pastaId?: string) {
    try {
      const molde = await criarMolde(texto.novoMolde);
      if (pastaId)
        useSceneStore.getState().moverPersonagemParaPasta(molde.id, "compendio", pastaId);
      recarregar();
      // Abre a ficha: um molde sem nome nem vida não serve para nada, e é lá
      // que se dá os dois.
      abrir({ tipo: "personagem", personagemId: molde.id });
    } catch (cause) {
      falhou(cause);
    }
  }

  async function criarNoCatalogo(pastaId?: string) {
    try {
      const item = await criarMoldeDeItem(textoDosItens.semNome);
      if (pastaId)
        useSceneStore.getState().moverItemParaPasta(item.id, pastaId, "compendio-itens");
      itensMudaram([]);
      // Abre com o nome em edição, como o item novo da janela de Itens.
      abrirItemNovo(item);
    } catch (cause) {
      falhou(cause);
    }
  }

  // A pasta nasce na lista da aba aberta: a dos moldes de personagem, ou a dos
  // moldes de item.
  function criarPasta() {
    const [lista, existentes] =
      tipo === "bestiario"
        ? (["compendio", pastasDoCompendio] as const)
        : (["compendio-itens", pastasDosItens] as const);

    useSceneStore
      .getState()
      .criarPasta(texto.nomeDaPasta(existentes.length + 1), undefined, lista);
  }

  function apagar(alvo: AApagar) {
    const feito =
      alvo.onde === "campanha"
        ? removeCharacter(alvo.molde.id).then(recarregar)
        : removerDoCompendio(
            alvo.tipo === "bestiario" ? [alvo.id] : [],
            alvo.tipo === "itens" ? [alvo.id] : [],
          ).then(maquina.reler);

    void feito.catch(falhou);
  }

  const daCampanha = onde === "campanha";

  // Estável: vai a cada card, e um card em `memo` não pode receber uma função
  // nova a cada letra da busca.
  const apagarMolde = useCallback(
    (molde: Personagem) => setAApagar({ onde: "campanha", molde }),
    [],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 p-2 pb-0">
        <Tabs value={tipo} onValueChange={(valor) => trocarTipo(valor as Tipo)}>
          <TabsList className="w-full">
            <TabsTrigger value="bestiario" className="flex-1 text-xs">
              <Skull />
              {texto.bestiario}
            </TabsTrigger>
            <TabsTrigger value="itens" className="flex-1 text-xs">
              <Package />
              {texto.itens}
            </TabsTrigger>
          </TabsList>
        </Tabs>

      </div>

      <div className="flex items-center gap-2 p-2">
        <CampoDeBusca
          valor={busca}
          onMudar={setBusca}
          placeholder={texto.buscar}
          rotulo={texto.buscar}
          dica={texto.buscarDica}
        />

        {/* Criar só existe na campanha: o ATO20 recebe o que a campanha
            guarda, e criar lá direto seria um molde que nenhuma ficha edita. */}
        {daCampanha ? (
          <BotaoDoTopo
            rotulo={tipo === "bestiario" ? texto.criarMolde : texto.criarItem}
            onClick={() => void (tipo === "bestiario" ? criarNoBestiario() : criarNoCatalogo())}
          >
            <Plus />
          </BotaoDoTopo>
        ) : null}

        {daCampanha ? (
          <BotaoDoTopo rotulo={texto.novaPasta} onClick={criarPasta}>
            <FolderPlus />
          </BotaoDoTopo>
        ) : null}

        {/* A porta para o outro lugar: o do ATO20 abre ao lado, em janela
            própria, e daqui se traz o que se quer usar. */}
        {daCampanha ? (
          <BotaoDoTopo
            rotulo={texto.abrirAto20}
            onClick={() => abrir({ tipo: "compendio-ato20" })}
          >
            <BookCopy />
          </BotaoDoTopo>
        ) : null}
      </div>

      {tagsDisponiveis.length > 0 ? (
        <FiltroDeTags
          tags={tagsDisponiveis}
          ligadas={tagsLigadas}
          onAlternar={alternarTag}
          onLimpar={() => setTagsLigadas([])}
        />
      ) : null}

      <AreaDeRolagemDoCompendio>
        {tipo === "bestiario" && daCampanha ? (
          <BestiarioDaCampanha
            filtro={filtro}
            pastas={pastasDoCompendio}
            onCriarEm={(pastaId) => void criarNoBestiario(pastaId)}
            onGuardado={maquina.reler}
            onApagar={apagarMolde}
            onEditarTags={setEditandoTags}
          />
        ) : tipo === "itens" && daCampanha ? (
          <ItensDaCampanha
            filtro={filtro}
            pastas={pastasDosItens}
            onCriarEm={(pastaId) => void criarNoCatalogo(pastaId)}
            onGuardado={maquina.reler}
            onEditarTags={setEditandoTags}
          />
        ) : (
          <DaMaquina
            tipo={tipo}
            filtro={filtro}
            dados={maquina.dados}
            onApagar={(id, nome) => setAApagar({ onde: "ato20", tipo, id, nome })}
            onEditarTags={setEditandoTags}
          />
        )}
      </AreaDeRolagemDoCompendio>

      <EditorDeTags
        edicao={editandoTags}
        sugestoes={tagsDisponiveis.map((atual) => atual.tag)}
        onFechar={() => setEditandoTags(null)}
        onMudou={tagsMudaram}
      />

      <ConfirmarRemocao
        aberto={aApagar !== null}
        onAberto={(aberto) => {
          if (!aberto) setAApagar(null);
        }}
        titulo={
          aApagar?.onde === "campanha"
            ? texto.apagarMoldeTitulo(aApagar.molde.nome)
            : texto.apagarDoAto20Titulo(aApagar?.nome ?? "")
        }
        itens={[aApagar?.onde === "campanha" ? texto.apagarMoldeItem : texto.apagarDoAto20Item]}
        ressalva={
          aApagar?.onde === "campanha" ? texto.apagarMoldeRessalva : texto.apagarDoAto20Ressalva
        }
        onConfirmar={() => {
          if (aApagar) apagar(aApagar);
          setAApagar(null);
        }}
      />
    </div>
  );
}

/**
 * A área que rola, NATIVA, e não o `ScrollArea` das outras listas.
 *
 * Medido na WebKitGTK do Tauri (`scripts/perf/compendio.py`, 15/10/2026): 100
 * cards rolavam a 23 fps dentro do `ScrollArea`, e a 60 com a rolagem do
 * próprio motor -- com o desfoque e as imagens ligados nos dois casos. O custo
 * não era JavaScript (0,2 ms por quadro nos ouvintes de rolagem), nem a máscara
 * `scroll-fade`, nem o desfoque: era o componente refazendo o trabalho do motor
 * a cada passo, na proporção do que há dentro. Numa lista de linhas não se
 * nota; numa grade de cards, sim.
 */
function AreaDeRolagemDoCompendio({ children }: { children: ReactNode }) {
  return (
    <div data-rolagem-do-compendio className="min-h-0 flex-1 overflow-y-auto">
      {children}
    </div>
  );
}

/** Quantos cards entram por vez. Divide por 2, 3 e 4 colunas. */
const LOTE = 48;

/**
 * A grade montada aos poucos: um lote de cards, e o próximo quando a rolagem
 * chega perto do fim.
 *
 * Medido na WebKitGTK: ligar uma tag com 300 moldes levava 785 ms no `next
 * dev`, porque a tag tira quase todos da lista e, desligada, monta todos de
 * novo -- e montar card é o que custa. Com lotes, ligar uma tag custa um lote.
 * O mestre não vê a diferença: o próximo lote chega uma tela antes do fim.
 *
 * `chave` volta ao primeiro lote quando a lista passa a ser OUTRA -- busca,
 * tag --, e não quando um molde entra ou sai dela.
 */
function useAosPoucos(chave: unknown, total: number) {
  const [limite, setLimite] = useState(LOTE);
  const [chaveDoLimite, setChaveDoLimite] = useState(chave);
  const sentinela = useRef<HTMLDivElement>(null);
  const temMais = total > limite;

  // No render, e não num efeito: um efeito mostraria um quadro com o lote
  // velho da lista nova antes de voltar ao primeiro.
  if (chave !== chaveDoLimite) {
    setChaveDoLimite(chave);
    setLimite(LOTE);
  }

  useEffect(() => {
    const aqui = sentinela.current;
    if (!temMais || !aqui) return;

    // A raiz é a área que rola, e não a janela do aplicativo: com a janela, a
    // margem não valeria dentro da coluna, e o lote só viria ao bater no fim.
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((entrada) => entrada.isIntersecting))
          setLimite((atual) => atual + LOTE);
      },
      { root: aqui.closest("[data-rolagem-do-compendio]"), rootMargin: "0px 0px 600px 0px" },
    );
    observador.observe(aqui);

    return () => observador.disconnect();
  }, [limite, temMais]);

  const fim = temMais ? <div ref={sentinela} aria-hidden className="h-px" /> : null;

  return { limite, fim };
}

function falhou(cause: unknown) {
  toast.error(cause instanceof Error ? cause.message : texto.falhou);
}

function BotaoDoTopo({
  rotulo,
  onClick,
  children,
}: {
  rotulo: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            className="shrink-0 rounded-full"
            aria-label={rotulo}
            onClick={onClick}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>{rotulo}</TooltipContent>
    </Tooltip>
  );
}

/**
 * O que o Compêndio do ATO20 tem, relido a cada mudança feita daqui.
 *
 * Estado da janela, e não um store: só esta tela o lê. Quem muda o Compêndio
 * da máquina avisa por `compendioDaMaquinaMudou` -- esta janela, e a ficha do
 * molde, que também guarda no ATO20. `null` enquanto lê.
 */
function useCompendioDaMaquina() {
  const [dados, setDados] = useState<CompendioDaMaquina | null>(null);
  // O sinal de fora: a ficha do molde também guarda no ATO20.
  const versao = useCompendioStore((estado) => estado.versao);

  useEffect(() => {
    let ativo = true;

    void listarCompendioDaMaquina().then(
      (lido) => {
        if (ativo) setDados(lido);
      },
      () => {
        // Sem o aplicativo, ou a pasta ilegível: vazio, e não "lendo" para
        // sempre. A campanha continua usável.
        if (ativo) setDados({ personagens: [], itens: [] });
      },
    );

    return () => {
      ativo = false;
    };
  }, [versao]);

  const reler = useCallback(() => compendioDaMaquinaMudou(), []);

  return { dados, reler };
}

/** Os moldes da campanha, com as pastas do mestre. */
function BestiarioDaCampanha({
  filtro,
  pastas,
  onCriarEm,
  onGuardado,
  onApagar,
  onEditarTags,
}: {
  filtro: FiltroDoCompendio;
  pastas: Pasta[];
  onCriarEm: (pastaId: string) => void;
  onGuardado: () => void;
  onApagar: (molde: Personagem) => void;
  onEditarTags: (edicao: EdicaoDeTags) => void;
}) {
  const moldes = useCharactersStore((state) => state.moldes);
  const { assets } = useAssetList("image");
  const buscando = filtrando(filtro);

  const achados = useMemo(
    () =>
      moldes
        ? filtrarNoCompendio(moldes, filtro, (molde) => molde.nome, (molde) => molde.tags ?? [])
        : null,
    [moldes, filtro],
  );

  if (achados === null) return <Lendo />;
  if (moldes?.length === 0 && pastas.length === 0)
    return <PainelVazio conteudo={{ tipo: "compendio" }}>{texto.vazioBestiario}</PainelVazio>;
  if (buscando && achados.length === 0) return <NadaCom filtro={filtro} />;

  return (
    <ArvoreDoCompendio
      achados={achados}
      pastas={pastas}
      buscando={buscando}
      rotuloCriarAqui={texto.criarAqui}
      onCriarEm={onCriarEm}
      linha={(molde, _depth, caminho) => (
        <CartaoDoMolde
          key={molde.id}
          molde={molde}
          caminho={caminho}
          pastas={pastas}
          miniatura={assets?.find((asset) => asset.id === molde.miniatura)}
          onGuardado={onGuardado}
          onApagar={onApagar}
          onEditarTags={onEditarTags}
        />
      )}
    />
  );
}

/**
 * A árvore de uma lista da campanha: as pastas do mestre e o que há dentro.
 *
 * A mesma para os moldes e para os itens -- só muda a linha e de que lista
 * são as pastas. Na busca, a lista plana com a pasta de cada um embaixo do
 * nome: abrir a árvore mostraria as pastas sem o que foi achado. Como em Itens.
 *
 * A pasta não se arrasta, e nada se solta nela: o arrasto da linha é para o
 * mapa. Mover é pelo "Mover para" do menu, como nos Personagens.
 *
 * Em cards: cada pasta é um cabeçalho, e o que mora nela, uma grade embaixo.
 * Ver `blocosDaArvore`. Montada aos poucos -- ver `useAosPoucos`.
 */
function ArvoreDoCompendio<T extends { id: string }>({
  achados,
  pastas,
  buscando,
  rotuloCriarAqui,
  onCriarEm,
  linha,
}: {
  achados: T[];
  pastas: Pasta[];
  buscando: boolean;
  rotuloCriarAqui: string;
  onCriarEm: (pastaId: string) => void;
  linha: (coisa: T, depth: number, caminho?: string) => ReactNode;
}) {
  const linhas = useMemo(
    () =>
      buscando
        ? null
        : achatarArvore(achados, pastas, (coisa) => pastaDoMembro(pastas, coisa.id)),
    [achados, buscando, pastas],
  );

  const pastaRow = (atual: Extract<ReturnType<typeof achatarArvore<T>>[number], { tipo: "pasta" }>) => (
    <PastaRow
      key={atual.pasta.id}
      pasta={atual.pasta}
      pastas={pastas}
      depth={atual.depth}
      total={atual.total}
      dropTarget={false}
      itensDeCriar={({ Item }) => (
        <Item onClick={() => onCriarEm(atual.pasta.id)}>
          <Plus />
          {rotuloCriarAqui}
        </Item>
      )}
    />
  );

  const { limite, fim } = useAosPoucos(linhas ?? achados, achados.length);

  // Na busca, uma grade só, com a pasta de cada um no card.
  if (linhas === null) {
    return (
      <>
        <GradeDeCartoes>
          {achados
            .slice(0, limite)
            .map((coisa) =>
              linha(coisa, 0, caminhoDaPasta(pastas, pastaDoMembro(pastas, coisa.id))),
            )}
        </GradeDeCartoes>
        {fim}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-1 pb-2">
      {blocosDaArvore(cortarArvore(linhas, limite)).map((bloco) =>
        bloco.tipo === "pasta" ? (
          <ul key={bloco.linha.pasta.id} className="px-2">
            {pastaRow(bloco.linha)}
          </ul>
        ) : (
          <GradeDeCartoes key={`grade:${bloco.itens.at(0)?.id}`} recuo={bloco.depth * RECUO_PX}>
            {bloco.itens.map((coisa) => linha(coisa, bloco.depth))}
          </GradeDeCartoes>
        ),
      )}
      {fim}
    </div>
  );
}

/**
 * A grade dos cards: tantas colunas quanto couberem, cada uma com pelo menos
 * 8,5rem. Na janela solta de 320 são duas; na de 480, três -- o card nunca
 * encolhe a ponto de o retrato virar um selo.
 */
function GradeDeCartoes({ recuo = 0, children }: { recuo?: number; children: ReactNode }) {
  return (
    <ul
      // A folga da direita é a da barra de rolagem, que passa POR CIMA do
      // conteúdo: sem ela, a borda do card da última coluna some embaixo dela.
      className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2 pr-3 pb-1 pl-2"
      style={recuo > 0 ? { paddingLeft: 8 + recuo } : undefined}
    >
      {children}
    </ul>
  );
}

/**
 * Um molde, como card: clicar abre a ficha, arrastar para o mapa põe em jogo.
 *
 * O card mostra o retrato -- é a cara do monstro, e o que se reconhece de
 * relance --, e o token quando não há retrato. Embaixo, os dois primeiros
 * medidores, porque "qual dos goblins tem mais vida" se decide sem abrir a
 * ficha, e as tags.
 *
 * O arrasto é o do token, com a mesma sombra e o mesmo tamanho -- mas a fonte
 * é `molde`, e quem a recebe no palco põe em jogo antes de pôr a peça. Ver
 * `TokenFantasma`. Sem miniatura não arrasta: não haveria o que pôr no mapa.
 */
const CartaoDoMolde = memo(function CartaoDoMolde({
  molde,
  caminho,
  pastas,
  miniatura,
  onGuardado,
  onApagar,
  onEditarTags,
}: {
  molde: Personagem;
  caminho?: string;
  pastas: Pasta[];
  miniatura: Parameters<typeof tamanhoDoToken>[0];
  onGuardado: () => void;
  onApagar: (molde: Personagem) => void;
  onEditarTags: (edicao: EdicaoDeTags) => void;
}) {
  const abrir = useAbrirJanela();
  const arrastar = useTokenDrag();
  const { recarregar } = useCharacters();
  const naMao = useTokenDragStore(
    (state) =>
      state.arrasto?.fonte.tipo === "molde" && state.arrasto.fonte.personagemId === molde.id,
  );

  function abrirFicha() {
    abrir({ tipo: "personagem", personagemId: molde.id });
  }

  function porAgora() {
    void porEmJogo(molde.id).then((novo) => {
      recarregar();
      toast.success(texto.emJogo(novo.nome));
    }, falhou);
  }

  function guardarNoAto20() {
    void levarAoCompendio([molde.id], []).then(() => {
      onGuardado();
      toast.success(texto.guardadoNoAto20(molde.nome));
    }, falhou);
  }

  const itens = (kit: Kit) => {
    const { Item, Separator } = kit;

    return (
      <>
        <Item onClick={abrirFicha}>
          <Maximize2 />
          {texto.abrir}
        </Item>
        <Item onClick={porAgora}>
          <UserPlus />
          {texto.porEmJogo}
        </Item>
        <Item onClick={guardarNoAto20}>
          <Upload />
          {texto.guardarNoAto20}
        </Item>
        <Item
          onClick={() =>
            onEditarTags({
              onde: "campanha",
              tipo: "personagem",
              id: molde.id,
              nome: molde.nome,
              tags: molde.tags ?? [],
            })
          }
        >
          <Tags />
          {texto.tagsNoMenu}
        </Item>
        <ItensDeMover
          kit={kit}
          atual={pastaDoMembro(pastas, molde.id)}
          destinos={pastas}
          onMover={(destino) =>
            useSceneStore.getState().moverPersonagemParaPasta(molde.id, "compendio", destino)
          }
        />
        <Separator />
        <Item variant="destructive" onClick={() => onApagar(molde)}>
          <Trash2 />
          {texto.apagarMolde}
        </Item>
      </>
    );
  };

  return (
    <Cartao
      nome={molde.nome}
      detalhe={caminho}
      tags={molde.tags}
      medidores={molde.medidores}
      titulo={texto.dicaDoMolde(molde.nome)}
      naMao={naMao}
      imagem={
        molde.retrato ?? molde.miniatura ? (
          <MiniaturaDoAcervo assetId={molde.retrato ?? molde.miniatura} selo={false} />
        ) : (
          <Skull className="text-muted-foreground size-8" aria-hidden />
        )
      }
      fundo={
        molde.retrato ?? molde.miniatura ? (
          <MiniaturaDoAcervo
            assetId={molde.retrato ?? molde.miniatura}
            selo={false}
            animaNoHover={false}
          />
        ) : undefined
      }
      onAbrir={abrirFicha}
      onPointerDown={
        molde.miniatura
          ? (event) => {
              const tamanho = tamanhoDoToken(miniatura);

              arrastar(event, {
                fonte: { tipo: "molde", personagemId: molde.id, assetId: molde.miniatura! },
                largura: tamanho.x,
                altura: tamanho.y,
              });
            }
          : undefined
      }
      acao={
        <AcaoDaLinha rotulo={texto.porEmJogo} onClick={porAgora}>
          <UserPlus />
        </AcaoDaLinha>
      }
      itens={itens}
    />
  );
});

/**
 * Os moldes de item da campanha, em cards, com as pastas do mestre.
 *
 * O mesmo desenho do Bestiário, e pela mesma razão: o molde de item NÃO é o
 * catálogo. A espada preparada mora aqui até entrar no jogo -- pelo botão, que
 * a copia no catálogo, ou pelo arrasto para o mapa, que copia e já põe a peça.
 * As pastas são as do Compêndio (`compendio-itens`), e não as da janela de
 * Itens: são dois espaços, e organizar um não mexe no outro.
 */
function ItensDaCampanha({
  filtro,
  pastas,
  onCriarEm,
  onGuardado,
  onEditarTags,
}: {
  filtro: FiltroDoCompendio;
  pastas: Pasta[];
  onCriarEm: (pastaId: string) => void;
  onGuardado: () => void;
  onEditarTags: (edicao: EdicaoDeTags) => void;
}) {
  const moldes = useMoldesDeItem();
  const buscando = filtrando(filtro);
  const achados = useMemo(
    () =>
      moldes
        ? filtrarNoCompendio(moldes, filtro, (item) => item.nome, (item) => item.tags ?? [])
        : null,
    [moldes, filtro],
  );

  if (achados === null) return <Lendo />;
  if (moldes?.length === 0 && pastas.length === 0)
    return <PainelVazio conteudo={{ tipo: "itens" }}>{texto.vazioItens}</PainelVazio>;
  if (buscando && achados.length === 0) return <NadaCom filtro={filtro} />;

  return (
    <ArvoreDoCompendio
      achados={achados}
      pastas={pastas}
      buscando={buscando}
      rotuloCriarAqui={texto.criarItemAqui}
      onCriarEm={onCriarEm}
      linha={(item, _depth, caminho) => (
        <CartaoDoMoldeDeItem
          key={item.id}
          item={item}
          caminho={caminho}
          pastas={pastas}
          onGuardado={onGuardado}
          onEditarTags={onEditarTags}
        />
      )}
    />
  );
}

/**
 * Um molde de item, como card: clicar abre a janela do item, arrastar para o
 * mapa põe em jogo e já põe a peça.
 *
 * O arrasto leva a URL da imagem DESENHADA, como o item do catálogo: a foto
 * pode ser a do jogador, que não tem id de acervo. Sem imagem, não vai ao mapa
 * -- a peça é a imagem --, e entra em jogo pelo botão.
 */
const CartaoDoMoldeDeItem = memo(function CartaoDoMoldeDeItem({
  item,
  caminho,
  pastas,
  onGuardado,
  onEditarTags,
}: {
  item: Item;
  caminho?: string;
  pastas: Pasta[];
  onGuardado: () => void;
  onEditarTags: (edicao: EdicaoDeTags) => void;
}) {
  const arrastar = useTokenDrag();
  const naMao = useTokenDragStore(
    (state) => state.arrasto?.fonte.tipo === "molde-item" && state.arrasto.fonte.itemId === item.id,
  );

  function porAgora() {
    void itemEmJogo(item.id).then((novo) => {
      itensMudaram([]);
      toast.success(texto.noCatalogo(novo.nome));
    }, falhou);
  }

  function guardarNoAto20() {
    void levarAoCompendio([], [item.id]).then(() => {
      onGuardado();
      toast.success(texto.guardadoNoAto20(item.nome));
    }, falhou);
  }

  const itens = (kit: Kit) => {
    const { Item: Opcao, Separator } = kit;

    return (
      <>
        <Opcao onClick={() => abrirItem(item)}>
          <Maximize2 />
          {texto.abrir}
        </Opcao>
        <Opcao onClick={porAgora}>
          <PackagePlus />
          {texto.porNoCatalogo}
        </Opcao>
        <Opcao onClick={guardarNoAto20}>
          <Upload />
          {texto.guardarNoAto20}
        </Opcao>
        <Opcao
          onClick={() =>
            onEditarTags({
              onde: "campanha",
              tipo: "item",
              id: item.id,
              nome: item.nome,
              tags: item.tags ?? [],
            })
          }
        >
          <Tags />
          {texto.tagsNoMenu}
        </Opcao>
        <ItensDeMover
          kit={kit}
          atual={pastaDoMembro(pastas, item.id)}
          destinos={pastas}
          onMover={(destino) =>
            useSceneStore.getState().moverItemParaPasta(item.id, destino, "compendio-itens")
          }
        />
        <Separator />
        {/* O mesmo apagar do catálogo: confirma, e o board esquece o item. */}
        <Opcao variant="destructive" onClick={() => void apagarDaCampanha(item)}>
          <Trash2 />
          {texto.apagarMolde}
        </Opcao>
      </>
    );
  };

  return (
    <Cartao
      nome={item.nome}
      detalhe={caminho}
      tags={item.tags}
      corpo={<AtributosDoCartao atributos={item.atributos} />}
      quadrado
      titulo={texto.dicaDoMoldeDeItem(item.nome)}
      naMao={naMao}
      imagem={
        <ImagemDoItem
          imagem={item.imagem}
          className="absolute inset-0 size-full object-cover"
          classeDoIcone="size-8"
        />
      }
      fundo={
        item.imagem ? (
          <ImagemDoItem
            imagem={item.imagem}
            className="absolute inset-0 size-full object-cover"
            classeDoIcone="hidden"
          />
        ) : undefined
      }
      onAbrir={() => abrirItem(item)}
      onPointerDown={
        item.imagem
          ? (event) => {
              const desenhada = imagemDesenhada(event.currentTarget);
              const tamanho =
                desenhada && desenhada.largura > 0 && desenhada.altura > 0
                  ? fitInitialSize(desenhada.largura, desenhada.altura)
                  : { x: 160, y: 160 };

              arrastar(event, {
                fonte: { tipo: "molde-item", itemId: item.id, url: desenhada?.url },
                largura: tamanho.x,
                altura: tamanho.y,
              });
            }
          : undefined
      }
      acao={
        <AcaoDaLinha rotulo={texto.porNoCatalogo} onClick={porAgora}>
          <PackagePlus />
        </AcaoDaLinha>
      }
      itens={itens}
    />
  );
});

/**
 * Os dois primeiros atributos do item no card: "Dano 1d8+2". É o que decide
 * entre duas espadas sem abrir a janela; o resto está nela.
 */
function AtributosDoCartao({ atributos = [] }: { atributos?: Item["atributos"] }) {
  const visiveis = (atributos ?? []).slice(0, 2);
  if (visiveis.length === 0) return null;

  return (
    <>
      {visiveis.map((atributo) => (
        <span
          key={atributo.id || atributo.nome}
          className="text-muted-foreground flex items-baseline justify-between gap-1 text-[10px]"
        >
          <span className="truncate">{atributo.nome}</span>
          <span className="text-foreground shrink-0 truncate tabular-nums">{atributo.valor}</span>
        </span>
      ))}
    </>
  );
}

/** Uma ficha ou um item do ATO20, no que as duas listas desenham. */
type CoisaDaMaquina = {
  id: string;
  nome: string;
  detalhe?: string;
  tags: string[];
  medidores?: Medidor[];
  atributos?: Item["atributos"];
  imagem?: string;
};

/**
 * O Compêndio do ATO20, de um tipo. Só trazer e apagar: nada se edita lá.
 *
 * Sem clique de abrir: abrir seria ler uma ficha que nenhuma janela edita, e
 * clicar por engano não pode copiar nada para a campanha. Trazer é o botão.
 */
function DaMaquina({
  tipo,
  filtro,
  dados,
  onApagar,
  onEditarTags,
}: {
  tipo: Tipo;
  filtro: FiltroDoCompendio;
  dados: CompendioDaMaquina | null;
  onApagar: (id: string, nome: string) => void;
  onEditarTags: (edicao: EdicaoDeTags) => void;
}) {
  const { recarregar } = useCharacters();

  const achados = useMemo(() => {
    if (!dados) return null;

    const lista: CoisaDaMaquina[] =
      tipo === "bestiario"
        ? dados.personagens.map((personagem) => ({
            id: personagem.id,
            nome: personagem.nome,
            detalhe: undefined,
            tags: personagem.tags ?? [],
            medidores: personagem.medidores,
            imagem: personagem.retrato ?? personagem.miniatura,
          }))
        : dados.itens.map((item) => ({
            id: item.id,
            nome: item.nome,
            detalhe: item.descricao || undefined,
            tags: item.tags ?? [],
            medidores: undefined,
            atributos: item.atributos,
            imagem: item.imagem?.tipo === "asset" ? item.imagem.id : undefined,
          }));

    return {
      total: lista.length,
      lista: filtrarNoCompendio(lista, filtro, (coisa) => coisa.nome, (coisa) => coisa.tags),
    };
  }, [dados, tipo, filtro]);

  const { limite, fim } = useAosPoucos(achados?.lista, achados?.lista.length ?? 0);

  if (achados === null) return <Lendo />;
  if (achados.total === 0)
    return <PainelVazio conteudo={{ tipo: "compendio" }}>{texto.vazioMaquina}</PainelVazio>;
  if (achados.lista.length === 0) return <NadaCom filtro={filtro} />;

  function trazer(id: string, nome: string) {
    const feito =
      tipo === "bestiario"
        ? trazerDoCompendio([id], []).then(recarregar)
        : trazerDoCompendio([], [id]).then(() => itensMudaram([]));

    void feito.then(() => toast.success(texto.trazido(nome)), falhou);
  }

  // O mesmo menu e a mesma ação nos dois cards: o do bestiário, em pé e com
  // os medidores, e o do item, quadrado e com os atributos.
  const desenhar = (coisa: CoisaDaMaquina) => {
    const props = {
      nome: coisa.nome,
      detalhe: coisa.detalhe,
      tags: coisa.tags,
      titulo: texto.dicaDaMaquina(coisa.nome),
      imagem: coisa.imagem ? (
        <ImagemDaMaquina assetId={coisa.imagem} />
      ) : tipo === "bestiario" ? (
        <Skull className="text-muted-foreground size-8" aria-hidden />
      ) : (
        <Package className="text-muted-foreground size-8" aria-hidden />
      ),
      fundo: coisa.imagem ? <ImagemDaMaquina assetId={coisa.imagem} /> : undefined,
      acao: (
        <AcaoDaLinha rotulo={texto.trazer} onClick={() => trazer(coisa.id, coisa.nome)}>
          <Download />
        </AcaoDaLinha>
      ),
      itens: ({ Item, Separator }: Kit) => (
        <>
          <Item onClick={() => trazer(coisa.id, coisa.nome)}>
            <Download />
            {texto.trazer}
          </Item>
          <Item
            onClick={() =>
              onEditarTags({
                onde: "ato20",
                tipo: tipo === "bestiario" ? "personagem" : "item",
                id: coisa.id,
                nome: coisa.nome,
                tags: coisa.tags,
              })
            }
          >
            <Tags />
            {texto.tagsNoMenu}
          </Item>
          <Separator />
          <Item variant="destructive" onClick={() => onApagar(coisa.id, coisa.nome)}>
            <Trash2 />
            {texto.apagarDoAto20}
          </Item>
        </>
      ),
    };

    return tipo === "bestiario" ? (
      <Cartao key={coisa.id} {...props} medidores={coisa.medidores} />
    ) : (
      <Cartao
        key={coisa.id}
        {...props}
        quadrado
        corpo={<AtributosDoCartao atributos={coisa.atributos} />}
      />
    );
  };

  return (
    <>
      <GradeDeCartoes>{achados.lista.slice(0, limite).map(desenhar)}</GradeDeCartoes>
      {fim}
    </>
  );
}

/**
 * O card do bestiário: a cara do monstro em cima, o nome, os dois primeiros
 * medidores e as tags embaixo.
 *
 * Os mesmos gestos da linha -- clicar abre, o botão direito e os três pontos
 * têm o menu, a ação da vez aparece no hover --, só que sobre a imagem: no
 * card, o canto de cima é onde a mão procura o que fazer com ele.
 */
function Cartao({
  nome,
  detalhe,
  tags = [],
  medidores = [],
  corpo,
  quadrado = false,
  fundo,
  titulo,
  imagem,
  naMao = false,
  onAbrir,
  onPointerDown,
  acao,
  itens,
}: {
  nome: string;
  detalhe?: string;
  tags?: string[];
  medidores?: Medidor[];
  /** O que mais o card mostra embaixo do nome: os atributos do item. */
  corpo?: ReactNode;
  /** Imagem quadrada, e não em pé: o item é objeto, não retrato. */
  quadrado?: boolean;
  /**
   * A mesma imagem, de novo, para virar a COR do card: ampliada, desfocada e
   * com um véu escuro, atrás de tudo. Ausente quando não há imagem -- a
   * caveira desfocada seria só um borrão cinza.
   */
  fundo?: ReactNode;
  titulo?: string;
  imagem: ReactNode;
  naMao?: boolean;
  onAbrir?: () => void;
  onPointerDown?: (event: ReactPointerEvent) => void;
  acao: ReactNode;
  itens: (kit: Kit) => ReactNode;
}) {
  // Os três pontos e a ação só montam quando a mão chega no card -- ver o
  // comentário no `<li>`.
  const [acordado, setAcordado] = useState(false);
  const acordar = () => setAcordado(true);

  const conteudo = (
    <>
      <span
        className={cn(
          "relative flex w-full items-center justify-center overflow-hidden",
          quadrado ? "aspect-square" : "aspect-[4/5]",
          !fundo && "bg-muted/60",
        )}
        // Com fundo, a imagem SOME para dentro dele em vez de terminar numa
        // linha: o card vira uma peça só, da cor do monstro, e o nome fica
        // sobre essa cor. As duas grafias porque o WebKitGTK ainda lê a
        // prefixada -- ver `item-window`.
        style={fundo ? MASCARA_DO_CARTAO : undefined}
      >
        {imagem}
      </span>

      <span className="flex min-w-0 flex-col gap-1 p-2">
        <span className="truncate text-xs font-medium">{nome}</span>

        {medidores.slice(0, 2).map((medidor) => (
          <MedidorDoCartao key={medidor.id} medidor={medidor} />
        ))}

        {corpo}

        {tags.length > 0 ? (
          <span className="flex min-w-0 flex-wrap gap-1">
            {tags.map((tag) => (
              <Etiqueta key={tag}>{tag}</Etiqueta>
            ))}
          </span>
        ) : null}

        {detalhe ? (
          <span className="text-muted-foreground truncate text-[10px]">{detalhe}</span>
        ) : null}
      </span>
    </>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <li
            className={cn(
              "group bg-card relative isolate flex min-w-0 flex-col overflow-hidden rounded-lg border select-none transition-colors hover:border-foreground/25",
              onPointerDown && "cursor-grab touch-none active:cursor-grabbing",
              naMao && "opacity-40",
            )}
            onPointerDown={onPointerDown}
            // Menus sob demanda: o menu de três pontos e a dica da ação são
            // componentes pesados de montar, e uma grade de 48 cards montava
            // 96 deles que ninguém ia abrir. Montam no primeiro hover ou foco
            // -- que sempre vêm antes de qualquer clique neles.
            onPointerEnter={acordar}
            onFocus={acordar}
          />
        }
      >
        {/* A cor do card: a imagem ampliada e desfocada atrás de tudo, como o
            cabeçalho da janela do item. A miniatura, e não a imagem grande:
            desfocadas, as duas ficam iguais. O véu escuro é o que mantém o
            nome legível sobre um retrato claro. `-z-10` dentro do `isolate`
            do card: fica atrás do conteúdo e na frente do fundo dele. */}
        {fundo ? (
          <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <span className="absolute inset-0 scale-150 opacity-70 blur-2xl saturate-150">
              {fundo}
            </span>
            <span className="absolute inset-0 bg-black/40" />
          </span>
        ) : null}

        {onAbrir ? (
          <button
            type="button"
            className="focus-visible:ring-ring flex min-w-0 flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-inset"
            title={titulo}
            onClick={onAbrir}
          >
            {conteudo}
          </button>
        ) : (
          <div className="flex min-w-0 flex-col" title={titulo}>
            {conteudo}
          </div>
        )}

        {/* Sobre a imagem, com fundo próprio: o retrato pode ser claro ou
            escuro, e o botão tem de aparecer nos dois. */}
        <span className="bg-background/80 absolute top-1 right-1 flex items-center rounded-md opacity-0 backdrop-blur-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          {acordado ? (
            <>
              {acao}
              <TresPontos rotulo={nome} aoFechar={() => {}} itens={itens} />
            </>
          ) : null}
        </span>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52">{itens(KIT_CONTEXTO)}</ContextMenuContent>
    </ContextMenu>
  );
}

/** O fim da imagem do card, sumindo para dentro do fundo desfocado. */
const MASCARA_DO_CARTAO = {
  maskImage: "linear-gradient(to bottom, black 70%, transparent)",
  WebkitMaskImage: "linear-gradient(to bottom, black 70%, transparent)",
};

/**
 * Um medidor no card: o nome, o número e uma barra na cor dele.
 *
 * Só leitura, e de propósito: mexer na vida do molde é preparar a ficha, e
 * isso se faz na ficha. O medidor escondido aparece igual -- quem olha o
 * Compêndio é o mestre.
 */
function MedidorDoCartao({ medidor }: { medidor: Medidor }) {
  const parte = medidor.maximo > 0 ? Math.min(1, Math.max(0, medidor.atual / medidor.maximo)) : 0;

  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-muted-foreground flex items-baseline justify-between gap-1 text-[10px]">
        <span className="truncate">{medidor.nome}</span>
        <span className="text-foreground shrink-0 tabular-nums">
          {medidor.atual}/{medidor.maximo}
        </span>
      </span>
      <span className="bg-muted h-1 overflow-hidden rounded-full">
        <span
          className="block h-full rounded-full"
          style={{ width: `${parte * 100}%`, backgroundColor: medidor.cor }}
        />
      </span>
    </span>
  );
}

function AcaoDaLinha({
  rotulo,
  onClick,
  children,
}: {
  rotulo: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={rotulo}
            className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClick}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>{rotulo}</TooltipContent>
    </Tooltip>
  );
}

/**
 * A miniatura de uma imagem do Compêndio do ATO20, pedida quando a linha chega
 * perto da vista -- os bytes vêm por IPC, e o `loading="lazy"` do navegador não
 * alcança a ida ao Rust. Ver `imagemDoCompendio`.
 */
function ImagemDaMaquina({ assetId }: { assetId: string }) {
  const ancora = useRef<HTMLSpanElement>(null);
  const [perto, setPerto] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const aqui = ancora.current;
    if (perto || !aqui) return;

    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((entrada) => entrada.isIntersecting)) setPerto(true);
      },
      { rootMargin: "100% 0px" },
    );
    observador.observe(aqui);

    return () => observador.disconnect();
  }, [perto]);

  useEffect(() => {
    if (!perto) return;

    let ativo = true;
    let criada: string | null = null;

    void imagemDoCompendio(assetId).then(
      (endereco) => {
        if (!ativo) {
          URL.revokeObjectURL(endereco);
          return;
        }
        criada = endereco;
        setUrl(endereco);
      },
      () => {},
    );

    return () => {
      ativo = false;
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [perto, assetId]);

  return (
    <span ref={ancora} className="absolute inset-0">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" draggable={false} {...MINIATURA} />
      ) : null}
    </span>
  );
}

function Lendo() {
  return <p className="text-muted-foreground p-3 text-xs">{texto.lendo}</p>;
}

function NadaCom({ filtro }: { filtro: FiltroDoCompendio }) {
  return (
    <p className="text-muted-foreground p-3 text-xs">
      {filtro.busca.trim() ? texto.nadaCom(filtro.busca.trim()) : texto.nadaComTags}
    </p>
  );
}

/**
 * Há busca ou tag ligada: a lista mostra os achados, planos, e não a árvore.
 * Ver `ArvoreDoCompendio`.
 */
function filtrando(filtro: FiltroDoCompendio): boolean {
  return filtro.busca.trim() !== "" || filtro.tags.length > 0;
}

/** Uma tag desenhada, sem gesto: a da linha e a do editor. */
function Etiqueta({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "bg-muted text-muted-foreground inline-flex h-4 shrink-0 items-center rounded-full px-1.5 text-[10px] leading-none",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Quantas tags a fileira mostra recolhida. Cabe em duas linhas na coluna. */
const TAGS_RECOLHIDAS = 8;

/**
 * A fileira do filtro: as tags da lista aberta, com quantas coisas cada uma
 * tem. Ligar estreita, e as ligadas somam.
 *
 * Fora da área que rola, entre a busca e a lista: é controle da lista, e ficar
 * fixa é o que deixa ligar mais uma depois de rolar até o meio do bestiário.
 *
 * RECOLHIDA por padrão: um bestiário com sessenta tags fazia catorze linhas de
 * botão, e a lista começava fora da janela. Recolhida, mostra as ligadas e as
 * mais usadas, até `TAGS_RECOLHIDAS`, em ordem de uso -- a tag de um monstro
 * só se acha também pela busca, que procura nas tags. Aberta, todas em ordem
 * de nome, com altura máxima e rolagem própria.
 */
function FiltroDeTags({
  tags,
  ligadas,
  onAlternar,
  onLimpar,
}: {
  tags: Array<{ tag: string; total: number }>;
  ligadas: string[];
  onAlternar: (tag: string) => void;
  onLimpar: () => void;
}) {
  const [aberta, setAberta] = useState(false);
  const cabe = tags.length <= TAGS_RECOLHIDAS;

  const visiveis = useMemo(() => {
    if (aberta || cabe) return tags;

    const porUso = [...tags].sort((a, b) => b.total - a.total || a.tag.localeCompare(b.tag));
    const escolhidas = porUso.filter(({ tag }) => temTag(ligadas, tag));
    for (const atual of porUso) {
      if (escolhidas.length >= TAGS_RECOLHIDAS) break;
      if (!escolhidas.includes(atual)) escolhidas.push(atual);
    }
    return escolhidas;
  }, [tags, ligadas, aberta, cabe]);

  return (
    <div
      role="group"
      aria-label={texto.filtroDeTags}
      className={cn(
        "flex flex-wrap items-center gap-1 px-2 pb-2",
        aberta && "max-h-28 overflow-y-auto",
      )}
    >
      <Tags className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
      {visiveis.map(({ tag, total }) => {
        const ligada = temTag(ligadas, tag);

        return (
          <button
            key={tag}
            type="button"
            aria-pressed={ligada}
            title={texto.filtrarPor(tag)}
            onClick={() => onAlternar(tag)}
            className={cn(
              "focus-visible:ring-ring inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[10px] outline-none focus-visible:ring-2",
              ligada
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground border-transparent bg-muted",
            )}
          >
            {tag}
            <span className="tabular-nums opacity-60">{total}</span>
          </button>
        );
      })}
      {cabe ? null : (
        <button
          type="button"
          aria-expanded={aberta}
          onClick={() => setAberta((atual) => !atual)}
          className="text-muted-foreground hover:text-foreground h-5 px-1 text-[10px] underline-offset-2 hover:underline"
        >
          {aberta ? texto.menosTags : texto.maisTags(tags.length - visiveis.length)}
        </button>
      )}
      {ligadas.length > 0 ? (
        <button
          type="button"
          onClick={onLimpar}
          className="text-muted-foreground hover:text-foreground h-5 px-1 text-[10px] underline-offset-2 hover:underline"
        >
          {texto.limparFiltro}
        </button>
      ) : null}
    </div>
  );
}

/**
 * As tags de UMA coisa, num quadro pequeno: as que ela tem, para tirar, e as
 * da lista que ela não tem, para pôr. Uma nova se escreve embaixo.
 *
 * Grava a cada gesto, sem botão de salvar: é a mesma regra do resto do
 * aplicativo, que edita no lugar. O Rust devolve as tags como ficaram --
 * limpas, sem repetida --, e é isso que o quadro mostra.
 *
 * O conteúdo remonta por coisa (`key`), e não reaproveita estado: abrir as
 * tags do Orc depois das do Goblin não pode começar com as do Goblin.
 */
function EditorDeTags({
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
          <ConteudoDoEditor
            key={`${edicao.onde}:${edicao.tipo}:${edicao.id}`}
            edicao={edicao}
            sugestoes={sugestoes}
            onMudou={onMudou}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Quantas tags cabem numa coisa. Espelho de `MAX_TAGS`, em `compendio.rs`. */
const MAX_TAGS = 16;

function ConteudoDoEditor({
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
    <>
      <DialogHeader className="pr-8">
        <DialogTitle className="leading-snug break-words">{texto.tagsDe(edicao.nome)}</DialogTitle>
        <DialogDescription>{texto.tagsDica}</DialogDescription>
      </DialogHeader>

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
    </>
  );
}
