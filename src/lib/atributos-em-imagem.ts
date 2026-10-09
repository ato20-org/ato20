import type { LugarDoAtributo } from "@/lib/extensoes/manifesto";
import type { Declarativo, EstiloDeAtributosPublicado } from "@/lib/sync/declarativo";

/**
 * As contas dos atributos desenhados numa imagem, sem React. Quem desenha é
 * `AtributosEmImagem`.
 */

/** O estilo que a campanha escolheu, se algum plugin ligado o declara. */
export function estiloEscolhido(
  declarativo: Pick<Declarativo, "estilosDeAtributos" | "estiloDosAtributos">,
): EstiloDeAtributosPublicado | null {
  const chave = declarativo.estiloDosAtributos;
  if (!chave) return null;

  return declarativo.estilosDeAtributos[chave] ?? null;
}

const chave = (sigla: string) => sigla.trim().toLowerCase();

/**
 * Quem tem lugar na imagem, e quem fica na grade embaixo.
 *
 * A sigla casa sem diferença de caixa, como o Rust confere os lugares: a ficha
 * que escreveu "Agi" acha o círculo do AGI. Duas fichas com a mesma sigla não
 * existem, mas o atributo repetido por edição à mão não pode pôr dois números
 * no mesmo círculo: o primeiro fica com ele, o segundo vai para a grade.
 */
export function repartirAtributos<A extends { sigla: string }>(
  atributos: readonly A[],
  lugares: readonly LugarDoAtributo[],
): { noLugar: Array<{ atributo: A; lugar: LugarDoAtributo }>; fora: A[] } {
  const livres = new Map(lugares.map((lugar) => [chave(lugar.sigla), lugar]));
  const noLugar: Array<{ atributo: A; lugar: LugarDoAtributo }> = [];
  const fora: A[] = [];

  for (const atributo of atributos) {
    const lugar = livres.get(chave(atributo.sigla));
    if (lugar) {
      livres.delete(chave(atributo.sigla));
      noLugar.push({ atributo, lugar });
    } else {
      fora.push(atributo);
    }
  }

  return { noLugar, fora };
}
