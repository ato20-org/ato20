import { abrirJanela } from "@/lib/extensoes/janelas";
import { useLeitorStore } from "@/lib/store/use-leitor-store";

/**
 * Abre um livro da estante numa página, onde ele estiver.
 *
 * No split, a página vai até lá e nada mais abre: uma janela do mesmo livro
 * ao lado seriam dois leitores do mesmo PDF. Numa janela, ela vem para a frente
 * e salta. Em lugar nenhum, a janela nasce já na página.
 *
 * É o clique na menção `!rótulo`: a regra que o mestre marcou, e não a página
 * em que ele parou de ler.
 */
export function abrirLivroNaPagina(livroId: string, titulo: string, pagina: number): void {
  const leitor = useLeitorStore.getState();
  leitor.saltar(livroId, pagina);

  if (leitor.livroId === livroId) return;

  abrirJanela({ tipo: "livro", livroId, titulo });
}
