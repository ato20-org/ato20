import { escolher } from "@/lib/i18n/idioma";

/**
 * O texto do celular do jogador -- `components/jogador`, `lib/player` e os
 * stores dele -- e da porta do código, que o espectador também usa. Vai no
 * bundle do celular: não importa dicionário do Mestre.
 */
const pt = {
  porta: {
    tituloJogador: "Entrar na mesa",
    tituloEspectador: "Espectador",
    mesaPadrao: "Mesa",
    procurando: "Procurando a mesa",
    instrucao: "Digite o código que o mestre está mostrando na tela dele.",
    codigo: "Código da mesa",
    entrar: "Entrar",
  },

  /** As respostas do `checkRoom`, antes de o fluxo abrir. */
  sala: {
    codigoNaoConfere: "Código não confere com esta mesa.",
    semCampanha: "O mestre ainda não abriu uma campanha.",
    respostaInesperada: "A mesa respondeu de um jeito inesperado.",
    inalcancavel: "Não foi possível alcançar a mesa. Confira o Wi-Fi e o endereço.",
  },

  /**
   * As mensagens de reserva das rotas `/eu`, quando o daemon não mandou corpo,
   * e as falhas genéricas dos stores.
   */
  erros: {
    semMesa: "Falha ao falar com a mesa",
    entrar: "Não foi possível entrar na mesa.",
    abrirFicha: "Não foi possível abrir a ficha.",
    gravar: "Não foi possível gravar.",
    listarAnexos: "Não foi possível listar os anexos.",
    enviar: (arquivo: string) => `Não foi possível enviar ${arquivo}.`,
    removerAnexo: "Não foi possível remover o anexo.",
    abrirAnexo: "Não foi possível abrir o anexo.",
    listarPersonagens: "Não foi possível listar os personagens.",
    listarArquivos: "Não foi possível listar os arquivos.",
    removerArquivo: "Não foi possível remover o arquivo.",
    abrirArquivo: "Não foi possível abrir o arquivo.",
    abrirMiniatura: "Não foi possível abrir a miniatura.",
    lerNota: "Não foi possível ler a nota.",
    gravarNota: "Não foi possível gravar a nota.",
    abrirCaderno: "Não foi possível abrir o caderno.",
    abrirNota: "Não foi possível abrir a nota.",
    apagarNota: "Não foi possível apagar a nota.",
    lerMesa: "Não foi possível ler a mesa.",
    lerPlugins: "Não foi possível ler os dados dos plugins.",
    acaoNaoChegou: "A mesa não recebeu a ação.",
    mensagemNaoChegou: "A mesa não recebeu a mensagem.",
    lerInventario: "Não foi possível ler o inventário.",
    criarItem: "Não foi possível criar o item.",
    salvarItem: "Não foi possível salvar o item.",
    removerItem: "Não foi possível remover o item.",
    pingNaoChegou: "a mesa não recebeu o ping",
    dadoNaoChegou: "a mesa não recebeu o dado",
    falhaRemover: "Falha ao remover.",
    falhaSalvar: "Falha ao salvar.",
    falhaEnviar: "Falha ao enviar.",
  },

  entrada: {
    tentarDeNovo: "Tentar de novo",
    quemJoga: "Quem está jogando?",
    explicacao:
      "O nome é só para o mestre saber quem é quem. Não há cadastro: este aparelho guarda a credencial, e é ela que mantém a tua ficha separada da dos outros.",
    teuNome: "Teu nome",
    entrar: "Entrar na mesa",
  },

  menu: {
    conta: "Tua conta nesta mesa",
    mudarNome: "Mudar de nome",
    sair: "Sair da mesa",
    sairTitulo: "Sair desta mesa?",
    sairExplicacao:
      "Este aparelho esquece a credencial e volta a pedir um nome. O que você já mandou para a mesa fica lá, mas entrar de novo cria um jogador novo — o mestre precisa te ligar de volta ao teu personagem.",
    sairConfirmar: "Sair",
    renomearExplicacao:
      "É o nome que o mestre vê na lista da mesa. Trocar não mexe no teu personagem.",
    teuNome: "Teu nome",
    salvar: "Salvar",
    idioma: "Idioma · Language",
  },

  /** As ferramentas das docas da tela deitada e as abas da tela em pé. */
  ferramentas: {
    personagem: "Personagem",
    inventario: "Inventário",
    arquivos: "Arquivos",
    saquinho: "Saquinho",
    chat: "Chat",
    anotacoes: "Anotações",
  },

  /** O botão da doca e o da barra de baixo, com o ponto de "há o que ler". */
  barra: {
    comAviso: (rotulo: string) => `${rotulo}, há mensagem nova`,
  },

  palco: {
    nadaNoAr: "O mestre não colocou nada no ar.",
    semResposta: "Sem resposta do mestre. Ele precisa estar com a tela do Mestre aberta.",
    aguardando: "Aguardando o mestre…",
    sairDaTelaCheia: "Sair da tela cheia",
    telaCheia: "Tela cheia",
  },

  cena: {
    pingNaoChegou: "O ping não chegou à mesa.",
  },

  dados: {
    naoRecebeu: "A mesa não recebeu o dado",
  },

  saquinho: {
    fechar: "Fechar o saquinho",
    abrir: "Saquinho de dados",
    titulo: "Saquinho",
    ajuda:
      "Arraste um dado para a tela e solte — quanto mais forte, mais longe ele rola. Toque para jogar no meio.",
    naTela: "Na tela",
    recolher: (n: number) => (n === 1 ? "Recolher o dado" : `Recolher os ${n} dados`),
  },

  plugins: {
    naoRecebeu: "A mesa não recebeu.",
  },

  chat: {
    vazio:
      "Ninguém escreveu nem rolou nada ainda. O que a mesa disser aqui fica guardado na campanha.",
    abrindo: "Abrindo a conversa da mesa…",
    soParaOMestre: "Só para o Mestre",
    escreverParaAMesa: "Escrever para a mesa",
  },

  caderno: {
    semTitulo: "Sem título",
    titulo: "Caderno",
    novaNota: "Nova nota",
    procurar: "Procurar no caderno",
    abrindo: "Abrindo o caderno…",
    vazio:
      "Nada escrito ainda. O que você descobrir, quem mentiu, o que não pode esquecer.",
    nenhuma: "Nenhuma nota com isso.",
    voltar: "Voltar para o caderno",
    gravando: "Gravando",
    naoGravou: "Não gravou",
    gravado: "Gravado",
    apagar: "Apagar esta nota",
    apagada: "Nota apagada.",
    tituloDaNota: "Título da nota",
    dicaDoTexto: "@personagem  /arquivo  #nota  **negrito**",
    tocarParaEscrever:
      "Toque para escrever. {arroba} chama um personagem da mesa, {barra} um arquivo seu, {cerquilha} outra nota.",
    completa: (resto: string) => `Enter completa ${resto}`,
    tirarEtiqueta: (etiqueta: string) => `Tirar a etiqueta ${etiqueta}`,
    novaEtiqueta: "etiqueta",
    etiqueta: "Etiqueta",
  },

  /** O título da lista de sugestões, por sinal da nota. Ver `TITULO_DA_NOTA`. */
  mencoes: {
    personagens: "Personagens da mesa",
    arquivos: "Seus arquivos",
    notas: "Notas do caderno",
  },

  notaTexto: {
    personagemDe: (nome: string, dono: string) => `${nome} — ${dono}`,
    arquivoDe: (arquivo: string, personagem: string) => `${arquivo} — ${personagem}`,
    abrirNota: (titulo: string) => `Abrir a nota ${titulo}`,
    naoResolvido: (alvo: string) => `Nenhum ${alvo} com esse nome`,
    alvoPersonagem: "personagem na mesa",
    alvoArquivo: "arquivo seu",
    alvoNota: "nota sua",
  },

  inventario: {
    itemSemNome: "Item sem nome",
    falhaCriar: "Falha ao criar o item.",
    falhaFoto: "Falha ao enviar a foto.",
    titulo: "Inventário",
    item: "Item",
    adicionar: "Adicionar item",
    descricaoMeu: "Nome, descrição, quantidade e foto do item.",
    descricaoDoMestre: "O que o mestre pôs no inventário.",
    trocarFoto: "Trocar a foto do item",
    escolherFoto: "Escolher a foto do item",
    trocar: "Trocar",
    porFoto: "Pôr foto",
    enviando: "Enviando…",
    nome: "Nome do item",
    quantidade: "Quantidade",
    descricaoDica: "O que é, o que faz, de onde veio.",
    descricao: "Descrição do item",
    remover: "Remover",
    doMestre: "Este item foi o mestre que pôs aqui.",
  },

  personagens: {
    lendo: "Lendo…",
    nenhum:
      "Nenhum personagem ainda. O mestre é quem entrega um a você — quando isso acontecer, a ficha e os arquivos dele aparecem aqui.",
    sobre: (nome: string) => `Sobre ${nome}`,
    miniatura: "Miniatura",
    retrato: "Retrato",
    ampliarImagem: (nome: string) => `Ampliar a imagem de ${nome}`,
    medidores: "Medidores",
    atributos: "Atributos",
    condicoes: "Condições",
    arquivosDoPersonagem: "Arquivos do personagem",
    ficha: "Ficha",
    ampliar: (titulo: string) => `Ampliar ${titulo}`,
    doMestre: "Do mestre",
    seusArquivos: "Seus arquivos",
    passaDoLimite: (limite: string) => `Passa do limite de ${limite}.`,
    enviando: "Enviando…",
    dispensar: (arquivo: string) => `Dispensar o aviso de ${arquivo}`,
    nadaAinda: "Nada ainda. O que você mandar daqui fica com o personagem, e o mestre vê.",
    enviarArquivo: "Enviar arquivo",
    apagar: (arquivo: string) => `Apagar ${arquivo}`,
    abrir: (arquivo: string) => `Abrir ${arquivo}`,
    suasAnotacoes: "Suas anotações",
    anotacoesDica: "O que você descobriu, o que quer lembrar.",
    naoGravouAnotacao: "Não foi possível gravar a anotação.",
  },
};

const en: typeof pt = {
  porta: {
    tituloJogador: "Join the table",
    tituloEspectador: "Spectator",
    mesaPadrao: "Table",
    procurando: "Looking for the table",
    instrucao: "Enter the code the GM is showing on their screen.",
    codigo: "Table code",
    entrar: "Join",
  },

  sala: {
    codigoNaoConfere: "That code doesn't match this table.",
    semCampanha: "The GM hasn't opened a campaign yet.",
    respostaInesperada: "The table sent an unexpected response.",
    inalcancavel: "Couldn't reach the table. Check the Wi-Fi and the address.",
  },

  erros: {
    semMesa: "Failed to reach the table",
    entrar: "Couldn't join the table.",
    abrirFicha: "Couldn't open your sheet.",
    gravar: "Couldn't save.",
    listarAnexos: "Couldn't list the attachments.",
    enviar: (arquivo) => `Couldn't upload ${arquivo}.`,
    removerAnexo: "Couldn't remove the attachment.",
    abrirAnexo: "Couldn't open the attachment.",
    listarPersonagens: "Couldn't list the characters.",
    listarArquivos: "Couldn't list the files.",
    removerArquivo: "Couldn't remove the file.",
    abrirArquivo: "Couldn't open the file.",
    abrirMiniatura: "Couldn't open the thumbnail.",
    lerNota: "Couldn't read the note.",
    gravarNota: "Couldn't save the note.",
    abrirCaderno: "Couldn't open the notebook.",
    abrirNota: "Couldn't open the note.",
    apagarNota: "Couldn't delete the note.",
    lerMesa: "Couldn't read the table.",
    lerPlugins: "Couldn't read the plugin data.",
    acaoNaoChegou: "The table didn't get the action.",
    mensagemNaoChegou: "The table didn't get the message.",
    lerInventario: "Couldn't read the inventory.",
    criarItem: "Couldn't create the item.",
    salvarItem: "Couldn't save the item.",
    removerItem: "Couldn't remove the item.",
    pingNaoChegou: "the table didn't get the ping",
    dadoNaoChegou: "the table didn't get the die",
    falhaRemover: "Failed to remove.",
    falhaSalvar: "Failed to save.",
    falhaEnviar: "Failed to upload.",
  },

  entrada: {
    tentarDeNovo: "Try again",
    quemJoga: "Who's playing?",
    explicacao:
      "Your name is just so the GM knows who's who. There's no sign-up: this device keeps the credential, and that's what keeps your sheet separate from everyone else's.",
    teuNome: "Your name",
    entrar: "Join the table",
  },

  menu: {
    conta: "Your account at this table",
    mudarNome: "Change name",
    sair: "Leave the table",
    sairTitulo: "Leave this table?",
    sairExplicacao:
      "This device forgets the credential and asks for a name again. What you already sent to the table stays there, but joining again creates a new player, and the GM has to link you back to your character.",
    sairConfirmar: "Leave",
    renomearExplicacao:
      "This is the name the GM sees in the table's list. Changing it doesn't affect your character.",
    teuNome: "Your name",
    salvar: "Save",
    idioma: "Language · Idioma",
  },

  ferramentas: {
    personagem: "Character",
    inventario: "Inventory",
    arquivos: "Files",
    saquinho: "Dice bag",
    chat: "Chat",
    anotacoes: "Notes",
  },

  barra: {
    comAviso: (rotulo) => `${rotulo}, new message`,
  },

  palco: {
    nadaNoAr: "The GM hasn't put anything on air.",
    semResposta: "No response from the GM. They need to have the GM screen open.",
    aguardando: "Waiting for the GM…",
    sairDaTelaCheia: "Exit full screen",
    telaCheia: "Full screen",
  },

  cena: {
    pingNaoChegou: "The ping didn't reach the table.",
  },

  dados: {
    naoRecebeu: "The table didn't get the die",
  },

  saquinho: {
    fechar: "Close the dice bag",
    abrir: "Dice bag",
    titulo: "Dice bag",
    ajuda:
      "Drag a die onto the screen and let go: the harder you throw, the farther it rolls. Tap to roll in the middle.",
    naTela: "On screen",
    recolher: (n) => (n === 1 ? "Pick up the die" : `Pick up the ${n} dice`),
  },

  plugins: {
    naoRecebeu: "The table didn't get it.",
  },

  chat: {
    vazio:
      "Nobody has written or rolled anything yet. What the table says here is kept in the campaign.",
    abrindo: "Opening the table chat…",
    soParaOMestre: "GM only",
    escreverParaAMesa: "Write to the table",
  },

  caderno: {
    semTitulo: "Untitled",
    titulo: "Notebook",
    novaNota: "New note",
    procurar: "Search the notebook",
    abrindo: "Opening the notebook…",
    vazio: "Nothing written yet. What you find out, who lied, what you can't forget.",
    nenhuma: "No notes match that.",
    voltar: "Back to the notebook",
    gravando: "Saving",
    naoGravou: "Not saved",
    gravado: "Saved",
    apagar: "Delete this note",
    apagada: "Note deleted.",
    tituloDaNota: "Note title",
    dicaDoTexto: "@character  /file  #note  **bold**",
    tocarParaEscrever:
      "Tap to write. {arroba} calls a character at the table, {barra} one of your files, {cerquilha} another note.",
    completa: (resto) => `Enter completes ${resto}`,
    tirarEtiqueta: (etiqueta) => `Remove the tag ${etiqueta}`,
    novaEtiqueta: "tag",
    etiqueta: "Tag",
  },

  mencoes: {
    personagens: "Characters at the table",
    arquivos: "Your files",
    notas: "Notebook notes",
  },

  notaTexto: {
    personagemDe: (nome, dono) => `${nome} (${dono})`,
    arquivoDe: (arquivo, personagem) => `${arquivo} (${personagem})`,
    abrirNota: (titulo) => `Open the note ${titulo}`,
    naoResolvido: (alvo) => `No ${alvo} with that name`,
    alvoPersonagem: "character at the table",
    alvoArquivo: "file of yours",
    alvoNota: "note of yours",
  },

  inventario: {
    itemSemNome: "Unnamed item",
    falhaCriar: "Failed to create the item.",
    falhaFoto: "Failed to upload the photo.",
    titulo: "Inventory",
    item: "Item",
    adicionar: "Add item",
    descricaoMeu: "The item's name, description, quantity and photo.",
    descricaoDoMestre: "What the GM put in the inventory.",
    trocarFoto: "Change the item photo",
    escolherFoto: "Choose the item photo",
    trocar: "Change",
    porFoto: "Add photo",
    enviando: "Uploading…",
    nome: "Item name",
    quantidade: "Quantity",
    descricaoDica: "What it is, what it does, where it came from.",
    descricao: "Item description",
    remover: "Remove",
    doMestre: "The GM put this item here.",
  },

  personagens: {
    lendo: "Loading…",
    nenhum:
      "No characters yet. The GM is the one who gives you one; when that happens, its sheet and files show up here.",
    sobre: (nome) => `About ${nome}`,
    miniatura: "Token",
    retrato: "Portrait",
    ampliarImagem: (nome) => `Enlarge ${nome}'s image`,
    medidores: "Meters",
    atributos: "Attributes",
    condicoes: "Conditions",
    arquivosDoPersonagem: "Character files",
    ficha: "Sheet",
    ampliar: (titulo) => `Enlarge ${titulo}`,
    doMestre: "From the GM",
    seusArquivos: "Your files",
    passaDoLimite: (limite) => `Over the ${limite} limit.`,
    enviando: "Uploading…",
    dispensar: (arquivo) => `Dismiss the warning for ${arquivo}`,
    nadaAinda: "Nothing yet. What you upload from here stays with the character, and the GM sees it.",
    enviarArquivo: "Upload file",
    apagar: (arquivo) => `Delete ${arquivo}`,
    abrir: (arquivo) => `Open ${arquivo}`,
    suasAnotacoes: "Your notes",
    anotacoesDica: "What you found out, what you want to remember.",
    naoGravouAnotacao: "Couldn't save the note.",
  },
};

export const dicionarios = { "pt-BR": pt, en };

export const t = escolher(dicionarios);
