/**
 * Personagem e jogador são coisas separadas.
 *
 * O jogador é a pessoa: um id, um token e um nome que ele mesmo digitou no
 * celular. Existe enquanto o mestre o mantém na mesa, e não viaja no zip.
 *
 * O personagem é conteúdo de campanha. Vive no vault, viaja no zip, sobrevive
 * ao jogador — e é isso que motivou a separação. Antes, o que durava (a ficha, a
 * imagem da miniatura) estava pendurado na identidade de quem joga, e quem
 * decidia se aquilo existia era o próprio jogador: podia nunca anexar nada, ou
 * apagar tudo no meio da campanha. Para amarrar uma miniatura no mapa a um
 * personagem, é preciso que o personagem seja o lado estável.
 *
 * O espelho destes tipos em Rust é `vault::characters`. Campo novo aqui precisa
 * de campo novo lá.
 */

export type Personagem = {
  id: string;
  nome: string;
  /**
   * A ficha, pelo NOME do arquivo em `anexos/mestre/`.
   *
   * Anexo, e não asset, porque ficha é documento: costuma ser PDF, e o acervo
   * só aceita imagem e som. E porque ela não precisa chegar à TV — quem a lê é
   * o jogador, atrás do token dele, e o mestre, pelo IPC.
   */
  ficha?: string;
  /**
   * O retrato, por id do ACERVO.
   *
   * Asset, e não anexo, e a razão é a TV: o Espectador não tem token nem IPC, e
   * alcança imagem só por `/asset/{id}`. Um retrato guardado como anexo do
   * personagem exigiria abrir uma rota pública para arquivo de nome
   * adivinhável — justamente o problema que manter os anexos atrás do token
   * resolve.
   *
   * Para o mestre a diferença é invisível: ele anexa um arquivo, e quem o põe
   * no acervo é `preencherCampoComArquivo`.
   */
  retrato?: string;
  /**
   * O retrato AO VIVO, por URL de uma página externa.
   *
   * Convive com `retrato` em vez de substituí-lo, e a convivência é o ponto: a
   * página viva depende de internet e a imagem do acervo não. Quem tem as duas
   * mostra a página quando ela carrega.
   *
   * A URL INTEIRA, e não um par fonte-mais-código. Quem sabe montar a URL de um
   * serviço é a extensão que declara a fonte — guardar o par aqui faria uma
   * extensão desinstalada deixar o retrato ilegível.
   *
   * O espelho em Rust é `Personagem::retrato_url`.
   */
  retratoUrl?: string;
  /**
   * A miniatura, por id do ACERVO. Mesma razão do retrato.
   *
   * Uma, e não uma lista: o campo responde "qual é a peça deste personagem no
   * mapa", e essa pergunta tem uma resposta.
   */
  miniatura?: string;
  criadoEm: number;
};

/**
 * Quem pôs o anexo ali.
 *
 * No disco isto é o DIRETÓRIO (`anexos/mestre/`, `anexos/jogador/`), e não um
 * campo de índice: sem índice para dessincronizar, e a permissão vira checagem
 * de caminho. A consequência visível é que "ficha.pdf" do mestre e "ficha.pdf"
 * do jogador são dois arquivos distintos, e por isso o autor faz parte da
 * identificação de um anexo — não é informação decorativa.
 */
export type AnexoAutor = "mestre" | "jogador";

export type AnexoPersonagem = {
  /** Nome do arquivo em disco, já saneado. É o identificador. */
  arquivo: string;
  tamanho: number;
  mimeType: string;
  autor: AnexoAutor;
};

/**
 * Os campos nomeados do personagem.
 *
 * Os três primeiros pedem ARQUIVO; `retratoUrl` pede texto colado. É a razão de
 * ele não entrar na lista `CAMPOS` da ficha, que desenha um seletor de arquivo
 * para cada linha — ver `character-window`.
 */
export type CampoPersonagem = "ficha" | "retrato" | "miniatura" | "retratoUrl";

/** O jogador pode mexer neste anexo. */
export function doJogador(anexo: AnexoPersonagem): boolean {
  return anexo.autor === "jogador";
}
