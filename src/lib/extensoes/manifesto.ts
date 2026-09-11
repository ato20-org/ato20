"use client";

import { open } from "@tauri-apps/plugin-dialog";

import type { FonteRetrato } from "@/lib/extensoes/fontes";
import { call } from "@/lib/vault/bridge";

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
export const API_VERSAO = 1;

/**
 * O que uma extensão diz de si.
 *
 * Espelho de `extensoes::Manifesto` em Rust, que é quem lê o `manifesto.json`
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
};

export type PainelDeclarado = { id: string; titulo: string; subtitulo: string | null };

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

export type FerramentaDeclarada = { id: string; titulo: string; icone: string | null };

/**
 * Uma camada sobre o mapa. Do MESTRE, e não da mesa.
 *
 * Plugin só alcança o Operador nesta etapa, então o que ele desenha vive na
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
export function urlDaExtensao(id: string, arquivo: string, versao?: string): string {
  const base = `ato20-ext://localhost/${encodeURIComponent(id)}/${arquivo
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

  return versao ? `${base}?v=${encodeURIComponent(versao)}` : base;
}

export function listarExtensoes(): Promise<Extensao[]> {
  return call<Extensao[]>("extensoes_listar");
}

/**
 * Abre o diálogo nativo e traz uma pasta de extensão para a máquina.
 *
 * `null` quando o usuário fecha o diálogo sem escolher — cancelar não é falha,
 * e tratá-lo como erro poria um aviso na tela de quem só mudou de ideia.
 *
 * Pasta e não zip nesta etapa: uma extensão é uma pasta com `manifesto.json`
 * dentro, e quem clona do GitHub já tem exatamente isso. O zip entra quando
 * houver de onde baixar sem clonar.
 */
export async function importarExtensao(): Promise<Extensao | null> {
  const escolhida = await open({
    directory: true,
    multiple: false,
    title: "Escolha a pasta da extensão",
  });

  if (typeof escolhida !== "string") return null;

  return call<Extensao>("extensao_importar", { caminho: escolhida });
}

/** Desinstala: a pasta sai do disco e a linha sai do banco. */
export function removerExtensao(id: string): Promise<void> {
  return call<void>("extensao_remover", { id });
}

/** Liga ou desliga, sem tocar no disco. */
export function habilitarExtensao(id: string, habilitada: boolean): Promise<void> {
  return call<void>("extensao_habilitar", { id, habilitada });
}
