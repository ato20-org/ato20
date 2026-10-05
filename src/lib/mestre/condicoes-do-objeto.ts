import {
  ajustarCondicao,
  alternarNaLista,
  aplicarPatch,
  reordenarLista,
} from "@/lib/condicao";
import { novoId } from "@/lib/id";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import { MAX_CONDICOES, type Condicao, type PatchCondicao } from "@/types/character";
import type { CanvasItem } from "@/types/scene";

/**
 * As condições de um OBJETO: o barril em chamas, a porta amaldiçoada.
 *
 * O espelho das do personagem, com uma diferença de endereço: elas moram no
 * item, na cena (`CanvasItem.condicoes`), e não no índice. Então quem grava é
 * o store da cena e não o Rust -- o que dá a elas o Ctrl+Z que a do
 * personagem não tem --, e a forma de cada uma é a de `ajustarCondicao`, o
 * espelho da conta do Rust.
 *
 * Sempre na cena EM EDIÇÃO, como as outras ações do mestre. Cada chamada é UM
 * `updateItems`: marcar "Em chamas" em cinco barris é um passo de desfazer.
 */

/** Item sem personagem: o que esta conta chama de objeto. */
export function ehObjeto(item: Pick<CanvasItem, "personagemId">): boolean {
  return !item.personagemId;
}

/** Os objetos da cena em edição com estes ids, e a cena. */
function lerObjetos(ids: ReadonlyArray<string>) {
  const scene = selectEditingScene(useSceneStore.getState());
  const objetos = scene
    ? scene.items.filter((item) => ids.includes(item.id) && ehObjeto(item))
    : [];

  return { scene, objetos };
}

/** Lista vazia vira campo ausente, a convenção do arquivo. */
function campo(lista: Condicao[]): Pick<CanvasItem, "condicoes"> {
  return { condicoes: lista.length > 0 ? lista : undefined };
}

function gravar(sceneId: string, mudancas: Array<{ id: string; lista: Condicao[] }>): void {
  if (mudancas.length === 0) return;

  useSceneStore.getState().updateItems(
    sceneId,
    mudancas.map(({ id, lista }) => ({ id, patch: campo(lista) })),
  );
}

/**
 * Liga ou desliga uma condição do cardápio em vários objetos, pelo nome. O
 * mesmo gesto e as mesmas regras de `alternarCondicao` do personagem: não
 * duplica, pula quem está cheio, desligar tira pelo nome.
 *
 * Devolve quantos objetos mudaram.
 */
export function alternarCondicaoNosObjetos(
  ids: ReadonlyArray<string>,
  modelo: Condicao,
  ligar: boolean,
): number {
  const { scene, objetos } = lerObjetos(ids);
  if (!scene) return 0;

  const mudancas = objetos.flatMap((item) => {
    const lista = alternarNaLista(item.condicoes, modelo, ligar, novoId);
    return lista ? [{ id: item.id, lista }] : [];
  });
  gravar(scene.id, mudancas);

  return mudancas.length;
}

/** Cria uma condição avulsa no fim da lista do objeto. `false` = cheio. */
export function criarCondicaoNoObjeto(
  id: string,
  condicao: Omit<Condicao, "id" | "escondido">,
): boolean {
  const { scene, objetos } = lerObjetos([id]);
  const item = objetos[0];
  if (!scene || !item) return false;

  const atual = item.condicoes ?? [];
  if (atual.length >= MAX_CONDICOES) return false;

  gravar(scene.id, [
    { id, lista: [...atual, ajustarCondicao({ ...condicao, id: novoId(), escondido: false })] },
  ]);

  return true;
}

export function editarCondicaoDoObjeto(
  id: string,
  condicaoId: string,
  patch: PatchCondicao,
): void {
  const { scene, objetos } = lerObjetos([id]);
  const item = objetos[0];
  if (!scene || !item?.condicoes) return;

  gravar(scene.id, [
    {
      id,
      lista: item.condicoes.map((condicao) =>
        condicao.id === condicaoId ? aplicarPatch(condicao, patch) : condicao,
      ),
    },
  ]);
}

export function removerCondicaoDoObjeto(id: string, condicaoId: string): void {
  const { scene, objetos } = lerObjetos([id]);
  const item = objetos[0];
  if (!scene || !item?.condicoes) return;

  gravar(scene.id, [
    { id, lista: item.condicoes.filter((condicao) => condicao.id !== condicaoId) },
  ]);
}

export function reordenarCondicoesDoObjeto(id: string, ordem: ReadonlyArray<string>): void {
  const { scene, objetos } = lerObjetos([id]);
  const item = objetos[0];
  if (!scene || !item?.condicoes) return;

  gravar(scene.id, [{ id, lista: reordenarLista(item.condicoes, ordem) }]);
}
