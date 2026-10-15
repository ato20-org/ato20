import { escolher } from "@/lib/i18n/idioma";

/**
 * O texto das cenas no Mestre: a lista de mapas e fundos, o diálogo do mapa
 * novo, o indicador do que está no ar, o palco vazio e os nomes que uma cena
 * ganha ao nascer.
 */
const pt = {
  /** O que mais de um componente desta área escreve igual. */
  geral: {
    colocarNoAr: "Colocar no ar",
    falhaAoImportar: "Falha ao importar.",
  },

  /**
   * Como cada tipo se chama: o rótulo e o começo do nome da cena que o mestre
   * não batiza. A chave é o tipo; só o texto muda com o idioma. Ver
   * `NOME_DO_TIPO`.
   */
  tipos: {
    mapa: "Mapa",
    fundo: "Fundo",
    quadro: "Quadro",
  },

  /**
   * Os nomes que o aplicativo dá à cena que cria, e que viram dado: nascem no
   * idioma de quem cria, e o que já está salvo fica como foi salvo.
   */
  nomesPadrao: {
    /** "Mapa 2": o nome do tipo e a posição entre as do mesmo tipo. */
    cena: (tipo: string, n: number) => `${tipo} ${n}`,
    copia: (nome: string) => `${nome} (cópia)`,
  },

  /** Os erros do store da campanha que a tela mostra. */
  sceneStore: {
    falhaAoAbrir: "Falha ao abrir o board",
  },

  /**
   * As abas Mapas e Fundos. `nome` é o tipo em minúsculas ("mapa", "fundo"),
   * e o plural se faz com "s" nos dois idiomas.
   */
  sceneList: {
    abaMapas: "Mapas",
    abaFundos: "Fundos",
    mostrarCameras: "Mostrar as câmeras",
    esconderCameras: "Esconder as câmeras",
    camerasDe: (nome: string) => `Câmeras de ${nome}`,
    abrirNaCamera: (nome: string) => `Abrir em ${nome}`,
    semFotoAinda: "Sem foto ainda: ela sai quando a cena for aberta.",
    contarItens: (n: number) => `${n} itens`,
    contarAreas: (n: number) => `${n} áreas`,
    semImagem: "sem imagem",
    novoAqui: (nome: string) => `Novo ${nome} aqui`,
    buscarPlaceholder: (nome: string) => `Buscar ${nome}`,
    buscarRotulo: (nome: string) => `Buscar nos ${nome}s pelo nome`,
    novaPasta: "Nova pasta",
    novaPastaDica: (nome: string) => `Nova pasta. Arraste ${nome}s para dentro.`,
    novo: (nome: string) => `Novo ${nome}`,
    vazio: (nome: string) => `Crie o primeiro ${nome}`,
    nadaCom: (termo: string) => `Nada com “${termo}”.`,
    renomear: "Renomear",
    duplicar: "Duplicar",
    importandoFundo: "Importando o fundo…",
    importandoFundoRotulo: "Importando o fundo",
    trocarFundo: "Trocar o fundo",
    escolherFundo: "Escolher o fundo",
    tirarFundo: "Tirar o fundo",
    deixarDeSerCapa: "Deixar de ser capa",
    usarComoCapa: "Usar como capa",
    remover: "Remover",
    /** Depois do nome da cena, num " · ". */
    noAr: "no ar",
    capa: "capa",
    colocarNomeNoAr: (nome: string) => `Colocar ${nome} no ar`,
    abreEPassa: (tipo: string) => `Abre este ${tipo} e passa a mesa para ele.`,
    opcoesDe: (nome: string) => `Opções de ${nome}`,
    removerTitulo: (nome: string) => `Deseja remover ${nome}?`,
    removerTokens: "Tokens e imagens",
    removerAreas: "Áreas escondidas",
    removerCameras: "Câmeras salvas",
    removerAnotacoes: "Postits e anotações",
  },

  /** O indicador do que a mesa vê, na barra de cima. */
  onAirControl: {
    capa: "Capa",
    foraDoAr: "Fora do ar",
    mesaVendo: (nome: string) => `A mesa está vendo "${nome}".`,
    mesaVendoCapa: (nome: string) => `Nada no ar: a mesa está vendo a capa, "${nome}".`,
    mesaSemMapa: "A mesa não está vendo mapa nenhum.",
    sairDoAr: "Sair do ar",
    sairDoArComCapa: "Tira a cena do ar e deixa a capa da campanha na tela.",
    sairDoArSemCapa: "Tira a mesa do ar. Útil em intervalo.",
  },

  /** O passo seguinte a "Novo mapa": de onde vem o chão. */
  novoMapaDialog: {
    titulo: "Novo mapa",
    descricao: "De onde vem o chão deste mapa? Dá para trocar depois, no menu do mapa.",
    umaImagem: "Uma imagem",
    umaImagemDica: "Escolha o arquivo do mapa. Ele entra na campanha e vira o fundo.",
    semMapa: "Sem mapa",
    semMapaDica: "Tabuleiro preto com grade. Escolha quantos quadrados cabem na largura.",
    quadradosNaLargura: "Quadrados na largura",
    criarTabuleiro: "Criar tabuleiro",
  },

  /**
   * O palco sem cena. Os atalhos que já existem na tabela vêm de
   * `t.atalhos` em `bancada.ts`; aqui só os que se escrevem diferente.
   */
  mestreShell: {
    carregando: "Carregando…",
    vazio: "Abra um mapa ou um arquivo para visualizar aqui",
    atalhos: {
      /** A tecla, que aqui tem palavra. */
      espacoArrastar: "Espaço + arrastar",
      moverPalco: "Mover o palco",
      aproximarEAfastar: "Aproximar e afastar a câmera",
      transmitirCamera: "Transmitir a câmera selecionada",
    },
  },
};

const en: typeof pt = {
  geral: {
    colocarNoAr: "Put on air",
    falhaAoImportar: "Import failed.",
  },

  tipos: {
    mapa: "Map",
    fundo: "Backdrop",
    quadro: "Board",
  },

  nomesPadrao: {
    cena: (tipo, n) => `${tipo} ${n}`,
    copia: (nome) => `${nome} (copy)`,
  },

  sceneStore: {
    falhaAoAbrir: "Could not open the campaign's scenes",
  },

  sceneList: {
    abaMapas: "Maps",
    abaFundos: "Backdrops",
    mostrarCameras: "Show cameras",
    esconderCameras: "Hide cameras",
    camerasDe: (nome) => `Cameras of ${nome}`,
    abrirNaCamera: (nome) => `Open at ${nome}`,
    semFotoAinda: "No snapshot yet: it is taken when the scene is opened.",
    contarItens: (n) => (n === 1 ? "1 item" : `${n} items`),
    contarAreas: (n) => (n === 1 ? "1 fog area" : `${n} fog areas`),
    semImagem: "no image",
    novoAqui: (nome) => `New ${nome} here`,
    buscarPlaceholder: (nome) => `Search ${nome}s`,
    buscarRotulo: (nome) => `Search ${nome}s by name`,
    novaPasta: "New folder",
    novaPastaDica: (nome) => `New folder. Drag ${nome}s into it.`,
    novo: (nome) => `New ${nome}`,
    vazio: (nome) => `Create your first ${nome}`,
    nadaCom: (termo) => `Nothing matches “${termo}”.`,
    renomear: "Rename",
    duplicar: "Duplicate",
    importandoFundo: "Importing the background…",
    importandoFundoRotulo: "Importing the background",
    trocarFundo: "Change the background",
    escolherFundo: "Choose the background",
    tirarFundo: "Remove the background",
    deixarDeSerCapa: "Stop using as cover",
    usarComoCapa: "Use as cover",
    remover: "Remove",
    noAr: "on air",
    capa: "cover",
    colocarNomeNoAr: (nome) => `Put ${nome} on air`,
    abreEPassa: (tipo) => `Opens this ${tipo} and switches the table to it.`,
    opcoesDe: (nome) => `Options for ${nome}`,
    removerTitulo: (nome) => `Remove ${nome}?`,
    removerTokens: "Tokens and images",
    removerAreas: "Hidden areas",
    removerCameras: "Saved cameras",
    removerAnotacoes: "Sticky notes and pins",
  },

  onAirControl: {
    capa: "Cover",
    foraDoAr: "Off air",
    mesaVendo: (nome) => `The table is seeing "${nome}".`,
    mesaVendoCapa: (nome) => `Nothing on air: the table is seeing the cover, "${nome}".`,
    mesaSemMapa: "The table is not seeing any map.",
    sairDoAr: "Take off air",
    sairDoArComCapa: "Takes the scene off air and leaves the campaign cover on screen.",
    sairDoArSemCapa: "Takes the table off air. Handy during a break.",
  },

  novoMapaDialog: {
    titulo: "New map",
    descricao: "Where does this map's ground come from? You can change it later in the map's menu.",
    umaImagem: "An image",
    umaImagemDica: "Choose the map file. It joins the campaign and becomes the background.",
    semMapa: "No map",
    semMapaDica: "Plain black with a grid. Choose how many squares fit across.",
    quadradosNaLargura: "Squares across",
    criarTabuleiro: "Create grid",
  },

  mestreShell: {
    carregando: "Loading…",
    vazio: "Open a map or a file to view it here",
    atalhos: {
      espacoArrastar: "Space + drag",
      moverPalco: "Pan the stage",
      aproximarEAfastar: "Zoom the camera in and out",
      transmitirCamera: "Put the selected camera on air",
    },
  },
};

export const dicionarios = { "pt-BR": pt, en };

export const t = escolher(dicionarios);
