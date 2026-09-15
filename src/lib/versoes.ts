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
  /** Sem o `v` e sem o `-alpha`: é o número do `tauri.conf.json`. */
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
 */
export function versaoAtual(): Versao | undefined {
  return VERSOES[0];
}
