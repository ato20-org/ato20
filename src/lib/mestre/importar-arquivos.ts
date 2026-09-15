"use client";

import { toast } from "sonner";

import {
  invalidarAcervo,
  useAssetsStore,
} from "@/lib/store/use-assets-store";
import { importarCaminhos, type ImportResult } from "@/lib/vault/assets";
import type { AssetMeta } from "@/types/scene";

/**
 * O que toda importação faz DEPOIS que o Rust responde.
 *
 * São três telas importando hoje — o botão do acervo, o arquivo solto no mapa e
 * o arquivo solto no painel —, e as três precisam das mesmas duas coisas: dizer
 * o que foi recusado e acordar as listas. Estava copiado em cada uma, e a cópia
 * do palco já tinha divergido: ela recarregava o acervo inteiro, e a do botão
 * só o tipo que a tela mostrava.
 *
 * Um motivo por arquivo, e não uma contagem: quem escolheu doze mapas e teve um
 * recusado quer os onze e quer saber qual.
 *
 * Devolve os ACEITOS porque é o que cada tela faz de diferente com eles — o
 * palco os põe na cena, o painel só os conta.
 */
export function absorverImportacao(resultado: ImportResult): AssetMeta[] {
  for (const motivo of resultado.recusados) toast.error(motivo);

  // Sem `kind`: quem importou pode não saber o que veio -- soltar uma pasta
  // mistura imagem e som --, e o store ignora sozinho o tipo que nenhuma tela
  // aberta leu ainda.
  if (resultado.aceitos.length > 0) useAssetsStore.getState().recarregar();

  return resultado.aceitos;
}

/**
 * Traz caminhos do disco para o acervo, já avisando o que deu errado.
 *
 * Para quem JÁ tem os caminhos na mão: os dois arrastos vindos do sistema
 * operacional. Quem ainda vai perguntar quais arquivos abre o seletor nativo —
 * ver `importAssets`.
 *
 * Nunca lança: a falha vira aviso na tela e a lista de aceitos volta vazia. O
 * gesto é uma mão largando arquivo no meio da sessão, e derrubar a tela por
 * disco cheio custaria mais que o arquivo que não entrou.
 */
export async function importarCaminhosNoAcervo(
  caminhos: string[],
): Promise<AssetMeta[]> {
  try {
    // A lista acorda a cada arquivo que entra, e não só no fim do lote: quem
    // largou seis mapas vê o primeiro enquanto os outros ainda copiam.
    return absorverImportacao(
      await importarCaminhos(caminhos, undefined, () => invalidarAcervo()),
    );
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : "Falha ao importar.");

    return [];
  }
}

/**
 * O que a prévia do arrasto escreve.
 *
 * Com um arquivo, o nome dele: é a confirmação de que o que está vindo é o que
 * a mão pegou. Com vários, a contagem — seis nomes empilhados cobririam
 * justamente o lugar onde eles vão cair.
 */
export function rotuloDoArrasto(caminhos: string[]): string {
  if (caminhos.length === 0) return "Soltar aqui";
  if (caminhos.length > 1) return `${caminhos.length} arquivos`;

  // O separador é do sistema de quem opera: barra no Linux e no mac, contrabarra
  // no Windows. Partir pelos dois dá o nome nos três.
  return caminhos[0].split(/[\\/]/).pop() || "Soltar aqui";
}
