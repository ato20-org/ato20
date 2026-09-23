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
  titulo: string;
  /** O porquê ou o detalhe, quando a linha sozinha não basta. */
  detalhe?: string;
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
    versao: "0.2.0",
    data: "2026-09-23",
    mudancas: [
      {
        tipo: "novidade",
        titulo: "O painel de sons virou uma mesa de som",
        detalhe:
          "Antes era uma trilha por vez. Agora vários sons tocam juntos — a chuva por baixo, a taverna por cima, o trovão disparado na hora —, cada um com a sua barra de volume. O teclado numérico vira os pads: aperte a tecla e o som sai, sem procurar nada na tela. Trocar de ambiente faz fade em vez de cortar.",
      },
      {
        tipo: "novidade",
        titulo: "Os sons ganharam tipo, nome próprio, busca e macros",
        detalhe:
          "Cada som diz se é ambiente ou disparo, os pads têm cor, e uma macro acende um conjunto inteiro de uma vez. O volume geral saiu de dentro da campanha e virou um botão na barra da janela, onde a mão o acha no meio da sessão.",
      },
      {
        tipo: "novidade",
        titulo: "A cena lembra que ambiente ela acende",
        detalhe:
          "Abrir a taverna acende o som da taverna. Deixou de ser uma coisa a lembrar toda vez que o mapa muda.",
      },
      {
        tipo: "novidade",
        titulo: "Dá para desenhar no mapa, e não só no quadro",
        detalhe:
          "Formas geométricas, setas que curvam e texto solto valem nos dois, com a régua de ferramentas na borda. E você escolhe o que a mesa vê: o desenho pode ficar só para você.",
      },
      {
        tipo: "novidade",
        titulo: "A área escondida pode ser quadrada, redonda ou desenhada à mão",
        detalhe:
          "Ela também gira, e os vértices se editam depois — a caverna deixa de ser um retângulo em cima de um desenho que não é retangular.",
      },
      {
        tipo: "novidade",
        titulo: "O token de personagem ganhou um contorno que diz de quem ele é",
      },
      {
        tipo: "novidade",
        titulo: "O personagem pode ter várias aparências",
        detalhe:
          "Além da padrão, quantas você quiser: Ferido, Lobo, Encapuzado. Cada uma guarda o próprio retrato e a própria miniatura, e trocar troca os dois de uma vez — inclusive o token que já está no mapa, em todas as cenas. Dá para trocar pela ficha, pelo menu da lista de personagens ou pelo menu do token.",
      },
      {
        tipo: "novidade",
        titulo: "Ctrl+V põe imagem de fora no mapa, no quadro e no acervo",
        detalhe:
          "Print de tela, recorte de editor ou imagem copiada do navegador. Com o painel de imagens em foco, a figura só entra no acervo; em qualquer outro lugar, ela também aparece no centro do que você está vendo.",
      },
      {
        tipo: "novidade",
        titulo: "Os retratos podem andar em grupo",
        detalhe:
          "Uma união com moldura colorida, nome, ordem própria e o canto da tela onde ela fica. É como se diz de relance quem anda com quem.",
      },
      {
        tipo: "novidade",
        titulo: "A ficha em PDF abre dentro do aplicativo",
        detalhe:
          "Num leitor próprio, e não numa janela do navegador embutida — com zoom, páginas e o documento inteiro alcançável. O mesmo leitor serve qualquer documento da campanha.",
      },
      {
        tipo: "novidade",
        titulo: "O item do inventário do jogador ganhou quadro de foto",
      },
      {
        tipo: "novidade",
        titulo: "Criar personagem pede o nome antes, e F2 renomeia",
        detalhe:
          "Desistir no meio não deixa mais um \"Novo personagem\" para trás. A linha ganhou menu no botão direito, com renomear, pôr no mapa, entregar a um jogador e apagar.",
      },
      {
        tipo: "novidade",
        titulo: "Renomear ficou previsível em toda a tela",
        detalhe:
          "Clicar fora grava, Enter grava, Escape desiste. Vale para o personagem, a aparência e o grupo de retratos.",
      },
      {
        tipo: "novidade",
        titulo: "Os painéis vazios explicam o que fazer, e as abas fecham no X",
        detalhe:
          "Ou no botão do meio do mouse, como no navegador. Áreas virou uma aba dentro de Mapas, e a linha do mapa ganhou menu.",
      },
      {
        tipo: "novidade",
        titulo: "O Ctrl+Z ficou mais seguro",
        detalhe:
          "Ele não apaga cena, quadro nem nota — para isso existe a pergunta de confirmação. E dentro de um texto ele desfaz por palavra, em vez de sumir com o parágrafo inteiro.",
      },
      {
        tipo: "correcao",
        titulo: "O mapa parava de tremer ao dar zoom, e o gizmo parava de borrar",
        detalhe:
          "Aquele salto para o centro ao aproximar, e as alças que incham quando você afasta o mapa. A roda também ficou mais parecida com a de um mouse de verdade, e o arrasto responde por quadro em vez de engasgar.",
      },
      {
        tipo: "correcao",
        titulo: "O disparo de som toca o arquivo inteiro, e a trilha reacende sem piscar",
      },
      {
        tipo: "correcao",
        titulo: "A lixeira do acervo passou a ver o som que não está tocando",
      },
      {
        tipo: "correcao",
        titulo: "O X de uma janela que está atrás deixou de pedir dois cliques",
      },
    ],
  },
  {
    versao: "0.1.4",
    data: "2026-09-18",
    mudancas: [
      {
        tipo: "correcao",
        titulo: "No Windows, o arquivo do instalador também mostra o ícone do ATO20",
        detalhe:
          "A 0.1.3 trocou o ícone do aplicativo instalado e do atalho, mas o instalador que você baixa — o ato20_x64-setup.exe — continuava aparecendo no Explorer com o ícone genérico da ferramenta que o empacota, um globo azul. Agora é a mesma marca em tudo.",
      },
    ],
  },
  {
    versao: "0.1.3",
    data: "2026-09-18",
    mudancas: [
      {
        tipo: "correcao",
        titulo: "O ATO20 passa a ter o próprio ícone na barra de tarefas e no atalho",
        detalhe:
          "Até aqui todo pacote — AppImage, instalador do Windows, .deb e .rpm — saía com o ícone padrão da ferramenta que empacota o aplicativo, dois anéis ciano e amarelo. Agora é a marca do ATO20: a tenda com o d20, sobre fundo escuro.",
      },
    ],
  },
  {
    versao: "0.1.2",
    data: "2026-09-18",
    mudancas: [
      {
        tipo: "correcao",
        titulo: "A página da loja anunciava as novidades da versão anterior",
        detalhe:
          "Detalhe de bastidor, e só aparece para quem instalar pela loja: o arquivo que descreve o ATO20 para o Flathub ficou uma versão atrás na 0.1.1, então a loja mostrava o que mudou na 0.1.0. Nada muda para quem baixou o AppImage ou o instalador do Windows.",
      },
    ],
  },
  {
    versao: "0.1.1",
    data: "2026-09-18",
    mudancas: [
      {
        tipo: "novidade",
        titulo: "O ATO20 começa a ser empacotado para as lojas do Linux",
        detalhe:
          "Esta versão não muda nada no que você já usa — ela existe porque o pacote do Flathub precisa ser construído a partir de uma versão publicada, e não do código do dia. O que mudou por dentro só aparece lá: as fontes deixaram de ser baixadas durante o empacotamento, e o aviso de versão nova some no pacote de loja, onde quem atualiza é a própria loja. Quem baixou o AppImage ou o instalador do Windows continua sendo avisado como antes.",
      },
    ],
  },
  {
    versao: "0.1.0",
    data: "2026-09-18",
    mudancas: [
      {
        tipo: "novidade",
        titulo: "O aplicativo passa a avisar sozinho quando existe versão nova",
        detalhe:
          "Até aqui toda versão saiu marcada como pré-lançamento, e o endereço que o aplicativo consulta ignora pré-lançamento — quem baixou a 0.0.1 ficou na 0.0.1 sem nunca saber que havia seis versões depois. Desta em diante o aviso chega sozinho.",
      },
      {
        tipo: "novidade",
        titulo: "A campanha ganha quadros: uma folha sem chão para o mestre pensar",
        detalhe:
          "O quadro fica na aba ao lado de Cenas, com pastas dentro de pastas. Nele você escreve texto direto na folha, liga as coisas com setas — de ponta solta ou grudada no que você mover — e mistura post-it, imagem, dado e cartão no mesmo lugar. Pôr o quadro no ar mostra a folha inteira na TV e no celular.",
      },
      {
        tipo: "novidade",
        titulo: "Documento: um cartão de Markdown com prévia ao vivo",
        detalhe:
          "Você escreve de um lado e vê formatado do outro. No começo da linha, # dá título, ## subtítulo e - item de lista; @, / e > chamam referência, comando e citação, tanto na nota quanto no cartão.",
      },
      {
        tipo: "novidade",
        titulo: "A aba Arquivos põe quadros, notas e imagens na mesma árvore de pastas",
        detalhe:
          "Qualquer arquivo entra no acervo agora, e a aba Imagens virou Biblioteca. A nota passou a ser arquivo da campanha: o cartão no quadro só aponta para ela, então a mesma nota pode aparecer em dois quadros sem virar duas cópias. Arrastar a nota da árvore até o quadro funciona como com imagem.",
      },
      {
        tipo: "novidade",
        titulo: "Ctrl+K abre uma paleta de comandos",
        detalhe:
          "Ela acha janela, cena, livro, imagem e atalho pelo nome, sem você ter de lembrar em que painel aquilo estava.",
      },
      {
        tipo: "novidade",
        titulo: "Dá para jogar dados por notação, como \"2d6\", sem pegar no saquinho",
      },
      {
        tipo: "novidade",
        titulo: "O saquinho ganha o d% de dezenas e a moeda de cara ou coroa",
        detalhe:
          "O celular do jogador também pede os dois, e a mesa passa a ler \"Coroa\" e \"d%\" em vez de \"2\" e \"d2\".",
      },
      {
        tipo: "novidade",
        titulo: "A régua virou medidor que fica no mapa, com círculo, cone e retângulo",
        detalhe:
          "Antes a medida sumia quando você soltava o mouse. Agora ela fica posta na cena, e a forma diz o que você está medindo.",
      },
      {
        tipo: "novidade",
        titulo: "A estante mostra os livros com capa, em caixa 2.5D, e o clique abre o PDF",
        detalhe:
          "Há também um comando para abrir o livro no leitor de PDF da máquina. A capa fica guardada depois da primeira vez, então a estante não pisca ao reabrir.",
      },
      {
        tipo: "novidade",
        titulo: "A cena guarda um handout: imagens do acervo que você manda à mesa uma a uma",
        detalhe:
          "A bolinha recebe imagens arrastadas e as leva à TV; o que já está na mesa volta para a manga pela mesma bolinha ou pelo menu. O painel ganhou título e uma caixinha de + que escolhe imagens do computador.",
      },
      {
        tipo: "novidade",
        titulo: "A janela \"Mesa\" mostra o que a TV está vendo, em miniatura, na sua tela",
      },
      {
        tipo: "novidade",
        titulo: "Girar pelos cantos do gizmo, como no Figma",
        detalhe:
          "O botão de rotacionar saiu. A roda do mouse redimensiona a imagem na mão e Shift gira; as setas do teclado andam cinco de cada vez, e com Shift giram a seleção. Segurando a alça da câmera, a roda dá zoom nela.",
      },
      {
        tipo: "novidade",
        titulo: "Dá para afastar até 50%, com vazio em volta do mapa",
      },
      {
        tipo: "novidade",
        titulo: "A cena nasce sem câmera, e a mesa vê tudo até a primeira entrar",
        detalhe:
          "Antes a cena nova já vinha com um enquadramento que você não escolheu. O botão \"Mesa\" também saiu da barra de cima.",
      },
      {
        tipo: "novidade",
        titulo: "A lista de personagens separa Players em cima e NPCs embaixo",
      },
      {
        tipo: "novidade",
        titulo: "A ficha mostra quem está jogando com ela, e o diálogo do jogador diz há quanto tempo",
        detalhe:
          "Dá para entregar o personagem a outra pessoa dali, e tirar alguém da mesa passa a pedir confirmação. A nota fechada do personagem fica guardada.",
      },
      {
        tipo: "novidade",
        titulo: "A porta mudou: botões no alto, \"Encontrar campanha\" e o mapa da cena ao fundo do cartão",
        detalhe:
          "A estante ganhou botão e aceita arquivo solto, \"O que mudou\" virou botão ao lado das Configurações, e a estante vazia virou um alvo tracejado em vez de um espaço em branco.",
      },
      {
        tipo: "novidade",
        titulo: "Esc larga a ferramenta, e um X na barra faz o mesmo",
      },
      {
        tipo: "novidade",
        titulo: "O palco vazio mostra a marca e os atalhos principais",
      },
      {
        tipo: "novidade",
        titulo: "A tela diz qual pasta da campanha sumiu, em vez de abrir uma mesa vazia",
      },
      {
        tipo: "correcao",
        titulo:
          "Apagar a pasta da campanha com a mesa aberta virava mesa vazia, e a gravação recriava a pasta pela metade",
      },
      {
        tipo: "correcao",
        titulo: "No leitor, dar zoom deixava a folha branca por um instante",
        detalhe:
          "A página que você está lendo passa na frente das vizinhas, e trocar de página depressa não deixa mais um desenho cancelado na tela.",
      },
      {
        tipo: "correcao",
        titulo: "A máscara escura da câmera cobria o post-it e os controles do mestre",
      },
      {
        tipo: "correcao",
        titulo: "O clique fora do mapa tinha deixado de valer",
        detalhe: "A borda saiu e o vazio em volta ganhou pontos.",
      },
      {
        tipo: "correcao",
        titulo: "O token achatava ao encolher, em vez de parar no piso",
      },
      {
        tipo: "correcao",
        titulo: "O d% nascia sem valor, e a soma da mesa dava NaN",
      },
      {
        tipo: "correcao",
        titulo: "A ficha só via quem entrou na mesa depois de reabrir o programa",
      },
      {
        tipo: "correcao",
        titulo: "O diálogo de Configurações prendia o foco e matava a barra da janela",
      },
      {
        tipo: "correcao",
        titulo: "O rótulo da câmera não cabia quando a moldura ficava pequena na tela",
      },
      {
        tipo: "correcao",
        titulo: "No quadro, o dado caía puxado para o plano, e não onde a mão soltou",
      },
      {
        tipo: "correcao",
        titulo: "No quadro, o texto novo nascia invisível e sem foco",
      },
      {
        tipo: "correcao",
        titulo: "A bancada já arrumada não ganhava a aba Quadros ao lado de Cenas",
      },
      {
        tipo: "correcao",
        titulo: "O arquivo da extensão se chama manifest.json, e não manifesto.json",
      },
    ],
  },
  {
    versao: "0.0.6",
    data: "2026-09-16",
    mudancas: [
      {
        tipo: "novidade",
        titulo:
          "A cena tem câmeras com nome, e você escolhe qual delas está no ar",
        detalhe:
          "Cada câmera é um enquadramento guardado do mapa. Elas ficam numa pílula no alto da mesa, e transmitir é escolher uma — a que está no ar aparece marcada, e as outras ficam apagadas no palco, para você ver o que os jogadores não estão vendo. Trocar de câmera corta em fade na TV, e sem nenhuma no ar a mesa fica escura. Segurando V, o mouse vira cinegrafista e move o enquadramento sem mexer no mapa.",
      },
      {
        tipo: "novidade",
        titulo: "O acervo e a lista \"Em cena\" ganharam pastas",
        detalhe:
          "Pasta dentro de pasta, e arrastar uma pasta para dentro de outra. No acervo, Ctrl e Shift selecionam várias imagens de uma vez. Na lista \"Em cena\", clicar num item do mapa já pega a pasta inteira a que ele pertence.",
      },
      {
        tipo: "novidade",
        titulo:
          "Importar arquivo grande não trava mais a janela, e dá para cancelar no meio",
        detalhe:
          "A cópia saiu da thread da janela: um aviso mostra o que está entrando, quanto falta e um botão de parar. A miniatura de um mapa de 50 megapixels agora sai em menos de um segundo.",
      },
      {
        tipo: "novidade",
        titulo: "Arquivo largado no painel de imagens entra no acervo",
      },
      {
        tipo: "novidade",
        titulo: "A área do mapa cresce com o que você coloca nela",
        detalhe:
          "Antes o plano tinha um tamanho fixo e o que passava da borda ficava fora do alcance. Agora ele acompanha as peças.",
      },
      {
        tipo: "novidade",
        titulo: "A barra de ferramentas virou duas bolsas",
        detalhe: "A grade e a régua foram para a bolsa do mapa.",
      },
      {
        tipo: "novidade",
        titulo: "O que a mesa tirou nas rolagens vira janela da bancada",
      },
      {
        tipo: "novidade",
        titulo: "O alfinete alterna a nota do ponto, e a bolinha do saquinho vira X enquanto ele está aberto",
        detalhe:
          "Dois botões que antes só tinham ida: agora clicar de novo desfaz, e o ícone diz em que estado você está.",
      },
      {
        tipo: "correcao",
        titulo: "Trocar o mapa de fundo três vezes seguidas importava o mesmo arquivo três vezes",
        detalhe: "Três cópias do mesmo mapa pesado dentro da campanha.",
      },
      {
        tipo: "correcao",
        titulo: "Abrir a tela do espectador no navegador falhava calado",
        detalhe:
          "Em máquina Linux sem o `xdg-open`, o botão não fazia nada e não dizia por quê.",
      },
      {
        tipo: "correcao",
        titulo: "Renomear pelo menu não fazia nada, e agora F2 também renomeia",
      },
      {
        tipo: "correcao",
        titulo: "O botão de tirar o post-it se escondia, e a prévia não mostrava onde o papel ia cair",
      },
      {
        tipo: "correcao",
        titulo: "No celular do jogador, o esmaecido da rolagem comia o texto da ficha",
      },
      {
        tipo: "correcao",
        titulo: "A mesa aceitava dado sem fim",
        detalhe: "Agora o teto é cinquenta dados por rolagem.",
      },
    ],
  },
  {
    versao: "0.0.5",
    data: "2026-09-15",
    mudancas: [
      {
        tipo: "novidade",
        titulo:
          "A lista de novidades cabe numa tela, e cada linha abre quando você quer o detalhe",
        detalhe:
          "Com treze mudanças, a 0.0.4 virou uma parede de texto na tela de entrada e nas Configurações. Agora os títulos ficam à vista, separados entre o que é novo e o que foi consertado, e o detalhe de cada um abre com um clique. As versões anteriores vêm fechadas, uma linha cada, já dizendo quantas mudanças têm dentro.",
      },
    ],
  },
  {
    versao: "0.0.4",
    data: "2026-09-15",
    mudancas: [
      {
        tipo: "novidade",
        titulo:
          "Arrastar um personagem, uma imagem ou um item até o mapa mostra onde ele vai cair, e de que tamanho",
        detalhe:
          "A sombra da peça acompanha o ponteiro, no lugar e no tamanho exatos em que ela vai ficar, e a roda do mouse escolhe o tamanho sem soltar o arrasto — entre um quarto e quatro vezes. Antes a peça só aparecia depois de solta, e cair torta custava dois ajustes com o gizmo.",
      },
      {
        tipo: "novidade",
        titulo:
          "Um arquivo arrastado do gerenciador de arquivos cai no mapa onde a mão soltou",
        detalhe:
          "Ele entra no acervo e vai à cena no mesmo gesto, já selecionado. Vários de uma vez entram em escada, para nenhum ficar escondido embaixo do outro. O que não é imagem nem som é recusado.",
      },
      {
        tipo: "novidade",
        titulo: "O aplicativo diz em que versão está, e o que mudou",
        detalhe:
          "Esta lista. Ela viaja dentro do pacote, então continua legível na mesa sem Wi-Fi.",
      },
      {
        tipo: "novidade",
        titulo: "A tela de entrada é uma só, com as novidades num painel ao lado",
        detalhe:
          "Antes havia duas telas diferentes conforme você já tivesse ou não uma campanha na lista. Agora é a mesma, e o histórico inteiro fica num painel próprio encostado na borda da janela, com rolagem própria.",
      },
      {
        tipo: "novidade",
        titulo: "As abas e os divisores da bancada ficaram visíveis",
        detalhe:
          "As abas passam a ler como aba, coladas no painel que abrem, e cada divisor entre colunas ganhou uma alça que acende quando a mão chega perto — antes era um fio invisível que só se revelava ao ser acertado.",
      },
      {
        tipo: "correcao",
        titulo: "Abrir o aplicativo entrava direto na última campanha",
        detalhe:
          "A lista de campanhas só aparecia na primeira execução ou depois de fechar a mesa. Quem tem duas campanhas esperava a errada ser lida do disco inteira antes de poder trocar. Recarregar a janela na tela de entrada também caía dentro de uma campanha.",
      },
      {
        tipo: "correcao",
        titulo: "Trocar de campanha mantinha o elenco da anterior",
        detalhe:
          "Os personagens da campanha antiga apareciam na nova, e o nome do token vinha errado junto. Só recarregando a janela voltava ao certo.",
      },
      {
        tipo: "correcao",
        titulo: "O mapa ampliado borrava, espremia e engrossava os controles",
        detalhe:
          "Três defeitos do zoom, no mesmo lugar: o mapa e os tokens saíam borrados, passado mais ou menos 400% o mapa encolhia num eixo só e sumia, e o traço dos ícones do gizmo engrossava conforme se ampliava.",
      },
      {
        tipo: "correcao",
        titulo: "A nota fixada no mapa não arrastava, e o zoom deformava o cartão",
        detalhe:
          "O cabeçalho do cartão é a alça, e ele não respondia ao arrasto. Junto: clicar no mapa com o cursor dentro do título ou do corpo da nota deixava o campo focado, e o que se digitasse depois — atalho de tecla inclusive — ia para a nota em vez de ir para a mesa.",
      },
      {
        tipo: "correcao",
        titulo: "Tirar ou trocar o mapa de fundo devolvia o arquivo ao acervo",
        detalhe:
          "O mapa entrou na campanha para ser o fundo daquela cena. Agora, tirado o fundo, ele sai da campanha em vez de virar mais um arquivo pesado para apagar depois.",
      },
      {
        tipo: "correcao",
        titulo: "O arquivo recém-importado não chegava a todas as telas",
        detalhe:
          "Anexar uma miniatura na ficha do personagem não atualizava o acervo, e o botão de pôr o token no mapa ficava desabilitado dizendo “Lendo o acervo” até o aplicativo ser reaberto.",
      },
      {
        tipo: "correcao",
        titulo: "Rolar a tela de entrada levava a barra de título embora",
        detalhe:
          "A barra saía por cima e o conteúdo era cortado.",
      },
      {
        tipo: "correcao",
        titulo: "A tela de carregamento dizia “Abrindo a campanha” sem abrir campanha nenhuma",
        detalhe:
          "O que ela espera ali é a lista de campanhas da máquina, e ela ainda chegava depois do trabalho já feito.",
      },
    ],
  },
  {
    versao: "0.0.3",
    data: "2026-09-14",
    mudancas: [
      {
        tipo: "correcao",
        titulo: "No Linux, o aplicativo abria numa janela branca",
        detalhe:
          "O pacote trazia uma biblioteca de vídeo que atropelava a da máquina, e o processo que desenha a tela morria antes de desenhar qualquer coisa — sem mensagem, porque quem escreveria a mensagem era ele. Agora o aplicativo usa a da máquina.",
      },
    ],
  },
  {
    versao: "0.0.2",
    data: "2026-09-14",
    mudancas: [
      {
        tipo: "correcao",
        titulo:
          "Abrir uma campanha travava para sempre em “Acervo de imagens e sons”",
        detalhe:
          "Faltavam no pacote os componentes de áudio, e sem eles a tela morria no meio do carregamento. Com eles, a trilha também voltou a tocar.",
      },
      {
        tipo: "novidade",
        titulo: "O AppImage se instala no menu sozinho",
        detalhe:
          "Na primeira abertura ele escreve o próprio atalho, e passa a aparecer no rofi, no wofi e no menu do ambiente. Se você mover o arquivo de pasta, o atalho se corrige na abertura seguinte.",
      },
    ],
  },
  {
    versao: "0.0.1",
    data: "2026-09-14",
    mudancas: [
      {
        tipo: "novidade",
        titulo: "Primeira versão pública",
        detalhe:
          "Instaladores para Linux e Windows, e o aviso de versão nova dentro do aplicativo.",
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
