"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * "Tem certeza?" antes de apagar cena, quadro ou nota.
 *
 * Existe porque o desfazer do board NÃO traz essas coisas de volta -- de
 * propósito, ver `soConteudo` no `useSceneStore`: Ctrl+Z é para o que está
 * dentro da cena, e um quadro que some por um Ctrl+Z a mais era pior do que
 * um que nunca volta. Sem o desfazer como rede, a rede é esta pergunta.
 *
 * Controlado de fora (`aberto`/`onAberto`) e não por `AlertDialogTrigger`: o
 * item de menu que pede a remoção fecha o menu ao ser clicado, e o diálogo
 * precisa sobreviver a esse fechamento.
 */
export function ConfirmarRemocao({
  aberto,
  onAberto,
  titulo,
  descricao,
  acao = "Apagar",
  onConfirmar,
}: {
  aberto: boolean;
  onAberto: (aberto: boolean) => void;
  titulo: string;
  descricao: string;
  /** O rótulo do botão que confirma. */
  acao?: string;
  onConfirmar: () => void;
}) {
  return (
    <AlertDialog open={aberto} onOpenChange={onAberto}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmar}>{acao}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
