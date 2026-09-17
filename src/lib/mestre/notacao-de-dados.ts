import { TIPOS_DADO, type FacesDado } from "@/types/dado";

/** O que "2d6" pede: quantos dados, e de quantas faces. */
export type Jogada = { quantidade: number; faces: FacesDado };

/**
 * Mais que isto de uma vez e a paleta recusa: a mesa tem teto, e uma linha
 * que pede cinquenta dados é quase sempre um dedo a mais no número.
 */
export const MAX_DADOS_POR_JOGADA = 20;

const NOTACAO = /^(?:roll|rolar|r)?\s*(\d*)\s*d\s*(\d+)$/i;

/**
 * Lê uma notação de dados, como "2d6", "d20" ou "roll 3d8".
 *
 * Só o que o saquinho tem: d4, d6, d8, d10, d12 e d20. Um "d7" não é erro de
 * digitação que valha adivinhar, é um dado que a mesa não tem, e a paleta
 * simplesmente não oferece a linha. Modificadores ("+2") ficam de fora de
 * propósito: o dado da mesa mostra a face que caiu, e somar bônus é conta de
 * quem joga.
 */
export function lerNotacaoDeDados(texto: string): Jogada | null {
  const casou = NOTACAO.exec(texto.trim());
  if (!casou) return null;

  const quantidade = casou[1] === "" ? 1 : Number(casou[1]);
  const faces = Number(casou[2]);

  if (!Number.isInteger(quantidade) || quantidade < 1) return null;
  if (quantidade > MAX_DADOS_POR_JOGADA) return null;

  const tipo = TIPOS_DADO.find((atual) => atual.faces === faces);
  if (!tipo) return null;

  return { quantidade, faces: tipo.faces };
}
