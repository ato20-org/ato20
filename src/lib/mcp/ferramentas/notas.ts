"use client";

import { t } from "@/lib/i18n/mcp";
import { criarDocumento, gravarDocumento, lerDocumento } from "@/lib/vault/documentos";
import { useDocumentoStore } from "@/lib/store/use-documento-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { boardAtual, campanhaPronta, nomeDaPasta, pastaPeloNome } from "@/lib/mcp/contexto";
import { FalhaDaFerramenta, acharPorIdOuNome, type Ferramenta } from "@/lib/mcp/protocolo";
import type { Nota } from "@/types/scene";

/**
 * As notas: os documentos de Markdown do painel Arquivos.
 *
 * Uma nota são duas coisas -- o arquivo em `documentos/` e a entrada no board,
 * com o título e a pasta. As duas andam pelo caminho da tela: o arquivo pelo
 * IPC, a entrada pelo store, que grava sozinho.
 */

function acharNota(notas: readonly Nota[], referencia: string): Nota {
  return acharPorIdOuNome(notas, referencia, { id: (nota) => nota.id, nome: (nota) => nota.titulo }, t.achar.nota);
}

/**
 * O texto, como o mestre o vê: se a nota está aberta no editor, o que está na
 * tela -- que pode ter teclas ainda não gravadas.
 */
async function textoDaNota(arquivo: string): Promise<string> {
  const naTela = useDocumentoStore.getState().textos[arquivo];

  return naTela ?? (await lerDocumento(arquivo));
}

/**
 * Grava o texto de uma nota.
 *
 * Aberta no editor, pelo store do editor: gravar o disco por baixo dele seria
 * desfeito na próxima tecla do mestre, que grava o texto antigo que a tela
 * guarda. Fechada, direto no disco, e os cartões dela nos quadros são avisados
 * para a mesa reler.
 */
async function gravarTexto(arquivo: string, texto: string): Promise<void> {
  if (arquivo in useDocumentoStore.getState().textos) {
    useDocumentoStore.getState().escrever(arquivo, texto);
    return;
  }

  await gravarDocumento(arquivo, texto);
  useSceneStore.getState().tocarDocumentos(arquivo);
}

const PASTA = { type: "string", description: t.parametros.pastaDeArquivos };

export const ferramentasDeNotas: Ferramenta[] = [
  {
    nome: "listar_notas",
    titulo: t.notas.listar.titulo,
    descricao: t.notas.listar.descricao,
    entrada: { type: "object", properties: {} },
    somenteLeitura: true,
    async executar() {
      const { board } = await campanhaPronta();

      return (board.notas ?? [])
        .map((nota) => ({ id: nota.id, titulo: nota.titulo, pasta: nomeDaPasta(board, nota.pastaId) }))
        .sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR", { numeric: true }));
    },
  },
  {
    nome: "ler_nota",
    titulo: t.notas.ler.titulo,
    descricao: t.notas.ler.descricao,
    entrada: {
      type: "object",
      properties: { nota: { type: "string", description: t.notas.ler.nota } },
      required: ["nota"],
    },
    somenteLeitura: true,
    async executar(args) {
      const { board } = await campanhaPronta();
      const nota = acharNota(board.notas ?? [], args.texto("nota"));

      return {
        id: nota.id,
        titulo: nota.titulo,
        pasta: nomeDaPasta(board, nota.pastaId),
        texto: await textoDaNota(nota.arquivo),
      };
    },
  },
  {
    nome: "criar_nota",
    titulo: t.notas.criar.titulo,
    descricao: t.notas.criar.descricao,
    entrada: {
      type: "object",
      properties: {
        titulo: { type: "string", description: t.notas.criar.tituloDaNota },
        texto: { type: "string", description: t.notas.criar.texto },
        pasta: PASTA,
      },
      required: ["titulo"],
    },
    async executar(args) {
      await campanhaPronta();
      const titulo = args.texto("titulo");
      const texto = args.textoLivre("texto");
      const pasta = args.textoOpcional("pasta");

      const pastaId = pasta ? pastaPeloNome(pasta, undefined) : undefined;
      const arquivo = await criarDocumento(titulo);
      if (texto) await gravarDocumento(arquivo, texto);

      const id = useSceneStore.getState().addNota({ titulo, arquivo, ...(pastaId ? { pastaId } : {}) });

      return { id, titulo, pasta };
    },
  },
  {
    nome: "editar_nota",
    titulo: t.notas.editar.titulo,
    descricao: t.notas.editar.descricao,
    entrada: {
      type: "object",
      properties: {
        nota: { type: "string", description: t.notas.ler.nota },
        titulo: { type: "string", description: t.notas.editar.tituloNovo },
        texto: { type: "string", description: t.notas.editar.texto },
        acrescentar: { type: "string", description: t.notas.editar.acrescentar },
        pasta: PASTA,
      },
      required: ["nota"],
    },
    async executar(args) {
      const { board } = await campanhaPronta();
      const nota = acharNota(board.notas ?? [], args.texto("nota"));
      const titulo = args.textoOpcional("titulo");
      const texto = args.textoLivre("texto");
      const acrescentar = args.textoLivre("acrescentar");
      const pasta = args.textoOpcional("pasta");

      if (texto !== undefined && acrescentar !== undefined) {
        throw new FalhaDaFerramenta(t.notas.editar.textoOuAcrescentar);
      }

      if (texto !== undefined) await gravarTexto(nota.arquivo, texto);
      if (acrescentar) {
        const atual = (await textoDaNota(nota.arquivo)).replace(/\s+$/, "");
        await gravarTexto(nota.arquivo, atual ? `${atual}\n\n${acrescentar}` : acrescentar);
      }

      const store = useSceneStore.getState();
      if (titulo) store.renomearNota(nota.id, titulo);
      if (pasta) store.moverNotaParaPasta(nota.id, pastaPeloNome(pasta, undefined));

      const depois = boardAtual().notas?.find((atual) => atual.id === nota.id) ?? nota;

      return { id: depois.id, titulo: depois.titulo, pasta: nomeDaPasta(boardAtual(), depois.pastaId) };
    },
  },
];
