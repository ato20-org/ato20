"use client";

import { open } from "@tauri-apps/plugin-dialog";

import type { FonteRetrato } from "@/lib/extensoes/fontes";
import { resolverOpcional, resolverTexto } from "@/lib/extensoes/texto";
import { call } from "@/lib/vault/bridge";
import type { DefinicaoDeEfeito } from "@/types/efeito";

export {
  CANVAS_PADRAO,
  canvasDaUrl,
  fonteDaUrl,
  fontesDeRetrato,
  urlDaFonte,
  type FonteRetrato,
} from "@/lib/extensoes/fontes";

/**
 * As extensões: o que a MÁQUINA carrega além do que veio no aplicativo.
 *
 * Pasta própria, e não um arquivo ao lado de `estante.ts` em `lib/vault/` —
 * que seria a vizinhança certa pelo escopo, já que as duas são da máquina e
 * não da campanha. A razão é o que vem depois: a estante é um assunto fechado
 * (importar PDF, guardar página), e a extensão é a base de uma API — tema
 * agora, painel e ferramenta em seguida. Esses arquivos vão querer morar
 * juntos, e `lib/vault/` é sobre o que a campanha grava no disco.
 *
 * Ver `src-tauri/src/extensoes.rs`, que é quem lê o disco e valida.
 */

/**
 * A versão da API que este aplicativo fala.
 *
 * Espelho de `extensoes::API_VERSAO`. Quem recusa é o Rust, na importação — o
 * número existe aqui para a tela poder dizer o que ela fala quando mostra o
 * erro de incompatibilidade.
 */
export const API_VERSAO = 9;

/**
 * O que uma extensão diz de si.
 *
 * Espelho de `extensoes::Manifesto` em Rust, que é quem lê o `manifest.json`
 * e valida. Campo novo lá precisa de campo novo aqui.
 *
 * `tema` e `principal` são os dois caminhos que ela pode oferecer, e os dois
 * são opcionais: extensão só de tema não tem JS, e extensão só de código não
 * tem CSS.
 */
export type Manifesto = {
  id: string;
  nome: string;
  versao: string;
  autor: string | null;
  repositorio: string | null;
  descricao: string | null;
  apiVersao: number;
  /** O CSS, relativo à pasta da extensão. */
  tema: string | null;
  /** O módulo ESM, relativo à pasta da extensão. Ainda não carregado. */
  principal: string | null;
  /** As fontes de retrato ao vivo que ela ensina. Ver `FonteRetrato`. */
  retratos: FonteRetrato[];
  /** O que ela acrescenta à interface. Ver `Contribuicoes`. */
  contribui: Contribuicoes;
  /**
   * `abertura` = o módulo sobe com o Mestre, sem esperar o painel abrir. Para o
   * plugin que trabalha sozinho. Ausente em lista lida por um Rust anterior.
   */
  ativacao?: "abertura" | null;
};

/**
 * O que uma extensão acrescenta à interface, DECLARADO.
 *
 * Declarado e não descoberto executando o módulo, e a diferença compra duas
 * coisas: a tela de Plugins lista o que cada extensão faz sem rodar uma linha
 * do código dela, e o módulo só precisa ser importado quando alguém abre o
 * painel ou dispara o comando. Dez extensões instaladas não custam dez módulos
 * na abertura da janela.
 *
 * Espelho de `extensoes::Contribuicoes`, que é quem valida.
 */
export type Contribuicoes = {
  paineis: PainelDeclarado[];
  comandos: ComandoDeclarado[];
  ferramentas: FerramentaDeclarada[];
  camadas: CamadaDeclarada[];
  /** Ausente em lista lida por um Rust anterior a ela. */
  configuracoes?: ConfiguracaoDeclarada[];
  itensDeMenu?: ItemDeMenuDeclarado[];
  secoes?: SecaoDeclarada[];
  substitutos?: SubstitutoDeclarado[];
  estilosDeMedidor?: EstiloDeMedidorDeclarado[];
  paginas?: PaginaDeclarada[];
  /** Ausente em lista lida por um Rust anterior à API 6. */
  efeitos?: EfeitoDeclarado[];
};

/**
 * Um efeito de condição, como o plugin escreve: o `id` é o dele, sem o prefixo.
 * Na mesa ele vira `{plugin}/{id}` -- ver `useDeclarativoStore`. Espelho de
 * `extensoes::Efeito`, que é quem valida.
 */
export type EfeitoDeclarado = DefinicaoDeEfeito;

/**
 * Uma página do plugin, que o daemon serve na rede em `/plugin/{id}/{arquivo}`.
 * Espelho de `extensoes::Pagina`.
 *
 * É o único código de plugin que sai do Mestre, e sai para um navegador de
 * outra máquina -- o OBS, a TV --, numa origem opaca (`sandbox`), sem IPC,
 * sem disco e sem o `localStorage` das telas da mesa. O que ela vê da mesa é o
 * que o plugin publica por `api.mesa.publicar`. Ver `docs/extensoes.md`.
 */
export type PaginaDeclarada = {
  id: string;
  titulo: string;
  arquivo: string;
};

/**
 * Um estilo de medidor: um `.svg` com variáveis (`arquivo`) OU camadas de
 * imagem (`camadas`), nunca os dois -- o Rust recusa na entrada. Espelho de
 * `extensoes::EstiloDeMedidor`. `altura` é a da forma, em fração da largura
 * do medidor. Ver `svg-modelo.ts` e `FormaEmCamadas`.
 */
export type EstiloDeMedidorDeclarado = {
  id: string;
  titulo: string;
  arquivo?: string | null;
  altura: number;
  camadas?: CamadasDoMedidor | null;
  rotulo?: RotuloDoMedidor | null;
};

/**
 * O que a linha acima da forma mostra. Espelho de `ROTULOS`.
 *
 * `acima` é o de sempre, nome e valor; `nome` tira o valor, para a moldura que
 * já escreve o número; `nenhum` tira a linha, para o coração que racha e
 * dispensa legenda.
 */
export type RotuloDoMedidor = "acima" | "nome" | "nenhum";

/**
 * Um medidor feito de imagens: o conteúdo embaixo, a moldura por cima.
 * Espelho de `extensoes::Camadas`. Os caminhos são relativos à pasta do
 * plugin, e o encaixe é FRAÇÃO da forma -- ele escala com a coluna do retrato
 * sem o autor saber o tamanho de tela nenhuma.
 */
export type CamadasDoMedidor = {
  moldura?: string | null;
  /** Recorta o conteúdo pelo alfa, para formas que não são retângulo. */
  mascara?: string | null;
  /** Ausente é a forma inteira. */
  encaixe?: EncaixeDoMedidor | null;
  conteudo: ConteudoDoMedidor;
  /** O valor escrito dentro da forma, por cima de tudo. */
  texto?: TextoDoMedidor | null;
};

/**
 * O valor (`11/13`) dentro da forma. Espelho de `extensoes::Texto`. Cores só
 * em hex -- o Rust recusa o resto, porque elas vão parar num `style`.
 */
export type TextoDoMedidor = {
  /** Ausente é o encaixe do conteúdo. */
  encaixe?: EncaixeDoMedidor | null;
  cor?: string | null;
  contorno?: string | null;
  /** Em fração da altura do encaixe do texto. Ausente é 0,7. */
  tamanho?: number | null;
};

export type EncaixeDoMedidor = { x: number; y: number; largura: number; altura: number };

export type DirecaoDaBarra = "direita" | "esquerda" | "cima" | "baixo";

/** Como o valor ocupa o encaixe. Sem imagem, barra e pontos usam a cor do medidor. */
export type ConteudoDoMedidor =
  | {
      modo: "barra";
      direcao?: DirecaoDaBarra;
      imagem?: string | null;
      /** O trecho vazio, desenhado inteiro embaixo do cheio. */
      vazio?: string | null;
    }
  | {
      modo: "pontos";
      cheio?: string | null;
      vazio?: string | null;
      /** A largura do ponto em fração da altura dele. Ausente é 1, o quadrado. */
      proporcao?: number | null;
      /** Com o máximo acima disto, um ponto e o número (`×11`). Ausente, sem teto. */
      ate?: number | null;
    }
  /** Do vazio ao cheio. O primeiro só aparece no zero. */
  | { modo: "sequencia"; quadros: string[] };

/**
 * Os menus em que um plugin pode pôr item. Espelho de `ALVOS_DE_MENU`.
 *
 * `palco.*` é o botão direito no palco, pelo que está na mão; `linha.*` é o
 * menu de uma linha de lista -- botão direito e três pontos, os dois.
 */
export const ALVOS_DE_MENU = [
  "palco.token",
  "palco.luz",
  "palco.area",
  "palco.quadro",
  "palco.parede",
  "palco.retrato",
  "palco.vazio",
  "linha.cena",
  "linha.personagem",
  "linha.retrato",
  "linha.imagem",
  "linha.quadro",
  "linha.nota",
] as const;

export type AlvoDeMenu = (typeof ALVOS_DE_MENU)[number];

export type ItemDeMenuDeclarado = {
  id: string;
  titulo: string;
  alvo: AlvoDeMenu;
  /** Nome da lista de `icones.ts`. */
  icone: string | null;
};

export type SecaoDeclarada = { id: string; titulo: string; alvo: "ficha" };

/** `secao:{medidores|...}` ou `janela:{personagem|...}`. O Rust valida. */
export type SubstitutoDeclarado = { alvo: string };

/**
 * Uma configuração que a extensão declara, como as `contributes.configuration`
 * do VSCode. Espelho de `extensoes::Configuracao`, que valida: a chave começa
 * com o id da extensão, o padrão é do tipo, a escolha tem opções.
 *
 * Vira uma `Definicao` no registro com `dono` = id da extensão -- ver
 * `useExtensoesStore`, que sincroniza as duas listas.
 */
export type ConfiguracaoDeclarada = {
  chave: string;
  titulo: string;
  descricao: string | null;
  tipo: "booleano" | "numero" | "texto" | "escolha" | "lista";
  padrao: unknown;
  escopo: "maquina" | "campanha" | "ambos";
  opcoes: string[];
  /**
   * O que a tela mostra no lugar de cada opção, quando o valor gravado não é
   * a palavra que se quer ler. API 7.
   */
  rotulos?: Record<string, string>;
  minimo: number | null;
  maximo: number | null;
};

export type PainelDeclarado = {
  id: string;
  titulo: string;
  subtitulo: string | null;
};

export type ComandoDeclarado = {
  id: string;
  titulo: string;
  /**
   * Como o atalho se escreve. Não pode roubar um de fábrica, e não precisa ser
   * conferido para isso: a tabela é consultada em ordem e os do plugin entram
   * DEPOIS, então `Ctrl+Z` declarado por uma extensão nunca alcança o desfazer.
   */
  atalho: string | null;
  grupo: string | null;
};

export type FerramentaDeclarada = {
  id: string;
  titulo: string;
  icone: string | null;
};

/**
 * Uma camada sobre o mapa. Do MESTRE, e não da mesa.
 *
 * Plugin só alcança o Mestre nesta etapa, então o que ele desenha vive na
 * bancada — que é o que os alfinetes e os postits já são. O dado dela sai do
 * payload publicado pelo mesmo caminho que apaga aqueles dois.
 */
export type CamadaDeclarada = { id: string; titulo: string };

/** A chave de uma contribuição: quem a trouxe, e qual é. */
export function chaveContribuicao(extensaoId: string, id: string): string {
  return `${extensaoId}/${id}`;
}

export type Extensao = Manifesto & { habilitada: boolean };

/**
 * As duas naturezas de extensão, que é por onde a tela as separa.
 *
 * A distinção não é cosmética: um TEMA é CSS que a cascata aplica, e o pior que
 * ele faz é deixar a interface feia — dá para desligar olhando. Uma
 * FUNCIONALIDADE é código que roda com o alcance da janela, e instalar uma é
 * confiar em quem a escreveu, do mesmo jeito que se confia numa extensão do
 * VSCode.
 *
 * Separar as duas na lista é o que impede a segunda decisão de se disfarçar de
 * primeira.
 */
export type TipoExtensao = "tema" | "funcionalidade";

/**
 * O que esta extensão é, pelo que ela declara.
 *
 * `principal` manda: uma extensão que traz CÓDIGO é funcionalidade mesmo que
 * traga um tema junto. O contrário — classificar pelo `tema` primeiro —
 * esconderia o código de quem só olhou o cabeçalho do grupo.
 *
 * Extensão que não declara nem um nem outro cai em funcionalidade, e não em
 * tema: ela é o esqueleto de quem está começando a escrever a sua, e anunciá-la
 * como tema prometeria uma aparência que não existe no disco.
 */
export function tipoDaExtensao(extensao: Manifesto): TipoExtensao {
  return extensao.principal || !extensao.tema ? "funcionalidade" : "tema";
}

/**
 * A URL de um arquivo de dentro de uma extensão.
 *
 * O `localhost` não é enfeite: sem ele o primeiro segmento vira a AUTORIDADE
 * da URL, e o id sai do caminho que o protocolo lê. Ver o
 * `register_uri_scheme_protocol` em `lib.rs`.
 *
 * O `versao` na busca é o que faz religar uma extensão mostrar o CSS editado:
 * o protocolo já responde `no-store`, mas a webview guarda folha de estilo por
 * URL dentro da mesma página, e sem isso trocar o arquivo no disco não
 * apareceria sem reabrir o aplicativo.
 */
export function urlDaExtensao(
  id: string,
  arquivo: string,
  versao?: string,
): string {
  const base = `ato20-ext://localhost/${encodeURIComponent(id)}/${arquivo
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

  return versao ? `${base}?v=${encodeURIComponent(versao)}` : base;
}

/**
 * A extensão com o texto do manifesto no idioma da tela.
 *
 * Da API 7 em diante, todo campo de texto do manifesto pode vir como mapa por
 * idioma -- ver `TextoDePlugin`. O Rust valida e devolve o mapa como veio; é
 * AQUI, na chegada, que cada um vira a string do idioma desta tela. Daqui para
 * dentro o aplicativo inteiro lê `string`, como sempre leu, e nenhuma tela
 * precisa saber que o plugin fala duas línguas.
 *
 * O tipo de entrada é `Extensao` por conveniência: é o formato que o IPC
 * devolve, só que com mapas onde aqui se promete string. Esta função é o que
 * torna a promessa verdadeira.
 */
export function noIdiomaDaTela(extensao: Extensao): Extensao {
  const titulo = <T extends { titulo: string }>(item: T): T => ({
    ...item,
    titulo: resolverTexto(item.titulo),
  });
  const c = extensao.contribui;

  return {
    ...extensao,
    nome: resolverTexto(extensao.nome),
    descricao: resolverOpcional(extensao.descricao),
    retratos: (extensao.retratos ?? []).map((fonte) => ({
      ...fonte,
      rotulo: resolverTexto(fonte.rotulo),
      campo: resolverTexto(fonte.campo),
    })),
    contribui: c && {
      ...c,
      paineis: (c.paineis ?? []).map((painel) => ({
        ...titulo(painel),
        subtitulo: resolverOpcional(painel.subtitulo),
      })),
      comandos: (c.comandos ?? []).map((comando) => ({
        ...titulo(comando),
        grupo: resolverOpcional(comando.grupo),
      })),
      ferramentas: (c.ferramentas ?? []).map(titulo),
      camadas: (c.camadas ?? []).map(titulo),
      configuracoes: c.configuracoes?.map((configuracao) => ({
        ...titulo(configuracao),
        descricao: resolverOpcional(configuracao.descricao),
        rotulos:
          configuracao.rotulos &&
          Object.fromEntries(
            Object.entries(configuracao.rotulos).map(([opcao, rotulo]) => [
              opcao,
              resolverTexto(rotulo),
            ]),
          ),
      })),
      itensDeMenu: c.itensDeMenu?.map(titulo),
      secoes: c.secoes?.map(titulo),
      estilosDeMedidor: c.estilosDeMedidor?.map(titulo),
      paginas: c.paginas?.map(titulo),
      efeitos: c.efeitos?.map((efeito) => ({
        ...titulo(efeito),
        dica: efeito.dica === undefined ? undefined : resolverTexto(efeito.dica),
      })),
    },
  };
}

export async function listarExtensoes(): Promise<Extensao[]> {
  return (await call<Extensao[]>("extensoes_listar")).map(noIdiomaDaTela);
}

/**
 * Abre o diálogo nativo e traz uma pasta de extensão para a máquina.
 *
 * `null` quando o usuário fecha o diálogo sem escolher — cancelar não é falha,
 * e tratá-lo como erro poria um aviso na tela de quem só mudou de ideia.
 *
 * Pasta e não zip nesta etapa: uma extensão é uma pasta com `manifest.json`
 * dentro, e quem clona do GitHub já tem exatamente isso. O zip entra quando
 * houver de onde baixar sem clonar.
 *
 * O título do diálogo vem de quem chama: este módulo também é lido pelo
 * celular e pela TV, e o texto do Mestre não tem por que ir junto.
 */
export async function importarExtensao(
  titulo: string,
): Promise<Extensao | null> {
  const escolhida = await open({
    directory: true,
    multiple: false,
    title: titulo,
  });

  if (typeof escolhida !== "string") return null;

  return noIdiomaDaTela(await call<Extensao>("extensao_importar", { caminho: escolhida }));
}

/** Desinstala: a pasta sai do disco e a linha sai do banco. */
export function removerExtensao(id: string): Promise<void> {
  return call<void>("extensao_remover", { id });
}

/** Liga ou desliga, sem tocar no disco. */
export function habilitarExtensao(
  id: string,
  habilitada: boolean,
): Promise<void> {
  return call<void>("extensao_habilitar", { id, habilitada });
}
