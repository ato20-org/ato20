"use client";

import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import {
  ehQuadro,
  patchDaFamilia,
  TEXTO_TAMANHO,
  type NewTexto,
} from "@/types/scene";
import { padraoDoQuadro } from "@/lib/configuracoes/quadro";

/**
 * Texto vindo de FORA do app -- do editor, do navegador, do PDF -- vira um
 * texto solto no meio da vista. Só no quadro: no mapa, texto colado do nada
 * seria anotação que a toolbar não oferece e que a mesa não vê.
 *
 * Chega pelo evento `paste`, e não por `navigator.clipboard.readText()`: o
 * evento traz o texto de graça e na hora, sem permissão nem promessa, e é o
 * caminho que o WebKitGTK sempre teve.
 *
 * Copiar, cortar, colar e duplicar o texto do PRÓPRIO quadro não moram mais
 * aqui: o texto anda junto com a imagem na mesma seleção, e as quatro ações
 * são as de `item-actions`, que agora tratam as duas listas.
 */
/**
 * Os campos com que o PRÓXIMO texto nasce: o que o painel de texto escolheu,
 * e a família da campanha quando ele não escolheu nenhuma -- a letra de mão do
 * quadro, que é como o texto sempre nasceu. O que é padrão não vira campo.
 *
 * Um lugar só para os três jeitos de nascer um texto: a ferramenta T, o duplo
 * clique no quadro e o texto colado de fora.
 */
export function camposDoTextoNovo(): Omit<NewTexto, "x" | "y"> {
  const { textoNovo } = useToolStore.getState();
  const { familia, tamanho, ...resto } = textoNovo;
  const daFamilia = patchDaFamilia(
    familia ?? (padraoDoQuadro().aMao ? "mao" : "interface"),
  );

  return Object.fromEntries(
    Object.entries({
      ...resto,
      ...daFamilia,
      tamanho: tamanho === TEXTO_TAMANHO ? undefined : tamanho,
    }).filter(([, valor]) => valor !== undefined),
  ) as Omit<NewTexto, "x" | "y">;
}

export function colarTextoDoSistema(bruto: string): boolean {
  const texto = bruto.replace(/\r\n?/g, "\n").trimEnd();
  const scene = selectEditingScene(useSceneStore.getState());
  if (!texto.trim() || !scene || !ehQuadro(scene)) return false;

  const { viewport } = useViewportStore.getState();
  const id = useSceneStore.getState().addTexto(scene.id, {
    texto,
    x: Math.round(viewport.x + viewport.width / 2),
    y: Math.round(viewport.y + viewport.height / 2),
    ...camposDoTextoNovo(),
  });
  useSelectionStore.getState().selectTextos([id]);
  return true;
}
