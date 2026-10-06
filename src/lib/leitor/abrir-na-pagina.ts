import { abrirJanela } from "@/lib/extensoes/janelas";
import { useLeitorStore } from "@/lib/store/use-leitor-store";
import { usePaineisStore } from "@/lib/store/use-paineis-store";
import { chaveDoConteudo, painelDoConteudo } from "@/lib/paineis";

/**
 * Abre um livro da estante numa página, onde ele estiver.
 *
 * Num painel ao lado do mapa, a aba dele vem à frente e salta: uma janela do
 * mesmo livro seriam dois leitores do mesmo PDF. Numa janela, ela vem para a
 * frente e salta. Em lugar nenhum, a janela nasce já na página, como o clique
 * na Estante.
 *
 * É o clique na menção `!rótulo`: a regra que o mestre marcou, e não a página
 * em que ele parou de ler.
 */
export function abrirLivroNaPagina(livroId: string, titulo: string, pagina: number): void {
  useLeitorStore.getState().saltar(livroId, pagina);

  const conteudo = { tipo: "livro", livroId, titulo } as const;
  const paineis = usePaineisStore.getState();

  if (painelDoConteudo(paineis, chaveDoConteudo(conteudo))) {
    paineis.abrir(conteudo);
    return;
  }

  abrirJanela(conteudo);
}
