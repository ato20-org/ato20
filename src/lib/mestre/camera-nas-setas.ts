"use client";

import { clampCamera } from "@/lib/geometry/viewport";
import {
  cameraSelecionada,
  gravarCameraManual,
  PASSO_CAMERA,
  PASSO_CAMERA_LARGO,
} from "@/lib/mestre/camera-actions";
import { useCameraLockStore } from "@/lib/store/use-camera-lock-store";
import {
  moverCameraNoGesto,
  useGestoStore,
} from "@/lib/store/use-gesto-store";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import type { Viewport } from "@/types/scene";

/**
 * A câmera nas setas anda pelo RELÓGIO, e não pela repetição da tecla.
 *
 * Cada toque era um salto de 5%, e segurar a seta entregava o resto ao
 * teclado: o primeiro salto, meio segundo parado até o sistema começar a
 * repetir, e então trinta saltos por segundo. A TV recebe a cena a 10 Hz, e
 * cada amostra trazia dois, três ou quatro saltos conforme a repetição caía
 * na janela -- a velocidade mudava de amostra para amostra. E o primeiro salto
 * chegava sozinho, com a curva longa de enquadrar, que desacelera até parar:
 * a mesa via a câmera andar, frear, ficar parada e arrancar de novo. Isso é o
 * "travado". Por baixo, cada repetição era um commit no board inteiro.
 *
 * Aqui a seta segurada é um GESTO, como o V do cinegrafista: enquanto o dedo
 * está nela a câmera anda a uma velocidade fixa, calculada pelo tempo de cada
 * quadro, pelo `moverCameraNoGesto` -- o board recebe uma gravação só, quando
 * a câmera para. A velocidade entra e sai por um embalo curto (`EMBALO_S`), e
 * é ele que faz o arranque e a parada chegarem à TV como curva, e não como
 * tranco.
 *
 * O toque continua sendo o passo: soltar antes do tempo deixa a câmera andar
 * até completá-lo. Ver `minimo` em `Seta`.
 */

/**
 * Quanto a câmera anda por segundo com a seta segurada, em larguras dela -- e
 * alturas, no eixo de cima e de baixo, como o passo.
 *
 * Três quartos: a sala atravessa a TV em pouco mais de um segundo, depressa o
 * bastante para o mestre chegar aonde quer e devagar o bastante para a mesa
 * acompanhar o caminho. Com Shift é a viagem pelo mapa, quatro vezes isso.
 */
export const VELOCIDADE_CAMERA = 0.75;
export const VELOCIDADE_CAMERA_LARGA = 3;

/**
 * Quanto a câmera leva para pegar e perder a velocidade, em segundos: a
 * constante de tempo do embalo.
 *
 * Um décimo. A mão não sente o atraso, e o arranque se desenha em umas três
 * amostras do canal -- é o que a TV precisa para ver uma curva. Mais curto, a
 * parada volta a chegar à mesa num quadro só.
 */
const EMBALO_S = 0.1;

/**
 * O que o embalo ainda andaria, como fração da câmera, abaixo do qual ela
 * parou. Um vinte avos de um por cento: menos de um pixel na TV.
 */
const RESTO = 0.0005;

/** Uma seta apertada, com o intervalo em que ela empurra. */
export type SetaSegurada = {
  /** O sentido em cada eixo: -1, 0 ou 1. */
  x: number;
  y: number;
  /** Quando foi apertada, no relógio do `performance.now()`. */
  desde: number;
  /** Até quando empurra. Infinito enquanto o dedo está nela. */
  ate: number;
};

/** A velocidade em que a câmera está, em frações dela por segundo. */
export type Embalo = { vx: number; vy: number };

/**
 * Anda de `de` a `ate` (ms): devolve o deslocamento, em frações da câmera, e
 * o embalo com que ela chega ao fim.
 *
 * A velocidade persegue a das setas que estão empurrando, e a distância é a
 * integral EXATA dessa perseguição, e não velocidade vezes quadro. É o que
 * faz o percurso não depender da cadência: um quadro atrasado anda mais,
 * dois adiantados andam menos, e a soma é a mesma. Pela mesma razão o
 * intervalo é cortado onde uma seta começa ou para de empurrar -- soltar a
 * tecla no meio de um quadro vale do instante em que ela subiu.
 *
 * Com isso o percurso inteiro é a velocidade vezes o tempo em que alguma seta
 * empurrou: o embalo atrasa a câmera no arranque e devolve o atraso na
 * parada. Um toque anda exatamente o passo.
 *
 * Duas setas juntas andam na diagonal na MESMA velocidade de uma, e duas
 * opostas se anulam.
 */
export function andarComAsSetas(
  embalo: Embalo,
  setas: readonly SetaSegurada[],
  velocidade: number,
  de: number,
  ate: number,
): Embalo & { dx: number; dy: number } {
  const cortes = [de, ate];
  for (const seta of setas) {
    if (seta.desde > de && seta.desde < ate) cortes.push(seta.desde);
    if (seta.ate > de && seta.ate < ate) cortes.push(seta.ate);
  }
  cortes.sort((a, b) => a - b);

  let { vx, vy } = embalo;
  let dx = 0;
  let dy = 0;

  for (let i = 1; i < cortes.length; i++) {
    const inicio = cortes[i - 1]!;
    const fim = cortes[i]!;
    const dt = (fim - inicio) / 1000;
    if (dt <= 0) continue;

    // Entre dois cortes o conjunto de setas não muda; o meio do trecho diz
    // quais valem sem a dúvida da borda.
    const meio = (inicio + fim) / 2;
    let sx = 0;
    let sy = 0;
    for (const seta of setas) {
      if (seta.desde <= meio && meio < seta.ate) {
        sx += seta.x;
        sy += seta.y;
      }
    }

    const norma = Math.hypot(sx, sy);
    const alvoX = norma > 0 ? (sx / norma) * velocidade : 0;
    const alvoY = norma > 0 ? (sy / norma) * velocidade : 0;

    // v(t) = alvo + (v0 - alvo)·e^(-t/τ), e a distância é a integral dela.
    const decai = Math.exp(-dt / EMBALO_S);
    dx += alvoX * dt + (vx - alvoX) * EMBALO_S * (1 - decai);
    dy += alvoY * dt + (vy - alvoY) * EMBALO_S * (1 - decai);
    vx = alvoX + (vx - alvoX) * decai;
    vy = alvoY + (vy - alvoY) * decai;
  }

  return { vx, vy, dx, dy };
}

/** O embalo já não leva a câmera a lugar nenhum que a mesa veja. */
export function parou(embalo: Embalo): boolean {
  return Math.hypot(embalo.vx, embalo.vy) * EMBALO_S < RESTO;
}

type Seta = SetaSegurada & {
  /** `event.key` da tecla, para o toque seguinte achar o anterior. */
  tecla: string;
  /**
   * Até quando este toque empurra, mesmo solto antes: o tempo de andar um
   * passo na velocidade em que ele foi dado. É o que mantém o toque como o
   * passo de sempre -- 5%, ou 25% com Shift.
   */
  minimo: number;
};

type Andando = {
  sceneId: string;
  cameraId: string;
  /** Toda seta que ainda empurra, ou que empurrou desde o último quadro. */
  setas: Seta[];
  /** A seta de cada tecla que ainda está apertada. */
  seguradas: Map<string, Seta>;
  embalo: Embalo;
  /**
   * Onde a câmera está neste gesto. `null` é "releia do board": no começo, e
   * depois de gravar no meio do caminho (ver `aoUsarOutraCoisa`).
   */
  recorte: Viewport | null;
  rapido: boolean;
  /** Até onde o relógio já foi andado. */
  ultimo: number;
  quadro: number;
};

/**
 * O gesto em curso. Variável de módulo, como o abridor da roda de ping: a
 * tabela de atalhos chama, e ninguém desenha a partir disto -- o palco lê o
 * `useGestoStore`, como sempre.
 */
let andando: Andando | null = null;

const MODIFICADORES = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta"]);

function velocidadeDe(rapido: boolean): number {
  return rapido ? VELOCIDADE_CAMERA_LARGA : VELOCIDADE_CAMERA;
}

/**
 * A seta da câmera foi apertada -- ou repetida, que o teclado manda como
 * outro `keydown`. A tabela de atalhos chama isto; soltar é ouvido aqui.
 */
export function segurarSetaDaCamera(
  evento: KeyboardEvent,
  sentido: { x: number; y: number },
): void {
  const agora = performance.now();
  const estado = andando ?? comecar(agora);
  if (!estado) return;

  estado.rapido = evento.shiftKey;

  // A repetição da tecla não é mudança nenhuma: quem anda é o relógio.
  if (estado.seguradas.has(evento.key)) return;

  const passo = evento.shiftKey ? PASSO_CAMERA_LARGO : PASSO_CAMERA;
  const duracao = (passo / velocidadeDe(evento.shiftKey)) * 1000;

  // Toque em cima de toque, antes de o primeiro completar o passo: o novo
  // soma o dele ao que falta. Três toques rápidos são três passos, e não um
  // passo que recomeçou três vezes.
  const anterior = estado.setas.find(
    (seta) => seta.tecla === evento.key && seta.ate > agora,
  );
  if (anterior) {
    anterior.ate = Infinity;
    anterior.minimo += duracao;
    estado.seguradas.set(evento.key, anterior);
    return;
  }

  const seta: Seta = {
    ...sentido,
    tecla: evento.key,
    desde: agora,
    ate: Infinity,
    minimo: agora + duracao,
  };
  estado.setas.push(seta);
  estado.seguradas.set(evento.key, seta);
}

function comecar(agora: number): Andando | null {
  const scene = selectEditingScene(useSceneStore.getState());
  const camera = cameraSelecionada();
  if (!scene || !camera) return null;

  // A trava sai no COMEÇO, pelo mesmo motivo do cinegrafista: o gesto não
  // passa por `gravarCameraManual` a cada quadro, e uma câmera presa a tokens
  // seria puxada de volta pelo seguidor enquanto a seta a leva embora.
  useCameraLockStore.getState().soltar();

  andando = {
    sceneId: scene.id,
    cameraId: camera.id,
    setas: [],
    seguradas: new Map(),
    embalo: { vx: 0, vy: 0 },
    recorte: null,
    rapido: false,
    ultimo: agora,
    quadro: requestAnimationFrame(andar),
  };
  ouvir(true);

  return andando;
}

function andar(): void {
  const estado = andando;
  if (!estado) return;

  const agora = performance.now();
  const camera = cameraSelecionada();
  if (!camera) {
    parar();
    return;
  }

  // Trocou de câmera com a seta na mão: a seta anda a SELECIONADA, e passa a
  // andar a nova. A anterior fica onde o gesto a deixou.
  if (camera.id !== estado.cameraId) {
    gravar(estado);
    estado.cameraId = camera.id;
    estado.sceneId = selectEditingScene(useSceneStore.getState())?.id ?? "";
    useCameraLockStore.getState().soltar();
  }

  const recorte = (estado.recorte ??= camera.viewport);
  const passo = andarComAsSetas(
    estado.embalo,
    estado.setas,
    velocidadeDe(estado.rapido),
    estado.ultimo,
    agora,
  );
  estado.ultimo = agora;
  estado.setas = estado.setas.filter((seta) => seta.ate > agora);

  const solto = {
    ...recorte,
    x: recorte.x + passo.dx * recorte.width,
    y: recorte.y + passo.dy * recorte.height,
  };
  const preso = clampCamera(solto, useViewportStore.getState().conteudo);

  // Na parede o embalo daquele eixo some. Guardado, ele seguiria empurrando a
  // câmera contra a borda, e virar a seta para voltar esperaria o embalo se
  // desfazer antes de sair do lugar.
  estado.embalo = {
    vx: Math.abs(preso.x - solto.x) > 1e-6 ? 0 : passo.vx,
    vy: Math.abs(preso.y - solto.y) > 1e-6 ? 0 : passo.vy,
  };

  if (!mesmoRecorte(preso, recorte)) {
    estado.recorte = preso;
    moverCameraNoGesto(estado.sceneId, estado.cameraId, preso);
  }

  if (estado.setas.length === 0 && parou(estado.embalo)) {
    parar();
    return;
  }

  estado.quadro = requestAnimationFrame(andar);
}

/** A câmera parou: o que ela andou vai para o board, de uma vez. */
function parar(): void {
  const estado = andando;
  if (!estado) return;

  andando = null;
  cancelAnimationFrame(estado.quadro);
  ouvir(false);
  gravar(estado);
}

/**
 * Grava no board o recorte deste gesto e larga a câmera do `useGestoStore`.
 *
 * Só se a cena ainda for a que está aberta: `gravarCameraManual` grava na cena
 * em edição, e a câmera de uma cena que o mestre já trocou não mora nela.
 * E só se andou -- a seta contra a parede não é passo de desfazer.
 */
function gravar(estado: Andando): void {
  const { recorte } = estado;
  estado.recorte = null;
  if (!recorte) return;

  const scene = selectEditingScene(useSceneStore.getState());
  const noBoard =
    scene?.id === estado.sceneId
      ? scene.cameras?.find((camera) => camera.id === estado.cameraId)
      : undefined;

  if (noBoard && !mesmoRecorte(noBoard.viewport, recorte))
    gravarCameraManual(estado.cameraId, recorte);

  const gesto = useGestoStore.getState();
  if (gesto.camera?.cameraId === estado.cameraId) gesto.soltarCamera();
}

function mesmoRecorte(a: Viewport, b: Viewport): boolean {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}

function aoSoltarTecla(evento: KeyboardEvent): void {
  const estado = andando;
  if (!estado) return;

  // Soltar o Shift no meio volta à velocidade de sempre.
  estado.rapido = evento.shiftKey;

  const seta = estado.seguradas.get(evento.key);
  if (!seta) return;

  estado.seguradas.delete(evento.key);
  seta.ate = Math.max(performance.now(), seta.minimo);
}

/**
 * Outra tecla, ou o mouse, no meio do caminho: grava o que a seta andou, e
 * ela continua dali.
 *
 * Porque todo outro gesto de câmera parte do BOARD. Aproximar com `=`, a roda
 * na alça, o slider da pílula, trocar de câmera pelo número -- todos leem o
 * recorte gravado, e o gravado é o de quando a seta foi apertada. Sem isto,
 * aproximar segurando a seta aproximava a câmera lá atrás, a TV pulava para
 * lá, e o gesto da seta, que ainda a desenhava com o tamanho antigo, desfazia
 * o zoom ao soltar. Escutando na CAPTURA, isto roda antes do atalho, e o
 * atalho já encontra o recorte de agora.
 */
function aoUsarOutraCoisa(evento: Event): void {
  const estado = andando;
  if (!estado) return;

  if (evento instanceof KeyboardEvent) {
    estado.rapido = evento.shiftKey;
    // A seta é deste gesto, e o modificador sozinho não faz nada.
    if (evento.key.startsWith("Arrow") || MODIFICADORES.has(evento.key)) return;
  }

  gravar(estado);
}

/**
 * A janela perdeu o foco: a tecla solta lá fora nunca chega como `keyup`.
 * Toda seta é solta agora, e a câmera para com o embalo de sempre.
 */
function aoSairDaJanela(): void {
  const estado = andando;
  if (!estado) return;

  const agora = performance.now();
  for (const seta of estado.seguradas.values())
    seta.ate = Math.max(agora, seta.minimo);
  estado.seguradas.clear();
}

/** Escondida, a janela não tem quadros para terminar a parada: para já. */
function aoEsconder(): void {
  if (!document.hidden) return;

  aoSairDaJanela();
  parar();
}

function ouvir(ligar: boolean): void {
  if (ligar) {
    window.addEventListener("keydown", aoUsarOutraCoisa, true);
    window.addEventListener("keyup", aoSoltarTecla, true);
    window.addEventListener("pointerdown", aoUsarOutraCoisa, true);
    window.addEventListener("wheel", aoUsarOutraCoisa, {
      capture: true,
      passive: true,
    });
    window.addEventListener("blur", aoSairDaJanela);
    document.addEventListener("visibilitychange", aoEsconder);
    return;
  }

  window.removeEventListener("keydown", aoUsarOutraCoisa, true);
  window.removeEventListener("keyup", aoSoltarTecla, true);
  window.removeEventListener("pointerdown", aoUsarOutraCoisa, true);
  window.removeEventListener("wheel", aoUsarOutraCoisa, true);
  window.removeEventListener("blur", aoSairDaJanela);
  document.removeEventListener("visibilitychange", aoEsconder);
}
