import { escolher } from "@/lib/i18n/idioma";

/**
 * O texto da moldura do aplicativo: barra da janela, Configurações, novidades
 * e volume -- `components/desktop`.
 */
const pt = {
  janela: {
    editando: (cena: string) => `Editando ${cena}`,
    minimizar: "Minimizar",
    maximizar: "Maximizar",
    restaurar: "Restaurar",
    fechar: "Fechar",
    confirmarFechar: "Fechar o ATO20?",
    confirmarFecharExplicacao:
      "A campanha fecha junto, e a TV e os celulares perdem a conexão com a mesa.",
  },

  configuracoes: {
    titulo: "Configurações",
    descricao: "Configurações gerais do ATO20.",
    secoes: {
      geral: "Geral",
      ajustes: "Ajustes",
      versao: "Versão",
      teclado: "Teclado",
      plugins: "Plugins",
    },
    ajustesAjuda:
      "O que o ATO20 e os plugins deixam ajustar, por máquina e por campanha. A campanha vence.",
    zoom: {
      titulo: "Zoom da interface",
      explicacao:
        "Escala a janela inteira, o palco incluído. A câmera sobre o mapa continua no zoom dela.",
      diminuir: "Diminuir o zoom da interface",
      aumentar: "Aumentar o zoom da interface",
    },
    tema: {
      titulo: "Tema",
      explicacao:
        "Só o escuro, por ora: a ferramenta roda em mesa com luz baixa e projetada em TV, onde fundo claro ofusca.",
      escuro: "Escuro",
      padrao: "padrão",
    },
    idioma: {
      titulo: "Idioma",
      explicacao:
        "Trocar reinicia a janela. A campanha aberta volta sozinha, e a TV e os celulares acompanham.",
      doSistema: (nome: string) => `Do sistema (${nome})`,
    },
    versao: {
      titulo: (versao: string) => `Versão ${versao}`,
      ajuda: "Histórico de versões do ATO20",
      avisar: "Avisar quando sair versão nova",
      avisarExplicacao:
        "Desligado, o aplicativo não procura atualização nenhuma e você fica nesta versão até baixar outra por conta própria.",
      pelaLoja:
        "Este pacote é atualizado pela loja onde você o instalou. O ATO20 não procura versão nova por conta própria.",
      historico: "Histórico",
    },
    tecladoAjuda: "Lista dos atalhos existentes no sistema.",
    plugins: {
      ajuda: "Plugins customizados para personalizar o sistema, e melhorar a experiência.",
      importar: "Importar plugin",
      nenhum: "Nenhum plugin instalado",
      oQueE: "Um plugin é uma pasta com {manifest} dentro. Importar é copiá-la para cá.",
      temas: "Temas",
      temasNota: "Só aparência: cores, cantos e fonte da interface.",
      funcionalidades: "Funcionalidades",
      funcionalidadesNota:
        "Estendem o que o ATO20 faz. Podem executar código com o alcance da janela.",
      habilitar: (nome: string) => `Habilitar ${nome}`,
      desinstalar: (nome: string) => `Desinstalar ${nome}`,
      tambemTema: "Esta extensão também traz um tema.",
      tema: "Tema",
      abaInstalados: "Instalados",
      abaCatalogo: "Catálogo",
      catalogo: {
        buscando: "Buscando o catálogo…",
        erro: "Não deu para abrir o catálogo. Confira a conexão com a internet.",
        tentarDeNovo: "Tentar de novo",
        formatoNovo: "O catálogo mudou de formato. Atualize o ATO20 para ver a lista.",
        vazio: "Nenhum plugin no catálogo ainda.",
        comoInstalar:
          "Para instalar, baixe o repositório no GitHub (Code → Download ZIP), descompacte e use Importar plugin na aba Instalados.",
        por: (autor: string) => `por ${autor}`,
        executaCodigo: "Executa código",
        executaCodigoNota: "Traz JavaScript, que roda com o alcance da janela do Mestre.",
        semCodigo: "Sem código",
        semCodigoNota: "Só tema e o que o manifesto declara. Nenhum JavaScript roda.",
        instalado: "Instalado",
        pedeVersaoNova: "Pede ATO20 mais novo",
        pedeVersaoNovaNota: (api: number, atual: number) =>
          `Este plugin usa a API ${api}, e este ATO20 fala a ${atual}.`,
        verNoGithub: "Ver no GitHub",
      },
    },
  },

  ajustes: {
    lendo: "Lendo…",
    arquivoIlegivel:
      "O arquivo não pôde ser lido, e nada será gravado nele até ser consertado:",
    maquina: "Máquina",
    campanha: "Campanha",
    buscar: "Buscar configuração",
    abrirArquivo: "Abrir o arquivo no editor",
    semCampanha: "Abra uma campanha para ajustar o que vale só nela.",
    nadaComEsseNome: "Nada com esse nome",
    nadaParaAjustar: "Nada para ajustar neste escopo",
    valeOdaCampanha: "vale o da campanha",
    valeOdaMaquina: "vale o da máquina",
    voltarAoPadrao: "Voltar ao padrão",
  },

  /** As configurações que o próprio ATO20 declara no registro. */
  definicoes: {
    zoom: "Zoom da interface",
    zoomDescricao: "Escala a janela inteira, o palco incluído. Um dos degraus: 0.8 a 1.5.",
    avisar: "Avisar quando sair versão nova",
    avisarDescricao:
      "Procura versão nova ao abrir. Desligado, o aplicativo não pergunta nada à rede sobre si.",
    volumeSistema: "Volume do sistema",
    volumeTrilha: "Volume da trilha",
    volumeAmbiente: "Volume do ambiente",
    volumeDisparo: "Volume dos disparos",
    idioma: "Idioma",
    idiomaDescricao: "O idioma da interface. Do sistema segue o sistema operacional.",
    discord: "Mostrar no Discord",
    discordDescricao:
      "O que você está fazendo aparece no seu perfil, como \"Jogando ATO20\". Só com o Discord aberto nesta máquina.",
    discordCampanha: "Mostrar o nome da campanha no Discord",
    discordCampanhaDescricao:
      "Desligado, o perfil diz só o que você faz. O nome da cena nunca aparece: quem joga com você poderia ler.",
    somDosDados: "Som dos dados",
    somDosDadosDescricao:
      "Os dados que caem no Mestre fazem barulho, os seus e os dos jogadores. Segue o volume do sistema.",
  },

  /**
   * O título da janela e o cartão do Discord. Cada coisa que o mestre faz tem
   * duas formas: a longa é a primeira linha quando ele está sozinho, e a curta
   * vai na segunda quando a primeira já diz "Mestrando".
   */
  presenca: {
    noMenu: "No menu",
    preparando: "Preparando campanha",
    mapa: { longo: "Editando mapa", curto: "No mapa" },
    quadro: { longo: "Editando quadro", curto: "No quadro" },
    fundo: { longo: "Editando cena", curto: "Na cena" },
    esguelha: { longo: "Mesa 2.5D", curto: "Na mesa 2.5D" },
    regras: { longo: "Lendo as regras", curto: "Nas regras" },
    mestrando: "Mestrando campanha",
    mestrandoNome: (campanha: string) => `Mestrando ${campanha}`,
    conhecer: "Conhecer o ATO20",
  },

  novidades: {
    oQueMudou: "O que mudou",
    estaVersao: "esta versão",
    antesDisso: "Antes disso",
    novidades: "Novidades",
    correcoes: "Correções",
    contarNovidades: (n: number) => (n === 1 ? "1 novidade" : `${n} novidades`),
    contarCorrecoes: (n: number) => (n === 1 ? "1 correção" : `${n} correções`),
    releasesNoGithub: "Releases no GitHub",
    semNavegador: "Não foi possível abrir o navegador.",
  },

  volume: {
    titulo: "Volume",
    geral: "Volume geral",
    sistema: "Sistema",
    sistemaDescricao: "Todo o som da aplicação, em todas as telas.",
    trilha: "Trilha",
    trilhaDescricao: "A música da sessão, seja qual for a faixa.",
    ambiente: "Ambiente",
    ambienteDescricao: "Todos os sons de ambiente de uma vez.",
    disparo: "Disparo",
    disparoDescricao: "Todos os efeitos disparados.",
  },
};

const en: typeof pt = {
  janela: {
    editando: (cena) => `Editing ${cena}`,
    minimizar: "Minimize",
    maximizar: "Maximize",
    restaurar: "Restore",
    fechar: "Close",
    confirmarFechar: "Close ATO20?",
    confirmarFecharExplicacao:
      "The campaign closes too, and the spectator window and the phones lose their connection to the table.",
  },

  configuracoes: {
    titulo: "Settings",
    descricao: "General ATO20 settings.",
    secoes: {
      geral: "General",
      ajustes: "Options",
      versao: "Version",
      teclado: "Keyboard",
      plugins: "Plugins",
    },
    ajustesAjuda:
      "Everything ATO20 and its plugins let you adjust, per machine and per campaign. The campaign wins.",
    zoom: {
      titulo: "Interface zoom",
      explicacao:
        "Scales the whole window, stage included. The camera over the map keeps its own zoom.",
      diminuir: "Zoom the interface out",
      aumentar: "Zoom the interface in",
    },
    tema: {
      titulo: "Theme",
      explicacao:
        "Dark only, for now: the tool runs at tables with low light and on a TV, where a light background glares.",
      escuro: "Dark",
      padrao: "default",
    },
    idioma: {
      titulo: "Language",
      explicacao:
        "Switching restarts the window. The open campaign comes back on its own, and the spectator window and the phones follow.",
      doSistema: (nome) => `System (${nome})`,
    },
    versao: {
      titulo: (versao) => `Version ${versao}`,
      ajuda: "ATO20 version history",
      avisar: "Tell me when a new version is out",
      avisarExplicacao:
        "When off, the app never looks for updates and you stay on this version until you download another one yourself.",
      pelaLoja:
        "This package is updated by the store you installed it from. ATO20 does not look for new versions on its own.",
      historico: "History",
    },
    tecladoAjuda: "Every shortcut in the app.",
    plugins: {
      ajuda: "Plugins that customize the app and extend what it does.",
      importar: "Import plugin",
      nenhum: "No plugins installed",
      oQueE: "A plugin is a folder with a {manifest} inside. Importing copies it here.",
      temas: "Themes",
      temasNota: "Looks only: colors, corners and the interface font.",
      funcionalidades: "Features",
      funcionalidadesNota:
        "Extend what ATO20 does. They can run code with the reach of the window.",
      habilitar: (nome) => `Enable ${nome}`,
      desinstalar: (nome) => `Uninstall ${nome}`,
      tambemTema: "This plugin also ships a theme.",
      tema: "Theme",
      abaInstalados: "Installed",
      abaCatalogo: "Catalog",
      catalogo: {
        buscando: "Fetching the catalog…",
        erro: "Couldn't open the catalog. Check your internet connection.",
        tentarDeNovo: "Try again",
        formatoNovo: "The catalog changed format. Update ATO20 to see the list.",
        vazio: "No plugins in the catalog yet.",
        comoInstalar:
          "To install, download the repository on GitHub (Code → Download ZIP), unzip it and use Import plugin in the Installed tab.",
        por: (autor) => `by ${autor}`,
        executaCodigo: "Runs code",
        executaCodigoNota: "Ships JavaScript, which runs with the same access as the GM window.",
        semCodigo: "No code",
        semCodigoNota: "Only a theme and what the manifest declares. No JavaScript runs.",
        instalado: "Installed",
        pedeVersaoNova: "Needs a newer ATO20",
        pedeVersaoNovaNota: (api, atual) =>
          `This plugin uses API ${api}, and this ATO20 speaks ${atual}.`,
        verNoGithub: "See on GitHub",
      },
    },
  },

  ajustes: {
    lendo: "Reading…",
    arquivoIlegivel: "The file could not be read, and nothing will be written to it until it is fixed:",
    maquina: "Machine",
    campanha: "Campaign",
    buscar: "Search settings",
    abrirArquivo: "Open the file in the editor",
    semCampanha: "Open a campaign to adjust what applies only to it.",
    nadaComEsseNome: "Nothing by that name",
    nadaParaAjustar: "Nothing to adjust in this scope",
    valeOdaCampanha: "the campaign's value applies",
    valeOdaMaquina: "the machine's value applies",
    voltarAoPadrao: "Reset to default",
  },

  definicoes: {
    zoom: "Interface zoom",
    zoomDescricao: "Scales the whole window, stage included. One of the steps: 0.8 to 1.5.",
    avisar: "Tell me when a new version is out",
    avisarDescricao:
      "Looks for a new version on launch. When off, the app asks the network nothing about itself.",
    volumeSistema: "System volume",
    volumeTrilha: "Music volume",
    volumeAmbiente: "Ambience volume",
    volumeDisparo: "Sound cue volume",
    idioma: "Language",
    idiomaDescricao: "The interface language. System follows the operating system.",
    discord: "Show on Discord",
    discordDescricao:
      "What you are doing shows on your profile, as \"Playing ATO20\". Only with Discord open on this machine.",
    discordCampanha: "Show the campaign name on Discord",
    discordCampanhaDescricao:
      "When off, your profile only says what you are doing. The scene name never shows: your players could read it.",
    somDosDados: "Dice sounds",
    somDosDadosDescricao:
      "Dice falling on the GM screen make noise, yours and your players'. Follows the system volume.",
  },

  presenca: {
    noMenu: "In the menu",
    preparando: "Preparing a campaign",
    mapa: { longo: "Editing a map", curto: "On the map" },
    quadro: { longo: "Editing a board", curto: "On the board" },
    fundo: { longo: "Editing a scene", curto: "In a scene" },
    esguelha: { longo: "2.5D table", curto: "At the 2.5D table" },
    regras: { longo: "Reading the rules", curto: "In the rules" },
    mestrando: "Running a campaign",
    mestrandoNome: (campanha) => `Running ${campanha}`,
    conhecer: "Check out ATO20",
  },

  novidades: {
    oQueMudou: "What's new",
    estaVersao: "this version",
    antesDisso: "Before that",
    novidades: "New",
    correcoes: "Fixes",
    contarNovidades: (n) => (n === 1 ? "1 new feature" : `${n} new features`),
    contarCorrecoes: (n) => (n === 1 ? "1 fix" : `${n} fixes`),
    releasesNoGithub: "Releases on GitHub",
    semNavegador: "Could not open the browser.",
  },

  volume: {
    titulo: "Volume",
    geral: "Master volume",
    sistema: "System",
    sistemaDescricao: "All of the app's sound, on every screen.",
    trilha: "Music",
    trilhaDescricao: "The session's music, whatever the track.",
    ambiente: "Ambience",
    ambienteDescricao: "Every ambience sound at once.",
    disparo: "Sound cues",
    disparoDescricao: "Every sound cue fired.",
  },
};

export const dicionarios = { "pt-BR": pt, en };

export const t = escolher(dicionarios);
