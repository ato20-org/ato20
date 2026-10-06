"use client";

import { LayoutDoRetratoPainel } from "@/components/mestre/layout-do-retrato";
import { PortraitList } from "@/components/mestre/portrait-list";
import { PosicaoDosRetratos } from "@/components/mestre/posicao-dos-retratos";
import { QuadroDosRetratos } from "@/components/mestre/quadro-dos-retratos";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useCharacters } from "@/hooks/use-characters";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";

/**
 * Tudo o que é de retrato, num lugar só.
 *
 * Em cima, a tela da mesa com os retratos onde ela vai vê-los -- é ali que se
 * arrasta, escala e leva uma união de canto. Embaixo, três abas: quem está na
 * cena e em que união (Elenco), o que cada retrato mostra (Layout) e onde os
 * novos nascem (Posição).
 *
 * Layout e Posição moravam na configuração da campanha, e voltaram para cá: o
 * mestre ajusta o layout OLHANDO o retrato, e o quadro em cima é a prévia que
 * faltava lá. Continuam gravados por campanha, como sempre foram.
 */
export function RetratosWindow() {
  const guardados = usePortraitStore((state) => state.portraits);
  const selecionados = useSelectionStore((state) => state.selectedPortraitIds);
  const selectPortraits = useSelectionStore((state) => state.selectPortraits);
  const { personagens } = useCharacters();

  /**
   * O retrato que a aba Layout edita.
   *
   * Um só. Com vários escolhidos ela volta para a mesa, e é a leitura honesta
   * do que está na tela: "estes três" não é um retrato, e aplicar a troca aos
   * três seria um gesto que o mestre não pediu -- ele escolheu vários para
   * unir ou escalar junto.
   */
  const paraLayout =
    selecionados.length === 1
      ? (guardados.find((retrato) => retrato.id === selecionados[0]) ?? null)
      : null;
  const nomeDoSelecionado = paraLayout
    ? personagens?.find((atual) => atual.id === paraLayout.personagemId)?.nome
    : undefined;

  return (
    // `@container`, e não breakpoint de tela: a janela flutua e atraca, e quem
    // decide é a largura DELA. Estreita, o quadro fica em cima e as abas
    // embaixo; larga, o quadro vai para a esquerda e as abas viram uma coluna
    // do tamanho do dock -- com o quadro em cima de uma janela larga, o 16:9
    // tomava a altura inteira e espremia a lista até sobrar só a busca.
    <div className="@container/retratos flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col @[40rem]/retratos:flex-row">
        {/* Na horizontal o espaço do quadro vira container de TAMANHO, e o
            quadro cabe nele pelos dois eixos: a largura é o menor entre a
            largura toda e a altura vezes 16/9. Só ali -- na vertical a janela
            pode crescer com o conteúdo, e a contenção de tamanho a zeraria. */}
        <div className="shrink-0 border-b p-2 @[40rem]/retratos:grid @[40rem]/retratos:min-w-0 @[40rem]/retratos:flex-1 @[40rem]/retratos:shrink @[40rem]/retratos:place-items-center @[40rem]/retratos:border-r @[40rem]/retratos:border-b-0 @[40rem]/retratos:[container-type:size]">
          <div className="w-full @[40rem]/retratos:w-[min(100cqw,calc(100cqh*16/9))]">
            <QuadroDosRetratos />
          </div>
        </div>

        <Tabs
          defaultValue="elenco"
          className="flex min-h-0 flex-1 flex-col gap-0 @[40rem]/retratos:w-72 @[40rem]/retratos:flex-none"
        >
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

          <TabsContent value="elenco" className="flex min-h-0 flex-1 flex-col gap-0">
            <PortraitList />
          </TabsContent>

          {/* `overflow-x-hidden` junto com o `y`, e não por zelo: o CSS promove
              um eixo `visible` a `auto` quando o outro deixa de ser visível, e
              qualquer peça da prévia passando um pixel da borda ligaria a barra
              horizontal. */}
          <TabsContent
            value="layout"
            className="min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto p-2"
          >
            {paraLayout ? (
              <div className="bg-muted/40 flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px]">
                <span className="min-w-0 flex-1 truncate">
                  Só de{" "}
                  <span className="font-medium">
                    {nomeDoSelecionado ?? "este retrato"}
                  </span>
                  . O resto segue a mesa.
                </span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground shrink-0 underline decoration-dotted underline-offset-2"
                  onClick={() => selectPortraits([])}
                >
                  Editar a mesa
                </button>
              </div>
            ) : (
              <p className="text-muted-foreground text-[11px] leading-snug">
                O padrão da mesa. Escolha um retrato no quadro para mudar só o
                dele.
              </p>
            )}

            <LayoutDoRetratoPainel selecionado={paraLayout} />
          </TabsContent>

          <TabsContent
            value="posicao"
            className="min-h-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto p-2"
          >
            <p className="text-muted-foreground text-[11px] leading-snug">
              Apertar arruma os retratos soltos e faz os novos nascerem ali.
            </p>

            <PosicaoDosRetratos />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
