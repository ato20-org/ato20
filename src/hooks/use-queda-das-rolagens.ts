"use client";

import { useEffect, useState } from "react";

import { duracaoDaQueda } from "@/lib/geometry/dado";
import type { RolagemDaMesa } from "@/types/dado";

/**
 * Quanto dura a queda de um dado que ESTA tela não viu ser arremessado.
 *
 * Tirada da própria física, e não escrita à mão: é `duracaoDaQueda` de um dado
 * largado parado. Mexer na gravidade ou no assentamento muda as duas juntas, e
 * um número copiado aqui envelheceria calado.
 *
 * Parado, e não o arremesso de verdade, porque o IMPULSO não viaja: ele nasce
 * no dedo de quem rolou e morre no celular dele — a `RolagemDaMesa` leva faces,
 * valor e autor, e nada do gesto. Publicá-lo custaria mexer no daemon para
 * ganhar entre um e nove décimos de segundo de sincronia.
 *
 * A consequência é que a queda da mesa é a mais CURTA possível: quem arremessou
 * com força vê o próprio dado pousar um pouco depois do que pousou na fileira
 * do mestre. É o erro na direção certa — o número chega à mesa junto com o dado
 * de quem rolou, ou logo depois, e nunca antes de ele existir.
 */
export const DURACAO_DA_CHEGADA = duracaoDaQueda({ impulso: { x: 0, y: 0 } });

/**
 * Quando cada rolagem foi vista por esta ABA, em `Date.now()`.
 *
 * ## Por que a chegada, e não o `quando` da rolagem
 *
 * `RolagemDaMesa.quando` é o relógio do DAEMON, que é outra máquina. Cronometrar
 * uma animação por ele é cronometrar pela diferença entre dois relógios: um
 * atraso de dois segundos no relógio da TV faria todo dado nascer já assentado,
 * e um adiantamento faria todos tombarem sem fim. O relógio local não erra sobre
 * si mesmo.
 *
 * ## Por que não basta a lista
 *
 * A cena inteira é republicada a 10 Hz — ver `SCENE_BROADCAST_INTERVAL_MS` —, e
 * a lista de rolagens chega nova a cada quadro. "Chegou agora" não é "está na
 * lista": é "não estava na lista antes".
 *
 * ## Por que fora do React
 *
 * A chegada é um fato do mundo, não estado de tela: é o instante em que este
 * navegador viu o dado pela primeira vez, e ele não muda mais depois. Guardá-lo
 * em `useState` obrigaria a escrever estado DENTRO de um efeito a cada quadro
 * publicado, que é cascata de render — e a fileira do mestre e cada retrato o
 * guardariam em separado, cada um com uma resposta diferente para o mesmo dado.
 */
const CHEGADAS = new Map<string, number>();

/**
 * Quantas chegadas o registro guarda antes de varrer as velhas.
 *
 * A bandeja tem trinta segundos e nunca passa de um punhado, então isto é folga
 * para uma sessão inteira de rolagens — está aqui só para o mapa não crescer
 * sem limite numa janela que fica aberta o dia todo.
 */
const TETO_DE_CHEGADAS = 256;

/**
 * Quando este navegador viu esta rolagem pela primeira vez.
 *
 * Carimba na primeira leitura e devolve o mesmo carimbo daí em diante. Chamada
 * durante o render de propósito: é o único momento que serve — o instante em
 * que o dado aparece na tela é o instante em que ele começa a cair, e carimbar
 * num efeito o deixaria assentado por um quadro antes de saltar para o começo
 * da queda.
 *
 * Idempotente, que é o que a torna segura aí: o segundo render do modo estrito
 * encontra o carimbo do primeiro e não mexe nele.
 *
 * Todo dado visto pela primeira vez CAI, inclusive os que já estavam na mesa
 * quando a tela abriu. Houve uma regra que os fazia nascer assentados — eles não
 * caíram agora, caíram enquanto a tela estava fechada —, e ela saiu porque
 * dependia de um sinalizador de módulo dizendo se a aba já tinha aberto: o
 * recarregamento a quente do desenvolvimento zera o módulo sem remontar os
 * componentes, o sinalizador voltava a ser falso e TODO dado passava a nascer
 * assentado. Um defeito que só aparece depois de editar um arquivo é pior que
 * meia dúzia de dados tombando uma vez na abertura.
 */
function chegadaDe(id: string): number {
  const carimbo = CHEGADAS.get(id);
  if (carimbo !== undefined) return carimbo;

  if (CHEGADAS.size >= TETO_DE_CHEGADAS) {
    // A mais velha primeiro: `Map` itera na ordem de inserção, que aqui é a
    // ordem do tempo.
    for (const antiga of CHEGADAS.keys()) {
      CHEGADAS.delete(antiga);
      if (CHEGADAS.size < TETO_DE_CHEGADAS) break;
    }
  }

  const agora = Date.now();

  CHEGADAS.set(id, agora);

  return agora;
}

/**
 * A queda dos dados que chegaram de fora: quando cada um começou e que horas
 * são agora.
 *
 * Quem desenha faz `instanteDaQueda(chegada.get(id), agora)` e entrega o
 * resultado ao `DadoRolando`. O relógio morre sozinho quando o último assenta.
 */
export function useQuedaDasRolagens(rolagens: RolagemDaMesa[]): {
  /** Quando cada rolagem desta lista começou a cair NESTA tela. */
  chegada: Map<string, number>;
  /** O instante do quadro. Congela quando a última assenta. */
  agora: number;
} {
  const chegada = new Map(
    rolagens.map((rolagem) => [rolagem.id, chegadaDe(rolagem.id)]),
  );

  // A mais NOVA decide quando tudo terminou: nenhuma outra pode assentar depois
  // dela. Um número só, e não o mapa, porque é a dependência do relógio -- com o
  // mapa ali, os dez quadros por segundo da publicação religariam o laço dez
  // vezes por segundo para uma mesa parada.
  const ultima = chegada.size > 0 ? Math.max(...chegada.values()) : 0;

  return { chegada, agora: useRelogioDaQueda(ultima) };
}

/**
 * O relógio da queda: um `requestAnimationFrame` só, que MORRE quando a última
 * rolagem assenta.
 *
 * O mesmo desenho do relógio da `DadoLayer`, e pelo mesmo motivo: o laço não
 * desenha, ele só avança o instante — cada quadro do dado é função pura da idade
 * dele. A mesa sem dado caindo não paga quadro nenhum.
 */
function useRelogioDaQueda(ultima: number): number {
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    if (ultima === 0) return;

    let frame = 0;

    const passo = () => {
      const instante = Date.now();

      setAgora(instante);

      // Depois de publicar o instante, e não antes: assim o último quadro
      // desenhado é o do dado já assentado.
      if ((instante - ultima) / 1000 < DURACAO_DA_CHEGADA) {
        frame = requestAnimationFrame(passo);
      }
    };

    frame = requestAnimationFrame(passo);

    return () => cancelAnimationFrame(frame);
  }, [ultima]);

  return agora;
}

/**
 * O instante a mostrar de uma rolagem, já congelado no pouso.
 *
 * Congelar importa para o `memo` do dado: depois de assentado a pose não muda
 * mais, e uma propriedade que continuasse subindo redesenharia o sólido inteiro
 * a cada quadro enquanto QUALQUER outro dado ainda cai.
 */
export function instanteDaQueda(
  desde: number | undefined,
  agora: number,
): number {
  // Sem carimbo não há queda: a rolagem não passou por `chegadaDe`, e o certo é
  // mostrar a face em vez de inventar um arremesso.
  if (desde === undefined) return DURACAO_DA_CHEGADA;

  return Math.min((agora - desde) / 1000, DURACAO_DA_CHEGADA);
}
