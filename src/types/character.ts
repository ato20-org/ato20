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
  /**
   * Os medidores deste personagem. Ver `Medidor`.
   *
   * Opcional porque o DAEMON tira os escondidos antes de responder, e porque
   * campanha antiga não traz o campo. Lista vazia e ausência querem dizer a
   * mesma coisa: nenhum medidor a desenhar.
   */
  medidores?: Medidor[];
  criadoEm: number;
};

/**
 * Como a mesa lê um medidor.
 *
 * Três, e cada um responde uma pergunta diferente. `barra` é leitura de
 * relance, para vida num combate; `pontos` conta unidades discretas, para três
 * cargas de magia ou duas tochas; `porcentagem` diz a proporção sem prometer
 * uma escala, para moral e progresso.
 *
 * O espelho em Rust é `vault::characters::Estilo`.
 */
export type EstiloMedidor = "barra" | "pontos" | "porcentagem";

/**
 * Um número entre zero e um teto, com nome, cor e forma.
 *
 * "Medidor" e não "vital", e a escolha é do tipo e não da tradução: vital
 * amarraria em vida, e o mesmo desenho serve para sanidade, munição, carga,
 * moral e tocha acesa. O que o mestre precisa dizer é "este personagem tem um
 * número que sobe e desce, e a mesa o vê assim".
 *
 * Mora no ÍNDICE (`personagens.json`), ao lado de `aparencias`, e não num
 * arquivo por personagem como o inventário. A razão é a publicação: o Mestre
 * manda o estado da mesa dez vezes por segundo, e o medidor vai junto para a
 * barra descer na TV no instante em que o mestre a desce. O índice já está
 * inteiro na memória do `useCharactersStore` e já é lido por `retratosDaCena`;
 * um arquivo por personagem obrigaria a carregar todos no boot e a reler a cada
 * troca de cena, para poupar a regravação de alguns KB por golpe.
 *
 * Inteiros. Meio ponto de vida existe em algum sistema, mas fracionário pagaria
 * arredondamento em três telas por um caso que o mestre resolve dobrando a
 * escala — vinte em vez de dez.
 *
 * O espelho em Rust é `vault::characters::Medidor`. Campo novo aqui precisa de
 * campo novo lá.
 */
export type Medidor = {
  id: string;
  nome: string;
  /** Da mesma paleta do lápis e das uniões de retrato. Ver `CORES_LAPIS`. */
  cor: string;
  estilo: EstiloMedidor;
  atual: number;
  maximo: number;
  /**
   * A mesa não vê — nem o dono do personagem.
   *
   * O relógio da desgraça, a corrupção que ainda não se manifestou. Filtrado no
   * daemon antes de responder e no Mestre antes de publicar: um medidor
   * escondido que chegasse ao celular e sumisse no React já teria vazado —
   * estaria no JSON que o navegador guardou.
   */
  escondido: boolean;
};

/** O que se troca num medidor. Ausente não mexe. Espelha `PatchMedidor`. */
export type PatchMedidor = {
  nome?: string;
  cor?: string;
  estilo?: EstiloMedidor;
  atual?: number;
  maximo?: number;
  escondido?: boolean;
};

/**
 * Quantos medidores cabem num personagem. Espelha `MAX_MEDIDORES`.
 *
 * O limite é de LAYOUT: os medidores desenham numa coluna ao lado do retrato, e
 * passando disso a coluna fica mais alta que o rosto que ela acompanha — a
 * figura vira apêndice do painel em vez do contrário.
 */
export const MAX_MEDIDORES = 6;

/**
 * Um medidor de fábrica da campanha: tudo que um `Medidor` tem, menos o valor.
 *
 * Sem `atual` de propósito. O valor é do PERSONAGEM — é a única coisa que
 * distingue o goblin com três de vida do goblin com vinte —, e pedi-lo aqui
 * daria ao mestre um campo para preencher que não quer dizer nada. O medidor
 * materializado nasce cheio.
 *
 * ## Molde, e não vínculo
 *
 * Criar um modelo materializa um medidor de verdade em cada ficha, e dali em
 * diante o medidor é DELA: o mestre renomeia, troca a cor, apaga. Editar o
 * modelo depois não empurra nada — para isso existe "Aplicar em todos", que é um
 * gesto com nome. O vínculo vivo seria a outra escolha possível, e ela desfaria
 * o ajuste que o mestre fez num personagem sem ele ter pedido.
 *
 * O espelho em Rust é `vault::modelos::Modelo`.
 */
export type ModeloDeMedidor = {
  id: string;
  nome: string;
  cor: string;
  estilo: EstiloMedidor;
  maximo: number;
  escondido: boolean;
};

/** O que se troca num modelo. Ausente não mexe. Espelha `PatchModelo`. */
export type PatchModelo = {
  nome?: string;
  cor?: string;
  estilo?: EstiloMedidor;
  maximo?: number;
  escondido?: boolean;
};

/** Quantos modelos cabem numa campanha. Espelha `MAX_MODELOS`. */
export const MAX_MODELOS = MAX_MEDIDORES;

/** O que voltou de materializar modelos. Espelha `Aplicacao`. */
export type AplicacaoDeModelos = {
  /** O modelo recém-criado, quando houve um. */
  modelo: ModeloDeMedidor | null;
  /** Quantos personagens receberam ao menos um medidor. */
  alcancados: number;
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
