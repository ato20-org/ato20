import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * O que só o Mestre precisa.
 *
 * Os dois moravam no layout raiz, e por isso viajavam para as três telas. O
 * `TooltipProvider` arrasta o posicionador do Base UI -- a mesma máquina de
 * flutuação que o popover e o select usam --, e a dica de ferramenta é
 * afordância de MOUSE PARADO EM CIMA: a TV não tem cursor e o celular não tem
 * hover, então nenhuma das duas tem como mostrar uma.
 *
 * Medido em `next build`, JavaScript que o browser baixa por tela, comprimido:
 * o `TooltipProvider` custava 37 KiB no Espectador, 25 KiB no Jogador e 50 KiB na
 * porta de entrada — que é justamente a página que o jogador abre primeiro,
 * digitando o IP no celular.
 */
export default function MestreLayout({ children }: LayoutProps<"/mestre">) {
  return (
    <TooltipProvider>
      {children}
      <Toaster theme="dark" />
    </TooltipProvider>
  );
}
