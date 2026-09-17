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
export type AssetKind = "image" | "audio";

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
};

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
 * Área escondida. Opaca no Jogador e no Espectador, semi-transparente no
 * Mestre — o mestre vê o que tem embaixo, a mesa não.
 */
export type FogRegion = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Revelada deixa de esconder em todas as visões. */
  revealed: boolean;
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
};

/** O que o chamador informa ao colar um postit; o resto é do store. */
export type NewPostit = Pick<Postit, "x" | "y"> &
  Partial<Pick<Postit, "largura" | "altura" | "texto" | "cor">>;

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
   * A caixa MEDIDA na tela do mestre, em unidades de cena, sem o giro.
   * Ausente até o primeiro render: aí vale a estimativa de `caixaRetaDoTexto`.
   * Gravada porque a mesa também precisa dela para a seta encostar no lugar
   * certo, e a mesa não tem como medir antes de desenhar.
   */
  largura?: number;
  altura?: number;
};

export type NewTexto = Pick<Texto, "x" | "y"> &
  Partial<Pick<Texto, "texto" | "tamanho" | "rotation">>;

/** Tamanho de fonte de um texto novo, em unidades de cena. */
export const TEXTO_TAMANHO = 40;

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
  titulo: string;
  /** Nome do arquivo em `documentos/`, sem diretório. Não muda com o título. */
  arquivo: string;
  /** Época em ms da última gravação do texto. Ausente = nunca escrito. */
  atualizadoEm?: number;
};

export type NewDocumento = Pick<Documento, "x" | "y" | "titulo" | "arquivo"> &
  Partial<Pick<Documento, "largura" | "altura">>;

export const DOCUMENTO_LARGURA = 420;
export const DOCUMENTO_ALTURA = 320;
export const DOCUMENTO_MINIMO = 160;

/** O que uma ligação pode amarrar. */
export type TipoLigavel = "item" | "postit" | "texto" | "pin" | "documento";

/** Uma ponta de ligação: o que ela amarra, por tipo e id. */
export type RefLigacao = { tipo: TipoLigavel; id: string };

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
export type NewFogRegion = Pick<FogRegion, "x" | "y" | "width" | "height">;

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
 * Sem campo de volume: o ganho é da sessão, não da faixa. Guardado por faixa,
 * cada troca de música trocava o volume junto — a escolhida entrava com o
 * ganho de quando foi gravada, e o mestre reajustava o slider a cada troca.
 * O volume da sessão mora no `TrackStore`.
 */
export type SessionTrack = {
  assetId: string;
  loop: boolean;
  /** Pausado é diferente de ausente: a faixa continua escolhida. */
  playing: boolean;
  /**
   * Quando o play atual começou, em epoch ms.
   *
   * Serve para um espectador que chega no meio entrar mais ou menos na altura
   * certa, em vez de começar a faixa do zero enquanto a mesa está no refrão.
   */
  startedAt: number;
};

/**
 * Efeito disparado agora — porta rangendo, trovão, grito.
 *
 * Também mora na cena, pelo mesmo motivo da trilha. `firedAt` muda a cada
 * disparo, e é o que faz o espectador reconhecer que houve um novo: comparar
 * `assetId` não distinguiria dois disparos do mesmo som.
 */

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
  /**
   * Solto da fila automatica, quando ela esta ligada.
   *
   * Excecao e nao regra: o interruptor da fila e um so, no painel, e vale para
   * todos. Este campo e o que permite tirar UM da fila sem desligar o modo --
   * o vilao no canto enquanto o grupo se enfileira embaixo.
   *
   * Ausente na maioria, e por isso e o campo que existe: `naFila: true` em
   * todos os registros diria a mesma coisa ocupando mais espaco, e obrigaria a
   * preencher o padrao a cada retrato novo.
   */
  foraDaFila?: boolean;
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
  /** As pastas dos quadros. Ausente = nenhuma. Ver `Pasta`. */
  pastas?: Pasta[];
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
    // O cartão é copiado com o MESMO arquivo por enquanto: copiar o arquivo é
    // assíncrono e é do store, que troca o `arquivo` da cópia logo depois.
    // Ver `duplicateScene`.
    documentos: source.documentos?.map(renovar),
    // Ponta ancorada aponta para a cópia; ponta livre é só um ponto e vem igual.
    ligacoes: source.ligacoes?.map((ligacao) => {
      const renovada = (ponta: PontaDeLigacao): PontaDeLigacao =>
        "tipo" in ponta
          ? { ...ponta, id: novos.get(ponta.id) ?? ponta.id }
          : ponta;
      return {
        ...ligacao,
        id: novoId(),
        de: renovada(ligacao.de),
        para: renovada(ligacao.para),
      };
    }),
    createdAt: now,
    updatedAt: now,
  };
}

export function createEmptyBoard(): Board {
  const first = createScene("Cena 1");
  return { scenes: [first], editingSceneId: first.id, liveSceneId: first.id };
}
