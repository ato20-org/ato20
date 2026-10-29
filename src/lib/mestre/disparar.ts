"use client";

import { disparoPeloOlhar, novoDisparo } from "@/lib/disparo-de-efeito";
import { definicaoDoEfeito } from "@/lib/efeitos";
import type { Vec } from "@/lib/geometry/transform";
import { novoId } from "@/lib/id";
import { useDeclarativoStore } from "@/lib/store/use-declarativo-store";
import { useDisparosStore } from "@/lib/store/use-disparos-store";
import { useEfeitosDaCampanhaStore } from "@/lib/store/use-efeitos-da-campanha-store";
import type { CanvasItem, Scene } from "@/types/scene";

/**
 * De onde vem o efeito do tiro: o id dele, e se é do Compêndio do ATO20. O
 * molde do Compêndio da campanha também chega pelo id -- é o `paraOJogo` que
 * sabe a diferença. Ver `ToolStore.efeitoDoDisparo`.
 */
export type FonteDoDisparo = { id: string; doAto20?: boolean };

/**
 * O efeito do tiro EM JOGO, e a definição dele: o molde do Compêndio vai ao
 * jogo como cópia, como no arrasto até um token -- a TV só desenha o que está
 * em jogo, e o tiro precisa das imagens lá. `null` quando não foi (os trinta e
 * dois cheios: o store já disse por quê).
 */
async function efeitoEmJogo(fonte: FonteDoDisparo) {
  const id = await useEfeitosDaCampanhaStore.getState().paraOJogo(fonte.id, fonte.doAto20);
  if (!id) return null;

  return { id, definicao: definicaoDoEfeito(id, useDeclarativoStore.getState().efeitos) };
}

/**
 * Atira o efeito de `de` até `para`, na cena: o tiro entra na bandeja, que o
 * Mestre desenha na hora e publica à mesa se a cena estiver no ar. Os pontos
 * já vêm como o mestre os quer -- encaixados nos personagens, travados pelo
 * Shift. Ver `pontosDoDisparo`.
 */
export async function disparar(
  fonte: FonteDoDisparo,
  scene: Pick<Scene, "id" | "grid">,
  de: Vec,
  para: Vec,
): Promise<void> {
  const efeito = await efeitoEmJogo(fonte);
  if (!efeito) return;

  const disparo = novoDisparo({
    id: novoId(),
    cenaId: scene.id,
    efeito: efeito.id,
    definicao: efeito.definicao,
    grid: scene.grid,
    de,
    para,
    quando: Date.now(),
  });
  if (disparo) useDisparosStore.getState().registrar(disparo);
}

/**
 * Cada token atira para onde OLHA, até o alcance do efeito: o "Disparar" do
 * botão direito. A seleção inteira de uma vez -- a rajada dos arqueiros --,
 * como as condições. Ver `disparoPeloOlhar`.
 */
export async function dispararPeloOlhar(
  fonte: FonteDoDisparo,
  scene: Pick<Scene, "id" | "grid">,
  itens: ReadonlyArray<CanvasItem>,
): Promise<void> {
  const efeito = await efeitoEmJogo(fonte);
  if (!efeito) return;

  const quando = Date.now();
  for (const item of itens) {
    const { de, para } = disparoPeloOlhar(item, efeito.definicao, scene.grid);
    const disparo = novoDisparo({
      id: novoId(),
      cenaId: scene.id,
      efeito: efeito.id,
      definicao: efeito.definicao,
      grid: scene.grid,
      de,
      para,
      quando,
    });
    if (disparo) useDisparosStore.getState().registrar(disparo);
  }
}
