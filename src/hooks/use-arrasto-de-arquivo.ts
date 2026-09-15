"use client";

import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

import { isDesktop } from "@/lib/vault/bridge";

/** Um arquivo do disco pairando sobre o plano da cena. */
export type ArquivoNoAr = {
  /** Os caminhos no disco, como o sistema os entregou. */
  caminhos: string[];
  /** Onde está o ponteiro, em pixels CSS da janela. */
  x: number;
  y: number;
};

/**
 * O arquivo que vem de FORA do aplicativo — do gerenciador de arquivos, da área
 * de trabalho — a caminho da mesa.
 *
 * Este é o único dos quatro arrastos que não é gesto próprio, e não por escolha:
 * ele nasce no sistema operacional, não na webview. Quem o entrega é o Tauri,
 * por `onDragDropEvent`, e o que ele entrega é o que dá para ter:
 *
 * - os CAMINHOS chegam já na entrada, então dá para dizer quantos arquivos vêm
 *   e quais são os nomes antes de soltar;
 * - a POSIÇÃO chega a cada movimento, então dá para desenhar onde vai cair;
 * - a RODA não chega. O laço de arrasto é do sistema, e a webview não recebe
 *   evento de roda enquanto ele dura. Então aqui não há escolha de tamanho no
 *   ar: o arquivo entra no tamanho natural e já selecionado, e o gizmo ajusta.
 *
 * A prévia também não mostra a imagem: desenhá-la exigiria abrir um arquivo
 * qualquer do disco para a webview, e o aplicativo não concede esse alcance --
 * ver `capabilities/default.json`. O que a caixa promete é onde e quantos.
 *
 * A posição vem em pixels FÍSICOS e é dividida pela densidade da tela: num
 * monitor a 150% o ponto do sistema é uma vez e meia o ponto do CSS, e sem a
 * divisão a caixa apareceria à direita e abaixo de onde a mão está.
 */
export function useArrastoDeArquivo(
  aoSoltar: (caminhos: string[], x: number, y: number) => void,
): ArquivoNoAr | null {
  const [noAr, setNoAr] = useState<ArquivoNoAr | null>(null);

  /**
   * O que fazer com o que cair, sempre atual.
   *
   * Por ref e não por dependência do efeito: religar o ouvinte do Tauri a cada
   * render é ida ao processo nativo, e um arrasto em curso ficaria sem quem o
   * escute justamente no meio dele.
   */
  const soltar = useRef(aoSoltar);
  useEffect(() => {
    soltar.current = aoSoltar;
  });

  /** O último arrasto visto, mesmo com o ponteiro fora do mapa. */
  const anterior = useRef<ArquivoNoAr | null>(null);

  useEffect(() => {
    // Numa aba de navegador não há evento nenhum a escutar: o Espectador e o
    // Jogador compartilham componentes com o Mestre, e só ele roda no
    // aplicativo.
    if (!isDesktop()) return;

    let vivo = true;
    let desligar: (() => void) | undefined;

    const ponto = (posicao: { x: number; y: number }) => ({
      x: posicao.x / window.devicePixelRatio,
      y: posicao.y / window.devicePixelRatio,
    });

    void getCurrentWebview()
      .onDragDropEvent((evento) => {
        const dados = evento.payload;

        if (dados.type === "enter" || dados.type === "over") {
          const caminhos = dados.type === "enter" ? dados.paths : null;
          const onde = ponto(dados.position);

          // Fora do mapa não há prévia: sobre uma janela da bancada a caixa
          // ficaria escondida atrás dela, e soltar cravaria a imagem num lugar
          // que o mestre não viu. Mesma pergunta que o gesto de token faz, e
          // pelo mesmo `elementFromPoint`.
          setNoAr(
            sobreOPalco(onde)
              ? {
                  // No `over` os caminhos não vêm de novo: o que muda é a
                  // posição.
                  caminhos: caminhos ?? anterior.current?.caminhos ?? [],
                  ...onde,
                }
              : null,
          );

          // Guardado à parte do estado porque ele é zerado fora do mapa, e ao
          // voltar para dentro o sistema não repete os caminhos: sem esta
          // memória, atravessar uma janela da bancada no meio do caminho
          // apagaria o nome do arquivo até soltar.
          if (caminhos) anterior.current = { caminhos, ...onde };

          return;
        }

        setNoAr(null);
        anterior.current = null;

        if (dados.type === "drop" && dados.paths.length > 0) {
          const onde = ponto(dados.position);
          if (!sobreOPalco(onde)) return;

          soltar.current(dados.paths, onde.x, onde.y);
        }
      })
      .then((parar) => {
        // Desmontou enquanto o Tauri respondia: desligar na hora, senão o
        // ouvinte fica vivo apontando para uma tela que já não existe.
        if (vivo) desligar = parar;
        else parar();
      });

    return () => {
      vivo = false;
      desligar?.();
    };
  }, []);

  return noAr;
}

/**
 * O ponto está sobre o plano da cena.
 *
 * Pela mesma marca que o arrasto de token procura, e pela mesma razão: o que
 * vale é o que está DESENHADO ali, e as janelas da bancada ficam sobre o mapa.
 */
function sobreOPalco({ x, y }: { x: number; y: number }): boolean {
  return Boolean(document.elementFromPoint(x, y)?.closest("[data-palco]"));
}
