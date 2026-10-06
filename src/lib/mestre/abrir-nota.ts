import { useArquivoAbertoStore } from "@/lib/store/use-arquivo-aberto-store";
import { usePaineisStore } from "@/lib/store/use-paineis-store";
import { painelDoConteudo, type Alvo } from "@/lib/paineis";

/**
 * As portas de uma nota, num lugar só.
 *
 * Uma nota vive em uma casa por vez: no CENTRO, no lugar do palco, que é onde
 * ela abre por padrão, ou num painel ao lado do mapa, quando o mestre a divide.
 * Dois editores da mesma nota abertos ao mesmo tempo escreveriam o mesmo
 * arquivo um por cima do outro, e é isso que estas funções impedem.
 */

/** Abre onde ela já estiver; em lugar nenhum, no centro. */
export function abrirNota(notaId: string): void {
  const paineis = usePaineisStore.getState();

  if (painelDoConteudo(paineis, `nota:${notaId}`)) {
    paineis.abrir({ tipo: "nota", notaId });
    return;
  }

  useArquivoAbertoStore.getState().abrirNota(notaId);
}

/** Leva a nota para um painel ao lado do mapa, e o palco volta ao centro. */
export function abrirNotaAoLado(notaId: string): void {
  const centro = useArquivoAbertoStore.getState();
  if (centro.notaId === notaId) centro.fechar();

  usePaineisStore.getState().abrir({ tipo: "nota", notaId });
}

/** Leva a nota para um lugar escolhido da fileira: o que cai na área de split. */
export function abrirNotaEm(notaId: string, alvo: Alvo): void {
  const centro = useArquivoAbertoStore.getState();
  if (centro.notaId === notaId) centro.fechar();

  usePaineisStore.getState().abrirEm({ tipo: "nota", notaId }, alvo);
}

/** Tira a nota do painel e a abre no centro, no lugar do palco. */
export function trazerNotaAoCentro(notaId: string): void {
  usePaineisStore.getState().fechar({ tipo: "nota", notaId });
  useArquivoAbertoStore.getState().abrirNota(notaId);
}

/** Fecha a nota onde estiver: a nota apagada. */
export function fecharNotaEmTodaParte(notaId: string): void {
  const centro = useArquivoAbertoStore.getState();
  if (centro.notaId === notaId) centro.fechar();

  usePaineisStore.getState().fechar({ tipo: "nota", notaId });
}
