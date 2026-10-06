import { escolher } from "@/lib/i18n/idioma";

/**
 * O texto das peças que o Mestre, o celular e a janela do espectador dividem:
 * as camadas do palco, o fio, os anexos, o leitor de PDF, os dados e os kits.
 * Vai no pacote do celular também -- área de texto não importa nada do app.
 */
const pt = {
  cameraFantasma: {
    dica: (posicao: number, segue: boolean) =>
      `Clique seleciona (Shift+${posicao}). ${segue ? "Segue tokens." : "Arraste move."}`,
  },

  cameraFrame: {
    arrastar: "Arrastar move a câmera. Com Shift, só na horizontal ou só na vertical.",
    tirarDoAr: "Tirar do ar",
    desfazerPreparacao: "Desfazer a preparação",
    transmitir: "Transmitir esta câmera",
    noArDica: "No ar. Clique tira do ar: a mesa vê o mapa inteiro.",
    preparadaDica: "Preparada: a mesa vê esta câmera quando o mapa for ao ar. Clique desfaz.",
    transmitirDica: "Transmitir: a mesa passa a ver esta câmera.",
  },

  retrato: {
    paginaViva: "Página viva",
    apareceNaMesa: "aparece na mesa",
  },

  previaDaMencao: {
    imagemEsquerda: "Imagem à esquerda",
    imagemCentro: "Imagem no centro · |centro",
    imagemDireita: "Imagem à direita · |direita",
    alinhamento: "Alinhamento da imagem",
    abrir: (nome: string) => `Abrir ${nome}`,
    largura: (nome: string) => `Largura de ${nome}`,
    arrasteTamanho: "Arraste para mudar o tamanho",
    naMesa: "na mesa",
    ausente: "ausente",
    semJogador: "Sem jogador",
    abrirFicha: (nome: string) => `Abrir a ficha de ${nome}`,
    abrirCena: (nome: string) => `Abrir a cena ${nome} na bancada`,
    abrirLivro: (titulo: string, pagina: number) => `Abrir ${titulo} na página ${pagina}`,
  },

  quadroMesa: {
    ponto: (n: number) => `Ponto ${n}`,
  },

  ping: {
    olhe: "Olhe aqui",
    alerta: "Cuidado",
    perigo: "Perigo",
    atacar: "Atacar",
    ir: "Vou para lá",
    duvida: "O que é isso?",
  },

  rodaDePing: {
    aponteESolte: "Aponte e solte a tecla",
    arrasteAte: "Arraste até um ping",
    escolha: "Escolha um ping",
    pings: "Pings",
    fecharSemMarcar: "Fechar sem marcar",
  },

  /** Os nomes dos ícones de condição, no seletor. A chave gravada não muda. */
  iconesDaCondicao: {
    caveira: "Caveira",
    chama: "Chama",
    frasco: "Frasco",
    veneno: "Veneno",
    floco: "Gelo",
    gota: "Gota",
    sangue: "Sangue",
    raio: "Raio",
    fantasma: "Fantasma",
    coracaoPartido: "Coração partido",
    coracao: "Coração",
    cama: "Caído",
    lua: "Sono",
    medo: "Medo",
    cerebro: "Mente",
    olhoFechado: "Cego",
    surdo: "Surdo",
    mudo: "Silenciado",
    corrente: "Agarrado",
    ancora: "Preso",
    cadeado: "Trancado",
    pegadas: "Lento",
    montanha: "Pedra",
    pena: "Pena",
    vento: "Vento",
    brilho: "Brilho",
    sol: "Sol",
    escudo: "Escudo",
    espadas: "Espadas",
    alvo: "Marcado",
    ampulheta: "Ampulheta",
    coroa: "Coroa",
    estrela: "Estrela",
    circulo: "Círculo",
  },

  sombra: {
    titulo: "Sombra",
    naBase: "Na base",
    naBaseDica: "Em pé: a sombra nasce da linha do chão e se deita para longe da luz.",
    inteira: "Inteira",
    inteiraDica: "Vista de cima: o objeto inteiro deita a sombra, colada nele.",
    nenhuma: "Nenhuma",
    nenhumaDica: "Pintado no chão: tapete, mancha, área de efeito.",
    comoDeita: "Como este item deita a sombra",
    arrasteALinha:
      "Arraste a linha amarela até onde a figura pisa. O que fica abaixo dela é chão.",
    automatica: "Automática",
    altura: "Altura",
    alturaDescricao: "Altura do objeto, em múltiplos da largura",
    semLuz: "Sem sol nem luz nesta cena: a sombra aparece quando houver.",
    linhaDoChao: "Linha do chão",
  },

  som: {
    tocar: "Tocar o som",
    desligar: "Desligar o som desta tela",
    ligar: "Ligar o som desta tela",
  },

  evidencia: {
    ver: "Ver a imagem do mestre",
    imagem: "Imagem em evidência",
    esconder: "Esconder",
  },

  dados: {
    rolando: "Rolando…",
    moeda: "Moeda",
    /** Os nomes gravados na moeda. Em maiúscula, como na face. */
    caraNaFace: "CARA",
    coroaNaFace: "COROA",
    cara: "Cara",
    coroa: "Coroa",
    moedas: (n: number) => `${n} moedas`,
    mesaCheia: (teto: number) => `A mesa está cheia: ${teto} dados.`,
    mesaCheiaSaida: "Recolha os dados no saquinho para jogar de novo.",
  },

  fio: {
    plugin: "plugin",
    mestre: "Mestre",
    soOMestre: "só o Mestre",
    soParaVoce: "só para você",
    para: (nome: string) => `para ${nome}`,
    apagarLinha: (autor: string) => `Apagar a linha de ${autor}`,
    nenhumPersonagem: "Nenhum personagem com este nome",
    comJogador: (nome: string, dono: string) => `${nome} — ${dono}`,
    semJogador: (nome: string) => `${nome} — sem jogador`,
    abrirFicha: (legenda: string) => `Abrir a ficha de ${legenda}`,
    personagens: "Personagens",
    naoRecebeu: "A mesa não recebeu a mensagem.",
    mensagem: "Mensagem",
    enviar: "Enviar",
  },

  sugestoes: {
    rodape: "↑↓ escolhe · Enter confirma · Esc fecha",
  },

  anexo: {
    carregando: "Carregando",
    abrirPdf: "Abrir o PDF no navegador",
    naoExibe: "Este tipo de arquivo não pode ser exibido aqui.",
    baixar: "Baixar",
    abrirNoNavegador: (nome: string) => `Abrir ${nome} no navegador`,
  },

  zoomDaImagem: {
    menos: "Menos zoom",
    mais: "Mais zoom",
    encaixar: "Encaixar na tela",
  },

  leitor: {
    buscar: "Buscar no texto",
    limparBusca: "Limpar a busca",
    lendo: (lidas: number, total: number) => `Página ${lidas} de ${total}`,
    nadaEncontrado: "Nada encontrado. Arquivo escaneado sem OCR não tem texto para buscar.",
    paginaCurta: (pagina: number) => `p. ${pagina}`,
    pagina: (pagina: number) => `Página ${pagina}`,
    anterior: "Página anterior",
    irPara: "Ir para a página",
    deTotal: (total: string) => `de ${total}`,
    proxima: "Próxima página",
    diminuirZoom: "Diminuir o zoom",
    ajustarLargura: "Ajustar à largura",
    largura: "Largura",
    aumentarZoom: "Aumentar o zoom",
    lupa: "Lupa",
    lupaDica: (ampliacao: number) =>
      `Lupa: segure sobre a página, roda ajusta (${ampliacao}×)`,
    marcadores: "Marcadores",
    abrindoDocumento: "Abrindo o documento",
    abrindo: "Abrindo…",
    naoAbriu: "Não abriu",
    pedeSenha: "Este PDF pede senha, e o leitor não tem onde recebê-la.",
    invalido:
      "Este arquivo não é um PDF que o leitor entenda: ou está corrompido, ou veio truncado.",
    sumiu: "Este arquivo não está mais onde estava.",
    naoBaixou: "Não foi possível baixar este arquivo.",
    naoAbriuPdf: "Não foi possível abrir este PDF.",
  },

  kit: {
    retratos: "Kit de retratos",
  },

  /** Os erros que a API devolve a quem escreve o plugin. */
  /** O lugar de um plugin cujo desenho quebrou. Ver `BarreiraDeExtensao`. */
  /** A janela do espectador sem cena. Ver `EspectadorStage`. */
  espectador: {
    nadaNoAr: "O mestre não colocou nada no ar.",
    semResposta: "Sem resposta. A tela do Mestre precisa estar aberta.",
    aguardando: "Aguardando o Mestre…",
  },

  barreira: {
    falhou: (nome: string) => `${nome} falhou ao desenhar.`,
  },

  apiDePlugin: {
    semNotacao: "nenhuma notação: passe ao menos uma, como \"1d20\".",
    notacaoInvalida: (notacao: string) =>
      `notação inválida: ${notacao}. Use "2d6", "d20"; o modificador é conta do plugin.`,
    mesaCheia: "a mesa está cheia: recolha os dados antes de rolar.",
    rolagemInvalida:
      "rolagem inválida: passe o que `api.dados.rolar` devolveu, ou `{ dados: [{ faces, valor }] }`.",
    linhaVazia: "linha vazia: passe `texto`, `rolagem`, ou os dois.",
  },
};

const en: typeof pt = {
  cameraFantasma: {
    dica: (posicao, segue) =>
      `Click to select (Shift+${posicao}). ${segue ? "Follows tokens." : "Drag to move."}`,
  },

  cameraFrame: {
    arrastar: "Drag to move the camera. With Shift, only horizontally or only vertically.",
    tirarDoAr: "Take off air",
    desfazerPreparacao: "Cancel cue",
    transmitir: "Put this camera on air",
    noArDica: "On air. Click to take it off air: the table sees the whole map.",
    preparadaDica: "Cued: the table sees this camera when the map goes on air. Click to cancel.",
    transmitirDica: "Put on air: the table starts seeing this camera.",
  },

  retrato: {
    paginaViva: "Live page",
    apareceNaMesa: "shows at the table",
  },

  previaDaMencao: {
    imagemEsquerda: "Image on the left",
    imagemCentro: "Image in the center · |centro",
    imagemDireita: "Image on the right · |direita",
    alinhamento: "Image alignment",
    abrir: (nome) => `Open ${nome}`,
    largura: (nome) => `Width of ${nome}`,
    arrasteTamanho: "Drag to resize",
    naMesa: "at the table",
    ausente: "away",
    semJogador: "No player",
    abrirFicha: (nome) => `Open ${nome}'s sheet`,
    abrirCena: (nome) => `Go to the scene ${nome}`,
    abrirLivro: (titulo, pagina) => `Open ${titulo} at page ${pagina}`,
  },

  quadroMesa: {
    ponto: (n) => `Pin ${n}`,
  },

  ping: {
    olhe: "Look here",
    alerta: "Careful",
    perigo: "Danger",
    atacar: "Attack",
    ir: "On my way",
    duvida: "What's this?",
  },

  rodaDePing: {
    aponteESolte: "Point and release the key",
    arrasteAte: "Drag to a ping",
    escolha: "Pick a ping",
    pings: "Pings",
    fecharSemMarcar: "Close without marking",
  },

  iconesDaCondicao: {
    caveira: "Skull",
    chama: "Flame",
    frasco: "Flask",
    veneno: "Poison",
    floco: "Ice",
    gota: "Drop",
    sangue: "Blood",
    raio: "Lightning",
    fantasma: "Ghost",
    coracaoPartido: "Broken heart",
    coracao: "Heart",
    cama: "Prone",
    lua: "Asleep",
    medo: "Fear",
    cerebro: "Mind",
    olhoFechado: "Blind",
    surdo: "Deaf",
    mudo: "Silenced",
    corrente: "Grappled",
    ancora: "Restrained",
    cadeado: "Locked",
    pegadas: "Slowed",
    montanha: "Stone",
    pena: "Feather",
    vento: "Wind",
    brilho: "Sparkle",
    sol: "Sun",
    escudo: "Shield",
    espadas: "Swords",
    alvo: "Marked",
    ampulheta: "Hourglass",
    coroa: "Crown",
    estrela: "Star",
    circulo: "Circle",
  },

  sombra: {
    titulo: "Shadow",
    naBase: "At the base",
    naBaseDica: "Standing: the shadow starts at the ground line and falls away from the light.",
    inteira: "Whole",
    inteiraDica: "Seen from above: the whole object casts the shadow, right against it.",
    nenhuma: "None",
    nenhumaDica: "Painted on the floor: rug, stain, area of effect.",
    comoDeita: "How this item casts its shadow",
    arrasteALinha:
      "Drag the yellow line to where the figure stands. What is below it is ground.",
    automatica: "Automatic",
    altura: "Height",
    alturaDescricao: "Object height, in multiples of its width",
    semLuz: "No sun or light in this scene: the shadow shows up once there is one.",
    linhaDoChao: "Ground line",
  },

  som: {
    tocar: "Play sound",
    desligar: "Turn off sound on this screen",
    ligar: "Turn on sound on this screen",
  },

  evidencia: {
    ver: "Show the GM's image",
    imagem: "Spotlighted image",
    esconder: "Hide",
  },

  dados: {
    rolando: "Rolling…",
    moeda: "Coin",
    caraNaFace: "HEADS",
    coroaNaFace: "TAILS",
    cara: "Heads",
    coroa: "Tails",
    moedas: (n) => `${n} coins`,
    mesaCheia: (teto) => `The table is full: ${teto} dice.`,
    mesaCheiaSaida: "Put the dice back in the dice bag to roll again.",
  },

  fio: {
    plugin: "plugin",
    mestre: "GM",
    soOMestre: "GM only",
    soParaVoce: "only to you",
    para: (nome) => `to ${nome}`,
    apagarLinha: (autor) => `Delete message from ${autor}`,
    nenhumPersonagem: "No character with this name",
    comJogador: (nome, dono) => `${nome} (${dono})`,
    semJogador: (nome) => `${nome} (no player)`,
    abrirFicha: (legenda) => `Open sheet: ${legenda}`,
    personagens: "Characters",
    naoRecebeu: "The table didn't get the message.",
    mensagem: "Message",
    enviar: "Send",
  },

  sugestoes: {
    rodape: "↑↓ choose · Enter confirm · Esc close",
  },

  anexo: {
    carregando: "Loading",
    abrirPdf: "Open the PDF in the browser",
    naoExibe: "This file type can't be shown here.",
    baixar: "Download",
    abrirNoNavegador: (nome) => `Open ${nome} in the browser`,
  },

  zoomDaImagem: {
    menos: "Zoom out",
    mais: "Zoom in",
    encaixar: "Fit to screen",
  },

  leitor: {
    buscar: "Search the text",
    limparBusca: "Clear search",
    lendo: (lidas, total) => `Page ${lidas} of ${total}`,
    nadaEncontrado: "Nothing found. A scanned file without OCR has no text to search.",
    paginaCurta: (pagina) => `p. ${pagina}`,
    pagina: (pagina) => `Page ${pagina}`,
    anterior: "Previous page",
    irPara: "Go to page",
    deTotal: (total) => `of ${total}`,
    proxima: "Next page",
    diminuirZoom: "Zoom out",
    ajustarLargura: "Fit to width",
    largura: "Width",
    aumentarZoom: "Zoom in",
    lupa: "Magnifier",
    lupaDica: (ampliacao) =>
      `Magnifier: hold over the page, the scroll wheel adjusts it (${ampliacao}×)`,
    marcadores: "Bookmarks",
    abrindoDocumento: "Opening the document",
    abrindo: "Opening…",
    naoAbriu: "Didn't open",
    pedeSenha: "This PDF asks for a password, and the reader has nowhere to take it.",
    invalido: "This file isn't a PDF the reader understands: it's either corrupted or truncated.",
    sumiu: "This file is no longer where it was.",
    naoBaixou: "Couldn't download this file.",
    naoAbriuPdf: "Couldn't open this PDF.",
  },

  kit: {
    retratos: "Portrait kit",
  },

  espectador: {
    nadaNoAr: "The GM hasn't put anything on air.",
    semResposta: "No answer. The GM screen needs to be open.",
    aguardando: "Waiting for the GM…",
  },

  barreira: {
    falhou: (nome) => `${nome} failed to draw.`,
  },

  apiDePlugin: {
    semNotacao: "no notation: pass at least one, like \"1d20\".",
    notacaoInvalida: (notacao) =>
      `invalid notation: ${notacao}. Use "2d6", "d20"; the modifier is the plugin's to add.`,
    mesaCheia: "the table is full: put the dice away before rolling.",
    rolagemInvalida:
      "invalid roll: pass what `api.dados.rolar` returned, or `{ dados: [{ faces, valor }] }`.",
    linhaVazia: "empty line: pass `texto`, `rolagem`, or both.",
  },
};

export const dicionarios = { "pt-BR": pt, en };

export const t = escolher(dicionarios);
