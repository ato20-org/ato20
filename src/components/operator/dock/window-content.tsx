"use client";

import { AssetLibrary } from "@/components/operator/asset-library";
import { AudioLibrary } from "@/components/operator/audio-library";
import { AnexoBody, AssetBody } from "@/components/operator/attachment-window";
import { CharacterBody } from "@/components/operator/character-window";
import { CharactersBody } from "@/components/operator/characters-window";
import { FogList } from "@/components/operator/fog-list";
import { LayerList } from "@/components/operator/layer-list";
import { PortraitList } from "@/components/operator/portrait-list";
import { SceneList } from "@/components/operator/scene-list";
import { useCharacters } from "@/hooks/use-characters";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import type { ConteudoJanela } from "@/lib/store/use-window-store";

/**
 * O que cada tipo de janela mostra, e como se chama.
 *
 * Um lugar só porque agora há DUAS molduras para o mesmo conteúdo: a janela
 * flutuante, que desenha cabeçalho e alça, e o grupo atracado, que desenha uma
 * tira de abas. Antes cada tipo trazia a própria moldura embutida, e isso é o
 * que impedia uma ficha de virar aba de uma coluna.
 *
 * O corpo NÃO recebe a janela nem a posição: ele não sabe — e não deve saber —
 * se está flutuando ou atracado. Quem sabe é quem o desenha.
 */

/** O título e a linha de baixo, quando há. */
export type Rotulo = { titulo: string; subtitulo?: string };

/**
 * O rótulo, como hook, e não função pura.
 *
 * Porque um deles depende de dado: a ficha se chama pelo nome do personagem, e
 * o nome muda quando o mestre renomeia. Os outros são fixos e passariam bem numa
 * tabela, mas manter os dois caminhos separados custaria um `if` em cada
 * chamador.
 */
export function useRotuloJanela(conteudo: ConteudoJanela): Rotulo {
  const { personagens } = useCharacters();

  switch (conteudo.tipo) {
    case "personagens":
      return { titulo: "Personagens", subtitulo: "Ficha, miniaturas e donos" };
    case "personagem": {
      const nome = personagens?.find((atual) => atual.id === conteudo.personagemId)?.nome;

      // "Personagem" enquanto o índice não chegou, e não vazio: título que
      // aparece depois faz a largura da aba pular na frente de quem olha.
      return { titulo: nome ?? "Personagem", subtitulo: "Ficha do personagem" };
    }
    case "anexo":
      return {
        titulo: conteudo.anexo.arquivo,
        subtitulo: conteudo.anexo.autor === "jogador" ? "Anexo do jogador" : "Anexo do mestre",
      };
    case "asset":
      return { titulo: conteudo.nome, subtitulo: "Imagem do acervo" };
    case "cenas":
      return { titulo: "Cenas" };
    case "areas":
      return { titulo: "Áreas" };
    case "retratos":
      return { titulo: "Retratos" };
    case "imagens":
      return { titulo: "Imagens" };
    case "sons":
      return { titulo: "Sons" };
    case "camadas":
      return { titulo: "Camadas" };
  }
}

/**
 * A largura que a janela tem ao flutuar, até o mestre mexer na alça.
 *
 * Só vale para flutuante: atracada, a largura é a da coluna. Os painéis nascem
 * na medida do `aside` que eles eram, para arrastar Cenas para fora do dock não
 * dar uma lista de 200 pixels.
 */
export function larguraPadrao(conteudo: ConteudoJanela): number {
  switch (conteudo.tipo) {
    case "personagens":
      return 256;
    case "personagem":
      return 512;
    case "anexo":
    case "asset":
      return 560;
    default:
      return 288;
  }
}

/**
 * O corpo, sem moldura.
 *
 * Os painéis leem a cena do store em vez de receber por prop: o dock é genérico
 * e não tem por que carregar `scene` para entregar a um dos seus inquilinos. Era
 * prop enquanto os painéis eram markup fixo no shell, que já a tinha na mão.
 */
export function JanelaCorpo({ conteudo }: { conteudo: ConteudoJanela }) {
  const scene = useSceneStore(selectEditingScene);
  const pronta = useSceneStore((state) => state.status === "ready");

  switch (conteudo.tipo) {
    case "personagens":
      return <CharactersBody />;
    case "personagem":
      return <CharacterBody personagemId={conteudo.personagemId} />;
    case "anexo":
      return <AnexoBody personagemId={conteudo.personagemId} anexo={conteudo.anexo} />;
    case "asset":
      return <AssetBody assetId={conteudo.assetId} nome={conteudo.nome} />;
    case "cenas":
      return <SceneList ready={pronta} />;
    case "areas":
      return scene ? (
        <FogList scene={scene} />
      ) : (
        <p className="text-muted-foreground p-3 text-xs">Crie uma cena primeiro.</p>
      );
    // Retrato não depende de cena: ele é da sessão e atravessa a troca.
    case "retratos":
      return <PortraitList />;
    case "imagens":
      return scene ? (
        <AssetLibrary scene={scene} />
      ) : (
        <p className="text-muted-foreground p-3 text-xs">Crie uma cena primeiro.</p>
      );
    // Som também não: a trilha é da sessão.
    case "sons":
      return <AudioLibrary />;
    case "camadas":
      return scene ? (
        <LayerList scene={scene} />
      ) : (
        <p className="text-muted-foreground p-3 text-xs">Crie uma cena primeiro.</p>
      );
  }
}
