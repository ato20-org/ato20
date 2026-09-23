/**
 * Contrato central do projeto.
 *
 * Toda posição vive em "coordenadas de cena": um plano fixo de
 * SCENE_WIDTH x SCENE_HEIGHT. Cada visão (Mestre, Espectador, Jogador) escala
 * esse plano para caber na tela dela. Sem isso, o que o mestre posiciona não
 * bate com o que aparece na TV.
 */

import { novoId } from "@/lib/id";

export const SCENE_WIDTH = 1920;
export const SCENE_HEIGHT = 1080;

/**
 * `pdf` saiu junto com o material de regras: era o unico caminho que criava
 * arquivo desse tipo.
 */
/** `file` é tudo o que não é imagem nem som: PDF, texto, o que vier. */
export type AssetKind = "image" | "audio" | "file";

/**
 * Metadados de um arquivo enviado pelo mestre. O binário fica em `assets/`.
 *
 * Este tipo atravessa o IPC: o espelho dele em Rust é `vault::assets::AssetMeta`,
 * e é o Rust que grava `assets.json`. Campo novo aqui precisa de campo novo lá.
 */
export type AssetMeta = {
  id: string;
  kind: AssetKind;
  name: string;
  mimeType: string;
  size: number;
  createdAt: number;
  /** Dimensões naturais, medidas no upload. Só existem para `kind: "image"`. */
  naturalWidth?: number;
  naturalHeight?: number;
  /**
   * Pasta em que o mestre guardou o arquivo. Ausente = raiz.
   *
   * Guarda o id, não o nome: renomear a pasta não pode obrigar a reescrever
   * todos os arquivos dentro dela.
   */
  folderId?: string;
  /**
   * A que este arquivo PERTENCE: `cena` ou `personagem`.
   *
   * Ausente é o caso comum — imagem que serve a qualquer cena: mobília, um
   * handout, um mapa dentro do mapa. Presente quando tem dono: fundo de cena,
   * retrato ou miniatura de personagem.
   *
   * Existe para a BIBLIOTECA não listá-lo. Antes toda imagem aparecia ali,
   * inclusive o fundo e os dois arquivos de cada personagem, e a lista
   * misturava o que se escolhe com o que já foi escolhido. O espelho em Rust é
   * `AssetMeta::escopo`.
   */
  escopo?: EscopoAsset;
  /**
   * A forma da onda, um valor de 0 a 100 por barra. Só para `audio`.
   *
   * Medida uma vez pela tela, na primeira vez que a faixa aparece na barra da
   * trilha, e gravada no vault. Ausente = ainda não medida, e a barra desenha
   * uma linha lisa.
   */
  peaks?: number[];
  /**
   * Como este som deve tocar. Só para `kind: "audio"`.
   *
   * O arquivo passou a declarar o que ele É, e não só o que ele contém. Antes o
   * acervo oferecia os três destinos em toda linha — a mesma chuva podia ser a
   * trilha de uma viagem, o fundo de uma taverna e um susto de um segundo — e a
   * flexibilidade custava a lista: três botões por linha, nenhuma ordem, e a
   * pergunta "qual era mesmo a música de combate?" respondida lendo nomes.
   *
   * Com o tipo no arquivo, acionar é UM gesto e a lista se agrupa sozinha. Quem
   * quiser a mesma chuva nos dois papéis importa duas vezes, ou troca o tipo —
   * é um menu, e não uma decisão definitiva.
   *
   * Ausente é estado válido e não há migração: som importado antes deste campo,
   * e som largado na janela sem passar pelo botão, ficam sem tipo até alguém
   * escolher um. A lista os junta num grupo próprio em vez de chutar.
   */
  tipoDeSom?: TipoDeSom;
};

/**
 * O que um som é na mesa.
 *
 * `trilha` é a música: uma de cada vez, com começo, meio e fim, e navegável.
 * `ambiente` é o fundo que fica: repete, e vários ao mesmo tempo. `disparo` é o
 * efeito: toca uma vez e some.
 *
 * Mora aqui e não junto das cores porque é do DOMÍNIO: o `AssetMeta` o carrega,
 * o Rust o grava e o pad o usa. A cor de cada um é uma decisão de tela, e
 * continua em `CORES_DO_SOM`.
 */
export type TipoDeSom = "trilha" | "ambiente" | "disparo";

/**
 * Pasta do acervo.
 *
 * Só raiz, sem aninhamento: numa campanha o que se quer é separar mapas de
 * retratos e de fichas, e uma árvore profunda cobraria navegação em troca de
 * organização que ninguém pediu.
 */
/** Pasta do acervo. Pasta dentro de pasta pelo `parentId`; ausente = raiz. */
export type AssetFolder = {
  id: string;
  name: string;
  createdAt: number;
  parentId?: string;
};

/** O dono de um arquivo do acervo, quando ele tem um. */
export type EscopoAsset = "cena" | "personagem";

/** Uma imagem posicionada sobre o fundo da cena. */
export type CanvasItem = {
  id: string;
  assetId: string;
  /**
   * De quem e este token, quando ele e um.
   *
   * Ausente na imensa maioria dos itens: mobilia, mapa dentro do mapa, marca
   * de sangue. Presente quando o item entrou pela lista de personagens, e e o
   * que permite ao mapa saber que aquela figura E o Edgar em vez de ser um
   * arquivo chamado "Personagem - Edgar.png".
   *
   * Aponta para o PERSONAGEM, e nao para o jogador: e a razao de o personagem
   * existir como conteudo de campanha -- ver `Personagem`. O token sobrevive a
   * quem o interpreta trocar de maos, e continua valendo no zip que viaja.
   *
   * Guarda o id e nao o nome: renomear o personagem tem de renomear o token,
   * e um nome copiado aqui viraria mentira na primeira renomeacao.
   */
  personagemId?: string;
  /**
   * O grupo em que o item está na lista de camadas. Ausente = solto na raiz.
   *
   * Só organização: não muda o `z`, não muda o desenho. A mesa nunca vê grupo.
   * Ver `Grupo`.
   */
  grupoId?: string;
  /** Canto superior esquerdo, em coordenadas de cena. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Graus, no sentido horário, em torno do centro do item. */
  rotation: number;
  /** Ordem de empilhamento. Maior fica na frente. */
  z: number;
  /** Item travado não é selecionável nem arrastável no Mestre. */
  locked: boolean;
  /**
   * Espelhamento. Aplicado no referencial do próprio item, depois do giro:
   * espelhar um token é virar o desenho dele, não mover a caixa.
   *
   * Opcionais para não exigir migração dos itens já gravados.
   */
  flipX?: boolean;
  flipY?: boolean;
  /**
   * Opacidade da imagem, de 0 a 1. Ausente = opaca.
   *
   * Viaja com a cena, e não é um esmaecido só do palco do mestre: o uso é
   * desenhar o que está MEIO ali — o fantasma, a lembrança, o contorno da
   * passagem que ninguém abriu ainda, o token de quem caiu. Se a mesa visse a
   * figura cheia, não haveria efeito nenhum.
   *
   * Opcional pela mesma razão do espelhamento: item já gravado não precisa de
   * migração, e o caso comum — imagem opaca — continua sem campo nenhum.
   */
  opacity?: number;
};

/**
 * Os recortes que uma área escondida sabe ter.
 *
 * Os mesmos nomes das formas do quadro -- `retangulo`, `elipse` --, porque é o
 * mesmo vocabulário para a mesma coisa: a diferença entre uma forma e uma área
 * é o que ela FAZ (cercar × esconder), não o desenho dela.
 */
export const FORMATOS_DE_AREA = ["retangulo", "elipse", "poligono"] as const;

export type FormatoDeArea = (typeof FORMATOS_DE_AREA)[number];

/**
 * Área escondida. Opaca no Jogador e no Espectador, semi-transparente no
 * Mestre — o mestre vê o que tem embaixo, a mesa não.
 *
 * A CAIXA é a verdade da área, nos três formatos: `x, y, width, height` é o
 * que o gizmo move, escala e gira, o que o alinhamento usa como alvo e o que
 * `limitesDoConteudo` mede. O `formato` diz só como essa caixa é PINTADA --
 * cheia, arredondada ou recortada pelos vértices --, e é isso que deixa o
 * polígono entrar sem que snap, limites e desfazer aprendam uma geometria
 * nova.
 */
export type FogRegion = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Revelada deixa de esconder em todas as visões. */
  revealed: boolean;
  /**
   * Ausente = retângulo.
   *
   * Opcional pela mesma razão do espelhamento do item: toda área gravada antes
   * disto era um retângulo, e o caso comum continua sem campo nenhum.
   */
  formato?: FormatoDeArea;
  /**
   * Graus, no sentido horário, em torno do centro da caixa. Ausente = 0.
   *
   * Existe porque corredor, mesa e parede raramente correm no eixo da tela, e
   * sem giro esconder um deles obrigava a cobrir metade do que está em volta.
   */
  rotation?: number;
  /**
   * Só o polígono: os vértices ACHATADOS -- `x0, y0, x1, y1, ...` --, cada um
   * em FRAÇÃO da caixa, de 0 a 1.
   *
   * Fração e não unidade de cena: assim mover, escalar e girar a área são o
   * gesto de sempre sobre a caixa, sem tocar num vértice sequer, e nenhum
   * ponto pode cair fora dela -- que é o que mantém o `transbordo` do plano em
   * zero. Ver `poligonoEmCena` e `normalizarPoligono`.
   */
  pontos?: number[];
};

/**
 * Grade sobre o mapa.
 *
 * Mora na CENA, e não numa preferência da máquina, porque cada mapa tem a
 * própria escala: a grade que casa com uma taverna desenhada em 40px por
 * quadrado não casa com um mapa de região. E porque ela precisa viajar — a
 * mesa vê a mesma grade que o mestre, senão contar movimento em voz alta não
 * significa nada.
 *
 * Ausente em `Scene.grid` = sem grade. É o padrão: a maioria das cenas de
 * ambiente não quer uma.
 */
export type SceneGrid = {
  /**
   * Lado do quadrado, em unidades de cena.
   *
   * Unidade de cena e não pixel de tela, como todo o resto: assim a grade
   * acompanha o zoom e é a mesma no palco do mestre, na TV de 1920 e no celular
   * de 390.
   */
  size: number;
  /**
   * Deslocamento da origem.
   *
   * Existe porque mapas comprados já vêm com uma grade desenhada, e ela quase
   * nunca começa no canto exato da imagem. Sem isto, casar as duas exigiria
   * recortar o arquivo.
   */
  offsetX: number;
  offsetY: number;
  /** Opacidade da linha, de 0 a 1. */
  opacity: number;
  /**
   * Linha escura em vez de clara.
   *
   * Duas opções, e não um seletor de cor: o que decide é o mapa embaixo, e
   * mapa de RPG é claro (pergaminho, planta baixa) ou escuro (caverna, noite).
   * Um seletor cobriria casos que não existem e pediria uma decisão a mais em
   * cada cena.
   */
  dark?: boolean;
};

/**
 * Ponto de anotação: um alfinete no mapa com nota e anexos, só do mestre.
 *
 * Mora na CENA porque é colado num lugar dela — o alçapão atrás do balcão, a
 * marca na parede do terceiro corredor. Uma lista de notas fora da cena
 * perderia justamente a coordenada, que é a razão de existir.
 *
 * Morar na cena tem um custo que precisa de guarda: a cena viaja inteira para
 * a mesa. É por isso que `sceneForTable` existe e que a camada que desenha os
 * pontos vive no `MestreStage`, e não no `SceneLayer` compartilhado — sem as
 * duas coisas, o jogador leria a preparação do mestre no inspetor do
 * navegador.
 */
export type MapPin = {
  id: string;
  /** Onde o alfinete crava, em coordenadas de cena. */
  x: number;
  y: number;
  /** Uma linha, para reconhecer o ponto sem abrir a nota. */
  title: string;
  /** O texto livre. Pode ser vazio: às vezes o anexo é a nota. */
  note: string;
  /**
   * Anexos, por id do acervo.
   *
   * Ids e não arquivos próprios: importar já copia para `assets/` da campanha,
   * e `/asset/{id}` já serve com token. Um segundo cofre de arquivos
   * duplicaria os dois lados para nada — e é justamente esse caminho que
   * "transmitir" usa para a imagem aparecer na TV.
   */
  attachments: string[];
};

/** O que o chamador informa ao cravar um ponto; o resto é do store. */
export type NewMapPin = Pick<MapPin, "x" | "y"> &
  Partial<Pick<MapPin, "title" | "note">>;

/**
 * As cores de um postit.
 *
 * Nome e não hex, ao contrário de `CORES_LAPIS`. A diferença é o que cada uma
 * é: cor de lápis é tinta, e tinta tem um valor exato; cor de postit é papel, e
 * papel precisa de fundo, borda e texto que contrastem tanto no tema claro
 * quanto no escuro. Um `#fde047` no arquivo travaria os três de uma vez, e o
 * papel amarelo do tema escuro ficaria a mesma mancha berrante do claro.
 *
 * Quatro coloridas, e não seis como o lápis: aqui a cor separa ASSUNTO — o que
 * é pista, o que é regra, o que é fala de PNJ, o que é lembrete — e uma mesa
 * não sustenta seis assuntos combinados de cabeça. O branco é o quinto e não
 * conta como assunto: é o papel sem cor, para quem não quer classificar nada
 * ou quer uma nota neutra sobre um mapa que já tem amarelo demais.
 */
export const CORES_POSTIT = [
  "amarelo",
  "rosa",
  "azul",
  "verde",
  "branco",
] as const;

export type CorPostit = (typeof CORES_POSTIT)[number];

/** Tamanho de um postit recém-colado, em unidades de cena. */
export const POSTIT_LARGURA = 260;
export const POSTIT_ALTURA = 180;

/** O menor que o mestre pode encolher um postit, em unidades de cena. */
export const POSTIT_MINIMO = 120;

/**
 * Tamanho do texto de um postit recém-colado, em unidades de cena.
 *
 * Fora da escada de `DOCUMENTO_FONTES` de propósito: 15 é o tamanho com que
 * todo postit já colado foi escrito, e mudá-lo para um degrau da escada
 * reescreveria a aparência de quadros antigos sem ninguém ter pedido. O
 * primeiro toque nos botões entra na escada e de lá não sai.
 */
export const POSTIT_FONTE = 15;

/**
 * Um postit colado na board: texto do mestre em qualquer lugar do mapa.
 *
 * Irmão do ponto de anotação, e separado dele de propósito. O alfinete é uma
 * COORDENADA — ele aponta o alçapão atrás do balcão, e a nota dele abre num
 * cartão à parte porque a coordenada não tem tamanho para caber texto. O postit
 * é uma CAIXA: ele tem largura e altura, o texto vive à vista dentro dele, e o
 * que ele marca é a região embaixo, não um ponto.
 *
 * Escala com o zoom, e nisto ele difere do cartão do alfinete (ver
 * `PinWindow`). É a escolha que o faz parecer papel colado no mapa em vez de
 * janela flutuando sobre ele: afastar o zoom afasta o papel junto.
 *
 * Mora na CENA, como os pontos e os riscos — e com o mesmo custo, que a cena
 * viaja inteira para a mesa. `sceneForTable` apaga este campo antes de
 * publicar, e a camada que o desenha vive no `MestreStage` e não no
 * `SceneLayer`. As duas barreiras juntas: vazar exigiria dois erros
 * independentes.
 */
export type Postit = {
  id: string;
  /** Canto superior esquerdo, em coordenadas de cena. */
  x: number;
  y: number;
  /** Tamanho do papel, em unidades de cena. */
  largura: number;
  altura: number;
  /**
   * O texto, CRU, com os marcadores como o mestre os digitou.
   *
   * Guardar o texto e não uma árvore de nós é o que mantém o postit editável
   * como texto: o mestre apaga um `@` e o vínculo morre ali, sem estrutura
   * órfã no arquivo. Quem separa `**negrito**`, `@personagem`, `/arquivo` e
   * `>cena` é `parsePostit`, na hora de desenhar.
   *
   * A consequência é que o vínculo é por NOME: renomear o personagem desfaz a
   * marcação, que volta a ser texto. Ver `postit-texto.ts`.
   */
  texto: string;
  cor: CorPostit;
  /**
   * Tamanho da letra, em unidades de cena. Ausente = `POSTIT_FONTE`.
   *
   * Os degraus são os do cartão de nota (`DOCUMENTO_FONTES`), e é deliberado
   * que sejam os mesmos: papel e cartão são as duas folhas de texto do quadro,
   * e duas escadas diferentes fariam o mesmo gesto -- clicar em A↑ -- dar
   * saltos diferentes em cada uma.
   *
   * Opcional para não exigir migração: o postit já colado continua com o
   * tamanho de sempre, sem campo nenhum no arquivo.
   */
  fonte?: number;
};

/** O que o chamador informa ao colar um postit; o resto é do store. */
export type NewPostit = Pick<Postit, "x" | "y"> &
  Partial<Pick<Postit, "largura" | "altura" | "texto" | "cor" | "fonte">>;

/**
 * Texto solto sobre o quadro: título, rótulo, uma frase. Sem papel, sem
 * caixa -- o postit é o cartão, este é a letra direto na folha.
 *
 * Mora na cena como o postit, e é do mestre até a cena ir ao ar como quadro.
 * Não tem largura: o texto quebra onde o mestre pôs Enter, e a caixa que a
 * ligação mira é estimada a partir da fonte. Ver `caixaDoTexto`.
 */
export type Texto = {
  id: string;
  /** Canto superior esquerdo, em coordenadas de cena. */
  x: number;
  y: number;
  texto: string;
  /** Tamanho da fonte, em unidades de cena. */
  tamanho: number;
  /** Giro em graus, em volta do centro da caixa, como o item. Ausente = 0. */
  rotation?: number;
  /**
   * Como a letra é escrita. Todos ausentes no texto comum, e é de propósito:
   * o padrão é a cor do tema, sem fundo e sem ênfase, e um texto gravado antes
   * de isto existir continua válido sem migração nenhuma.
   *
   * Cor CSS, como o risco do lápis -- e não um nome de paleta, como o postit:
   * a paleta do quadro é a mesma do lápis, e guardar o valor deixa o arquivo
   * legível sem tabela de tradução.
   */
  cor?: string;
  /** Fundo atrás da letra, como um marca-texto. Ausente = sem fundo. */
  fundo?: string;
  negrito?: boolean;
  italico?: boolean;
  sublinhado?: boolean;
  /**
   * Está na mesa? Ausente = só o mestre vê, e é o padrão.
   *
   * Num MAPA a letra solta nasce fechada, e o mestre a abre uma a uma no olho
   * do gizmo. Escrever "aqui dorme o dragão" sobre o corredor é PREPARAÇÃO, e
   * um padrão que publicasse entregaria a preparação inteira à mesa no
   * instante em que ela fosse escrita -- o mesmo motivo pelo qual o postit e o
   * alfinete nunca chegam lá. A diferença é que aqui o mestre pode mudar de
   * ideia: é o que faz a letra servir também de rótulo do mapa ("Taverna"),
   * que é a coisa que faltava.
   *
   * Num QUADRO não vale nada: o quadro vai INTEIRO para a mesa, porque ele é o
   * que o mestre escolheu mostrar. Ver `sceneForTable`.
   */
  naMesa?: boolean;
  /**
   * A caixa MEDIDA na tela do mestre, em unidades de cena, sem o giro.
   * Ausente até o primeiro render: aí vale a estimativa de `caixaRetaDoTexto`.
   * Gravada porque a mesa também precisa dela para a seta encostar no lugar
   * certo, e a mesa não tem como medir antes de desenhar.
   */
  largura?: number;
  altura?: number;
};

export type NewTexto = Pick<Texto, "x" | "y"> &
  Partial<
    Pick<
      Texto,
      | "texto"
      | "tamanho"
      | "rotation"
      | "cor"
      | "fundo"
      | "negrito"
      | "italico"
      | "sublinhado"
      | "naMesa"
    >
  >;

/** Tamanho de fonte de um texto novo, em unidades de cena. */
export const TEXTO_TAMANHO = 40;

/** As formas que o quadro desenha. Ver `Forma`. */
export const TIPOS_DE_FORMA = ["retangulo", "elipse", "linha"] as const;

export type TipoDeForma = (typeof TIPOS_DE_FORMA)[number];

/**
 * Uma forma desenhada no quadro: retângulo, elipse ou linha reta.
 *
 * É o traço geométrico que o lápis não dá -- cercar três postits, ligar duas
 * colunas, riscar um eixo do tempo. Mora na cena como o texto solto e vai
 * INTEIRA para a mesa: o quadro é o que o mestre quer mostrar.
 *
 * A geometria é a MESMA do item de cena -- `x`, `y`, `width`, `height`,
 * `rotation` --, e isso não é coincidência: é o que deixa a forma entrar na
 * seleção do palco ao lado das imagens e dos textos, e ser escalada e girada
 * pelo mesmo gizmo, com as mesmas funções de grupo. Uma forma com dois pontos
 * próprios ("de onde até onde", como o medidor) precisaria de um gizmo só
 * dela.
 *
 * A LINHA cabe nessa caixa como uma diagonal dela: `diagonal` diz qual das
 * duas, e é o que permite desenhar para cima e para a esquerda sem inventar um
 * segundo par de coordenadas. Escalar a caixa estica a linha; girar a caixa
 * gira a linha.
 */
export type Forma = {
  id: string;
  tipo: TipoDeForma;
  /** Canto superior esquerdo da caixa, em coordenadas de cena. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Graus, no sentido horário, em torno do centro da caixa. */
  rotation: number;
  /**
   * Cor do traço, CSS, como no risco do lápis. Ausente = a cor do TEMA.
   *
   * Opcional pela mesma razão do texto solto: o quadro é papel, e o papel é
   * claro ou escuro conforme o tema de quem olha -- uma cor fixa como padrão
   * sumiria num dos dois. Escolhida, ela vale nos dois lados.
   */
  cor?: string;
  /** Espessura do traço, em unidades de cena. */
  espessura: number;
  /**
   * Preenchimento. Ausente = vazada, e é o padrão: uma caixa cheia sobre o
   * quadro esconderia o que está atrás dela, e o uso normal é CERCAR.
   */
  fundo?: string;
  /**
   * Só a linha: ela corre do canto superior esquerdo ao inferior direito
   * (ausente) ou do inferior esquerdo ao superior direito (`"secundaria"`).
   */
  diagonal?: "secundaria";
  /** Está na mesa? Ausente = só o mestre vê. O mesmo do texto solto. */
  naMesa?: boolean;
};

export type NewForma = Omit<Forma, "id">;

/**
 * A forma sem o id, campo a campo -- o que copiar e duplicar guardam.
 *
 * Escrito e não `{ id, ...resto }` porque o descarte nomeado é variável não
 * usada, e a regra que a proíbe está ligada. Mesma razão do rascunho de item
 * em `use-clipboard-store`.
 */
export function semIdDaForma(forma: Forma): NewForma {
  return {
    tipo: forma.tipo,
    x: forma.x,
    y: forma.y,
    width: forma.width,
    height: forma.height,
    rotation: forma.rotation,
    cor: forma.cor,
    espessura: forma.espessura,
    fundo: forma.fundo,
    diagonal: forma.diagonal,
    // A decisão de mostrar acompanha a cópia: duplicar uma forma que a mesa
    // está vendo e ver a cópia sumir seria o gesto desfazendo o que o mestre
    // acabou de decidir.
    naMesa: forma.naMesa,
  };
}

/** Espessura de traço de uma forma nova, em unidades de cena. */
export const FORMA_ESPESSURA = 6;

/**
 * Um documento do quadro: um cartão com Markdown de verdade, editado no
 * lugar com prévia ao vivo, como uma nota do Obsidian.
 *
 * O TEXTO não mora aqui: mora em `documentos/<arquivo>.md` na pasta da
 * campanha, para ser Markdown que se abre em qualquer editor. A cena guarda
 * o cartão -- onde está, que tamanho tem, como se chama -- e o nome do
 * arquivo. `atualizadoEm` muda a cada gravação, e é o que faz a mesa reler o
 * arquivo quando o mestre escreve.
 */
export type Documento = {
  id: string;
  /** Canto superior esquerdo, em coordenadas de cena. */
  x: number;
  y: number;
  largura: number;
  altura: number;
  /**
   * A nota que este cartão mostra. Ver `Nota`. Ausente só em cartão gravado
   * antes de existirem notas; `carregar` cria a nota dele e preenche.
   */
  notaId?: string;
  /**
   * Cópia do título e do arquivo da nota, para a MESA: ela recebe a cena e não
   * o board, então não tem onde resolver `notaId`. Quem renomeia a nota
   * reescreve os dois em todos os cartões dela.
   */
  titulo: string;
  arquivo: string;
  /** Época em ms da última gravação do texto. Ausente = nunca escrito. */
  atualizadoEm?: number;
  /** Fonte do corpo, em unidades de cena. Ausente = `DOCUMENTO_FONTE`. */
  fonte?: number;
};

export const DOCUMENTO_FONTE = 16;
/** Os degraus do A− e A+, em unidades de cena. */
export const DOCUMENTO_FONTES = [11, 13, 16, 20, 24, 30, 38] as const;

export type NewDocumento = Pick<
  Documento,
  "x" | "y" | "titulo" | "arquivo" | "notaId"
> &
  Partial<Pick<Documento, "largura" | "altura">>;

/**
 * Uma nota: um arquivo `.md` da campanha, como no Obsidian. Vive na mesma
 * árvore de pastas dos quadros, abre num editor no lugar do palco, e entra num
 * quadro como cartão (`Documento`) quantas vezes se quiser. O texto mora em
 * `documentos/<arquivo>`; aqui é só o índice.
 */
export type Nota = {
  id: string;
  titulo: string;
  /** Nome do arquivo em `documentos/`, sem diretório. Não muda com o título. */
  arquivo: string;
  pastaId?: string;
};

export const DOCUMENTO_LARGURA = 420;
export const DOCUMENTO_ALTURA = 320;
export const DOCUMENTO_MINIMO = 160;

/**
 * O que uma ligação pode amarrar.
 *
 * `ligacao` é a própria seta, e é ela que traz a BIFURCAÇÃO: uma seta presa a
 * um ponto no meio de outra, como o galho sai do tronco. Onde nesse meio é o
 * `t` da referência.
 */
export type TipoLigavel =
  | "item"
  | "postit"
  | "texto"
  | "pin"
  | "documento"
  | "forma"
  | "ligacao";

/**
 * Em qual das quatro bordas a seta encosta.
 *
 * A ordem é a do relógio, começando em cima: é a ordem em que os quatro pontos
 * aparecem sob o cursor, e a ordem em que se fala deles.
 */
export type LadoDeAncora = "cima" | "direita" | "baixo" | "esquerda";

/**
 * Uma ponta de ligação: o que ela amarra, por tipo e id -- e ONDE, quando o
 * mestre disse onde.
 *
 * `lado` e `t` são a mesma ideia em duas geometrias: a caixa tem quatro bordas
 * e a seta tem comprimento. Os dois são opcionais, e a ausência é o caminho
 * antigo -- a borda virada para a outra ponta, o meio da seta. Quadro gravado
 * antes disto continua abrindo igual, e é por isso que eles não são
 * obrigatórios.
 */
export type RefLigacao = {
  tipo: TipoLigavel;
  id: string;
  /**
   * A borda em que a seta encosta, escolhida no ponto de encaixe. Ausente = a
   * borda virada para a outra ponta, que é como a seta se comportava antes de
   * haver pontos de encaixe.
   *
   * Escolhido, o lado MANDA: a seta continua saindo do meio daquela borda
   * mesmo quando o alvo anda para o outro lado da folha. É o que separa "ligue
   * estes dois" de "saia por cima" -- num organograma, todas as setas descem
   * pela borda de baixo, e uma delas virando para o lado desalinharia o
   * desenho inteiro.
   */
  lado?: LadoDeAncora;
  /**
   * Só com `tipo: "ligacao"`: onde ao longo da seta-mãe a ponta se prende, de
   * 0 (a ponta `de` dela) a 1 (a ponta `para`). Ausente = 0,5, o meio.
   *
   * Fração e não distância: a seta-mãe estica e encolhe quando o que ela
   * amarra se move, e uma bifurcação a 120 unidades do começo acabaria fora da
   * seta. A fração acompanha.
   */
  t?: number;
};

/**
 * Uma ponta de seta: ANCORADA numa coisa do quadro, ou LIVRE num ponto.
 *
 * Ancorada, a seta acompanha a coisa e encosta na borda dela. Livre, é um
 * ponto na folha, como uma seta desenhada à mão. As duas formas se distinguem
 * pelo campo `tipo`, e só a ancorada tem id: ver `ancorada`.
 */
export type PontaDeLigacao = RefLigacao | Vec2;

/** Um ponto em coordenadas de cena. */
export type Vec2 = { x: number; y: number };

/**
 * Uma seta no quadro, como no Excalidraw: pode existir sozinha, apontando
 * para o nada, e prende-se a uma coisa quando a ponta é solta sobre ela.
 *
 * A ponta ancorada guarda a REFERÊNCIA, e não o ponto: mover o postit leva a
 * seta junto, que é o que faz dela um vínculo e não um risco. A ponta que
 * perde o alvo -- postit apagado -- leva a ligação com ela; ver
 * `semReferencia`.
 */
export type Ligacao = {
  id: string;
  de: PontaDeLigacao;
  para: PontaDeLigacao;
  /** O que a seta diz, no meio dela. Ausente = nada. */
  rotulo?: string;
  /**
   * Quanto o mestre DOBROU a seta à mão. Ausente = a curva que os lados de
   * encaixe dão sozinhos, sem barriga nenhuma.
   *
   * Fração do vão entre as pontas, e não uma distância: é quanto o meio da
   * seta saiu do lugar, medido perpendicular à reta que liga as duas pontas.
   * Positivo dobra para um lado, negativo para o outro.
   *
   * Fração porque a seta estica e encolhe quando o que ela amarra se move: uma
   * dobra de 80 unidades some numa seta que atravessa a folha e vira um laço
   * numa seta de 100. A fração dobra o mesmo tanto nas duas.
   */
  curva?: number;
};

/**
 * A imagem em evidência: o que o mestre mandou a mesa olhar agora.
 *
 * Nível de sessão, como a trilha, e não da cena: transmitir um retrato de PNJ
 * não deve sumir porque o mestre trocou o mapa embaixo.
 *
 * Não é persistida de propósito, e aqui ela difere da trilha. Trilha é
 * ambiente e continua valendo de uma sessão para a outra; evidência é um gesto
 * — "olha isto" — e restaurá-la ao reabrir o aplicativo mandaria para a TV um
 * documento que a mesa já passou. Nada se perde: o ponto de anotação guarda o
 * anexo, e retransmitir é um clique.
 */
export type Spotlight = {
  /**
   * Imagem do acervo. Exclusivo com `sharedId`.
   *
   * Opcional porque a evidência passou a ter duas origens: o acervo, cujo id a
   * mesa resolve em `/asset/{id}`, e o anexo de um jogador, que não é acervo e
   * não tem id de asset nenhum.
   */
  assetId?: string;
  /**
   * Anexo de jogador, pelo endereço efêmero que o daemon abriu para ele.
   *
   * Sorteado a cada transmissão e servido em `/evidencia/{id}` só enquanto
   * está no ar — ver `player_attachment_share` no lado nativo. O nome do
   * arquivo não viaja: é a mesma razão de não haver legenda aqui.
   */
  sharedId?: string;
  /*
   * Sem legenda, e isto foi uma correção.
   *
   * A primeira versão mandava o título do ponto de origem como legenda, "para
   * a mesa saber o que é". O que a mesa recebia era prosa de preparação:
   * transmitir a carta do ponto "Alçapão atrás do balcão" punha na TV, embaixo
   * da carta, a existência do alçapão. Título de ponto é anotação do mestre, e
   * o resto deste arquivo existe justamente para isso não sair da tela dele.
   *
   * A imagem se explica sozinha; quem a mandou está na mesa e pode falar.
   */
  /**
   * Quando entrou no ar.
   *
   * Muda a cada transmissão, e é o que faz o espectador reconhecer uma imagem
   * nova: comparar a origem não distinguiria transmitir o mesmo arquivo duas
   * vezes, que é como se chama a atenção de novo para ele.
   */
  since: number;
};

/** O que o chamador informa ao desenhar uma área; `id` e `revealed` são do store. */
export type NewFogRegion = Pick<FogRegion, "x" | "y" | "width" | "height"> &
  Partial<Pick<FogRegion, "formato" | "rotation" | "pontos">>;

/**
 * Um risco a mao livre sobre o mapa.
 *
 * Mora na CENA, como a nevoa e os pontos, e pelas mesmas razoes: o risco marca
 * ALGO do mapa -- por onde os guardas passam, onde o chao cede --, entao ele
 * pertence ao mapa e nao ao momento. Viaja no zip, entra no desfazer, e trocar
 * de cena troca os riscos.
 *
 * A mesa ve: riscar o mapa e apontar para ela.
 */
export type Traco = {
  id: string;
  /**
   * Os pontos, ACHATADOS: `x0, y0, x1, y1, ...`, em unidades de cena.
   *
   * Achatado e nao uma lista de `{x, y}` porque um risco de tres segundos tem
   * umas duzentas amostras: duzentos objetos por risco, num arquivo de cena que
   * e lido e gravado inteiro, e num payload que atravessa o canal a cada
   * publicacao. E e a forma que o `points` do SVG quer.
   */
  pontos: number[];
  /** Cor CSS, como o mestre escolheu. */
  cor: string;
  /** Espessura em unidades de cena, para acompanhar o zoom como o resto. */
  espessura: number;
};

export type NewTraco = Pick<Traco, "pontos" | "cor" | "espessura">;

/** As formas de medidor. Ver `Medidor`. */
export const FORMAS_MEDIDOR = ["linha", "circulo", "cone", "retangulo"] as const;

export type FormaMedidor = (typeof FORMAS_MEDIDOR)[number];

/** Abertura do cone, em graus, quando o medidor não diz. */
export const ABERTURA_CONE_PADRAO = 60;

/**
 * Um medidor colocado sobre o mapa: régua, círculo, cone ou retângulo, com a
 * conta em metros escrita nele.
 *
 * Mora na CENA, como o risco e a névoa: antes a régua era um gesto que sumia ao
 * soltar, e a pergunta "cabe o carro nessa viela?" tinha de ser refeita a cada
 * vez que alguém duvidava. Colocado, o medidor fica, anda com o dedo, e sai
 * quando o mestre o apaga. Viaja no zip, entra no desfazer, e a mesa vê --
 * medir é apontar para ela.
 *
 * Todas as formas cabem em DOIS pontos, e é por isso que mover e redimensionar
 * são o mesmo gesto para as quatro: `x, y` é a origem -- começo da régua,
 * centro do círculo, vértice do cone, um canto do retângulo -- e `x2, y2` é o
 * fim -- a outra ponta, um ponto na borda que dá o raio, a ponta do cone, o
 * canto oposto.
 *
 * A grade é quem dá o metro: sem ela o medidor não é criado. Ver
 * `METROS_POR_QUADRADO`.
 */
export type Medidor = {
  id: string;
  forma: FormaMedidor;
  x: number;
  y: number;
  x2: number;
  y2: number;
  /** Cor CSS, como o mestre escolheu. */
  cor: string;
  /** Só o cone: abertura total em graus. Ausente = `ABERTURA_CONE_PADRAO`. */
  abertura?: number;
};

export type NewMedidor = Omit<Medidor, "id">;

/**
 * Recorte do plano de cena. Sempre na proporção do plano, para toda visão
 * caber o mesmo enquadramento sem cortar nada.
 *
 * Usado em dois lugares: o zoom local do Mestre (não persistido, não viaja)
 * e a câmera compartilhada da cena, que é o que a mesa enxerga.
 */
export type Viewport = { x: number; y: number; width: number; height: number };

/**
 * Volume de partida da sessão.
 *
 * Vive junto dos tipos porque três lugares precisam do mesmo número: o store,
 * o disco (registro gravado antes de o volume sair da faixa) e o canal
 * (mensagem de uma versão anterior, que não traz o campo).
 */
export const DEFAULT_SESSION_VOLUME = 0.8;

/**
 * Trilha da sessão.
 *
 * Pertence ao sistema, não a uma cena: a música acompanha a mesa e não deve
 * ser cortada porque o mestre trocou de cena. Antes vivia dentro de `Scene`, e
 * era exatamente isso que acontecia.
 *
 * Continua viajando junto da cena no canal, porque a TV e os celulares
 * precisam saber o que tocar.
 *
 * Sem campo de VOLUME, e isso não mudou: o volume é da sessão e mora no
 * `TrackStore`. Guardado por faixa, cada troca de música o trocava junto — a
 * escolhida entrava com o número de quando foi gravada, e o mestre reajustava
 * o slider a cada troca.
 */
export type SessionTrack = {
  assetId: string;
  loop: boolean;
  /** Pausado é diferente de ausente: a faixa continua escolhida. */
  playing: boolean;
  /**
   * Ganho DESTA faixa, de 0 a 1. Ver `Ambiente.ganho`.
   *
   * Não é o volume que saiu daqui, e a diferença está em quando ele nasce: o
   * volume vinha do disco e voltava a cada faixa, e era isso que fazia o som
   * saltar na troca. Este nasce cheio toda vez que uma faixa entra — ver
   * `start` —, então nada é restaurado e nada salta.
   *
   * Existe porque sem ele a trilha era o único canal sem fader, e abaixar a
   * música para o mestre falar por cima levava a chuva junto.
   */
  ganho: number;
  /**
   * Quando o play atual começou, em epoch ms.
   *
   * Serve para um espectador que chega no meio entrar mais ou menos na altura
   * certa, em vez de começar a faixa do zero enquanto a mesa está no refrão.
   */
  startedAt: number;
};

/**
 * Som de fundo que fica: chuva, fogueira, mercado, vento.
 *
 * Toca em loop e não tem barra de posição — ninguém procura o instante 1:12
 * da chuva. É a diferença que separa ambiente de trilha: a trilha tem começo,
 * meio e fim, e o mestre navega nela; o ambiente só está aceso ou apagado.
 *
 * Vários ao mesmo tempo, de propósito. Chuva com fogueira é duas camadas, e
 * não um terceiro arquivo que alguém teria de produzir para cada combinação.
 *
 * Fica FORA da cena, como a trilha e pela mesma razão: o histórico de desfazer
 * tira retratos do board, e a chuva não deve voltar por causa de um Ctrl+Z num
 * token. Que ambientes cada cena acende mora no `TrackStore`, num mapa por id
 * de cena. Ver `ambientesPorCena`.
 */
export type Ambiente = {
  id: string;
  assetId: string;
  /**
   * Ganho deste canal, de 0 a 1.
   *
   * MULTIPLICA o volume da sessão, e é o que torna "chuva leve por baixo da
   * música" possível: sem ele o mestre só teria o volume geral, e abaixar a
   * chuva levaria a trilha junto.
   *
   * Não confundir com o que a nota de `outputVolume` recusa. Ali o que se
   * multiplicava era sessão × APARELHO, e o resultado era um número que
   * ninguém sabia explicar — 5% de 70%. Aqui é sessão × CANAL, que é o que
   * toda mesa de som faz, e o mestre vê os dois controles lado a lado.
   */
  ganho: number;
  /** Pausado é diferente de ausente, como na trilha. */
  tocando: boolean;
  /**
   * Quando este ambiente acendeu, em epoch ms.
   *
   * Mesmo motivo da trilha: quem chega no meio entra na altura em que a mesa
   * está. Menos crítico aqui — chuva soa igual em qualquer ponto —, mas um
   * arquivo de ambiente costuma ter um evento no meio, um trovão ou um sino,
   * e dois aparelhos em pontos diferentes dele soam como eco.
   */
  startedAt: number;
};

/**
 * Efeito disparado agora — porta rangendo, trovão, grito.
 *
 * Viaja no canal pelo mesmo motivo da trilha: quem precisa ouvir é a mesa.
 * `firedAt` muda a cada disparo, e é o que faz o espectador reconhecer que
 * houve um novo — comparar `assetId` não distinguiria dois disparos do mesmo
 * som.
 *
 * Separado do ambiente em duas coisas: não repete, e não é estado. Vive numa
 * bandeja, como as rolagens da mesa, e sai dela quando o arquivo acaba — o
 * prazo é a duração do próprio som, e não um número fixo: um efeito pode ser
 * um trovão de dois segundos ou a entrada de um inimigo de dois minutos.
 * Guardado como estado, o tiro tocaria de novo a cada espectador que
 * reconectasse — e o batimento do canal republica o quadro inteiro dez vezes
 * por segundo, o que o tocaria dez vezes por segundo.
 */
export type Disparo = {
  id: string;
  assetId: string;
  /** Ganho deste disparo, de 0 a 1. Ver `Ambiente.ganho`. */
  ganho: number;
  firedAt: number;
};

/**
 * Um dos nove slots do numpad.
 *
 * Da CAMPANHA e não da cena. A mão decora "tiro é o 7", e um pad que troca de
 * dono a cada mapa obriga a olhar a tela antes de cada tecla — que é
 * exatamente o que um atalho existe para evitar.
 *
 * `null` = slot vazio. A lista tem sempre nove posições, e o ÍNDICE é a tecla
 * menos um: um mapa de tecla para som não saberia responder "qual é o 5?"
 * enquanto o 5 estivesse vazio, e a grade da tela precisa desenhar o buraco.
 */
export type Pad = {
  assetId: string;
  /**
   * Ganho com que o pad dispara, de 0 a 1.
   *
   * Vale só para o `disparo`. A trilha e o ambiente nascem com o fader cheio e
   * são regulados no painel depois de acesos: a tecla é o gesto rápido do meio
   * da cena, e uma tecla que também define volume seria uma decisão a mais
   * para tomar com a mesa esperando.
   */
  ganho: number;
} | null;

/*
 * O que a tecla FAZ não mora aqui, e já morou.
 *
 * O pad guardava o próprio `tipo`, e escolher um som para a tecla pedia duas
 * respostas: qual arquivo, e o que ele faz. Desde que o arquivo declara o que
 * é — ver `AssetMeta.tipoDeSom` — a segunda pergunta tinha uma resposta só, e
 * fazê-la de novo abria a porta para as duas discordarem: a mesma chuva sendo
 * ambiente no acervo e disparo no 7.
 *
 * Pad antigo continua tendo o campo no `trilha.json`, e ele é simplesmente
 * ignorado na leitura. Sem passo de migração: o arquivo se regrava sozinho na
 * primeira alteração, como todo o resto deste registro.
 */

/** Quantos pads existem: as teclas 1 a 9 do numpad. */
export const PADS = 9;

/**
 * Um som na lista de macros.
 *
 * O pad sem a tecla, e existe por duas razões que são a mesma: teclado de
 * portátil não tem numpad, e nove é pouco. Quem joga num notebook não alcança
 * pad nenhum pelo teclado, e quem tem vinte efeitos de combate não escolhe
 * quais nove entram.
 *
 * Um som por macro, e não uma lista de ações. "Macro" costuma querer dizer
 * "várias coisas num gesto", e aqui quer dizer só "este som, sem tecla" — o que
 * ela faz ao ser acionada é o que o TIPO do arquivo manda, exatamente como o
 * pad. Ver `acionarPad`.
 *
 * `id` próprio e não o `assetId` como chave: a lista é reordenável por natureza
 * e o React precisa de identidade estável, e um dia duas macros do mesmo
 * arquivo podem fazer sentido — hoje não fazem, e `adicionarMacro` recusa.
 *
 * Da CAMPANHA, como o pad: a lista de efeitos de uma campanha de horror não
 * serve a uma de intriga palaciana.
 */
export type Macro = { id: string; assetId: string };

/**
 * Quantos ambientes podem estar acesos ao mesmo tempo.
 *
 * Cada um é um `<audio>`, e no WebKitGTK cada `<audio>` carrega um pipeline
 * GStreamer inteiro atrás dele. Quatro cobre o que uma cena pede — chuva,
 * vento, fogueira, multidão — e é um teto, não uma meta: subir sem medir com
 * `pnpm perf` é o caminho que já derrubou o palco outras vezes.
 *
 * A trilha não conta aqui, e os disparos tão pouco: eles duram segundos e
 * saem sozinhos.
 */
export const MAX_AMBIENTES = 4;

/** Ganho de partida de um canal novo. Cheio: quem quiser menos, abaixa. */
export const GANHO_PADRAO = 1;

/**
 * Onde um volume de CATEGORIA começa. Ver `volumeAmbiente` no `SessionAudio`.
 *
 * Cheio, e é o que faz a conciliação do disco ser uma linha: uma campanha
 * gravada antes destes faders não os traz, e ler a ausência como "cheio" a
 * reabre soando igual a como foi fechada. Zero a reabriria muda.
 */
export const VOLUME_DE_CATEGORIA_PADRAO = 1;

/**
 * Retrato de personagem sobre a cena.
 *
 * Ancorado na **câmera**, não no plano: `x`, `y`, `width` e `height` são
 * frações de 0 a 1 do recorte que a mesa está vendo. É isso que faz o retrato
 * ficar parado quando o mestre aproxima o mapa, e ocupar a mesma parte da tela
 * na TV de 1920 e no celular de 390 — pixel de tela exigiria uma camada de
 * coordenadas própria em cada visão.
 *
 * Pertence à sessão, como a trilha: quem está na conversa não muda porque o
 * mestre trocou de mapa.
 */
export type Portrait = {
  id: string;
  /**
   * De quem e este retrato.
   *
   * Todo retrato e de um personagem: nao existe mais "retrato solto", feito de
   * uma imagem qualquer do acervo. A lista deriva dos tokens que estao na cena,
   * e este campo e a amarra entre a figura na tela e a ficha de quem ela e --
   * o mesmo papel que `personagemId` faz no item do mapa.
   *
   * O registro guardado e GEOMETRIA: onde ele esta, de que tamanho, e se esta
   * no ar. Desligar mantem o registro, e e isso que faz a posicao ser lembrada
   * de uma cena para a outra.
   */
  personagemId: string;
  /**
   * A imagem, resolvida do campo Retrato do personagem.
   *
   * Fica no tipo porque o payload publicado precisa dela: o Espectador nao tem
   * credencial nem indice de personagens, so `/asset/{id}`. Mas quem manda e o
   * campo da ficha, e nao esta copia -- ver `retratosDaCena`, que a resolve na
   * hora. Copia crava a imagem de quando o retrato foi armado, e trocar o
   * Retrato na ficha deixaria a mesa vendo a antiga.
   */
  assetId: string;
  /**
   * A pagina viva deste retrato, quando ha uma.
   *
   * Resolvida do campo `retratoUrl` da ficha pelo mesmo caminho que o
   * `assetId` -- ver `retratosDaCena`. Viaja no payload publicado porque quem
   * desenha o quadro e o APARELHO do espectador: a TV e o celular abrem a
   * pagina por conta propria, e o daemon nao intermedia nada disso.
   *
   * Ausente e o caso comum: retrato de imagem, como sempre foi.
   */
  url?: string;
  /**
   * O canvas de projeto da pagina, em pixels. So existe com `url`.
   *
   * Viaja junto porque quem sabe este numero e a EXTENSAO, e extensao so existe
   * no Mestre. Sem ele, a TV teria de adivinhar em que tamanho renderizar uma
   * pagina de layout fixo -- e adivinhar errado mostra um canto do card.
   */
  urlLargura?: number;
  urlAltura?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Fora do ar aparece fantasma só para o mestre, para ele posicionar antes. */
  visible: boolean;
  /** Virar o retrato para o lado da tela em que ele está. */
  flipX?: boolean;
};

/**
 * Onde a fila de retratos encosta.
 *
 * Areas, e nao posicao livre: a fila e um conjunto, e arrastar um conjunto para
 * um ponto exato e um gesto que ninguem quer repetir -- o que se quer e "esse
 * grupo fica no canto de cima a direita". Seis, porque sao as combinacoes de
 * cima/baixo com esquerda/centro/direita, e nenhuma das seis e estranha numa
 * tela de mesa.
 *
 * Em fracao da camera, como o resto do retrato: o que a mesa ve e o recorte.
 */
export type AncoraRetrato =
  | "cima-esquerda"
  | "cima-centro"
  | "cima-direita"
  | "baixo-esquerda"
  | "baixo-centro"
  | "baixo-direita";

/**
 * Um conjunto de retratos que se enfileira junto.
 *
 * Substitui a fila automática, que era um interruptor só para todos com uma
 * exceção por retrato. O interruptor não dizia em que grupo cada um estava --
 * havia exatamente um grupo --, e a mesa com heróis embaixo e inimigos em cima
 * não tinha como ser dita. A união diz: estes cinco são um conjunto, e este
 * conjunto encosta ali.
 *
 * Retrato que não está em união nenhuma é SOLTO, e solto não tem regra: fica
 * onde foi largado. É o que o `foraDaFila` de antes queria dizer, agora por
 * ausência em vez de por campo.
 *
 * ## `retratos` é um array, e não um conjunto
 *
 * A ordem dele é a ordem da fila -- quem vem primeiro fica à esquerda. Guardar
 * a união como um `uniaoId` no retrato daria a mesma pertinência, mas a ordem
 * precisaria de um segundo campo, e dois retratos podem gravar o mesmo número
 * nele. Aqui não existe empate a resolver.
 *
 * Um retrato pertence a UMA união: `unir` tira o id de qualquer outra antes de
 * criar, e a leitura do disco normaliza o que vier repetido -- ver `ler` em
 * `use-portrait-store`.
 *
 * ## Por que âncora e folga moram aqui
 *
 * Eram globais, um valor para todos, porque havia uma fila só. Com várias, a
 * área é justamente o que distingue uma união da outra, e o respiro entre as
 * figuras é uma propriedade do conjunto -- o bando de goblins ombro a ombro e
 * os heróis espaçados são duas uniões na mesma tela.
 */
export type UniaoDeRetratos = {
  id: string;
  /** O que a barra lateral mostra. Editável, e nasce com um padrão. */
  nome: string;
  /**
   * A cor da borda que envolve o grupo na barra lateral e no palco.
   *
   * Da mesma paleta do gizmo, para o mestre não ter uma segunda noção de cor a
   * aprender. Nasce escolhida e o menu troca.
   */
  cor: string;
  /** Onde esta união encosta. Ver `AncoraRetrato`. */
  ancora: AncoraRetrato;
  /** Espaço entre dois vizinhos DESTA união. Negativo sobrepõe. */
  folga: number;
  /** Os membros, em ordem de fila. Ver o cabeçalho. */
  retratos: string[];
};

/** O que o chamador informa ao criar um item; `id`, `z` e afins são do store. */
export type NewCanvasItem = Pick<
  CanvasItem,
  "assetId" | "x" | "y" | "width" | "height" | "personagemId"
>;

/**
 * Item novo que pode trazer rotação e travamento próprios — é o que o
 * "colar" precisa para reproduzir a cópia fielmente.
 */
export type ItemDraft = NewCanvasItem &
  Partial<
    Pick<CanvasItem, "rotation" | "locked" | "flipX" | "flipY" | "opacity">
  >;

/**
 * Uma câmera da cena: um recorte com nome.
 *
 * Existe porque uma cena grande tem mais de um lugar onde a mesa olha: a
 * taverna onde metade do grupo negocia e o beco onde a outra metade briga.
 * Sem isto o mestre reenquadrava à mão a cada troca de foco.
 *
 * `alvoIds` presente = a câmera SEGUE esses itens, e não um lugar fixo: é a
 * câmera "do grupo A", que vai onde o grupo A for. O `viewport` aí guarda a
 * ampliação e o último lugar visto, para o caso de os itens já não existirem.
 */
export type CameraSalva = {
  id: string;
  nome: string;
  viewport: Viewport;
  alvoIds?: string[];
};

/**
 * Um grupo de itens na lista "Em cena", com nome. Grupo dentro de grupo pelo
 * `parentId`.
 *
 * Existe para a lista deixar de ser vinte linhas planas: "os quatro
 * guardas", "a mobília da taverna". Clicar no nome seleciona tudo dele, e daí
 * o gizmo de grupo que já existe move, escala e gira.
 *
 * O que ele NÃO é: camada de desenho. A ordem de sobreposição continua sendo
 * o `z` de cada item, e um item do grupo A pode estar entre dois do grupo B.
 * Um grupo com `z` próprio mudaria o `SceneLayer`, que é compartilhado e chega
 * à TV, para resolver uma coisa que a mesa nunca vê.
 *
 * `recolhido` é da lista e persiste na cena porque é a única casa que a lista
 * tem: reabrir a campanha com os grupos como o mestre os deixou é o esperado.
 */
export type Grupo = {
  id: string;
  nome: string;
  parentId?: string;
  recolhido?: boolean;
};

/**
 * O que uma cena é para o mestre.
 *
 * `undefined` é mapa: a cena de sempre, com fundo, grade, névoa e régua, feita
 * para a mesa olhar. `"quadro"` é a mesa de trabalho do mestre -- brainstorm,
 * história, notas ligadas por setas --, sem chão nem escala. As duas dividem
 * o mesmo tipo de propósito: o palco, o histórico, a gravação por diferença e
 * o canal para a mesa já existem para a cena, e um quadro é uma cena sem chão
 * com uma barra de ferramentas própria. Ver `ehQuadro`.
 *
 * Decidido na criação e nunca trocado: um mapa que virasse quadro carregaria
 * névoa e grade que o quadro não sabe mostrar, e cada caso desses seria um
 * bug para alguém.
 */
export type TipoDeCena = "quadro";

/**
 * Uma pasta de quadros. Só quadros: cena de mapa é fila de sessão, e uma
 * campanha tem dez; quadro é caderno, e um caderno cresce em capítulos.
 *
 * Mesma forma do `Grupo` da cena, e de propósito: a lista já sabe desenhar
 * essa árvore. Vive no board, e não na cena, porque atravessa cenas.
 */
export type Pasta = {
  id: string;
  nome: string;
  parentId?: string;
  recolhido?: boolean;
};

export type Scene = {
  id: string;
  name: string;
  /** Ausente = mapa. Ver `TipoDeCena`. */
  tipo?: TipoDeCena;
  /** A pasta em que um quadro está. Ausente = raiz. Só faz sentido em quadro. */
  pastaId?: string;
  /**
   * Textos soltos e setas do quadro. Ausente = nenhum. Nascem no quadro, mas
   * a cena de mapa também os aceita: são só mais duas listas. Ver `Texto` e
   * `Ligacao`.
   */
  textos?: Texto[];
  ligacoes?: Ligacao[];
  /** As formas geométricas do quadro. Ausente = nenhuma. Ver `Forma`. */
  formas?: Forma[];
  /** Os cartões de documento do quadro. Ausente = nenhum. Ver `Documento`. */
  documentos?: Documento[];
  backgroundAssetId?: string;
  items: CanvasItem[];
  fog: FogRegion[];
  /**
   * Pontos de anotação do mestre. Ausente = nenhum.
   *
   * NUNCA chega à mesa: `sceneForTable` remove este campo antes de publicar.
   */
  pins?: MapPin[];
  /**
   * Postits colados no mapa. Ausente = nenhum.
   *
   * NUNCA chega à mesa, pela mesma razão dos pontos: `sceneForTable` remove
   * este campo antes de publicar.
   */
  postits?: Postit[];
  /**
   * O handout da cena: ids de imagem do acervo que o mestre separou para
   * esta cena — o mapa do calabouço, a carta do vilão, o retrato da testemunha.
   * Ausente = vazio. Sem repetição: é um conjunto, gravado como lista.
   *
   * É a carta na manga. Pôr uma imagem na mesa NÃO a tira daqui: ela
   * continua guardada, e a bolinha só a mostra esmaecida enquanto está no
   * palco. Arrastar o item de volta à bolinha tira da cena e a reacende.
   *
   * NUNCA chega à mesa, pela mesma razão dos pontos: `sceneForTable` remove
   * este campo antes de publicar.
   */
  handout?: string[];
  /**
   * Medidores colocados sobre o mapa. Ausente = nenhum. A mesa vê. Ver
   * `Medidor`.
   */
  medidores?: Medidor[];
  /**
   * Enquadramento que o Jogador e o Espectador usam. Ausente = plano inteiro.
   * O zoom do Mestre só chega aqui quando ele manda, pelo botão de enquadrar.
   */
  camera?: Viewport;
  /**
   * Grupos da lista de camadas. Ausente = nenhum.
   *
   * NUNCA chega à mesa: `sceneForTable` remove este campo antes de publicar.
   * O `grupoId` nos itens viaja, mas sem a lista é só um id sem uso.
   */
  grupos?: Grupo[];
  /**
   * As câmeras da cena. Ausente = nenhuma ainda; o Mestre cria a primeira ao
   * abrir a cena.
   *
   * Toda câmera tem nome e número: não existe "a câmera" anônima. O que a
   * mesa vê é a que está NO AR (`cameraNoArId`), e `camera` acima é só a
   * cópia do recorte dela, mantida porque é o que o canal e o espectador já
   * leem. As demais são preparação: o mestre ajusta a do beco enquanto a TV
   * ainda mostra a taverna.
   *
   * NUNCA chega à mesa: `sceneForTable` remove este campo antes de publicar.
   */
  cameras?: CameraSalva[];
  /**
   * Qual câmera está transmitindo. Ausente = a mesa vê a cena INTEIRA: o que
   * o mestre não quer revelar fica atrás da névoa, não fora do quadro.
   *
   * Persistido e não derivado de `camera` porque duas câmeras podem ter o
   * mesmo recorte, e reabrir o app tem de acender o chip certo.
   *
   * CHEGA à mesa, ao contrário de `cameras`: é o que a TV usa para saber se o
   * recorte mudou porque a mesma câmera andou (interpola) ou porque outra
   * entrou no ar (corta em fade). Ver `useCorteDeCamera`.
   */
  cameraNoArId?: string;
  /** Grade sobre o mapa. Ausente = sem grade. */
  grid?: SceneGrid;
  /**
   * Os riscos a mao livre. Ausente = nenhum, que e o caso da maioria.
   *
   * Opcional e nao uma lista vazia para nao engordar toda cena que nunca foi
   * riscada -- mesma razao de `grid`.
   */
  tracos?: Traco[];
  createdAt: number;
  updatedAt: number;
  /**
   * O guardado das EXTENSOES, por id de extensao.
   *
   * Opaco para o aplicativo e para o Rust: quem escreve e le e o plugin, e o
   * formato e dele. Vive na cena porque e dado de cena -- viaja no zip da
   * campanha e volta com ela.
   *
   * SAI do payload publicado, junto com alfinetes e postits. Nao e cautela
   * generica: plugin so alcanca o Mestre nesta etapa, entao o que ele escreve
   * e anotacao do mestre por construcao. Ver `sceneForTable`.
   */
  extensoes?: Record<string, unknown>;
};

/** Documento inteiro persistido. Uma mesa = um board. */
export type Board = {
  scenes: Scene[];
  /**
   * Cena aberta no palco do Mestre. É o que o mestre edita, e só ele vê.
   */
  editingSceneId: string | null;
  /**
   * Cena que a mesa está vendo. Separada da de edição de propósito: é o que
   * permite montar a próxima cena enquanto os jogadores seguem na atual.
   * `null` = nada no ar.
   */
  liveSceneId: string | null;
  /** As pastas dos quadros e das notas. Ausente = nenhuma. Ver `Pasta`. */
  pastas?: Pasta[];
  /** As notas `.md` da campanha. Ausente = nenhuma. Ver `Nota`. */
  notas?: Nota[];
};

/**
 * Grade que uma cena ganha ao ser ligada pela primeira vez.
 *
 * 96 unidades num plano de 1920 dá 20 colunas por 11 linhas e meia — perto do
 * que um mapa de batalha costuma usar, e um número redondo de onde ajustar.
 */
export const DEFAULT_GRID: SceneGrid = {
  size: 96,
  offsetX: 0,
  offsetY: 0,
  opacity: 0.35,
};

/** Um quadro, e não um mapa. Ver `TipoDeCena`. */
export function ehQuadro(scene: Pick<Scene, "tipo">): boolean {
  return scene.tipo === "quadro";
}

export function createScene(name: string, tipo?: TipoDeCena): Scene {
  const now = Date.now();
  return {
    id: novoId(),
    name,
    // Só quando é quadro: mapa não ganha `tipo: undefined` gravado no JSON.
    ...(tipo ? { tipo } : {}),
    items: [],
    fog: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Cópia independente de uma cena.
 *
 * Gera id novo para a cena, para cada item e para cada área: com ids
 * compartilhados, mover um item na cópia moveria o original também, porque
 * toda mutação do store encontra o item por id.
 */
export function cloneScene(source: Scene, name: string): Scene {
  const now = Date.now();

  // Id antigo -> id novo, para as ligações continuarem amarradas às cópias e
  // não aos originais.
  const novos = new Map<string, string>();
  const renovar = <T extends { id: string }>(coisa: T): T => {
    const id = novoId();
    novos.set(coisa.id, id);
    return { ...coisa, id };
  };

  return {
    ...source,
    id: novoId(),
    name,
    items: source.items.map(renovar),
    fog: source.fog.map((region) => ({ ...region, id: novoId() })),
    // Os anexos continuam apontando para os MESMOS assets: o arquivo é do
    // acervo da campanha, não do ponto, e copiá-lo duplicaria um mapa de 8 MB
    // por duplicar a cena.
    pins: source.pins?.map(renovar),
    // O texto vem junto com os marcadores dentro dele, e os marcadores são por
    // nome: um `>Porão` copiado continua apontando para a MESMA cena de porão,
    // não para a cópia dela. É o que se quer — duplicar uma cena não duplica o
    // porão a que ela leva.
    postits: source.postits?.map(renovar),
    // Mesma regra dos anexos: são ids do acervo, e a cópia aponta para os
    // mesmos arquivos.
    handout: source.handout ? [...source.handout] : undefined,
    textos: source.textos?.map(renovar),
    // A forma não referencia nada: id novo e pronto.
    formas: source.formas?.map(renovar),
    // O cartão é copiado com o MESMO arquivo por enquanto: copiar o arquivo é
    // assíncrono e é do store, que troca o `arquivo` da cópia logo depois.
    // Ver `duplicateScene`.
    documentos: source.documentos?.map(renovar),
    // Ponta ancorada aponta para a cópia; ponta livre é só um ponto e vem igual.
    //
    // As setas passam por `renovar` ANTES de as pontas serem reescritas, e não
    // ganham id no meio do caminho: uma bifurcação é uma ponta presa em OUTRA
    // SETA, e sem o id novo dela já no mapa a cópia da bifurcação continuaria
    // pendurada na seta original.
    ligacoes: source.ligacoes?.map(renovar).map((ligacao) => {
      const renovada = (ponta: PontaDeLigacao): PontaDeLigacao =>
        "tipo" in ponta
          ? { ...ponta, id: novos.get(ponta.id) ?? ponta.id }
          : ponta;
      return {
        ...ligacao,
        de: renovada(ligacao.de),
        para: renovada(ligacao.para),
      };
    }),
    createdAt: now,
    updatedAt: now,
  };
}

export function createEmptyBoard(): Board {
  const first = createScene("Mapa 1");
  return { scenes: [first], editingSceneId: first.id, liveSceneId: first.id };
}
