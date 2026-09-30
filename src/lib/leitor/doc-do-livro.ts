import type { PDFDocumentProxy } from "pdfjs-dist";

import { criarFila } from "@/lib/leitor/fila-de-render";
import { pdfjs, RUNTIME } from "@/lib/leitor/pdfjs";
import { livroFonte } from "@/lib/vault/estante";

/**
 * Quanto um livro fica aberto depois que a última miniatura dele sumiu.
 *
 * A prévia de uma menção é de hover: o mestre passa o mouse por três `!regra`
 * da mesma nota em dois segundos, e reabrir o PDF a cada uma -- o worker, a
 * tabela de referências, os pedidos de faixa -- seria o atraso inteiro de
 * cada tooltip.
 */
const FOLGA_MS = 30_000;

type Aberto = {
  promessa: Promise<PDFDocumentProxy>;
  destruir: () => void;
  usos: number;
  fechar?: ReturnType<typeof setTimeout>;
};

const abertos = new Map<string, Aberto>();

/**
 * Uma miniatura por vez em toda a bancada, como as folhas de um leitor: uma
 * nota com seis `!regra` sob o mouse não pode pôr seis páginas no worker de
 * uma vez, na frente da página que o leitor aberto ao lado está desenhando.
 */
export const filaDasMiniaturas = criarFila(1);

/**
 * O documento de um livro da estante para quem desenha MINIATURA de página.
 *
 * Um por livro, contado por uso: três prévias do mesmo manual abrem o PDF uma
 * vez. O leitor não passa por aqui -- ele abre o dele em `usePdfDoc`, com a
 * vida da janela, e dividir um documento com a janela faria fechar a prévia
 * derrubar o leitor.
 *
 * `soltar` é obrigatório, e só conta uma vez.
 */
export function pegarDocDoLivro(livroId: string): {
  promessa: Promise<PDFDocumentProxy>;
  soltar: () => void;
} {
  let aberto = abertos.get(livroId);

  if (!aberto) {
    let tarefa: { destroy: () => Promise<void> } | null = null;
    const promessa = (async () => {
      const [mod, fonte] = await Promise.all([pdfjs(), livroFonte(livroId)]);
      const carregando = mod.getDocument({ ...fonte, ...RUNTIME });
      tarefa = carregando;
      return carregando.promise;
    })();

    const novo: Aberto = {
      promessa,
      destruir: () => void tarefa?.destroy(),
      usos: 0,
    };
    // Falhou: sai do mapa, e a próxima prévia tenta de novo em vez de herdar
    // a promessa rejeitada para sempre.
    promessa.catch(() => {
      if (abertos.get(livroId) === novo) abertos.delete(livroId);
    });
    abertos.set(livroId, novo);
    aberto = novo;
  }

  const meu = aberto;
  meu.usos += 1;
  clearTimeout(meu.fechar);

  let solto = false;
  return {
    promessa: meu.promessa,
    soltar() {
      if (solto) return;
      solto = true;
      meu.usos -= 1;
      if (meu.usos > 0) return;

      meu.fechar = setTimeout(() => {
        if (abertos.get(livroId) === meu) abertos.delete(livroId);
        meu.destruir();
      }, FOLGA_MS);
    },
  };
}
