"use client";

import { absorverImportacao } from "@/lib/mestre/importar-arquivos";
import {
  criarResolvedor,
  nomeDoArquivo,
  pastaDoArquivo,
  pastasDe,
  semExtensao,
} from "@/lib/obsidian/caminhos";
import { converterCanvas, type ElementoDoBoard } from "@/lib/obsidian/canvas";
import { converterNota, type AnexoImportado, type ContextoDaNota } from "@/lib/obsidian/markdown";
import { invalidarAcervo } from "@/lib/store/use-assets-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { ESPESSURAS_LAPIS } from "@/lib/store/use-tool-store";
import { importarCaminhos, setAssetFolder } from "@/lib/vault/assets";
import { criarDocumento, gravarDocumento } from "@/lib/vault/documentos";
import { createFolder, pastasMudaram } from "@/lib/vault/folders";
import type { LeituraDeFora } from "@/lib/vault/importar";
import { TAMANHOS_DO_TEXTO, type RefLigacao } from "@/types/scene";

/**
 * Traz para a campanha aberta o que se escolheu importar, já lido: um vault do
 * Obsidian, uma pasta qualquer de notas ou arquivos soltos.
 *
 * Os três pelo mesmo caminho, e com a mesma conversão: o markdown do Obsidian
 * é o markdown comum com `[[ ]]` a mais, e numa nota que não os tem a
 * conversão não muda nada. Ver `converterNota`.
 *
 * Cópia, sem vínculo: a origem não é tocada, e importar de novo cria outra
 * pasta. A pasta escolhida entra numa pasta com o nome dela -- em Arquivos e
 * no acervo --, com as subpastas espelhadas dentro, e apagar o import é apagar
 * uma pasta. Arquivos soltos entram na raiz.
 *
 * Pelas MESMAS ações que os botões usam (`criarPasta`, `addNota`,
 * `importarCaminhos`, `addScene`...), e não por uma escrita própria no disco:
 * a sessão aberta vê cada coisa chegar, e o que chega é exatamente o que o
 * mestre teria criado à mão.
 *
 * A ordem é a das dependências: os anexos primeiro, porque é o nome de cada um
 * no acervo que a menção da nota escreve; as notas depois, porque o cartão do
 * quadro aponta para a nota criada; os quadros por último.
 *
 * Um arquivo que falha entra na lista de falhas e o resto segue: um vault de
 * duzentas notas não pode parar na trigésima por causa de uma.
 */

export type ResultadoDoImport = {
  notas: number;
  anexos: number;
  quadros: number;
  /** Caminhos no vault do que não entrou. */
  falhas: string[];
  /** O mestre parou a cópia dos anexos no meio. */
  cancelado: boolean;
};

/** Cria a árvore de pastas e devolve o id de cada uma pelo caminho. `""` é a raiz. */
async function espelharPastas(
  caminhos: readonly string[],
  raiz: string,
  criar: (nome: string, mae: string) => Promise<string> | string,
): Promise<Map<string, string | undefined>> {
  const ids = new Map<string, string | undefined>([["", raiz]]);

  for (const pasta of pastasDe(caminhos)) {
    ids.set(pasta, await criar(nomeDoArquivo(pasta), ids.get(pastaDoArquivo(pasta)) ?? raiz));
  }

  return ids;
}

/** Sem pasta nenhuma: tudo na raiz. É o caso dos arquivos soltos. */
const NA_RAIZ: ReadonlyMap<string, string | undefined> = new Map();

export async function importarDeFora(leitura: LeituraDeFora): Promise<ResultadoDoImport> {
  const cenas = useSceneStore.getState();
  const falhas: string[] = [];
  // Arquivos soltos não têm pasta: nada se espelha. Ver `ler_arquivos`.
  const soltos = !leitura.nome;

  // --- anexos -------------------------------------------------------------

  const anexos = new Map<string, AnexoImportado>();
  const assetIds = new Map<string, string>();
  let cancelado = false;

  if (leitura.anexos.length > 0) {
    const pastasDoAcervo = soltos
      ? NA_RAIZ
      : await espelharPastas(
          leitura.anexos.map((anexo) => anexo.caminho),
          (await createFolder(leitura.nome)).id,
          async (nome, mae) => (await createFolder(nome, mae)).id,
        );

    const porOrigem = new Map(leitura.anexos.map((anexo) => [anexo.absoluto, anexo.caminho]));
    const resultado = await importarCaminhos(
      leitura.anexos.map((anexo) => anexo.absoluto),
      undefined,
      (asset, origem) => {
        const caminho = porOrigem.get(origem);
        if (caminho) {
          anexos.set(caminho, { nome: asset.name, tipo: asset.kind });
          assetIds.set(caminho, asset.id);
        }
        invalidarAcervo();
      },
    );
    cancelado = resultado.cancelado;

    // Em série: cada chamada reescreve o índice do acervo inteiro.
    for (const [caminho, id] of assetIds) {
      const pasta = pastasDoAcervo.get(pastaDoArquivo(caminho));
      if (!pasta) continue;
      try {
        await setAssetFolder(id, pasta);
      } catch {
        // Fora da pasta não é perder o arquivo: ele está no acervo, na raiz.
      }
    }

    for (const anexo of leitura.anexos)
      if (!assetIds.has(anexo.caminho)) falhas.push(anexo.caminho);

    absorverImportacao(resultado);
    pastasMudaram();
  }

  // --- notas --------------------------------------------------------------

  const pastas = soltos
    ? NA_RAIZ
    : await espelharPastas(
        [...leitura.notas, ...leitura.boards].map((arquivo) => arquivo.caminho),
        cenas.criarPasta(leitura.nome),
        (nome, mae) => cenas.criarPasta(nome, mae),
      );

  const contexto: ContextoDaNota = {
    resolver: criarResolvedor([
      ...leitura.notas.map((nota) => nota.caminho),
      ...leitura.boards.map((board) => board.caminho),
      ...leitura.anexos.map((anexo) => anexo.caminho),
    ]),
    anexo: (caminho) => anexos.get(caminho) ?? null,
  };

  const notas = new Map<string, { notaId: string; titulo: string; arquivo: string }>();

  for (const nota of leitura.notas) {
    const titulo = semExtensao(nota.caminho);
    try {
      const arquivo = await criarDocumento(titulo);
      await gravarDocumento(arquivo, converterNota(nota.texto, nota.caminho, contexto));
      const notaId = cenas.addNota({
        titulo,
        arquivo,
        pastaId: pastas.get(pastaDoArquivo(nota.caminho)),
      });
      notas.set(nota.caminho, { notaId, titulo, arquivo });
    } catch {
      falhas.push(nota.caminho);
    }
  }

  // --- quadros ------------------------------------------------------------

  let quadros = 0;

  for (const board of leitura.boards) {
    const plano = converterCanvas(board.texto, {
      ehNota: (caminho) => notas.has(caminho),
      anexo: (caminho) => anexos.get(caminho) ?? null,
      converterTexto: (texto) => converterNota(texto, board.caminho, contexto),
    });

    const sceneId = cenas.addScene(semExtensao(board.caminho), "quadro");
    cenas.moverParaPasta(sceneId, pastas.get(pastaDoArquivo(board.caminho)));
    quadros += 1;

    const refs = new Map<string, Omit<RefLigacao, "lado">>();
    for (const elemento of plano.elementos) {
      const ref = criarElemento(sceneId, elemento, notas, assetIds);
      if (ref) refs.set(elemento.no, ref);
    }

    for (const seta of plano.setas) {
      const de = refs.get(seta.de);
      const para = refs.get(seta.para);
      if (!de || !para) continue;

      const id = cenas.addLigacao(
        sceneId,
        seta.ladoDe ? { ...de, lado: seta.ladoDe } : de,
        seta.ladoPara ? { ...para, lado: seta.ladoPara } : para,
      );
      if (id && seta.rotulo) cenas.updateLigacao(sceneId, id, { rotulo: seta.rotulo });
    }
  }

  return { notas: notas.size, anexos: assetIds.size, quadros, falhas, cancelado };
}

/** O elemento do plano no quadro, e a âncora para as setas presas a ele. */
function criarElemento(
  sceneId: string,
  elemento: ElementoDoBoard,
  notas: ReadonlyMap<string, { notaId: string; titulo: string; arquivo: string }>,
  assetIds: ReadonlyMap<string, string>,
): Omit<RefLigacao, "lado"> | null {
  const cenas = useSceneStore.getState();
  const { x, y, largura, altura } = elemento;

  switch (elemento.tipo) {
    case "cartao": {
      const nota = notas.get(elemento.nota);
      if (!nota) return null;
      return { tipo: "documento", id: cenas.addDocumento(sceneId, { x, y, largura, altura, ...nota }) };
    }

    case "imagem": {
      const assetId = assetIds.get(elemento.anexo);
      if (!assetId) return null;
      return { tipo: "item", id: cenas.addItem(sceneId, { assetId, x, y, width: largura, height: altura }) };
    }

    case "postit":
      return {
        tipo: "postit",
        id: cenas.addPostit(sceneId, { x, y, largura, altura, texto: elemento.texto, cor: elemento.cor }),
      };

    case "grupo": {
      // O rótulo em cima da moldura, encostado no canto, como o Obsidian o
      // desenha. Antes do retângulo, que é quem as setas prendem.
      if (elemento.rotulo)
        cenas.addTexto(sceneId, {
          x,
          y: y - TAMANHOS_DO_TEXTO.S * 1.6,
          texto: elemento.rotulo,
          tamanho: TAMANHOS_DO_TEXTO.S,
        });

      return {
        tipo: "forma",
        id: cenas.addForma(sceneId, {
          tipo: "retangulo",
          x,
          y,
          width: largura,
          height: altura,
          rotation: 0,
          espessura: ESPESSURAS_LAPIS[0],
        }),
      };
    }
  }
}
