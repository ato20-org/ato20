"use client";

import { AudioLibrary } from "@/components/mestre/audio-library";
import { AnexoBody, AssetBody } from "@/components/mestre/attachment-window";
import { CharacterBody } from "@/components/mestre/character-window";
import { CharactersBody } from "@/components/mestre/characters-window";
import { CompendioBody, CompendioDoAto20Body } from "@/components/mestre/compendio-window";
import { FichaDoPluginBody } from "@/components/mestre/ficha-do-plugin";
import { ItemDoPluginBody } from "@/components/mestre/item-do-plugin";
import { VerbeteDoPluginBody } from "@/components/mestre/verbete-do-plugin";
import {
  CondicaoBody,
  FundoDaCondicao,
  MudarDeListaNoTopo,
  useRotuloDaCondicao,
} from "@/components/mestre/condicao-window";
import { EfeitoBody, FundoDoEfeito, useRotuloDoEfeito } from "@/components/mestre/efeito-window";
import { FundoDoPersonagem } from "@/components/mestre/retrato-desfocado";
import { ConfiguracaoDaCampanhaBody } from "@/components/mestre/configuracao-da-campanha";
import { EstanteBody } from "@/components/mestre/estante-window";
import { GaleriaBody } from "@/components/mestre/galeria-window";
import {
  ApagarItemNoTopo,
  FundoDoItem,
  ItemBody,
  TransmitirItemNoTopo,
} from "@/components/mestre/item-window";
import { ItensBody } from "@/components/mestre/itens-window";
import { LeitorLivro } from "@/components/mestre/leitor/leitor-livro";
import { MiniplayerBody } from "@/components/mestre/miniplayer-window";
import { LayerList } from "@/components/mestre/layer-list";
import { RetratosWindow } from "@/components/mestre/retratos-window";
import { ChatBody } from "@/components/mestre/chat-window";
import { HistoricoBody } from "@/components/mestre/historico-window";
import { RolagensBody } from "@/components/mestre/rolagens-window";
import { IniciativaBody } from "@/components/mestre/iniciativa-window";
import { ArquivosList } from "@/components/mestre/arquivos-list";
import { SceneList } from "@/components/mestre/scene-list";
import { useCharacters } from "@/hooks/use-characters";
import { t } from "@/lib/i18n/mestre";
import { useCharactersStore } from "@/lib/store/use-characters-store";
import { useItensStore } from "@/lib/store/use-itens-store";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import { useMemo } from "react";

import { PainelDeExtensao } from "@/components/mestre/dock/painel-de-extensao";
import { Substituto } from "@/components/mestre/substituto";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";
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
  { conteudo: { tipo: "cenas" }, titulo: t.janelas.cenas },
  { conteudo: { tipo: "quadros" }, titulo: t.janelas.arquivos },
  // Ao lado de Arquivos: é o mesmo acervo, sem pasta e sem esconder o que tem
  // dono -- quem não acha a imagem lá a procura aqui.
  { conteudo: { tipo: "galeria" }, titulo: t.janelas.galeria },
  { conteudo: { tipo: "retratos" }, titulo: t.janelas.retratos },
  { conteudo: { tipo: "camadas" }, titulo: t.janelas.camadas },
  { conteudo: { tipo: "sons" }, titulo: t.janelas.sons },
  { conteudo: { tipo: "iniciativa" }, titulo: t.janelas.iniciativa },
  { conteudo: { tipo: "personagens" }, titulo: t.janelas.personagens },
  // Logo depois de Personagens: é para eles que os itens são arrastados, e
  // quem abre um costuma querer o outro ao lado.
  { conteudo: { tipo: "itens" }, titulo: t.janelas.itens },
  // Depois dos dois: é de onde vêm o goblin que entra em Personagens e o item
  // que entra no catálogo.
  { conteudo: { tipo: "compendio" }, titulo: t.janelas.compendio },
  { conteudo: { tipo: "rolagens" }, titulo: t.janelas.rolagens },
  { conteudo: { tipo: "chat" }, titulo: t.janelas.chat },
  { conteudo: { tipo: "historico" }, titulo: t.janelas.historico },
  { conteudo: { tipo: "estante" }, titulo: t.janelas.estante },
  { conteudo: { tipo: "miniplayer" }, titulo: t.janelas.mesa },
];

/**
 * As telas que se acham pela BUSCA, e não pelos menus de abas.
 *
 * O Compêndio do ATO20 abre de dentro do Compêndio da campanha -- é o outro
 * lado dele, o que esta máquina guarda --, e no menu "Abas abertas", entre as
 * telas da mesa, ele parecia mais uma tela desta campanha. Na paleta ele fica:
 * quem digita "ATO20" sabe o que procura.
 */
export const TELAS_SO_DA_BUSCA: Array<{ conteudo: ConteudoJanela; titulo: string }> = [
  { conteudo: { tipo: "compendio-ato20" }, titulo: t.janelas.compendioAto20 },
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
  const moldes = useCharactersStore((state) => state.moldes);
  const extensoes = useExtensoesStore((state) => state.extensoes);
  const nomeDoItem = useItensStore((state) =>
    conteudo.tipo === "item"
      ? state.itens?.find((item) => item.id === conteudo.itemId)?.nome
      : undefined,
  );
  // O molde de item abre na mesma janela, e a aba diz que é molde.
  const nomeDoMoldeDeItem = useItensStore((state) =>
    conteudo.tipo === "item"
      ? state.moldes?.find((item) => item.id === conteudo.itemId)?.nome
      : undefined,
  );
  // Sempre chamados, como os de cima: hook não se chama pela metade. Fora das
  // janelas deles, recebem `undefined` e não acham nada.
  const rotuloDoEfeito = useRotuloDoEfeito(
    conteudo.tipo === "efeito" ? conteudo.efeitoId : undefined,
  );
  const rotuloDaCondicao = useRotuloDaCondicao(
    conteudo.tipo === "condicao" ? conteudo.lugar : undefined,
    conteudo.tipo === "condicao" ? conteudo.condicaoId : undefined,
  );

  switch (conteudo.tipo) {
    case "personagens":
      return {
        titulo: t.janelas.personagens,
        subtitulo: t.janelas.personagensSub,
      };
    case "itens":
      return { titulo: t.janelas.itens, subtitulo: t.janelas.itensSub };
    case "compendio":
      return { titulo: t.janelas.compendio, subtitulo: t.janelas.compendioSub };
    case "compendio-ato20":
      return { titulo: t.janelas.compendioAto20, subtitulo: t.janelas.compendioAto20Sub };
    case "ficha-do-plugin":
      return { titulo: conteudo.nome, subtitulo: t.janelas.fichaDoPluginSub };
    case "item-do-plugin":
      return { titulo: conteudo.nome, subtitulo: t.janelas.itemDoPluginSub };
    case "verbete-do-plugin":
      return { titulo: conteudo.nome, subtitulo: t.janelas.verbeteDoPluginSub };
    case "efeito":
      return rotuloDoEfeito;
    case "condicao":
      return rotuloDaCondicao;
    case "item": {
      const dono = conteudo.personagemId
        ? personagens?.find((atual) => atual.id === conteudo.personagemId)?.nome
        : undefined;

      // "Item" enquanto o catálogo não chegou, pela razão da ficha: título que
      // aparece depois faz a aba pular.
      return {
        titulo: nomeDoItem ?? nomeDoMoldeDeItem ?? t.janelas.item,
        subtitulo: nomeDoMoldeDeItem
          ? t.janelas.moldeSub
          : dono
            ? t.janelas.itemNaMochila(dono)
            : t.janelas.itemSub,
      };
    }
    case "personagem": {
      const nome = personagens?.find(
        (atual) => atual.id === conteudo.personagemId,
      )?.nome;
      // O molde se edita na mesma ficha, e a aba diz que é molde: mexer no
      // goblin preparado não é mexer no que está em jogo.
      const molde = moldes?.find((atual) => atual.id === conteudo.personagemId);

      // "Personagem" enquanto o índice não chegou, e não vazio: título que
      // aparece depois faz a largura da aba pular na frente de quem olha.
      return {
        titulo: nome ?? molde?.nome ?? t.janelas.personagem,
        subtitulo: molde ? t.janelas.moldeSub : t.janelas.personagemSub,
      };
    }
    case "anexo":
      return {
        titulo: conteudo.anexo.arquivo,
        subtitulo:
          conteudo.anexo.autor === "jogador"
            ? t.janelas.anexoDoJogador
            : t.janelas.anexoDoMestre,
      };
    case "asset":
      return { titulo: conteudo.nome, subtitulo: t.janelas.imagemDoAcervo };
    case "configuracao":
      return {
        titulo: t.janelas.configuracao,
        subtitulo: t.janelas.configuracaoSub,
      };
    case "estante":
      return {
        titulo: t.janelas.estante,
        subtitulo: t.janelas.estanteSub,
      };
    case "livro":
      return { titulo: conteudo.titulo, subtitulo: t.janelas.livroSub };
    case "miniplayer":
      return { titulo: t.janelas.mesa, subtitulo: t.janelas.mesaSub };
    case "rolagens":
      return { titulo: t.janelas.rolagens, subtitulo: t.janelas.rolagensSub };
    case "chat":
      return { titulo: t.janelas.chat, subtitulo: t.janelas.chatSub };
    case "historico":
      return { titulo: t.janelas.historico, subtitulo: t.janelas.historicoSub };
    case "cenas":
      // "Cenas" e não "Mapas": o painel passou a ter as duas naturezas, e o
      // nome antigo escondia os fundos atrás da palavra do vizinho.
      return { titulo: t.janelas.cenas, subtitulo: t.janelas.cenasSub };
    case "quadros":
      return { titulo: t.janelas.arquivos, subtitulo: t.janelas.arquivosSub };
    case "galeria":
      return { titulo: t.janelas.galeria, subtitulo: t.janelas.galeriaSub };
    case "retratos":
      return { titulo: t.janelas.retratos };
    case "sons":
      return { titulo: t.janelas.sons };
    case "iniciativa":
      return { titulo: t.janelas.iniciativa, subtitulo: t.janelas.iniciativaSub };
    case "camadas":
      return { titulo: t.janelas.camadas };
    case "extensao": {
      const painel = extensoes
        .find((extensao) => extensao.id === conteudo.extensaoId)
        ?.contribui?.paineis.find((atual) => atual.id === conteudo.painelId);

      // "Plugin" quando o painel declarado sumiu -- extensão desinstalada com a
      // janela aberta. O título some, a janela fica, e o corpo diz o que houve.
      // O título da INSTÂNCIA vence o do manifesto: é o nome que o plugin deu
      // a esta janela em particular ("Edgar"), e o manifesto só sabe o do
      // painel ("Ficha").
      return {
        titulo: conteudo.titulo ?? painel?.titulo ?? t.janelas.plugin,
        subtitulo: conteudo.titulo ? painel?.titulo : (painel?.subtitulo ?? undefined),
      };
    }
  }
}

/**
 * Os botões que a tela põe no TOPO da moldura, ao lado do fechar.
 *
 * Na moldura, e não dentro do corpo, porque são ações sobre a tela inteira e
 * que se procuram onde se procura o fechar. Hoje é só o item: o "mostrar na
 * mesa" e o apagar, que saíram do pé do card -- e com eles o pé inteiro.
 *
 * A janela flutuante os põe no cabeçalho dela; o grupo atracado, na tira de
 * abas, ao lado do `+`, para a aba ativa.
 */
export function AcoesDaJanela({ conteudo }: { conteudo: ConteudoJanela }) {
  switch (conteudo.tipo) {
    case "item":
      return (
        <>
          <TransmitirItemNoTopo itemId={conteudo.itemId} personagemId={conteudo.personagemId} />
          <ApagarItemNoTopo itemId={conteudo.itemId} personagemId={conteudo.personagemId} />
        </>
      );
    // O caminho para a outra lista: do Compêndio ao menu, e de volta.
    case "condicao":
      return <MudarDeListaNoTopo lugar={conteudo.lugar} condicaoId={conteudo.condicaoId} />;
    default:
      return null;
  }
}

/**
 * O fundo que a tela põe ATRÁS do cabeçalho da moldura flutuante.
 *
 * O item e a ficha: a imagem desfocada, a mesma do alto do card, para a
 * janela ter a cor do item ou do personagem também no cabeçalho -- e,
 * recolhida, ser reconhecida por ela, quando o cabeçalho é tudo o que sobra.
 * Três fichas recolhidas no pé do palco se distinguem pela cor do retrato.
 */
export function FundoDaJanela({ conteudo }: { conteudo: ConteudoJanela }) {
  switch (conteudo.tipo) {
    case "item":
      return <FundoDoItem itemId={conteudo.itemId} />;
    case "personagem":
      return <FundoDoPersonagem personagemId={conteudo.personagemId} />;
    // Sem imagem: a cor, como o card deles no Compêndio.
    case "efeito":
      return <FundoDoEfeito efeitoId={conteudo.efeitoId} />;
    case "condicao":
      return <FundoDaCondicao lugar={conteudo.lugar} condicaoId={conteudo.condicaoId} />;
    default:
      return null;
  }
}

/**
 * A altura que a janela tem ao flutuar, até o mestre mexer na alça.
 * `undefined` = cresce com o conteúdo até o teto do palco, que é o padrão de
 * quase todas — ver `InnerWindow`.
 *
 * O chat é a exceção, porque o conteúdo dele não acaba: são as últimas
 * duzentas linhas da campanha, e crescer com elas é ocupar o palco inteiro de
 * cima a baixo na primeira vez que a janela abre sozinha. Com altura, ele nasce
 * do tamanho de uma conversa, e rola por dentro.
 */
export function alturaPadrao(conteudo: ConteudoJanela): number | undefined {
  switch (conteudo.tipo) {
    case "chat":
      return 420;
    // Pela mesma razão do chat: a campanha inteira não acaba.
    case "historico":
      return 520;
    // Deitada, o quadro cabe na altura que a janela TEM, e sem altura ela
    // cresceria com a lista ao lado -- o quadro ficaria do tamanho do elenco.
    case "retratos":
      return 440;
    // O catálogo cresce como o chat: uma campanha longa junta centenas de
    // itens, e crescer com eles cobriria o palco na primeira abertura.
    case "itens":
    case "compendio":
    case "compendio-ato20":
      return 480;
    // Pela mesma razão: o acervo de uma campanha longa é maior que o palco.
    case "galeria":
      return 480;
    // O editor é comprido -- prévia e cinco camadas --, e crescer com ele
    // tomaria o palco de cima a baixo. Rola por dentro.
    case "efeito":
    case "condicao":
      return 600;
    // A ficha de uma ameaça tem ações e poderes de parágrafo inteiro: rola por
    // dentro, como o editor.
    case "ficha-do-plugin":
      return 600;
    default:
      return undefined;
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
    case "itens":
      return 256;
    // Um pouco mais larga que as listas: a linha tem a ação de trazer ou pôr
    // em jogo ao lado do nome, e as abas de cima são duas fileiras.
    case "compendio":
    case "compendio-ato20":
      return 320;
    // Larga o bastante para a imagem do item ser vista, e não um ícone, e
    // estreita o bastante para caber ao lado da ficha de quem o carrega.
    case "item":
      return 400;
    // A prévia da ficha do plugin: o retrato ao lado do nome e dos botões, e
    // as ações em texto corrido embaixo.
    case "ficha-do-plugin":
      return 440;
    // A do item de sempre: a imagem ao lado do nome e os atributos embaixo.
    case "item-do-plugin":
    case "verbete-do-plugin":
      return 400;
    // Larga o bastante para o editor abrir em duas colunas: a prévia parada à
    // esquerda, as camadas rolando à direita. Abaixo de 32rem ele empilha, e a
    // prévia sai da vista assim que o mestre desce até a luz.
    case "efeito":
    case "condicao":
      return 600;
    // Larga o bastante para as duas colunas da aba Ficha: as linhas de medidor
    // e de condição guardam lugar para o olho e a lixeira mesmo escondidos, e
    // abaixo disto o nome de cada uma virava duas letras.
    case "personagem":
      return 720;
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
    // Deitada: o quadro da tela da mesa à esquerda, as abas numa coluna à
    // direita -- ver `RetratosWindow`. Atracada, vale a coluna, e o quadro
    // volta para cima das abas.
    case "retratos":
      return 760;
    // Quatro cartões por linha: a miniatura grande o bastante para reconhecer
    // o mapa sem abrir, e o nome inteiro na maioria dos arquivos.
    case "galeria":
      return 480;
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
    case "ficha-do-plugin":
    case "item-do-plugin":
    case "verbete-do-plugin":
    case "efeito":
    case "condicao":
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
  const corpo = <CorpoDeFabrica conteudo={conteudo} />;

  // Um plugin pode trocar a janela inteira -- `janela:personagem` no
  // manifesto -- e é aqui, no único ponto por onde todo corpo passa, flutuante
  // ou atracado, que a troca acontece. Só as de fábrica sem identidade externa:
  // anexo, asset e livro apontam para arquivos, e o painel de plugin já é dele.
  if (!SUBSTITUIVEIS.has(conteudo.tipo)) return corpo;

  return (
    <Substituto
      alvo={`janela:${conteudo.tipo}`}
      personagemId={conteudo.tipo === "personagem" ? conteudo.personagemId : undefined}
    >
      {corpo}
    </Substituto>
  );
}

/** As janelas que um plugin pode substituir. Espelho de `JANELAS_DE_FABRICA`. */
const SUBSTITUIVEIS = new Set<ConteudoJanela["tipo"]>([
  "personagens",
  "personagem",
  "configuracao",
  "estante",
  "miniplayer",
  "rolagens",
  "chat",
  "cenas",
  "quadros",
  "galeria",
  "retratos",
  "sons",
  "camadas",
  "iniciativa",
]);

function CorpoDeFabrica({ conteudo }: { conteudo: ConteudoJanela }) {
  const scene = useSceneStore(selectEditingScene);
  const pronta = useSceneStore((state) => state.status === "ready");

  switch (conteudo.tipo) {
    case "personagens":
      return <CharactersBody />;
    case "itens":
      return <ItensBody />;
    case "compendio":
      return <CompendioBody />;
    // Da MÁQUINA, e não da campanha: a mesma de qualquer mesa, como a Estante.
    case "compendio-ato20":
      return <CompendioDoAto20Body />;
    case "ficha-do-plugin":
      return (
        <FichaDoPluginBody
          extensaoId={conteudo.extensaoId}
          colecaoId={conteudo.colecaoId}
          moldeId={conteudo.moldeId}
        />
      );
    case "item-do-plugin":
      return (
        <ItemDoPluginBody
          extensaoId={conteudo.extensaoId}
          colecaoId={conteudo.colecaoId}
          itemId={conteudo.itemId}
        />
      );
    case "verbete-do-plugin":
      return (
        <VerbeteDoPluginBody
          extensaoId={conteudo.extensaoId}
          abaId={conteudo.abaId}
          colecaoId={conteudo.colecaoId}
          verbeteId={conteudo.verbeteId}
        />
      );
    case "item":
      return <ItemBody itemId={conteudo.itemId} personagemId={conteudo.personagemId} />;
    case "efeito":
      return <EfeitoBody efeitoId={conteudo.efeitoId} />;
    case "condicao":
      return <CondicaoBody lugar={conteudo.lugar} condicaoId={conteudo.condicaoId} />;
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
    // Da CAMPANHA, e não da cena nem de um personagem: o que se ajusta aqui
    // vale para a mesa inteira e sobrevive a trocar de mapa.
    case "configuracao":
      return <ConfiguracaoDaCampanhaBody />;
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
          parametro={conteudo.parametro}
        />
      );
    case "cenas":
      return <SceneList ready={pronta} />;
    case "quadros":
      return <ArquivosList ready={pronta} />;
    // Nem cena nem pronta: é o acervo, lido pelo store dele.
    case "galeria":
      return <GaleriaBody />;
    // Retrato não depende de cena: ele é da sessão e atravessa a troca.
    case "retratos":
      return <RetratosWindow />;
    // Som também não: a trilha é da sessão.
    case "sons":
      return <AudioLibrary />;
    // Nem cena nem campanha: a rolagem é da SESSÃO, e continua valendo
    // enquanto o mestre troca de mapa. Mesma razão de Retratos e Sons.
    case "rolagens":
      return <RolagensBody />;
    // Da CAMPANHA: o fio sobrevive à sessão, e mais ainda a trocar de mapa.
    case "chat":
      return <ChatBody />;
    // Da CAMPANHA, como o chat: atravessa as sessões e as cenas.
    case "historico":
      return <HistoricoBody />;
    case "iniciativa":
      return <IniciativaBody />;
    case "camadas":
      return scene ? (
        <LayerList scene={scene} />
      ) : (
        <p className="text-muted-foreground p-3 text-xs">
          {t.janelas.nenhumaCamada}
        </p>
      );
  }
}
