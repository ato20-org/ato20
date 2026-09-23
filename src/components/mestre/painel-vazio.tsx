import { createElement, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { iconeDaJanela } from "@/lib/mestre/icone-da-janela";
import type { ConteudoJanela } from "@/lib/store/use-window-store";
import { cn } from "@/lib/utils";

/**
 * O que um painel mostra quando não há nada para mostrar.
 *
 * Um componente e não a mesma dúzia de classes em cada painel: eram oito
 * lugares escrevendo o mesmo bloco à mão, e o oitavo já tinha nascido com outra
 * opacidade que o primeiro. O vazio é a primeira coisa que alguém vê de um
 * painel que nunca usou, e é onde a aplicação menos pode parecer remendada.
 *
 * O ícone vem da ABA que abre o painel, não de uma escolha feita aqui: os dois
 * dizem a mesma tela, e um vazio com desenho próprio parecia outro lugar.
 * Trocar o ícone da aba passa a trocar este junto. Ver `iconeDaJanela`.
 *
 * `opacity-20` porque ele é pano de fundo da frase, e não a informação: quem
 * lê o vazio lê a linha de texto, e um ícone em peso cheio no meio de um painel
 * escuro puxava o olho para um desenho que não diz nada de novo.
 *
 * O texto vem como filho para caber tanto a constatação quanto o convite. A
 * regra de qual usar: se existe nesta mesma tela um botão que resolve o vazio,
 * o texto manda fazer -- "Crie o primeiro personagem". Se o que preenche
 * acontece em outro painel, ele só constata -- "Nenhum retrato encontrado".
 */
export function PainelVazio({
  conteudo,
  icone,
  className,
  children,
}: {
  /** De quem é este painel. É daqui que sai o ícone. */
  conteudo?: ConteudoJanela;
  /**
   * O ícone, para o vazio que não é de uma janela.
   *
   * Existe para as ABAS de dentro de um painel -- Áreas, dentro de Mapas. Elas
   * não têm janela própria, então não têm ícone em `iconeDaJanela`, e o
   * desenho que serve ali é outro que não o da janela que as hospeda.
   */
  icone?: LucideIcon;
  /**
   * Para o punhado de casos em que `h-full` não serve.
   *
   * Dois existem hoje: painéis cujo vazio cobre o gatilho do menu de contexto
   * do fundo e precisam de `absolute inset-0 pointer-events-none` para o botão
   * direito atravessar, e os que não moram dentro de um `ScrollArea` e se
   * esticam com `flex-1`.
   */
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "text-muted-foreground flex h-full flex-col items-center justify-center gap-3 p-6 text-center select-none",
        className,
      )}
    >
      {/* `createElement` e nao `<Icone />` com uma variavel local: o lint
          recusa resolver um componente dentro do render -- a regra existe para
          pegar componente DEFINIDO ali, que perde estado a cada quadro. Aqui e
          so uma escolha entre ícones que ja existem, e o desenho nao guarda
          estado nenhum. */}
      {createElement(icone ?? iconeDaJanela(conteudo!), {
        className: "size-8 opacity-20",
        "aria-hidden": true,
      })}
      <p className="text-xs leading-snug">{children}</p>
    </div>
  );
}
