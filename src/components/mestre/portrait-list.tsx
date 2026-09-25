"use client";

import { useState, type DragEvent } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  FlipHorizontal,
  Group,
  Palette,
  RotateCcw,
  Trash2,
  Radio,
  Ungroup,
  UserSquare,
} from "lucide-react";

import { PainelVazio } from "@/components/mestre/painel-vazio";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAssetList } from "@/hooks/use-asset-list";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { useCharacters } from "@/hooks/use-characters";
import { FOLGA_MAX, FOLGA_MIN, FOLGA_PADRAO } from "@/lib/geometry/portrait";
import { MINIATURA } from "@/lib/miniatura";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { CORES_LAPIS } from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";
import type { Personagem } from "@/types/character";
import type { AncoraRetrato, Portrait, UniaoDeRetratos } from "@/types/scene";
import { useCampoDeNome } from "@/hooks/use-campo-de-nome";
import { LayoutDoRetratoPainel } from "@/components/mestre/layout-do-retrato";
import { PosicaoDosRetratos } from "@/components/mestre/posicao-dos-retratos";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

/** O nome da área, para o cabeçalho de cada união. */
const LUGAR: Record<AncoraRetrato, string> = {
  "cima-esquerda": "cima, à esquerda",
  "cima-centro": "cima, ao centro",
  "cima-direita": "cima, à direita",
  "baixo-esquerda": "baixo, à esquerda",
  "baixo-centro": "baixo, ao centro",
  "baixo-direita": "baixo, à direita",
};

/** As seis, na ordem em que aparecem no seletor: duas linhas de três. */
const AREAS: AncoraRetrato[] = [
  "cima-esquerda",
  "cima-centro",
  "cima-direita",
  "baixo-esquerda",
  "baixo-centro",
  "baixo-direita",
];

/** O que o arrasto de uma linha faz quando solto. `uniaoId` nulo = soltar. */
type Queda = { uniaoId: string | null; indice: number };

/**
 * Quem está na cena, como eles estão agrupados, e quem deles está no ar.
 *
 * A lista deriva dos TOKENS da cena em edição, e não de uma coleção própria:
 * antes o mestre criava retrato à mão a partir de qualquer imagem do acervo, e
 * o resultado era uma segunda lista de gente que não tinha relação nenhuma com
 * os personagens da campanha. A mesma pessoa existia duas vezes — como ficha e
 * como recorte — e nada ligava as duas.
 *
 * Agora é uma pergunta só: quem está no mapa desta cena pode aparecer na tela
 * da mesa. Pôr o token é o que traz a linha; a linha é o interruptor.
 *
 * ## As uniões, e por que elas substituíram a fila automática
 *
 * A fila era um interruptor global mais um ícone por linha dizendo se aquele
 * estava dentro ou fora dela. Dois estados invisíveis na mesma tela: qual é a
 * fila, e quem pertence a ela. Ninguém lia isso num ícone.
 *
 * A união é o mesmo poder dito por uma BORDA: os que estão dentro da moldura
 * colorida se enfileiram juntos, na ordem em que aparecem, na área escrita no
 * cabeçalho dela. Quem está abaixo, sem moldura, está solto — e solto não tem
 * regra nenhuma, fica onde foi largado no palco.
 *
 * A cena EM EDIÇÃO, e não a que está no ar: é aqui que o mestre monta a
 * próxima. O que a mesa vê é filtrado pela cena no ar, em `MestreShell` —
 * armar um retrato numa cena que ainda não subiu não vaza nada.
 */
export function PortraitList() {
  const scene = useSceneStore(selectEditingScene);
  const { personagens } = useCharacters();
  const guardados = usePortraitStore((state) => state.portraits);
  const unioes = usePortraitStore((state) => state.unioes);
  const unir = usePortraitStore((state) => state.unir);
  const mover = usePortraitStore((state) => state.mover);
  const soltar = usePortraitStore((state) => state.soltar);

  const selecionados = useSelectionStore((state) => state.selectedPortraitIds);

  /**
   * Onde a linha arrastada cairia, se fosse solta agora.
   *
   * Estado local e não do store: é a linha pontilhada da prévia, e ela morre
   * junto com o gesto. Gravá-la faria cada `dragover` -- um punhado por segundo
   * -- passar pela gravação atrasada do disco.
   */
  const [queda, setQueda] = useState<Queda | null>(null);

  /**
   * Qual linha tem o menu de contexto aberto. Uma por vez.
   *
   * Cada linha tem um menu próprio, e um menu por linha aberto por conta
   * própria deixava DOIS na tela: o botão direito na segunda linha abre a dela
   * sem que a primeira ouça nada -- para ela, o clique aconteceu fora, e o
   * `contextmenu` de fora não é o `pointerdown` que a fecharia.
   *
   * Com o estado aqui em cima, abrir um é fechar o outro pela própria
   * definição: a comparação só pode ser verdadeira para uma linha.
   */
  const [menuAberto, setMenuAberto] = useState<string | null>(null);

  /**
   * Um personagem por token, na ordem em que entraram na cena.
   *
   * É a ordem dos SOLTOS. Dentro de uma união vale a ordem dela, que o mestre
   * arrasta — ver `BlocoDaUniao`.
   */
  const elenco: Personagem[] = [];
  const vistos = new Set<string>();

  for (const item of scene?.items ?? []) {
    if (!item.personagemId || vistos.has(item.personagemId)) continue;

    vistos.add(item.personagemId);

    const personagem = personagens?.find(
      (atual) => atual.id === item.personagemId,
    );
    // Token de personagem apagado: some da lista em vez de virar linha sem
    // nome. O botão da ficha no palco desaparece pela mesma razão.
    if (personagem) elenco.push(personagem);
  }

  const porId = new Map(elenco.map((personagem) => [personagem.id, personagem]));
  const emUniao = new Set(unioes.flatMap((uniao) => uniao.retratos));
  const soltos = elenco.filter((personagem) => !emUniao.has(personagem.id));

  /** O registro guardado de um personagem, ou `null` se ele nunca foi armado. */
  const retratoDe = (personagemId: string): Portrait | null =>
    guardados.find((atual) => atual.personagemId === personagemId) ?? null;

  function largar(retratoId: string) {
    if (!queda) return;

    if (queda.uniaoId) mover(retratoId, queda.uniaoId, queda.indice);
    else soltar(retratoId);

    setQueda(null);
  }

  const comum = {
    queda,
    setQueda,
    largar,
    retratoDe,
    unioes,
    selecionados,
    menuAberto,
    setMenuAberto,
  };

  /**
   * O retrato que a aba Layout edita.
   *
   * Um só. Com vários escolhidos a aba volta para a sessão, e é a leitura
   * honesta do que está na tela: "estes três" não é um retrato, e aplicar a
   * troca aos três seria um gesto que o mestre não pediu -- ele escolheu vários
   * para UNIR, que é o que o botão ao lado faz.
   */
  const paraLayout =
    selecionados.length === 1 ? retratoDe(selecionados[0] ?? "") : null;

  return (
    <Tabs defaultValue="elenco" className="flex min-h-0 flex-1 flex-col gap-0">
      <TabsList
        variant="line"
        className="h-auto w-full justify-start rounded-none border-b px-2 py-1"
      >
        <TabsTrigger value="elenco" className="flex-none text-xs">
          Elenco
        </TabsTrigger>
        <TabsTrigger value="layout" className="flex-none text-xs">
          Layout
        </TabsTrigger>
        <TabsTrigger value="posicao" className="flex-none text-xs">
          Posição
        </TabsTrigger>
      </TabsList>

      {/* `overflow-x-hidden` junto com o `y`, e não por zelo: o CSS promove um
          eixo `visible` a `auto` quando o outro deixa de ser visível, então
          `overflow-y-auto` sozinho já liga a barra horizontal -- e qualquer
          peça da prévia passando um pixel da borda a fazia aparecer. */}
      <TabsContent
        value="layout"
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-2"
      >
        <LayoutDoRetratoPainel selecionado={paraLayout} />
      </TabsContent>

      <TabsContent
        value="posicao"
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-2"
      >
        <PosicaoDosRetratos />
      </TabsContent>

      <TabsContent
        value="elenco"
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
      {/* Unir fica FORA da rolagem, e é um botão com a palavra escrita.
          O gesto tinha de ser descobrível: o botão direito e o Shift+clique
          fazem o mesmo, mas quem nunca uniu nada não adivinha nenhum dos dois
          a partir de um ícone. */}
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        <Button
          variant="secondary"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          disabled={selecionados.length === 0}
          onClick={() => unir(selecionados)}
        >
          <Group className="size-3.5" />
          Unir
        </Button>

        <span className="text-muted-foreground flex min-w-0 flex-1 items-center gap-1 truncate text-[10px]">
          {selecionados.length > 0 ? (
            `${selecionados.length} escolhido${selecionados.length > 1 ? "s" : ""}`
          ) : (
            <>
              <Kbd>Shift</Kbd> + clique escolhe vários
            </>
          )}
        </span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {elenco.length === 0 ? (
          <PainelVazio conteudo={{ tipo: "retratos" }}>
            Nenhum retrato encontrado
          </PainelVazio>
        ) : (
          <div className="space-y-2 p-2">
            {unioes.map((uniao) => (
              <BlocoDaUniao
                key={uniao.id}
                uniao={uniao}
                membros={uniao.retratos
                  .map((id) => porId.get(id))
                  .filter((personagem) => personagem !== undefined)}
                {...comum}
              />
            ))}

            {/* Os soltos, sem moldura -- a ausência de borda É o estado.
                A área recebe o arrasto mesmo vazia: tirar o último de uma união
                arrastando-o para cá tem de ter onde cair. */}
            <div
              className={cn(
                "min-h-10 rounded-md border border-dashed border-transparent p-1 transition-colors",
                queda?.uniaoId === null && "border-muted-foreground/40 bg-accent/40",
              )}
              onDragOver={(event) => {
                event.preventDefault();
                setQueda({ uniaoId: null, indice: 0 });
              }}
              onDrop={(event) => {
                event.preventDefault();
                largar(event.dataTransfer.getData("text/plain"));
              }}
            >
              {unioes.length > 0 ? (
                <p className="text-muted-foreground px-1 pb-1 text-[10px]">
                  {soltos.length > 0
                    ? "Soltos: cada um onde você largou"
                    : "Arraste para cá para soltar de uma união"}
                </p>
              ) : null}

              <ul className="space-y-1">
                {soltos.map((personagem) => (
                  <PortraitRow
                    key={personagem.id}
                    personagem={personagem}
                    retrato={retratoDe(personagem.id)}
                    uniao={null}
                    indice={0}
                    total={0}
                    {...comum}
                  />
                ))}
              </ul>
            </div>
          </div>
        )}
      </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}

/**
 * Uma união: a moldura colorida, o cabeçalho com o nome e os membros dentro.
 *
 * A borda é o que faz o grupo existir aos olhos, e é por isso que ela é grossa
 * e colorida em vez de um traço fino: a pergunta que o painel tem de responder
 * de relance é "quem anda com quem", e não "quem está ligado".
 */
function BlocoDaUniao({
  uniao,
  membros,
  ...comum
}: ComumDaLista & {
  uniao: UniaoDeRetratos;
  membros: Personagem[];
}) {
  const ajustar = usePortraitStore((state) => state.ajustar);

  /**
   * O nome sendo digitado, antes de virar o nome da união.
   *
   * `null` é "ninguém está digitando", e aí o campo mostra o que está guardado.
   * Antes daqui cada tecla gravava: o nome ia para o store e para o disco letra
   * a letra, e apagar "Jogadores" para escrever outra coisa passava por oito
   * uniões chamadas "Jogadore", "Jogador", "Jogado". O nome só vira o nome
   * quando o gesto termina — mesma ideia do arrasto, que só grava no soltar.
   */
  const nomeDaUniao = useCampoDeNome({
    nome: uniao.nome,
    aoGravar: (nome) => ajustar(uniao.id, { nome }),
  });

  /** Membros que não têm token NESTA cena. A união é da sessão, a cena não. */
  const foraDaCena = uniao.retratos.length - membros.length;

  return (
    <div
      className="rounded-md border-2 p-1"
      style={{ borderColor: uniao.cor }}
      // Soltar no corpo do bloco, e não numa linha, põe no fim: é o gesto de
      // quem mira a moldura inteira em vez de uma posição dentro dela.
      onDragOver={(event) => {
        event.preventDefault();
        comum.setQueda({ uniaoId: uniao.id, indice: membros.length });
      }}
      onDrop={(event) => {
        event.preventDefault();
        comum.largar(event.dataTransfer.getData("text/plain"));
      }}
    >
      <header className="flex items-center gap-1 pb-1 pl-1">
        {/* O nome é um input sem cara de input: ele É o título até alguém
            clicar nele. Campo de formulário desenhado dentro de cada moldura
            encheria o painel de caixas. */}
        <input
          {...nomeDaUniao}
          aria-label="Nome da união"
          className="min-w-0 flex-1 truncate bg-transparent text-xs font-medium outline-none"
        />

        <span className="text-muted-foreground shrink-0 text-[10px]">
          {LUGAR[uniao.ancora]}
        </span>

        <MenuDaUniao uniao={uniao} />
      </header>

      {membros.length === 0 ? (
        <p className="text-muted-foreground px-1 pb-1 text-[10px] leading-snug">
          Ninguém desta união está nesta cena. Ela continua guardada, e volta
          a valer na cena em que eles tiverem token.
        </p>
      ) : (
        <ul className="space-y-1">
          {membros.map((personagem, indice) => (
            <PortraitRow
              key={personagem.id}
              personagem={personagem}
              retrato={comum.retratoDe(personagem.id)}
              uniao={uniao}
              indice={indice}
              total={membros.length}
              {...comum}
            />
          ))}
        </ul>
      )}

      {foraDaCena > 0 ? (
        <p className="text-muted-foreground px-1 pt-1 text-[10px]">
          {foraDaCena === 1
            ? "e mais um, fora desta cena"
            : `e mais ${foraDaCena}, fora desta cena`}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Área, espaçamento, cor e desfazer — o que era global e agora é de cada união.
 *
 * Atrás de um botão pelo mesmo motivo do ajuste da fila antiga: escolher a área
 * é gesto de uma vez por mesa, e quatro controles à mostra em cada moldura
 * fariam o painel virar formulário.
 */
function MenuDaUniao({ uniao }: { uniao: UniaoDeRetratos }) {
  const ajustar = usePortraitStore((state) => state.ajustar);
  const desunir = usePortraitStore((state) => state.desunir);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Ajustar a união ${uniao.nome}`}
            className="text-muted-foreground shrink-0"
          >
            <Palette />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-64 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-normal">Onde esta união encosta</Label>
          {/* Duas linhas de três, que é o desenho das seis áreas na tela: o
              botão de cima à esquerda é o canto de cima à esquerda. Uma lista
              obrigaria a ler seis nomes para achar um canto. */}
          <div className="grid grid-cols-3 gap-1">
            {AREAS.map((area) => (
              <Button
                key={area}
                variant={uniao.ancora === area ? "secondary" : "outline"}
                size="sm"
                aria-label={`Encostar em ${LUGAR[area]}`}
                aria-pressed={uniao.ancora === area}
                className="h-7 text-[10px]"
                onClick={() => ajustar(uniao.id, { ancora: area })}
              >
                {area.startsWith("cima") ? "▲" : "▼"}
                {area.endsWith("esquerda") ? "◀" : area.endsWith("direita") ? "▶" : "●"}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label className="text-xs font-normal">Entre um e o vizinho</Label>
            <span className="text-muted-foreground text-[10px] tabular-nums">
              {emPorcento(uniao.folga)}
            </span>
          </div>
          {/* Em décimos de por cento porque o slider anda em inteiros, e a
              folga é uma fração pequena da câmera: passar 0.015 direto daria um
              controle de dois passos. */}
          <Slider
            aria-label="Espaçamento entre os retratos desta união"
            value={[Math.round(uniao.folga * 1000)]}
            min={Math.round(FOLGA_MIN * 1000)}
            max={Math.round(FOLGA_MAX * 1000)}
            step={5}
            onValueChange={(valor) =>
              ajustar(uniao.id, { folga: primeiro(valor) / 1000 })
            }
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-[10px] leading-snug">
              Negativo sobrepõe de propósito — é o que dá o elenco ombro a
              ombro.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-6 shrink-0 px-2 text-[10px]"
              onClick={() => ajustar(uniao.id, { folga: FOLGA_PADRAO })}
            >
              <RotateCcw className="size-3" />
              Padrão
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-normal">Cor da moldura</Label>
          <div className="flex gap-1">
            {CORES_LAPIS.map((cor) => (
              <button
                key={cor}
                type="button"
                aria-label={`Cor ${cor}`}
                aria-pressed={uniao.cor === cor}
                className={cn(
                  "size-6 rounded-full border-2",
                  uniao.cor === cor ? "border-foreground" : "border-transparent",
                )}
                style={{ backgroundColor: cor }}
                onClick={() => ajustar(uniao.id, { cor })}
              />
            ))}
          </div>
        </div>

        {/* Desfazer não apaga ninguém: os membros viram soltos onde estão. Por
            isso não é lixeira nem pede confirmação. */}
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-full text-xs"
          onClick={() => desunir(uniao.id)}
        >
          <Ungroup className="size-3.5" />
          Desfazer união
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** O que toda linha e todo bloco precisam saber da lista que os contém. */
type ComumDaLista = {
  queda: Queda | null;
  setQueda: (queda: Queda | null) => void;
  largar: (retratoId: string) => void;
  retratoDe: (personagemId: string) => Portrait | null;
  unioes: UniaoDeRetratos[];
  selecionados: string[];
  /** A linha cujo menu de contexto está aberto. Ver `PortraitList`. */
  menuAberto: string | null;
  setMenuAberto: (personagemId: string | null) => void;
};

/**
 * A linha de um personagem em cena.
 *
 * `retrato` é `null` quando ele nunca foi armado. A linha existe de qualquer
 * jeito — ela é a lista do elenco, não a dos retratos guardados —, e é o botão
 * do olho que cria o registro na primeira vez. Sem registro não há o que unir
 * nem o que arrastar: a linha não é arrastável até haver geometria.
 */
function PortraitRow({
  personagem,
  retrato,
  uniao,
  indice,
  total,
  queda,
  setQueda,
  largar,
  unioes,
  selecionados,
  menuAberto,
  setMenuAberto,
}: ComumDaLista & {
  personagem: Personagem;
  retrato: Portrait | null;
  /** A união a que esta linha pertence, ou `null` se ela está solta. */
  uniao: UniaoDeRetratos | null;
  indice: number;
  total: number;
}) {
  const url = useAssetUrl(personagem.retrato, "mini");
  const update = usePortraitStore((state) => state.update);
  const armar = usePortraitStore((state) => state.armar);
  const desarmar = usePortraitStore((state) => state.desarmar);
  const remove = usePortraitStore((state) => state.remove);
  const unir = usePortraitStore((state) => state.unir);
  const juntar = usePortraitStore((state) => state.juntar);
  const desunir = usePortraitStore((state) => state.desunir);
  const soltar = usePortraitStore((state) => state.soltar);
  const mover = usePortraitStore((state) => state.mover);

  const selectPortrait = useSelectionStore((state) => state.selectPortrait);
  const togglePortrait = useSelectionStore((state) => state.togglePortrait);

  // O tamanho natural decide a proporção com que o retrato nasce. Uma leitura
  // do acervo para a lista inteira seria melhor, mas a linha é uma por
  // personagem em cena -- meia dúzia, não uma por arquivo do acervo.
  const { assets } = useAssetList("image");
  const asset = assets.find((atual) => atual.id === personagem.retrato);

  const noAr = Boolean(retrato?.visible);
  const selected = retrato ? selecionados.includes(retrato.id) : false;

  /**
   * Em quem o menu de contexto mexe: nunca em quem não foi clicado.
   *
   * Clicar com o botão direito numa linha de fora da seleção e ver "unir os 2
   * escolhidos" agir sobre dois OUTROS retratos era o defeito. O botão direito
   * agora escolhe a linha antes de abrir -- como em qualquer gerenciador de
   * arquivos --, então aqui a seleção já contém a linha clicada, e o caso de
   * `selected` falso só existe no quadro em que o estado ainda não chegou.
   */
  const alvos = selected ? selecionados : retrato ? [retrato.id] : [];

  /** Escolher pela linha inteira, e não só pela miniatura de 40 pixels. */
  function escolher(event: { shiftKey: boolean }) {
    if (!retrato) return;

    if (event.shiftKey) togglePortrait(retrato.id);
    else selectPortrait(retrato.id);
  }

  // Sem NENHUM dos dois retratos não há o que pôr na tela. A linha fica, porque
  // o personagem ESTÁ na cena: é a pista de que falta preencher o campo.
  //
  // Os dois, e não só o do acervo: quem tem apenas o Retrato ao vivo tem o que
  // mostrar, e barrá-lo aqui deixaria a URL gravada na ficha sem caminho
  // nenhum para chegar ao ar.
  if (!personagem.retrato && !personagem.retratoUrl) {
    return (
      <li className="flex items-center gap-2 rounded-md p-1">
        <span className="bg-muted grid size-10 shrink-0 place-items-center rounded">
          <UserSquare className="text-muted-foreground size-4" aria-hidden />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs">{personagem.nome}</span>
          <span className="text-muted-foreground block truncate text-[10px]">
            Sem retrato na ficha
          </span>
        </span>
      </li>
    );
  }

  /** A linha pontilhada da prévia cai em cima desta, ou embaixo da última. */
  const naMesmaUniao = queda?.uniaoId === (uniao?.id ?? null);
  const marcarAntes = Boolean(uniao) && naMesmaUniao && queda?.indice === indice;
  const marcarDepois =
    Boolean(uniao) &&
    naMesmaUniao &&
    indice === total - 1 &&
    queda?.indice === total;

  return (
    <ContextMenu
      open={menuAberto === personagem.id}
      onOpenChange={(aberto) =>
        setMenuAberto(aberto ? personagem.id : null)
      }
    >
      <ContextMenuTrigger
        render={
          <li
            className={cn(
              "flex items-center gap-1 rounded-md border-y-2 border-transparent p-1",
              selected ? "bg-accent" : "hover:bg-accent/50",
              marcarAntes && "border-t-primary",
              marcarDepois && "border-b-primary",
            )}
            draggable={Boolean(retrato)}
            // A linha inteira escolhe, e não só a miniatura: o alvo de 40
            // pixels era o que fazia o Shift+clique parecer não existir na
            // barra lateral. Os botões da direita param o evento antes de
            // chegar aqui -- pôr no ar não é escolher.
            onClick={escolher}
            // O botão direito numa linha de fora da seleção passa a escolhê-la
            // antes de abrir: é o que casa o que o menu diz com o que ele faz.
            onContextMenu={() => {
              if (retrato && !selected) selectPortrait(retrato.id);
            }}
            onDragStart={(event: DragEvent) => {
              if (!retrato) return;
              event.dataTransfer.setData("text/plain", retrato.id);
              event.dataTransfer.effectAllowed = "move";
            }}
            // Largar fora de qualquer alvo não emite `drop`, e sem isto a
            // linha de queda ficava acesa depois de um arrasto desistido.
            onDragEnd={() => setQueda(null)}
            // Para no bubble: o bloco da união também escuta, e ele significa
            // "no fim". Deixar subir faria toda queda cair no fim da lista.
            onDragOver={(event: DragEvent) => {
              event.preventDefault();
              event.stopPropagation();

              if (!uniao) {
                setQueda({ uniaoId: null, indice: 0 });
                return;
              }

              const caixa = event.currentTarget.getBoundingClientRect();
              const metade = caixa.top + caixa.height / 2;

              setQueda({
                uniaoId: uniao.id,
                indice: event.clientY > metade ? indice + 1 : indice,
              });
            }}
            onDrop={(event: DragEvent) => {
              event.preventDefault();
              event.stopPropagation();
              largar(event.dataTransfer.getData("text/plain"));
            }}
          >
            {/* A miniatura seleciona: é o caminho para as alças aparecerem no
                palco quando o retrato está atrás de outro, ou fora do
                enquadramento atual. Fora do ar não há o que selecionar, então
                ela vira só a imagem. */}
            <button
              type="button"
              aria-label={`Selecionar retrato de ${personagem.nome}`}
              aria-pressed={selected}
              disabled={!retrato}
              className="bg-muted size-10 shrink-0 overflow-hidden rounded"
              // Continua sendo o controle acessível da escolha -- é ele que
              // tem `aria-pressed` e recebe o foco do teclado. O clique de
              // ponteiro é tratado pela linha, então aqui ele só não pode
              // subir e contar duas vezes.
              onClick={(event) => {
                event.stopPropagation();
                escolher(event);
              }}
            >
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt=""
                  className="size-full object-cover"
                  draggable={false}
                  {...MINIATURA}
                />
              ) : (
                // Sem imagem no acervo — o caso de quem só tem página viva. O
                // ícone diz que a linha é de retrato, e não desenhar a página
                // aqui é de propósito: seria um quadro de 1920px por linha da
                // lista, para um polegar de 40 pixels.
                <Radio className="text-muted-foreground m-auto size-4" aria-hidden />
              )}
            </button>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs">{personagem.nome}</span>
              <span className="text-muted-foreground block truncate text-[10px]">
                {noAr ? "no ar" : retrato ? "só você vê" : "fora da tela"}
              </span>
            </span>

            <Toggle
              active={noAr}
              label={
                noAr
                  ? `Tirar ${personagem.nome} do ar`
                  : `Pôr ${personagem.nome} no ar`
              }
              hint={
                noAr
                  ? "A mesa está vendo este retrato."
                  : retrato
                    ? "Fora do ar: aparece apagado só no teu palco, onde você o deixou."
                    : "Entra no canto de baixo, solto, e você arrasta daí."
              }
              onClick={() => {
                if (noAr) desarmar(personagem.id);
                // Vazio quando só há página viva: o registro guarda GEOMETRIA,
                // e o `assetId` dele é sobrescrito por `retratosDaCena` a cada
                // leitura.
                else
                  armar(
                    personagem.id,
                    personagem.retrato ?? "",
                    asset?.naturalWidth,
                    asset?.naturalHeight,
                  );
              }}
            >
              {noAr ? <Eye /> : <EyeOff />}
            </Toggle>

            {/* Espelhar e esquecer só existem depois de haver geometria: são
                ajustes de uma figura que já está posta. */}
            {retrato ? (
              <>
                <Toggle
                  active={Boolean(retrato.flipX)}
                  label="Espelhar"
                  hint="Vira o retrato para o lado da tela em que ele está."
                  onClick={() => update(retrato.id, { flipX: !retrato.flipX })}
                >
                  <FlipHorizontal />
                </Toggle>

                {/* Lixeira porque destrói: esquece onde a figura estava e de
                    que tamanho. O personagem continua na cena e na lista -- o
                    que se apaga é a arrumação, não o elenco. */}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Esquecer a posição do retrato de ${personagem.nome}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    remove(retrato.id);
                  }}
                >
                  <Trash2 />
                </Button>
              </>
            ) : null}
          </li>
        }
      />

      {/* O menu de contexto é o caminho de quem já sabe, e o único que oferece
          "juntar a uma união que já existe" -- gesto que nem o botão Unir nem o
          arrasto fazem em um movimento. Sem retrato não há nada a unir. */}
      {retrato ? (
        <ContextMenuContent className="w-56">
          <ContextMenuItem onClick={() => unir(alvos)}>
            <Group />
            {alvos.length > 1
              ? `Unir os ${alvos.length} escolhidos`
              : `Unir ${personagem.nome} num grupo`}
          </ContextMenuItem>

          {unioes.length > 0 ? (
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Group />
                Juntar a
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {unioes.map((alvo) => (
                  <ContextMenuItem
                    key={alvo.id}
                    disabled={alvo.id === uniao?.id}
                    onClick={() => juntar(alvo.id, alvos)}
                  >
                    <span
                      aria-hidden
                      className="size-3 rounded-full"
                      style={{ backgroundColor: alvo.cor }}
                    />
                    {alvo.nome}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          ) : null}

          {uniao ? (
            <>
              <ContextMenuSeparator />

              {/* Mover sem mouse: o arrasto é o gesto natural, mas ele não
                  existe para quem navega pelo teclado, e a ordem da fila é
                  justamente o que a união trouxe de novo. */}
              <ContextMenuItem
                disabled={indice === 0}
                onClick={() => mover(retrato.id, uniao.id, indice - 1)}
              >
                <ChevronLeft />
                Mover para a esquerda
              </ContextMenuItem>
              <ContextMenuItem
                disabled={indice >= total - 1}
                onClick={() => mover(retrato.id, uniao.id, indice + 2)}
              >
                <ChevronRight />
                Mover para a direita
              </ContextMenuItem>

              <ContextMenuSeparator />

              <ContextMenuItem onClick={() => soltar(retrato.id)}>
                <Ungroup />
                Tirar da união
              </ContextMenuItem>
              <ContextMenuItem onClick={() => desunir(uniao.id)}>
                <Ungroup />
                Desfazer {uniao.nome}
              </ContextMenuItem>
            </>
          ) : null}
        </ContextMenuContent>
      ) : null}
    </ContextMenu>
  );
}

/**
 * O espaçamento como ele aparece no painel.
 *
 * Por cento com uma casa, e o sinal explícito no positivo: o controle vai dos
 * dois lados do zero, e "1,5%" sem sinal não diz de que lado está.
 */
function emPorcento(folga: number): string {
  const valor = (folga * 100).toFixed(1).replace(".", ",");

  return folga > 0 ? `+${valor}%` : valor.replace("-0,0", "0,0") + "%";
}

function primeiro(valor: number | readonly number[]): number {
  return Array.isArray(valor) ? (valor[0] ?? 0) : (valor as number);
}

/** Botão de estado: o ícone diz o que é, e o fundo diz se está ligado. */
function Toggle({
  active,
  label,
  hint,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  hint: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={active ? "secondary" : "ghost"}
            size="icon-xs"
            aria-label={label}
            aria-pressed={active}
            // A linha inteira escolhe o retrato, e estes botões moram dentro
            // dela: sem parar aqui, pôr alguém no ar o escolheria junto.
            onClick={(event) => {
              event.stopPropagation();
              onClick();
            }}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>
        <p className="max-w-48">{hint}</p>
      </TooltipContent>
    </Tooltip>
  );
}
