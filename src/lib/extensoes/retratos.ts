"use client";

import { efeitosDaFigura } from "@/lib/condicao";
import { fontesDeRetrato } from "@/lib/extensoes/fontes";
import { createPortrait, retratoPublico, retratosDaCena } from "@/lib/geometry/portrait";
import type { RetratoParaKit } from "@/lib/kit-de-retratos";
import { useCharactersStore } from "@/lib/store/use-characters-store";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import { selectCenaParaMesa, useSceneStore } from "@/lib/store/use-scene-store";

/**
 * Os retratos como a MESA os vê, para um plugin levá-los para fora do Mestre.
 *
 * Pela mesma `retratoPublico` que monta o quadro da janela do espectador: sem
 * medidor nem condição escondidos, e o nome só com a peça "nome" ligada. É o
 * ponto da função: o plugin recebe o corte que a TV recebe, e não a ficha
 * crua -- senão a live mostraria o que a mesa não vê.
 *
 * O formato é o do kit de retratos (`/kit/retratos`), e o plugin não precisa
 * conhecê-lo: recebe daqui, passa adiante para o kit.
 */

function fontes() {
  return fontesDeRetrato(useExtensoesStore.getState().extensoes);
}

function fichaDe(personagemId: string) {
  return useCharactersStore.getState().personagens?.find((p) => p.id === personagemId);
}

/** Os retratos NO AR agora, na ordem e no lugar em que a mesa os vê. */
export function retratosNaMesa(): RetratoParaKit[] {
  const { portraits: guardados, layout } = usePortraitStore.getState();
  const cena = selectCenaParaMesa(useSceneStore.getState());
  const personagens = useCharactersStore.getState().personagens ?? [];

  return retratosDaCena(guardados, cena?.items ?? [], personagens, fontes(), false, layout)
    .filter((retrato) => retrato.visible)
    .map((retrato) => ({
      ...retrato,
      efeitos: efeitosDaFigura(fichaDe(retrato.personagemId)?.condicoes),
    }));
}

/**
 * O retrato público de um personagem, esteja ele no ar ou não.
 *
 * Com o registro guardado quando há -- o layout que o mestre escolheu para
 * aquele retrato vale aqui também --, e um novo quando o personagem nunca foi
 * armado. `null` para quem não tem Retrato nem Retrato ao vivo na ficha.
 */
export function retratoDoPersonagem(personagemId: string): RetratoParaKit | null {
  const ficha = fichaDe(personagemId);
  if (!ficha || (!ficha.retrato && !ficha.retratoUrl)) return null;

  const { portraits: guardados, layout } = usePortraitStore.getState();
  const guardado =
    guardados.find((retrato) => retrato.personagemId === personagemId) ??
    createPortrait(personagemId, ficha.retrato ?? "");

  return {
    ...retratoPublico({ ...guardado, visible: true }, ficha, fontes(), false, layout),
    efeitos: efeitosDaFigura(ficha.condicoes),
  };
}

/**
 * Avisa quando os retratos no ar mudam -- e só então.
 *
 * Escuta o que entra na conta: os retratos guardados, a cena no ar, as fichas
 * (a vida que desce), os plugins (a fonte de retrato ao vivo). Compara pelo
 * texto do resultado, então mexer num item da cena que não muda retrato não
 * acorda ninguém. Chama já com a lista atual.
 */
export function assinarRetratosNaMesa(aviso: (retratos: RetratoParaKit[]) => void): () => void {
  let anterior = "";
  const talvez = () => {
    const retratos = retratosNaMesa();
    const texto = JSON.stringify(retratos);
    if (texto === anterior) return;

    anterior = texto;
    aviso(retratos);
  };

  const parar = [
    usePortraitStore.subscribe((estado, antes) => {
      if (estado.portraits !== antes.portraits || estado.layout !== antes.layout) talvez();
    }),
    useSceneStore.subscribe((estado, antes) => {
      if (selectCenaParaMesa(estado)?.items !== selectCenaParaMesa(antes)?.items) talvez();
    }),
    useCharactersStore.subscribe((estado, antes) => {
      if (estado.personagens !== antes.personagens) talvez();
    }),
    useExtensoesStore.subscribe((estado, antes) => {
      if (estado.extensoes !== antes.extensoes) talvez();
    }),
  ];
  talvez();

  return () => {
    for (const desfazer of parar) desfazer();
  };
}
