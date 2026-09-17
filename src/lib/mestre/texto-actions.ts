import { PASTE_OFFSET } from "@/lib/mestre/item-actions";
import { useClipboardStore } from "@/lib/store/use-clipboard-store";
import { useQuadroStore } from "@/lib/store/use-quadro-store";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import { ehQuadro } from "@/types/scene";
import type { Texto } from "@/types/scene";

/**
 * Copiar, colar e duplicar o TEXTO SOLTO do quadro, pelos mesmos atalhos dos
 * itens. Cada função devolve se agiu: os atalhos tentam o texto antes do item,
 * porque texto selecionado e item selecionado não coexistem -- selecionar um
 * limpa o outro -- e quando há texto na mão é dele que o mestre fala.
 */

/** O texto selecionado, se há um e ele não está em edição (aí o Ctrl+C é do campo). */
function textoNaMao() {
  const quadro = useQuadroStore.getState();
  if (!quadro.textoSelecionadoId || quadro.textoEditandoId) return null;
  const scene = selectEditingScene(useSceneStore.getState());
  const texto = scene?.textos?.find(
    (atual) => atual.id === quadro.textoSelecionadoId,
  );
  return scene && texto ? { scene, texto } : null;
}

/** A cópia deslocada, sem id nem caixa medida. */
function copiaDeslocada(texto: Texto) {
  const copia = { ...texto } as Partial<Texto>;
  delete copia.id;
  delete copia.largura;
  delete copia.altura;
  return { ...copia, x: texto.x + PASTE_OFFSET, y: texto.y + PASTE_OFFSET };
}

export function copiarTexto(): boolean {
  const alvo = textoNaMao();
  if (!alvo) return false;
  useClipboardStore.getState().copyTexto(alvo.texto);
  return true;
}

export function cortarTexto(): boolean {
  const alvo = textoNaMao();
  if (!alvo) return false;
  useClipboardStore.getState().copyTexto(alvo.texto);
  useSceneStore.getState().removeTexto(alvo.scene.id, alvo.texto.id);
  useQuadroStore.getState().selecionarTexto(null);
  return true;
}

export function colarTexto(): boolean {
  const { texto } = useClipboardStore.getState();
  const scene = selectEditingScene(useSceneStore.getState());
  if (!texto || !scene) return false;

  const id = useSceneStore.getState().addTexto(scene.id, {
    ...texto,
    x: texto.x + PASTE_OFFSET,
    y: texto.y + PASTE_OFFSET,
  });
  useQuadroStore.getState().selecionarTexto(id);
  return true;
}

export function duplicarTexto(): boolean {
  const alvo = textoNaMao();
  if (!alvo) return false;
  const novo = useSceneStore
    .getState()
    .addTexto(alvo.scene.id, copiaDeslocada(alvo.texto));
  useQuadroStore.getState().selecionarTexto(novo);
  return true;
}

/**
 * Texto vindo de FORA do app -- do editor, do navegador, do PDF -- vira um
 * texto solto no meio da vista. Só no quadro: no mapa, texto colado do nada
 * seria anotação que a toolbar não oferece e que a mesa não vê.
 *
 * Chega pelo evento `paste`, e não por `navigator.clipboard.readText()`: o
 * evento traz o texto de graça e na hora, sem permissão nem promessa, e é o
 * caminho que o WebKitGTK sempre teve.
 */
export function colarTextoDoSistema(bruto: string): boolean {
  const texto = bruto.replace(/\r\n?/g, "\n").trimEnd();
  const scene = selectEditingScene(useSceneStore.getState());
  if (!texto.trim() || !scene || !ehQuadro(scene)) return false;

  const { viewport } = useViewportStore.getState();
  const id = useSceneStore.getState().addTexto(scene.id, {
    texto,
    x: Math.round(viewport.x + viewport.width / 2),
    y: Math.round(viewport.y + viewport.height / 2),
  });
  useQuadroStore.getState().selecionarTexto(id);
  return true;
}
