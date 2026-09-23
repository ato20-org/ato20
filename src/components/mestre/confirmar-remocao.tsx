"use client";

import { TriangleAlert } from "lucide-react";

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
  itens,
  ressalva,
  acao = "Apagar",
  onConfirmar,
}: {
  aberto: boolean;
  onAberto: (aberto: boolean) => void;
  titulo: string;
  /**
   * O que sai junto, um por linha.
   *
   * Lista e não parágrafo, e substantivo solto em cada item -- ninguém lê texto
   * denso com o dedo já no botão vermelho, e o que se lia era o título e o
   * "Remover". Em itens, o preço se conta de relance.
   */
  itens: string[];
  /** O que NÃO vai junto, quando a pergunta costuma aparecer. */
  ressalva?: string;
  /** O rótulo do botão que confirma. */
  acao?: string;
  onConfirmar: () => void;
}) {
  return (
    <AlertDialog open={aberto} onOpenChange={onAberto}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>

          {/* `render` de `div`: a descrição nasce `<p>`, e uma `<ul>` dentro de
              um `<p>` o navegador fecha sozinho antes da lista -- o texto saía
              do lugar sem erro nenhum no console. */}
          <AlertDialogDescription render={<div className="space-y-2" />}>
            <p>
              Ao {acao.toLowerCase()} você vai{" "}
              <strong className="text-foreground">remover</strong>
            </p>

            <ul className="text-foreground marker:text-muted-foreground/40 list-disc space-y-0.5 pl-4">
              {itens.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            {ressalva ? <p>{ressalva}</p> : null}

            {/* O aviso de que não tem volta sai do fim do parágrafo, onde era a
                última oração de um texto corrido, e vira a última linha com um
                símbolo ao lado. Âmbar e não vermelho: o botão que confirma já é
                vermelho, e repetir a cor faria os dois disputarem o olho.

                Vive AQUI e não em cada chamada porque as quatro telas diziam a
                mesma frase -- e um aviso de coisa irreversível que diverge
                entre elas é pior que nenhum. */}
            <p className="text-foreground flex items-center gap-1.5 font-medium">
              <TriangleAlert
                className="size-4 shrink-0 text-amber-400"
                aria-hidden
              />
              Ctrl+Z não traz de volta
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmar}>{acao}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
