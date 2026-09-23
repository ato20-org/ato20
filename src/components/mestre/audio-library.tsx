"use client";

import { useMemo, useState } from "react";
import {
  HelpCircle,
  Loader2,
  type LucideIcon,
  MoreVertical,
  Music,
  Pencil,
  Play,
  Plus,
  Search,
  Square,
  Trash2,
  Upload,
  Waves,
  X,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { SomAtual } from "@/components/mestre/som-atual";
import { useAssetList } from "@/hooks/use-asset-list";
import {
  aoApertarF2,
  useRenomearPeloMenu,
} from "@/hooks/use-renomear-pelo-menu";
import { countAssetUsage } from "@/lib/mestre/asset-usage";
import { CORES_DO_SOM } from "@/lib/mestre/cores-do-som";
import { normaliza } from "@/lib/search";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useTrackStore } from "@/lib/store/use-track-store";
import { cn } from "@/lib/utils";
import {
  type AssetMeta,
  GANHO_PADRAO,
  type Pad,
  type TipoDeSom,
} from "@/types/scene";

/**
 * A ordem em que os pads aparecem na grade.
 *
 * Índices, não teclas: é o desenho do teclado numérico, com o 7 em cima e o 1
 * embaixo. Escrever a lista à mão em vez de derivá-la de um laço é o que
 * garante que a grade na tela e a mão no teclado concordem — um `map` de 0 a 8
 * desenharia o 1 no alto, e o mestre erraria a tecla toda vez.
 */
const GRADE = [6, 7, 8, 3, 4, 5, 0, 1, 2];

/** O desenho de cada tipo de som. A cor dele vive em `CORES_DO_SOM`. */
const ICONE_DO_TIPO: Record<TipoDeSom, LucideIcon> = {
  trilha: Music,
  ambiente: Waves,
  disparo: Zap,
};

/**
 * Os três tipos, na ordem em que as camadas se empilham na mesa.
 *
 * A trilha por baixo, o ambiente sobre ela, o efeito por cima das duas. Vale
 * para o menu de importar, para o de trocar o tipo e para os grupos da lista —
 * três ordens diferentes para a mesma coisa fariam o olho procurar de novo a
 * cada lugar.
 *
 * A explicação é o que a tecla FAZ, e não o que o som É: "a música da sessão"
 * responde a pergunta de quem está escolhendo onde pôr o arquivo.
 */
const TIPOS: { tipo: TipoDeSom; rotulo: string; explicacao: string }[] = [
  { tipo: "trilha", rotulo: "Trilha", explicacao: "A música da sessão" },
  { tipo: "ambiente", rotulo: "Ambiente", explicacao: "Fundo que fica em loop" },
  { tipo: "disparo", rotulo: "Efeito", explicacao: "Toca uma vez e some" },
];

/**
 * Os grupos da lista, na ordem em que aparecem.
 *
 * `null` é o som que ninguém classificou — importado antes de o tipo existir,
 * ou largado na janela sem passar pelo botão. Vai por ÚLTIMO e não some: ele é
 * o que precisa de atenção, mas não é o que se procura no meio de uma cena.
 */
const GRUPOS: { tipo: TipoDeSom | null; titulo: string }[] = [
  { tipo: "trilha", titulo: "Trilhas" },
  { tipo: "ambiente", titulo: "Ambientes" },
  { tipo: "disparo", titulo: "Efeitos" },
  { tipo: null, titulo: "Sem tipo" },
];

/**
 * Por que palavras cada tipo é achado na busca.
 *
 * Mais de uma por tipo de propósito: o campo se chama `disparo` no código e
 * "Efeito" na tela, e quem digita uma das duas quer a mesma lista. "Musica" e
 * "loop" entram porque são o que se pensa antes de lembrar o nome da camada.
 */
const PALAVRAS: Record<TipoDeSom, string[]> = {
  trilha: ["trilha", "musica", "música"],
  ambiente: ["ambiente", "fundo", "loop"],
  disparo: ["disparo", "efeito", "sfx"],
};

/**
 * O acervo filtrado pelo que foi digitado: por nome, ou por tipo.
 *
 * Função de módulo e não uma cópia em cada lista porque são DUAS as buscas — a
 * do acervo e a do seletor do pad — e elas fazem a mesma pergunta. Duas cópias
 * divergiriam no dia em que uma delas passasse a entender "sfx".
 *
 * As duas no mesmo campo, e não um filtro de tipo ao lado: a pergunta é sempre
 * "cadê o som de X", e X tanto é "chuva" quanto "os ambientes".
 */
function filtrarSons(assets: AssetMeta[], busca: string): AssetMeta[] {
  const alvo = normaliza(busca.trim());
  if (!alvo) return assets;

  return assets.filter((asset) => {
    if (normaliza(asset.name).includes(alvo)) return true;

    const tipo = asset.tipoDeSom;
    if (!tipo) return false;

    // Os dois sentidos: "amb" acha "ambiente", e "ambientes" no plural acha o
    // mesmo grupo. Só um deles deixaria metade do que se digita sem resposta.
    return PALAVRAS[tipo].some(
      (palavra) => palavra.startsWith(alvo) || alvo.startsWith(palavra),
    );
  });
}

/** Os sons de um grupo, na ordem em que a lista os desenha. `null` = sem tipo. */
function doGrupo(assets: AssetMeta[], tipo: TipoDeSom | null): AssetMeta[] {
  return assets.filter((asset) => (asset.tipoDeSom ?? null) === tipo);
}

/**
 * Este pad está soando agora?
 *
 * Só faz sentido para os dois que ALTERNAM. Um disparo nunca está aceso: ele
 * soa e acaba, e acender a tecla por dois segundos seria um pisca que não diz
 * nada sobre o estado da mesa.
 */
function padAceso(
  pad: NonNullable<Pad>,
  tipo: TipoDeSom | undefined,
  trilhaAtual: string | undefined,
  ambientesAcesos: Set<string>,
): boolean {
  if (tipo === "trilha") return pad.assetId === trilhaAtual;
  if (tipo === "ambiente") return ambientesAcesos.has(pad.assetId);

  return false;
}

/**
 * A mesa de som da sessão: os pads, o que está tocando e o acervo.
 *
 * Três abas com ritmos diferentes, na ordem em que a mão as procura. Os PADS
 * são o teclado: consultados de relance no meio da cena, para conferir o que a
 * tecla faz. O ATUAL é o mixer, onde as camadas no ar aparecem juntas — ver
 * `SomAtual`. O ACERVO é consultado uma vez, quando se monta a cena.
 *
 * Abas e não secções empilhadas porque as três não cabem juntas numa janela de
 * mestre, e dobrá-las transferia a decisão do que caber para quem só queria
 * abaixar a chuva.
 *
 * Os quatro faders de camada moravam aqui no pé e foram para a barra da janela,
 * ao lado da engrenagem — ver `VolumePopover`. Dois motivos: eles são da
 * MÁQUINA e não da campanha, e no pé do painel cobravam altura de todas as abas
 * o tempo inteiro por um controle que se usa aos arrancos. Nas Configurações
 * seriam longe demais: "abaixa o cenário que eu vou falar" acontece no meio de
 * uma fala, e um diálogo modal não atende a isso.
 *
 * A TRILHA aparece em dois lugares, e de propósito: aqui como mais uma camada
 * do mixer, e na barra do pé da janela (`TrackBar`) com a onda e a navegação
 * grossa. A barra existe porque saber se a música ainda roda não pode exigir
 * abrir uma aba; o painel existe porque equilibrar música com chuva exige ver
 * as duas ao mesmo tempo.
 *
 * Quem lê o som do disco é o `CampaignBoot`, antes de a mesa aparecer.
 */
export function AudioLibrary() {
  const {
    assets,
    importar,
    importando,
    remove,
    rename,
    definirTipoDeSom,
  } = useAssetList("audio");

  const [busca, setBusca] = useState("");

  const scenes = useSceneStore((state) => state.board?.scenes);

  const track = useTrackStore((state) => state.track);
  const ambientes = useTrackStore((state) => state.ambientes);
  const ambientesPorCena = useTrackStore((state) => state.ambientesPorCena);
  const pads = useTrackStore((state) => state.pads);
  const macros = useTrackStore((state) => state.macros);

  const alternarTrilha = useTrackStore((state) => state.alternarTrilha);
  const alternar = useTrackStore((state) => state.alternar);
  const disparar = useTrackStore((state) => state.disparar);
  const definirPad = useTrackStore((state) => state.definirPad);
  const acionarPad = useTrackStore((state) => state.acionarPad);

  const adicionarMacro = useTrackStore((state) => state.adicionarMacro);
  const removerMacro = useTrackStore((state) => state.removerMacro);
  const acionarMacro = useTrackStore((state) => state.acionarMacro);

  /** O acervo por id, para pad e ambiente acharem o nome do arquivo deles. */
  const porId = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets],
  );

  /**
   * Onde cada asset é usado no som, para a lixeira.
   *
   * O objeto inteiro e não só a trilha: um arquivo que é pad não está tocando
   * e ninguém o vê, e apagá-lo só apareceria ao apertar o 7 no meio da cena.
   */
  const som = useMemo(
    () => ({ track, ambientes, ambientesPorCena, pads, macros }),
    [track, ambientes, ambientesPorCena, pads, macros],
  );

  /**
   * Em que tecla cada som já está.
   *
   * Um som, uma tecla — ver `definirPad`. O seletor mostra os repetidos
   * desligados com o número em que estão, em vez de aceitar o clique e não
   * fazer nada: o mestre precisa saber ONDE o som está, e não só que ele já
   * está em algum lugar.
   */
  const teclaDoSom = useMemo(() => {
    const mapa = new Map<string, number>();

    pads.forEach((pad, indice) => {
      if (pad) mapa.set(pad.assetId, indice + 1);
    });

    return mapa;
  }, [pads]);

  /** Quais arquivos estão acesos como ambiente, para a linha do acervo acender. */
  const acesos = useMemo(
    () => new Set(ambientes.map((ambiente) => ambiente.assetId)),
    [ambientes],
  );

  /**
   * O que a busca deixou passar.
   *
   * Por NOME ou por TIPO, e as duas no mesmo campo em vez de um filtro ao lado:
   * a pergunta é sempre "cadê o som de X", e X tanto é "chuva" quanto "os
   * ambientes". Um seletor de tipo separado faria escolher a categoria antes de
   * poder digitar, que é um passo a mais para a pergunta mais comum.
   */
  const achados = useMemo(() => filtrarSons(assets, busca), [assets, busca]);

  /**
   * Aciona um som pelo que ele É.
   *
   * O acervo tinha três botões por linha — trilha, ambiente, disparar — porque
   * o arquivo não dizia o que era. Agora diz, e sobra um gesto: a trilha e o
   * ambiente ALTERNAM, o efeito dispara. É a mesma tabela do `acionarPad`, e de
   * propósito: a tecla e a linha têm de fazer a mesma coisa com o mesmo som.
   *
   * Sem tipo não faz nada, e o botão nem aparece — ver `AudioRow`.
   */
  const acionarSom = (asset: AssetMeta) => {
    if (asset.tipoDeSom === "trilha") alternarTrilha(asset.id);
    else if (asset.tipoDeSom === "ambiente") alternar(asset.id);
    else if (asset.tipoDeSom === "disparo") disparar(asset.id);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Abas e não secções empilhadas.
          As três somam mais altura do que a janela tem, e dobrá-las punha a
          escolha do que caber sobre o mestre — três interruptores para acertar
          antes de o painel servir. A aba responde a mesma coisa sem pedir nada:
          uma de cada vez, sempre inteira, e o que estava aberto não se desfaz
          por causa de um acervo que cresceu.

          `gap-0`: o `Tabs` separa lista e painel por padrão, e aqui a lista é
          um cabeçalho colado no conteúdo, como as abas do painel de fora. */}
      <Tabs defaultValue="pads" className="min-h-0 flex-1 gap-0">
        <TabsList
          variant="line"
          className="h-7 w-full shrink-0 justify-start gap-2 px-2"
        >
          <TabsTrigger value="pads" className="flex-none text-xs">
            Pads
          </TabsTrigger>
          <TabsTrigger value="atual" className="flex-none text-xs">
            Atual
          </TabsTrigger>
          <TabsTrigger value="acervo" className="flex-none text-xs">
            Acervo
          </TabsTrigger>
        </TabsList>

        {/* O scroll é de cada painel, e não da coluna: cada aba tem a altura
            inteira para si, e rolar o acervo não leva os pads junto. */}
        <TabsContent
          value="pads"
          className="min-h-0 overflow-y-auto border-t pt-2"
        >
          <p className="text-muted-foreground px-2 pb-1.5 text-[10px]">
            Teclado numérico
          </p>

          <div className="grid grid-cols-3 gap-1 px-2 pb-2">
            {GRADE.map((indice) => {
              const pad = pads[indice] ?? null;

              return (
                <PadCell
                  key={indice}
                  indice={indice}
                  pad={pad}
                  asset={porId.get(pad?.assetId ?? "")}
                  aceso={
                    pad
                      ? padAceso(
                          pad,
                          porId.get(pad.assetId)?.tipoDeSom,
                          track?.assetId,
                          acesos,
                        )
                      : false
                  }
                  assets={assets}
                  teclaDoSom={teclaDoSom}
                  onAcionar={() => acionarPad(indice)}
                  onDefinir={(novo) => definirPad(indice, novo)}
                />
              );
            })}
          </div>

          {/* Abaixo da grade, e com o mesmo papel: um som guardado à mão, para
              acionar de um gesto. O que muda é a tecla — aqui não há.

              Existe por duas razões que são a mesma: teclado de portátil não
              tem numpad, e nove é pouco. Quem joga num notebook não alcança pad
              nenhum pelo teclado, e quem tem vinte efeitos de combate não
              escolhe quais nove entram. */}
          <div className="mt-1 border-t px-2 pt-2 pb-2">
            <div className="flex items-center justify-between pb-1">
              <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                Macros
              </p>

              <SeletorDeSom
                assets={assets}
                gatilho={
                  <Button variant="ghost" size="icon-xs" aria-label="Nova macro">
                    <Plus />
                  </Button>
                }
                ondeEsta={(assetId) =>
                  macros.some((macro) => macro.assetId === assetId)
                    ? "já está na lista"
                    : undefined
                }
                onEscolher={(escolhido) => adicionarMacro(escolhido.id)}
              />
            </div>

            {macros.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                Nenhuma macro. Elas são os mesmos sons dos pads, sem tecla — para
                teclado sem numpad, ou para quando nove não bastam.
              </p>
            ) : (
              <ul className="space-y-1">
                {macros.map((macro) => {
                  const asset = porId.get(macro.assetId);
                  const tipo = asset?.tipoDeSom;
                  const nome = asset?.name ?? "Arquivo removido";

                  const Icone = tipo ? ICONE_DO_TIPO[tipo] : HelpCircle;
                  const cor = tipo ? CORES_DO_SOM[tipo] : null;

                  const noAr =
                    tipo === "trilha"
                      ? macro.assetId === track?.assetId
                      : tipo === "ambiente"
                        ? acesos.has(macro.assetId)
                        : false;

                  return (
                    <li key={macro.id} className="group flex items-center gap-1">
                      {/* A linha inteira é o botão: o alvo é a largura do
                          painel, e não um ícone de doze pixels. É a diferença
                          entre acertar de relance e mirar. */}
                      <button
                        type="button"
                        title={nome}
                        aria-label={
                          noAr ? `Tirar ${nome}` : `Acionar ${nome}`
                        }
                        disabled={!tipo}
                        className={cn(
                          "hover:bg-accent/50 flex min-w-0 flex-1 items-center gap-1.5 rounded-md border px-1.5 py-1 text-left text-xs disabled:opacity-50",
                          cor?.borda,
                          noAr && cor?.acesa,
                        )}
                        onClick={() => acionarMacro(macro.id)}
                      >
                        <Icone
                          className={cn("size-3 shrink-0", cor?.texto)}
                        />
                        <span className="min-w-0 flex-1 truncate">{nome}</span>
                      </button>

                      {/* Só no hover, como a cruzinha do pad: uma coluna de X
                          sempre à vista viraria a lista num formulário. */}
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Tirar ${nome} das macros`}
                        className="hidden shrink-0 group-hover:flex"
                        onClick={() => removerMacro(macro.id)}
                      >
                        <X />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent
          value="atual"
          className="min-h-0 overflow-y-auto border-t pt-2"
        >
          <SomAtual porId={porId} />
        </TabsContent>

        <TabsContent
          value="acervo"
          className="min-h-0 overflow-y-auto border-t pt-2"
        >
          {/* O tipo é escolhido ANTES do seletor de arquivos, e não depois.
              Depois seria um diálogo sobre a lista recém-importada, com uma
              linha por arquivo para classificar; aqui é o mesmo clique que já
              se dava, com o destino junto. Quem importa som costuma importar
              uma leva do mesmo tipo — cinco ambientes de floresta, oito
              efeitos de combate. */}
          <div className="px-2 pb-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    className="w-full"
                    variant="outline"
                    size="sm"
                    disabled={importando}
                  >
                    {importando ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Upload />
                    )}
                    {importando ? "Importando…" : "Importar sons"}
                  </Button>
                }
              />
              <DropdownMenuContent align="start" className="w-56">
                {TIPOS.map(({ tipo, rotulo, explicacao }) => {
                  const Icone = ICONE_DO_TIPO[tipo];

                  return (
                    <DropdownMenuItem
                      key={tipo}
                      onClick={() => void importar(tipo)}
                    >
                      <Icone className={CORES_DO_SOM[tipo].texto} />
                      <span>
                        {rotulo}
                        <span className="text-muted-foreground block text-[10px]">
                          {explicacao}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* A busca some com o acervo vazio: um campo para filtrar nada é um
              campo que só ocupa a altura da primeira linha da lista. */}
          {assets.length > 0 ? (
            <div className="relative px-2 pb-2">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-3 -translate-y-1/2" />
              <Input
                value={busca}
                placeholder="Buscar som ou tipo"
                className="h-7 pl-7 text-xs"
                onChange={(evento) => setBusca(evento.target.value)}
              />
            </div>
          ) : null}

          {assets.length === 0 ? (
            <p className="text-muted-foreground p-3 text-xs">
              Nenhum som encontrado.
            </p>
          ) : achados.length === 0 ? (
            <p className="text-muted-foreground p-3 text-xs">
              Nada com “{busca.trim()}”.
            </p>
          ) : (
            GRUPOS.map(({ tipo, titulo }) => {
              const doTipo = doGrupo(achados, tipo);

              if (doTipo.length === 0) return null;

              const Icone = tipo ? ICONE_DO_TIPO[tipo] : HelpCircle;

              return (
                <section key={titulo}>
                  {/* Um cabeçalho por tipo, com a cor da camada. A busca
                      primária do mestre é "onde estão os ambientes", e ela era
                      respondida lendo nome por nome numa lista por data. */}
                  <p className="text-muted-foreground flex items-center gap-1 px-2 pt-1 pb-1 text-[10px] font-medium tracking-wide uppercase">
                    <Icone
                      className={cn(
                        "size-3",
                        tipo ? CORES_DO_SOM[tipo].texto : undefined,
                      )}
                    />
                    {titulo}
                    <span className="normal-case">({doTipo.length})</span>
                  </p>

                  <ul className="space-y-1 px-2 pb-2">
                    {doTipo.map((asset) => (
                      <AudioRow
                        key={asset.id}
                        asset={asset}
                        noAr={
                          asset.id === track?.assetId || acesos.has(asset.id)
                        }
                        usageCount={countAssetUsage(scenes ?? [], asset.id, som)}
                        onTocar={() => acionarSom(asset)}
                        onTipo={(escolhido) =>
                          void definirTipoDeSom(asset.id, escolhido)
                        }
                        onRenomear={(nome) => void rename(asset.id, nome)}
                        onRemove={() => void remove(asset.id)}
                      />
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}



/**
 * Escolher qual som vai na tecla.
 *
 * `Popover` e não `DropdownMenu`, e a razão é o campo de busca: um menu do Base
 * UI faz typeahead — as letras digitadas saltam de item em item —, e um
 * `<input>` dentro dele disputaria cada tecla com essa navegação. O popover não
 * tem opinião sobre o teclado, então o campo funciona como campo.
 *
 * O preço é reimplementar a linha como botão, e ele é pequeno: a lista aqui não
 * tem submenu, nem atalho, nem item destrutivo — é uma escolha e pronto.
 *
 * Agrupada por tipo e buscável porque um acervo de sessão real tem dezenas de
 * sons: a lista corrida por data obrigava a rolar procurando o nome, que é
 * exatamente o que se faz com a mesa esperando.
 */
function SeletorDeSom({
  gatilho,
  assets,
  ondeEsta,
  onEscolher,
}: {
  /** O botão que abre a lista. Um pad vazio, ou "Nova macro". */
  gatilho: React.ReactElement;
  assets: AssetMeta[];
  /**
   * Onde este som já está, se já estiver em algum lugar desta lista.
   *
   * Quem chama decide o que conta como repetido: o pad não aceita um som que
   * está noutra tecla, a macro não aceita um que já está na lista — e as duas
   * coisas são independentes. O texto vai debaixo do nome e a linha fica
   * desligada.
   */
  ondeEsta?: (assetId: string) => string | undefined;
  onEscolher: (asset: AssetMeta) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");

  const achados = useMemo(() => filtrarSons(assets, busca), [assets, busca]);

  return (
    <Popover
      open={aberto}
      onOpenChange={(proximo) => {
        setAberto(proximo);
        // Zera ao fechar: reabrir o 7 com o filtro do 8 ainda posto esconderia
        // metade do acervo sem dizer por quê.
        if (!proximo) setBusca("");
      }}
    >
      <PopoverTrigger render={gatilho} />
      <PopoverContent side="bottom" align="start" className="w-64 p-0">
        {assets.length === 0 ? (
          <p className="text-muted-foreground p-3 text-xs">
            Nenhum som no acervo.
          </p>
        ) : (
          <>
            <div className="relative border-b p-2">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-3 -translate-y-1/2" />
              <Input
                autoFocus
                value={busca}
                placeholder="Buscar som ou tipo"
                className="h-7 pl-7 text-xs"
                onChange={(evento) => setBusca(evento.target.value)}
              />
            </div>

            {achados.length === 0 ? (
              <p className="text-muted-foreground p-3 text-xs">
                Nada com “{busca.trim()}”.
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto p-1">
                {GRUPOS.map(({ tipo, titulo }) => {
                  const doTipo = doGrupo(achados, tipo);
                  if (doTipo.length === 0) return null;

                  const Icone = tipo ? ICONE_DO_TIPO[tipo] : HelpCircle;

                  return (
                    <div key={titulo}>
                      {/* O mesmo cabeçalho do acervo, e de propósito: são a
                          mesma lista vista de dois lugares, e dois agrupamentos
                          diferentes fariam procurar duas vezes. */}
                      <p className="text-muted-foreground flex items-center gap-1 px-1.5 pt-1.5 pb-1 text-[10px] font-medium tracking-wide uppercase">
                        <Icone
                          className={cn(
                            "size-3",
                            tipo ? CORES_DO_SOM[tipo].texto : undefined,
                          )}
                        />
                        {titulo}
                      </p>

                      {doTipo.map((candidato) => {
                        const jaEm = ondeEsta?.(candidato.id);

                        return (
                          <button
                            key={candidato.id}
                            type="button"
                            // Dois motivos para a linha estar desligada, e cada
                            // um diz o seu embaixo do nome. SEM TIPO: a tecla
                            // não saberia o que fazer — ver
                            // `AssetMeta.tipoDeSom`. JÁ NUMA TECLA: um som, uma
                            // tecla — ver `definirPad`.
                            disabled={!candidato.tipoDeSom || jaEm !== undefined}
                            title={candidato.name}
                            className="hover:bg-accent focus-visible:bg-accent flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs outline-none disabled:opacity-50"
                            onClick={() => {
                              onEscolher(candidato);
                              setAberto(false);
                            }}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate">
                                {candidato.name}
                              </span>
                              {jaEm !== undefined ? (
                                <span className="text-muted-foreground block text-[10px]">
                                  {jaEm}
                                </span>
                              ) : !candidato.tipoDeSom ? (
                                <span className="text-muted-foreground block text-[10px]">
                                  sem tipo
                                </span>
                              ) : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Uma tecla do numpad.
 *
 * Vazia, ela é o menu que a preenche: clicar abre o acervo e a escolha já diz
 * se o som alterna ou dispara. Preenchida, ela É a tecla — clicar faz o mesmo
 * que apertar o número, que é o que permite montar a cena com o mouse e tocá-la
 * com a mão esquerda depois.
 */
function PadCell({
  indice,
  pad,
  asset,
  aceso,
  assets,
  teclaDoSom,
  onAcionar,
  onDefinir,
}: {
  indice: number;
  pad: Pad;
  asset: AssetMeta | undefined;
  /** Está soando agora. Ver `padAceso`. */
  aceso: boolean;
  assets: AssetMeta[];
  /** Em que tecla cada som já está, para o seletor não oferecer repetido. */
  teclaDoSom: Map<string, number>;
  onAcionar: () => void;
  onDefinir: (pad: Pad) => void;
}) {
  const tecla = indice + 1;

  if (!pad) {
    return (
      <SeletorDeSom
        assets={assets}
        gatilho={
          <button
            type="button"
            aria-label={`Escolher o som do pad ${tecla}`}
            className="text-muted-foreground/40 hover:bg-accent/50 hover:text-muted-foreground flex h-12 flex-col items-center justify-center rounded-md border border-dashed text-xs"
          >
            {tecla}
          </button>
        }
        ondeEsta={(assetId) => {
          const emQual = teclaDoSom.get(assetId);

          return emQual === undefined ? undefined : `já está no ${emQual}`;
        }}
        onEscolher={(escolhido) =>
          onDefinir({ assetId: escolhido.id, ganho: GANHO_PADRAO })
        }
      />
    );
  }

  const nome = asset?.name ?? "Arquivo removido";

  // Sem tipo — arquivo removido do acervo, ou som que ninguém classificou — a
  // tecla desenha neutra e não faz nada ao ser apertada. Ver `acionarPad`.
  const tipo = asset?.tipoDeSom;
  const cor = tipo ? CORES_DO_SOM[tipo] : null;
  const Icone = tipo ? ICONE_DO_TIPO[tipo] : HelpCircle;

  return (
    <div className="group relative">
      <button
        type="button"
        title={nome}
        aria-label={`Pad ${tecla}: ${nome}`}
        // A moldura diz o TIPO e o fundo diz o estado, e são duas perguntas
        // diferentes: "o 7 é um tiro ou uma chuva?" se responde de relance pela
        // cor, sem ler o nome do arquivo; "a chuva ainda está caindo?" pelo
        // fundo. Com a grade fechada, a tecla é o único lugar que responde a
        // segunda.
        className={cn(
          "hover:bg-accent/50 flex h-12 w-full flex-col items-start justify-between rounded-md border p-1 text-left",
          cor?.borda,
          aceso && cor?.acesa,
        )}
        onClick={onAcionar}
      >
        <span className="text-muted-foreground flex w-full items-center justify-between text-[10px]">
          {tecla}
          <Icone className={cn("size-3", cor?.texto)} />
        </span>
        <span className="w-full truncate text-[10px] leading-tight">
          {nome}
        </span>
      </button>

      {/* Só no hover: nove cruzinhas sempre à vista virariam a grade num
          formulário, e o pad existe para ser apertado, não editado. */}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Esvaziar o pad ${tecla}`}
        className="absolute -top-1 -right-1 hidden group-hover:flex"
        onClick={() => onDefinir(null)}
      >
        <X />
      </Button>
    </div>
  );
}

type AudioRowProps = {
  asset: AssetMeta;
  /** Está soando agora: é a trilha escolhida, ou um ambiente aceso. */
  noAr: boolean;
  usageCount: number;
  onTocar: () => void;
  onTipo: (tipo: TipoDeSom) => void;
  onRenomear: (nome: string) => void;
  onRemove: () => void;
};

/**
 * Um som do acervo.
 *
 * Um gesto e um menu, onde havia quatro botões. O que fazia a linha precisar de
 * quatro era o arquivo não declarar o que era: trilha, ambiente e disparo eram
 * três destinos possíveis para toda linha, e a lista pagava isso em cada uma
 * delas. Com o tipo no arquivo — ver `AssetMeta.tipoDeSom` — sobra o botão de
 * acionar, e o resto é manutenção que não se faz no meio de uma cena.
 */
function AudioRow({
  asset,
  noAr,
  usageCount,
  onTocar,
  onTipo,
  onRenomear,
  onRemove,
}: AudioRowProps) {
  const emUso = usageCount > 0;
  const tipo = asset.tipoDeSom;

  const [renomeando, setRenomeando] = useState(false);

  // O campo só nasce depois de o menu terminar de fechar: a troca desmonta o
  // menu, e o foco devolvido a um gatilho que já saiu do ar matava o campo no
  // mesmo quadro. Ver `useRenomearPeloMenu`.
  const renomear = useRenomearPeloMenu(() => setRenomeando(true));

  function confirmar(bruto: string) {
    const nome = bruto.trim();
    if (nome) onRenomear(nome);

    setRenomeando(false);
  }

  if (renomeando) {
    return (
      <li className="rounded-md p-1">
        <Input
          autoFocus
          defaultValue={asset.name}
          className="h-7 text-xs"
          onBlur={(event) => confirmar(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") confirmar(event.currentTarget.value);
            if (event.key === "Escape") setRenomeando(false);
          }}
        />
      </li>
    );
  }

  return (
    <li className="hover:bg-accent/50 flex items-center gap-1 rounded-md p-1">
      <span className="min-w-0 flex-1">
        {/* Duplo clique e F2 renomeiam, a mesma convenção da lista de cenas e
            da pasta do acervo. O item do menu existe para quem não conhece
            nenhuma das duas. */}
        <button
          type="button"
          className="block w-full truncate text-left text-xs"
          title={asset.name}
          onDoubleClick={() => setRenomeando(true)}
          onKeyDown={aoApertarF2(() => setRenomeando(true))}
        >
          {asset.name}
        </button>
        <span className="text-muted-foreground block text-[10px]">
          {Math.round(asset.size / 1024)} KB
          {noAr ? " · no ar" : ""}
        </span>
      </span>

      {/* Sem tipo, sem botão: um play que não sabe o que fazer é pior que um
          play ausente, e o menu ao lado é onde o tipo se escolhe. */}
      {tipo ? (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={
            noAr ? `Tirar ${asset.name}` : `Tocar ${asset.name}`
          }
          title={noAr ? "Tirar" : "Tocar"}
          className={CORES_DO_SOM[tipo].texto}
          onClick={onTocar}
        >
          {/* O quadrado só existe para quem ALTERNA. Um efeito não fica no ar:
              ele soa e some, e o botão dele é sempre o mesmo. */}
          {noAr ? <Square /> : <Play />}
        </Button>
      ) : null}

      <DropdownMenu onOpenChangeComplete={renomear.aoFechar}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Opções de ${asset.name}`}
            >
              <MoreVertical />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-52">
          {/* Trocar o tipo é o item de cima porque é o que conserta os dois
              casos em que a linha não funciona: o som sem tipo, e o que foi
              importado na leva errada. */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              {tipo ? "Tipo do som" : "Definir o tipo"}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {TIPOS.map(({ tipo: candidato, rotulo }) => {
                const Icone = ICONE_DO_TIPO[candidato];

                return (
                  <DropdownMenuItem
                    key={candidato}
                    disabled={candidato === tipo}
                    onClick={() => onTipo(candidato)}
                  >
                    <Icone className={CORES_DO_SOM[candidato].texto} />
                    {rotulo}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* O nome que o arquivo tem no disco quase nunca é o nome que a cena
              pede: `741209__softcustomer__gun-shot.wav` é o que o banco de sons
              entrega, e "Tiro" é o que o mestre procura no meio da sessão. Só
              metadado — o arquivo não é movido nem recopiado. */}
          <DropdownMenuItem onClick={renomear.pedir}>
            <Pencil />
            Renomear
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Apagar um arquivo em uso deixaria a cena, a trilha ou um pad
              apontando para um id que não existe mais. Desligado com a conta no
              rótulo: "Remover" apagado e sem explicação faria o mestre procurar
              o defeito no botão. */}
          <DropdownMenuItem
            variant="destructive"
            disabled={emUso}
            onClick={onRemove}
          >
            <Trash2 />
            {emUso ? `Em uso em ${usageCount} lugar(es)` : "Remover"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
