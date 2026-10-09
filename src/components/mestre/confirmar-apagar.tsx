"use client";

import { create } from "zustand";

import { ConfirmarRemocao } from "@/components/mestre/confirmar-remocao";

/** O que a pergunta diz: "Apagar FOR?", o que some junto, e o que fica. */
export type PedidoDeApagar = { titulo: string; itens: string[]; ressalva?: string };

/**
 * `pedido` fica depois da resposta, e só `responder` some: o diálogo ainda
 * anima o fechamento, e sem o texto ele fecharia com o título em branco.
 */
const usePerguntaStore = create<{
  pedido: PedidoDeApagar | null;
  responder: ((apagar: boolean) => void) | null;
}>(() => ({ pedido: null, responder: null }));

/**
 * Pergunta antes de apagar, e responde `true` só no "Apagar".
 *
 * Para o que a ficha apaga sem volta -- o atributo, o detalhe, o medidor, o
 * item: a ficha não tem Ctrl+Z, e a lixeira mora a um pixel do lápis. A
 * pergunta é a `ConfirmarRemocao` de sempre, a mesma da cena e do quadro, mas
 * uma só para o Mestre inteiro, montada em `<ConfirmacaoDeApagar />`: trinta
 * perícias seriam trinta diálogos fechados na árvore, e a lixeira do medidor
 * vive numa linha que nem sabe do personagem.
 *
 * Uma segunda pergunta com a primeira aberta responde "não" à primeira: o
 * mestre só vê uma, e é a última que ele pediu.
 */
export function confirmarApagar(pedido: PedidoDeApagar): Promise<boolean> {
  return new Promise((resolver) => {
    usePerguntaStore.getState().responder?.(false);
    usePerguntaStore.setState({ pedido, responder: resolver });
  });
}

function responder(apagar: boolean) {
  const resolver = usePerguntaStore.getState().responder;
  if (!resolver) return;

  usePerguntaStore.setState({ responder: null });
  resolver(apagar);
}

/** O diálogo de `confirmarApagar`. Montado uma vez, no Mestre. */
export function ConfirmacaoDeApagar() {
  const pedido = usePerguntaStore((state) => state.pedido);
  const aberto = usePerguntaStore((state) => state.responder !== null);

  return (
    <ConfirmarRemocao
      aberto={aberto}
      onAberto={(abrindo) => {
        // Depois do evento, e não nele: o "Apagar" também fecha o diálogo, e
        // o fechar não pode responder "não" antes de o clique dizer "sim".
        if (!abrindo) queueMicrotask(() => responder(false));
      }}
      titulo={pedido?.titulo ?? ""}
      itens={pedido?.itens ?? []}
      ressalva={pedido?.ressalva}
      onConfirmar={() => responder(true)}
    />
  );
}
