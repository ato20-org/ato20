"use client";

import { useEffect, type RefObject } from "react";
import { toast } from "sonner";

import {
  lenteComARoda,
  olharComOMouse,
  passoDoCinegrafista,
  TECLAS_DO_CINEGRAFISTA,
} from "@/lib/geometry/cinegrafista";
import { useCameraLockStore } from "@/lib/store/use-camera-lock-store";
import { useEsguelhaStore } from "@/lib/store/use-esguelha-store";
import {
  moverTripeNoGesto,
  terminarGestoDoTripe,
  useGestoStore,
} from "@/lib/store/use-gesto-store";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import type { Tripe } from "@/types/scene";

/**
 * De quanto em quanto tempo o gesto do tripé recebe o olho, em ms: a TV, a
 * ordem do pintor e o minimapa. A vista do mestre anda a cada quadro por fora.
 */
const ENVIO_MS = 100;

/**
 * O olho do cinegrafista AGORA, e quem quer saber quando ele anda: um canal à
 * parte do gesto, como a câmera orbital. Quem desenha assina e escreve a
 * corrente direto no DOM; ninguém re-renderiza. Ver `useCinegrafistaDeEsguelha`.
 */
export class OlhoAoVivo {
  private olho: Tripe | null = null;
  private readonly ouvintes = new Set<() => void>();

  /** O olho de agora, ou `null` fora do modo. */
  atual = (): Tripe | null => this.olho;

  assinar = (aviso: () => void): (() => void) => {
    this.ouvintes.add(aviso);
    return () => {
      this.ouvintes.delete(aviso);
    };
  };

  mover = (olho: Tripe | null): void => {
    this.olho = olho;
    for (const aviso of this.ouvintes) aviso();
  };
}

/**
 * O modo cinegrafista do 2.5D: o mestre dentro do tripé selecionado, andando
 * com ele. Ver `cinegrafista` em `useEsguelhaStore` e as contas em
 * `cinegrafista.ts`.
 *
 * A vista é a do "olhar pela câmera" (`olharPor`), e o mouse fica PRESO na
 * área da mesa (Pointer Lock) -- some, e cada movimento vira giro e
 * inclinação. A roda abre e fecha a lente.
 *
 * Por quadro, o olho vai pelo canal direto (`aoMover`), que escreve a corrente
 * no DOM sem React; o mouse se acumula e entra uma vez por quadro. O gesto do
 * tripé -- a TV ao vivo, se ele estiver no ar, e o resto do 2.5D -- recebe a
 * cada `ENVIO_MS`, e o board ao sair, num passo só do desfazer. Mandar ao gesto
 * a cada evento do mouse redesenhava a mesa pelo React mais de uma vez por
 * quadro, e a vista engasgava.
 *
 * As teclas do modo são ouvidas na CAPTURA da janela e não seguem adiante:
 * o C do modo é o "trazer para aqui" fora dele, e o Espaço rolaria a página.
 * O resto (o T de transmitir, por exemplo) continua valendo.
 *
 * Sai pelo Esc -- que o navegador já usa para soltar o mouse --, pelo Shift+L
 * de novo, ou saindo do 2.5D.
 */
export function useCinegrafistaDeEsguelha(
  mesa: RefObject<HTMLDivElement | null>,
  /** O olho de agora para a vista do mestre; `null` ao sair. */
  aoMover: (olho: Tripe | null) => void,
): void {
  const ativo = useEsguelhaStore((state) => state.cinegrafista);

  useEffect(() => {
    if (!ativo) return;
    const esguelha = useEsguelhaStore.getState();
    const scene = selectEditingScene(useSceneStore.getState());
    const tripeId = useCameraLockStore.getState().selecionadaId;
    const tripe = scene?.tripes?.find((cada) => cada.id === tripeId);
    const area = mesa.current;
    if (!scene || !tripe || !area) {
      esguelha.sairDoCinegrafista();
      return;
    }

    const sceneId = scene.id;
    let olho: Tripe = {
      x: tripe.x,
      y: tripe.y,
      altura: tripe.altura,
      giro: tripe.giro,
      inclinacao: tripe.inclinacao,
      rolagem: tripe.rolagem,
      lente: tripe.lente,
    };
    let mexeu = false;
    const olhavaPor = esguelha.olhandoPor;
    esguelha.olharPor(tripe.id);

    const seguradas = new Set<string>();
    let devagar = false;

    let ultimoEnvio = 0;
    function aplicar(proximo: Tripe, agora: number) {
      olho = proximo;
      mexeu = true;
      aoMover(olho);
      if (agora - ultimoEnvio < ENVIO_MS) return;
      ultimoEnvio = agora;
      moverTripeNoGesto(sceneId, tripe!.id, olho);
    }

    function prender() {
      // Promessa em alguns motores, nada em outros: o erro chega pelo
      // `pointerlockerror` de qualquer jeito.
      void Promise.resolve(area!.requestPointerLock?.()).catch(() => {});
    }

    function apertou(evento: KeyboardEvent) {
      devagar = evento.shiftKey;
      const sair =
        evento.code === "Escape" || (evento.code === "KeyL" && evento.shiftKey);
      if (sair) {
        evento.preventDefault();
        evento.stopImmediatePropagation();
        useEsguelhaStore.getState().sairDoCinegrafista();
        return;
      }
      if (!TECLAS_DO_CINEGRAFISTA.has(evento.code)) return;
      evento.preventDefault();
      evento.stopImmediatePropagation();
      seguradas.add(evento.code);
    }
    function soltou(evento: KeyboardEvent) {
      devagar = evento.shiftKey;
      if (!TECLAS_DO_CINEGRAFISTA.has(evento.code)) return;
      evento.preventDefault();
      evento.stopImmediatePropagation();
      seguradas.delete(evento.code);
    }
    // Acumulado, e aplicado uma vez por quadro: o mouse manda centenas de
    // eventos por segundo.
    let mouse = { x: 0, y: 0, devagar: false };
    function olhou(evento: MouseEvent) {
      if (document.pointerLockElement !== area) return;
      mouse = {
        x: mouse.x + evento.movementX,
        y: mouse.y + evento.movementY,
        devagar: evento.shiftKey,
      };
    }
    // Perder a trava do mouse é sair: é o Esc do navegador, e um modo de
    // olhar sem o mouse preso só confundiria.
    let travou = false;
    function trocouATrava() {
      if (document.pointerLockElement === area) travou = true;
      else if (travou) useEsguelhaStore.getState().sairDoCinegrafista();
    }
    function naoTravou() {
      toast("Clique na mesa para prender o mouse e olhar em volta.");
    }
    // Sem a trava (recusada, ou solta e pedida de novo), um clique na mesa a
    // pede outra vez: o clique é o gesto que o navegador aceita.
    function clicou() {
      if (document.pointerLockElement !== area) prender();
    }
    // A roda na lente, acumulada como o mouse. Na CAPTURA da janela e não
    // passiva: a roda da câmera orbital mora na mesa e não pode ouvir esta.
    let roda = { y: 0, devagar: false };
    function rodou(evento: WheelEvent) {
      if (
        !area!.contains(evento.target as Node) &&
        document.pointerLockElement !== area
      )
        return;
      evento.preventDefault();
      evento.stopImmediatePropagation();
      // Com Shift o GTK manda a roda na horizontal: vale o eixo que vier.
      // Em linhas (Firefox), cada uma vale um terço de entalhe.
      const bruto = evento.deltaY || evento.deltaX;
      const delta = evento.deltaMode === 1 ? bruto * 33 : bruto;
      roda = { y: roda.y + delta, devagar: evento.shiftKey };
    }
    // Trocar de janela larga as teclas: sem isto, a que estava segurada
    // continuava andando sozinha.
    function largou() {
      seguradas.clear();
    }

    let anterior = performance.now();
    let quadro = requestAnimationFrame(function andar(agora) {
      quadro = requestAnimationFrame(andar);
      const segundos = Math.min(0.1, (agora - anterior) / 1000);
      anterior = agora;
      let proximo = olho;
      if (mouse.x !== 0 || mouse.y !== 0) {
        proximo = olharComOMouse(proximo, mouse.x, mouse.y, mouse.devagar);
        mouse = { x: 0, y: 0, devagar: mouse.devagar };
      }
      if (roda.y !== 0) {
        proximo = lenteComARoda(proximo, roda.y, roda.devagar);
        roda = { y: 0, devagar: roda.devagar };
      }
      if (seguradas.size > 0) {
        proximo = passoDoCinegrafista(proximo, seguradas, segundos, devagar);
      }
      if (proximo !== olho) aplicar(proximo, agora);
    });

    window.addEventListener("keydown", apertou, true);
    window.addEventListener("keyup", soltou, true);
    window.addEventListener("blur", largou);
    window.addEventListener("wheel", rodou, { capture: true, passive: false });
    document.addEventListener("mousemove", olhou);
    document.addEventListener("pointerlockchange", trocouATrava);
    document.addEventListener("pointerlockerror", naoTravou);
    area.addEventListener("click", clicou);
    prender();

    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener("keydown", apertou, true);
      window.removeEventListener("keyup", soltou, true);
      window.removeEventListener("blur", largou);
      window.removeEventListener("wheel", rodou, { capture: true });
      document.removeEventListener("mousemove", olhou);
      document.removeEventListener("pointerlockchange", trocouATrava);
      document.removeEventListener("pointerlockerror", naoTravou);
      area.removeEventListener("click", clicou);
      if (document.pointerLockElement === area) document.exitPointerLock();
      // O último olho entra no gesto antes de gravar: o envio é espaçado, e o
      // fim do passeio não pode ficar de fora.
      if (mexeu) {
        moverTripeNoGesto(sceneId, tripe.id, olho);
        if (useGestoStore.getState().tripe) terminarGestoDoTripe();
      }
      aoMover(null);
      useEsguelhaStore.getState().olharPor(olhavaPor);
    };
  }, [ativo, mesa, aoMover]);
}
