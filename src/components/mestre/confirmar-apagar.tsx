"use client";

import { create } from "zustand";

import { ConfirmarRemocao } from "@/components/mestre/confirmar-remocao";
import { soltaComFoco } from "@/lib/janelas-soltas";

/** O que a pergunta diz: "Apagar FOR?", o que some junto, e o que fica. */
export type PedidoDeApagar = { titulo: string; itens: string[]; ressalva?: string };

/**
 * `pedido` fica depois da resposta, e só `responder` some: o diálogo ainda
 * anima o fechamento, e sem o texto ele fecharia com o título em branco.
 */
const usePerguntaStore = create<{
  pedido: PedidoDeApagar | null;
  responder: ((apagar: boolean) => void) | null;
  /**
   * Em que janela perguntar: a solta que estava com o foco quando o pedido
   * veio, ou `null` para o Mestre. Ver `soltaComFoco`.
   */
  onde: string | null;
}>(() => ({ pedido: null, responder: null, onde: null }));

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
    usePerguntaStore.setState({ pedido, responder: resolver, onde: soltaComFoco() });
  });
}

function responder(apagar: boolean) {
  const resolver = usePerguntaStore.getState().responder;
  if (!resolver) return;

  usePerguntaStore.setState({ responder: null });
  resolver(apagar);
}

/**
 * O diálogo de `confirmarApagar`. Montado no Mestre e em cada janela solta, e
 * cada um só abre a pergunta feita na janela dele: apagar uma condição no
 * Compêndio solto pergunta ali, e não no monitor do Mestre.
 */
export function ConfirmacaoDeApagar({ onde = null }: { onde?: string | null }) {
  const pedido = usePerguntaStore((state) => state.pedido);
  const aberto = usePerguntaStore((state) => state.responder !== null && state.onde === onde);

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
