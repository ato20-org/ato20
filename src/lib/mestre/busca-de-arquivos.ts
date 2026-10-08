/**
 * A busca da aba Arquivos: quadros, notas e pastas, pelo nome e pelo que está
 * escrito dentro.
 *
 * Pura e sem React: a lista entra, os achados saem na ordem da árvore, cada um
 * com a profundidade em que aparece e o trecho em que o termo foi achado.
 * Quem desenha é `ArquivosList`.
 */

import { normaliza, ocorrencias } from "@/lib/search";
import type { AssetMeta, Nota, Pasta, Scene } from "@/types/scene";

/** O pedaço do texto em volta do achado, com o achado separado para o destaque. */
export type Trecho = { antes: string; achado: string; depois: string };

export type Achado =
  | { tipo: "pasta"; pasta: Pasta; depth: number; total: number }
  | { tipo: "cena"; scene: Scene; depth: number; trecho?: Trecho }
  | { tipo: "nota"; nota: Nota; depth: number; trecho?: Trecho }
  | { tipo: "acervo"; asset: AssetMeta; depth: number };

/** Quanto texto vai de cada lado do achado no trecho. A linha do painel é estreita. */
const EM_VOLTA = 24;

/** A primeira vez que o termo aparece. Ver `ocorrencias`. */
function acharEm(texto: string, termo: string): { inicio: number; fim: number } | null {
  return ocorrencias(texto, termo)[0] ?? null;
}

/**
 * O trecho do texto em volta do termo, ou `null` se ele não está lá.
 *
 * Numa linha só: a quebra vira espaço, porque o trecho é uma linha do painel.
 * Cortado em palavra inteira quando dá, com reticências do lado que foi cortado.
 */
export function trechoCom(texto: string, termo: string): Trecho | null {
  const achado = acharEm(texto, termo);
  if (!achado) return null;

  const plano = (pedaco: string) => pedaco.replace(/\s+/g, " ");

  let comeco = Math.max(0, achado.inicio - EM_VOLTA);
  let final = Math.min(texto.length, achado.fim + EM_VOLTA);
  // Até o espaço mais próximo, para não abrir o trecho no meio de uma palavra.
  if (comeco > 0) {
    const espaco = texto.indexOf(" ", comeco);
    if (espaco >= 0 && espaco < achado.inicio) comeco = espaco + 1;
  }
  if (final < texto.length) {
    const espaco = texto.lastIndexOf(" ", final);
    if (espaco > achado.fim) final = espaco;
  }

  return {
    antes: (comeco > 0 ? "…" : "") + plano(texto.slice(comeco, achado.inicio)).trimStart(),
    achado: plano(texto.slice(achado.inicio, achado.fim)),
    depois: plano(texto.slice(achado.fim, final)).trimEnd() + (final < texto.length ? "…" : ""),
  };
}

/** Os textos de dentro de um quadro, na ordem em que valem: postit, texto solto, cartão. */
function textosDoQuadro(scene: Scene): string[] {
  return [
    ...(scene.postits ?? []).map((postit) => postit.texto),
    ...(scene.textos ?? []).map((texto) => texto.texto),
    ...(scene.documentos ?? []).map((documento) => documento.titulo),
  ];
}

/**
 * Os achados, na ordem da árvore.
 *
 * - Quadro: pelo nome, ou pelo texto de um postit, de um texto solto ou pelo
 *   título de um cartão.
 * - Nota: pelo título, ou pelo texto -- o que estiver em `textos`, que é o
 *   que já foi lido. Nota ainda não lida acha só pelo título.
 * - Pasta: pelo nome, e aí vem com tudo o que tem dentro, como se aberta.
 *
 * As pastas de quem foi achado aparecem ABERTAS, mesmo recolhidas na árvore:
 * o achado dentro de uma pasta fechada seria um achado que não se vê.
 *
 * Achado pelo nome não leva trecho: o nome já está na linha. O trecho é para
 * o que foi achado DENTRO.
 */
export function buscarArquivos(
  { quadros, pastas, notas, textos, acervo = [] }: {
    quadros: Scene[];
    pastas: Pasta[];
    notas: Nota[];
    textos: Record<string, string | undefined>;
    /** Os arquivos do acervo na árvore: achados pelo nome, que é o que têm. */
    acervo?: AssetMeta[];
  },
  busca: string,
): Achado[] {
  const termo = normaliza(busca.trim());
  if (termo === "") return [];

  const nomeTem = (nome: string) => normaliza(nome).includes(termo);
  const existe = new Set(pastas.map((pasta) => pasta.id));
  const pastaDe = (coisa: { pastaId?: string }) =>
    coisa.pastaId && existe.has(coisa.pastaId) ? coisa.pastaId : undefined;

  const quadroAchado = new Map<string, Trecho | undefined>();
  for (const scene of quadros) {
    if (nomeTem(scene.name)) {
      quadroAchado.set(scene.id, undefined);
      continue;
    }
    for (const texto of textosDoQuadro(scene)) {
      const trecho = trechoCom(texto, termo);
      if (trecho) {
        quadroAchado.set(scene.id, trecho);
        break;
      }
    }
  }

  const notaAchada = new Map<string, Trecho | undefined>();
  for (const nota of notas) {
    if (nomeTem(nota.titulo)) {
      notaAchada.set(nota.id, undefined);
      continue;
    }
    const texto = textos[nota.arquivo];
    const trecho = texto === undefined ? null : trechoCom(texto, termo);
    if (trecho) notaAchada.set(nota.id, trecho);
  }

  const acervoAchado = new Set(
    acervo.filter((asset) => nomeTem(asset.name)).map((asset) => asset.id),
  );
  const pastaDoArquivo = (asset: AssetMeta) =>
    asset.folderId && existe.has(asset.folderId) ? asset.folderId : undefined;

  const pastaAchada = new Set(pastas.filter((pasta) => nomeTem(pasta.nome)).map((pasta) => pasta.id));

  // Uma pasta aparece se foi achada, se está dentro de uma achada, ou se tem
  // achado lá dentro. A de dentro vem descendo -- `tudo` em `nivel` --, e a
  // que tem achado é marcada subindo de cada achado até a raiz.
  const mae = new Map(pastas.map((pasta) => [pasta.id, pasta.parentId]));
  const comAchado = new Set<string>();
  const marcarSubindo = (pastaId: string | undefined) => {
    for (let atual = pastaId; atual && !comAchado.has(atual); atual = mae.get(atual))
      comAchado.add(atual);
  };
  for (const scene of quadros) if (quadroAchado.has(scene.id)) marcarSubindo(pastaDe(scene));
  for (const nota of notas) if (notaAchada.has(nota.id)) marcarSubindo(pastaDe(nota));
  for (const asset of acervo) if (acervoAchado.has(asset.id)) marcarSubindo(pastaDoArquivo(asset));
  for (const id of pastaAchada) marcarSubindo(id);

  function contar(pastaId: string): number {
    let total =
      quadros.filter((scene) => pastaDe(scene) === pastaId).length +
      notas.filter((nota) => pastaDe(nota) === pastaId).length +
      acervo.filter((asset) => pastaDoArquivo(asset) === pastaId).length;
    for (const filha of pastas) if (filha.parentId === pastaId) total += contar(filha.id);
    return total;
  }

  const achados: Achado[] = [];

  function nivel(parentId: string | undefined, depth: number, tudo: boolean) {
    for (const pasta of pastas) {
      if (pasta.parentId !== parentId) continue;
      const inteira = tudo || pastaAchada.has(pasta.id);
      if (!inteira && !comAchado.has(pasta.id)) continue;
      achados.push({ tipo: "pasta", pasta, depth, total: contar(pasta.id) });
      nivel(pasta.id, depth + 1, inteira);
    }
    for (const scene of quadros) {
      if (pastaDe(scene) !== parentId) continue;
      if (!tudo && !quadroAchado.has(scene.id)) continue;
      achados.push({ tipo: "cena", scene, depth, trecho: quadroAchado.get(scene.id) });
    }
    for (const nota of [...notas].sort((a, b) => a.titulo.localeCompare(b.titulo))) {
      if (pastaDe(nota) !== parentId) continue;
      if (!tudo && !notaAchada.has(nota.id)) continue;
      achados.push({ tipo: "nota", nota, depth, trecho: notaAchada.get(nota.id) });
    }
    for (const asset of [...acervo].sort((a, b) => a.name.localeCompare(b.name))) {
      if (pastaDoArquivo(asset) !== parentId) continue;
      if (!tudo && !acervoAchado.has(asset.id)) continue;
      achados.push({ tipo: "acervo", asset, depth });
    }
  }

  nivel(undefined, 0, false);
  return achados;
}
