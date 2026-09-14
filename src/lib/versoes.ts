/**
 * O que mudou em cada versão, na voz de quem USA o aplicativo.
 *
 * Viaja DENTRO do pacote, e não é buscada na rede. Duas razões, e a segunda é a
 * que decide: o repositório é privado, então a API de releases do GitHub pediria
 * um token que quem baixou não tem; e um histórico que só existe online some
 * justamente na mesa sem Wi-Fi, que é onde o aplicativo foi feito para rodar.
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
