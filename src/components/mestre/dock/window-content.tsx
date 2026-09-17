"use client";

import {
  BookOpen,
  Clapperboard,
  Files,
  Dices,
  EyeOff,
  Image,
  LibraryBig,
  Layers,
  Library,
  MonitorPlay,
  Music,
  Paperclip,
  PersonStanding,
  Puzzle,
  ScrollText,
  Users,
  type LucideIcon,
} from "lucide-react";

import { AssetLibrary } from "@/components/mestre/asset-library";
import { AudioLibrary } from "@/components/mestre/audio-library";
import { AnexoBody, AssetBody } from "@/components/mestre/attachment-window";
import { CharacterBody } from "@/components/mestre/character-window";
import { CharactersBody } from "@/components/mestre/characters-window";
import { EstanteBody } from "@/components/mestre/estante-window";
import { FogList } from "@/components/mestre/fog-list";
import { LeitorLivro } from "@/components/mestre/leitor/leitor-livro";
import { MiniplayerBody } from "@/components/mestre/miniplayer-window";
import { LayerList } from "@/components/mestre/layer-list";
import { PortraitList } from "@/components/mestre/portrait-list";
import { RolagensBody } from "@/components/mestre/rolagens-window";
import { ArquivosList } from "@/components/mestre/arquivos-list";
import { SceneList } from "@/components/mestre/scene-list";
import { useCharacters } from "@/hooks/use-characters";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import { useMemo } from "react";

import { PainelDeExtensao } from "@/components/mestre/dock/painel-de-extensao";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";
import type { ConteudoJanela } from "@/lib/store/use-window-store";
import { ehQuadro } from "@/types/scene";

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
 * O ícone de cada tela.
 *
 * Existe porque a aba encolheu: no formato de aba de navegador o rótulo é o
 * que ocupa, e numa coluna de 288 pixels três abas já disputam espaço. O ícone
 * é o que deixa a aba ativa reconhecível antes de o olho ler a palavra, e o que
 * identifica as inativas quando a tira rola.
 *
 * Função pura, e separada de `useRotuloJanela`: o ícone não depende de dado
 * nenhum -- a ficha do Victor e a do Edgar têm o mesmo --, então cobrá-lo de um
 * hook obrigaria quem só quer desenhar um menu a montar o índice de personagens.
 *
 * Sem `default` no `switch`, de propósito: é ele que faz o TypeScript apontar a
 * tela nova que entrou em `ConteudoJanela` e não escolheu ícone.
 */
export function iconeDaJanela(conteudo: ConteudoJanela): LucideIcon {
  switch (conteudo.tipo) {
    case "rolagens":
      return Dices;
    case "cenas":
      return Clapperboard;
    case "quadros":
      // Arquivos, como no Obsidian: quadros e notas na mesma árvore.
      return Files;
    case "areas":
      // A área é o que a mesa NÃO vê -- o olho cortado é o que ela faz.
      return EyeOff;
    case "retratos":
      return PersonStanding;
    case "camadas":
      return Layers;
    case "imagens":
      return LibraryBig;
    case "sons":
      return Music;
    case "personagens":
      return Users;
    case "personagem":
      // Ficha, e não pessoa: `Users` já é a lista, e duas telas com o mesmo
      // ícone na mesma tira não distinguem nada.
      return ScrollText;
    case "estante":
      return Library;
    case "livro":
      return BookOpen;
    case "miniplayer":
      return MonitorPlay;
    case "anexo":
      return Paperclip;
    case "asset":
      return Image;
    case "extensao":
      // Um ícone só para todas: o manifesto não declara um, e inventar por
      // extensão seria escolher pelo autor dela.
      return Puzzle;
  }
}

/**
 * As telas que existem, na ordem em que aparecem nos menus.
 *
 * Uma lista só, e é uma correção: havia duas escritas à mão — uma no menu
 * "Abas" da barra da janela e outra no `+` da tira de abas — e a Estante entrou
 * numa e não na outra, o que deixou a tela nova alcançável por um caminho e
 * invisível pelo outro.
 *
 * Escrita à mão e não derivada do layout, isso continua: ela precisa listar o
 * que NÃO está aberto, e o que não está aberto não existe em lugar nenhum para
 * ser derivado. É também a única lista que responde "quais telas existem", o que
 * a torna o lugar certo para uma tela nova ser anunciada.
 *
 * Só telas SEM identidade própria. Um livro da estante não entra: ele tem id, e
 * uma lista de livros abertos é a Estante, não um menu de painéis.
 */
export const TELAS_BASE: Array<{ conteudo: ConteudoJanela; titulo: string }> = [
  { conteudo: { tipo: "cenas" }, titulo: "Mapas" },
  { conteudo: { tipo: "quadros" }, titulo: "Arquivos" },
  { conteudo: { tipo: "areas" }, titulo: "Áreas" },
  { conteudo: { tipo: "retratos" }, titulo: "Retratos" },
  { conteudo: { tipo: "camadas" }, titulo: "Camadas" },
  { conteudo: { tipo: "imagens" }, titulo: "Biblioteca" },
  { conteudo: { tipo: "sons" }, titulo: "Sons" },
  { conteudo: { tipo: "personagens" }, titulo: "Personagens" },
  { conteudo: { tipo: "rolagens" }, titulo: "Rolagens" },
  { conteudo: { tipo: "estante" }, titulo: "Estante" },
  { conteudo: { tipo: "miniplayer" }, titulo: "Mesa" },
];

/**
 * As telas que existem AGORA: as de fábrica mais as que os plugins trouxeram.
 *
 * Hook e não constante porque a lista passou a depender do que está instalado e
 * habilitado. Sai do que as extensões DECLARAM no manifesto, e não do que elas
 * registraram: a tela precisa aparecer no menu antes de o módulo ser importado
 * — é o menu que causa a importação.
 */
export function useTelas(): Array<{
  conteudo: ConteudoJanela;
  titulo: string;
}> {
  const extensoes = useExtensoesStore((state) => state.extensoes);

  return useMemo(
    () => [
      ...TELAS_BASE,
      ...extensoes
        .filter((extensao) => extensao.habilitada)
        .flatMap((extensao) =>
          (extensao.contribui?.paineis ?? []).map((painel) => ({
            conteudo: {
              tipo: "extensao" as const,
              extensaoId: extensao.id,
              painelId: painel.id,
            },
            titulo: painel.titulo,
          })),
        ),
    ],
    [extensoes],
  );
}

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
  const extensoes = useExtensoesStore((state) => state.extensoes);

  switch (conteudo.tipo) {
    case "personagens":
      return { titulo: "Personagens", subtitulo: "Ficha, miniaturas e donos" };
    case "personagem": {
      const nome = personagens?.find(
        (atual) => atual.id === conteudo.personagemId,
      )?.nome;

      // "Personagem" enquanto o índice não chegou, e não vazio: título que
      // aparece depois faz a largura da aba pular na frente de quem olha.
      return { titulo: nome ?? "Personagem", subtitulo: "Ficha do personagem" };
    }
    case "anexo":
      return {
        titulo: conteudo.anexo.arquivo,
        subtitulo:
          conteudo.anexo.autor === "jogador"
            ? "Anexo do jogador"
            : "Anexo do mestre",
      };
    case "asset":
      return { titulo: conteudo.nome, subtitulo: "Imagem do acervo" };
    case "estante":
      return {
        titulo: "Estante",
        subtitulo: "Os livros de regras desta máquina",
      };
    case "livro":
      return { titulo: conteudo.titulo, subtitulo: "Livro de regras" };
    case "miniplayer":
      return { titulo: "Mesa", subtitulo: "O que a mesa está vendo" };
    case "rolagens":
      return { titulo: "Rolagens", subtitulo: "O que a mesa tirou" };
    case "cenas":
      return { titulo: "Mapas" };
    case "quadros":
      return { titulo: "Arquivos", subtitulo: "Quadros e notas da campanha" };
    case "areas":
      return { titulo: "Áreas" };
    case "retratos":
      return { titulo: "Retratos" };
    case "imagens":
      return { titulo: "Biblioteca", subtitulo: "Imagens e arquivos da campanha" };
    case "sons":
      return { titulo: "Sons" };
    case "camadas":
      return { titulo: "Camadas" };
    case "extensao": {
      const painel = extensoes
        .find((extensao) => extensao.id === conteudo.extensaoId)
        ?.contribui?.paineis.find((atual) => atual.id === conteudo.painelId);

      // "Plugin" quando o painel declarado sumiu -- extensão desinstalada com a
      // janela aberta. O título some, a janela fica, e o corpo diz o que houve.
      return {
        titulo: painel?.titulo ?? "Plugin",
        subtitulo: painel?.subtitulo ?? undefined,
      };
    }
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
    // O leitor nasce largo: uma página de manual é diagramada em duas colunas
    // de texto, e a 288 pixels ela chega ilegível mesmo ajustada à largura.
    case "livro":
      return 720;
    // Largo o bastante para ler um token, e 16:9 dá 180 de altura: cabe num
    // canto do palco sem esconder o que o mestre está editando.
    case "miniplayer":
      return 320;
    default:
      return 288;
  }
}

/**
 * O quanto o corpo precisa para não ficar ilegível, quando atracado.
 *
 * Abaixo disto a REGIÃO ROLA de lado em vez de espremer o conteúdo. A ficha foi
 * desenhada para 512 pixels: numa coluna de 288 o botão "Trocar" de cada campo
 * ficava cortado e inalcançável, e um botão que não se alcança é pior que um
 * botão fora da vista com rolagem até ele.
 *
 * Zero para os painéis, que nasceram num `aside` de 288 e não têm piso nenhum:
 * dar-lhes um obrigaria a lista de cenas a rolar de lado numa coluna do tamanho
 * exato em que ela sempre viveu.
 */
export function larguraMinima(conteudo: ConteudoJanela): number {
  switch (conteudo.tipo) {
    case "personagem":
      return 360;
    case "anexo":
    case "asset":
      return 320;
    // A barra do leitor envolve em vez de rolar, mas a página tem um piso: com
    // a tira de marcadores aberta, abaixo disto sobra uma faixa de folha de 60
    // pixels ao lado dela.
    case "livro":
      return 420;
    default:
      return 0;
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
      return (
        <AnexoBody
          personagemId={conteudo.personagemId}
          anexo={conteudo.anexo}
        />
      );
    case "asset":
      return <AssetBody assetId={conteudo.assetId} nome={conteudo.nome} />;
    // A estante e o leitor não dependem de cena nem de campanha: o mestre
    // consulta uma regra na porta do aplicativo, antes de escolher a mesa da
    // noite. Ver `estante.rs` e a rota `/livro/{id}`.
    case "estante":
      return <EstanteBody />;
    case "livro":
      return <LeitorLivro livroId={conteudo.livroId} />;
    // Nem cena nem store: assina o fluxo do daemon como a TV. Ver o cabeçalho.
    case "miniplayer":
      return <MiniplayerBody />;
    // A única que o aplicativo não desenha sozinho: o corpo vem do módulo da
    // extensão, que só é importado agora. Ver `PainelDeExtensao`.
    case "extensao":
      return (
        <PainelDeExtensao
          extensaoId={conteudo.extensaoId}
          painelId={conteudo.painelId}
        />
      );
    case "cenas":
      return <SceneList ready={pronta} />;
    case "quadros":
      return <ArquivosList ready={pronta} />;
    case "areas":
      // Quadro não tem névoa: a lista vazia diria "nenhuma área" como se
      // faltasse desenhar uma, e o que falta é abrir um mapa.
      return scene && !ehQuadro(scene) ? (
        <FogList scene={scene} />
      ) : (
        <p className="text-muted-foreground p-3 text-xs">
          {scene ? "Quadro não tem áreas escondidas." : "Crie um mapa primeiro."}
        </p>
      );
    // Retrato não depende de cena: ele é da sessão e atravessa a troca.
    case "retratos":
      return <PortraitList />;
    // Acervo é da campanha, não da cena: lista sem cena nenhuma, e a cena
    // aberta só decide se o `+` de "pôr na cena" aparece.
    case "imagens":
      return <AssetLibrary scene={scene} />;
    // Som também não: a trilha é da sessão.
    case "sons":
      return <AudioLibrary />;
    // Nem cena nem campanha: a rolagem é da SESSÃO, e continua valendo
    // enquanto o mestre troca de mapa. Mesma razão de Retratos e Sons.
    case "rolagens":
      return <RolagensBody />;
    case "camadas":
      return scene ? (
        <LayerList scene={scene} />
      ) : (
        <p className="text-muted-foreground p-3 text-xs">
          Crie um mapa primeiro.
        </p>
      );
  }
}
