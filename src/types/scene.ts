/**
 * Contrato central do projeto.
 *
 * Toda posição vive em "coordenadas de cena": um plano fixo de
 * SCENE_WIDTH x SCENE_HEIGHT. Cada visão (Mestre, Espectador, Jogador) escala
 * esse plano para caber na tela dela. Sem isso, o que o mestre posiciona não
 * bate com o que aparece na TV.
 */

import { novoId } from "@/lib/id";
import { t as textoDeCenas } from "@/lib/i18n/cenas";
import type { AjusteDeImagem } from "@/lib/imagem-do-espectador";
import type { Condicao, Medidor } from "@/types/character";

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
  /**
   * A imagem se mexe: GIF, WebP ou APNG com mais de um quadro. Espelho de
   * `AssetMeta::animada` no Rust.
   *
   * A miniatura das listas é sempre o primeiro quadro, e é este campo que diz
   * à lista que há mais: ela põe o selo e anima quando o mouse passa. Ver
   * `MiniaturaDoAcervo`. No palco não muda nada -- o navegador anima sozinho,
   * e o daemon deixa de achatar o arquivo nas reduções de TV e celular.
   *
   * Ausente = não se mexe, ou ninguém perguntou ainda: a primeira listagem da
   * campanha responde por todo o acervo.
   */
  animada?: boolean;
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


/** O dono de um arquivo do acervo, quando ele tem um. */
export type EscopoAsset = "cena" | "personagem" | "efeito";

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
   * O olho da lista de camadas, apagado. Ausente = à vista.
   *
   * Escondido é FORA da cena para todo mundo: o palco do mestre não o desenha,
   * a área não o laça e a mesa nem o recebe -- é o olho do Figma, e não o
   * "escondido da mesa" dos medidores. Serve aos dois usos que a lista tinha
   * sem resposta: tirar o telhado da frente para trabalhar o andar de baixo, e
   * deixar o monstro pronto no lugar até a hora de aparecer.
   *
   * Continua na lista, e é por ela que volta. A pasta tem o mesmo olho, e
   * esconde tudo o que tem dentro -- ver `itensVisiveis`.
   */
  escondido?: boolean;
  /**
   * Espelhamento. Aplicado no referencial do próprio item, depois do giro:
   * espelhar um token é virar o desenho dele, não mover a caixa.
   *
   * Opcionais para não exigir migração dos itens já gravados.
   */
  flipX?: boolean;
  flipY?: boolean;
  /**
   * No 2.5D, a figura em pé espelha para o lado da tela para onde OLHA.
   * Ausente = desligado, a figura fica como o `flipX` a pôs.
   *
   * O olhar é o do facho (`olharDe`): girar o token ou a câmera troca o lado.
   * Ligado, o `flipX` passa a dizer de que lado a ARTE olha -- quem aparece de
   * costas se acerta apertando Espelhar uma vez. Só o desenho espelha: o dado
   * não muda com a câmera, e o 2D, a luz e o desfazer não sentem nada. Ver
   * `espelhadaPeloOlhar`.
   *
   * Por token, e não da cena: arte de frente ou simétrica -- um baú, uma
   * estátua -- não tem lado para virar.
   */
  espelharPeloOlhar?: boolean;
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
  /**
   * Este item NÃO lança sombra. Ausente = lança, se a cena tiver sol.
   *
   * Existe porque metade do que se põe num mapa está pintado no chão e não em
   * pé nele: a marca de sangue, o tapete, o mapa dentro do mapa, a área de
   * efeito. Uma figura deitada que projeta sombra denuncia que é um adesivo, e
   * é justamente o contrário do que a sombra veio fazer.
   *
   * A decisão é do item e não do tipo de arquivo porque o mesmo PNG serve aos
   * dois papéis: o barril é mobília em pé num mapa e é entulho no chão de
   * outro.
   *
   * Continua sendo o interruptor, e o `sombra` abaixo continua gravado com ele
   * ligado: "Nenhuma" no gizmo apaga a sombra sem esquecer como ela era, e
   * voltar devolve a linha do chão que o mestre tinha posto.
   */
  semSombra?: boolean;
  /**
   * COMO este item deita a sombra. Ausente = em pé, pela base que o forno
   * acha, que é o desenho de antes de o campo existir.
   *
   * Ver `SombraDoItem`.
   */
  sombra?: SombraDoItem;
  /**
   * A lanterna que este token carrega. Ausente = nenhuma, que é o normal.
   *
   * No token, e não uma luz solta amarrada a ele por id: o personagem anda, e
   * a luz tem de andar junto sem ninguém atualizar duas coisas. O centro é o
   * do token -- só o alcance e a cor são dela. Viaja para a mesa como o resto
   * do item: é assim que a TV e o celular do jogador acendem em volta dele.
   * Ver `Luz`, que é a luz sem dono.
   */
  luz?: LuzCarregada;
  /**
   * DEITADO no chão, no mapa de esguelha. Ausente = em pé, que é o normal.
   *
   * De esguelha a figura se ergue e encara quem olha; deitada ela fica no chão
   * como no mapa de prumo, no giro dela -- o caído, o dormindo, o corpo no
   * altar. No 2D não muda nada: visto de cima, deitado e em pé são o mesmo
   * desenho. Ver `CenaDeEsguelha`.
   */
  deitado?: boolean;
  /**
   * As condições de um OBJETO: o barril em chamas, a porta amaldiçoada, o baú
   * que brilha. Ausente na imensa maioria dos itens.
   *
   * Só em item SEM personagem: o token leva as do personagem, que moram no
   * índice e valem para a horda inteira de clones. O objeto não tem ficha, e a
   * condição dele mora nele -- na cena, que é onde o barril existe. É o que
   * dá a ela o Ctrl+Z de graça, e o que faz o barril copiado levar o fogo
   * junto.
   *
   * A escondida não sai do Mestre: `itensParaMesa` a tira antes de publicar,
   * como o item escondido. Ver `condicoesDoObjeto`.
   */
  condicoes?: Condicao[];
};

/**
 * Os dois jeitos de uma figura deitar sombra, e eles existem porque o mapa
 * mistura dois tipos de desenho que o mesmo PNG não diz qual é:
 *
 * - `base`: a figura está EM PÉ no desenho -- o boneco de corpo inteiro, a
 *   árvore de lado, o poste. O que está acima da linha do chão escorre para
 *   longe da luz na medida da própria altura, e a linha fica parada.
 * - `inteira`: a figura é vista DE CIMA -- o token redondo, o barril, o
 *   caixote, a copa da árvore. Ali o desenho todo é o topo do objeto, e a
 *   sombra é ele inteiro esticado para longe da luz, a partir da borda virada
 *   para ela.
 *
 * Os dois na mesma conta não davam: o token redondo deitado pela `base` sai
 * como uma moeda em pé, com a sombra nascendo da borda de baixo do círculo e
 * nada dela saindo dos lados. É a sombra que não bate com o objeto.
 */
export const MODOS_DA_SOMBRA = ["base", "inteira"] as const;

export type ModoDaSombra = (typeof MODOS_DA_SOMBRA)[number];

/**
 * O jeito de uma figura deitar sombra, e o ajuste de cada jeito.
 *
 * Os dois ajustes convivem no mesmo objeto de propósito: trocar de modo e
 * voltar não pode jogar fora a linha do chão que o mestre arrastou. Cada conta
 * só lê o seu.
 */
export type SombraDoItem = {
  modo: ModoDaSombra;
  /**
   * Só na `base`: a LINHA DO CHÃO, em fração da altura da caixa a partir do
   * topo -- 1 é a borda de baixo. Ausente = a que o forno acha, que é o último
   * pixel da figura.
   *
   * Existe porque o último pixel quase nunca é onde a figura pisa: o pé que
   * vai à frente no desenho de três quartos, o pedestal redondo do token de
   * pacote, a raiz que se espalha. O que fica ABAIXO da linha é chão, e não
   * projeta nada.
   *
   * Na caixa já espelhada, que é a que o mestre vê: a linha é posta olhando a
   * figura na tela, e não o arquivo.
   */
  base?: number;
  /**
   * Só na `inteira`: quão alto o objeto sobe, em múltiplos do lado MENOR da
   * caixa. Ausente = 1, tão alto quanto largo.
   *
   * Relativo ao tamanho, e não em metros como a parede: aumentar o token é o
   * jeito de dizer que a criatura é maior, e ela tem de crescer para cima
   * junto. A sombra da `base` já se comporta assim, porque ali a altura é o
   * desenho.
   */
  altura?: number;
};

/**
 * O que uma lanterna carregada guarda: até onde ela alcança, de que cor e o
 * quanto acende.
 *
 * Sem posição: quem a carrega dá o centro. Ver `CanvasItem.luz`.
 */
export type LuzCarregada = {
  /** Em unidade de cena, do centro até onde a luz acaba. */
  raio: number;
  /** Em `#rrggbb`. A paleta é `CORES_DA_LUZ`, mas qualquer cor vale. */
  cor: string;
  /**
   * O quanto ela acende, de 0 a 1. Ausente = 1, a lanterna de antes de a
   * intensidade existir. A mesma conta de `Luz.intensidade`: é a vela no fim,
   * e não uma vela menor -- para essa existe o `raio`.
   */
  intensidade?: number;
  /**
   * Como ela se mexe. Ausente = fixa. A tocha na mão do guerreiro tremula como
   * a da parede, e é por isso que o efeito vale para as duas. Ver `EfeitoDaLuz`.
   */
  efeito?: EfeitoDaLuz;
  /**
   * O facho, quando ela aponta: a lanterna de foco, o farol do capacete.
   * Ausente = círculo, a lanterna de sempre.
   *
   * O `angulo` é RELATIVO À FIGURA, e não ao mapa, e é a diferença para o
   * cone da luz cravada. O mestre aponta uma vez para onde o rosto do
   * desenho olha, e dali em diante girar o token gira o facho -- quem vira a
   * cabeça no corredor leva a luz junto, sem ninguém mirar de novo. Espelhar
   * a figura espelha o facho pela mesma razão. Ver `anguloDoFacho`.
   */
  cone?: ConeDaLuz;
};

/**
 * Como uma luz se comporta no tempo. Ausente = fixa, a luz de sempre.
 *
 * - `fogo`: tremula sem ritmo, sem nunca apagar. A tocha, a fogueira, a vela.
 * - `pulsando`: sobe e desce devagar, como quem respira. A runa, o cristal.
 * - `piscando`: acende e apaga no compasso. O farol, o alarme, a lâmpada que
 *   avisa.
 *
 * Três climas, e não uma régua de velocidade e amplitude: o mestre escolhe
 * "fogo", e não "4 Hz a 28%". A conta de cada um mora em `fatorDoEfeito`.
 */
export const EFEITOS_DA_LUZ = ["fogo", "pulsando", "piscando"] as const;

export type EfeitoDaLuz = (typeof EFEITOS_DA_LUZ)[number];

/**
 * O cone de uma luz que aponta: a lanterna de foco, o farol, o olho do golem.
 *
 * Os graus seguem o sol (`Sol.angulo`): no sentido horário a partir da
 * direita. O `raio` da luz continua sendo o alcance, agora medido no eixo do
 * cone.
 */
export type ConeDaLuz = {
  /** Para onde o cone aponta. */
  angulo: number;
  /** A abertura inteira, de uma borda à outra. */
  abertura: number;
};

/**
 * O cone com que uma luz vira cone: o facho de uma lanterna, apontando para a
 * direita -- onde estava a alça do alcance do círculo, que vira a ponta dele.
 */
export const CONE_PADRAO: ConeDaLuz = { angulo: 0, abertura: 60 };

/**
 * O cone com que a lanterna de um token vira cone: para BAIXO da figura.
 *
 * Para baixo, e não para a direita como o da luz cravada, porque o ângulo aqui
 * é da figura (ver `LuzCarregada.cone`), e a figura de token que se compra
 * quase sempre olha para quem a vê -- o rosto está embaixo. Quem desenha
 * olhando para cima troca uma vez, no menu.
 */
export const CONE_DA_LANTERNA: ConeDaLuz = { angulo: 90, abertura: 60 };

/**
 * Os limites da abertura, em graus.
 *
 * Abaixo de dez o cone é um risco, e acima de 270 é um círculo com uma
 * mordida -- para isso existe o círculo. O teto também guarda a borda macia
 * longe da volta completa. Ver `paradasDoCone`.
 */
export const ABERTURA_MINIMA = 10;
export const ABERTURA_MAXIMA = 270;

/**
 * Uma luz cravada no mapa: a tocha na parede, a fogueira, o braseiro.
 *
 * ## A luz acende, a parede a para, e o token a tapa
 *
 * Ela reduz a escuridão da cena em volta de si, na cor dela. Atrás de uma
 * parede, vista desta luz, continua escuro até a borda do alcance. Atrás de um
 * TOKEN fica a SILHUETA dele deitada para longe da luz -- a mesma do sol, mais
 * curta perto da chama e mais comprida longe dela. Três tochas numa sala dão
 * três vultos por goblin, e é o que três tochas fazem. Ver `cisalhamentoDaLuz`
 * e, para enquanto a silhueta não fica pronta, `sombraDoToken`.
 *
 * Sem escuridão (`Scene.escuridao` zero ou ausente), a luz é só um brilho da
 * cor dela. É o que permite pôr luz num mapa que já veio bonito sem apagá-lo.
 */
export type Luz = {
  id: string;
  /** O centro, em unidade de cena. */
  x: number;
  y: number;
  /** A ÁREA: até onde a luz chega, já quase apagada na borda. */
  raio: number;
  /**
   * Até onde a luz é FORTE. Ausente = metade do `raio`.
   *
   * Dois raios, e não um só com a queda fixa, porque são duas perguntas da
   * mesa: "onde dá para ler o mapa" e "até onde se enxerga algum vulto". A
   * tocha clareia a sala e deixa o corredor na penumbra; a vela clareia a mesa
   * e mal chega à porta. Ver `paradasDaLuz`.
   */
  raioIntenso?: number;
  cor: string;
  /**
   * O quanto ela acende, de 0 a 1. Ausente = 1, a luz inteira.
   *
   * Metade apaga metade do escuro onde ela alcança, e o véu da cor dela vem
   * pela metade junto: é a brasa quase apagada ao lado da fogueira acesa, e
   * não uma luz menor. Para luz menor existe o `raio`.
   */
  intensidade?: number;
  /**
   * Desligada: continua no mapa, e não acende nada. Ausente = acesa.
   *
   * É a tocha que a mesa apaga para passar escondida, e que acende de novo
   * duas salas depois. Remover obrigaria o mestre a cravar outra e acertar de
   * novo a cor, o alcance e o cone.
   */
  desligada?: boolean;
  /** Ausente = círculo, a luz que vai para todo lado. Ver `ConeDaLuz`. */
  cone?: ConeDaLuz;
  /** Ausente = fixa. Ver `EfeitoDaLuz`. */
  efeito?: EfeitoDaLuz;
  /**
   * Travado: o mestre não move, não redimensiona, não gira e não apaga.
   * Ausente = livre. O mesmo campo do `CanvasItem`, com o mesmo nome, para os
   * filtros de "quem anda" servirem a todos. Ver `trava` em `TransformHandles`.
   */
  locked?: boolean;
};

/**
 * O alcance com que uma luz nasce: um terço da largura do plano.
 *
 * O bastante para a tocha de uma sala iluminar a sala, e não o mapa inteiro.
 */
export const RAIO_DA_LUZ_PADRAO = 320;

/**
 * As cores que uma luz oferece de cara.
 *
 * Uma paleta curta na frente, e a cor livre atrás dela: a luz se lê pelo CLIMA
 * -- o fogo, a lua, a magia, o veneno --, e seis climas cobrem quase toda
 * mesa. O resto -- o verde exato da lanterna élfica -- vem do seletor do
 * sistema. A primeira é a da chama, que é a luz que quase toda mesa acende.
 */
export const CORES_DA_LUZ = [
  "#fb923c",
  "#fde68a",
  "#93c5fd",
  "#c4b5fd",
  "#86efac",
  "#fca5a5",
] as const;

/**
 * Os tons que o escuro oferece de cara. Ver `Scene.corDoEscuro`.
 *
 * Escuros de verdade, e não cores: o que se escolhe aqui é a luz AMBIENTE, e
 * ela aparece por baixo de tudo onde nenhuma tocha chega. Um azul claro de
 * "noite" lavaria o mapa inteiro de azul. O primeiro é o breu, o de sempre.
 */
export const CORES_DO_ESCURO = [
  "#000000",
  "#0b1330",
  "#1c130b",
  "#170a24",
] as const;

/**
 * As cores que o vazio oferece de cara. Ver `Scene.corDoVazio`.
 *
 * O que está FORA do mapa: a sala em volta do chão, no 2D e no 2.5D. O breu é o
 * de sempre -- o mapa é a luz, e o escuro em volta some da vista. Os outros são
 * salas de verdade -- o carvão, a ardósia, o feltro da mesa --, para quem quer
 * um fundo em lugar de um buraco. O tom exato vem do seletor, atrás da paleta.
 */
export const CORES_DO_VAZIO = [
  "#000000",
  "#1c1917",
  "#1e293b",
  "#14342b",
] as const;

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
  /**
   * Travado: o mestre não move, não redimensiona, não gira e não apaga.
   * Ausente = livre. O mesmo campo do `CanvasItem`, com o mesmo nome, para os
   * filtros de "quem anda" servirem a todos. Ver `trava` em `TransformHandles`.
   */
  locked?: boolean;
  /**
   * Os furos que a borracha abriu. Ausente = nenhum, que é o normal.
   *
   * Na área, e não uma lista da cena: o furo é um pedaço DESTA névoa, e mover,
   * escalar, girar, copiar e desfazer a área têm de levá-lo junto sem ninguém
   * atualizar duas coisas. Ver `FuroDaArea`.
   */
  furos?: FuroDaArea[];
  /**
   * Dinâmica: a lanterna de cada token abre buraco nela enquanto alcança, e a
   * névoa volta quando a luz vai embora. Ausente = estática, a de sempre.
   *
   * Sem memória do que já foi visto: o buraco é calculado em cada tela, a
   * partir dos tokens, das paredes e das portas que ela já recebe -- nada
   * novo atravessa o canal. As paredes e as portas param a revelação como
   * param a luz. Ver `lanternasDaArea`.
   */
  dinamica?: true;
};

/**
 * Uma passada da borracha numa área escondida: um traço de pincel redondo.
 *
 * Em FRAÇÃO da caixa, como os vértices do polígono, e pela mesma razão: mover,
 * escalar e girar a área levam o furo junto, sem tocar num ponto. O raio é em
 * fração da LARGURA -- crescer a área cresce o furo na mesma conta.
 */
export type FuroDaArea = {
  /** Metade da espessura do pincel, em fração da largura da caixa. */
  raio: number;
  /** Achatados -- `x0, y0, x1, y1, ...` --, em fração da caixa. */
  pontos: number[];
};

/**
 * Uma área de EFEITO: um pedaço do chão em chamas.
 *
 * A mesma caixa da área escondida -- `x, y, width, height`, o `formato`, o
 * giro e os vértices do polígono, ver `FogRegion` --, e pela mesma razão: o
 * gizmo, as alças de vértice e o laço servem às duas sem aprender geometria
 * nova. O que muda é o que ela FAZ: em vez de esconder, ela pega fogo.
 *
 * O desenho é SEGMENTADO: a área é dividida em casas da grade (ou do tamanho
 * da grade padrão, sem grade), e cada casa cujo centro cai dentro da forma é
 * um foco do efeito, com a fase dele. A área grande tem mais focos -- nunca o
 * mesmo fogo esticado. Ver `planoDaArea`.
 *
 * O efeito vem do catálogo, como o da condição: um dos efeitos em área da
 * campanha (ver `efeitosEmAreaDaCampanha`), que o mestre escolhe no gizmo. A
 * área NASCE sem efeito -- é um pedaço do chão marcado, e o que acontece nele
 * é a escolha seguinte.
 */
export type AreaDeEfeito = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Ausente = retângulo. */
  formato?: FormatoDeArea;
  /** Graus, no sentido horário, em torno do centro da caixa. Ausente = 0. */
  rotation?: number;
  /** Só o polígono: os vértices em fração da caixa. Ver `FogRegion.pontos`. */
  pontos?: number[];
  /**
   * O id do efeito no catálogo, como o de `Condicao.efeito`. Ausente = sem
   * efeito ainda: o Mestre vê o contorno, a mesa não vê nada.
   */
  efeito?: string;
  /**
   * A cor desta área, quando o mestre escolheu uma no gizmo. Ausente = a do
   * efeito (`area.cor`), e é o comum: editar a cor do efeito na campanha muda
   * todas as áreas que o usam. Ver `corDaArea`.
   */
  cor?: string;
  /** Está na mesa? Ausente = só o mestre vê, como a forma num mapa. */
  naMesa?: boolean;
  /** Travada: o mestre não move, não redimensiona, não gira e não apaga. */
  locked?: boolean;
};

export type NewAreaDeEfeito = Omit<AreaDeEfeito, "id">;

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
  /**
   * O token se encaixa no quadrado ao ser arrastado.
   *
   * Campo da grade e nao do aplicativo: e decisao de MAPA -- a planta da
   * masmorra quer a peca na casa, e o mapa de viagem desenhado a mao quer a
   * peca onde a mao a largou. Dentro de `SceneGrid` ele tambem viaja de graca
   * para a TV e para os celulares, que e o que faz o dedo do jogador obedecer
   * a mesma regra do mestre.
   *
   * Ausente = desligado: a grade sempre foi so desenho, e ligar o ima em todo
   * mapa que ja existe mudaria o lugar das pecas sem ninguem pedir.
   */
  snap?: boolean;
  /**
   * A forma da casa. Ausente = quadrado.
   *
   * Hexágono em duas orientações porque mapa comprado vem nas duas, e girar a
   * grade não resolve: o hexágono com a ponta para cima e o com o lado para
   * cima são redes diferentes, e a do desenho só casa com uma delas.
   *
   * No hexágono, `size` é a distância entre os centros de duas casas vizinhas
   * -- a largura dele de lado a lado. É o que mantém um passo valendo um metro
   * nas duas formas: a régua, o fantasma do token e o encaixe leem o mesmo
   * `size` sem saber qual forma a casa tem. Ver `METROS_POR_QUADRADO`.
   *
   * Um campo com as três respostas, e não um `hex` com uma orientação ao lado:
   * orientação de quadrado não existe, e dois campos deixariam gravar uma.
   *
   * Ausente e não `"quadrado"` pelo mesmo motivo do ímã: toda cena que já
   * existe tem grade quadrada, e um aparelho de versão antiga que não conhece
   * o campo continua desenhando a grade de sempre.
   */
  forma?: "hex-ponta" | "hex-lado";
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

/** O postit sem o id, com a cor e a letra -- o que copiar e duplicar guardam. */
export function semIdDoPostit(postit: Postit): Omit<Postit, "id"> {
  return {
    x: postit.x,
    y: postit.y,
    largura: postit.largura,
    altura: postit.altura,
    texto: postit.texto,
    cor: postit.cor,
    fonte: postit.fonte,
  };
}

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
   * Letra de mão, a do postit (Kalam). Ausente = a letra da interface.
   *
   * Continua gravado junto da `familia`, e é ele que diz "mão" no texto antigo:
   * ver `familiaDoTexto`.
   */
  aMao?: true;
  /**
   * A família da letra. Ausente = a do `aMao`: mão com ele, a da interface sem.
   *
   * Um campo à parte, e não o `aMao` virando lista: o texto gravado antes de a
   * família existir continua válido sem migração nenhuma. Ver `familiaDoTexto`.
   */
  familia?: FamiliaDoTexto;
  /**
   * Como as linhas se alinham entre si. Ausente = à esquerda, a de sempre.
   *
   * Só se vê com mais de uma linha: o texto não tem largura fixa, e a caixa é
   * a da linha mais longa -- as outras se alinham dentro dela.
   */
  alinhamento?: "centro" | "direita";
  /** De 0 a 1, no texto inteiro, com o fundo. Ausente = 1. */
  opacidade?: number;
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
   * Travado: o mestre não move, não redimensiona, não gira e não apaga.
   * Ausente = livre. O mesmo campo do `CanvasItem`, com o mesmo nome, para os
   * filtros de "quem anda" servirem a todos. Ver `trava` em `TransformHandles`.
   */
  locked?: boolean;
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
      | "aMao"
      | "familia"
      | "alinhamento"
      | "opacidade"
      | "naMesa"
      | "locked"
    >
  >;

/**
 * O texto sem o id, campo a campo -- o que copiar e duplicar guardam.
 *
 * Irmão de `semIdDaForma`, e existe pelo mesmo motivo: a cópia escrita à mão
 * em dois lugares guardava só texto, tamanho e giro, e o texto colado voltava
 * na cor do tema, sem fundo e sem negrito. Fica de fora a caixa medida
 * (`largura`, `altura`), que é do render e não do conteúdo: a cópia se mede ao
 * nascer.
 */
export function semIdDoTexto(texto: Texto): NewTexto {
  return {
    x: texto.x,
    y: texto.y,
    texto: texto.texto,
    tamanho: texto.tamanho,
    rotation: texto.rotation,
    cor: texto.cor,
    fundo: texto.fundo,
    negrito: texto.negrito,
    italico: texto.italico,
    sublinhado: texto.sublinhado,
    aMao: texto.aMao,
    familia: texto.familia,
    alinhamento: texto.alinhamento,
    opacidade: texto.opacidade,
    // Como na forma: a decisão de mostrar acompanha a cópia.
    naMesa: texto.naMesa,
    locked: texto.locked,
  };
}

/** Tamanho de fonte de um texto novo, em unidades de cena. */
export const TEXTO_TAMANHO = 40;

/**
 * As famílias de letra de um texto: a da interface (Geist), a de mão do
 * postit (Kalam) e a de código (Geist Mono). As três que o aplicativo já
 * carrega -- nenhum arquivo novo no pacote do Mestre nem no do celular.
 */
export const FAMILIAS_DO_TEXTO = ["interface", "mao", "codigo"] as const;

export type FamiliaDoTexto = (typeof FAMILIAS_DO_TEXTO)[number];

/** A família de um texto, lendo o `aMao` de quem foi gravado antes dela. */
export function familiaDoTexto(
  texto: Pick<Texto, "familia" | "aMao">,
): FamiliaDoTexto {
  return texto.familia ?? (texto.aMao ? "mao" : "interface");
}

/**
 * O que gravar para pôr um texto nesta família.
 *
 * O mínimo de campos: a interface é a ausência dos dois, e a mão continua
 * sendo o `aMao` de sempre -- só o código precisa do campo novo. Assim um
 * arquivo de cena só muda de forma quando há o que dizer, e o texto escrito à
 * mão se lê igual numa versão do aplicativo anterior à família.
 */
export function patchDaFamilia(
  familia: FamiliaDoTexto,
): Pick<Texto, "familia" | "aMao"> {
  return {
    familia: familia === "codigo" ? "codigo" : undefined,
    aMao: familia === "mao" ? true : undefined,
  };
}

/**
 * Os tamanhos de cara do painel de texto, em unidades de cena: pequeno, médio,
 * grande e enorme. O médio é o de sempre (`TEXTO_TAMANHO`); o canto do gizmo
 * continua escalando em qualquer número entre eles.
 */
export const TAMANHOS_DO_TEXTO = { S: 24, M: TEXTO_TAMANHO, L: 64, XL: 96 } as const;

/** As formas que o quadro desenha. Ver `Forma`. */
export const TIPOS_DE_FORMA = [
  "retangulo",
  "elipse",
  "linha",
  "poligono",
] as const;

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
   * Opacidade do traço e do fundo, de 0 a 1. Ausente = 1, opaco.
   *
   * Separadas, e não uma opacidade da forma inteira: o uso é o do marca-texto
   * -- a borda firme cercando, o miolo quase sumido para o que está atrás
   * continuar legível. Uma só apagaria os dois juntos. Ausente é o padrão pela
   * mesma razão da imagem: gravar o 1 deixaria toda forma velha com um campo a
   * mais dizendo o óbvio.
   */
  opacidadeDoTraco?: number;
  opacidadeDoFundo?: number;
  /**
   * Só a linha: ela corre do canto superior esquerdo ao inferior direito
   * (ausente) ou do inferior esquerdo ao superior direito (`"secundaria"`).
   */
  diagonal?: "secundaria";
  /**
   * Os vértices do laço, em FRAÇÃO da caixa. Só existem em `poligono`.
   *
   * O mesmo campo, com o mesmo significado e a mesma conta, que a área
   * escondida e a parede: `pontosNaCaixa` serve aos três. O laço entrou nas
   * três de uma vez porque contornar à mão o que não é retângulo nem elipse é a
   * mesma necessidade, mude o que a figura SIGNIFICA.
   */
  pontos?: number[];
  /** Está na mesa? Ausente = só o mestre vê. O mesmo do texto solto. */
  naMesa?: boolean;
  /**
   * Travado: o mestre não move, não redimensiona, não gira e não apaga.
   * Ausente = livre. O mesmo campo do `CanvasItem`, com o mesmo nome, para os
   * filtros de "quem anda" servirem a todos. Ver `trava` em `TransformHandles`.
   */
  locked?: boolean;
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
    opacidadeDoTraco: forma.opacidadeDoTraco,
    opacidadeDoFundo: forma.opacidadeDoFundo,
    diagonal: forma.diagonal,
    // Sem eles o polígono colado não tinha vértice nenhum: a cópia chegava como
    // uma caixa vazia, que o mestre via como "o Ctrl+C não pegou".
    pontos: forma.pontos,
    // A decisão de mostrar acompanha a cópia: duplicar uma forma que a mesa
    // está vendo e ver a cópia sumir seria o gesto desfazendo o que o mestre
    // acabou de decidir.
    naMesa: forma.naMesa,
    // A trava vai junto, como vai a do item: ver `offsetDraft`.
    locked: forma.locked,
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
  Partial<
    Pick<
      FogRegion,
      "formato" | "rotation" | "pontos" | "locked" | "furos" | "dinamica"
    >
  >;

/**
 * A área sem o id e sem o `revealed`, campo a campo -- o que copiar guarda.
 *
 * Sem o `revealed` porque a cópia nasce escondendo, como toda área nova: ver
 * `useClipboardStore`. Escrito e não `{ id, ...resto }` pela razão de
 * `semIdDaForma`.
 */
export function semIdDaArea(area: FogRegion): NewFogRegion {
  return {
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height,
    formato: area.formato,
    rotation: area.rotation,
    pontos: area.pontos,
    locked: area.locked,
    furos: area.furos,
    dinamica: area.dinamica,
  };
}

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
  /**
   * De 0 a 1, no risco inteiro. Ausente = 1, o risco cheio de sempre.
   *
   * No risco, e não na cor: o trecho em que o traço cruza a si mesmo não
   * escurece, e é a marca-texto que o mestre quer por cima do mapa, e não
   * camadas de tinta.
   */
  opacidade?: number;
};

export type NewTraco = Pick<Traco, "pontos" | "cor" | "espessura" | "opacidade">;

/** As formas de régua. Ver `Regua`. */
export const FORMAS_DE_REGUA = ["linha", "circulo", "cone", "retangulo"] as const;

export type FormaDaRegua = (typeof FORMAS_DE_REGUA)[number];

/** Abertura do cone, em graus, quando a régua não diz. */
export const ABERTURA_CONE_PADRAO = 60;

/**
 * Uma régua colocada sobre o mapa: linha, círculo, cone ou retângulo, com a
 * conta em metros escrita nela.
 *
 * O tipo se chamava `Medidor`, e o campo da cena ainda se chama `medidores` --
 * ele está gravado em toda cena no disco, e renomeá-lo cobraria uma migração
 * por uma palavra. A palavra importou quando o personagem ganhou os DELE: dois
 * `Medidor` no mesmo arquivo, um que mede o mapa e outro que mede a vida, é a
 * confusão que o primeiro leitor apanha. A ferramenta já se chamava Régua na
 * barra -- era o tipo que estava com o outro nome. Ver `Medidor`, em
 * `types/character`.
 *
 * Mora na CENA, como o risco e a névoa: antes a régua era um gesto que sumia ao
 * soltar, e a pergunta "cabe o carro nessa viela?" tinha de ser refeita a cada
 * vez que alguém duvidava. Colocada, ela fica, anda com o dedo, e sai quando o
 * mestre a apaga. Viaja no zip, entra no desfazer, e a mesa vê -- medir é
 * apontar para ela.
 *
 * Todas as formas cabem em DOIS pontos, e é por isso que mover e redimensionar
 * são o mesmo gesto para as quatro: `x, y` é a origem -- começo da régua,
 * centro do círculo, vértice do cone, um canto do retângulo -- e `x2, y2` é o
 * fim -- a outra ponta, um ponto na borda que dá o raio, a ponta do cone, o
 * canto oposto.
 *
 * A grade é quem dá o metro: sem ela a régua não é criada. Ver
 * `METROS_POR_QUADRADO`.
 */
export type Regua = {
  id: string;
  forma: FormaDaRegua;
  x: number;
  y: number;
  x2: number;
  y2: number;
  /** Cor CSS, como o mestre escolheu. */
  cor: string;
  /** Só o cone: abertura total em graus. Ausente = `ABERTURA_CONE_PADRAO`. */
  abertura?: number;
};

export type NovaRegua = Omit<Regua, "id">;

/**
 * Uma parede: onde a luz para.
 *
 * Só geometria, e de propósito. A parede daqui não é a parede DESENHADA do
 * mapa -- essa já está pintada no arquivo, e é ela que o mestre segue por cima.
 * Esta é a informação de que ali a luz para. É por isso que a mesa nunca vê a
 * parede: o que ela vê é o efeito, a sombra.
 *
 * A CAIXA é a verdade, nos quatro formatos, exatamente como na área escondida:
 * `x, y, width, height` é o que o gizmo move, escala e gira, e o `formato` diz
 * só qual desenho ela tem. É isso que dá giro, laço e alça à parede sem que
 * snap, limites e desfazer aprendam geometria nova -- e a primeira versão, que
 * era um segmento cru de quatro números, não tinha nada disso.
 *
 * Não para o TOKEN. Trancar a peça no meio do mapa atrapalha a mestragem --
 * pôr alguém dentro da parede é gesto legítimo numa mesa --, e a parede que
 * bloqueia o arrasto obrigaria o mestre a apagá-la para poder mestrar.
 */
/**
 * Os formatos que uma parede sabe ter.
 *
 * Os mesmos nomes da área escondida e da forma do quadro, porque é o mesmo
 * vocabulário para a mesma pergunta: qual é o desenho. O que muda entre os três
 * é o que o desenho SIGNIFICA -- cercar, esconder, parar a luz.
 *
 * `linha` é o caso comum e é a diagonal da caixa: a parede de um corredor é um
 * traço, e obrigar o mestre a fechar um retângulo de dois pixels de altura para
 * traçá-la seria cobrar um recinto por uma divisória.
 */
export const FORMATOS_DE_PAREDE = [
  "linha",
  "retangulo",
  "elipse",
  "poligono",
] as const;

export type FormatoDeParede = (typeof FORMATOS_DE_PAREDE)[number];

export type Parede = {
  id: string;
  /** Canto superior esquerdo da caixa, em coordenadas de cena. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Graus, no sentido horário, em torno do centro da caixa. Ausente = 0. */
  rotation?: number;
  formato: FormatoDeParede;
  /**
   * Os vértices do laço, em FRAÇÃO da caixa, como na área recortada. Só existem
   * em `poligono`. Ver `pontosNaCaixa`.
   */
  pontos?: number[];
  /**
   * Só a `linha`: ela corre do canto superior esquerdo ao inferior direito
   * (ausente) ou do inferior esquerdo ao superior direito (`"secundaria"`).
   * A mesma convenção da forma do quadro.
   */
  diagonal?: "secundaria";
  /**
   * De que cor a face dela sobe, quando o mapa é visto de esguelha.
   *
   * Ausente = LIDA DO MAPA, e esse é o caso comum: a parede já está pintada no
   * arquivo, e a cor dominante do topo dela acerta na maioria das vezes sem que
   * ninguém escolha nada. Ver `cor-do-mapa.ts`.
   *
   * Existe porque a leitura não tem como acertar sempre, e quando erra só o
   * mestre sabe o que era: um muro tomado de hera devolve verde, um tapete
   * vermelho encostado numa divisória a pinta de vermelho, e um mapa em que a
   * parede é só um traço preto não tem cor de pedra nenhuma para ler. A conta é
   * um bom palpite, e o palpite é do desenho -- a última palavra é de quem
   * mestra.
   *
   * Só a FACE. O topo continua sendo o pedaço de mapa que estava ali, sempre:
   * ele é o desenho do autor, e repintá-lo seria apagar o mapa.
   *
   * Não vale no mapa chapado, onde parede não tem face -- é geometria de
   * esguelha, como a `altura`.
   */
  cor?: string;
  /**
   * Quão alta ela é, em unidades de cena. Ausente = `ALTURA_DA_PAREDE`.
   *
   * Muda a SOMBRA, e só ela: a parede continua sendo geometria de chão -- onde
   * a luz para --, e nada no mapa fica mais perto ou mais longe por causa
   * disto. Mas uma mureta de jardim e uma torre de vigia jogam sombras muito
   * diferentes, e até aqui as duas jogavam a mesma.
   *
   * Em unidade de cena, como todo o resto da geometria, e não em metros: o
   * controle é que traduz, porque metro é a régua de quem mestra. Ver
   * `UNIDADES_POR_METRO`.
   *
   */
  altura?: number;
  /**
   * A parede é DESCOBERTA: não tem laje em cima. Ausente = é coberta.
   *
   * É a diferença entre "esta massa é coberta" e "este muro cerca um quintal", e
   * o que ela decide é se a sombra entra no MIOLO.
   *
   * A parede coberta é uma máscara posta em cima da parede já pintada no mapa, e
   * escurecer o miolo dela seria escurecer o desenho: ali só as bordas que jogam
   * para fora projetam. No pátio o miolo é chão à vista, e a sombra do muro cai
   * dentro dele como cai para fora. Ver `segmentosQueProjetam`.
   *
   * Coberta por padrão porque é o que a massa de uma parede é: quem desenha um
   * pátio diz isso na bolinha do gizmo.
   *
   * Não vale para a `linha`, que não tem interior.
   */
  semTeto?: boolean;
  /**
   * Travado: o mestre não move, não redimensiona, não gira e não apaga.
   * Ausente = livre. O mesmo campo do `CanvasItem`, com o mesmo nome, para os
   * filtros de "quem anda" servirem a todos. Ver `trava` em `TransformHandles`.
   */
  locked?: boolean;
};

export type NewParede = Omit<Parede, "id">;

/** A parede sem o id, campo a campo. Pela razão de `semIdDaForma`. */
export function semIdDaParede(parede: Parede): NewParede {
  return {
    x: parede.x,
    y: parede.y,
    width: parede.width,
    height: parede.height,
    rotation: parede.rotation,
    formato: parede.formato,
    pontos: parede.pontos,
    diagonal: parede.diagonal,
    altura: parede.altura,
    semTeto: parede.semTeto,
    locked: parede.locked,
  };
}

/**
 * Uma porta: um pedaço de parede que gira.
 *
 * Geometria de luz, como a parede, e pela mesma razão: a porta já está pintada
 * no arquivo do mapa, e o que esta diz é onde a luz para. A mesa nunca vê a
 * folha -- vê a sala do outro lado acender quando ela abre.
 *
 * A DOBRADIÇA é a verdade, e não uma caixa como na parede: a porta gira em
 * volta de uma ponta, e a caixa girada em volta do centro brigaria com esse
 * gesto a cada quadro. Mover é trocar `x, y`; abrir é trocar `abertura`; o
 * comprimento e o ângulo da porta fechada só mudam quando o mestre refaz o
 * traço pela dobradiça.
 *
 * Na hora da luz, do sol e do 2.5D ela vira uma parede `linha` na posição em
 * que está -- ver `paredeDaPorta` --, e nada daquela geometria aprendeu porta.
 *
 * Não para o TOKEN, pela razão da parede.
 */
export type Porta = {
  id: string;
  /** A dobradiça, em coordenadas de cena. */
  x: number;
  y: number;
  /** Da dobradiça à ponta da folha, em unidades de cena. */
  comprimento: number;
  /** Para onde a folha aponta FECHADA: graus, no sentido horário, a partir do leste. */
  angulo: number;
  /**
   * Quanto ela está aberta, em graus somados ao `angulo`. O sinal diz para que
   * lado. Ausente = fechada, que é como toda porta nasce.
   */
  abertura?: number;
  /**
   * A última abertura antes de fechar: é para ali que o botão "Abrir" a leva.
   * Ausente = nunca abriu, e o botão abre a 90 graus.
   *
   * Existe porque o LADO importa: a porta da cela abre para o corredor, e o
   * botão que a abrisse sempre para o mesmo lado a jogaria por dentro da
   * parede metade das vezes.
   */
  ultimaAbertura?: number;
  /**
   * Quão alta ela sobe no 2.5D, e quão longa é a sombra dela ao sol, em
   * unidades de cena. Ausente = a altura da parede. Ver `Parede.altura`.
   */
  altura?: number;
  /** Travada, como a parede. Ver `Parede.locked`. */
  locked?: boolean;
};

export type NewPorta = Omit<Porta, "id">;

/** A porta sem o id, campo a campo. Pela razão de `semIdDaForma`. */
export function semIdDaPorta(porta: Porta): NewPorta {
  return {
    x: porta.x,
    y: porta.y,
    comprimento: porta.comprimento,
    angulo: porta.angulo,
    abertura: porta.abertura,
    ultimaAbertura: porta.ultimaAbertura,
    altura: porta.altura,
    locked: porta.locked,
  };
}

export type NewLuz = Omit<Luz, "id">;

/** A luz sem o id, campo a campo. Pela razão de `semIdDaForma`. */
export function semIdDaLuz(luz: Luz): NewLuz {
  return {
    x: luz.x,
    y: luz.y,
    raio: luz.raio,
    raioIntenso: luz.raioIntenso,
    cor: luz.cor,
    intensidade: luz.intensidade,
    desligada: luz.desligada,
    cone: luz.cone,
    efeito: luz.efeito,
    locked: luz.locked,
  };
}

/**
 * O sol da cena: luz sem posição, só direção.
 *
 * Uma cena tem no máximo um. As `Luz` também deitam a silhueta, cada uma para
 * longe de si -- ver `cisalhamentoDaLuz`. Sem posição não há
 * projeção a calcular por token: a sombra de todo mundo é a mesma figura
 * deitada para o mesmo lado. É o que dá volume a um mapa a céu aberto por quase
 * nada.
 *
 * Ausente é o estado normal, e não um esquecimento: mapa de masmorra não tem
 * sol, e token de pacote quase sempre já traz uma sombra pintada no próprio
 * PNG -- ligar o sol por padrão daria duas sombras em sentidos diferentes na
 * primeira cena de todo mundo. O mestre liga quando o mapa pede.
 */
export type Sol = {
  /**
   * Para onde a sombra VAI, em graus, no sentido horário a partir da direita.
   *
   * O ângulo da sombra e não o do sol, porque é a sombra que se vê: o mestre
   * gira um controle olhando o que acontece na tela, e "o sol está a 305" é
   * uma conta que ninguém quer fazer no meio da sessão.
   */
  angulo: number;
  /** Comprimento da sombra, em frações da altura do item. */
  comprimento: number;
  /** Quão escura ela é, de 0 a 1. */
  forca: number;
};

/** Quão escura uma sombra é quando ninguém disse. */
export const FORCA_DA_SOMBRA = 0.45;

/**
 * O sol que nasce quando o mestre liga o sol.
 *
 * Tarde alta e à esquerda: a sombra cai para a direita e para baixo, que é
 * para onde a luz de cima de uma sala costuma jogá-la, e é o sentido que a
 * sombra pintada na maioria dos tokens de pacote já tem. Ligar o sol num mapa
 * desses soma as duas em vez de cruzá-las.
 */
/**
 * Uma câmera de esguelha parada num lugar: um tripé com a câmera em cima.
 *
 * A câmera 2D é um RECORTE do mapa visto de cima. Esta é um OLHO dentro da
 * cena -- um ponto no chão, uma altura, uma direção e uma lente --, e é ela
 * que faz a mesa ver o mapa de esguelha: com um tripé no ar a janela do
 * espectador vira 2.5D, com uma câmera 2D ela volta a ser de prumo. O mestre
 * pode estar editando no 2D enquanto a mesa olha pelo tripé.
 *
 * Posição e direção, e não "alvo e distância" como a navegação orbital do
 * mestre: é o que o mestre posiciona (o tripé fica onde foi posto) e o que as
 * setas e os anéis do gizmo movem. A conta que desenha é a mesma da orbital,
 * generalizada -- ver `correnteDoTripe`.
 *
 * Tudo em unidades de cena e graus, como o resto da cena.
 */
export type Tripe = {
  /** Onde o tripé está no chão. */
  x: number;
  y: number;
  /** A altura da lente acima do chão, na régua das paredes. */
  altura: number;
  /**
   * Para onde a câmera aponta no plano, em graus, na régua da navegação do
   * mestre: 0 olha o mapa do lado em que ele foi desenhado.
   */
  giro: number;
  /** 0 olha reto para baixo; 90 olha o horizonte. */
  inclinacao: number;
  /** A câmera virada de lado, em graus. 0 = nivelada. */
  rolagem: number;
  /** A abertura vertical da lente, em graus. */
  lente: number;
};

/** Um tripé salvo na cena: o olho, com nome. Ver `Tripe`. */
export type CameraTripe = Tripe & { id: string; nome: string };

export const SOL_PADRAO: Sol = { angulo: 35, comprimento: 0.42, forca: 0.38 };

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
  /**
   * Os medidores deste personagem, para a coluna ao lado da figura.
   *
   * Resolvidos da ficha pelo mesmo caminho que o `assetId` e a `url` -- ver
   * `retratosDaCena`. Viajam no payload publicado porque a barra tem de descer
   * na TV no instante em que o mestre a desce, e porque a TV não tem índice de
   * personagens: ela tem este quadro e mais nada.
   *
   * Chegam **sem os escondidos** por padrão. O palco do Mestre é o único que
   * pede a lista inteira, e ele desenha os ocultos apagados -- ver
   * `incluirOcultos`.
   */
  medidores?: Medidor[];
  /**
   * As condições deste personagem, para a fileira de selos no alto da figura.
   *
   * Pelo caminho dos medidores, e com o mesmo filtro: chegam sem as escondidas
   * por padrão, e só o palco do Mestre pede a lista inteira. Só com
   * `layout.condicoes` ligado -- desligada a peça, o campo nem viaja.
   */
  condicoes?: Condicao[];
  /**
   * O que este retrato mostra, e onde.
   *
   * GUARDADO, ele é parcial: o campo que falta segue o layout da sessão, e é
   * assim que "este chefe mostra só as barras" convive com "o resto segue o
   * padrão". PUBLICADO, ele chega inteiro -- `retratosDaCena` resolve os dois
   * níveis antes de a cena sair. Ver `LayoutDoRetrato`.
   *
   * Ausente nos dois casos quer dizer coisas diferentes, e é de propósito: no
   * registro guardado é "não diverge em nada", e no payload é uma cena de uma
   * versão anterior -- quem desenha lê a ausência como `LAYOUT_PADRAO`.
   */
  layout?: Partial<LayoutDoRetrato>;
  /**
   * O nome do personagem, para a legenda do retrato.
   *
   * Só PUBLICADO, e só com `layout.nome` ligado -- ver `retratosDaCena`. Com a
   * peça desligada o campo nem existe no quadro: o nome de um PNJ que o mestre
   * ainda não apresentou não pode chegar à TV escondido num JSON. Não é
   * guardado, pela mesma razão do `assetId`: quem manda é a ficha.
   */
  nome?: string;
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
 * O que a mesa precisa saber de um personagem para desenhar sobre o token dele.
 *
 * Um terceiro caminho ao lado do `Portrait`, e não um campo dele, porque as
 * duas listas respondem a perguntas diferentes e têm elencos diferentes:
 * retrato existe para quem tem IMAGEM e foi armado, e o token no mapa existe
 * para todo mundo -- inclusive o goblin sem rosto. Pendurar a informação do
 * mapa no retrato deixaria justamente a horda sem nome.
 *
 * Só viaja com `Scene.infoDosTokens` ligado. Ver `fichasDaCena`.
 */
export type FichaNaCena = {
  id: string;
  nome: string;
  /** Já sem os escondidos, quando o destino é a mesa. */
  medidores: Medidor[];
  /**
   * Os selos, sobre o nome. Já sem os escondidos, quando o destino é a mesa.
   *
   * Opcional: um quadro de uma versão anterior não o traz, e quem desenha lê a
   * ausência como nenhum selo.
   */
  condicoes?: Condicao[];
};

/**
 * Onde uma peça do retrato fica, em fração da CAIXA do retrato.
 *
 * O canto superior esquerdo da peça, e não o centro dela: o centro obrigaria
 * quem posiciona a conhecer o tamanho da peça, e o número de medidores muda
 * essa altura a cada golpe do mestre.
 *
 * Em fração da caixa, e não da câmera, e é o que faz a peça acompanhar o
 * retrato: escalar a figura leva as barras junto, sem uma segunda conta. `x: 1`
 * é a borda direita da figura; valores fora de `0..1` põem a peça para fora
 * dela, que é o caso comum.
 */
export type LugarDaPeca = { x: number; y: number };

/**
 * O que aparece num retrato e onde.
 *
 * O retrato deixou de ser "uma figura" e virou uma COMPOSIÇÃO: a figura, o
 * nome, a coluna de medidores e a fileira de dados. Este tipo é o que diz quais
 * delas estão no ar e onde cada uma cai.
 *
 * ## Ausência quer dizer automático
 *
 * `lugarDosMedidores` e `lugarDosDados` ausentes não são "no canto zero": são
 * o comportamento que já existia -- ao lado e embaixo, virando de lado quando
 * não cabe no recorte. Gravar uma coordenada de saída perderia essa virada, e é
 * ela que impede a peça de sair do plano, que é o que derruba o palco no
 * WebKitGTK. Posição livre é o DESVIO do automático, não o substituto dele.
 *
 * ## Dois níveis
 *
 * A sessão tem um layout inteiro, e cada retrato pode divergir em parte dele --
 * ver `Portrait.layout`, que é parcial. O terceiro estado de um interruptor
 * ("segue a sessão") é a AUSÊNCIA do campo, e não um enum de três valores: o
 * enum obrigaria toda leitura a traduzir, e a ausência já é o que o disco de uma
 * campanha antiga traz.
 *
 * No payload publicado ele chega RESOLVIDO e completo. A TV não sabe que existe
 * padrão de sessão, pela mesma razão que não sabe que existe medidor escondido.
 */
export type LayoutDoRetrato = {
  /** A figura em si. Desligada, a caixa continua existindo para as peças. */
  retrato: boolean;
  /**
   * O nome do personagem, como legenda.
   *
   * No automático ele fica embaixo, DENTRO da caixa do retrato, centrado: uma
   * legenda que não sai da caixa não disputa lugar com o vizinho da fila. Com
   * `lugarDoNome` ele vai para onde foi posto, e aí conta na fila como os
   * dados. Nos dois casos fica preso ao recorte. Ver `NomeDoRetrato`.
   *
   * Desligado de fábrica, e desligado ele não viaja. Ver `Portrait.nome`.
   */
  nome: boolean;
  medidores: boolean;
  dados: boolean;
  /**
   * A fileira de selos das condições.
   *
   * No automático fica no alto da figura, DENTRO da caixa e centrada: a
   * fileira é baixa, e ali ela não disputa a fila com o vizinho. Com
   * `lugarDasCondicoes` ela vai para onde foi posta, e aí conta na fila como o
   * nome. Nos dois casos fica presa ao recorte. Ver `SelosDoRetrato`.
   *
   * Ligada de fábrica: o layout de uma versão anterior não a traz, e quem lê
   * põe `LAYOUT_PADRAO` por baixo.
   */
  condicoes: boolean;
  /** Ausente = automático: ao lado, virando quando não cabe. */
  lugarDosMedidores?: LugarDaPeca;
  /** Ausente = automático: embaixo, virando para cima quando não cabe. */
  lugarDosDados?: LugarDaPeca;
  /** Ausente = automático: embaixo, dentro da figura, centrado. */
  lugarDoNome?: LugarDaPeca;
  /** Ausente = automático: no alto, dentro da figura, centrada. */
  lugarDasCondicoes?: LugarDaPeca;
  /**
   * Onde o rosto fica, em fração da caixa. Ausente = centrado nela.
   *
   * O rosto é uma peça como as outras: se arrasta e muda de tamanho no mini
   * palco. A caixa continua sendo a régua -- é ela que o mestre arrasta no
   * quadro, que a fila enfileira e de onde as outras peças penduram.
   */
  lugarDoRetrato?: LugarDaPeca;
  /**
   * Quanto a coluna de medidores cresce ou encolhe. 1 é o tamanho de fábrica.
   *
   * Um fator e não uma largura: a coluna se mede contra a ALTURA do retrato --
   * ver `larguraDaColuna` --, e uma largura cravada aqui deixaria de valer no
   * primeiro retrato de tamanho diferente, que é o caso normal numa fila.
   *
   * O corpo do texto anda junto, porque ele é derivado da coluna. Aumentar a
   * escala não faz caber mais caractere: faz a mesma leitura ficar maior, que é
   * o pedido -- ler a vida do outro lado da sala.
   *
   * Preso entre `ESCALA_MIN` e `ESCALA_MAX` na hora de usar, e não na hora de
   * gravar: o número entra por dois caminhos que ninguém controla -- o
   * `retratos.json` de uma versão futura e o quadro que chega pelo canal.
   */
  escalaMedidores: number;
  /**
   * Quanto a fileira de dados cresce ou encolhe. 1 é o tamanho de fábrica.
   *
   * Irmã de `escalaMedidores`, e separada dela de propósito: as duas peças
   * respondem a perguntas diferentes na mesa. O medidor se lê a sessão inteira
   * e quer corpo; o dado aparece por dez segundos e grande demais cobre o mapa
   * justo na hora em que a mesa olha para ele.
   *
   * Multiplica a caixa inteira da fileira -- o dado de agora, os do histórico e
   * o texto --, porque tudo lá é derivado da largura do retrato. Ver
   * `RolagensDoRetrato`.
   */
  escalaDados: number;
  /**
   * Quanto a legenda do nome cresce ou encolhe. 1 é a largura da figura.
   *
   * A peça inteira escala, e não só a letra: a caixa da legenda é a largura da
   * figura vezes este fator, e o corpo é um décimo dela. Crescer o corpo numa
   * caixa fixa cortaria o nome antes, que é o contrário do pedido.
   */
  escalaNome: number;
  /**
   * Quanto a fileira de selos cresce ou encolhe. 1 é o tamanho de fábrica.
   *
   * Um fator, como o dos medidores: o selo se mede pela ALTURA da figura (ver
   * `tamanhoDoSelo`), e um diâmetro cravado aqui deixaria de valer no primeiro
   * retrato de outro tamanho.
   */
  escalaCondicoes: number;
  /**
   * Quanto o rosto ocupa da caixa do retrato. 1 é a caixa inteira.
   *
   * Só encolhe: a caixa continua do tamanho que o mestre deu -- é dela que as
   * peças penduram, e é ela que reserva lugar na fila --, e o que diminui é a
   * figura. É o pedido de "o rosto menor e as barras do mesmo tamanho", que
   * escalar a caixa não atende: a caixa leva as peças junto. Onde o rosto
   * menor fica é `lugarDoRetrato`.
   *
   * Preso entre `ESCALA_DO_ROSTO_MIN` e 1 na hora de usar, pela razão das
   * outras escalas. Um layout de uma versão anterior não o traz, e quem lê põe
   * `LAYOUT_PADRAO` por baixo.
   */
  escalaRetrato: number;
};

/**
 * O layout com que a sessão começa, e o que a campanha antiga ganha ao abrir.
 *
 * A figura, os medidores e os dados no ar, as peças no automático, e o nome
 * fora: é exatamente a tela de antes de o layout existir. Uma conciliação que
 * mudasse a imagem de uma campanha só por ela ter sido aberta numa versão nova
 * seria uma surpresa no meio da sessão -- e o nome, ligado sozinho, poria na TV
 * quem o mestre ainda não apresentou.
 */
export const LAYOUT_PADRAO: LayoutDoRetrato = {
  retrato: true,
  nome: false,
  medidores: true,
  dados: true,
  condicoes: true,
  escalaMedidores: 1,
  escalaDados: 1,
  escalaNome: 1,
  escalaCondicoes: 1,
  escalaRetrato: 1,
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
    Pick<
      CanvasItem,
      | "rotation"
      | "locked"
      | "flipX"
      | "flipY"
      | "espelharPeloOlhar"
      | "opacity"
      | "semSombra"
      | "sombra"
    >
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
  /**
   * O olho da pasta, apagado: tudo dentro dela some, subpastas incluídas. Ver
   * `CanvasItem.escondido`.
   *
   * Não reescreve os itens: cada um guarda o próprio olho, e reabrir a pasta
   * devolve a cena como estava -- com o que já estava escondido lá dentro
   * continuando escondido.
   */
  escondido?: boolean;
};

/**
 * Os itens que se veem: sem os escondidos, nem os que estão numa pasta
 * escondida, em qualquer altura da árvore.
 *
 * Devolve a MESMA lista quando nada está escondido, e não é economia: o
 * `sceneForTable` e os `useMemo` do palco comparam por identidade, e uma cópia
 * nova por chamada publicaria a cena a cada render.
 */
export function itensVisiveis(
  items: CanvasItem[],
  grupos: Grupo[] | undefined,
): CanvasItem[] {
  const fechadas = pastasEscondidas(grupos);

  if (fechadas.size === 0 && !items.some((item) => item.escondido)) return items;

  return items.filter(
    (item) =>
      !item.escondido && !(item.grupoId && fechadas.has(item.grupoId)),
  );
}

/**
 * As pastas que estão fora de vista: as de olho apagado e todas as que moram
 * dentro delas. É o que a lista de camadas usa para apagar a linha de quem
 * some por causa da mãe.
 */
export function pastasEscondidas(grupos: Grupo[] | undefined): Set<string> {
  const fechadas = new Set<string>();
  if (!grupos?.some((grupo) => grupo.escondido)) return fechadas;

  for (const grupo of grupos) if (grupo.escondido) fechadas.add(grupo.id);

  // Fecha pelos descendentes. Laço e não recursão pela razão de
  // `itensDoGrupo`: a lista é plana, com `parentId`.
  let cresceu = true;
  while (cresceu) {
    cresceu = false;
    for (const grupo of grupos) {
      if (grupo.parentId && fechadas.has(grupo.parentId) && !fechadas.has(grupo.id)) {
        fechadas.add(grupo.id);
        cresceu = true;
      }
    }
  }

  return fechadas;
}

/**
 * O que uma cena é para o mestre.
 *
 * `undefined` é MAPA: a cena de sempre, com fundo, grade, névoa e régua, feita
 * para a mesa olhar. `"quadro"` é a mesa de trabalho do mestre -- brainstorm,
 * história, notas ligadas por setas --, sem chão nem escala. `"fundo"` é a
 * imagem e nada mais: a taverna, a floresta, a sala do trono, com um token ou
 * outro por cima se o mestre quiser. É para quem joga SEM mapa -- e era o que
 * essa mesa fazia criando um mapa e depois desligando a grade, o sol e a
 * câmera um a um.
 *
 * Os três dividem o mesmo tipo de propósito: o palco, o histórico, a gravação
 * por diferença e o canal para a mesa já existem para a cena, e o que muda de
 * um para o outro é só o que ele SABE fazer -- ver `temChao` e as irmãs dela.
 *
 * Decidido na criação e nunca trocado: um mapa que virasse quadro carregaria
 * névoa e grade que o quadro não sabe mostrar, e cada caso desses seria um
 * bug para alguém. Vale igual para o fundo, e pelo mesmo motivo.
 */
export type TipoDeCena = "quadro" | "fundo";

/**
 * A que painel uma pasta pertence. Ausente = Arquivos (quadros e notas).
 *
 * Mapas e Fundos têm árvores separadas porque são abas separadas, e uma pasta
 * que aparecesse nas duas mostraria metade vazia em cada uma. Players e NPCs,
 * pela mesma razão: são as duas seções da lista de personagens.
 */
export type ListaDePastas = "mapas" | "fundos" | "players" | "npcs";

/**
 * Uma pasta de um dos painéis: quadros e notas no Arquivos, mapas, fundos e
 * personagens nos deles. Ver `ListaDePastas`.
 *
 * Nasceu só para quadros, com o argumento de que uma campanha tem dez mapas.
 * Campanha longa passou disso, e a lista plana virou rolagem.
 *
 * Mesma forma do `Grupo` da cena, e de propósito: a lista já sabe desenhar
 * essa árvore. Vive no board, e não na cena, porque atravessa cenas.
 */
export type Pasta = {
  id: string;
  nome: string;
  parentId?: string;
  recolhido?: boolean;
  /** Ausente = Arquivos, o que faz a pasta gravada antes das outras listas abrir no lugar. */
  lista?: ListaDePastas;
  /**
   * Os personagens dentro dela, por id. Só nas listas `players` e `npcs`.
   *
   * Aqui, e não num `pastaId` do personagem como o da cena: o personagem vive
   * no índice do vault, tipado em Rust e servido ao celular do jogador, e a
   * pasta é organização da mesa do mestre. No board ela não chega ao celular --
   * uma pasta "Traidores" não conta nada a ninguém -- e não pede espelho em
   * Rust, que guarda `pastas` como JSON opaco.
   *
   * Id de personagem apagado fica para trás até a pasta ser gravada de novo, e
   * ninguém o lê: a árvore só procura membros entre os personagens que existem.
   */
  membros?: string[];
};

export type Scene = {
  id: string;
  name: string;
  /** Ausente = mapa. Ver `TipoDeCena`. */
  tipo?: TipoDeCena;
  /**
   * A pasta em que a cena está, da lista do tipo dela: quadro nas do Arquivos,
   * mapa nas de Mapas, fundo nas de Fundos. Ausente = raiz.
   */
  pastaId?: string;
  /**
   * Esta é a CAPA da campanha: o que a mesa vê quando não há nada no ar.
   *
   * Uma por campanha, e a marca anda -- marcar outra desmarca esta. Ver
   * `definirCapa`.
   *
   * Mora na cena, e não num campo do board, por duas razões. A primeira é o
   * dia em que a capa for apagada: o `id` guardado no board apontaria para uma
   * cena que não existe mais, e alguém teria de lembrar de limpá-lo -- como já
   * é preciso fazer com `editingSceneId` e `liveSceneId`. A marca na cena
   * some junto com ela, de graça. A segunda é o Rust: cena é JSON opaco para
   * ele (ver `SceneJson`), e campo de board é estrutura espelhada dos dois
   * lados -- um campo novo lá custaria `ordem.json`, `Board`, `BoardPatch` e
   * a fixture de cada teste.
   *
   * Só `true` aparece no arquivo: `false` seria a mesma informação que a
   * ausência, gravada em toda cena da campanha.
   *
   * CHEGA à mesa, e não faz mal: é um booleano que diz o que a própria cena
   * no ar já demonstra.
   */
  capa?: true;
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
   * Nome, dados e medidores acima da cabeça de cada token. Ausente = desligado.
   *
   * Da CENA e não da sessão, como o sol e a grade: o mapa de combate quer a
   * vida de todo mundo à vista, e o mapa da taverna não quer nada por cima dos
   * rostos. É o mesmo mapa aberto com duas intenções, e quem as separa é a
   * cena.
   *
   * Um interruptor só para as três coisas, e não três. A pergunta que o mestre
   * faz é "esta cena é de combate?", e respondê-la em três cliques seria pedir
   * a ele que a traduzisse.
   *
   * O que a mesa vê depende deste campo E de `LiveState.fichas`, que só viaja
   * com ele ligado -- ver `fichasDaCena`. O nome de um PNJ que o mestre não
   * apresentou não pode atravessar a rede porque a cena tem um interruptor
   * desligado na tela.
   */
  infoDosTokens?: boolean;
  /**
   * Réguas colocadas sobre o mapa. Ausente = nenhuma. A mesa vê. Ver `Regua`.
   *
   * O campo guarda o nome antigo do tipo porque ele está em toda cena gravada
   * no disco -- ver o cabeçalho de `Regua`.
   */
  medidores?: Regua[];
  /**
   * As paredes da cena: onde a luz para. Ausente = nenhuma. Ver `Parede`.
   *
   * Viaja para a mesa, mas só o Mestre as DESENHA: a mesa recebe a geometria
   * porque é ela que calcula a própria sombra -- cada tela projeta a sua, e
   * assim a sombra não depende de o canal republicar a cena a cada passo.
   */
  paredes?: Parede[];
  /**
   * As portas da cena. Ausente = nenhuma. Ver `Porta`.
   *
   * Lista própria, e não paredes com um campo a mais: a porta gira pela
   * dobradiça, e a parede é uma caixa. Viaja para a mesa pela razão das
   * paredes.
   */
  portas?: Porta[];
  /**
   * O sol da cena. Ausente = sem sol, que é o normal. Ver `Sol`.
   *
   * Um, e não uma lista: dois sóis são duas direções, e duas direções sobre o
   * mesmo mapa é o que ninguém sabe ler -- cada figura sairia com duas sombras
   * cruzadas. As `luzes` são outra coisa: cada uma tem posição, e a sombra
   * que cada uma deita aponta para longe DELA, o que a mesa lê sem esforço.
   */
  sol?: Sol;
  /**
   * As luzes cravadas no mapa. Ausente = nenhuma. Ver `Luz`.
   *
   * As que os tokens carregam não moram aqui -- ver `CanvasItem.luz`. As duas
   * listas se juntam na hora de desenhar, em `fontesDaCena`.
   */
  luzes?: Luz[];
  /**
   * As áreas de efeito: o chão em chamas. Ausente = nenhuma. Ver
   * `AreaDeEfeito`.
   *
   * Na mesa, só as que o mestre abriu (`naMesa`), como a forma: ver
   * `sceneForTable`.
   */
  areasDeEfeito?: AreaDeEfeito[];
  /**
   * O quanto o mapa escurece onde não há luz, de 0 a 1. Ausente = 0.
   *
   * Zero é o mapa como sempre foi, e é o padrão: uma campanha antiga reabre
   * igual, e a luz num mapa claro é só um brilho. Um é breu, e só o que alguma
   * luz alcança aparece. O mestre vê mais fraco que a mesa -- ver `LuzLayer`.
   */
  escuridao?: number;
  /**
   * A cor do escuro, em `#rrggbb`. Ausente = preto, o breu.
   *
   * É a luz ambiente da cena, pelo avesso: a noite de lua é um escuro azulado,
   * a caverna, um escuro de terra. O quanto ela cobre continua sendo a
   * `escuridao`; aqui é só o tom de onde nenhuma luz chega, e as luzes abrem
   * buraco nela como abrem no preto.
   */
  corDoEscuro?: string;
  /**
   * A cor do vazio -- o que está FORA do mapa --, em `#rrggbb`. Ausente =
   * preto, o breu.
   *
   * A sala em volta do chão, e a mesma nos dois modos: no 2D é a borda além da
   * imagem do mapa; no 2.5D é o fundo em volta do chão deitado. Preto é o de
   * sempre, e é o padrão -- o mapa é a luz, e o que está fora dele some da
   * vista. Quem quer uma mesa de feltro ou uma ardósia troca aqui. Difere da
   * `corDoEscuro`, que é o tom de DENTRO onde nenhuma luz chega. Ver
   * `corDoVazioDe`.
   *
   * CHEGA à mesa: é fundo da cena, e a TV e o celular a veem igual.
   */
  corDoVazio?: string;
  /**
   * O CÉU do 2.5D: uma imagem panorâmica, de 360 graus, atrás do chão deitado.
   * Ausente = o vazio fica na `corDoVazio`, como sempre.
   *
   * É a escolha do mestre entre cor e imagem para o mesmo lugar: o que aparece
   * por trás do chão quando a câmera levanta o olho. A imagem gira com a câmera
   * e sobe e desce com a inclinação, com o horizonte dela no horizonte do chão
   * -- ver `ceuNaTela`. O panorama equirretangular (2:1) é o que fecha a volta
   * sem emenda; outra imagem também serve, e a emenda aparece ao dar a volta.
   *
   * Só de esguelha. No 2D não há céu -- olha-se de cima --, e a borda além do
   * mapa continua a `corDoVazio`.
   *
   * CHEGA à mesa, como a cor: a TV e o celular veem o mesmo céu.
   */
  ceuAssetId?: string;
  /**
   * O ajuste de imagem DESTA cena na janela do espectador: a masmorra mais
   * clara, o flashback sem cor. Ausente = neutro, e só os canais mexidos são
   * guardados -- ver `ajusteParaGuardar`.
   *
   * Multiplica o ajuste da campanha, que viaja à parte no `LiveState`. Ver
   * `compor`.
   *
   * CHEGA à mesa, mas só a janela do espectador aplica: o jogador vê o mapa
   * como ele é, e o Mestre também.
   */
  imagem?: AjusteDeImagem;
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
   * Os tripés da cena: as câmeras de esguelha. Ausente = nenhum. Ver `Tripe`.
   *
   * Uma lista à parte das `cameras`, e não uma variante delas: a moldura, os
   * fantasmas, o seguir e o espelho iteram `cameras` e assumem um recorte, e
   * nenhum deles precisa aprender a recusar um tripé. Os ids dividem o mesmo
   * `cameraNoArId` -- é UMA câmera no ar, de um tipo ou de outro.
   *
   * NUNCA chega à mesa: `sceneForTable` remove este campo antes de publicar.
   */
  tripes?: CameraTripe[];
  /**
   * A cópia do tripé que está no ar, como `camera` é a do recorte. Ausente =
   * a câmera no ar não é um tripé, e a mesa vê de prumo.
   *
   * CHEGA à mesa: é ela que vira o mapa de esguelha na janela do espectador.
   */
  tripeNoAr?: Tripe;
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

/** Um fundo: a imagem, e quase nada além dela. Ver `TipoDeCena`. */
export function ehFundo(scene: Pick<Scene, "tipo">): boolean {
  return scene.tipo === "fundo";
}

/**
 * O mapa: a cena com todas as ferramentas.
 *
 * `undefined` e não uma string, para não gravar `tipo: "mapa"` em toda cena
 * que já existe -- o arquivo de quem só abriu o aplicativo não muda.
 */
export function ehMapa(scene: Pick<Scene, "tipo">): boolean {
  return scene.tipo === undefined;
}

/**
 * O que a cena SABE fazer, uma pergunta por vez.
 *
 * As funções abaixo respondiam todas por `ehQuadro`: a câmera, a grade, o sol
 * e o handout sumiam do quadro pela mesma condição, e quem lia `!ehQuadro(cena)`
 * no meio de um painel tinha de adivinhar qual das razões era aquela. São
 * cinquenta lugares, e cada um perguntava o que a cena É para decidir o que ela
 * TEM -- o que só funciona enquanto os tipos forem dois.
 *
 * Perguntar pela capacidade em vez do tipo tem um segundo efeito, e é o que
 * paga a troca: o FUNDO tem chão e não tem câmera, e nenhuma das cinquenta
 * linhas precisou saber que ele passou a existir.
 *
 * A tabela inteira, para quem quiser ler de uma vez:
 *
 * |               | mapa | fundo | quadro |
 * | ------------- | ---- | ----- | ------ |
 * | `temChao`     | sim  | sim   | não    |
 * | `temAnotacao` | sim  | sim   | não    |
 * | `temCamera`   | sim  | não   | não    |
 * | `temGrade`    | sim  | não   | não    |
 * | `temNevoa`    | sim  | não   | não    |
 * | `temSol`      | sim  | não   | não    |
 * | `temLuz`      | sim  | não   | não    |
 * | `temMedida`   | sim  | não   | não    |
 */

/**
 * A cena tem CHÃO: uma imagem por baixo, e o que se põe nela pousa.
 *
 * O quadro não tem. Ele é folha, e o que entra nele flutua sobre papel -- por
 * isso a miniatura dele é clara e a do mapa é preta.
 */
export function temChao(scene: Pick<Scene, "tipo">): boolean {
  return !ehQuadro(scene);
}

/**
 * A cena ENQUADRA: câmeras salvas, o recorte que vai ao ar, o corte em fade.
 *
 * O quadro vai INTEIRO para a mesa, e recortar um pedaço dele é o contrário do
 * que ele serve para fazer. Ver `lerCena` em `camera-actions`.
 *
 * O fundo também vai inteiro, e por um motivo próprio: ele É o enquadramento.
 * Quem escolheu a imagem já escolheu o que a mesa vê, e uma câmera por cima
 * seria recortar de novo o que já foi recortado.
 */
export function temCamera(scene: Pick<Scene, "tipo">): boolean {
  return ehMapa(scene);
}

/**
 * As câmeras de um modo do Mestre: os recortes no 2D, os tripés no 2.5D.
 *
 * Cada modo vê a sua espécie, e só ela: é a lista dos chips, a ordem do
 * `Shift+1..9` e onde a seleção pode morar. Misturadas, o 2.5D mostrava uma
 * câmera 2D que dali não se vê nem se ajusta. A câmera no ar pode ser da outra
 * -- a mesa olha pelo tripé enquanto o mestre edita no 2D --, e a barra avisa.
 */
export function camerasDoModo(
  scene: Pick<Scene, "cameras" | "tripes">,
  deEsguelha: boolean,
): readonly (CameraSalva | CameraTripe)[] {
  return (deEsguelha ? scene.tripes : scene.cameras) ?? [];
}

/** A cena tem grade. Só o mapa: é ela que dá escala ao chão. Ver `SceneGrid`. */
export function temGrade(scene: Pick<Scene, "tipo">): boolean {
  return ehMapa(scene);
}

/**
 * A cena tem área escondida, e a aba que as lista. Ver `FogRegion`.
 *
 * Fora do fundo: esconder pedaço de uma imagem para revelar depois é o gesto
 * de quem explora um mapa, e o fundo existe para ser visto de uma vez.
 */
export function temNevoa(scene: Pick<Scene, "tipo">): boolean {
  return ehMapa(scene);
}

/**
 * A cena tem áreas de efeito: o chão em chamas. Só o mapa -- o quadro não tem
 * chão, e o fundo já vem pintado. Ver `AreaDeEfeito`.
 */
export function temAreaDeEfeito(scene: Pick<Scene, "tipo">): boolean {
  return ehMapa(scene);
}

/**
 * A cena tem sol e paredes. Ver `Sol` e `Parede`.
 *
 * Sem chão não há onde a sombra cair, e uma parede que não para luz nenhuma
 * seria um risco a mais na tela. O fundo tem chão, mas o chão dele já vem com
 * a luz pintada na imagem: um segundo sol por cima brigaria com o primeiro.
 */
export function temSol(scene: Pick<Scene, "tipo">): boolean {
  return ehMapa(scene);
}

/**
 * A cena tem luz e escuridão. Ver `Luz` e `Scene.escuridao`.
 *
 * As mesmas cenas do sol, e pela mesma razão: o fundo já traz a luz pintada na
 * imagem, e o quadro não tem chão para acender.
 */
export function temLuz(scene: Pick<Scene, "tipo">): boolean {
  return ehMapa(scene);
}

/**
 * A cena MEDE: a régua e o medidor.
 *
 * Separada de `temGrade` de propósito, embora as duas respondam junto: a régua
 * fica DESABILITADA sem grade, e não escondida -- são duas perguntas diferentes
 * sobre a mesma cena, e juntá-las numa só apagaria essa diferença.
 */
export function temMedida(scene: Pick<Scene, "tipo">): boolean {
  return ehMapa(scene);
}

/**
 * A cena guarda o que SÓ O MESTRE vê: ponto, postit e handout.
 *
 * Uma pergunta e não três, porque as consequências são as mesmas duas em todo
 * lugar: esses campos saem em `sceneForTable`, e cada letra e forma da cena
 * passa a carregar a pergunta "a mesa vê esta?" no olho do gizmo.
 *
 * No quadro nenhuma das duas existe. A folha vai inteira, e o postit dela é
 * conteúdo, não anotação sobre outra coisa.
 */
export function temAnotacao(scene: Pick<Scene, "tipo">): boolean {
  return !ehQuadro(scene);
}

/**
 * Como cada tipo se chama quando o mestre não batiza a cena.
 *
 * No idioma da tela: é rótulo e começo de nome, nunca chave -- quem compara
 * tipo compara `Scene.tipo`. O nome que já foi gravado fica como foi.
 */
export const NOME_DO_TIPO: Record<"mapa" | TipoDeCena, string> = {
  mapa: textoDeCenas.tipos.mapa,
  fundo: textoDeCenas.tipos.fundo,
  quadro: textoDeCenas.tipos.quadro,
};

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

  const copia: Scene = {
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

  // A câmera que segue itens passa a seguir as CÓPIAS deles: com os ids
  // antigos, ela não acharia ninguém na cena nova.
  if (source.cameras) {
    copia.cameras = source.cameras.map((camera) =>
      camera.alvoIds
        ? { ...camera, alvoIds: camera.alvoIds.map((id) => novos.get(id) ?? id) }
        : camera,
    );
  }

  // A marca de capa NÃO se copia: é uma por campanha, e duplicar o fundo da
  // taverna deixaria duas cenas dizendo que são a capa -- com a que a mesa vê
  // decidida pela ordem da lista.
  delete copia.capa;

  return copia;
}

export function createEmptyBoard(): Board {
  const first = createScene(textoDeCenas.nomesPadrao.cena(NOME_DO_TIPO.mapa, 1));
  return { scenes: [first], editingSceneId: first.id, liveSceneId: first.id };
}
