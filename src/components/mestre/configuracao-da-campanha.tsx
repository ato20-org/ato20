"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  Gauge,
  Plus,
  Search,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import {
  useEfeitosEmAreaDaCampanha,
  useEfeitosEmAreaDosPlugins,
} from "@/components/mestre/efeito-da-area";
import { TelaDaCondicao } from "@/components/mestre/efeitos-da-campanha";
import { EfeitosEmAreaDaCampanha } from "@/components/mestre/efeitos-em-area-da-campanha";
import { toast } from "sonner";

import {
  AjustesDaCampanha,
  bateNaBusca,
} from "@/components/desktop/lista-de-configuracoes";
import { LinhaDeCondicao } from "@/components/mestre/linha-de-condicao";
import {
  LinhaDeMedidor,
  SeloDoMedidor,
} from "@/components/mestre/linha-de-medidor";
import { PainelVazio } from "@/components/mestre/painel-vazio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCharacters } from "@/hooks/use-characters";
import { useListReorder } from "@/hooks/use-list-reorder";
import { SUGESTOES } from "@/lib/condicao";
import { useConfiguracoesStore } from "@/lib/configuracoes/registro";
import {
  definirPadraoDoQuadro,
  usePadraoDoQuadro,
} from "@/lib/configuracoes/quadro";
import { escoposDe } from "@/lib/configuracoes/valor";
import {
  TOPICOS_DA_CAMPANHA,
  topicosAchados,
  type TopicoDaCampanha,
} from "@/lib/mestre/topicos-da-campanha";
import { useCondicoesDaCampanha } from "@/lib/store/use-condicoes-store";
import { CORES_LAPIS } from "@/lib/store/use-tool-store";
import {
  aplicarModelosEmTodos,
  criarCondicaoDaCampanha,
  criarModelo,
  editarCondicaoDaCampanha,
  editarModelo,
  listarModelos,
  removerCondicaoDaCampanha,
  removerModelo,
  reordenarCondicoesDaCampanha,
  reordenarModelos,
} from "@/lib/vault/characters";
import {
  MAX_MODELOS,
  MAX_MODELOS_DE_CONDICAO,
  type Condicao,
  type ModeloDeMedidor,
  type PatchModelo,
} from "@/types/character";

/** O teto com que um modelo nasce. Dez é a escala da maioria das mesas. */
const MAXIMO_INICIAL = 10;

/** O ícone de cada tópico, na barra. Os textos moram em `TOPICOS_DA_CAMPANHA`. */
const ICONE: Record<TopicoDaCampanha, typeof Gauge> = {
  quadro: Shapes,
  medidores: Gauge,
  efeitos: Sparkles,
  ajustes: SlidersHorizontal,
};

/**
 * O que vale para a campanha inteira.
 *
 * Uma janela e não um diálogo, como Personagens e Estante: o mestre monta o
 * sistema da mesa aqui e vai conferindo o resultado nas fichas abertas ao lado.
 * Um modal cobriria justamente o que ele quer olhar enquanto ajusta.
 *
 * Arrumada como as Configurações gerais -- tópicos numa barra, um de cada vez
 * --, porque eram quatro seções empilhadas numa rolagem só, e o que o mestre
 * queria estava sempre três telas abaixo. A barra fica ao LADO com espaço, e
 * vira uma fileira no topo quando a janela atraca estreita numa coluna do
 * dock: `@container`, e não breakpoint de tela, porque quem manda é a largura
 * da janela. Ver a ficha, que faz o mesmo.
 *
 * A busca atravessa os tópicos, como a do VSCode: com termo, a janela mostra
 * TODOS os que batem, um embaixo do outro, e a barra encolhe para eles. Clicar
 * num tópico durante a busca a encerra e abre só ele.
 *
 * O que decide se algo mora aqui é uma pergunta só: isto vale para a CAMPANHA,
 * ou para uma cena ou um personagem? Sol e grade são da cena e ficam no palco.
 * O layout e a posição dos retratos valem para a mesa inteira e são gravados
 * por campanha, então moram aqui; a janela de Retratos fica com o elenco.
 */
export function ConfiguracaoDaCampanhaBody() {
  const [aberto, setAberto] = useState<TopicoDaCampanha>("quadro");
  const [busca, setBusca] = useState("");

  // No alto, e não dentro de cada tópico: a busca precisa dos nomes do que foi
  // criado -- "Envenenado" acha Condições --, e o tópico fechado não está
  // montado para contar.
  const medidores = useModelosDaCampanha();
  const { modelos: condicoes } = useCondicoesDaCampanha();
  const efeitosEmArea = useEfeitosEmAreaDaCampanha();
  const efeitosEmAreaDosPlugins = useEfeitosEmAreaDosPlugins();
  const definicoes = useConfiguracoesStore((state) => state.definicoes);

  const ajustes = useMemo(
    () =>
      Object.values(definicoes).filter((definicao) =>
        escoposDe(definicao).includes("campanha"),
      ),
    [definicoes],
  );

  const buscando = busca.trim() !== "";

  const topicos = useMemo(() => {
    const achados = topicosAchados(busca, {
      medidores: (medidores.modelos ?? []).map((modelo) => modelo.nome),
      efeitos: [
        ...(condicoes ?? []).map((condicao) => condicao.nome),
        ...efeitosEmArea.map((efeito) => efeito.titulo),
        ...efeitosEmAreaDosPlugins.flatMap((grupo) =>
          grupo.efeitos.map((efeito) => efeito.titulo),
        ),
      ],
    });
    // Ajustes só existe com algo para ajustar -- hoje, só quando um plugin
    // declara. E acha pelos próprios ajustes, com a MESMA conta da lista.
    const ajusteAchado = ajustes.some((definicao) =>
      bateNaBusca(definicao, busca),
    );

    return TOPICOS_DA_CAMPANHA.map((topico) => topico.chave).filter((chave) =>
      chave === "ajustes"
        ? ajustes.length > 0 && (achados.includes(chave) || ajusteAchado)
        : achados.includes(chave),
    );
  }, [
    busca,
    medidores.modelos,
    condicoes,
    efeitosEmArea,
    efeitosEmAreaDosPlugins,
    ajustes,
  ]);

  // O tópico aberto pode sumir -- o plugin do único ajuste foi desligado.
  const atual = topicos.includes(aberto) ? aberto : "quadro";
  const mostrados = buscando ? topicos : [atual];

  function abrir(chave: TopicoDaCampanha) {
    setBusca("");
    setAberto(chave);
  }

  return (
    <div className="@container/config flex min-h-0 flex-1 flex-col">
      <div className="border-b p-2">
        <div className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            onKeyDown={(evento) => {
              // Esc limpa antes de fechar qualquer coisa: é o gesto de quem
              // desistiu da busca, não da janela.
              if (evento.key === "Escape" && busca) {
                evento.stopPropagation();
                setBusca("");
              }
            }}
            placeholder="Buscar configuração"
            aria-label="Buscar configuração da campanha"
            className="h-8 pr-8 pl-8 text-sm"
          />
          {busca ? (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Limpar a busca"
              className="absolute top-1/2 right-1 -translate-y-1/2"
              onClick={() => setBusca("")}
            >
              <X />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col @[30rem]/config:flex-row">
        {/* Estreita, a barra é uma fileira que rola de lado; larga, uma coluna.
            `rolagem-limpa` porque a barra de rolagem de uma fileira de cinco
            botões seria mais alta que a vontade de rolá-la. */}
        <nav
          aria-label="Tópicos"
          className="rolagem-limpa bg-muted/30 flex shrink-0 gap-0.5 overflow-x-auto border-b p-1.5 @[30rem]/config:w-44 @[30rem]/config:flex-col @[30rem]/config:overflow-x-visible @[30rem]/config:border-r @[30rem]/config:border-b-0"
        >
          {topicos.map((chave) => {
            const topico = TOPICOS_DA_CAMPANHA.find((t) => t.chave === chave)!;
            const Icone = ICONE[chave];
            const ativo = !buscando && chave === atual;

            return (
              <Button
                key={chave}
                variant={ativo ? "secondary" : "ghost"}
                size="sm"
                aria-current={ativo ? "page" : undefined}
                className="shrink-0 justify-start @[30rem]/config:w-full"
                onClick={() => abrir(chave)}
              >
                <Icone />
                <span className="truncate">{topico.titulo}</span>
              </Button>
            );
          })}
        </nav>

        {/* `key` para a rolagem voltar ao topo ao trocar de tópico: o tópico
            novo aberto no meio da altura do anterior começa pela metade. */}
        <ScrollArea key={buscando ? "busca" : atual} className="min-h-0 flex-1">
          <div className="space-y-4 p-3">
            {mostrados.length === 0 ? (
              <p className="text-muted-foreground px-1 py-6 text-center text-xs">
                Nada com esse nome
              </p>
            ) : (
              mostrados.map((chave, indice) => (
                <div key={chave} className="space-y-4">
                  {indice > 0 ? <Separator /> : null}
                  <Topico
                    chave={chave}
                    busca={busca}
                    medidores={medidores}
                  />
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

/** O corpo de um tópico. */
function Topico({
  chave,
  busca,
  medidores,
}: {
  chave: TopicoDaCampanha;
  busca: string;
  medidores: ModelosDaCampanha;
}) {
  switch (chave) {
    case "quadro":
      return <PadraoDoQuadro />;
    case "medidores":
      return <MedidoresDaCampanha {...medidores} />;
    case "efeitos":
      return <EfeitosDaCampanha />;
    case "ajustes":
      return (
        <Secao
          titulo="Ajustes da campanha"
          descricao="O que o ATO20 e os plugins deixam ajustar só nesta campanha. Vence o da máquina."
        >
          {/* A busca desce para a lista só quando ela não achou o TÓPICO: quem
              digitou "plugin" quer ver todos os ajustes, e filtrá-los pelo
              termo não deixaria nenhum. */}
          <AjustesDaCampanha
            busca={topicosAchados(busca, {}).includes("ajustes") ? "" : busca}
          />
        </Secao>
      );
  }
}

/**
 * O jeito com que os elementos NOVOS do quadro nascem nesta campanha.
 *
 * Controles desenhados à mão para os dois padrões, como o zoom nas
 * Configurações gerais: a lista gerada de Ajustes também os mostra, mas é aqui
 * que o mestre vem procurar. A frase de baixo é a que responde "e o que já
 * está no quadro?", que é a primeira pergunta de quem liga.
 */
function PadraoDoQuadro() {
  const { arredondado, aMao } = usePadraoDoQuadro();

  return (
    <Secao
      titulo="Quadro"
      descricao="Como os elementos novos nascem. O que já está no quadro fica como está, e cada um troca o seu no próprio gizmo."
    >
      <ul className="divide-y">
        <LinhaDePadrao
          titulo="Cantos arredondados"
          descricao="Retângulos e polígonos nascem com canto redondo."
          ligada={arredondado}
          onMudar={(valor) => definirPadraoDoQuadro({ arredondado: valor })}
        />
        <LinhaDePadrao
          titulo="Traço à mão"
          descricao="Formas e setas saem tremidas, como rabisco a lápis, e o texto solto nasce em letra de mão."
          ligada={aMao}
          onMudar={(valor) => definirPadraoDoQuadro({ aMao: valor })}
        />
      </ul>
    </Secao>
  );
}

/** Uma chave com o que ela faz ao lado, como as das Configurações gerais. */
function LinhaDePadrao({
  titulo,
  descricao,
  ligada,
  onMudar,
}: {
  titulo: string;
  descricao: string;
  ligada: boolean;
  onMudar: (ligada: boolean) => void;
}) {
  return (
    <li>
      <label className="flex items-start gap-3 py-2">
        <Switch checked={ligada} onCheckedChange={onMudar} aria-label={titulo} />
        <span className="min-w-0">
          <span className="block text-sm">{titulo}</span>
          <span className="text-muted-foreground block text-[11px] leading-snug">
            {descricao}
          </span>
        </span>
      </label>
    </li>
  );
}

/** Uma seção com título e uma linha de descrição, como a dos medidores. */
function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-medium">{titulo}</h3>
        <p className="text-muted-foreground text-[11px] leading-snug">
          {descricao}
        </p>
      </div>
      {children}
    </section>
  );
}

type ModelosDaCampanha = {
  /** `null` enquanto a primeira leitura não voltou. */
  modelos: ModeloDeMedidor[] | null;
  setModelos: Dispatch<SetStateAction<ModeloDeMedidor[] | null>>;
  reler: () => void;
};

/**
 * Os medidores da campanha, lidos UMA vez pela janela e não pelo tópico: a
 * busca procura pelo nome deles com o tópico fechado. Ver o corpo.
 */
function useModelosDaCampanha(): ModelosDaCampanha {
  const [modelos, setModelos] = useState<ModeloDeMedidor[] | null>(null);

  const reler = useCallback(() => {
    listarModelos().then(setModelos, (cause: unknown) => {
      setModelos([]);
      toast.error(
        cause instanceof Error ? cause.message : "Falha ao ler os medidores.",
      );
    });
  }, []);

  useEffect(reler, [reler]);

  return { modelos, setModelos, reler };
}

/**
 * Os medidores de fábrica: o que toda ficha desta campanha começa tendo.
 *
 * MOLDE, e não vínculo. Criar um aqui materializa um medidor de verdade em cada
 * personagem, e dali em diante o medidor é dele — o mestre renomeia, troca a
 * cor, apaga. Editar o modelo depois não empurra nada; para isso existe
 * "Aplicar em todos", que é um gesto com nome. Ver `ModeloDeMedidor`.
 */
function MedidoresDaCampanha({ modelos, setModelos, reler }: ModelosDaCampanha) {
  const [ocupado, setOcupado] = useState(false);

  // As fichas abertas releem: materializar um modelo mexe no índice de
  // personagens, e sem isto elas seguiriam mostrando a lista de medidores de
  // antes até alguém tocar nelas.
  const { personagens, recarregar } = useCharacters();
  const quantos = personagens?.length ?? 0;

  /** Roda a chamada, relê os dois lados e destrava. Toda ação passa por aqui. */
  async function mexer(acao: () => Promise<unknown>, erro: string) {
    setOcupado(true);
    try {
      await acao();
      reler();
      recarregar();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : erro);
    } finally {
      setOcupado(false);
    }
  }

  const lista = modelos ?? [];
  const cheio = lista.length >= MAX_MODELOS;

  /**
   * Arrastar pela alça reordena. A ordem é a que a ficha NOVA recebe; as que já
   * existem não se mexem, porque o medidor é delas. Ver `reordenar` no Rust.
   */
  const { listRef, dropIndex, startReorder } = useListReorder<string>(
    (modeloId, index) => {
      const de = lista.findIndex((modelo) => modelo.id === modeloId);
      if (de < 0 || de === index) return;

      const arrumada = [...lista];
      const [movido] = arrumada.splice(de, 1);
      arrumada.splice(index, 0, movido!);

      // A linha fica onde foi solta já, sem esperar o disco: a volta do IPC
      // deixaria um quadro com ela no lugar antigo. O `reler` confirma depois.
      setModelos(arrumada);
      void mexer(
        () => reordenarModelos(arrumada.map((modelo) => modelo.id)),
        "Falha ao reordenar.",
      );
    },
  );

  async function criar() {
    await mexer(async () => {
      const { alcancados } = await criarModelo(
        lista.length === 0 ? "Vida" : "Medidor",
        CORES_LAPIS[lista.length % CORES_LAPIS.length] ?? CORES_LAPIS[0],
        "barra",
        MAXIMO_INICIAL,
      );

      toast.success(
        alcancados === 0
          ? "Medidor criado."
          : `Medidor criado em ${alcancados} ${alcancados === 1 ? "personagem" : "personagens"}.`,
      );
    }, "Falha ao criar o medidor.");
  }

  async function aplicar() {
    await mexer(async () => {
      const { alcancados } = await aplicarModelosEmTodos();

      toast.success(
        `Aplicado em ${alcancados} de ${quantos} ${quantos === 1 ? "personagem" : "personagens"}.`,
      );
    }, "Falha ao aplicar.");
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">Medidores da campanha</h3>
          <p className="text-muted-foreground text-[11px] leading-snug">
            Todo personagem começa com estes.
          </p>
        </div>

        {/* O gesto que falta ao molde por ele não ser um vínculo vivo. Ícone no
            cabeçalho, ao lado do criar, e não um botão da largura da seção: é
            um gesto de vez em quando, e o botão largo pesava mais que a lista
            que ele aplica. O aviso fica no tooltip -- ele é a exceção, e quem
            já entendeu não precisa relê-lo a cada abertura. */}
        {lista.length > 0 ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Aplicar em todos os personagens"
                  disabled={ocupado || quantos === 0}
                  onClick={() => void aplicar()}
                >
                  <Wand2 />
                </Button>
              }
            />
            <TooltipContent>
              <p className="font-medium">Aplicar em todos os personagens</p>
              <p className="text-muted-foreground max-w-56">
                Quem já tem um medidor com o mesmo nome não ganha outro.
              </p>
            </TooltipContent>
          </Tooltip>
        ) : null}

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Criar medidor da campanha"
                disabled={cheio || ocupado}
                onClick={() => void criar()}
              >
                <Plus />
              </Button>
            }
          />
          <TooltipContent>
            <p className="font-medium">Criar medidor da campanha</p>
            {cheio ? (
              <p className="text-muted-foreground max-w-48">
                Limite de {MAX_MODELOS} medidores.
              </p>
            ) : null}
          </TooltipContent>
        </Tooltip>
      </div>

      {modelos === null ? (
        <p className="text-muted-foreground text-[11px]">Lendo…</p>
      ) : lista.length === 0 ? (
        <PainelVazio icone={Gauge}>Nenhum medidor registrado</PainelVazio>
      ) : (
        <ul ref={listRef} className="space-y-1">
          {lista.map((modelo, index) => (
            <LinhaDeModelo
              key={modelo.id}
              modelo={modelo}
              ocupado={ocupado}
              dropTarget={dropIndex === index}
              onReorderStart={(event) => startReorder(event, modelo.id)}
              onEditar={(patch) =>
                void mexer(
                  () => editarModelo(modelo.id, patch),
                  "Falha ao gravar.",
                )
              }
              onApagar={() =>
                void mexer(
                  () => removerModelo(modelo.id),
                  "Falha ao apagar o medidor.",
                )
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Um modelo na linha compartilhada com a ficha. Ver `LinhaDeMedidor`.
 *
 * Entra cheio, que é como ele nasce numa ficha.
 */
function LinhaDeModelo({
  modelo,
  ocupado,
  dropTarget,
  onReorderStart,
  onEditar,
  onApagar,
}: {
  modelo: ModeloDeMedidor;
  ocupado: boolean;
  dropTarget: boolean;
  onReorderStart: (event: ReactPointerEvent) => void;
  onEditar: (patch: PatchModelo) => void;
  onApagar: () => void;
}) {
  const porcentagem = modelo.estilo === "porcentagem";

  return (
    <LinhaDeMedidor
      medidor={{ ...modelo, atual: modelo.maximo }}
      ocupado={ocupado}
      dropTarget={dropTarget}
      onReorderStart={onReorderStart}
      onEditar={onEditar}
      onApagar={onApagar}
      dicaDoOlho={{
        titulo: modelo.escondido ? "Começa escondido" : "Começa à vista",
        texto: "Não muda as fichas que já têm este medidor.",
      }}
      valores={
        // Só o MÁXIMO, sem valor atual. O atual é do personagem -- é o que
        // distingue o goblin com três de vida do goblin com vinte --, e um
        // campo aqui pediria ao mestre uma escolha que não quer dizer nada.
        // Ver `ModeloDeMedidor`.
        <SeloDoMedidor
          ocupado={ocupado}
          // A porcentagem mostra o que a mesa verá com ele cheio. O máximo
          // ainda existe, e é a escala da conta: o campo abre com ele.
          texto={porcentagem ? "100%" : modelo.maximo}
          dica={{
            titulo: `Máximo: ${modelo.maximo}`,
            texto: porcentagem
              ? "A porcentagem é contada sobre ele. Clique para trocar."
              : "Começa cheio. Clique para trocar.",
          }}
          campos={[
            {
              rotulo: "Valor máximo",
              valor: modelo.maximo,
              onGravar: (maximo) => onEditar({ maximo }),
            },
          ]}
        />
      }
    />
  );
}

/**
 * O tópico Efeitos: as condições do token e os efeitos em área, em duas abas.
 * Os dois são o mesmo formato de efeito e o mesmo editor, e o mestre que
 * procura "o fogo" não deveria ter de saber em qual dos dois ele mora.
 */
function EfeitosDaCampanha() {
  const [aba, setAba] = useState<"condicoes" | "area">("condicoes");

  return (
    <div className="space-y-3">
      <Tabs value={aba} onValueChange={(valor) => setAba(valor as typeof aba)}>
        <TabsList className="w-full">
          <TabsTrigger value="condicoes" className="flex-1">
            Condições
          </TabsTrigger>
          <TabsTrigger value="area" className="flex-1">
            Efeito em área
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {aba === "condicoes" ? <CondicoesDaCampanha /> : <EfeitosEmAreaDaCampanha />}
    </div>
  );
}

/**
 * O cardápio de condições: o que o menu do token oferece.
 *
 * CARDÁPIO, e não molde -- o avesso dos medidores logo acima. Criar uma
 * condição aqui não toca em ficha nenhuma, porque ninguém nasce envenenado:
 * ela só passa a estar a um clique no botão direito do token. Quando o mestre
 * a marca, o personagem ganha uma cópia, e editar o cardápio depois não muda a
 * cor do veneno que a mesa já está vendo. Ver `vault::condicoes`.
 */
function CondicoesDaCampanha() {
  const { modelos, recarregar } = useCondicoesDaCampanha();
  const [ocupado, setOcupado] = useState(false);
  /** A condição aberta na tela dela, pela engrenagem. `null` = a lista. */
  const [configurando, setConfigurando] = useState<string | null>(null);
  /** A ordem depois de um arrasto, até o cardápio relido chegar. */
  const [arrastada, setArrastada] = useState<{
    de: Condicao[] | null;
    lista: Condicao[];
  } | null>(null);

  const lista =
    arrastada && arrastada.de === modelos ? arrastada.lista : (modelos ?? []);
  const cheio = lista.length >= MAX_MODELOS_DE_CONDICAO;

  async function mexer(acao: () => Promise<unknown>, erro: string) {
    setOcupado(true);
    try {
      await acao();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : erro);
    } finally {
      recarregar();
      setOcupado(false);
    }
  }

  const { listRef, dropIndex, startReorder } = useListReorder<string>(
    (modeloId, index) => {
      const de = lista.findIndex((modelo) => modelo.id === modeloId);
      if (de < 0 || de === index) return;

      const arrumada = [...lista];
      const [movido] = arrumada.splice(de, 1);
      arrumada.splice(index, 0, movido!);

      setArrastada({ de: modelos, lista: arrumada });
      void mexer(
        () => reordenarCondicoesDaCampanha(arrumada.map((modelo) => modelo.id)),
        "Falha ao reordenar.",
      );
    },
  );

  async function criar() {
    await mexer(
      () =>
        criarCondicaoDaCampanha(
          "Condição",
          CORES_LAPIS[lista.length % CORES_LAPIS.length] ?? CORES_LAPIS[0],
          "circulo",
          null,
        ),
      "Falha ao criar a condição.",
    );
  }

  /**
   * O cardápio de partida, num gesto com nome. Só existe com o cardápio vazio:
   * no meio de uma lista que o mestre já montou, ele duplicaria "Em chamas"
   * ao lado do "Em chamas" que o mestre configurou.
   */
  async function sugerir() {
    await mexer(async () => {
      for (const sugestao of SUGESTOES) {
        await criarCondicaoDaCampanha(
          sugestao.nome,
          sugestao.cor,
          sugestao.icone,
          sugestao.efeito ?? null,
        );
      }
    }, "Falha ao criar as sugestões.");
  }

  // A tela da condição, quando a engrenagem a abriu: o selo e o efeito dela.
  const aberta = configurando ? lista.find((modelo) => modelo.id === configurando) : undefined;
  if (aberta) {
    return (
      <TelaDaCondicao
        modelo={aberta}
        ocupado={ocupado}
        onEditar={(patch) =>
          void mexer(() => editarCondicaoDaCampanha(aberta.id, patch), "Falha ao gravar.")
        }
        onVoltar={() => setConfigurando(null)}
      />
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">Condições da campanha</h3>
          <p className="text-muted-foreground text-[11px] leading-snug">
            O que o botão direito do token oferece.
          </p>
        </div>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Criar condição da campanha"
                disabled={cheio || ocupado}
                onClick={() => void criar()}
              >
                <Plus />
              </Button>
            }
          />
          <TooltipContent>
            <p className="font-medium">Criar condição da campanha</p>
            {cheio ? (
              <p className="text-muted-foreground max-w-48">
                Limite de {MAX_MODELOS_DE_CONDICAO} condições: mais que isso e
                o menu do token vira uma lista que se rola.
              </p>
            ) : null}
          </TooltipContent>
        </Tooltip>
      </div>

      {modelos === null ? (
        <p className="text-muted-foreground text-[11px]">Lendo…</p>
      ) : lista.length === 0 ? (
        <div className="space-y-2">
          <PainelVazio icone={Sparkles}>Nenhuma condição registrada</PainelVazio>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={ocupado}
            onClick={() => void sugerir()}
          >
            Usar sugestões
          </Button>
        </div>
      ) : (
        <ul ref={listRef} className="space-y-0.5">
          {lista.map((modelo, index) => (
            <LinhaDeCondicao
              key={modelo.id}
              condicao={modelo}
              ocupado={ocupado}
              dropTarget={dropIndex === index}
              onReorderStart={(event) => startReorder(event, modelo.id)}
              onEditar={(patch) =>
                void mexer(
                  () => editarCondicaoDaCampanha(modelo.id, patch),
                  "Falha ao gravar.",
                )
              }
              onConfigurar={() => setConfigurando(modelo.id)}
              onApagar={() =>
                void mexer(
                  () => removerCondicaoDaCampanha(modelo.id),
                  "Falha ao apagar a condição.",
                )
              }
              dicaDoOlho={{
                titulo: modelo.escondido ? "Chega escondida" : "Chega à vista",
                texto:
                  "Vale para as próximas vezes que ela for marcada. Não muda quem já a tem.",
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
