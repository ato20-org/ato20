import { Suspense } from "react";

import { Mestre } from "@/components/mestre/mestre";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * O Mestre, e o aplicativo abre nele.
 *
 * Morava em `/mestre`, ao lado de uma landing que ocupava a raiz — herança de
 * quando isto era um site: a landing escolhia entre as três visões, e fazia
 * sentido enquanto havia endereço público para alguém digitar. Num aplicativo
 * de desktop a raiz é a casa, e a casa é esta tela.
 *
 * O `TooltipProvider` e o `Toaster` estão AQUI, e não no layout raiz, porque de
 * lá viajariam para o Espectador e para o Jogador. O provedor arrasta o
 * posicionador do Base UI -- a mesma máquina de flutuação do popover e do
 * select --, e dica de ferramenta é afordância de mouse parado em cima: a TV
 * não tem cursor e o celular não tem hover. Medido em `next build`, JavaScript
 * comprimido por tela, custava 37 KiB no Espectador e 25 KiB no Jogador.
 *
 * Eram um layout de segmento antes. Viraram parte da página quando o segmento
 * `/mestre` deixou de existir: com uma tela só embaixo dele, o layout não
 * guardava estado entre navegação nenhuma.
 */
export default function MestrePage() {
  // `useSearchParams` exige fronteira de Suspense numa página estática.
  return (
    <TooltipProvider>
      <Suspense fallback={null}>
        <Mestre />
      </Suspense>
      <Toaster theme="dark" />
    </TooltipProvider>
  );
}
