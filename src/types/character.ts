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
   * mapa AGORA", e essa pergunta tem uma resposta.
   *
   * As `aparencias` não moram aqui, e é o que mantém o resto do aplicativo
   * ignorante delas — ver o tipo `Aparencia`.
   */
  miniatura?: string;
  /**
   * As aparências deste personagem, a primeira sendo sempre a Padrão.
   *
   * Opcional porque o DAEMON a tira antes de responder: o celular do jogador
   * recebe o personagem sem a lista, e quem a lê inteira é só o mestre, pelo
   * IPC. Ver `sem_aparencias` em `serve.rs`.
   */
  aparencias?: Aparencia[];
  /** Qual linha da lista está no ar. Ver `Aparencia`. */
  aparenciaAtiva?: string;
  criadoEm: number;
};

/** O id da aparência que todo personagem tem. Espelha `APARENCIA_PADRAO`. */
export const APARENCIA_PADRAO = "padrao";

/**
 * Uma aparência: um nome e o que ele troca na cara do personagem.
 *
 * Troca o RETRATO e a MINIATURA, e nada mais. Não troca o nome nem a ficha: o
 * personagem continua sendo o mesmo, e o que muda é como ele se mostra na mesa.
 * Uma aparência que trocasse o nome seria outro personagem, e o token no mapa
 * perderia a amarra com a ficha ao trocar.
 *
 * A lista guarda as ALTERNATIVAS; quem manda continua sendo o trio de cima do
 * `Personagem`, que **é** a aparência ativa. É a razão de nada mais no
 * aplicativo precisar saber que aparência existe: o palco, a TV e o telefone
 * leem `retrato` e `miniatura` como sempre leram, e trocar é trocar de lugar
 * entre a linha que sai e o topo.
 *
 * Houve uma lista de miniaturas aqui antes, removida porque pedia ao mestre uma
 * escolha que ele não tinha por que fazer — eram miniaturas sem nome, e escolher
 * entre elas não queria dizer nada. A aparência é a razão que faltava: aqui a
 * escolha tem nome ("Ferido", "Lobo") e um sentido em cena.
 *
 * O espelho em Rust é `vault::characters::Aparencia`.
 */
export type Aparencia = {
  id: string;
  nome: string;
  retrato?: string;
  retratoUrl?: string;
  miniatura?: string;
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

/**
 * Todo asset do acervo que este personagem usa como cara.
 *
 * O trio de cima **e** toda aparência guardada. As duas perguntas que fazem esta
 * conta — "de quem é este arquivo" e "posso apagá-lo" — valem igual para a cara
 * que está no ar e para a que está esperando a vez: a linha guardada volta a ser
 * a ativa num clique, e uma imagem apagada nesse meio-tempo deixaria o
 * personagem com a cara quebrada sem nada apontando para o porquê.
 *
 * `retratoUrl` fica de fora porque não é asset: é uma página externa, e o acervo
 * não tem o que guardar nem o que apagar dela.
 */
export function imagensDoPersonagem(personagem: Personagem): string[] {
  const todos = [
    personagem.retrato,
    personagem.miniatura,
    ...(personagem.aparencias ?? []).flatMap((aparencia) => [
      aparencia.retrato,
      aparencia.miniatura,
    ]),
  ];

  return [...new Set(todos.filter((id): id is string => Boolean(id)))];
}

/** O jogador pode mexer neste anexo. */
export function doJogador(anexo: AnexoPersonagem): boolean {
  return anexo.autor === "jogador";
}
