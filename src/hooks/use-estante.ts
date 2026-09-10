"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { importarLivros, listarLivros, removerLivro, type Livro } from "@/lib/vault/estante";

type EstanteApi = {
  livros: Livro[];
  /** Abre o seletor nativo e copia os PDFs escolhidos para a estante. */
  importar: () => Promise<void>;
  remover: (id: string) => Promise<void>;
  refresh: () => void;
};

/**
 * Os livros de regras desta máquina.
 *
 * Mesma forma do `useAssetList`, e uma diferença que importa: não passa por
 * campanha. A estante existe com a mesa fechada — o mestre consulta uma regra
 * antes de escolher a campanha da noite —, então a lista vazia aqui significa
 * estante vazia, e não "sem campanha".
 */
export function useEstante(): EstanteApi {
  const [livros, setLivros] = useState<Livro[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let ativo = true;
    void listarLivros().then(
      (proximos) => {
        if (ativo) setLivros(proximos);
      },
      (cause) => {
        // Falha aqui é banco da máquina, não estante vazia. Avisar é o certo:
        // o mestre precisa saber que a lista não está apenas sem livros.
        if (ativo) toast.error(cause instanceof Error ? cause.message : "Falha ao ler a estante.");
      },
    );

    return () => {
      ativo = false;
    };
  }, [version]);

  const refresh = useCallback(() => setVersion((atual) => atual + 1), []);

  const importar = useCallback(async () => {
    try {
      const resultado = await importarLivros();

      // `null` é o diálogo fechado sem escolher: não muda nada, e não avisa.
      if (!resultado) return;

      // Um motivo por arquivo, como no acervo: quem escolheu três manuais e
      // teve um recusado quer os dois e quer saber qual ficou fora.
      for (const motivo of resultado.recusados) toast.error(motivo);

      if (resultado.aceitos.length > 0) refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao importar.");
    }
  }, [refresh]);

  const remover = useCallback(
    async (id: string) => {
      try {
        await removerLivro(id);
        refresh();
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "Falha ao remover o livro.");
      }
    },
    [refresh],
  );

  return { livros, importar, remover, refresh };
}

/**
 * Um livro só, pelo id.
 *
 * Lista e filtra em vez de um comando por id: a estante inteira são algumas
 * linhas de SQLite, e um `estante_livro` existiria para responder à mesma
 * pergunta com mais uma peça na ponte. `null` enquanto não chegou, e também
 * quando o livro não está mais na estante — o leitor trata os dois igual, com o
 * corpo em carregando, porque remover o livro fecha a janela dele.
 */
export function useLivro(livroId: string): Livro | null {
  const [livro, setLivro] = useState<Livro | null>(null);

  useEffect(() => {
    let ativo = true;

    void listarLivros().then(
      (lista) => {
        if (ativo) setLivro(lista.find((atual) => atual.id === livroId) ?? null);
      },
      () => {
        // O leitor não depende disto para abrir o PDF: sem a linha do banco ele
        // só perde a página lembrada e o título, e começa na primeira página.
        if (ativo) setLivro(null);
      },
    );

    return () => {
      ativo = false;
    };
  }, [livroId]);

  return livro;
}
