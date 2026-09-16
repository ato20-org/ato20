"use client";

import { useEffect, useState } from "react";

import type { Scene, Viewport } from "@/types/scene";

/** Quanto a cortina leva para fechar. A troca de recorte acontece no escuro. */
const FECHAR_MS = 180;
/** E para abrir. Um pouco mais longa: a cena nova entra, não estala. */
const ABRIR_MS = 260;

type Exibido = {
  cameraId: string | undefined;
  sceneId: string | undefined;
  /** Sobe a cada corte. O `SceneStage` lê para pular sem interpolar. */
  corte: number;
};

/**
 * Trocar de câmera é um CORTE, não um passeio.
 *
 * A TV interpola a câmera porque o que chega são amostras do mestre
 * arrastando a moldura, e interpolar é o que separa movimento de salto. Mas
 * pôr outra câmera no ar não é movimento: é a taverna sumir e o beco entrar.
 * Deslizar de uma à outra em 450 ms mostrava à mesa o corredor inteiro no
 * caminho, e o corredor não era o assunto.
 *
 * Aqui a troca vira fade: a cortina fecha, o recorte muda no escuro, a cortina
 * abre. O que decide se é corte ou movimento é `cameraNoArId`: mesma câmera
 * andando é movimento e continua interpolando; id diferente é corte. Por isso
 * o id viaja para a mesa -- é a única coisa das câmeras que ela recebe.
 *
 * "Cortando" é DERIVADO, não guardado: é o intervalo entre o id da cena mudar
 * e o id exibido alcançá-lo, e o timer só faz o segundo alcançar o primeiro.
 * Enquanto dura, a tela segura o recorte de antes do corte, mesmo que a câmera
 * nova já esteja andando: trocar no meio do fade mostraria o pulo. O recorte
 * que entra é o que estiver valendo quando a cortina abrir.
 */
export function useCorteDeCamera(scene: Scene | null): {
  /**
   * A cena a DESENHAR. Durante um corte que troca de cena é `null`: a cena
   * nova só monta quando a cortina já fechou. Sem isso ela aparecia por um
   * quadro no recorte antigo -- o mapa inteiro, antes da câmera entrar -- e
   * um quadro basta para a mesa ver o que não devia. Quem chama usa ISTO para
   * o palco e `scene` para o resto (aviso de espera, som).
   */
  cena: Scene | null;
  viewport: Viewport | undefined;
  corte: number;
  /**
   * A cortina fechada: no meio de um corte, ou sem câmera no ar. Sem câmera
   * a mesa fica escura -- mostrar a cena inteira revelaria o que o mestre
   * ainda não pôs em quadro. A cena continua montada por baixo, para a
   * câmera que entrar aparecer em fade e não estalar.
   */
  cortando: boolean;
} {
  const cameraId = scene?.cameraNoArId;
  const camera = scene?.camera;

  const [exibido, setExibido] = useState<Exibido>({
    cameraId,
    sceneId: scene?.id,
    corte: 0,
  });
  // Corte por câmera trocada OU por cena trocada: a mesma câmera de outra
  // cena é outro recorte sobre outro mapa, e deslizar até lá também mostraria
  // o caminho.
  const cortando =
    cameraId !== exibido.cameraId || scene?.id !== exibido.sceneId;

  // O recorte de antes do corte, congelado enquanto a cortina fecha. Estado
  // ajustado durante o render, o mesmo padrão do `SceneStage`: fora do corte
  // acompanha a câmera; dentro dele as amostras novas passam batido.
  const [congelado, setCongelado] = useState(camera);
  if (!cortando && congelado !== camera) setCongelado(camera);

  // O corte em si: espera a cortina fechar e então o exibido alcança a cena.
  // Depende só do id, de propósito: a nova câmera pode estar seguindo um token
  // e mudar dez vezes durante o fade, e nenhuma dessas mudanças pode reiniciar
  // a cortina.
  const sceneId = scene?.id;
  useEffect(() => {
    if (!cortando) return;

    const fechar = window.setTimeout(() => {
      setExibido((atual) => ({ cameraId, sceneId, corte: atual.corte + 1 }));
    }, FECHAR_MS);

    return () => window.clearTimeout(fechar);
  }, [cameraId, sceneId, cortando]);

  return {
    // Trocando de cena, nada no palco até o escuro completar. Trocando só de
    // câmera, a cena continua: é a mesma, e sumir com ela piscaria.
    cena: cortando && sceneId !== exibido.sceneId ? null : scene,
    viewport: cortando ? congelado : camera,
    corte: exibido.corte,
    cortando: cortando || (Boolean(scene) && !cameraId),
  };
}

/**
 * A cortina do corte: preto por cima do palco, que fecha e abre.
 *
 * Um `div` e uma transição de opacidade, e nada mais. Sempre montado, para a
 * transição ter de onde partir; `pointer-events-none` porque o celular tem
 * gestos embaixo e a cortina não é um deles.
 */
export function CortinaDeCorte({ fechada }: { fechada: boolean }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 bg-black"
      style={{
        opacity: fechada ? 1 : 0,
        transition: `opacity ${fechada ? FECHAR_MS : ABRIR_MS}ms ${fechada ? "ease-in" : "ease-out"}`,
      }}
    />
  );
}
