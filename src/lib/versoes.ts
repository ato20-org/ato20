/**
 * O que mudou em cada versão, na voz de quem USA o aplicativo.
 *
 * Viaja DENTRO do pacote, e não é buscada na rede: um histórico que só existe
 * online some justamente na mesa sem Wi-Fi, que é onde este aplicativo foi feito
 * para rodar. Buscar da API de releases também amarraria a tela à disposição do
 * GitHub de responder, por um texto que já estava pronto no dia do empacotamento.
 *
 * A consequência é a regra deste arquivo: a lista de uma versão termina NELA.
 * Quem está na 0.0.3 não sabe que a 0.0.4 existe — e não precisa saber, porque
 * quem avisa disso é o updater.
 *
 * Módulo TypeScript e não `CHANGELOG.md`: markdown exigiria um carregador no
 * Next para a tela conseguir ler o arquivo, e o que se ganharia era um formato
 * que ninguém aqui lê fora do aplicativo. Aqui o compilador cobra os campos, e
 * uma versão sem data não passa.
 *
 * Escrito à mão, e de propósito. Os commits deste repositório explicam decisão
 * de implementação para quem mexe no código — "o preload da wayland só vale se
 * o processo reiniciar" não é notícia para quem abriu o programa para jogar.
 * Aqui a mesma mudança vira "o aplicativo abria em branco no Linux, e não abre
 * mais".
 *
 * Ver a skill `lancar-release`, que é quem escreve aqui a cada versão.
 */

/**
 * Um texto do histórico nos dois idiomas do aplicativo.
 *
 * Aqui e não no dicionário de `lib/i18n`: a notícia de uma versão é escrita
 * uma vez, no dia da release, e não muda depois -- o par fica junto da versão
 * a que pertence, e a skill `lancar-release` escreve os dois no mesmo passo. O
 * inglês é o mesmo texto que vai para o metainfo do Flatpak e para a seção em
 * inglês da release no GitHub.
 *
 * Sem import nenhum, e de propósito: `scripts/notas-da-release.mjs` lê este
 * arquivo direto com o Node para montar o corpo da release, e um alias `@/`
 * ali não resolve.
 */
export type Texto = { pt: string; en: string };

/** Uma linha do histórico. */
export type Mudanca = {
  /**
   * `novidade` é o que passou a existir; `correcao`, o que voltou a funcionar.
   *
   * Dois e não mais: a separação existe para a pessoa achar rápido se aquele
   * problema que ela teve foi resolvido. Uma terceira categoria dividiria a
   * mesma lista sem responder nenhuma pergunta nova.
   */
  tipo: "novidade" | "correcao";
  /** Uma linha, no que mudou para quem usa. */
  titulo: Texto;
  /** O porquê ou o detalhe, quando a linha sozinha não basta. */
  detalhe?: Texto;
};

export type Versao = {
  /** Sem o `v`: é o número do `tauri.conf.json`, e a tag é ele com `v` na frente. */
  versao: string;
  /** `AAAA-MM-DD`. Ordenável como texto, que é o que a lista precisa. */
  data: string;
  mudancas: Mudanca[];
};

/**
 * Da mais nova para a mais velha.
 *
 * A ordem não é enfeite: a primeira é a que está rodando — ver `versaoAtual` —
 * e é ela que a porta mostra.
 */
export const VERSOES: Versao[] = [
  {
    versao: "1.1.0",
    data: "2026-10-02",
    mudancas: [
      {
        tipo: "novidade",
        titulo: {
          pt: "Mapa de esguelha (2.5D), em beta: a mesa vista de lado, com as paredes em pé",
          en: "Side-on map view (2.5D), in beta: the table seen at an angle, with the walls standing up",
        },
        detalhe: {
          pt: "No Mestre, o botão 2.5D ao lado das configurações do mapa mostra a mesa de esguelha: os personagens ficam em pé e as paredes sobem. Para a janela do espectador ver assim, crie um tripé na barra Tripés e transmita com T. No 2.5D dá para marcar, arrastar e deitar os personagens; mapa, luz e paredes continuam se editando no 2D. Shift+L entra no tripé e anda com ele, como num jogo.",
          en: "In the GM window, the 2.5D button next to the map settings shows the table side-on: characters stand and walls rise. For the spectator window to see it that way, create a tripod in the Tripods bar and put it on air with T. In 2.5D you can select, drag and lay characters down; the map, lights and walls are still edited in 2D. Shift+L steps into the tripod and moves it around, like in a game.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Mapas, Fundos, Personagens e Retratos ganharam pastas e busca",
          en: "Maps, Backdrops, Characters and Portraits have folders and search",
        },
        detalhe: {
          pt: "Arraste um mapa ou um personagem para dentro de uma pasta, ou use \"Mover para\" no menu da linha. Players e NPCs têm cada um a sua árvore, e os retratos soltos aparecem sob a pasta do personagem. A busca acha pelo nome e pela pasta, e mostra o caminho de cada achado. A Biblioteca também ganhou busca.",
          en: "Drag a map or a character into a folder, or use \"Move to\" in the row menu. Players and NPCs each have their own tree, and loose portraits show up under the character's folder. Search finds by name and by folder, and shows the path of each result. The Library has search too.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Recorte o retrato e a miniatura ao anexar, em quadrado ou em círculo",
          en: "Crop the portrait and the token image when attaching them, as a square or a circle",
        },
        detalhe: {
          pt: "Arraste para enquadrar e use a roda para aproximar, até 8 vezes. A miniatura abre no círculo, que é o token redondo da mesa. \"Usar inteira\" grava a imagem como ela veio, para a figura de corpo inteiro.",
          en: "Drag to frame and use the wheel to zoom in, up to 8x. The token image opens as a circle, which is the round token on the table. \"Use whole image\" keeps the image as it came, for a full-body figure.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Duplo clique num personagem no mapa abre a ficha dele",
          en: "Double-clicking a character on the map opens their sheet",
        },
        detalhe: {
          pt: "Vale também para o token travado, e o token não sai do lugar junto.",
          en: "It also works on a locked token, and the token stays in place.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Plugins podem desenhar medidores com imagens",
          en: "Plugins can draw meters with images",
        },
        detalhe: {
          pt: "Barra, pontos ou uma sequência de quadros, com o valor escrito dentro, só com imagens e um arquivo de configuração na pasta do plugin. No medidor, a paleta junta as formas de fábrica e as dos plugins, e dá para mostrar ou esconder o nome e o valor.",
          en: "A bar, dots or a sequence of frames, with the value written inside, using only images and a configuration file in the plugin folder. In the meter, the palette puts the built-in shapes and the plugin ones together, and the name and the value can be shown or hidden.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "Com a aba Mesa aberta, a mesa parava de acompanhar o Mestre",
          en: "With the Table tab open, the table stopped following the GM",
        },
        detalhe: {
          pt: "A janela do espectador, o celular e a própria aba ficavam presos num quadro de minutos antes, sem aviso. Agora seguem a cena e a câmera como antes.",
          en: "The spectator window, the phone and the tab itself froze on a frame from minutes before, with no warning. They now follow the scene and the camera as before.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "Com muitas câmeras, a barra de câmeras atravessava a tela",
          en: "With many cameras, the camera bar ran across the screen",
        },
        detalhe: {
          pt: "Agora ela para de crescer e rola, e as pontas esmaecem quando há câmera fora da vista.",
          en: "It now stops growing and scrolls, and the edges fade when a camera is out of view.",
        },
      },
    ],
  },
  {
    versao: "1.0.0",
    data: "2026-10-01",
    mudancas: [
      {
        tipo: "novidade",
        titulo: {
          pt: "A campanha ganhou chat, com as rolagens no meio da conversa",
          en: "The campaign has a chat, with the dice rolls right in the conversation",
        },
        detalhe: {
          pt: "A conversa fica guardada na própria campanha, e vai junto quando ela é exportada. No celular, o Chat é uma aba nova, com \"Só para o Mestre\"; você escreve para a mesa, para um jogador ou só para si, e apaga o que quiser. O @ cita um personagem. Os seus dados entram só para você, até ligar Dados abertos. A janela de Chat se abre sozinha quando um jogador escreve, e a de Rolagens continua como era.",
          en: "The conversation is stored in the campaign itself, and goes along when it is exported. On the phone, Chat is a new tab, with \"GM only\"; you write to the table, to one player or just to yourself, and delete whatever you want. @ mentions a character. Your own rolls show only to you until you turn on Open dice. The Chat window opens by itself when a player writes, and the Rolls window stays as it was.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Pings: qualquer um da mesa aponta um lugar no mapa, e todo mundo vê",
          en: "Pings: anyone at the table points at a spot on the map, and everybody sees it",
        },
        detalhe: {
          pt: "No celular, segure o dedo parado no mapa; no computador, segure o botão direito, e o clique curto continua abrindo o menu. A tecla ' (apóstrofo) abre a roda nas duas telas, para quem usa touchpad. São seis: Olhe aqui, Cuidado, Perigo, Atacar, O que é isso? e Vou para lá. Na cena que está no ar, o ping aparece na sua tela, na TV e nos celulares.",
          en: "On the phone, hold your finger still on the map; on the computer, hold the right button, and a short click still opens the menu. The ' (apostrophe) key opens the wheel on both screens, for touchpad users. There are six: Look here, Careful, Danger, Attack, What's this? and On my way. In the scene on air, the ping shows on your screen, in the spectator window and on the phones.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A câmera pode ter qualquer formato: a torre em pé, o corredor deitado",
          en: "A camera can take any shape: the tower standing up, the corridor lying down",
        },
        detalhe: {
          pt: "Puxe o canto da moldura e a largura e a altura mudam cada uma por si; com Shift, o formato se mantém. A TV mostra o recorte inteiro, com faixas pretas no que sobra, e o retrato continua no canto da tela, por cima da faixa. Mover, aproximar, seguir um token ou segurar V não desfazem o formato, e \"Voltar a 16:9\", no botão direito da moldura, devolve o 16:9 em volta da câmera.",
          en: "Drag a corner of the frame and width and height change independently; with Shift, the shape is kept. The spectator window shows the whole crop, with black bars in the leftover space, and the portrait stays in the corner of the screen, over the bar. Moving, zooming, following a token or holding V keep the shape, and \"Back to 16:9\", in the frame's right-click menu, restores the 16:9 around the camera.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "O olho da lista de Camadas tira uma imagem ou uma pasta de cena",
          en: "The eye in the Layers list takes an image or a folder out of the scene",
        },
        detalhe: {
          pt: "Some do seu palco e da mesa, como no Figma, e clicar de novo traz de volta: é o telhado que atrapalha montar o andar de baixo, ou o monstro que espera a hora de entrar. Escondido, ele nem entra na seleção por área ou no Ctrl+A. A linha fica apagada na lista, e é por ela que se volta. A pasta leva o que tem dentro, e um token escondido leva junto o retrato dele na mesa.",
          en: "It disappears from your stage and from the table, as in Figma, and a second click brings it back: the roof that gets in the way while you build the floor below, or the monster waiting for its moment. While hidden, it stays out of area selection and Ctrl+A. The row is dimmed in the list, and that is where you bring it back from. A folder takes everything inside it, and a hidden token takes its portrait off the table too.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Cada imagem e cada token escolhe como faz sombra",
          en: "Each image and token chooses how it casts a shadow",
        },
        detalhe: {
          pt: "Pelo botão novo de sombra no gizmo. \"Na base\" é para a figura em pé: uma linha amarela marca onde ela pisa, e a sombra nasce dali. \"Inteira\" é para a vista de cima, como o token redondo, o barril ou a copa da árvore: a figura toda estica para longe da luz, sem descolar, e uma régua ajusta a altura. \"Nenhuma\" desliga. Vale debaixo do sol e da tocha, e o token espelhado na vertical deixou de fazer sombra pela cabeça.",
          en: "From the new shadow button on the gizmo. \"At the base\" is for a standing figure: a yellow line marks where it stands, and the shadow starts there. \"Whole\" is for things seen from above, like the round token, the barrel or the treetop: the whole figure stretches away from the light without coming loose, and a slider sets the height. \"None\" turns it off. It works under the sun and under a torch, and a token flipped vertically no longer casts its shadow from its head.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A nota mostra o que cita: a imagem, o retrato, o mapa ou a página do livro",
          en: "A note shows what it mentions: the image, the portrait, the map or the book page",
        },
        detalhe: {
          pt: "Basta deixar a menção sozinha na linha. Várias na mesma linha ficam lado a lado, e a imagem ganha alça de largura e botões de alinhamento. O novo sinal ! cita uma página marcada da estante, pelo nome do marcador, e o chip abre o livro nela, na nota e no postit. No postit e no cartão, clicar numa menção passou a abrir o que ela cita.",
          en: "Just leave the mention alone on its line. Several on one line sit side by side, and images get a width handle and alignment buttons. The new ! sign points to a bookmarked page on the shelf, by the bookmark's name, and its chip opens the book at that page, in notes and sticky notes. In sticky notes and cards, clicking a mention now opens what it points to.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "O editor de notas ganhou barra de formatação, Ctrl+F e seleção por várias linhas",
          en: "The note editor has a formatting bar, Ctrl+F and multi-line selection",
        },
        detalhe: {
          pt: "A barra escreve o Markdown por você, e Ctrl+B e Ctrl+I também. Tab recua a linha e aninha o item da lista. Clicar põe o cursor onde se clicou, e arrastar ou usar Shift seleciona várias linhas para apagar, colar ou formatar. O painel Menções lista quem e o que a nota cita, e Ctrl+= e Ctrl+- mudam o tamanho da letra. Na aba Arquivos, a busca passou a achar também pelo texto das notas, dos postits e dos quadros.",
          en: "The bar writes the Markdown for you, and so do Ctrl+B and Ctrl+I. Tab indents the line and nests the list item. Clicking puts the cursor where you clicked, and dragging or using Shift selects several lines to delete, paste or format. The Mentions panel lists who and what the note mentions, and Ctrl+= and Ctrl+- change the text size. In the Files tab, search now also finds text inside notes, sticky notes and boards.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "O postit escreve com letra de mão",
          en: "Sticky notes are written in handwriting",
        },
        detalhe: {
          pt: "Uma letra de caneta, na sua tela e na TV. Com o postit ou o cartão selecionado, Ctrl+= e Ctrl+- sobem e descem a letra um degrau, e a TV passou a respeitar esse tamanho; sem nada selecionado, as teclas continuam dando zoom. A letra nova é mais larga: um postit antigo bem justo pode esconder a última linha.",
          en: "A pen-like font, on your screen and in the spectator window. With a sticky note or a card selected, Ctrl+= and Ctrl+- step the text size up and down, and the spectator window now respects that size; with nothing selected, the keys still zoom. The new font is wider, so an old, tightly sized sticky note may hide its last line.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Formas e setas podem ter cantos redondos e traço à mão",
          en: "Shapes and arrows can have rounded corners and a hand-drawn stroke",
        },
        detalhe: {
          pt: "O traço sai tremido, como rabisco a lápis, e o texto solto vai para a letra do postit. As duas chaves ficam no tópico Quadro, novo na Configuração da campanha, e valem para o que nascer dali; o que já está desenhado não muda. No gizmo, Cor e fundo virou Estilo, que troca de uma forma só a cor e a opacidade do traço e do fundo, a espessura, os cantos e o traço à mão.",
          en: "The stroke comes out wobbly, like a pencil sketch, and loose text switches to the sticky note font. Both switches live in Board, a new topic in the campaign settings, and apply to what is drawn from then on; what is already drawn does not change. On the gizmo, Color and fill became Style, which changes in one place a shape's stroke and fill color and opacity, its thickness, its corners and the hand-drawn stroke.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "O gizmo ganhou um cadeado, e parede, área, forma, texto e luz passam a travar",
          en: "The gizmo has a padlock, and walls, hidden areas, shapes, text and lights can now be locked",
        },
        detalhe: {
          pt: "Antes só a imagem e o token travavam, pela lista de Camadas e pelo menu. Travado, nada anda pelo arrasto nem pelas setas, perde as alças e não se apaga por engano: a parede não vem junto quando você pega o token ao lado, e o chefe fica no altar. A luz trava também pela linha Travada do painel dela.",
          en: "Before, only images and tokens could be locked, from the Layers list and the menu. Once locked, nothing moves by dragging or with the arrow keys, the handles go away and nothing gets deleted by accident: the wall no longer comes along when you grab the token beside it, and the boss stays on the altar. A light can also be locked from the Locked row in its panel.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Ctrl+C e Ctrl+V valem para parede, área escondida, luz, postit e risco do lápis",
          en: "Ctrl+C and Ctrl+V work on walls, hidden areas, lights, sticky notes and pencil strokes",
        },
        detalhe: {
          pt: "Recortar e duplicar também, e a cópia leva a cor. Copiar ficou inteiro: o texto leva cor, fundo e negrito, o polígono leva os vértices, e texto e forma colam também no mapa. No quadro, colar uma forma copiada trazia, no lugar dela, o texto que estivesse copiado fora do aplicativo.",
          en: "Cut and duplicate too, and copies keep their color. Copying is complete now: text keeps its color, background and bold, polygons keep their vertices, and text and shapes paste onto maps too. On a board, pasting a copied shape used to bring in, instead, whatever text had been copied outside the app.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A Configuração da campanha ganhou tópicos e busca",
          en: "Campaign settings have topics and search",
        },
        detalhe: {
          pt: "Quadro, Medidores, Condições e os dois de retratos ficam numa barra, um aberto por vez, que vira fileira no alto quando a janela está estreita no dock. A busca ignora acento e acha também pelo que você criou: \"vida\" leva aos Medidores, e o nome de uma condição sua leva às Condições. Ajuste de plugin que vale só nesta campanha ganha o tópico Ajustes.",
          en: "Board, Meters, Conditions and the two portrait topics sit on a bar, one open at a time, which becomes a row along the top when the window is narrow in the dock. Search ignores accents and also finds what you created: the name of a meter leads to Meters, and the name of one of your conditions leads to Conditions. Plugin options that apply only to this campaign get the Options topic.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Plugins podem levar a mesa para outro navegador, como o OBS da live",
          en: "Plugins can take the table to another browser, like OBS for a live stream",
        },
        detalhe: {
          pt: "O plugin abre páginas na rede com os dados rolando e os retratos desenhados como na TV, de fundo transparente, e recebe só o que a mesa vê. O código dele continua rodando só no seu computador. Ele também lê e escreve no chat da campanha.",
          en: "The plugin serves pages on the network with rolling dice and portraits drawn as in the spectator window, on a transparent background, and only receives what the table sees. Its code still runs only on your computer. It can also read and post to the campaign chat.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Shift trava a câmera num eixo, e a seta segurada a leva sem tranco",
          en: "Shift locks the camera to one axis, and a held arrow key moves it smoothly",
        },
        detalhe: {
          pt: "Com Shift, arrastando a moldura ou segurando V, a câmera anda só de lado ou só na vertical, para seguir uma parede ou um corredor. A seta segurada dava um passo, parava meio segundo e seguia aos pulos; agora arranca na hora e para em curva, numa velocidade constante, um pouco mais lenta que antes e mais rápida com Shift. Um toque continua andando 5%. De quebra, a roda com Shift aproxima a câmera em vez de só afastar, e V com Shift não espelha mais a seleção.",
          en: "With Shift, while dragging the frame or holding V, the camera moves only sideways or only up and down, to follow a wall or a corridor. A held arrow used to take a step, stop for half a second and carry on in jumps; it now starts at once and eases to a stop, at a steady speed, a little slower than before and faster with Shift. A tap still moves 5%. Along the way, the wheel with Shift zooms the camera in instead of only out, and V with Shift no longer mirrors the selection.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A câmera preparada fica amarela, e não mais vermelha",
          en: "A cued camera is yellow, no longer red",
        },
        detalhe: {
          pt: "Numa cena fora do ar, a câmera com que a mesa vai abrir aparecia em vermelho, como se a TV já a mostrasse. Agora o vermelho é só da câmera no ar, e a preparada oferece \"Desfazer a preparação\" em vez de \"Tirar do ar\".",
          en: "In a scene that is off air, the camera the table will open on showed in red, as if the spectator window were already showing it. Red now belongs only to the camera on air, and the cued one offers \"Cancel cue\" instead of \"Take off air\".",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A câmera sai pelo X do chip, e a moldura ganhou menu no botão direito",
          en: "A camera goes away with the X on its chip, and the frame has a right-click menu",
        },
        detalhe: {
          pt: "O menu da moldura tem Remover, Transmitir, Trazer para onde estou e Ir até a câmera, e vale também para as outras câmeras desenhadas no mapa. O menu de três pontos da barra de câmeras também remove. Antes ela só saía pelo botão direito do chip, e nada ali dizia que dava.",
          en: "The frame menu has Remove, Put on air, Bring to where I am and Go to camera, and it also works on the other cameras drawn on the map. The three-dot menu of the camera bar removes it too. Before, a camera only went away from the chip's right-click menu, and nothing there said it could.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Pôr no ar pela lista de Cenas também abre a cena para você",
          en: "Putting a scene on air from the Scenes list also opens it for you",
        },
        detalhe: {
          pt: "O que acabou de ir para a TV é o que você precisa ter na mão. Se ela já estava aberta, a seleção e o zoom ficam como estavam. Para preparar a próxima enquanto a mesa vê a atual, abra sem transmitir.",
          en: "What just went to the spectator window is what you need at hand. If it was already open, the selection and the zoom stay as they were. To prepare the next scene while the table watches the current one, open it without putting it on air.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A nota do Ponto recebe imagens arrastadas, e o Delete apaga o Ponto",
          en: "A pin's note accepts dragged images, and Delete removes the pin",
        },
        detalhe: {
          pt: "Os anexos viraram uma grade que aceita imagem da Biblioteca e arquivo do computador. A miniatura abre numa janela ao clique e vai ao mapa pelo arrasto, sem sair do Ponto. Clicar no Ponto passou a largar o que estava selecionado: antes, com um token selecionado, clicar no Ponto e apertar Delete apagava o token.",
          en: "Attachments became a grid that takes images from the Library and files from your computer. A thumbnail opens in a window on click and goes onto the map by dragging, without leaving the pin. Clicking a pin now drops what was selected: before, with a token selected, clicking a pin and pressing Delete deleted the token.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Fechar a janela com uma campanha aberta pede confirmação",
          en: "Closing the window with a campaign open asks first",
        },
        detalhe: {
          pt: "Fechar derruba a TV e os celulares no meio da sessão, e o X mora ao lado do maximizar. Trocar de campanha e tirar uma campanha da lista, na porta, também perguntam antes. O Alt+F4 continua fechando direto.",
          en: "Closing drops the spectator window and the phones in the middle of the session, and the X sits right next to maximize. Switching campaigns and removing a campaign from the list on the start screen also ask first. Alt+F4 still closes right away.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "A TV voltou a deslizar quando a câmera anda",
          en: "The spectator window slides smoothly again when the camera moves",
        },
        detalhe: {
          pt: "Desde a 0.2.0, arrastar a moldura, andar pelas setas ou segurar V chegava à mesa aos saltos, dez por segundo, e só o zoom deslizava.",
          en: "Since 0.2.0, dragging the frame, moving with the arrow keys or holding V reached the table in jumps, ten per second, and only zoom was smooth.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "A parede deixou de prender os tokens que ficam embaixo dela",
          en: "Walls no longer trap the tokens under them",
        },
        detalhe: {
          pt: "Uma parede desenhada por cima de um prédio engolia o clique dos tokens lá dentro. Agora o token pega o clique primeiro, e a parede se pega clicando no vazio dentro dela. Parada, ela aparece mais fraca, para não esconder o mapa. E a parede e a luz arrastadas para fora do mapa continuam à vista, para dar onde clicar e trazê-las de volta.",
          en: "A wall drawn over a building swallowed the clicks of the tokens inside it. Tokens now get the click first, and you pick the wall by clicking empty space inside it. At rest it is drawn fainter, so it does not hide the map. And walls and lights dragged off the map stay visible, so there is something to click to bring them back.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "Arrastar um cartão num quadro cheio de notas não engasga mais",
          en: "Dragging a card on a board full of notes no longer stutters",
        },
        detalhe: {
          pt: "Com trinta cartões, o arrasto quase parava; agora anda liso. Arrastar o token com a cena no ar também ficou mais leve. A barra de rolagem do cartão só aparece com o mouse em cima dele.",
          en: "With thirty cards, dragging nearly stalled; now it runs smoothly. Dragging a token with the scene on air got lighter too. A card's scrollbar only shows with the mouse over it.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "Os painéis do gizmo, da luz e da nota do Ponto não saem mais da tela",
          en: "The gizmo, light and pin note panels no longer go off screen",
        },
        detalhe: {
          pt: "Perto da borda, o painel abre do outro lado ou encosta por dentro. A nota do Ponto fica onde você a arrastou, e para na borda em vez de se perder fora dela.",
          en: "Near the edge, a panel opens on the other side or tucks inside. A pin's note stays where you dragged it, and stops at the edge instead of getting lost beyond it.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "Clicar no mapa tira o cursor do campo, e os atalhos voltam a valer",
          en: "Clicking the map takes the cursor out of a text field, and shortcuts work again",
        },
        detalhe: {
          pt: "Com a busca de personagem focada, o que se digitava depois de clicar no mapa ia para ela. O mesmo com os sliders: as setas voltam a empurrar a seleção.",
          en: "With the character search focused, whatever you typed after clicking the map went into it. Same with sliders: the arrow keys push the selection again.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "O ícone da condição sobre o token não vira mais mancha com zoom alto",
          en: "A condition's icon on a token no longer turns into a blot at high zoom",
        },
      },
    ],
  },
  {
    versao: "0.7.2",
    data: "2026-09-29",
    mudancas: [
      {
        tipo: "correcao",
        titulo: {
          pt: "Criar uma câmera pela tecla N não troca mais o que a mesa está vendo",
          en: "Creating a camera with the N key no longer changes what the table is watching",
        },
        detalhe: {
          pt: "A câmera nova entrava no ar na hora e cortava a cena da mesa. Agora ela nasce só selecionada, a mesa continua na câmera que estava, e o T põe a nova no ar quando for a hora. O botão + da pílula continua criando já no ar.",
          en: "The new camera used to go on air at once and cut the table's scene. Now it starts out only selected, the table stays on the camera it was on, and T puts the new one on air when it is time. The + button on the pill still creates it on air.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A câmera criada pela tecla N nasce onde o mouse está apontando",
          en: "A camera created with the N key appears where the mouse is pointing",
        },
        detalhe: {
          pt: "Com o tamanho da câmera selecionada. Com o mouse fora do mapa, numa coluna ou numa janela por cima, ela nasce onde nascia antes.",
          en: "With the size of the selected camera. With the mouse off the map, over a column or over a window on top, it appears where it used to.",
        },
      },
    ],
  },
  {
    versao: "0.7.1",
    data: "2026-09-29",
    mudancas: [
      {
        tipo: "correcao",
        titulo: {
          pt: "O mapa ficava preto na janela do espectador depois de desfazer uma troca de fundo",
          en: "The map went black in the spectator window after undoing a background change",
        },
        detalhe: {
          pt: "Trocar ou tirar o fundo apaga o mapa antigo da campanha, e o Ctrl+Z devolvia a cena para ele. A tela seguia mostrando a imagem guardada, e a janela do espectador ficava preta mais tarde. O Ctrl+Z não mexe mais no fundo: para voltar ao mapa anterior, troque de novo pelo menu da cena.",
          en: "Changing or removing the background deletes the old map from the campaign, and Ctrl+Z pointed the scene back at it. The screen kept showing the cached image, and the spectator window went black later. Ctrl+Z no longer touches the background: to go back to the previous map, change it again from the scene menu.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "A seção de um plugin desligado continuava no celular do jogador",
          en: "The section of a disabled plugin stayed on the player's phone",
        },
        detalhe: {
          pt: "Com um botão que não fazia mais nada. Agora ela some quando o plugin é desligado ou desinstalado, e volta com o que estava guardado se ele voltar.",
          en: "With a button that no longer did anything. It now goes away when the plugin is disabled or uninstalled, and comes back with what was stored if the plugin returns.",
        },
      },
    ],
  },
  {
    versao: "0.7.0",
    data: "2026-09-29",
    mudancas: [
      {
        tipo: "novidade",
        titulo: {
          pt: "A grade do mapa pode ser de hexágonos",
          en: "The map grid can be made of hexagons",
        },
        detalhe: {
          pt: "Em pé ou deitados, nas configurações da grade. O ímã encaixa o token no centro da casa, e a casa embaixo do token fica acesa.",
          en: "Pointy-top or flat-top, in the grid settings. Snapping puts the token in the center of the cell, and the cell under the token lights up.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Configurações ganhou a seção Ajustes, com busca e editor JSON",
          en: "Settings has an Options section, with search and a JSON editor",
        },
        detalhe: {
          pt: "Tudo que o ATO20 e os plugins deixam ajustar, numa lista só, por máquina e por campanha — a campanha vence. O botão JSON edita o arquivo cru, como no VSCode, e o ícone ao lado o abre no seu editor. O zoom, o aviso de versão e os volumes passaram a morar nesse arquivo.",
          en: "Everything ATO20 and the plugins let you adjust, in a single list, per machine and per campaign (the campaign wins). The JSON button edits the raw file, as in VS Code, and the icon next to it opens it in your editor. Zoom, the update notice and the volumes now live in that file.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Plugins podem mudar a interface: menus, ficha, janelas e ferramentas",
          en: "Plugins can change the interface: menus, sheet, windows and tools",
        },
        detalhe: {
          pt: "Um plugin põe opções no botão direito do token, da luz, da área escondida e das listas; acrescenta seções na ficha do personagem; troca o miolo de uma seção ou uma janela inteira pela dele (desligar o plugin devolve a de fábrica); e a ferramenta dele ganha ícone, pílula de opções e prévia no arrasto.",
          en: "A plugin adds options to the right-click menu of the token, the light, the hidden area and the lists; adds sections to the character sheet; replaces the body of a section or a whole window with its own (turning the plugin off brings back the built-in one); and its tool gets an icon, an options pill and a drag preview.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Plugins alcançam medidores, condições e dados",
          en: "Plugins reach meters, conditions and dice",
        },
        detalhe: {
          pt: "Um plugin lê o elenco inteiro, ajusta medidores em lote, liga condições na horda, rola dados de verdade no palco e recebe aviso quando algo muda. Cada plugin guarda o que é dele em cada personagem, com uma parte que só o mestre vê. É o que faltava para iniciativa, botão de ataque e habilidades existirem como plugin.",
          en: "A plugin reads the whole cast, adjusts meters in a batch, toggles conditions on the horde, rolls real dice on the stage and gets notified when something changes. Each plugin keeps its own data on each character, with a part only the GM sees. That was what initiative, attack buttons and abilities needed to exist as plugins.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "O medidor pode ter o desenho do plugin, na TV e no celular",
          en: "A meter can wear the plugin's drawing, in the spectator window and on the phone",
        },
        detalhe: {
          pt: "Um coração que esvazia, uma barra que pulsa: o plugin traz um SVG com variáveis e a mesa inteira o desenha. Sem código do plugin rodando fora do seu computador; a TV que não tem o plugin mostra a barra de sempre.",
          en: "A heart that empties, a bar that pulses: the plugin brings an SVG with variables, and the whole table draws it. No plugin code runs outside your computer; a spectator window without the plugin shows the usual bar.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "O plugin pode pôr uma seção com botões no celular do jogador",
          en: "A plugin can put a section with buttons on the player's phone",
        },
        detalhe: {
          pt: "Texto, valores e botões. Apertar manda a ação ao mestre, e é o plugin que decide o que ela faz; o resultado aparece na mesa. A ficha do jogador passou a se atualizar sozinha quando o mestre mexe nela.",
          en: "Text, values and buttons. Tapping sends the action to the GM, and the plugin decides what it does; the result shows up on the table. The player's sheet now refreshes by itself when the GM changes it.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "Um plugin com defeito não derruba mais a tela do mestre",
          en: "A broken plugin no longer takes down the GM's screen",
        },
        detalhe: {
          pt: "O erro aparece dentro do painel dele, com o motivo, e o resto continua. Escolher a ferramenta de um plugin passou a funcionar sem antes abrir um painel dele.",
          en: "The error shows up inside its panel, with the reason, and everything else keeps going. Choosing a plugin's tool now works without opening one of its panels first.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "O quadro não levava para a mesa o que um plugin guardou nele",
          en: "A board no longer sends the table what a plugin stored in it",
        },
        detalhe: {
          pt: "Cena de mapa já escondia; o quadro passava tudo. Agora os dois escondem.",
          en: "Map scenes already hid it; the board passed everything along. Now both hide it.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "Postit e cartão passaram a aceitar o botão direito",
          en: "Sticky notes and cards now respond to the right click",
        },
      },
    ],
  },
  {
    versao: "0.6.0",
    data: "2026-09-28",
    mudancas: [
      {
        tipo: "novidade",
        titulo: {
          pt: "O personagem ganhou condições",
          en: "Characters have conditions",
        },
        detalhe: {
          pt: "Envenenado, caído, abençoado: um selo com nome, ícone e cor, na ficha logo abaixo dos medidores. A campanha tem um cardápio delas, e \"Usar sugestões\" cria oito prontas. Uma condição escondida não sai do seu computador.",
          en: "Poisoned, prone, blessed: a badge with a name, an icon and a color, on the sheet right below the meters. The campaign keeps a menu of them, and \"Use suggestions\" creates eight ready-made ones. A hidden condition never leaves your computer.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A condição muda a figura",
          en: "A condition changes the figure",
        },
        detalhe: {
          pt: "Aura, tingido, translúcido, tremendo ou apagado, no token e no retrato. Os selos aparecem sobre o token, no alto do retrato e no celular do dono, e se arrastam no layout do retrato como as outras peças.",
          en: "An aura, a tint, translucency, a tremble or a fade, on the token and on the portrait. Badges show above the token, at the top of the portrait and on the owner's phone, and they can be dragged in the portrait layout like the other pieces.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Dá para envenenar a horda de uma vez",
          en: "You can poison the whole horde at once",
        },
        detalhe: {
          pt: "O submenu Condições do botão direito vale para a seleção inteira.",
          en: "The Conditions submenu in the right-click menu applies to the whole selection.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A lanterna do token vira facho, e gira com a figura",
          en: "A token's lantern becomes a beam that turns with the figure",
        },
        detalhe: {
          pt: "Aponte uma vez para onde o rosto do desenho olha; dali em diante, girar o token gira o facho.",
          en: "Aim it once where the drawing's face is looking; from then on, rotating the token rotates the beam.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "O menu do token caiu para a metade das linhas",
          en: "The token menu is down to half its lines",
        },
        detalhe: {
          pt: "O que é da cena — colar, selecionar tudo, câmera — mora no botão direito do vazio. Espelhar, Ordem e Câmera viraram submenus.",
          en: "What belongs to the scene (paste, select all, camera) lives in the right-click menu on empty space. Mirror, Order and Camera became submenus.",
        },
      },
    ],
  },
  {
    versao: "0.5.0",
    data: "2026-09-28",
    mudancas: [
      {
        tipo: "novidade",
        titulo: {
          pt: "O mapa pode ficar escuro, e o escuro tem tom",
          en: "Maps can go dark, and the dark has a tone",
        },
        detalhe: {
          pt: "A régua de Escuridão fica nas Configurações do mapa, ao lado do sol, com os tons Breu, Noite, Caverna e Abismo, ou uma cor sua. A mesa vê o escuro inteiro; você vê mais fraco, para conseguir trabalhar dentro dele.",
          en: "The Darkness slider sits in the map settings, next to the sun, with the tones Pitch black, Night, Cave and Abyss, or a color of your own. The table sees the full darkness; you see it dimmer, so you can work inside it.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A tocha volta: a ferramenta Luz crava uma luz no mapa",
          en: "The torch is back: the Light tool pins a light on the map",
        },
        detalhe: {
          pt: "Seis climas prontos — chama, vela, lua, magia, veneno e sangue —, cor livre e intensidade. São dois alcances: onde dá para ler o mapa, e até onde se enxerga algum vulto.",
          en: "Six ready-made moods (flame, candle, moon, magic, poison and blood), a free color and an intensity. There are two reaches: where the map can be read, and how far a shape can still be made out.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "O token pode carregar uma lanterna",
          en: "A token can carry a lantern",
        },
        detalhe: {
          pt: "Pelo botão direito, em três alcances. Ela anda com o personagem, na TV e no celular também.",
          en: "From the right-click menu, in three reaches. It walks with the character, in the spectator window and on the phone too.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A parede corta a luz, e o token faz sombra e ganha volume nela",
          en: "Walls block the light, and tokens cast shadows and gain volume in it",
        },
        detalhe: {
          pt: "Atrás de uma parede continua escuro. Cada token deita uma silhueta para longe de cada chama e fica mais claro do lado virado para ela: três tochas numa sala dão três vultos por goblin.",
          en: "Behind a wall it stays dark. Each token casts a silhouette away from every flame and turns lighter on the side facing it: three torches in a room give each goblin three shadows.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A luz liga e desliga, vira cone e tremula",
          en: "Lights switch on and off, turn into cones and flicker",
        },
        detalhe: {
          pt: "Desligada, ela guarda a cor e o alcance para quando voltar. O cone aponta e abre pelas alças. Os efeitos Fogo, Pulsando e Piscando valem também para a lanterna, e quem pediu menos movimento no sistema recebe a luz parada.",
          en: "Switched off, a light keeps its color and reach for when it comes back. The cone is aimed and opened by its handles. The Fire, Pulsing and Flashing effects work on lanterns too, and if you asked your system for reduced motion, lights hold still.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A imagem que se mexe anima também na TV e no celular",
          en: "Moving images move in the spectator window and on the phone too",
        },
        detalhe: {
          pt: "GIF, WebP animado e APNG chegam inteiros à mesa, inclusive os que já estavam na campanha. Nas listas, um selo de play marca o que é animado, e passar o mouse anima.",
          en: "GIF, animated WebP and APNG reach the table whole, including the ones already in the campaign. In the lists, a play badge marks what is animated, and hovering plays it.",
        },
      },
    ],
  },
  {
    versao: "0.4.0",
    data: "2026-09-28",
    mudancas: [
      {
        tipo: "novidade",
        titulo: {
          pt: "O personagem ganhou medidores",
          en: "Characters have meters",
        },
        detalhe: {
          pt: "Vida, sanidade, munição, carga ou tocha: um número até um teto, com nome, cor e forma de barra, pontos ou porcentagem. Só o mestre escreve, pela ficha, onde a barra se arrasta para mudar o valor. A mesa e o dono do personagem leem, e um medidor escondido não sai do seu computador.",
          en: "Health, sanity, ammo, load or a torch: a number up to a maximum, with a name, a color and the shape of a bar, dots or a percentage. Only the GM writes them, from the sheet, where the bar can be dragged to change the value. The table and the character's owner read them, and a hidden meter never leaves your computer.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Os medidores aparecem ao lado do retrato, e podem ir para cima do token",
          en: "Meters show up next to the portrait, and can go above the token",
        },
        detalhe: {
          pt: "Na mesa, eles ficam numa coluna junto do retrato. Para o mapa de combate, um interruptor nas Configurações do mapa põe nome e medidores sobre a cabeça dos tokens.",
          en: "At the table, they sit in a column next to the portrait. For combat maps, a switch in the map settings puts the name and meters above the tokens' heads.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A campanha ganhou uma janela de configuração",
          en: "The campaign has a settings window",
        },
        detalhe: {
          pt: "Pelo menu da campanha. Nela ficam os medidores de fábrica, que todo personagem começa tendo, e o layout e a posição dos retratos, que saíram da janela de Retratos.",
          en: "From the campaign menu. It holds the default meters every character starts with, and the layout and position of the portraits, which moved out of the Portraits window.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "O retrato pode mostrar o nome",
          en: "A portrait can show the name",
        },
        detalhe: {
          pt: "Começa desligado, para não apresentar um PNJ antes da hora. Liga no layout dos retratos, e o nome se arrasta e cresce como as outras peças.",
          en: "It starts switched off, so no NPC gets introduced before their time. Turn it on in the portrait layout, and the name drags and grows like the other pieces.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "Ao abrir uma campanha, a TV e os celulares não apagam mais os retratos por alguns segundos",
          en: "Opening a campaign no longer blanks the portraits in the spectator window and on the phones for a few seconds",
        },
      },
    ],
  },
  {
    versao: "0.3.0",
    data: "2026-09-28",
    mudancas: [
      {
        tipo: "novidade",
        titulo: {
          pt: "O mapa ganha sol e paredes",
          en: "Maps get a sun and walls",
        },
        detalhe: {
          pt: "O sol não acende nada: ele só diz para onde a sombra cai, e se aponta num céu visto de cima, nas Configurações do mapa. A parede tem altura, então a mureta e a torre jogam sombras diferentes. A sombra do token é a silhueta dele — o cajado, a capa e a montaria aparecem nela. A mesa vê a sombra, mas não as paredes que a fazem.",
          en: "The sun lights nothing: it only says where shadows fall, and you aim it on a sky seen from above, in the map settings. Walls have a height, so a low wall and a tower cast different shadows. A token's shadow is its own silhouette: the staff, the cloak and the mount show up in it. The table sees the shadows, but not the walls that cast them.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "O jogador move e gira o token do próprio personagem pelo celular",
          en: "Players move and rotate their own character's token from the phone",
        },
        detalhe: {
          pt: "Dedo no meio anda com a peça; dedo no anel de fora a gira no lugar.",
          en: "A finger in the middle carries the piece; a finger on the outer ring turns it in place.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A grade virou configuração do mapa, com ímã de encaixe",
          en: "The grid became a map setting, with snapping",
        },
        detalhe: {
          pt: "Com o ímã ligado, o token pousa no meio da casa, no arrasto do mestre e no dedo do jogador. Segure Alt para soltá-lo onde a mão largou. A casa ocupada por um personagem acende nas três telas.",
          en: "With snapping on, the token lands in the middle of the square, both when the GM drags it and under the player's finger. Hold Alt to drop it exactly where you let go. The square a character stands on lights up on all three screens.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Além de mapas, a campanha tem fundos",
          en: "Besides maps, a campaign has backdrops",
        },
        detalhe: {
          pt: "Um fundo é a imagem de um cenário com figuras por cima, sem câmera, grade, névoa nem sol. O painel virou Cenas, com uma aba para mapas e outra para fundos.",
          en: "A backdrop is the image of a setting with figures on top, without camera, grid, fog or sun. The panel became Scenes, with one tab for maps and another for backdrops.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A campanha ganhou capa",
          en: "Campaigns have a cover",
        },
        detalhe: {
          pt: "É o que a TV mostra quando não há nada no ar. Escolha pelo menu do nome da campanha, que também importa a imagem.",
          en: "It is what the spectator window shows when nothing is on air. Choose it from the campaign name menu, which also imports the image.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "As ferramentas do mapa ficam expostas na borda direita, e as áreas escondidas viraram um botão no palco",
          en: "Map tools sit out on the right edge, and hidden areas became a button on the stage",
        },
        detalhe: {
          pt: "Ponto, postit e régua de medir sem abrir a bolsa do rodapé; depois de medir, a régua volta para a seleção. As áreas ficam ao lado do índice de pontos, com quantas já foram reveladas.",
          en: "Pin, sticky note and measuring ruler, without opening the bag at the bottom; after measuring, the ruler goes back to selection. The areas sit next to the pin index, showing how many have already been revealed.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "Criar ou apagar uma cena não apaga mais as pastas e as notas de Arquivos",
          en: "Creating or deleting a scene no longer wipes the folders and notes in Files",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "O botão direito no token mostra as ações dele",
          en: "Right-clicking a token shows its own actions",
        },
        detalhe: {
          pt: "Aparência, Opacidade e o resto sumiam do menu, porque o clique desfazia a seleção.",
          en: "Appearance, Opacity and the rest went missing from the menu, because the click undid the selection.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "A TV e o celular seguem os volumes da mesa de som",
          en: "The spectator window and the phones follow the mixing desk volumes",
        },
        detalhe: {
          pt: "Cada categoria tocava no volume padrão, fosse qual fosse o fader. Se algum estiver baixo, a TV vai soar mais baixa que antes.",
          en: "Each category played at the default volume, whatever its fader said. If any of them is low, the spectator window will sound quieter than before.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "O retrato fica parado na TV e no celular enquanto a câmera anda",
          en: "Portraits stay still in the spectator window and on the phone while the camera moves",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "O contorno azul deixa de marcar o personagem de um jogador que saiu da mesa",
          en: "The blue outline no longer marks the character of a player who left the table",
        },
        detalhe: {
          pt: "Ele aparecia como NPC na lista e como jogador no mapa ao mesmo tempo. Uma campanha que já tinha o problema se conserta ao abrir.",
          en: "It showed as an NPC in the list and as a player on the map at the same time. A campaign that already had the problem fixes itself when opened.",
        },
      },
    ],
  },
  {
    versao: "0.2.0",
    data: "2026-09-23",
    mudancas: [
      {
        tipo: "novidade",
        titulo: {
          pt: "O painel de sons virou uma mesa de som",
          en: "The sound panel became a mixing desk",
        },
        detalhe: {
          pt: "Antes era uma trilha por vez. Agora vários sons tocam juntos — a chuva por baixo, a taverna por cima, o trovão disparado na hora —, cada um com a sua barra de volume. O teclado numérico vira os pads: aperte a tecla e o som sai, sem procurar nada na tela. Trocar de ambiente faz fade em vez de cortar.",
          en: "It used to be one track at a time. Now several sounds play together (the rain underneath, the tavern on top, the thunder fired on cue), each with its own volume fader. The numeric keypad becomes the pads: press the key and the sound plays, with no hunting around the screen. Switching ambience fades instead of cutting.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Os sons ganharam tipo, nome próprio, busca e macros",
          en: "Sounds have a type, their own name, search and macros",
        },
        detalhe: {
          pt: "Cada som diz se é ambiente ou disparo, os pads têm cor, e uma macro acende um conjunto inteiro de uma vez. O volume geral saiu de dentro da campanha e virou um botão na barra da janela, onde a mão o acha no meio da sessão.",
          en: "Each sound says whether it is ambience or a sound cue, the pads have colors, and a macro lights up a whole set at once. The master volume moved out of the campaign and became a button on the window bar, where your hand finds it mid-session.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A cena lembra que ambiente ela acende",
          en: "A scene remembers which ambience it lights up",
        },
        detalhe: {
          pt: "Abrir a taverna acende o som da taverna. Deixou de ser uma coisa a lembrar toda vez que o mapa muda.",
          en: "Opening the tavern lights up the tavern sound. It is no longer one more thing to remember every time the map changes.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Dá para desenhar no mapa, e não só no quadro",
          en: "You can draw on the map, not only on the board",
        },
        detalhe: {
          pt: "Formas geométricas, setas que curvam e texto solto valem nos dois, com a régua de ferramentas na borda. E você escolhe o que a mesa vê: o desenho pode ficar só para você.",
          en: "Geometric shapes, curving arrows and free text work on both, with the tool rail on the edge. And you choose what the table sees: a drawing can stay just for you.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A área escondida pode ser quadrada, redonda ou desenhada à mão",
          en: "A hidden area can be square, round or drawn by hand",
        },
        detalhe: {
          pt: "Ela também gira, e os vértices se editam depois — a caverna deixa de ser um retângulo em cima de um desenho que não é retangular.",
          en: "It also rotates, and its vertices can be edited afterwards: the cave is no longer a rectangle over a drawing that isn't rectangular.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "O token de personagem ganhou um contorno que diz de quem ele é",
          en: "Character tokens have an outline that says whose they are",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "O personagem pode ter várias aparências",
          en: "A character can have several appearances",
        },
        detalhe: {
          pt: "Além da padrão, quantas você quiser: Ferido, Lobo, Encapuzado. Cada uma guarda o próprio retrato e a própria miniatura, e trocar troca os dois de uma vez — inclusive o token que já está no mapa, em todas as cenas. Dá para trocar pela ficha, pelo menu da lista de personagens ou pelo menu do token.",
          en: "Besides the default one, as many as you like: Wounded, Wolf, Hooded. Each keeps its own portrait and its own token image, and switching swaps both at once, including the token already on the map, in every scene. You can switch from the sheet, from the character list menu or from the token menu.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Ctrl+V põe imagem de fora no mapa, no quadro e no acervo",
          en: "Ctrl+V brings an outside image onto the map, the board and the library",
        },
        detalhe: {
          pt: "Print de tela, recorte de editor ou imagem copiada do navegador. Com o painel de imagens em foco, a figura só entra no acervo; em qualquer outro lugar, ela também aparece no centro do que você está vendo.",
          en: "A screenshot, an editor crop or an image copied from the browser. With the image panel focused, the picture only goes into the library; anywhere else, it also shows up in the middle of what you are looking at.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Os retratos podem andar em grupo",
          en: "Portraits can travel as a group",
        },
        detalhe: {
          pt: "Uma união com moldura colorida, nome, ordem própria e o canto da tela onde ela fica. É como se diz de relance quem anda com quem.",
          en: "A group with a colored frame, a name, its own order and the corner of the screen where it sits. It's how you show at a glance who travels with whom.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A ficha em PDF abre dentro do aplicativo",
          en: "PDF sheets open inside the app",
        },
        detalhe: {
          pt: "Num leitor próprio, e não numa janela do navegador embutida — com zoom, páginas e o documento inteiro alcançável. O mesmo leitor serve qualquer documento da campanha.",
          en: "In its own reader, not in an embedded browser window, with zoom, pages and the whole document within reach. The same reader opens any document in the campaign.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "O item do inventário do jogador ganhou quadro de foto",
          en: "Player inventory items have a photo frame",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Criar personagem pede o nome antes, e F2 renomeia",
          en: "Creating a character asks for the name first, and F2 renames",
        },
        detalhe: {
          pt: "Desistir no meio não deixa mais um \"Novo personagem\" para trás. A linha ganhou menu no botão direito, com renomear, pôr no mapa, entregar a um jogador e apagar.",
          en: "Giving up halfway no longer leaves a \"New character\" behind. The row has a right-click menu, with rename, put on the map, give to a player and delete.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Renomear ficou previsível em toda a tela",
          en: "Renaming works the same way everywhere",
        },
        detalhe: {
          pt: "Clicar fora grava, Enter grava, Escape desiste. Vale para o personagem, a aparência e o grupo de retratos.",
          en: "Clicking away saves, Enter saves, Escape cancels. It applies to characters, appearances and portrait groups.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Os painéis vazios explicam o que fazer, e as abas fecham no X",
          en: "Empty panels explain what to do, and tabs close with the X",
        },
        detalhe: {
          pt: "Ou no botão do meio do mouse, como no navegador. Áreas virou uma aba dentro de Mapas, e a linha do mapa ganhou menu.",
          en: "Or with the middle mouse button, as in a browser. Areas became a tab inside Maps, and the map row has a menu.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "O Ctrl+Z ficou mais seguro",
          en: "Ctrl+Z is safer",
        },
        detalhe: {
          pt: "Ele não apaga cena, quadro nem nota — para isso existe a pergunta de confirmação. E dentro de um texto ele desfaz por palavra, em vez de sumir com o parágrafo inteiro.",
          en: "It doesn't delete scenes, boards or notes: that's what the confirmation prompt is for. And inside a text it undoes word by word, instead of wiping out the whole paragraph.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "O mapa parava de tremer ao dar zoom, e o gizmo parava de borrar",
          en: "The map stops jumping when you zoom, and the gizmo stops blurring",
        },
        detalhe: {
          pt: "Aquele salto para o centro ao aproximar, e as alças que incham quando você afasta o mapa. A roda também ficou mais parecida com a de um mouse de verdade, e o arrasto responde por quadro em vez de engasgar.",
          en: "That jump to the center when zooming in, and the handles that swell as you zoom the map out. The wheel also feels more like a real mouse, and dragging responds frame by frame instead of stuttering.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "O disparo de som toca o arquivo inteiro, e a trilha reacende sem piscar",
          en: "Sound cues play the whole file, and the music comes back without a blink",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "A lixeira do acervo passou a ver o som que não está tocando",
          en: "The library bin now sees sounds that are not playing",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "O X de uma janela que está atrás deixou de pedir dois cliques",
          en: "The X of a window sitting behind another no longer takes two clicks",
        },
      },
    ],
  },
  {
    versao: "0.1.4",
    data: "2026-09-18",
    mudancas: [
      {
        tipo: "correcao",
        titulo: {
          pt: "No Windows, o arquivo do instalador também mostra o ícone do ATO20",
          en: "On Windows, the installer file shows the ATO20 icon too",
        },
        detalhe: {
          pt: "A 0.1.3 trocou o ícone do aplicativo instalado e do atalho, mas o instalador que você baixa — o ato20_x64-setup.exe — continuava aparecendo no Explorer com o ícone genérico da ferramenta que o empacota, um globo azul. Agora é a mesma marca em tudo.",
          en: "Version 0.1.3 changed the icon of the installed app and its shortcut, but the installer you download (ato20_x64-setup.exe) still showed up in Explorer with the generic icon of the tool that packages it, a blue globe. Now it's the same brand everywhere.",
        },
      },
    ],
  },
  {
    versao: "0.1.3",
    data: "2026-09-18",
    mudancas: [
      {
        tipo: "correcao",
        titulo: {
          pt: "O ATO20 passa a ter o próprio ícone na barra de tarefas e no atalho",
          en: "ATO20 now has its own icon on the taskbar and on the shortcut",
        },
        detalhe: {
          pt: "Até aqui todo pacote — AppImage, instalador do Windows, .deb e .rpm — saía com o ícone padrão da ferramenta que empacota o aplicativo, dois anéis ciano e amarelo. Agora é a marca do ATO20: a tenda com o d20, sobre fundo escuro.",
          en: "Until now every package (AppImage, Windows installer, .deb and .rpm) shipped with the default icon of the tool that packages the app, two cyan and yellow rings. Now it's the ATO20 brand: the tent with the d20, on a dark background.",
        },
      },
    ],
  },
  {
    versao: "0.1.2",
    data: "2026-09-18",
    mudancas: [
      {
        tipo: "correcao",
        titulo: {
          pt: "A página da loja anunciava as novidades da versão anterior",
          en: "The store page announced the previous version's changes",
        },
        detalhe: {
          pt: "Detalhe de bastidor, e só aparece para quem instalar pela loja: o arquivo que descreve o ATO20 para o Flathub ficou uma versão atrás na 0.1.1, então a loja mostrava o que mudou na 0.1.0. Nada muda para quem baixou o AppImage ou o instalador do Windows.",
          en: "A behind-the-scenes detail that only shows for people who install from the store: the file that describes ATO20 to Flathub fell one version behind in 0.1.1, so the store showed what changed in 0.1.0. Nothing changes for people who downloaded the AppImage or the Windows installer.",
        },
      },
    ],
  },
  {
    versao: "0.1.1",
    data: "2026-09-18",
    mudancas: [
      {
        tipo: "novidade",
        titulo: {
          pt: "O ATO20 começa a ser empacotado para as lojas do Linux",
          en: "ATO20 starts being packaged for the Linux stores",
        },
        detalhe: {
          pt: "Esta versão não muda nada no que você já usa — ela existe porque o pacote do Flathub precisa ser construído a partir de uma versão publicada, e não do código do dia. O que mudou por dentro só aparece lá: as fontes deixaram de ser baixadas durante o empacotamento, e o aviso de versão nova some no pacote de loja, onde quem atualiza é a própria loja. Quem baixou o AppImage ou o instalador do Windows continua sendo avisado como antes.",
          en: "This version changes nothing in what you already use: it exists because the Flathub package has to be built from a published version, not from the code of the day. What changed inside only shows up there: fonts are no longer downloaded while packaging, and the new version notice steps aside in the store build, where the store itself is what updates you. People who downloaded the AppImage or the Windows installer still get notified as before.",
        },
      },
    ],
  },
  {
    versao: "0.1.0",
    data: "2026-09-18",
    mudancas: [
      {
        tipo: "novidade",
        titulo: {
          pt: "O aplicativo passa a avisar sozinho quando existe versão nova",
          en: "The app now tells you by itself when there is a new version",
        },
        detalhe: {
          pt: "Até aqui toda versão saiu marcada como pré-lançamento, e o endereço que o aplicativo consulta ignora pré-lançamento — quem baixou a 0.0.1 ficou na 0.0.1 sem nunca saber que havia seis versões depois. Desta em diante o aviso chega sozinho.",
          en: "Until now every version came out marked as a pre-release, and the address the app checks ignores pre-releases: whoever downloaded 0.0.1 stayed on 0.0.1 without ever knowing there were six versions after it. From this one on, the notice arrives by itself.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A campanha ganha quadros: uma folha sem chão para o mestre pensar",
          en: "Campaigns gain boards: a floorless sheet where the GM can think",
        },
        detalhe: {
          pt: "O quadro fica na aba ao lado de Cenas, com pastas dentro de pastas. Nele você escreve texto direto na folha, liga as coisas com setas — de ponta solta ou grudada no que você mover — e mistura post-it, imagem, dado e cartão no mesmo lugar. Pôr o quadro no ar mostra a folha inteira na TV e no celular.",
          en: "The board sits in the tab next to Scenes, with folders inside folders. On it you write text right on the sheet, link things with arrows (loose-ended or stuck to whatever you move) and mix sticky notes, images, dice and cards in the same place. Putting the board on air shows the whole sheet in the spectator window and on the phones.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Documento: um cartão de Markdown com prévia ao vivo",
          en: "Document: a Markdown card with live preview",
        },
        detalhe: {
          pt: "Você escreve de um lado e vê formatado do outro. No começo da linha, # dá título, ## subtítulo e - item de lista; @, / e > chamam referência, comando e citação, tanto na nota quanto no cartão.",
          en: "You write on one side and see it formatted on the other. At the start of a line, # makes a heading, ## a subheading and - a list item; @, / and > call up a reference, a command and a quote, in both the note and the card.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A aba Arquivos põe quadros, notas e imagens na mesma árvore de pastas",
          en: "The Files tab puts boards, notes and images in the same folder tree",
        },
        detalhe: {
          pt: "Qualquer arquivo entra no acervo agora, e a aba Imagens virou Biblioteca. A nota passou a ser arquivo da campanha: o cartão no quadro só aponta para ela, então a mesma nota pode aparecer em dois quadros sem virar duas cópias. Arrastar a nota da árvore até o quadro funciona como com imagem.",
          en: "Any file can go into the library now, and the Images tab became Library. A note is now a campaign file: the card on the board only points to it, so the same note can show up on two boards without becoming two copies. Dragging a note from the tree onto the board works like it does with an image.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Ctrl+K abre uma paleta de comandos",
          en: "Ctrl+K opens a command palette",
        },
        detalhe: {
          pt: "Ela acha janela, cena, livro, imagem e atalho pelo nome, sem você ter de lembrar em que painel aquilo estava.",
          en: "It finds windows, scenes, books, images and shortcuts by name, without you having to remember which panel they were in.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Dá para jogar dados por notação, como \"2d6\", sem pegar no saquinho",
          en: "You can roll dice by notation, like \"2d6\", without reaching for the dice bag",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "O saquinho ganha o d% de dezenas e a moeda de cara ou coroa",
          en: "The dice bag gets the tens d% and a heads-or-tails coin",
        },
        detalhe: {
          pt: "O celular do jogador também pede os dois, e a mesa passa a ler \"Coroa\" e \"d%\" em vez de \"2\" e \"d2\".",
          en: "The player's phone can ask for both too, and the table now reads \"Tails\" and \"d%\" instead of \"2\" and \"d2\".",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A régua virou medidor que fica no mapa, com círculo, cone e retângulo",
          en: "The ruler became a measurement that stays on the map, with circle, cone and rectangle",
        },
        detalhe: {
          pt: "Antes a medida sumia quando você soltava o mouse. Agora ela fica posta na cena, e a forma diz o que você está medindo.",
          en: "The measurement used to vanish when you released the mouse. Now it stays placed in the scene, and the shape says what you are measuring.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A estante mostra os livros com capa, em caixa 2.5D, e o clique abre o PDF",
          en: "The shelf shows books with their covers, in a 2.5D box, and a click opens the PDF",
        },
        detalhe: {
          pt: "Há também um comando para abrir o livro no leitor de PDF da máquina. A capa fica guardada depois da primeira vez, então a estante não pisca ao reabrir.",
          en: "There is also a command to open the book in your computer's PDF reader. The cover is kept after the first time, so the shelf doesn't flicker when reopened.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A cena guarda um handout: imagens do acervo que você manda à mesa uma a uma",
          en: "A scene keeps a handout: library images you send to the table one by one",
        },
        detalhe: {
          pt: "A bolinha recebe imagens arrastadas e as leva à TV; o que já está na mesa volta para a manga pela mesma bolinha ou pelo menu. O painel ganhou título e uma caixinha de + que escolhe imagens do computador.",
          en: "The little round button takes dragged images and sends them to the spectator window; whatever is already on the table goes back up your sleeve through the same button or the menu. The panel has a title and a small + box that picks images from your computer.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A janela \"Mesa\" mostra o que a TV está vendo, em miniatura, na sua tela",
          en: "The \"Table\" window shows what the spectator window is showing, in miniature, on your screen",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Girar pelos cantos do gizmo, como no Figma",
          en: "Rotate from the corners of the gizmo, as in Figma",
        },
        detalhe: {
          pt: "O botão de rotacionar saiu. A roda do mouse redimensiona a imagem na mão e Shift gira; as setas do teclado andam cinco de cada vez, e com Shift giram a seleção. Segurando a alça da câmera, a roda dá zoom nela.",
          en: "The rotate button is gone. The mouse wheel resizes the image you're holding and Shift rotates it; the arrow keys move five at a time, and with Shift they rotate the selection. While holding the camera handle, the wheel zooms it.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Dá para afastar até 50%, com vazio em volta do mapa",
          en: "You can zoom out to 50%, with empty space around the map",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A cena nasce sem câmera, e a mesa vê tudo até a primeira entrar",
          en: "A scene starts without a camera, and the table sees everything until the first one comes in",
        },
        detalhe: {
          pt: "Antes a cena nova já vinha com um enquadramento que você não escolheu. O botão \"Mesa\" também saiu da barra de cima.",
          en: "A new scene used to come with a framing you didn't choose. The \"Table\" button also left the top bar.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A lista de personagens separa Players em cima e NPCs embaixo",
          en: "The character list splits Players on top and NPCs below",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A ficha mostra quem está jogando com ela, e o diálogo do jogador diz há quanto tempo",
          en: "The sheet shows who is playing it, and the player dialog says for how long",
        },
        detalhe: {
          pt: "Dá para entregar o personagem a outra pessoa dali, e tirar alguém da mesa passa a pedir confirmação. A nota fechada do personagem fica guardada.",
          en: "You can hand the character to someone else from there, and removing someone from the table now asks for confirmation. A character's note stays closed once you close it.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A porta mudou: botões no alto, \"Encontrar campanha\" e o mapa da cena ao fundo do cartão",
          en: "The start screen changed: buttons on top, \"Find campaign\" and the scene's map behind the card",
        },
        detalhe: {
          pt: "A estante ganhou botão e aceita arquivo solto, \"O que mudou\" virou botão ao lado das Configurações, e a estante vazia virou um alvo tracejado em vez de um espaço em branco.",
          en: "The shelf has a button and accepts a loose file, \"What's new\" became a button next to Settings, and the empty shelf became a dashed target instead of a blank space.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Esc larga a ferramenta, e um X na barra faz o mesmo",
          en: "Esc drops the tool, and an X on the bar does the same",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "O palco vazio mostra a marca e os atalhos principais",
          en: "The empty stage shows the logo and the main shortcuts",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A tela diz qual pasta da campanha sumiu, em vez de abrir uma mesa vazia",
          en: "The screen says which campaign folder went missing, instead of opening an empty table",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "Apagar a pasta da campanha com a mesa aberta virava mesa vazia, e a gravação recriava a pasta pela metade",
          en: "Deleting the campaign folder with the table open turned it into an empty table, and saving recreated the folder halfway",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "No leitor, dar zoom deixava a folha branca por um instante",
          en: "In the reader, zooming left the page blank for a moment",
        },
        detalhe: {
          pt: "A página que você está lendo passa na frente das vizinhas, e trocar de página depressa não deixa mais um desenho cancelado na tela.",
          en: "The page you are reading now goes ahead of its neighbors, and flipping pages quickly no longer leaves a canceled drawing on screen.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "A máscara escura da câmera cobria o post-it e os controles do mestre",
          en: "The camera's dark mask covered the sticky notes and the GM's controls",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "O clique fora do mapa tinha deixado de valer",
          en: "Clicks outside the map had stopped working",
        },
        detalhe: {
          pt: "A borda saiu e o vazio em volta ganhou pontos.",
          en: "The border is gone and the empty space around it got dots.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "O token achatava ao encolher, em vez de parar no piso",
          en: "Tokens got squashed when shrunk, instead of stopping at the minimum size",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "O d% nascia sem valor, e a soma da mesa dava NaN",
          en: "The d% came out with no value, and the table's total showed NaN",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "A ficha só via quem entrou na mesa depois de reabrir o programa",
          en: "The sheet only saw who joined the table after reopening the app",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "O diálogo de Configurações prendia o foco e matava a barra da janela",
          en: "The Settings dialog trapped the focus and killed the window bar",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "O rótulo da câmera não cabia quando a moldura ficava pequena na tela",
          en: "The camera label didn't fit when the frame got small on screen",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "No quadro, o dado caía puxado para o plano, e não onde a mão soltou",
          en: "On the board, a die landed pulled onto the canvas instead of where you dropped it",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "No quadro, o texto novo nascia invisível e sem foco",
          en: "On the board, new text appeared invisible and without focus",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "A bancada já arrumada não ganhava a aba Quadros ao lado de Cenas",
          en: "An already arranged workspace didn't get the Boards tab next to Scenes",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "O arquivo da extensão se chama manifest.json, e não manifesto.json",
          en: "The plugin file is called manifest.json, not manifesto.json",
        },
      },
    ],
  },
  {
    versao: "0.0.6",
    data: "2026-09-16",
    mudancas: [
      {
        tipo: "novidade",
        titulo: {
          pt: "A cena tem câmeras com nome, e você escolhe qual delas está no ar",
          en: "Scenes have named cameras, and you choose which one is on air",
        },
        detalhe: {
          pt: "Cada câmera é um enquadramento guardado do mapa. Elas ficam numa pílula no alto da mesa, e transmitir é escolher uma — a que está no ar aparece marcada, e as outras ficam apagadas no palco, para você ver o que os jogadores não estão vendo. Trocar de câmera corta em fade na TV, e sem nenhuma no ar a mesa fica escura. Segurando V, o mouse vira cinegrafista e move o enquadramento sem mexer no mapa.",
          en: "Each camera is a saved framing of the map. They sit in a pill at the top of the table, and putting one on air is just picking it: the one on air is marked, and the others are dimmed on the stage, so you can see what the players are not seeing. Switching cameras cuts with a fade in the spectator window, and with none on air the table goes dark. Holding V, the mouse becomes a camera operator and moves the framing without touching the map.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "O acervo e a lista \"Em cena\" ganharam pastas",
          en: "The library and the \"In scene\" list have folders",
        },
        detalhe: {
          pt: "Pasta dentro de pasta, e arrastar uma pasta para dentro de outra. No acervo, Ctrl e Shift selecionam várias imagens de uma vez. Na lista \"Em cena\", clicar num item do mapa já pega a pasta inteira a que ele pertence.",
          en: "Folders inside folders, and you can drag one folder into another. In the library, Ctrl and Shift select several images at once. In the \"In scene\" list, clicking an item on the map picks up the whole folder it belongs to.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Importar arquivo grande não trava mais a janela, e dá para cancelar no meio",
          en: "Importing a large file no longer freezes the window, and you can cancel halfway",
        },
        detalhe: {
          pt: "A cópia saiu da thread da janela: um aviso mostra o que está entrando, quanto falta e um botão de parar. A miniatura de um mapa de 50 megapixels agora sai em menos de um segundo.",
          en: "The copy moved off the window's thread: a notice shows what is coming in, how much is left and a stop button. The thumbnail of a 50-megapixel map now comes out in under a second.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Arquivo largado no painel de imagens entra no acervo",
          en: "A file dropped on the image panel goes into the library",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A área do mapa cresce com o que você coloca nela",
          en: "The map area grows with what you put in it",
        },
        detalhe: {
          pt: "Antes o plano tinha um tamanho fixo e o que passava da borda ficava fora do alcance. Agora ele acompanha as peças.",
          en: "The canvas used to have a fixed size, and whatever went past the edge was out of reach. Now it follows the pieces.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A barra de ferramentas virou duas bolsas",
          en: "The toolbar became two bags",
        },
        detalhe: {
          pt: "A grade e a régua foram para a bolsa do mapa.",
          en: "The grid and the ruler moved to the map bag.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "O que a mesa tirou nas rolagens vira janela da bancada",
          en: "What the table rolled becomes a workspace window",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "O alfinete alterna a nota do ponto, e a bolinha do saquinho vira X enquanto ele está aberto",
          en: "The pushpin toggles the pin's note, and the dice bag button turns into an X while the bag is open",
        },
        detalhe: {
          pt: "Dois botões que antes só tinham ida: agora clicar de novo desfaz, e o ícone diz em que estado você está.",
          en: "Two buttons that used to go only one way: now clicking again undoes it, and the icon tells you which state you are in.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "Trocar o mapa de fundo três vezes seguidas importava o mesmo arquivo três vezes",
          en: "Changing the background map three times in a row imported the same file three times",
        },
        detalhe: {
          pt: "Três cópias do mesmo mapa pesado dentro da campanha.",
          en: "Three copies of the same heavy map inside the campaign.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "Abrir a tela do espectador no navegador falhava calado",
          en: "Opening the spectator window in the browser failed silently",
        },
        detalhe: {
          pt: "Em máquina Linux sem o `xdg-open`, o botão não fazia nada e não dizia por quê.",
          en: "On Linux machines without `xdg-open`, the button did nothing and didn't say why.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "Renomear pelo menu não fazia nada, e agora F2 também renomeia",
          en: "Rename from the menu did nothing, and now F2 renames too",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "O botão de tirar o post-it se escondia, e a prévia não mostrava onde o papel ia cair",
          en: "The button to remove a sticky note was hiding, and the preview didn't show where the note would land",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "No celular do jogador, o esmaecido da rolagem comia o texto da ficha",
          en: "On the player's phone, the scroll fade ate the sheet text",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "A mesa aceitava dado sem fim",
          en: "The table accepted endless dice",
        },
        detalhe: {
          pt: "Agora o teto é cinquenta dados por rolagem.",
          en: "The limit is now fifty dice per roll.",
        },
      },
    ],
  },
  {
    versao: "0.0.5",
    data: "2026-09-15",
    mudancas: [
      {
        tipo: "novidade",
        titulo: {
          pt: "A lista de novidades cabe numa tela, e cada linha abre quando você quer o detalhe",
          en: "The list of changes fits on one screen, and each line opens when you want the detail",
        },
        detalhe: {
          pt: "Com treze mudanças, a 0.0.4 virou uma parede de texto na tela de entrada e nas Configurações. Agora os títulos ficam à vista, separados entre o que é novo e o que foi consertado, e o detalhe de cada um abre com um clique. As versões anteriores vêm fechadas, uma linha cada, já dizendo quantas mudanças têm dentro.",
          en: "With thirteen changes, 0.0.4 turned into a wall of text on the start screen and in Settings. Now the titles stay in view, split between what is new and what was fixed, and each one's detail opens with a click. Earlier versions come closed, one line each, already saying how many changes they hold.",
        },
      },
    ],
  },
  {
    versao: "0.0.4",
    data: "2026-09-15",
    mudancas: [
      {
        tipo: "novidade",
        titulo: {
          pt: "Arrastar um personagem, uma imagem ou um item até o mapa mostra onde ele vai cair, e de que tamanho",
          en: "Dragging a character, an image or an item onto the map shows where it will land, and at what size",
        },
        detalhe: {
          pt: "A sombra da peça acompanha o ponteiro, no lugar e no tamanho exatos em que ela vai ficar, e a roda do mouse escolhe o tamanho sem soltar o arrasto — entre um quarto e quatro vezes. Antes a peça só aparecia depois de solta, e cair torta custava dois ajustes com o gizmo.",
          en: "The piece's shadow follows the pointer, at the exact spot and size where it will end up, and the mouse wheel picks the size without letting go of the drag (between a quarter and four times). Before, the piece only appeared once dropped, and landing crooked cost two adjustments with the gizmo.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "Um arquivo arrastado do gerenciador de arquivos cai no mapa onde a mão soltou",
          en: "A file dragged from the file manager lands on the map where you let go",
        },
        detalhe: {
          pt: "Ele entra no acervo e vai à cena no mesmo gesto, já selecionado. Vários de uma vez entram em escada, para nenhum ficar escondido embaixo do outro. O que não é imagem nem som é recusado.",
          en: "It goes into the library and onto the scene in one gesture, already selected. Several at once come in staggered, so none ends up hidden under another. Anything that isn't an image or a sound is turned away.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "O aplicativo diz em que versão está, e o que mudou",
          en: "The app tells you which version it is, and what changed",
        },
        detalhe: {
          pt: "Esta lista. Ela viaja dentro do pacote, então continua legível na mesa sem Wi-Fi.",
          en: "This list. It travels inside the package, so it stays readable at a table without Wi-Fi.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "A tela de entrada é uma só, com as novidades num painel ao lado",
          en: "There is a single start screen, with the changes in a side panel",
        },
        detalhe: {
          pt: "Antes havia duas telas diferentes conforme você já tivesse ou não uma campanha na lista. Agora é a mesma, e o histórico inteiro fica num painel próprio encostado na borda da janela, com rolagem própria.",
          en: "There used to be two different screens, depending on whether you already had a campaign in the list. Now it's the same one, and the whole history sits in its own panel against the edge of the window, with its own scrolling.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "As abas e os divisores da bancada ficaram visíveis",
          en: "The workspace tabs and dividers are now visible",
        },
        detalhe: {
          pt: "As abas passam a ler como aba, coladas no painel que abrem, e cada divisor entre colunas ganhou uma alça que acende quando a mão chega perto — antes era um fio invisível que só se revelava ao ser acertado.",
          en: "Tabs now read as tabs, attached to the panel they open, and each divider between columns has a handle that lights up when your hand gets close. Before, it was an invisible line that only revealed itself once you hit it.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "Abrir o aplicativo entrava direto na última campanha",
          en: "Opening the app went straight into the last campaign",
        },
        detalhe: {
          pt: "A lista de campanhas só aparecia na primeira execução ou depois de fechar a mesa. Quem tem duas campanhas esperava a errada ser lida do disco inteira antes de poder trocar. Recarregar a janela na tela de entrada também caía dentro de uma campanha.",
          en: "The campaign list only showed up on the first run or after closing the table. Anyone with two campaigns waited for the wrong one to be read from disk in full before being able to switch. Reloading the window on the start screen also dropped you into a campaign.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "Trocar de campanha mantinha o elenco da anterior",
          en: "Switching campaigns kept the previous one's cast",
        },
        detalhe: {
          pt: "Os personagens da campanha antiga apareciam na nova, e o nome do token vinha errado junto. Só recarregando a janela voltava ao certo.",
          en: "The characters from the old campaign showed up in the new one, and the token name came out wrong along with them. Only reloading the window set it right.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "O mapa ampliado borrava, espremia e engrossava os controles",
          en: "The zoomed-in map blurred, squeezed and thickened the controls",
        },
        detalhe: {
          pt: "Três defeitos do zoom, no mesmo lugar: o mapa e os tokens saíam borrados, passado mais ou menos 400% o mapa encolhia num eixo só e sumia, e o traço dos ícones do gizmo engrossava conforme se ampliava.",
          en: "Three zoom defects in the same place: the map and tokens came out blurry, past roughly 400% the map shrank along one axis and vanished, and the stroke of the gizmo icons got thicker as you zoomed in.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "A nota fixada no mapa não arrastava, e o zoom deformava o cartão",
          en: "A note pinned to the map wouldn't drag, and zooming distorted the card",
        },
        detalhe: {
          pt: "O cabeçalho do cartão é a alça, e ele não respondia ao arrasto. Junto: clicar no mapa com o cursor dentro do título ou do corpo da nota deixava o campo focado, e o que se digitasse depois — atalho de tecla inclusive — ia para a nota em vez de ir para a mesa.",
          en: "The card's header is the handle, and it didn't respond to dragging. Along with that: clicking the map with the cursor inside the note's title or body left the field focused, and whatever you typed next (shortcuts included) went into the note instead of the table.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "Tirar ou trocar o mapa de fundo devolvia o arquivo ao acervo",
          en: "Removing or changing the background map put the file back in the library",
        },
        detalhe: {
          pt: "O mapa entrou na campanha para ser o fundo daquela cena. Agora, tirado o fundo, ele sai da campanha em vez de virar mais um arquivo pesado para apagar depois.",
          en: "The map came into the campaign to be that scene's background. Now, once the background is removed, it leaves the campaign instead of becoming one more heavy file to delete later.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "O arquivo recém-importado não chegava a todas as telas",
          en: "A freshly imported file didn't reach every screen",
        },
        detalhe: {
          pt: "Anexar uma miniatura na ficha do personagem não atualizava o acervo, e o botão de pôr o token no mapa ficava desabilitado dizendo “Lendo o acervo” até o aplicativo ser reaberto.",
          en: "Attaching a token image on the character sheet didn't update the library, and the button to put the token on the map stayed disabled, saying “Reading the library”, until the app was reopened.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "Rolar a tela de entrada levava a barra de título embora",
          en: "Scrolling the start screen took the title bar away with it",
        },
        detalhe: {
          pt: "A barra saía por cima e o conteúdo era cortado.",
          en: "The bar slid off the top and the content got cut off.",
        },
      },
      {
        tipo: "correcao",
        titulo: {
          pt: "A tela de carregamento dizia “Abrindo a campanha” sem abrir campanha nenhuma",
          en: "The loading screen said “Opening the campaign” without opening any campaign",
        },
        detalhe: {
          pt: "O que ela espera ali é a lista de campanhas da máquina, e ela ainda chegava depois do trabalho já feito.",
          en: "What it waits for there is the machine's list of campaigns, and it still arrived after the work was already done.",
        },
      },
    ],
  },
  {
    versao: "0.0.3",
    data: "2026-09-14",
    mudancas: [
      {
        tipo: "correcao",
        titulo: {
          pt: "No Linux, o aplicativo abria numa janela branca",
          en: "On Linux, the app opened to a blank white window",
        },
        detalhe: {
          pt: "O pacote trazia uma biblioteca de vídeo que atropelava a da máquina, e o processo que desenha a tela morria antes de desenhar qualquer coisa — sem mensagem, porque quem escreveria a mensagem era ele. Agora o aplicativo usa a da máquina.",
          en: "The package shipped a video library that ran over the machine's own, and the process that draws the screen died before drawing anything, with no message, since it was the one that would have written it. Now the app uses the machine's library.",
        },
      },
    ],
  },
  {
    versao: "0.0.2",
    data: "2026-09-14",
    mudancas: [
      {
        tipo: "correcao",
        titulo: {
          pt: "Abrir uma campanha travava para sempre em “Acervo de imagens e sons”",
          en: "Opening a campaign got stuck forever on “Image and sound library”",
        },
        detalhe: {
          pt: "Faltavam no pacote os componentes de áudio, e sem eles a tela morria no meio do carregamento. Com eles, a trilha também voltou a tocar.",
          en: "The package was missing the audio components, and without them the screen died in the middle of loading. With them, the music plays again too.",
        },
      },
      {
        tipo: "novidade",
        titulo: {
          pt: "O AppImage se instala no menu sozinho",
          en: "The AppImage adds itself to the menu",
        },
        detalhe: {
          pt: "Na primeira abertura ele escreve o próprio atalho, e passa a aparecer no rofi, no wofi e no menu do ambiente. Se você mover o arquivo de pasta, o atalho se corrige na abertura seguinte.",
          en: "On first launch it writes its own shortcut, and starts showing up in rofi, wofi and the desktop menu. If you move the file to another folder, the shortcut fixes itself on the next launch.",
        },
      },
    ],
  },
  {
    versao: "0.0.1",
    data: "2026-09-14",
    mudancas: [
      {
        tipo: "novidade",
        titulo: {
          pt: "Primeira versão pública",
          en: "First public release",
        },
        detalhe: {
          pt: "Instaladores para Linux e Windows, e o aviso de versão nova dentro do aplicativo.",
          en: "Installers for Linux and Windows, and the new version notice inside the app.",
        },
      },
    ],
  },
];

/**
 * A versão que está rodando.
 *
 * Sai da cabeça da lista, e não de `getVersion()` do Tauri. Os dois dizem a
 * mesma coisa quando o release foi feito direito, e a lista tem a vantagem de
 * funcionar fora do aplicativo — nas telas do Espectador e do Jogador, que são
 * abas de navegador e não têm plugin nenhum para perguntar.
 *
 * Quem garante que os dois não divergem é a skill de release, que sobe o número
 * e escreve a entrada no mesmo passo.
 *
 * E são TRÊS lugares, não dois: o `<releases>` do metainfo do Flatpak conta a
 * mesma notícia em inglês, e o pacote da loja o instala a partir do checkout da
 * TAG. Escrever lá depois de taguear não alcança o pacote — ver o passo 4b da
 * skill `lancar-release`.
 */
export function versaoAtual(): Versao | undefined {
  return VERSOES[0];
}
