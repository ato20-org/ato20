import type { ListaDePastas, Pasta } from "@/types/scene";

/**
 * A árvore de pastas que os painéis desenham: Arquivos, Mapas, Fundos e
 * Personagens.
 *
 * Uma conta só para os quatro, e é o motivo deste arquivo existir: a árvore
 * nasceu no Arquivos, e copiá-la para cada lista nova faria quatro jeitos de
 * uma pasta recolhida esconder o que tem dentro. O que muda de uma lista para
 * a outra é o ITEM e como se sabe em que pasta ele está -- `pastaDe`.
 */

/** Uma linha da árvore achatada: a pasta, ou um item dentro dela. */
export type LinhaDaArvore<T> =
  | { tipo: "pasta"; pasta: Pasta; depth: number; total: number }
  | { tipo: "item"; item: T; depth: number };

/**
 * As pastas de uma lista. Ausente é o Arquivos, e é o que faz a campanha
 * gravada antes das outras listas abrir com as pastas no mesmo lugar.
 */
export function pastasDaLista(
  pastas: Pasta[] | undefined,
  lista: ListaDePastas | undefined,
): Pasta[] {
  return (pastas ?? []).filter((pasta) => pasta.lista === lista);
}

/**
 * A árvore achatada em linhas, na ordem em que aparecem: em cada nível as
 * pastas, depois os itens na ordem recebida. Pasta recolhida esconde as linhas
 * de dentro, mas continua contando. Quem aponta para pasta que sumiu cai na
 * raiz em vez de sumir da lista.
 */
export function achatarArvore<T>(
  itens: T[],
  pastas: Pasta[],
  pastaDe: (item: T) => string | undefined,
): LinhaDaArvore<T>[] {
  const linhas: LinhaDaArvore<T>[] = [];
  const existe = new Set(pastas.map((pasta) => pasta.id));
  const ondeEsta = (item: T) => {
    const pastaId = pastaDe(item);
    return pastaId && existe.has(pastaId) ? pastaId : undefined;
  };

  function contar(pastaId: string): number {
    let total = itens.filter((item) => ondeEsta(item) === pastaId).length;
    for (const filha of pastas)
      if (filha.parentId === pastaId) total += contar(filha.id);
    return total;
  }

  function nivel(parentId: string | undefined, depth: number) {
    for (const pasta of pastas) {
      if (pasta.parentId !== parentId) continue;
      linhas.push({ tipo: "pasta", pasta, depth, total: contar(pasta.id) });
      if (!pasta.recolhido) nivel(pasta.id, depth + 1);
    }
    for (const item of itens)
      if (ondeEsta(item) === parentId) linhas.push({ tipo: "item", item, depth });
  }

  nivel(undefined, 0);
  return linhas;
}

/** A pasta e todas as descendentes dela, por id. */
export function descendentes(pastas: Pasta[], id: string): string[] {
  const ids = [id];
  let cresceu = true;
  while (cresceu) {
    cresceu = false;
    for (const pasta of pastas)
      if (pasta.parentId && ids.includes(pasta.parentId) && !ids.includes(pasta.id)) {
        ids.push(pasta.id);
        cresceu = true;
      }
  }
  return ids;
}

/**
 * O caminho da pasta, da raiz até ela: "Capítulo 2 / Cidade". É o que o achado
 * da busca mostra ao lado do nome -- sem a árvore na tela, é a única pista de
 * onde o item mora.
 */
export function caminhoDaPasta(pastas: Pasta[], id: string | undefined): string {
  const nomes: string[] = [];
  const vistas = new Set<string>();
  let cursor = id;

  while (cursor && !vistas.has(cursor)) {
    vistas.add(cursor);
    const pasta = pastas.find((outra) => outra.id === cursor);
    if (!pasta) break;
    nomes.unshift(pasta.nome);
    cursor = pasta.parentId;
  }

  return nomes.join(" / ");
}

/**
 * Em que pasta da lista está este personagem, pelo `membros` das pastas.
 *
 * Personagem não tem `pastaId` como a cena: ele vive no índice do vault, que é
 * tipado em Rust, e a pasta é organização da mesa do mestre -- mora no board,
 * com as outras. Ver `Pasta.membros`.
 */
export function pastaDoMembro(pastas: Pasta[], membroId: string): string | undefined {
  return pastas.find((pasta) => pasta.membros?.includes(membroId))?.id;
}
