"use client";

import { useEffect, useRef } from "react";
import { Plus } from "lucide-react";

import { useDockDrag } from "@/components/operator/dock/dock-drag";
import {
  JanelaCorpo,
  larguraMinima,
  useRotuloJanela,
} from "@/components/operator/dock/window-content";
import { PanelCollapse } from "@/components/operator/panel-collapse";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { useLayoutStore, type Grupo, type Lado } from "@/lib/store/use-layout-store";
import { chaveDe, useWindowStore, type ConteudoJanela } from "@/lib/store/use-window-store";
import { cn } from "@/lib/utils";

/**
 * Uma região da coluna: a tira de abas e o corpo da aba ativa.
 *
 * Substitui o `Tabs` do shadcn que os dois painéis usavam. Não é o mesmo
 * componente com outra roupa: ali as abas eram fixas na marcação, e aqui a
 * lista de abas é dado — vem do layout, e vai mudar quando o mestre atracar uma
 * janela no meio deste grupo. Um `TabsTrigger` por item de um array daria a
 * marcação, mas não o `data-dock-grupo` que o arrasto da Etapa 2 vai medir nem
 * a alça de tirar a aba de volta para flutuante.
 *
 * `data-dock-grupo` e `data-dock-lado` existem para isso: na hora de atracar, a
 * camada mede os retângulos dos grupos por consulta ao DOM. Um registro de refs
 * no store daria o mesmo com uma peça móvel a mais — e refs que precisariam ser
 * limpas quando um grupo desaparece.
 */
export function DockGroup({
  lado,
  grupo,
  /** O botão de recolher a coluna entra no primeiro grupo dela. */
  comRecolher,
}: {
  lado: Lado;
  grupo: Grupo;
  comRecolher: boolean;
}) {
  const ativarAba = useLayoutStore((state) => state.ativarAba);

  const ativa =
    grupo.abas.find((aba) => chaveDe(aba) === grupo.ativa) ?? grupo.abas[0];

  return (
    <section
      data-dock-grupo={grupo.id}
      data-dock-lado={lado}
      // `min-w-0` pela mesma razão da coluna: sem isso o corpo da aba dita a
      // largura mínima do grupo, e uma ficha larga atracada numa coluna estreita
      // arrasta a linha inteira atrás dela.
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-label={`Região ${grupo.id}`}
    >
      <div className="flex items-center gap-1 p-1.5">
        {/* À esquerda o botão fica depois das abas, à direita antes: ele encosta
            na borda que a coluna dela toca. Era assim nos dois painéis. */}
        {comRecolher && lado === "direita" ? (
          <PanelCollapse side="right" label="este painel" />
        ) : null}

        {/* A tira ROLA, e as abas não encolhem: com cinco abas numa coluna de
            288 pixels, encolher deixava "Ce…", "Retr…", "Ár…" — rótulo de duas
            letras não identifica nada, e as cinco juntas ainda não caberiam. A
            barra fica escondida porque ela comeria metade da altura da tira. */}
        <div
          role="tablist"
          aria-label={`Abas de ${grupo.id}`}
          className="bg-muted/60 rolagem-limpa flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-md p-0.5"
        >
          {grupo.abas.map((aba) => (
            <Aba
              key={chaveDe(aba)}
              aba={aba}
              ativa={chaveDe(aba) === chaveDe(ativa)}
              aoEscolher={() => ativarAba(lado, grupo.id, chaveDe(aba))}
            />
          ))}
        </div>

        <Adicionar lado={lado} grupoId={grupo.id} />

        {comRecolher && lado === "esquerda" ? (
          <PanelCollapse side="left" label="este painel" />
        ) : null}
      </div>

      <Separator />

      {/* `key` na chave: trocar de aba REMONTA o corpo. Sem isso, a lista de
          imagens herdaria a rolagem e o estado de busca da lista de sons — e
          duas fichas na mesma região trocariam de conteúdo sem reler nada. */}
      {/* O fade acompanha a remontagem: sem ele, trocar de aba é um corte seco
          entre duas listas de tamanhos diferentes. */}
      {/* Rola de lado quando o conteúdo tem piso de largura e a coluna é mais
          estreita que ele. `overflow-y-hidden` explícito porque um eixo em
          `auto` faz o outro deixar de ser `visible` — sem isso apareceriam duas
          barras verticais, a desta caixa e a do corpo. */}
      <div
        key={chaveDe(ativa)}
        className="animate-in fade-in-0 min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden duration-100 motion-reduce:animate-none"
      >
        <div className="flex h-full flex-col" style={{ minWidth: larguraMinima(ativa) }}>
          <JanelaCorpo conteudo={ativa} />
        </div>
      </div>
    </section>
  );
}

/** Os painéis que existem, e como se chamam no menu de trazer de volta. */
const PAINEIS: Array<{ conteudo: ConteudoJanela; titulo: string }> = [
  { conteudo: { tipo: "cenas" }, titulo: "Cenas" },
  { conteudo: { tipo: "areas" }, titulo: "Áreas" },
  { conteudo: { tipo: "retratos" }, titulo: "Retratos" },
  { conteudo: { tipo: "imagens" }, titulo: "Imagens" },
  { conteudo: { tipo: "sons" }, titulo: "Sons" },
  { conteudo: { tipo: "camadas" }, titulo: "Camadas" },
];

/**
 * Traz de volta um painel que não está em lugar nenhum.
 *
 * Existe porque desatracar abriu uma porta de mão única: arrastar Cenas para
 * fora e fechar no X deixaria a lista de cenas inalcançável, e o único jeito de
 * recuperá-la seria apagar o `localStorage`. Personagens tem a pílula do canto
 * do palco para reabrir; os seis painéis não tinham nada.
 *
 * Só o que está fora: um menu que oferece o que já está à vista faria o mestre
 * conferir a coluna para saber se o item serve para algo.
 */
function Adicionar({ lado, grupoId }: { lado: Lado; grupoId: string }) {
  const layout = useLayoutStore((state) => state.layout);
  const atracar = useLayoutStore((state) => state.atracar);
  const flutuantes = useWindowStore((state) => state.janelas);

  const ocupadas = new Set([
    ...layout.esquerda.grupos.flatMap((grupo) => grupo.abas.map(chaveDe)),
    ...layout.direita.grupos.flatMap((grupo) => grupo.abas.map(chaveDe)),
    ...flutuantes.map((janela) => janela.chave),
  ]);

  const faltando = PAINEIS.filter(({ conteudo }) => !ocupadas.has(chaveDe(conteudo)));

  if (faltando.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground shrink-0"
            aria-label="Trazer um painel para esta região"
          >
            <Plus />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {faltando.map(({ conteudo, titulo }) => (
          <DropdownMenuItem
            key={titulo}
            onClick={() => atracar({ lado, onde: "aba", grupoId }, conteudo)}
          >
            {titulo}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Uma aba: escolhe no toque, e desatraca se for arrastada.
 *
 * Botão, e não link nem div com clique: escolher aba é ação, e `role="tab"` sem
 * elemento focável deixaria a coluna inteira fora do alcance do teclado.
 *
 * Escolhe no `pointerdown`, e não no `click`: o arrasto chama `preventDefault`,
 * que mata o `click` sintético do mouse. Escolher na pressão é o que as abas de
 * editor fazem de qualquer jeito. O `onClick` fica para o teclado, onde não há
 * `pointerdown` nenhum para atrapalhar.
 *
 * Arrastar para fora da coluna devolve a janela ao estado flutuante, no ponto
 * onde ela foi solta — e não na posição guardada dela: quem arrasta para um
 * lugar espera que ela apareça ali, e a lembrança é de quando ela flutuava, uma
 * arrumação atrás.
 */
function Aba({
  aba,
  ativa,
  aoEscolher,
}: {
  aba: ConteudoJanela;
  ativa: boolean;
  aoEscolher: () => void;
}) {
  const { titulo } = useRotuloJanela(aba);

  const startDockDrag = useDockDrag();
  const removerAba = useLayoutStore((state) => state.removerAba);
  const abrirFlutuante = useWindowStore((state) => state.abrir);
  const piscando = useWindowStore((state) => state.piscando === chaveDe(aba));

  const botao = useRef<HTMLButtonElement | null>(null);

  // Aba escolhida fora da vista se traz para a vista. Desde que a tira rola em
  // vez de encolher, ativar Camadas pelo menu do `+` — ou piscá-la porque o
  // mestre pediu de novo o que já estava aqui — podia acender uma aba fora do
  // recorte, e o pedido dele pareceria não ter efeito.
  //
  // `nearest` nos dois eixos: o movimento mínimo que resolve. Sem isso o
  // navegador pode centralizar a aba e sacudir a coluna de lado.
  useEffect(() => {
    if (!ativa && !piscando) return;

    botao.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [ativa, piscando]);

  return (
    <button
      ref={botao}
      type="button"
      role="tab"
      aria-selected={ativa}
      className={cn(
        "shrink-0 cursor-grab whitespace-nowrap rounded-sm px-2 py-1 text-xs transition-all active:cursor-grabbing",
        // Arrastando, a aba fica apagada e recuada: é o par visual da etiqueta
        // que saiu dela e está no cursor. Sem isso a aba continuava acesa na
        // tira, e a etiqueta parecia uma segunda cópia em vez de a mesma coisa
        // sendo levada para outro lugar.
        "data-arrastando:scale-95 data-arrastando:opacity-40 motion-reduce:transition-none",
        // Pedida de novo estando já aqui: duas batidas apontam qual é. Ver
        // `useAbrirJanela`.
        piscando && "piscar",
        ativa
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
      title={titulo}
      onPointerDown={(event) => {
        aoEscolher();

        const botao = event.currentTarget;

        startDockDrag(event, {
          conteudo: aba,
          fantasma: titulo,
          aoTerminar: () => botao.removeAttribute("data-arrastando"),
          aoMover: () => botao.setAttribute("data-arrastando", ""),
          aoSoltarSolto: (ponto) => {
            const camadaRect = document
              .querySelector("[data-dock-camada]")
              ?.getBoundingClientRect();

            removerAba(chaveDe(aba));

            // O canto vai um pouco acima e à esquerda do ponteiro: soltando com
            // o canto exatamente no cursor, a mão fica sobre o cabeçalho e o
            // primeiro clique depois de soltar cairia no botão de fechar.
            //
            // Limitado à camada, porque `abrir` não limita: soltar rente à
            // borda de baixo deixaria o cabeçalho fora da vista, e com ele o
            // único jeito de pegar a janela de novo.
            const x = ponto.x - (camadaRect?.left ?? 0) - 24;
            const y = ponto.y - (camadaRect?.top ?? 0) - 12;

            abrirFlutuante(aba, {
              x: Math.min(Math.max(x, 0), Math.max(0, (camadaRect?.width ?? 0) - 80)),
              y: Math.min(Math.max(y, 0), Math.max(0, (camadaRect?.height ?? 0) - 40)),
            });
          },
        });
      }}
      onClick={aoEscolher}
    >
      {titulo}
    </button>
  );
}
