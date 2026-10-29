"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

import { t } from "@/lib/i18n/jogador";
import { useDadosStore } from "@/lib/store/use-dados-store";
import { cn } from "@/lib/utils";

/**
 * A faixa montada agora.
 *
 * No módulo, e não num store: quem pergunta é o `DadosNaTela`, no instante da
 * soltura, e o que ele precisa é a CAIXA da faixa na tela -- não um estado que
 * alguém tenha de manter em dia. Uma só por página: o jogador tem um mapa.
 */
let faixa: HTMLElement | null = null;

function dentro(elemento: HTMLElement | null, x: number, y: number): boolean {
  if (!elemento) return false;

  const caixa = elemento.getBoundingClientRect();
  return x >= caixa.left && x <= caixa.right && y >= caixa.top && y <= caixa.bottom;
}

/** Se o dado foi solto em cima da faixa. Ver `LixeiraDoDado`. */
export function soltouNaLixeira(ponto: { clientX: number; clientY: number }): boolean {
  return dentro(faixa, ponto.clientX, ponto.clientY);
}

/**
 * Onde o jogador tira um dado da mesa: uma faixa no pé da TELA, que aparece
 * enquanto ele arrasta um dado que já estava pousado.
 *
 * Sem ela, o dado que caiu só saía da tela quando o saquinho recolhia tudo, e
 * arrastá-lo era sempre rolar de novo. Agora o mesmo gesto tem dois fins:
 * soltar no mapa relança, soltar na faixa tira.
 *
 * No pé da tela, e não do mapa. No mapa ela ficava no caminho de quem só
 * queria relançar -- é para o mapa que o dedo leva o dado -- e mudava de
 * lugar com o jeito de segurar o aparelho: embaixo da cena em pé, no meio da
 * altura deitado. A beirada de baixo da tela é sempre a mesma, e "arrastar
 * para baixo" vira o gesto de tirar. Cobre a barra de ferramentas enquanto
 * aparece, o que não custa nada: no meio do arrasto ninguém a alcança.
 *
 * Só com dado DA MESA na mão. O que sai do saquinho ainda não é dado de
 * ninguém: soltá-lo é rolar, e a faixa aparecendo nesse gesto seria ruído no
 * caminho do arremesso.
 *
 * Sem `pointer-events`: durante o arrasto quem captura o ponteiro é o alvo do
 * dado, e nada aqui receberia o evento mesmo. O "em cima" é conta, feita com a
 * posição da mão que o store já guarda.
 */
export function LixeiraDoDado() {
  const mao = useDadosStore((state) => state.naMao);
  // O próprio `setElemento` como ref, e não uma função nova a cada render: a
  // nova seria chamada com `null` e com o nó em todo render, e cada chamada é
  // um `setState` -- um laço de renders.
  const [elemento, setElemento] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    faixa = elemento;
    return () => {
      if (faixa === elemento) faixa = null;
    };
  }, [elemento]);

  const comDadoDaMesa = mao?.daMesa !== undefined;
  const emCima = comDadoDaMesa && mao !== null && dentro(elemento, mao.clientX, mao.clientY);

  return (
    <div
      ref={setElemento}
      aria-hidden={!comDadoDaMesa}
      className={cn(
        // Montada sempre, só apagada: a soltura é conferida DEPOIS de a mão
        // esvaziar, e a faixa desmontada nesse instante não teria caixa.
        // `fixed` no pé da tela, acima do mapa em tela cheia (`z-50`) e abaixo
        // da camada dos dados (`z-60`): o dado na mão passa POR CIMA da faixa.
        "pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex h-12 items-center justify-center gap-2 border-t text-xs font-medium text-white transition-[opacity,background-color] duration-150",
        comDadoDaMesa ? "opacity-100" : "opacity-0",
        emCima
          ? "bg-destructive/85 border-destructive"
          : "border-dashed border-white/30 bg-black/70 backdrop-blur-sm",
      )}
    >
      <Trash2 className="size-4" aria-hidden />
      {emCima ? t.dados.lixeira.solte : t.dados.lixeira.arraste}
    </div>
  );
}
