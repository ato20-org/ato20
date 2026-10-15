"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { normalizarGraus } from "@/lib/geometry/porta";
import type { Porta } from "@/types/scene";

/** Quanto a porta leva para abrir ou fechar de uma vez: o botão, o menu, o Ctrl+Z. */
export const GIRO_MS = 450;
/**
 * A mudança que chega mais perto que isto da anterior é ARRASTO, e não botão:
 * o mestre girando a folha à mão, chegando à TV dez vezes por segundo. Essa
 * vai direto, sem giro.
 *
 * Medido na webview, quarenta luzes e uma porta arrastada: alisar as amostras
 * do arrasto (um giro curto entre uma e a seguinte) levou os quadros perdidos
 * de 8% a 33%. Cada quadro do giro forma de novo toda luz que alcança a folha,
 * e alisar é fazer isso sessenta vezes por segundo em vez de dez. O botão
 * paga o mesmo, mas por meio segundo.
 */
const RAJADA_MS = 250;

type Giro = {
  /** De onde a folha sai e aonde chega, em graus de abertura. Fechada = 0. */
  de: number;
  para: number;
  /**
   * O instante do primeiro quadro do giro. Ausente até ele chegar: o render
   * não lê relógio, e a folha fica em `de` até lá -- é o que impede a porta de
   * aparecer aberta por um quadro antes de começar a abrir.
   */
  inicio?: number;
  duracao: number;
};

type Estado = {
  /** As portas para as quais estes giros foram montados. */
  fonte: ReadonlyArray<Porta> | undefined;
  giros: ReadonlyMap<string, Giro>;
  /** O instante do último quadro. É a hora que o render usa. */
  quadro: number;
};

const SEM_GIRO: ReadonlyMap<string, Giro> = new Map();

/** Começa devagar, acelera e chega devagar: uma porta empurrada. */
function suave(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function noGiro(giro: Giro, quadro: number): number {
  if (giro.inicio === undefined) return giro.de;
  const t = Math.min(1, Math.max(0, (quadro - giro.inicio) / giro.duracao));
  return giro.de + normalizarGraus(giro.para - giro.de) * suave(t);
}

/**
 * As portas como a tela deve desenhá-las AGORA: a folha que acabou de mudar
 * gira até a abertura nova, em vez de saltar.
 *
 * Cada tela anima a sua, como a luz e a câmera: a cena que chega pelo canal
 * já traz a porta aberta, e é a tela que a faz girar até lá. Assim o botão do
 * mestre manda UMA amostra, e não meio segundo delas.
 *
 * Só a mudança ISOLADA gira -- o botão, o menu, o Ctrl+Z. A que chega em
 * rajada, o arrasto do mestre visto da TV, vai direto: ver `RAJADA_MS`.
 *
 * `naMao` é a porta que a mão do mestre está girando: ela vai direto, sem
 * giro nenhum -- é manipulação direta, e a folha correndo atrás do cursor
 * seria o contrário. É a regra do token e da lanterna. Ver `LuzLayer`.
 *
 * Sem giro em curso devolve a MESMA lista, e quem a memoiza não refaz nada.
 */
export function usePortasNoGiro(
  portas: Porta[] | undefined,
  naMao?: string,
): Porta[] | undefined {
  const [estado, setEstado] = useState<Estado>({
    fonte: portas,
    giros: SEM_GIRO,
    quadro: 0,
  });
  /** Quando cada porta começou a girar pela última vez. Ver `RAJADA_MS`. */
  const mudancas = useRef(new Map<string, number>());

  // O laço da animação: um quadro por vez, e só enquanto há giro. Cada quadro
  // troca o estado, e o estado novo pede o quadro seguinte.
  useEffect(() => {
    if (estado.giros.size === 0) return;

    const pedido = requestAnimationFrame((agora) => {
      // A duração de quem acabou de começar: zero na rajada, que é chegar
      // direto. Fora do `setEstado`, porque lê e escreve o relógio das
      // mudanças, e o atualizador tem de ser puro.
      const duracoes = new Map<string, number>();
      for (const [id, giro] of estado.giros) {
        if (giro.inicio !== undefined) continue;
        const anterior = mudancas.current.get(id);
        duracoes.set(
          id,
          anterior !== undefined && agora - anterior < RAJADA_MS ? 0 : GIRO_MS,
        );
        mudancas.current.set(id, agora);
      }

      setEstado((atual) => {
        const giros = new Map<string, Giro>();
        for (const [id, giro] of atual.giros) {
          const inicio = giro.inicio ?? agora;
          const duracao =
            giro.inicio === undefined
              ? (duracoes.get(id) ?? giro.duracao)
              : giro.duracao;
          if (agora - inicio < duracao) {
            giros.set(id, { ...giro, inicio, duracao });
          }
        }
        return { ...atual, giros, quadro: agora };
      });
    });

    return () => cancelAnimationFrame(pedido);
  }, [estado.giros]);

  const vistas = useMemo(() => {
    if (estado.giros.size === 0 || !portas) return portas;

    return portas.map((porta) => {
      const giro = estado.giros.get(porta.id);
      if (!giro) return porta;
      const abertura = noGiro(giro, estado.quadro);
      return {
        ...porta,
        abertura: Math.abs(abertura) < 0.5 ? undefined : abertura,
      };
    });
  }, [portas, estado]);

  // As portas mudaram: monta os giros de quem mudou de abertura. Estado
  // ajustado durante o render, o padrão do `useCorteDeCamera`: um efeito
  // desenharia por um quadro a porta já aberta, antes de o giro começar.
  if (portas !== estado.fonte) {
    const antes = new Map((estado.fonte ?? []).map((porta) => [porta.id, porta]));
    const giros = new Map<string, Giro>();

    for (const porta of portas ?? []) {
      const anterior = antes.get(porta.id);
      // A porta nova aparece onde está, e a da mão vai direto.
      if (!anterior || porta.id === naMao) continue;

      const alvo = porta.abertura ?? 0;
      const corrente = estado.giros.get(porta.id);
      // O giro em curso para o mesmo lugar segue como estava: outra porta
      // mudou, e recomeçar este o faria tropeçar no meio.
      if (corrente && corrente.para === alvo) {
        giros.set(porta.id, corrente);
        continue;
      }

      const vista = corrente
        ? noGiro(corrente, estado.quadro)
        : (anterior.abertura ?? 0);
      if (Math.abs(normalizarGraus(alvo - vista)) < 0.5) continue;

      giros.set(porta.id, { de: vista, para: alvo, duracao: GIRO_MS });
    }

    setEstado({
      fonte: portas,
      giros: giros.size > 0 ? giros : SEM_GIRO,
      quadro: estado.quadro,
    });
  }

  return vistas;
}
