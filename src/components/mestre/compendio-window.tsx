"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
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
} from "@/components/mestre/arvore-de-pastas";
import { CampoDeBusca } from "@/components/mestre/campo-de-busca";
import { tamanhoDoToken } from "@/components/mestre/characters-window";
import {
  AcaoDaLinha,
  Cartao,
  daMaoNoCartao,
  falhou,
  filtrando,
  GradeDeCartoes,
  ImagemDaMaquina,
  Lendo,
  NadaCom,
  useAosPoucos,
  type EdicaoDeTags,
  type Onde,
} from "@/components/mestre/compendio-cartao";
import {
  CondicoesNoCompendio,
  DesenhoDaCondicao,
  tituloDoEfeito,
} from "@/components/mestre/compendio-condicoes";
import {
  arrastoDoEfeito,
  corDoEfeito,
  DesenhoDoEfeito,
  efeitoNaMao,
  EfeitosNoCompendio,
  especieDoEfeito,
} from "@/components/mestre/compendio-efeitos";
import { ConfirmarRemocao } from "@/components/mestre/confirmar-remocao";
import { EditorDeTags } from "@/components/mestre/editor-de-tags";
import { ImagemDoItem, imagemDesenhada } from "@/components/mestre/imagem-do-item";
import { MiniaturaDoAcervo } from "@/components/mestre/miniatura-do-acervo";
import { PainelVazio } from "@/components/mestre/painel-vazio";
import { Button } from "@/components/ui/button";
import type { Kit } from "@/components/ui/menu-kit";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import { fecharJanela } from "@/lib/extensoes/janelas";
import { chaveDe } from "@/lib/store/use-window-store";
import { useAssetList } from "@/hooks/use-asset-list";
import { useCharacters } from "@/hooks/use-characters";
import { useTokenDrag } from "@/hooks/use-token-drag";
import { COR_DA_AREA, EFEITOS_DE_AREA } from "@/lib/area-de-efeito";
import { SUGESTOES } from "@/lib/condicao";
import { copiaParaACampanha } from "@/lib/efeitos";
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
import { useCharactersStore } from "@/lib/store/use-characters-store";
import { compendioDaMaquinaMudou, useCompendioStore } from "@/lib/store/use-compendio-store";
import {
  useCondicoesDoCompendioStore,
} from "@/lib/store/use-condicoes-do-compendio-store";
import { useDeclarativoStore } from "@/lib/store/use-declarativo-store";
import { useEfeitosDaCampanhaStore } from "@/lib/store/use-efeitos-da-campanha-store";
import { itensMudaram, useMoldesDeItem } from "@/lib/store/use-itens-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { CORES_LAPIS } from "@/lib/store/use-tool-store";
import { useTokenDragStore } from "@/lib/store/use-token-drag-store";
import { cn } from "@/lib/utils";
import { removeCharacter } from "@/lib/vault/characters";
import {
  apagarCondicaoDoCompendio,
  criarCondicaoDoCompendio,
  criarMolde,
  criarMoldeDeItem,
  itemEmJogo,
  levarAoCompendio,
  listarCompendioDaMaquina,
  porEmJogo,
  removerDoCompendio,
  semearCompendioDaMaquina,
  trazerDoCompendio,
  type CompendioDaMaquina,
  type SelecaoDoCompendio,
  type TipoDeMolde,
} from "@/lib/vault/compendio";
import type { Medidor, MoldeDeCondicao, Personagem } from "@/types/character";
import type { DefinicaoDeEfeito } from "@/types/efeito";
import type { Item } from "@/types/inventory";
import type { Pasta } from "@/types/scene";

const texto = t.compendio;

/**
 * O que o Compêndio guarda: fichas (o bestiário), itens, condições e efeitos.
 *
 * Os efeitos são só os de ÁREA. O de personagem é da condição -- é por ela
 * que ele chega à figura, e é na janela dela que ele se edita --, e uma aba
 * com ele à parte era a mesma coisa em dois lugares, que o mestre tinha de
 * casar de cabeça. O card da condição anima o efeito dela no hover.
 */
type Tipo = "bestiario" | "itens" | "condicoes" | "efeitos";

/** De que lista do Rust é a coisa, para as tags e para trazer e levar. */
function tipoDeMolde(lista: Tipo): TipoDeMolde {
  switch (lista) {
    case "bestiario":
      return "personagem";
    case "itens":
      return "item";
    case "condicoes":
      return "condicao";
    default:
      return "efeito";
  }
}

/** A seleção de UMA coisa, na lista certa. */
function selecaoDe(tipo: TipoDeMolde, id: string): SelecaoDoCompendio {
  switch (tipo) {
    case "personagem":
      return { personagens: [id] };
    case "item":
      return { itens: [id] };
    case "condicao":
      return { condicoes: [id] };
    case "efeito":
      return { efeitos: [id] };
  }
}

/** Uma coisa por vez, e só um diálogo de apagar aberto. */
type AApagar =
  | { onde: "campanha"; tipo: "personagem"; molde: Personagem }
  | { onde: "campanha"; tipo: "condicao" | "efeito"; id: string; nome: string }
  | { onde: "ato20"; tipo: TipoDeMolde; id: string; nome: string };

/** O que o diálogo de apagar diz, por coisa. */
function textosDeApagar(alvo: AApagar | null): { titulo: string; item: string; ressalva: string } {
  if (alvo?.onde === "campanha" && alvo.tipo === "personagem")
    return {
      titulo: texto.apagarMoldeTitulo(alvo.molde.nome),
      item: texto.apagarMoldeItem,
      ressalva: texto.apagarMoldeRessalva,
    };
  if (alvo?.onde === "campanha" && alvo.tipo === "condicao")
    return {
      titulo: texto.apagarCondicaoTitulo(alvo.nome),
      item: texto.apagarCondicaoItem,
      ressalva: texto.apagarCondicaoRessalva,
    };
  if (alvo?.onde === "campanha" && alvo.tipo === "efeito")
    return {
      titulo: texto.apagarEfeitoTitulo(alvo.nome),
      item: texto.apagarEfeitoItem,
      ressalva: texto.apagarEfeitoRessalva,
    };
  return {
    titulo: texto.apagarDoAto20Titulo(alvo?.nome ?? ""),
    item: texto.apagarDoAto20Item,
    ressalva: texto.apagarDoAto20Ressalva,
  };
}

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
 * As duas janelas, com o mesmo desenho: quatro listas -- o Bestiário (monstros
 * e NPCs, que são fichas), os Itens, as Condições e os Efeitos --, a busca, as
 * tags e os cards.
 *
 * Da campanha, o molde se edita na ficha de sempre, e entra em jogo pelo botão
 * ou pelo arrasto para o mapa: vira um personagem novo, "Goblin 2", com a vida
 * dele. O item da campanha é o catálogo de Itens, o mesmo, visto daqui.
 *
 * Condições e efeitos são o avesso: são DEFINIÇÕES, e não fichas, e por isso
 * mudam de lugar em vez de se copiar. A condição vai ao menu do token, que tem
 * dezesseis lugares; o efeito entra em jogo, onde são trinta e dois. O
 * Compêndio é a biblioteca de onde o mestre escolhe o que a sessão precisa.
 * Ver `compendio-condicoes.tsx` e `compendio-efeitos.tsx`.
 *
 * Do ATO20 nada se edita: lá é guardado. O caminho é trazer para a campanha,
 * mexer, e guardar de novo se quiser a versão nova para as outras mesas. As
 * condições e os efeitos que o ATO20 sugere já moram lá desde a primeira vez
 * que a janela abre -- ver `useCompendioDaMaquina`.
 *
 * Pastas nas duas listas de fichas e itens da campanha, e são do board como as
 * de Personagens e Itens -- é o mestre quem diz o que é "Bestiário", "NPCs da
 * cidade", "Mortos-vivos", "Armas mágicas". Condições e efeitos não têm: são
 * poucos, e as tags bastam. O ATO20 se acha pela busca e pelas tags.
 *
 * TAGS em todas as listas, e são da coisa, não do board: viajam com ela para o
 * ATO20 e de volta, e é por isso que filtram também lá. A fileira embaixo da
 * busca mostra as tags da lista aberta, e as ligadas somam. Editar é pelo
 * "Tags…" do menu, inclusive no ATO20 -- tag é organização, e não conteúdo.
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
  const condicoes = useCondicoesDoCompendioStore((state) => state.lista);
  const moldesDeEfeito = useEfeitosDaCampanhaStore((state) => state.moldes);
  const lista = tipo;

  const filtro = useMemo<FiltroDoCompendio>(
    () => ({ busca, tags: tagsLigadas }),
    [busca, tagsLigadas],
  );

  // As tags da lista ABERTA, e não de todas: ligar "morto-vivo" na aba de
  // Itens não acharia nada, e o botão estaria ali só para confundir.
  const tagsDisponiveis = useMemo(() => {
    const daCampanha = onde === "campanha";
    const dados = maquina.dados;
    let coisas: Array<{ tags?: string[] }> | null | undefined;

    switch (lista) {
      case "bestiario":
        coisas = daCampanha ? moldes : dados?.personagens;
        break;
      case "itens":
        coisas = daCampanha ? moldesDeItem : dados?.itens;
        break;
      case "condicoes":
        coisas = daCampanha ? condicoes : dados?.condicoes;
        break;
      default:
        coisas = (daCampanha ? moldesDeEfeito : dados?.efeitos)?.filter(
          (efeito) => especieDoEfeito(efeito) === "area",
        );
    }

    return tagsDaLista(coisas ?? [], (coisa) => coisa.tags ?? []);
  }, [lista, onde, moldes, moldesDeItem, condicoes, moldesDeEfeito, maquina.dados]);

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
  // catálogo, a biblioteca de condições, a lista de efeitos, ou o Compêndio
  // da máquina.
  function tagsMudaram(edicao: EdicaoDeTags) {
    if (edicao.onde === "ato20") maquina.reler();
    else if (edicao.tipo === "personagem") recarregar();
    else if (edicao.tipo === "item") itensMudaram([]);
    else if (edicao.tipo === "condicao") useCondicoesDoCompendioStore.getState().recarregar();
    else
      useEfeitosDaCampanhaStore.setState((estado) => ({
        moldes: estado.moldes?.map((efeito) =>
          efeito.id === edicao.id ? { ...efeito, tags: edicao.tags } : efeito,
        ),
      }));
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

  async function criarCondicao() {
    try {
      const total = condicoes?.length ?? 0;
      const nova = await criarCondicaoDoCompendio(
        texto.novaCondicao,
        CORES_LAPIS[total % CORES_LAPIS.length] ?? CORES_LAPIS[0],
        "circulo",
      );
      useCondicoesDoCompendioStore.getState().recarregar();
      // Abre a janela dela, como o molde novo abre a ficha: uma condição
      // chamada "Nova condição", sem efeito, ainda não é nada.
      abrir({ tipo: "condicao", lugar: "compendio", condicaoId: nova.id });
    } catch (cause) {
      falhou(cause);
    }
  }

  /**
   * Um efeito de área novo, em branco como o efeito novo sempre foi, e já
   * aberto na janela dele. Nasce com a cor -- é o que o faz de área. Ver
   * `EfeitosEmAreaDaCampanha`.
   */
  async function criarEfeito() {
    const { criarMolde: criarMoldeDeEfeito, salvar } = useEfeitosDaCampanhaStore.getState();
    const novo = await criarMoldeDeEfeito();
    if (!novo) return;

    const total = moldesDeEfeito?.length ?? 0;
    salvar({
      ...novo,
      titulo: texto.novoEfeitoDeArea,
      area: { cor: CORES_LAPIS[total % CORES_LAPIS.length] ?? COR_DA_AREA },
    });
    abrir({ tipo: "efeito", efeitoId: novo.id });
  }

  function criar() {
    switch (tipo) {
      case "bestiario":
        return void criarNoBestiario();
      case "itens":
        return void criarNoCatalogo();
      case "condicoes":
        return void criarCondicao();
      case "efeitos":
        return void criarEfeito();
    }
  }

  const rotuloDeCriar = {
    bestiario: texto.criarMolde,
    itens: texto.criarItem,
    condicoes: texto.criarCondicao,
    efeitos: texto.criarEfeitoDeArea,
  }[tipo];

  // A pasta nasce na lista da aba aberta: a dos moldes de personagem, ou a dos
  // moldes de item.
  function criarPasta() {
    const [destino, existentes] =
      tipo === "bestiario"
        ? (["compendio", pastasDoCompendio] as const)
        : (["compendio-itens", pastasDosItens] as const);

    useSceneStore
      .getState()
      .criarPasta(texto.nomeDaPasta(existentes.length + 1), undefined, destino);
  }

  function apagar(alvo: AApagar) {
    let feito: Promise<unknown>;

    if (alvo.onde === "ato20") {
      feito = removerDoCompendio(selecaoDe(alvo.tipo, alvo.id)).then(maquina.reler);
    } else if (alvo.tipo === "personagem") {
      feito = removeCharacter(alvo.molde.id).then(recarregar);
    } else if (alvo.tipo === "condicao") {
      feito = apagarCondicaoDoCompendio(alvo.id).then(() => {
        useCondicoesDoCompendioStore.getState().recarregar();
        // A janela dela iria dizer "não está mais aqui" do que o mestre acabou
        // de apagar.
        fecharJanela(chaveDe({ tipo: "condicao", lugar: "compendio", condicaoId: alvo.id }));
      });
    } else {
      // O `apagar` do store avisa a falha sozinho e não rejeita: a janela só
      // fecha se o efeito de fato saiu da lista.
      feito = useEfeitosDaCampanhaStore
        .getState()
        .apagar(alvo.id)
        .then(() => {
          const { efeitos, moldes } = useEfeitosDaCampanhaStore.getState();
          const ficou = [...(efeitos ?? []), ...(moldes ?? [])].some((efeito) => efeito.id === alvo.id);
          if (!ficou) fecharJanela(chaveDe({ tipo: "efeito", efeitoId: alvo.id }));
        });
    }

    void feito.catch(falhou);
  }

  const daCampanha = onde === "campanha";

  // Estáveis: vão a cada card, e um card em `memo` não pode receber uma
  // função nova a cada letra da busca.
  const apagarMolde = useCallback(
    (molde: Personagem) => setAApagar({ onde: "campanha", tipo: "personagem", molde }),
    [],
  );
  const apagarCondicao = useCallback(
    (condicao: MoldeDeCondicao) =>
      setAApagar({ onde: "campanha", tipo: "condicao", id: condicao.id, nome: condicao.nome }),
    [],
  );
  const apagarEfeito = useCallback(
    (efeito: DefinicaoDeEfeito) =>
      setAApagar({ onde: "campanha", tipo: "efeito", id: efeito.id, nome: efeito.titulo }),
    [],
  );

  // O efeito abre na janela dele, como o item: o editor é comprido, e o
  // mestre quer a lista à vista enquanto ajusta o fogo. Ver `EfeitoBody`.
  const abrirEfeito = useCallback(
    (efeitoId: string) => abrir({ tipo: "efeito", efeitoId }),
    [abrir],
  );

  const textosDoApagar = textosDeApagar(aApagar);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* As abas de sempre, as da ficha: sublinhadas, à esquerda, com a borda
          de ponta a ponta. Eram pílulas, e eram a única janela com elas. */}
      <Tabs value={tipo} onValueChange={(valor) => trocarTipo(valor as Tipo)} className="shrink-0 gap-0">
        <TabsList
          variant="line"
          aria-label={texto.titulo}
          className="h-auto w-full shrink-0 justify-start gap-1 rounded-none border-b px-2 py-1"
        >
          <TabsTrigger value="bestiario" className="flex-none">
            {texto.bestiario}
          </TabsTrigger>
          <TabsTrigger value="itens" className="flex-none">
            {texto.itens}
          </TabsTrigger>
          <TabsTrigger value="condicoes" className="flex-none">
            {texto.condicoes}
          </TabsTrigger>
          <TabsTrigger value="efeitos" className="flex-none">
            {texto.efeitos}
          </TabsTrigger>
        </TabsList>
      </Tabs>

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
          <BotaoDoTopo rotulo={rotuloDeCriar} onClick={criar}>
            <Plus />
          </BotaoDoTopo>
        ) : null}

        {daCampanha && (tipo === "bestiario" || tipo === "itens") ? (
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
        {!daCampanha ? (
          <DaMaquina
            lista={lista}
            filtro={filtro}
            dados={maquina.dados}
            onApagar={(id, nome) => setAApagar({ onde: "ato20", tipo: tipoDeMolde(lista), id, nome })}
            onEditarTags={setEditandoTags}
          />
        ) : tipo === "bestiario" ? (
          <BestiarioDaCampanha
            filtro={filtro}
            pastas={pastasDoCompendio}
            onCriarEm={(pastaId) => void criarNoBestiario(pastaId)}
            onGuardado={maquina.reler}
            onApagar={apagarMolde}
            onEditarTags={setEditandoTags}
          />
        ) : tipo === "itens" ? (
          <ItensDaCampanha
            filtro={filtro}
            pastas={pastasDosItens}
            onCriarEm={(pastaId) => void criarNoCatalogo(pastaId)}
            onGuardado={maquina.reler}
            onEditarTags={setEditandoTags}
          />
        ) : tipo === "condicoes" ? (
          <CondicoesNoCompendio
            filtro={filtro}
            onGuardado={maquina.reler}
            onApagar={apagarCondicao}
            onEditarTags={setEditandoTags}
          />
        ) : (
          <EfeitosNoCompendio
            filtro={filtro}
            onAbrir={abrirEfeito}
            onGuardado={maquina.reler}
            onApagar={apagarEfeito}
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
        titulo={textosDoApagar.titulo}
        itens={[textosDoApagar.item]}
        ressalva={textosDoApagar.ressalva}
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
 *
 * Na PRIMEIRA leitura desta máquina, as sugestões entram: as condições que o
 * cardápio sugere e os efeitos de fábrica, de personagem e de área. Daqui, e
 * não do Rust, porque são da tela -- o nome no idioma de quem abriu, as cópias
 * feitas por `copiaParaACampanha`. Uma vez só: o Rust guarda a marca, e o
 * mestre que apagou "Molhado" não o vê voltar. Ver `compendio::semear`.
 */
function useCompendioDaMaquina() {
  const [dados, setDados] = useState<CompendioDaMaquina | null>(null);
  // O sinal de fora: a ficha do molde também guarda no ATO20.
  const versao = useCompendioStore((estado) => estado.versao);

  useEffect(() => {
    let ativo = true;

    async function ler() {
      const lido = await listarCompendioDaMaquina();
      if (lido.semeado) return lido;

      const { condicoes, efeitos } = sugestoesDoAto20();
      return (await semearCompendioDaMaquina(condicoes, efeitos))
        ? listarCompendioDaMaquina()
        : lido;
    }

    void ler().then(
      (lido) => {
        if (ativo) setDados(lido);
      },
      () => {
        // Sem o aplicativo, ou a pasta ilegível: vazio, e não "lendo" para
        // sempre. A campanha continua usável.
        if (ativo)
          setDados({ personagens: [], itens: [], condicoes: [], efeitos: [], semeado: true });
      },
    );

    return () => {
      ativo = false;
    };
  }, [versao]);

  const reler = useCallback(() => compendioDaMaquinaMudou(), []);

  return { dados, reler };
}

/**
 * O que o ATO20 sugere, como o Compêndio da máquina guarda: as condições de
 * `SUGESTOES`, e os efeitos de fábrica que têm chão, copiados como efeito de
 * área. O id é do Rust, que dá um novo a cada um.
 *
 * Os de personagem não entram por conta própria: cada condição sugerida já
 * aponta para o dela, de fábrica, e o efeito de personagem só existe pela
 * condição. Ver `Tipo`.
 */
function sugestoesDoAto20() {
  const condicoes = SUGESTOES.map(({ nome, cor, icone, efeito }) => ({ nome, cor, icone, efeito }));
  const efeitos = EFEITOS_DE_AREA.map((pronto) =>
    copiaParaACampanha(pronto, "campanha/sugestao", pronto.titulo),
  );

  return { condicoes, efeitos };
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
    void levarAoCompendio({ personagens: [molde.id] }).then(() => {
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
    void levarAoCompendio({ itens: [item.id] }).then(() => {
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

/** Uma coisa do ATO20, no que as listas desenham. */
type CoisaDaMaquina = {
  id: string;
  nome: string;
  detalhe?: string;
  tags: string[];
  medidores?: Medidor[];
  atributos?: Item["atributos"];
  /** Um id do acervo da máquina: o retrato, a foto do item. */
  imagem?: string;
  /** O desenho, quando não é imagem: o selo da condição, o do efeito. */
  desenho?: ReactNode;
  /** A cor do card sem imagem. Ver `Cartao`. */
  tinta?: string;
  /** O efeito, que se arrasta até o mapa. Ver `arrastoDoEfeito`. */
  efeito?: DefinicaoDeEfeito;
};

/**
 * O Compêndio do ATO20, de uma lista. Só trazer e apagar: nada se edita lá.
 *
 * Sem clique de abrir: abrir seria ler uma ficha que nenhuma janela edita, e
 * clicar por engano não pode copiar nada para a campanha. Trazer é o botão.
 *
 * Condições e efeitos chegam ao Compêndio da campanha, e não ao menu nem ao
 * jogo: trazer é escolher da biblioteca da máquina para a da mesa, e o teto do
 * menu e o dos efeitos não podem recusar isso.
 */
function DaMaquina({
  lista,
  filtro,
  dados,
  onApagar,
  onEditarTags,
}: {
  lista: Tipo;
  filtro: FiltroDoCompendio;
  dados: CompendioDaMaquina | null;
  onApagar: (id: string, nome: string) => void;
  onEditarTags: (edicao: EdicaoDeTags) => void;
}) {
  const { recarregar } = useCharacters();
  const deFora = useDeclarativoStore((state) => state.efeitos);
  const arrastar = useTokenDrag();
  // Um só para a lista, e não um por card: os cards daqui são desenhados por
  // função, e não por componente.
  const naMao = useTokenDragStore((state) => efeitoNaMao(state.arrasto?.fonte, true));

  const achados = useMemo(() => {
    if (!dados) return null;

    const coisas = coisasDaMaquina(lista, dados, deFora);

    return {
      total: coisas.length,
      lista: filtrarNoCompendio(coisas, filtro, (coisa) => coisa.nome, (coisa) => coisa.tags),
    };
  }, [dados, lista, filtro, deFora]);

  const { limite, fim } = useAosPoucos(achados?.lista, achados?.lista.length ?? 0);

  if (achados === null) return <Lendo />;
  if (achados.total === 0)
    return <PainelVazio conteudo={{ tipo: "compendio" }}>{texto.vazioMaquina}</PainelVazio>;
  if (achados.lista.length === 0) return <NadaCom filtro={filtro} />;

  const tipo = tipoDeMolde(lista);

  function trazer(id: string, nome: string) {
    const feito = trazerDoCompendio(selecaoDe(tipo, id)).then(() => {
      // Quem relê é quem guarda a lista que recebeu.
      if (tipo === "personagem") recarregar();
      else if (tipo === "item") itensMudaram([]);
      else if (tipo === "condicao") {
        useCondicoesDoCompendioStore.getState().recarregar();
        // A condição pode ter trazido o efeito dela.
        void useEfeitosDaCampanhaStore.getState().carregar();
      } else void useEfeitosDaCampanhaStore.getState().carregar();
    });

    void feito.then(() => toast.success(texto.trazido(nome)), falhou);
  }

  // O mesmo menu e a mesma ação em todos os cards; o que muda é o desenho e o
  // corpo: o do bestiário, em pé e com os medidores; o do item, quadrado e com
  // os atributos; o da condição e o do efeito, uma faixa com o selo.
  const desenhar = (coisa: CoisaDaMaquina) => {
    const props = {
      nome: coisa.nome,
      detalhe: coisa.detalhe,
      tags: coisa.tags,
      titulo: texto.dicaDaMaquina(coisa.nome),
      imagem: coisa.imagem ? (
        <ImagemDaMaquina assetId={coisa.imagem} />
      ) : (
        (coisa.desenho ??
        (lista === "bestiario" ? (
          <Skull className="text-muted-foreground size-8" aria-hidden />
        ) : (
          <Package className="text-muted-foreground size-8" aria-hidden />
        )))
      ),
      fundo: coisa.imagem ? <ImagemDaMaquina assetId={coisa.imagem} /> : undefined,
      tinta: coisa.tinta,
      naMao: coisa.id === naMao,
      onPointerDown: coisa.efeito
        ? (event: ReactPointerEvent) => {
            if (!daMaoNoCartao(event) || !coisa.efeito) return;
            // As condições de LÁ: os ids dos efeitos do ATO20 não são os daqui.
            arrastar(
              event,
              arrastoDoEfeito(coisa.efeito, coisa.tinta ?? COR_DA_AREA, {
                doAto20: true,
                condicoes: dados?.condicoes,
              }),
            );
          }
        : undefined,
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
                tipo,
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

    switch (lista) {
      case "bestiario":
        return <Cartao key={coisa.id} {...props} medidores={coisa.medidores} />;
      case "itens":
        return (
          <Cartao
            key={coisa.id}
            {...props}
            quadrado
            corpo={<AtributosDoCartao atributos={coisa.atributos} />}
          />
        );
      default:
        return <Cartao key={coisa.id} {...props} faixa />;
    }
  };

  return (
    <>
      <GradeDeCartoes>{achados.lista.slice(0, limite).map(desenhar)}</GradeDeCartoes>
      {fim}
    </>
  );
}

/** Uma lista do Compêndio da máquina, no formato que os cards desenham. */
function coisasDaMaquina(
  lista: Tipo,
  dados: CompendioDaMaquina,
  deFora: Parameters<typeof tituloDoEfeito>[1],
): CoisaDaMaquina[] {
  switch (lista) {
    case "bestiario":
      return dados.personagens.map((personagem) => ({
        id: personagem.id,
        nome: personagem.nome,
        tags: personagem.tags ?? [],
        medidores: personagem.medidores,
        imagem: personagem.retrato ?? personagem.miniatura,
      }));
    case "itens":
      return dados.itens.map((item) => ({
        id: item.id,
        nome: item.nome,
        detalhe: item.descricao || undefined,
        tags: item.tags ?? [],
        atributos: item.atributos,
        imagem: item.imagem?.tipo === "asset" ? item.imagem.id : undefined,
      }));
    case "condicoes": {
      // O efeito pelo nome: o de fábrica e o de plugin daqui, e o da campanha
      // pelo que a própria máquina guarda.
      const efeitos = dados.efeitos;

      return dados.condicoes.map((condicao) => ({
        id: condicao.id,
        nome: condicao.nome,
        detalhe: tituloDoEfeito(condicao.efeito, deFora, efeitos) ?? texto.soOSelo,
        tags: condicao.tags ?? [],
        // O efeito dela pelo que a própria máquina guarda: os ids do ATO20
        // não são os da campanha.
        desenho: (
          <DesenhoDaCondicao
            condicao={condicao}
            definicao={efeitos.find((efeito) => efeito.id === condicao.efeito)}
          />
        ),
        tinta: condicao.cor,
      }));
    }
    default: {
      const cores = new Map<string, string>();
      for (const condicao of dados.condicoes) {
        if (condicao.efeito && !cores.has(condicao.efeito)) cores.set(condicao.efeito, condicao.cor);
      }

      return dados.efeitos
        .filter((efeito) => especieDoEfeito(efeito) === "area")
        .map((efeito) => {
          const cor = corDoEfeito(efeito, cores.get(efeito.id));

          return {
            id: efeito.id,
            nome: efeito.titulo,
            detalhe: efeito.dica,
            tags: efeito.tags ?? [],
            desenho: <DesenhoDoEfeito efeito={efeito} cor={cor} />,
            tinta: cor,
            efeito,
          };
        });
    }
  }
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
