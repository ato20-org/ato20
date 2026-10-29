"use client";

import { toast } from "sonner";

import { METROS_POR_QUADRADO } from "@/lib/geometry/grid";
import { itemCenter, type Vec } from "@/lib/geometry/transform";
import { t } from "@/lib/i18n/personagens";
import type { ReguaDoTexto } from "@/lib/mestre/rolagens-no-texto";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import { temMedida, type NovaRegua, type Scene } from "@/types/scene";

/**
 * Põe na cena a régua que a ficha escreveu entre chaves: "Deslocamento: {9m}"
 * é a régua reta de nove metros, "Explosão: {6°}" o círculo de seis de raio.
 * Ver `lerReguaDoTexto`.
 *
 * Nasce no token de quem é a ficha, que é a pergunta que ela responde -- até
 * onde ESTE anda, o que a explosão DELE pega. A reta sai para a direita, e o
 * mestre a aponta pela alça: ela nasce selecionada, como a que ele arrasta com
 * a ferramenta, e com a MEDIDA TRAVADA -- a alça gira, e os nove metros que a
 * ficha disse continuam nove. O cadeado do gizmo solta. Ver `Regua.travada`.
 * Sem token na cena -- a ficha do bestiário, ou um personagem que não entrou
 * no mapa --, nasce no centro do que o mestre está enquadrando, como os dados
 * da ficha.
 *
 * Na cena aberta no palco, que é onde a régua da barra mede, e com a cor que o
 * painel da régua escolheu para a próxima. É uma régua como as outras: a mesa
 * vê, o Ctrl+Z tira, o Delete apaga.
 *
 * Clicar de novo no mesmo botão não empilha outra igual por cima, que ninguém
 * veria: seleciona a que já está lá. Com o token andado, a nova nasce onde ele
 * está.
 *
 * Devolve se mediu: sem mapa ou sem grade não há metro, e o aviso diz o que
 * falta.
 */
export function colocarReguaDaFicha(regua: ReguaDoTexto, personagemId?: string): boolean {
  const scene = selectEditingScene(useSceneStore.getState());

  if (!scene || !temMedida(scene)) {
    toast.warning(t.detalhes.reguaSemMapa, { id: "regua-da-ficha" });
    return false;
  }
  if (!scene.grid) {
    toast.warning(t.detalhes.reguaSemGrade, {
      id: "regua-da-ficha",
      description: t.detalhes.reguaSemGradeSaida,
    });
    return false;
  }

  const origem = origemDaRegua(scene, personagemId);
  const metro = scene.grid.size / METROS_POR_QUADRADO;
  const nova: NovaRegua = {
    forma: regua.forma,
    cor: useToolStore.getState().corMedidor,
    x: origem.x,
    y: origem.y,
    x2: origem.x + regua.metros * metro,
    y2: origem.y,
    travada: true,
  };

  const igual = scene.medidores?.find(
    (medidor) =>
      medidor.forma === nova.forma &&
      medidor.x === nova.x &&
      medidor.y === nova.y &&
      medidor.x2 === nova.x2 &&
      medidor.y2 === nova.y2,
  );
  const id = igual?.id ?? useSceneStore.getState().addMedidor(scene.id, nova);
  useSelectionStore.getState().selectMedidor(id);

  return true;
}

/**
 * De onde a régua sai: o centro do token do personagem, o que estiver na mão
 * quando ele tem mais de um na cena; sem token, o centro do enquadramento.
 */
function origemDaRegua(scene: Scene, personagemId: string | undefined): Vec {
  const tokens = personagemId ? scene.items.filter((item) => item.personagemId === personagemId) : [];

  if (tokens.length > 0) {
    const naMao = new Set(useSelectionStore.getState().selectedIds);
    const token = tokens.find((item) => naMao.has(item.id)) ?? tokens[0]!;

    return itemCenter(token);
  }

  const { viewport } = useViewportStore.getState();

  return { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 };
}
