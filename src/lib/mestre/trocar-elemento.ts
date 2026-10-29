"use client";

import {
  caixaDoElemento,
  comFormato,
  comoAreaDeEfeito,
  comoForma,
  comoNevoa,
  comoParede,
  type ElementoDoMapa,
} from "@/lib/mestre/elementos";
import { useSceneStore, type FormaPatch } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useToolStore, type NaturezaDoElemento } from "@/lib/store/use-tool-store";

/**
 * Os dois gestos do painel de Elementos sobre o que está SELECIONADO no mapa:
 * trocar o formato e trocar o tipo. Fora do componente, como `item-actions`,
 * para o teste exercitar os stores de verdade. As contas são de `elementos.ts`.
 */

/**
 * O formato novo nos selecionados, na mesma caixa. Virar laço começa dos
 * cantos do quadrado ou da volta do círculo -- ver `comFormato`.
 */
export function trocarFormato(
  sceneId: string,
  elementos: ElementoDoMapa[],
  formato: "retangulo" | "elipse" | "poligono",
): void {
  const store = useSceneStore.getState();
  const formas: FormaPatch[] = [];

  for (const elemento of elementos) {
    const { pontos } = comFormato(caixaDoElemento(elemento), formato);
    // Ausente é retângulo na área escondida e na de efeito, como elas gravam.
    const daArea = formato === "retangulo" ? undefined : formato;

    switch (elemento.natureza) {
      case "elemento":
        formas.push({ id: elemento.forma.id, patch: { tipo: formato, pontos, diagonal: undefined } });
        break;
      case "parede":
        store.updateParede(sceneId, elemento.parede.id, { formato, pontos, diagonal: undefined });
        break;
      case "area":
        store.updateFog(sceneId, elemento.nevoa.id, { formato: daArea, pontos });
        break;
      case "efeito":
        store.updateAreaDeEfeito(sceneId, elemento.area.id, { formato: daArea, pontos });
        break;
    }
  }

  if (formas.length > 0) store.updateFormas(sceneId, formas);
}

/**
 * O elemento passa a ser de outro tipo, na mesma caixa: tira de uma lista da
 * cena e põe noutra. O que é só do tipo novo nasce do painel, como nasceria
 * desenhado agora -- ver `comoForma` e as irmãs.
 *
 * O novo primeiro, e o velho depois: as duas gravações caem no mesmo passo de
 * desfazer (`COALESCE_MS`), e um Ctrl+Z devolve o que era. A seleção passa ao
 * novo, e o painel continua aberto nele.
 */
export function trocarTipo(sceneId: string, elemento: ElementoDoMapa, destino: NaturezaDoElemento): void {
  if (elemento.natureza === destino) return;

  const caixa = caixaDoElemento(elemento);
  const store = useSceneStore.getState();
  const ferramentas = useToolStore.getState();
  const selecao = useSelectionStore.getState();

  switch (destino) {
    case "elemento":
      selecao.selectFormas([
        store.addForma(
          sceneId,
          comoForma(caixa, {
            cor: ferramentas.corForma,
            espessura: ferramentas.espessuraForma,
            fundo: ferramentas.fundoForma,
          }),
        ),
      ]);
      break;
    case "parede":
      selecao.selectParede(store.addParede(sceneId, comoParede(caixa, ferramentas.paredeNova)));
      break;
    case "area":
      selecao.selectFog(store.addFog(sceneId, comoNevoa(caixa, ferramentas.nevoaNovaDinamica)));
      break;
    case "efeito":
      selecao.selectAreaDeEfeito(
        store.addAreaDeEfeito(sceneId, comoAreaDeEfeito(caixa, ferramentas.efeitoDaArea ?? null)),
      );
      break;
  }

  switch (elemento.natureza) {
    case "elemento":
      store.removeFormas(sceneId, [elemento.forma.id]);
      break;
    case "parede":
      store.removeParedes(sceneId, [elemento.parede.id]);
      break;
    case "area":
      store.removeFog(sceneId, elemento.nevoa.id);
      break;
    case "efeito":
      store.removeAreaDeEfeito(sceneId, elemento.area.id);
      break;
  }
}
