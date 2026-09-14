import { Toaster } from "@/components/ui/sonner";

/**
 * O aviso de salvo, e só ele.
 *
 * O Jogador é a única tela de espectador que grava algo — nome, notas e anexos
 * do jogador —, então é a única que tem o que avisar. Ver `MyCharacters` e
 * `useCharactersStore`.
 *
 * Sem `TooltipProvider`: celular não tem hover, e nenhum componente daqui pede
 * dica. Ver o layout do Mestre para o que isso pesava.
 */
export default function JogadorLayout({ children }: LayoutProps<"/jogador">) {
  return (
    <>
      {children}
      <Toaster theme="dark" />
    </>
  );
}
