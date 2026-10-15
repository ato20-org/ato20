"use client";

import type { DadoCaido } from "@/lib/extensoes/dados";
import { gravadoDoValor } from "@/lib/fio";
import { t } from "@/lib/i18n/palco";
import { falarNoFio } from "@/lib/mestre/fio-actions";
import { useFioStore } from "@/lib/store/use-fio-store";
import { TIPOS_DADO } from "@/types/dado";
import type { LinhaDoFio } from "@/types/fio";

/**
 * O fio da campanha, como o plugin o alcança (`api.chat`, API 4).
 *
 * GENÉRICO de propósito, como decidido no #61: o aplicativo registra a linha
 * que o plugin mandar — "Ataque: 1d20+3 = 17" —, e a regra do ataque (de onde
 * veio o +3, contra qual CA) fica no plugin. O fio não interpreta nada.
 */

/** O que um plugin põe no fio. Texto, rolagem, ou os dois. */
export type LinhaDePlugin = {
  texto?: string;
  /**
   * Os dados que caíram: o que `api.dados.rolar` devolveu, passado adiante.
   * O `valor` é o de SOMA, como o plugin o recebe (o d10 no zero vale dez).
   */
  rolagem?: { dados: readonly DadoCaido[] };
  /** "+3": a conta do plugin, que o fio soma ao total. */
  modificador?: number;
  /** O nome da jogada: "Ataque", "Teste de Furtividade". */
  rotulo?: string;
  /** Só para o Mestre: a rolagem escondida, a nota que a mesa não vê. */
  privado?: boolean;
};

/** Uma linha do fio, como o plugin a lê. */
export type LinhaLida = Readonly<LinhaDoFio>;

const FACES = new Set<number>(TIPOS_DADO.map((tipo) => tipo.faces));

/**
 * Escreve no fio em nome do plugin. Resolve com a linha gravada; rejeita com
 * o motivo (rolagem malformada, mesa fechada) para quem escreveu o plugin.
 *
 * O id e o nome do plugin entram aqui, e não vêm dele: um plugin não assina
 * pelo outro.
 */
export async function postarParaPlugin(
  extensao: { id: string; nome: string },
  linha: LinhaDePlugin,
): Promise<LinhaLida> {
  const texto = typeof linha.texto === "string" ? linha.texto : undefined;

  let rolagem;
  if (linha.rolagem !== undefined) {
    const dados = linha.rolagem?.dados;
    if (
      !Array.isArray(dados) ||
      !dados.every((dado) => FACES.has(dado?.faces) && Number.isInteger(dado?.valor))
    )
      throw new Error(t.apiDePlugin.rolagemInvalida);

    rolagem = {
      // O fio guarda o GRAVADO, como toda rolagem da casa. Ver `gravadoDoValor`.
      dados: dados.map((dado) => ({
        faces: dado.faces,
        valor: gravadoDoValor(dado.faces, dado.valor),
      })),
      modificador: Number.isInteger(linha.modificador) ? linha.modificador : undefined,
      rotulo: typeof linha.rotulo === "string" ? linha.rotulo : undefined,
    };
  }

  if (!texto?.trim() && !rolagem)
    throw new Error(t.apiDePlugin.linhaVazia);

  return falarNoFio({
    texto,
    rolagem,
    para: linha.privado ? { tipo: "mestre" } : undefined,
    plugin: { id: extensao.id, nome: extensao.nome },
  });
}

/**
 * Avisa a cada linha nova do fio — a de qualquer um, a do próprio plugin
 * inclusive (o `autor` diz de quem é). Só o que acontece AGORA: o replay da
 * conversa de ontem não acorda ninguém.
 */
export function assinarFioParaPlugin(aviso: (linha: LinhaLida) => void): () => void {
  return useFioStore.subscribe((estado, antes) => {
    if (estado.aoVivo === antes.aoVivo) return;

    for (const linha of estado.linhas)
      if (estado.aoVivo.has(linha.id) && !antes.aoVivo.has(linha.id)) aviso(linha);
  });
}
