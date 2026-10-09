"use client";

import type { CamposDoPdf, ValorDeCampo } from "@/lib/fichas-pdf/traduzir";
import { pdfjs, RUNTIME } from "@/lib/leitor/pdfjs";
import { call } from "@/lib/vault/bridge";

/**
 * O formulário de uma ficha em PDF, campo a campo.
 *
 * Pelas ANOTAÇÕES de cada página, e não por `getFieldObjects`: o segundo volta
 * vazio em ficha que o pdf.js lê inteira pelo primeiro (a D&D 5E editável, a
 * do Ordem feita no DocFly), e o widget tem tudo o que importa -- o nome
 * completo do campo, o valor, e se a caixa está marcada.
 *
 * O PDF chega pelo IPC em bytes (`ficha_pdf_ler`), e não por URL: o arquivo é
 * de fora da campanha, e o daemon só serve o que é dela.
 */
export async function lerCamposDaFicha(caminho: string): Promise<CamposDoPdf> {
  const [mod, bytes] = await Promise.all([
    pdfjs(),
    call<ArrayBuffer>("ficha_pdf_ler", { caminho }),
  ]);
  // Quem se destrói é a TAREFA, e não o documento: é ela que segura o worker.
  // Ver `use-capa-do-livro.ts`.
  const tarefa = mod.getDocument({ data: new Uint8Array(bytes), ...RUNTIME });

  try {
    const doc = await tarefa.promise;
    const anotacoes: AnotacaoDeCampo[] = [];
    for (let pagina = 1; pagina <= doc.numPages; pagina++) {
      anotacoes.push(...((await (await doc.getPage(pagina)).getAnnotations()) as AnotacaoDeCampo[]));
    }

    return camposDasAnotacoes(anotacoes);
  } finally {
    void tarefa.destroy();
  }
}

/** O que importa de uma anotação do pdf.js. O tipo dele é `any`. */
export type AnotacaoDeCampo = {
  subtype?: string;
  fieldName?: string;
  /** `Tx` texto, `Btn` botão (caixa, rádio, ação), `Ch` escolha, `Sig` assinatura. */
  fieldType?: string;
  fieldValue?: unknown;
  checkBox?: boolean;
  radioButton?: boolean;
  pushButton?: boolean;
  /** O valor que a caixa tem quando MARCADA: `Yes`, `Sim`, `On`. */
  exportValue?: string;
};

/**
 * Os campos, das anotações de todas as páginas.
 *
 * O mesmo campo pode ter vários widgets -- o nome do personagem repetido no
 * topo de cada página, as opções de um rádio. Vale o primeiro que diz alguma
 * coisa: o vazio não apaga o preenchido, e a caixa marcada não é desmarcada
 * pela irmã.
 */
export function camposDasAnotacoes(anotacoes: readonly AnotacaoDeCampo[]): Map<string, ValorDeCampo> {
  const campos = new Map<string, ValorDeCampo>();

  for (const anotacao of anotacoes) {
    if (anotacao.subtype !== "Widget" || !anotacao.fieldName) continue;

    const valor = valorDoWidget(anotacao);
    if (valor === null) continue;

    const antes = campos.get(anotacao.fieldName);
    if (antes === undefined || antes === "" || antes === false) campos.set(anotacao.fieldName, valor);
  }

  return campos;
}

function valorDoWidget(anotacao: AnotacaoDeCampo): ValorDeCampo | null {
  const { fieldType, fieldValue } = anotacao;

  if (fieldType === "Btn") {
    // O botão de ação ("Resetar", "Imprimir") não guarda nada.
    if (anotacao.pushButton) return null;

    const marcado = typeof fieldValue === "string" && fieldValue !== "" && fieldValue !== "Off";
    if (anotacao.radioButton) return marcado ? fieldValue : "";

    return marcado && (!anotacao.exportValue || fieldValue === anotacao.exportValue);
  }

  if (fieldType === "Tx" || fieldType === "Ch") {
    if (Array.isArray(fieldValue)) return fieldValue.filter((item) => typeof item === "string").join(", ");

    return typeof fieldValue === "string" ? fieldValue : "";
  }

  return null;
}
