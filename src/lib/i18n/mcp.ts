import { escolher } from "@/lib/i18n/idioma";

/**
 * O texto do MCP -- `lib/mcp`.
 *
 * Dois leitores. O título de cada ferramenta é da PESSOA: o cliente o mostra ao
 * pedir permissão ("O Claude quer usar Criar nota"). A descrição, os
 * parâmetros e as mensagens são do MODELO, que lê qualquer idioma, mas
 * responde no idioma em que leu -- então seguem o da tela, como o resto.
 */
const pt = {
  argumentos: {
    falta: (nome: string) => `Falta o argumento "${nome}".`,
    texto: (nome: string) => `"${nome}" tem de ser texto.`,
    numero: (nome: string) => `"${nome}" tem de ser um número.`,
    booleano: (nome: string) => `"${nome}" tem de ser verdadeiro ou falso.`,
    lista: (nome: string) => `"${nome}" tem de ser uma lista.`,
    objeto: (nome: string) => `Cada item de "${nome}" tem de ser um objeto.`,
    numeroOuTexto: (nome: string) => `"${nome}" tem de ser número ou texto.`,
    umDe: (nome: string, opcoes: string, veio: string) => `"${nome}" é um de: ${opcoes}. Veio "${veio}".`,
  },

  protocolo: {
    feito: "Feito.",
    falhou: "A ferramenta falhou.",
    metodoDesconhecido: (metodo: string) => `Método desconhecido: ${metodo}`,
    ferramentaDesconhecida: (nome: string) => `Ferramenta desconhecida: ${nome}`,
    naoAtendeu: "A janela não conseguiu atender.",
  },

  achar: {
    variosComONome: (quantos: number, referencia: string, plural: string, ids: string) =>
      `Há ${quantos} com o nome "${referencia}" entre ${plural}. Use o id: ${ids}.`,
    naoAchei: (referencia: string, plural: string, existentes: string) =>
      `Não achei "${referencia}" entre ${plural}. Há: ${existentes}.`,
    eMais: (quantos: number) => `, e mais ${quantos}`,
    nenhum: (referencia: string, vazio: string) => `Não achei "${referencia}": ${vazio}.`,
    personagem: { plural: "os personagens", vazio: "a campanha não tem personagem" },
    cena: { plural: "as cenas", vazio: "a campanha não tem cena" },
    nota: { plural: "as notas", vazio: "a campanha não tem nota" },
    item: { plural: "os itens", vazio: "a campanha não tem item" },
    jogador: { plural: "os jogadores", vazio: "nenhum jogador entrou nesta campanha" },
    peca: { plural: "as peças desta cena", vazio: "a cena não tem peça" },
  },

  contexto: {
    semCampanha: "Nenhuma campanha aberta no ATO20. Use listar_campanhas e abrir_campanha.",
    boardNaoCarregou: "A campanha abriu, mas o board dela não carregou a tempo.",
    boardAusente: "O board da campanha não está carregado.",
    caminhoAbsoluto: (caminho: string) => `O caminho tem de ser absoluto: ${caminho}`,
    naoEntrou: (caminho: string) => `O arquivo não entrou: ${caminho}`,
    /** O nome de uma imagem que não está mais no acervo. */
    imagem: "imagem",
  },

  parametros: {
    caminhoDaImagem: "Caminho absoluto de uma imagem.",
    pastaDeArquivos: "Nome de uma pasta do painel Arquivos. Criada na raiz se não existir.",
    idOuNome: "Id ou nome.",
    molde: "Criar como molde do Compêndio, fora do jogo. Padrão: falso.",
    escondido: "Só o mestre vê.",
  },

  campanha: {
    nenhumaAberta: "Nenhuma campanha aberta. Use abrir_campanha com a pasta de uma das recentes.",
    naoAbriu: "A campanha não abriu.",
    ocupado: "O ATO20 está no meio de outra abertura. Tente de novo em instantes.",
    campanha: {
      titulo: "Campanha aberta",
      descricao:
        "Diz qual campanha está aberta no ATO20 e o que ela tem: quantas cenas de cada tipo, notas, " +
        "personagens, itens e imagens, a cena que o mestre está editando e a que está no ar na janela do espectador. " +
        "Comece por aqui. Sem campanha aberta, devolve as recentes.",
    },
    listar: {
      titulo: "Listar campanhas",
      descricao:
        "As campanhas que este ATO20 já abriu, da mais recente para a mais antiga, com a pasta de cada " +
        "uma. Uma campanha do ATO20 é uma pasta no disco.",
    },
    abrir: {
      titulo: "Abrir campanha",
      descricao:
        "Abre no ATO20 a campanha que mora na pasta indicada, fechando a que estiver aberta (o que " +
        "estava por gravar é gravado antes). A janela do espectador e os celulares passam a ver a campanha nova.",
      pasta: "Caminho absoluto da pasta da campanha.",
    },
    criar: {
      titulo: "Criar campanha",
      descricao:
        "Cria uma campanha nova, vazia, numa pasta nova dentro de pasta_mae (o nome da pasta sai do " +
        "nome da campanha), e a abre no ATO20 no lugar da que estiver aberta.",
      nome: "O nome da campanha.",
      pastaMae: "Caminho absoluto da pasta onde a pasta da campanha vai nascer.",
    },
  },

  notas: {
    listar: {
      titulo: "Listar notas",
      descricao:
        "As notas de Markdown da campanha (painel Arquivos), com id, título e pasta. O painel ordena as " +
        "notas pelo título, então uma história em partes leva número no título (\"1. A chegada\").",
    },
    ler: {
      titulo: "Ler nota",
      descricao: "O texto inteiro de uma nota, em Markdown.",
      nota: "Id ou título da nota.",
    },
    criar: {
      titulo: "Criar nota",
      descricao:
        "Cria uma nota de Markdown no painel Arquivos, com o texto dado. Serve para a história da " +
        "campanha, o resumo de uma sessão, ganchos, rumores, descrições de lugar. Devolve o id.",
      tituloDaNota: "O título, que é o que aparece na lista.",
      texto: "O corpo, em Markdown.",
    },
    editar: {
      titulo: "Editar nota",
      descricao:
        "Muda uma nota: o título, a pasta, e o texto -- trocado inteiro (texto) ou acrescentado no fim " +
        "(acrescentar). Não use os dois ao mesmo tempo.",
      tituloNovo: "O título novo.",
      texto: "O texto novo, que substitui o atual inteiro.",
      acrescentar: "Texto para pôr no fim, depois de uma linha em branco.",
      textoOuAcrescentar: "Use texto (troca tudo) ou acrescentar (põe no fim), não os dois.",
    },
  },

  cenas: {
    plano: "Centro da peça no plano de 1920x1080. Ausente = o meio.",
    listar: {
      titulo: "Listar cenas",
      descricao:
        "As cenas da campanha, na ordem da sessão: mapas (o tabuleiro com peças), quadros (cartões, " +
        "notas e ligações, como um quadro de investigação) e fundos (uma imagem para a janela do espectador). Diz qual o " +
        "mestre está editando e qual está no ar.",
    },
    ler: {
      titulo: "Ler cena",
      descricao:
        "Uma cena por dentro: o fundo e a caixa onde ele é desenhado no plano de 1920x1080, a grade, e " +
        "cada peça com o centro (x, y) e o tamanho no mesmo plano, e de quem é (personagem ou item).",
      cena: "Id ou nome da cena.",
    },
    criar: {
      titulo: "Criar cena",
      descricao:
        "Cria uma cena: um mapa, um quadro ou um fundo. Mapa e fundo podem nascer com a imagem de um " +
        "arquivo do disco. A cena entra no fim da lista e o mestre continua na cena em que estava, a " +
        "não ser que abrir seja verdadeiro.",
      tipo: "Padrão: mapa.",
      imagem: "Caminho absoluto de uma imagem para o fundo (só mapa e fundo).",
      pasta: "Pasta do painel da cena (Mapas, Fundos, ou Arquivos para o quadro). Criada se faltar.",
      abrir: "Abrir a cena no palco do mestre. Padrão: falso.",
      quadroSemFundo: "O quadro não tem fundo. Ponha a imagem num mapa ou num fundo.",
    },
    por: {
      titulo: "Pôr na cena",
      descricao:
        "Põe o token de um personagem (a miniatura dele) ou a imagem de um item numa cena, com o centro " +
        "em (x, y) no plano de 1920x1080. Use ler_cena para ver onde o mapa é desenhado. Escondida, a " +
        "peça fica só para o mestre até ele mostrar.",
      personagem: "Id ou nome do personagem. Use este ou item.",
      item: "Id ou nome do item. Use este ou personagem.",
      largura: "Largura no plano; a altura acompanha. Ausente = o tamanho que o botão da lista daria.",
      umDosDois: "Diga o personagem ou o item -- um dos dois.",
      semMiniatura: (nome: string) =>
        `${nome} não tem miniatura, a imagem do token. Dê uma com editar_personagem.`,
      itemSemImagem: (nome: string) => `O item ${nome} não tem imagem. Dê uma com editar_item.`,
    },
    ajustar: {
      titulo: "Ajustar peça",
      descricao:
        "Move, redimensiona, esconde ou mostra uma peça que já está na cena. x e y são o centro novo, " +
        "no plano de 1920x1080.",
      peca: "Id da peça, ou o nome do personagem ou item dela.",
      largura: "Largura nova; a altura acompanha.",
    },
  },

  personagens: {
    sumiu: "O personagem sumiu no meio do caminho.",
    retrato: "Caminho absoluto de uma imagem para o retrato: o rosto, de frente, que aparece na janela do espectador.",
    miniatura:
      "Caminho absoluto de uma imagem para a miniatura: o token visto no mapa, de preferência recortado.",
    medidores:
      "Números entre zero e um máximo que a mesa vê (vida, sanidade, munição). Pelo nome: o que já " +
      "existe muda, o que não existe nasce. Até 6 por personagem.",
    cor: "Cor em hex, como #ef4444.",
    atributos: "Sigla curta e um número inteiro (FOR 3, AGI -1). Pela sigla: muda ou nasce. Até 12.",
    detalhes:
      "Os detalhes da ficha: rótulo e valor curto (até 80 letras), num grupo como Identidade ou " +
      "Perícias. Pelo rótulo: muda ou nasce. Texto longo (história, aparência) vai numa nota.",
    grupo: "Ausente = o primeiro grupo do molde da campanha.",
    grupoPadrao: "Detalhes",
    listar: {
      titulo: "Listar personagens",
      descricao:
        "Os personagens da campanha (jogadores e NPCs) e os moldes do Compêndio (fichas prontas fora do " +
        "jogo, como um goblin que ainda vai aparecer), com quem joga cada um.",
    },
    ler: {
      titulo: "Ler personagem",
      descricao: "A ficha de um personagem: medidores, atributos, condições, detalhes, inventário e quem o joga.",
    },
    criar: {
      titulo: "Criar personagem",
      descricao:
        "Cria um personagem já com a ficha. Ele nasce com os medidores, atributos e detalhes de fábrica " +
        "da campanha, e o que vier aqui completa ou muda esses pelo nome. molde: verdadeiro cria no " +
        "Compêndio, fora do jogo, para o mestre pôr em jogo quantas cópias quiser.",
    },
    editar: {
      titulo: "Editar personagem",
      descricao:
        "Muda a ficha de um personagem: nome, retrato, miniatura, e medidores, atributos e detalhes " +
        "pelo nome (o que existe muda, o que falta nasce). Não remove nada.",
      nomeNovo: "O nome novo.",
    },
  },

  itens: {
    atributos:
      "Pares livres de nome e valor: \"Dano: 1d8+2 cortante\", \"Peso: 2 kg\". Valor que começa com uma " +
      "expressão de dado ganha o botão de rolar na tela. Escondido: o jogador não vê.",
    imagem: "Caminho absoluto de uma imagem do item.",
    listar: {
      titulo: "Listar itens",
      descricao:
        "O catálogo de itens da campanha, e os moldes de item do Compêndio, com quem carrega cada um e quantos.",
    },
    criar: {
      titulo: "Criar item",
      descricao:
        "Cria um item no catálogo da campanha (ou um molde no Compêndio, com molde: verdadeiro). Para " +
        "entregá-lo a alguém, use dar_item depois.",
    },
    editar: {
      titulo: "Editar item",
      descricao:
        "Muda um item do catálogo, em toda mochila que o tem: nome, descrição, imagem, e os atributos -- " +
        "que, se vierem, substituem a lista inteira.",
    },
    dar: {
      titulo: "Dar item",
      descricao:
        "Põe um item do catálogo na mochila de um personagem. Se ele já tem, soma à quantidade. " +
        "Escondido: o jogador dele não vê o item (o anel amaldiçoado que ele ainda não identificou).",
      quantidade: "Padrão: 1.",
      quantidadeInvalida: `"quantidade" é um inteiro a partir de 1.`,
    },
  },

  acervo: {
    fundoDeCena: "fundo de cena",
    personagem: "personagem",
    efeito: "efeito",
    listar: {
      titulo: "Listar arquivos",
      descricao:
        "As imagens, sons e arquivos da campanha. O que tem dono (o fundo de uma cena, o retrato de um " +
        "personagem) vem marcado: não aparece na biblioteca do mestre.",
      tipo: "Ausente = todos.",
      busca: "Parte do nome.",
    },
    importar: {
      titulo: "Importar arquivo",
      descricao:
        "Copia um arquivo do disco para a campanha: imagem (um handout, um mapa solto), som (vai para o " +
        "painel Sons) ou documento. Devolve o id. Para o fundo de uma cena ou o retrato de um " +
        "personagem, use criar_cena e editar_personagem, que já importam com o dono certo.",
      caminho: "Caminho absoluto do arquivo.",
    },
  },

  fio: {
    chegando: "O fio ainda está chegando. Tente de novo em instantes.",
    mestre: "Mestre",
    ler: {
      titulo: "Ler o fio da mesa",
      descricao:
        "As últimas mensagens e rolagens de dados da mesa, da mais antiga para a mais nova, com os " +
        "sussurros. Serve para resumir uma sessão ou saber o que acabou de acontecer.",
      quantas: (maximo: number) => `Quantas linhas, do fim. Padrão: 50; no máximo ${maximo}.`,
    },
    escrever: {
      titulo: "Escrever no fio da mesa",
      descricao:
        "Escreve uma mensagem no fio da mesa como o Mestre. Sem para, todos os jogadores veem no " +
        "celular; com para, é um sussurro só para aquele jogador.",
      texto: (maximo: number) => `Até ${maximo} letras.`,
      para: "Nome ou id de um jogador, para sussurrar.",
      longo: (maximo: number) => `O texto passa de ${maximo} letras; divida em mais de uma mensagem.`,
    },
  },
};

const en: typeof pt = {
  argumentos: {
    falta: (nome) => `Missing argument "${nome}".`,
    texto: (nome) => `"${nome}" must be text.`,
    numero: (nome) => `"${nome}" must be a number.`,
    booleano: (nome) => `"${nome}" must be true or false.`,
    lista: (nome) => `"${nome}" must be a list.`,
    objeto: (nome) => `Each item of "${nome}" must be an object.`,
    numeroOuTexto: (nome) => `"${nome}" must be a number or text.`,
    umDe: (nome, opcoes, veio) => `"${nome}" is one of: ${opcoes}. Got "${veio}".`,
  },

  protocolo: {
    feito: "Done.",
    falhou: "The tool failed.",
    metodoDesconhecido: (metodo) => `Unknown method: ${metodo}`,
    ferramentaDesconhecida: (nome) => `Unknown tool: ${nome}`,
    naoAtendeu: "The window couldn't handle the request.",
  },

  achar: {
    variosComONome: (quantos, referencia, plural, ids) =>
      `There are ${quantos} named "${referencia}" among ${plural}. Use the id: ${ids}.`,
    naoAchei: (referencia, plural, existentes) =>
      `Couldn't find "${referencia}" among ${plural}. There are: ${existentes}.`,
    eMais: (quantos) => `, and ${quantos} more`,
    nenhum: (referencia, vazio) => `Couldn't find "${referencia}": ${vazio}.`,
    personagem: { plural: "the characters", vazio: "the campaign has no characters" },
    cena: { plural: "the scenes", vazio: "the campaign has no scenes" },
    nota: { plural: "the notes", vazio: "the campaign has no notes" },
    item: { plural: "the items", vazio: "the campaign has no items" },
    jogador: { plural: "the players", vazio: "no player has joined this campaign" },
    peca: { plural: "the pieces in this scene", vazio: "the scene has no pieces" },
  },

  contexto: {
    semCampanha: "No campaign is open in ATO20. Use listar_campanhas and abrir_campanha.",
    boardNaoCarregou: "The campaign opened, but its board didn't load in time.",
    boardAusente: "The campaign board isn't loaded.",
    caminhoAbsoluto: (caminho) => `The path must be absolute: ${caminho}`,
    naoEntrou: (caminho) => `The file didn't come in: ${caminho}`,
    imagem: "image",
  },

  parametros: {
    caminhoDaImagem: "Absolute path to an image.",
    pastaDeArquivos: "Name of a folder in the Files panel. Created at the root if missing.",
    idOuNome: "Id or name.",
    molde: "Create it as a Compendium template, out of play. Default: false.",
    escondido: "Only the GM sees it.",
  },

  campanha: {
    nenhumaAberta: "No campaign is open. Use abrir_campanha with the folder of a recent one.",
    naoAbriu: "The campaign didn't open.",
    ocupado: "ATO20 is in the middle of opening something else. Try again in a moment.",
    campanha: {
      titulo: "Open campaign",
      descricao:
        "Tells which campaign is open in ATO20 and what it has: how many scenes of each kind, notes, " +
        "characters, items and images, the scene the GM is editing and the one on the spectator window. Start here. " +
        "With no campaign open, returns the recent ones.",
    },
    listar: {
      titulo: "List campaigns",
      descricao:
        "The campaigns this ATO20 has opened, most recent first, with each one's folder. An ATO20 " +
        "campaign is a folder on disk.",
    },
    abrir: {
      titulo: "Open a campaign",
      descricao:
        "Opens in ATO20 the campaign in the given folder, closing the open one (anything pending is " +
        "saved first). The spectator window and the phones switch to the new campaign.",
      pasta: "Absolute path to the campaign folder.",
    },
    criar: {
      titulo: "Create campaign",
      descricao:
        "Creates a new, empty campaign in a new folder inside pasta_mae (the folder name comes from the " +
        "campaign name), and opens it in ATO20 in place of the open one.",
      nome: "The campaign name.",
      pastaMae: "Absolute path to the folder where the campaign folder will be created.",
    },
  },

  notas: {
    listar: {
      titulo: "List notes",
      descricao:
        "The campaign's Markdown notes (Files panel), with id, title and folder. The panel sorts notes " +
        "by title, so a story in parts gets a number in the title (\"1. The arrival\").",
    },
    ler: {
      titulo: "Read note",
      descricao: "The whole text of a note, in Markdown.",
      nota: "Note id or title.",
    },
    criar: {
      titulo: "Create note",
      descricao:
        "Creates a Markdown note in the Files panel with the given text. For the campaign story, a " +
        "session recap, hooks, rumors, place descriptions. Returns the id.",
      tituloDaNota: "The title, which is what the list shows.",
      texto: "The body, in Markdown.",
    },
    editar: {
      titulo: "Edit note",
      descricao:
        "Changes a note: the title, the folder, and the text -- replaced whole (texto) or added at the " +
        "end (acrescentar). Don't use both at once.",
      tituloNovo: "The new title.",
      texto: "The new text, replacing the current one entirely.",
      acrescentar: "Text to add at the end, after a blank line.",
      textoOuAcrescentar: "Use texto (replaces everything) or acrescentar (adds at the end), not both.",
    },
  },

  cenas: {
    plano: "Center of the piece on the 1920x1080 plane. Missing = the middle.",
    listar: {
      titulo: "List scenes",
      descricao:
        "The campaign scenes, in session order: maps (the board with pieces), boards (cards, notes and " +
        "links, like an investigation board) and backdrops (an image for the spectator window). Tells which one the " +
        "GM is editing and which is on the air.",
    },
    ler: {
      titulo: "Read scene",
      descricao:
        "A scene from the inside: the background and the box where it's drawn on the 1920x1080 plane, " +
        "the grid, and each piece with its center (x, y) and size on the same plane, and whose it is " +
        "(character or item).",
      cena: "Scene id or name.",
    },
    criar: {
      titulo: "Create scene",
      descricao:
        "Creates a scene: a map, a board or a backdrop. Maps and backdrops can start with the image of " +
        "a file on disk. The scene goes to the end of the list and the GM stays on the scene they were " +
        "on, unless abrir is true.",
      tipo: "Default: mapa.",
      imagem: "Absolute path to an image for the background (map and backdrop only).",
      pasta: "Folder in the scene's panel (Maps, Backdrops, or Files for a board). Created if missing.",
      abrir: "Open the scene on the GM's stage. Default: false.",
      quadroSemFundo: "A board has no background. Put the image on a map or a backdrop.",
    },
    por: {
      titulo: "Place on scene",
      descricao:
        "Places a character's token (their miniature) or an item's image on a scene, centered at (x, y) " +
        "on the 1920x1080 plane. Use ler_cena to see where the map is drawn. When hidden, only the GM " +
        "sees the piece until they reveal it.",
      personagem: "Character id or name. Use this or item.",
      item: "Item id or name. Use this or personagem.",
      largura: "Width on the plane; the height follows. Missing = the size the list button would give.",
      umDosDois: "Give the character or the item -- one of the two.",
      semMiniatura: (nome) => `${nome} has no miniature, the token image. Give one with editar_personagem.`,
      itemSemImagem: (nome) => `The item ${nome} has no image. Give one with editar_item.`,
    },
    ajustar: {
      titulo: "Adjust piece",
      descricao:
        "Moves, resizes, hides or reveals a piece already on the scene. x and y are the new center, on " +
        "the 1920x1080 plane.",
      peca: "Piece id, or the name of its character or item.",
      largura: "New width; the height follows.",
    },
  },

  personagens: {
    sumiu: "The character vanished midway.",
    retrato: "Absolute path to an image for the portrait: the face, from the front, shown on the spectator window.",
    miniatura: "Absolute path to an image for the miniature: the token seen on the map, ideally cut out.",
    medidores:
      "Numbers between zero and a maximum that the table sees (health, sanity, ammo). By name: what " +
      "exists changes, what doesn't is created. Up to 6 per character.",
    cor: "Hex color, like #ef4444.",
    atributos: "A short abbreviation and an integer (STR 3, AGI -1). By abbreviation: changes or is created. Up to 12.",
    detalhes:
      "The sheet details: label and a short value (up to 80 characters), in a group like Identity or " +
      "Skills. By label: changes or is created. Long text (backstory, looks) goes in a note.",
    grupo: "Missing = the first group of the campaign template.",
    grupoPadrao: "Details",
    listar: {
      titulo: "List characters",
      descricao:
        "The campaign characters (players and NPCs) and the Compendium templates (ready sheets out of " +
        "play, like a goblin that will show up later), with who plays each one.",
    },
    ler: {
      titulo: "Read character",
      descricao: "A character's sheet: meters, attributes, conditions, details, inventory and who plays them.",
    },
    criar: {
      titulo: "Create character",
      descricao:
        "Creates a character with their sheet. They start with the campaign's default meters, " +
        "attributes and details, and what comes here adds to or changes those by name. molde: true " +
        "creates it in the Compendium, out of play, for the GM to bring in as many copies as they want.",
    },
    editar: {
      titulo: "Edit character",
      descricao:
        "Changes a character's sheet: name, portrait, miniature, and meters, attributes and details by " +
        "name (what exists changes, what's missing is created). Removes nothing.",
      nomeNovo: "The new name.",
    },
  },

  itens: {
    atributos:
      "Free name and value pairs: \"Damage: 1d8+2 slashing\", \"Weight: 2 kg\". A value that starts with " +
      "a dice expression gets the roll button on screen. Hidden: the player doesn't see it.",
    imagem: "Absolute path to an image of the item.",
    listar: {
      titulo: "List items",
      descricao:
        "The campaign item catalog, and the Compendium item templates, with who carries each one and how many.",
    },
    criar: {
      titulo: "Create item",
      descricao:
        "Creates an item in the campaign catalog (or a Compendium template, with molde: true). To hand " +
        "it to someone, use dar_item afterwards.",
    },
    editar: {
      titulo: "Edit item",
      descricao:
        "Changes a catalog item, in every backpack that has it: name, description, image, and the " +
        "attributes -- which, when given, replace the whole list.",
    },
    dar: {
      titulo: "Give item",
      descricao:
        "Puts a catalog item in a character's backpack. If they already have it, adds to the quantity. " +
        "Hidden: their player doesn't see the item (the cursed ring they haven't identified yet).",
      quantidade: "Default: 1.",
      quantidadeInvalida: `"quantidade" is an integer starting at 1.`,
    },
  },

  acervo: {
    fundoDeCena: "scene background",
    personagem: "character",
    efeito: "effect",
    listar: {
      titulo: "List files",
      descricao:
        "The campaign's images, sounds and files. What has an owner (a scene background, a character " +
        "portrait) is marked: it doesn't show in the GM's library.",
      tipo: "Missing = all.",
      busca: "Part of the name.",
    },
    importar: {
      titulo: "Import file",
      descricao:
        "Copies a file from disk into the campaign: an image (a handout, a loose map), a sound (goes to " +
        "the Sounds panel) or a document. Returns the id. For a scene background or a character " +
        "portrait, use criar_cena and editar_personagem, which import with the right owner.",
      caminho: "Absolute path to the file.",
    },
  },

  fio: {
    chegando: "The chat is still loading. Try again in a moment.",
    mestre: "GM",
    ler: {
      titulo: "Read the table chat",
      descricao:
        "The latest messages and dice rolls at the table, oldest first, including whispers. Useful to " +
        "recap a session or to know what just happened.",
      quantas: (maximo) => `How many lines, from the end. Default: 50; at most ${maximo}.`,
    },
    escrever: {
      titulo: "Write in the table chat",
      descricao:
        "Writes a message in the table chat as the GM. Without para, every player sees it on their " +
        "phone; with para, it's a whisper to that player only.",
      texto: (maximo) => `Up to ${maximo} characters.`,
      para: "Name or id of a player, to whisper.",
      longo: (maximo) => `The text is over ${maximo} characters; split it into more than one message.`,
    },
  },
};

export const dicionarios = { "pt-BR": pt, en };

export const t = escolher(dicionarios);
