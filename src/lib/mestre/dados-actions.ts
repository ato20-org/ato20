"use client";

import { recusaPorMesaCheia } from "@/lib/mesa-cheia";
import { anunciarDadosNoFio } from "@/lib/mestre/fio-actions";
import type { Jogada } from "@/lib/mestre/notacao-de-dados";
import { RAIO_DADO, useDadosStore } from "@/lib/store/use-dados-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import type { Dado } from "@/types/dado";

/** Velocidade do arremesso sem gesto, em unidades de cena por segundo. */
const IMPULSO = 400;

/**
 * Joga dados na mesa sem gesto, a partir de uma notação.
 *
 * É o caminho da paleta de comandos: ninguém pegou o dado no saquinho nem o
 * arremessou, então não há ponto de queda nem velocidade a converter. O dado
 * nasce no centro do que o mestre está ENQUADRANDO, e não no centro do plano:
 * é para cair onde ele está olhando, e com a câmera apertada num canto do mapa
 * o centro do plano pode estar fora da tela.
 *
 * Vários dados saem em roda ao redor do centro, cada um empurrado para fora,
 * para não nascerem empilhados no mesmo pixel. Quem sorteia continua sendo o
 * `lancar` do store, como no saquinho -- ver o comentário de lá.
 *
 * Para na primeira recusa: a mesa cheia já avisa uma vez, e insistir com os
 * dados restantes repetiria o aviso sem jogar nenhum.
 *
 * Devolve os DADOS, e não só quantos: a API de plugin precisa do valor de
 * cada um para somar. A paleta continua contando.
 */
export function lancarNaMesa({ quantidade, faces }: Jogada): Dado[] {
  const { viewport } = useViewportStore.getState();
  const { lancar } = useDadosStore.getState();

  const centro = {
    x: viewport.x + viewport.width / 2,
    y: viewport.y + viewport.height / 2,
  };

  // Roda um pouco maior que o dado, para dois d20 vizinhos não nascerem se
  // atravessando. Um dado só cai no centro mesmo.
  const roda = quantidade === 1 ? 0 : RAIO_DADO * 1.5;

  const jogados: Dado[] = [];

  for (let i = 0; i < quantidade; i++) {
    if (recusaPorMesaCheia()) break;

    const angulo = (i / quantidade) * Math.PI * 2;
    const direcao = { x: Math.cos(angulo), y: Math.sin(angulo) };

    const dado = lancar(
      faces,
      centro.x + direcao.x * roda,
      centro.y + direcao.y * roda,
      { x: direcao.x * IMPULSO, y: direcao.y * IMPULSO },
    );

    if (!dado) break;
    jogados.push(dado);
  }

  return jogados;
}

/**
 * Quantos dados a paleta conseguiu jogar. Ver `lancarNaMesa`.
 *
 * A paleta põe a jogada no fio, numa linha só; o plugin não passa por aqui —
 * quem decide se a rolagem dele vai ao fio, e com que rótulo, é ele, por
 * `api.chat`.
 */
export function rolarNaMesa(jogada: Jogada): number {
  const dados = lancarNaMesa(jogada);
  anunciarDadosNoFio(dados);

  return dados.length;
}
