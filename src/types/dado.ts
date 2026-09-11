/**
 * Os dados de mesa.
 *
 * Arquivo próprio, e não dentro de `scene.ts`: dado não é conteúdo de mapa. A
 * `Medida` da régua também não é e mora lá, mas ela é um par de pontos — aqui
 * há geometria, orientação e histórico, e enfiar isso na cena daria a entender
 * que dado viaja no zip junto com a névoa e os riscos. Não viaja. Ver
 * `useDadosStore`.
 */

/** Quantas faces. Não é `number`: só existem estes seis sólidos. */
export type FacesDado = 20 | 12 | 10 | 8 | 6 | 4;

/**
 * Um dado do jogo: quantas faces, e a cor dele.
 *
 * Uma cor por TIPO, e cada tipo com a sua. A cor não é enfeite — ela é como a
 * mesa chama o dado antes de contar as faces: "me passa o vermelho". Reconhecer
 * a cor é mais rápido que contar lados, e num saquinho de seis o gesto é sempre
 * o mesmo dado para o mesmo teste.
 *
 * Antes eram seis d20 de cores diferentes. Trocou porque a cor estava fazendo o
 * trabalho errado: distinguia rolagens simultâneas do MESMO dado, que é um
 * problema que a mesa não tem, em vez de distinguir dados diferentes, que é o
 * que ela pede toda hora.
 *
 * Tons de pedra e resina, escuros: um dado tem volume, e a face iluminada e a
 * face na sombra precisam caber na mesma cor sem uma delas virar branco ou
 * preto. Ver `corDaFace`.
 */
export type TipoDado = {
  faces: FacesDado;
  /** Como se chama: `d20`. */
  nome: string;
  /** A cor da face virada para a luz. As outras saem dela, sombreadas. */
  hex: string;
  /** A cor do número gravado. Clara em dado escuro, escura em dado claro. */
  tinta: string;
  /**
   * Ajuste de tamanho, sobre o raio comum.
   *
   * Existe porque raio igual não é TAMANHO igual: com o mesmo circunraio, o
   * cubo tem silhueta larga e o icosaedro quase redonda, e o d6 saía maior que
   * o d20 — o contrário de qualquer jogo de dados de verdade. Os números saem
   * de olhar os seis lado a lado no tamanho em que eles aparecem no tabuleiro,
   * não de uma fórmula.
   *
   * O d4 é o que mais desvia, para cima: o tetraedro é o sólido que menos
   * aproveita a esfera em que está inscrito, então no mesmo raio ele vira um
   * triangulinho — e ele é justo o que mais precisa de espaço, porque carrega
   * três números por face em vez de um.
   */
  escala: number;
};

/**
 * O saquinho, na ordem em que ele abre.
 *
 * Do maior para o menor, que é a ordem em que a mesa fala deles e a ordem em que
 * eles aparecem em qualquer jogo vendido. O d20 primeiro também porque é o mais
 * usado, e o primeiro alvo da fileira é o mais fácil de acertar.
 */
export const TIPOS_DADO: readonly TipoDado[] = [
  { faces: 20, nome: "d20", hex: "#b91c1c", tinta: "#fee2e2", escala: 1 },
  { faces: 12, nome: "d12", hex: "#7e22ce", tinta: "#f3e8ff", escala: 0.98 },
  { faces: 10, nome: "d10", hex: "#1d4ed8", tinta: "#dbeafe", escala: 1.02 },
  { faces: 8, nome: "d8", hex: "#15803d", tinta: "#dcfce7", escala: 0.92 },
  { faces: 6, nome: "d6", hex: "#b45309", tinta: "#fef3c7", escala: 0.82 },
  { faces: 4, nome: "d4", hex: "#e7e5e4", tinta: "#44403c", escala: 1.22 },
];

export function tipoDado(faces: FacesDado): TipoDado {
  return TIPOS_DADO.find((tipo) => tipo.faces === faces) ?? TIPOS_DADO[0];
}

/**
 * Os números GRAVADOS nas faces, na ordem crescente.
 *
 * O d10 é o único que começa em zero, e é assim que quase todo d10 físico vem:
 * `0` a `9`, para dois deles darem uma porcentagem.
 *
 * Gravado e não valor de propósito, e é a numeração 0-9 que sustenta a
 * geometria: com ela as faces opostas do d10 somam nove — `0-9`, `1-8`, `2-7`,
 * `3-6`, `4-5` —, exatamente como num d10 de verdade. Numerar de 1 a 10 por
 * dentro e imprimir zero no lugar do dez quebraria esse par: o `1` cairia
 * oposto ao `0`, e nenhum d10 do mundo é assim.
 *
 * Quanto a face VALE é outra pergunta. Ver `valorDaRolagem`.
 */
export function rotulosDoDado(faces: FacesDado): number[] {
  const inicio = faces === 10 ? 0 : 1;
  return Array.from({ length: faces }, (_, i) => inicio + i);
}

/**
 * Quanto a face vale, que não é sempre o que está gravado nela.
 *
 * O zero do d10 vale DEZ. É a leitura da mesa, e é a única face de todo o jogo
 * em que o gravado e o valor divergem — o d10 é numerado de zero a nove porque
 * dois deles dão uma porcentagem, mas jogado sozinho ele é um dado de dez.
 *
 * Existe como função e não como campo guardado porque o gravado é o que a
 * geometria precisa para achar a face — ver `orientacaoParaValor` — e o valor é
 * o que a mesa precisa para somar. Guardar os dois convidaria os dois a
 * divergirem; converter na LEITURA mantém uma verdade só, com a tradução num
 * lugar só.
 */
export function valorDaRolagem(faces: FacesDado, gravado: number): number {
  return faces === 10 && gravado === 0 ? 10 : gravado;
}

/** Quaternion unitário: a orientação do dado no espaço. `w` é a parte real. */
export type Quat = { x: number; y: number; z: number; w: number };

/**
 * Um dado no tabuleiro.
 *
 * `valor` existe desde o nascimento, ANTES de o dado parar de girar: quem
 * sorteia é o lançamento, e a animação é levada até a orientação que mostra
 * aquela face. Ver `sortearValor` e `orientacaoParaValor`.
 *
 * Isso é de propósito, e não atalho de implementação. Física decidindo o número
 * dá um número que só existe no quadro em que o dado parou: não há como
 * conferir, não há como repetir, e não há como publicar para a mesa sem mandar
 * a simulação inteira e rezar para os dois lados chegarem no mesmo lugar. Com o
 * sorteio na frente, publicar é mandar `{ faces, valor, semente, impulso }`.
 */
export type Dado = {
  id: string;
  faces: FacesDado;
  /** Onde ele está pousado, em unidades de cena. */
  x: number;
  y: number;
  /** O raio, em unidades de cena, já com a `escala` do tipo aplicada. */
  raio: number;
  /**
   * O número GRAVADO na face que ele mostra. Já decidido, mesmo enquanto gira.
   *
   * Gravado, não valor: no d10 a face de zero vale dez. Ver `valorDaRolagem`,
   * por onde passa toda leitura — soma, histórico e rótulo.
   */
  valor: number;
  /**
   * Com que velocidade e para onde foi arremessado, em unidades de cena por
   * segundo. `{0,0}` = largado parado.
   *
   * Guardado no dado e não recalculado: é o gesto que aconteceu, e a queda é
   * função dele. Sem isto a trajetória tinha de ser sorteada, e arremessar
   * valia o mesmo que largar. Ver `quadroDaQueda`.
   */
  impulso: { x: number; y: number };
  /**
   * Semente da tombada: mesma semente, mesmo eixo de giro e mesmo desvio de
   * rota. O que ela NÃO decide é para onde o dado vai — isso é o `impulso`.
   */
  semente: number;
  /** Quando foi lançado, em `Date.now()`. A animação sai da idade dele. */
  lancadoEm: number;
};

/** Uma linha do histórico. */
export type Rolagem = {
  id: string;
  faces: FacesDado;
  /** O número gravado, como no `Dado`. Ver `valorDaRolagem`. */
  valor: number;
  quando: number;
};

/**
 * A rolagem de um JOGADOR, que é a que viaja.
 *
 * Nasce no daemon e não no aparelho — ver `POST /eu/rolagens`. O celular pede
 * um dado, o daemon sorteia, e o número que volta é o que o celular anima e o
 * que a mesa vê. Sorteado no aparelho de quem se beneficia dele, um vinte seria
 * indefensável.
 *
 * Leva o NOME junto com o id do jogador. O id amarra ao personagem quando há
 * vínculo; o nome é o que a tela desenha quando não há — jogador sem personagem
 * também rola dado.
 */
export type RolagemDaMesa = Rolagem & {
  jogadorId: string;
  jogador: string;
  /**
   * O personagem de quem rolou, quando o mestre já os vinculou.
   *
   * Resolvido pelo OPERADOR, e não pelo daemon nem pelo celular: o vínculo mora
   * no cofre da campanha, e nem a TV nem o telefone o alcançam. É ele que diz em
   * qual retrato a TV pendura o dado. Ausente = desenha pelo nome.
   */
  personagemId?: string;
};

/**
 * Sorteio sem viés, entre os números gravados no dado.
 *
 * Devolve o GRAVADO, então um d10 sorteia entre zero e nove. A distribuição é a
 * mesma de sortear entre um e dez, porque a tradução de `valorDaRolagem` é uma
 * troca de nome e não uma dobra: nenhum valor sai por dois caminhos.
 *
 * `crypto.getRandomValues` e não `Math.random`: não é por segurança — é porque
 * um dado é a coisa que a mesa mais quer poder acusar de ser viciada, e "usa o
 * gerador do sistema" é uma resposta melhor do que "usa o do JavaScript".
 *
 * O laço descarta o resto da faixa em vez de tirar módulo direto. `2^32` não é
 * múltiplo de 20 nem de 12 nem de 10, então o módulo puro faria os primeiros
 * valores saírem um tiquinho mais que os últimos — invisível numa sessão, e
 * exatamente o tipo de defeito que não se quer ter de defender.
 */
export function sortearValor(faces: FacesDado): number {
  const limite = Math.floor(0x1_0000_0000 / faces) * faces;
  const buffer = new Uint32Array(1);

  let bruto = 0;
  do {
    crypto.getRandomValues(buffer);
    bruto = buffer[0];
  } while (bruto >= limite);

  return rotulosDoDado(faces)[bruto % faces];
}
